#!/usr/bin/env python3
"""As-built architecture analyzer.

Walks the in-scope Python sources, parses every file with `ast` (never importing
or executing them), and emits:

    docs/architecture/graph.json          machine-readable module graph
    docs/architecture/README.md           master overview
    docs/architecture/packages/<pkg>.md   one page per package

Run from the repository root:

    python docs/architecture/analyze.py

Scope and package naming are driven by SCOPE / SOURCE_ROOTS below. Stdlib only.
"""

from __future__ import annotations

import ast
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "architecture"

# Directories walked for source. Everything else in the repo is out of scope:
# alembic/ and migrations/ (mechanical migration scripts), backend_taste/
# (separate deployable), backend/venv/ (vendored virtualenv).
SCOPE = ["backend", "ingestion", "run.py"]
PRUNE = {"venv", "__pycache__", ".venv", "node_modules", ".git", "site-packages"}

# Import roots, i.e. the directories that land on sys.path at runtime. Every root
# is used to RESOLVE imports, because a module is a legitimate target under any
# name it can be imported by. `backend/` is a root rather than a package: its
# subdirectories have no __init__.py and the code imports `db.models.block`, not
# `backend.db.models.block`. `ingestion/` is imported both ways — `ingestion.sources.ecan`
# from the repo root, and bare `sources.ecan` from inside ingestion — so it is a root too.
SOURCE_ROOTS = ["backend", ".", "ingestion"]

# Which root NAMES a module, when several could. Order matters: first match wins.
# This is deliberately not SOURCE_ROOTS. Naming by the shortest available name
# would file `ingestion/db_connection.py` as `db_connection` — package `app` —
# throwing ingestion's root modules in with backend's `main.py`, as though two
# separate deployables were one package. Naming everything from the repo root
# would instead produce `backend.db.models.task`, contradicting how the code
# actually imports itself. So: `backend/` names its own subtree, and everything
# else is named from the repo root, which makes `ingestion` a real package.
CANONICAL_ROOTS = ["backend", "."]

# Third-party / stdlib module roots mapped to an integration category.
CATEGORIES = {
    "db": ["sqlalchemy", "psycopg2", "psycopg", "asyncpg", "sqlite3", "pymongo",
           "redis", "geoalchemy2", "alembic"],
    "http": ["requests", "httpx", "aiohttp", "urllib", "urllib3", "http"],
    "cloud": ["boto3", "botocore", "google", "azure", "s3transfer"],
    "queue": ["celery", "kafka", "confluent_kafka", "pika", "rq"],
    "fs": ["pathlib", "csv", "shutil", "tempfile", "openpyxl", "zipfile", "io"],
    "config": ["dotenv", "pydantic_settings", "configparser"],
}
ROOT_CATEGORY = {root: cat for cat, roots in CATEGORIES.items() for root in roots}

# Call-site patterns that evidence a dataflow, mapped to (category, label,
# outbound?). Matched against the dotted call name's trailing attribute.
DATAFLOW_CALLS = {
    "query": ("db", "reads rows", False),
    "scalar": ("db", "reads rows", False),
    "scalars": ("db", "reads rows", False),
    "add": ("db", "writes rows", True),
    "add_all": ("db", "writes rows", True),
    "commit": ("db", "writes rows", True),
    "bulk_save_objects": ("db", "writes rows", True),
    "execute": ("db", "executes SQL", True),
    "get": ("http", "fetches", False),
    "post": ("http", "sends", True),
    "put": ("http", "sends", True),
    "patch": ("http", "sends", True),
    "delete": ("http", "sends", True),
    "put_object": ("cloud", "uploads objects", True),
    "upload_fileobj": ("cloud", "uploads objects", True),
    "upload_file": ("cloud", "uploads objects", True),
    "get_object": ("cloud", "downloads objects", False),
    "download_fileobj": ("cloud", "downloads objects", False),
    "generate_presigned_url": ("cloud", "signs URLs", True),
}


# How an import reaches the module, which decides whether it is a real runtime
# edge. `type` imports sit under `if TYPE_CHECKING:` and never execute — the
# standard SQLAlchemy pattern for relationship hints. `deferred` imports sit
# inside a function body and execute only when called, which is the usual way a
# genuine cycle gets broken. Only `runtime` edges exist at import time.
RUNTIME, TYPE_ONLY, DEFERRED = "runtime", "type-only", "deferred"


@dataclass
class Module:
    name: str
    package: str
    path: str
    loc: int = 0
    docstring: str = ""
    public: list[str] = field(default_factory=list)
    imports: dict[str, str] = field(default_factory=dict)   # raw dotted name -> kind
    internal: dict[str, str] = field(default_factory=dict)  # resolved name -> kind
    integrations: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    flows: set[tuple[str, str, bool]] = field(default_factory=set)  # cat,label,outbound
    hosts: set[str] = field(default_factory=set)
    has_http_client: bool = False


def in_scope_files() -> list[Path]:
    files: list[Path] = []
    for entry in SCOPE:
        target = REPO / entry
        if target.is_file():
            files.append(target)
            continue
        for path in target.rglob("*.py"):
            if PRUNE & set(path.relative_to(REPO).parts):
                continue
            files.append(path)
    return sorted(files)


def name_under(path: Path, root: str) -> str | None:
    base = (REPO / root).resolve()
    try:
        rel = path.resolve().relative_to(base)
    except ValueError:
        return None
    parts = list(rel.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts.pop()
    if not parts or any(p in PRUNE for p in parts):
        return None
    return ".".join(parts)


def module_names(path: Path) -> list[str]:
    """Every dotted name this file is importable as, one per source root."""
    return [n for n in (name_under(path, r) for r in SOURCE_ROOTS) if n]


def canonical_name(path: Path) -> str:
    """The one name we key the graph on — see CANONICAL_ROOTS."""
    for root in CANONICAL_ROOTS:
        name = name_under(path, root)
        if name:
            return name
    return path.stem


def package_of(name: str, path: Path) -> str:
    """Which package a module belongs to.

    An `__init__.py` IS its package, so it files under itself rather than under
    its parent — otherwise `core/__init__.py`, named `core`, would land in `app`
    and take the package's own docstring with it. Everything else files under its
    parent dotted path; a module with no parent is a top-level entrypoint.
    """
    if path.name == "__init__.py":
        return name
    return name.rsplit(".", 1)[0] if "." in name else "app"


def dotted(node: ast.AST) -> str:
    """Flatten an attribute chain (a.b.c) back to its dotted string."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def is_type_checking_guard(test: ast.expr) -> bool:
    return dotted(test).endswith("TYPE_CHECKING")


class Visitor(ast.NodeVisitor):
    def __init__(self, mod: Module, tree: ast.Module):
        self.mod = mod
        self.toplevel = set(map(id, tree.body))
        self.type_depth = 0
        self.func_depth = 0

    @property
    def kind(self) -> str:
        if self.type_depth:
            return TYPE_ONLY
        return DEFERRED if self.func_depth else RUNTIME

    def _note(self, name: str):
        # A name can be reached more than one way; the weakest guard wins, since
        # a runtime import anywhere makes the dependency real at import time.
        rank = {RUNTIME: 0, DEFERRED: 1, TYPE_ONLY: 2}
        prev = self.mod.imports.get(name)
        if prev is None or rank[self.kind] < rank[prev]:
            self.mod.imports[name] = self.kind

    def _record_import(self, root: str, full: str):
        self._note(full)
        cat = ROOT_CATEGORY.get(root)
        if cat and self.type_depth == 0:
            self.mod.integrations[cat].add(root)

    def visit_If(self, node: ast.If):
        if is_type_checking_guard(node.test):
            self.type_depth += 1
            for stmt in node.body:
                self.visit(stmt)
            self.type_depth -= 1
            for stmt in node.orelse:
                self.visit(stmt)
            return
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self._record_import(alias.name.split(".")[0], alias.name)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.level:  # relative import — resolve against this module's package
            base = self.mod.name.rsplit(".", node.level)[0] if node.level <= self.mod.name.count(".") else ""
            full = f"{base}.{node.module}" if node.module and base else (node.module or base)
        else:
            full = node.module or ""
        if not full:
            return
        self._record_import(full.split(".")[0], full)
        # `from db import models` — the target may itself be a module.
        for alias in node.names:
            self._note(f"{full}.{alias.name}")

    def visit_ClassDef(self, node: ast.ClassDef):
        if id(node) in self.toplevel and not node.name.startswith("_"):
            self.mod.public.append(node.name)
        self.generic_visit(node)

    def _function(self, node):
        if id(node) in self.toplevel and not node.name.startswith("_"):
            self.mod.public.append(node.name)
        self.func_depth += 1  # imports below here run on call, not on import
        self.generic_visit(node)
        self.func_depth -= 1

    visit_FunctionDef = _function
    visit_AsyncFunctionDef = _function

    def visit_Call(self, node: ast.Call):
        name = dotted(node.func)
        tail = name.rsplit(".", 1)[-1] if name else ""
        root = name.split(".")[0] if name else ""

        if name == "open":
            self.mod.integrations["fs"].add("open()")
        elif tail in ("load", "dump") and root == "json":
            self.mod.integrations["fs"].add("json file i/o")
        elif name in ("os.getenv", "os.environ.get"):
            self.mod.integrations["config"].add("os.environ")

        # Dataflow verbs only count when the receiver looks like the right kind
        # of client — `db.query(...)`, `requests.get(...)`, `s3.put_object(...)`.
        flow = DATAFLOW_CALLS.get(tail)
        if flow and "." in name:
            cat, label, outbound = flow
            recv = name.rsplit(".", 1)[0].split(".")[-1].lower()
            if cat == "db" and any(k in recv for k in ("db", "session", "conn", "engine")):
                self.mod.flows.add(flow)
            elif cat == "http" and any(k in recv for k in ("requests", "httpx", "client", "session")):
                self.mod.flows.add(flow)
            elif cat == "cloud" and any(k in recv for k in ("s3", "client", "bucket")):
                self.mod.flows.add(flow)

        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript):
        if dotted(node.value) == "os.environ":
            self.mod.integrations["config"].add("os.environ")
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant):
        if isinstance(node.value, str) and node.value.startswith(("http://", "https://")):
            host = urlparse(node.value).hostname
            if host:
                self.mod.hosts.add(host)
        self.generic_visit(node)


def parse(path: Path) -> Module | None:
    src = path.read_text(encoding="utf-8", errors="replace")
    try:
        tree = ast.parse(src)
    except SyntaxError as exc:
        print(f"  ! skipped (syntax error): {path.relative_to(REPO)} — {exc}", file=sys.stderr)
        return None

    name = canonical_name(path)
    mod = Module(
        name=name,
        package=package_of(name, path),
        path=path.relative_to(REPO).as_posix(),
        loc=sum(1 for line in src.splitlines() if line.strip()),
        docstring=(ast.get_docstring(tree) or "").strip(),
    )
    Visitor(mod, tree).visit(tree)
    mod.public.sort()
    mod.has_http_client = bool(mod.integrations.get("http", set()) & set(CATEGORIES["http"]))
    return mod


def resolve_internal(mods: dict[str, Module]):
    """Map each raw import onto an internal module, using every alias it has."""
    alias_to_canon: dict[str, str] = {}
    for mod in mods.values():
        for alias in module_names(REPO / mod.path):
            alias_to_canon[alias] = mod.name

    rank = {RUNTIME: 0, DEFERRED: 1, TYPE_ONLY: 2}
    for mod in mods.values():
        for imp, kind in mod.imports.items():
            target = alias_to_canon.get(imp)
            if target is None:
                # `from db.models.block import Block` — trim the symbol and retry.
                parent = imp.rsplit(".", 1)[0]
                target = alias_to_canon.get(parent)
            if target and target != mod.name:
                prev = mod.internal.get(target)
                if prev is None or rank[kind] < rank[prev]:
                    mod.internal[target] = kind


def find_cycles(mods: dict[str, Module]) -> list[tuple[list[str], bool]]:
    """Elementary cycles over real dependency edges, each flagged `hard`.

    Type-only edges are excluded outright: they never execute, so they cannot
    form a cycle. Deferred edges are included — the dependency is real — but a
    chain containing one is not hard, because it does not deadlock at import
    time. Only an all-runtime chain is a hard cycle.
    """
    cycles: list[tuple[list[str], bool]] = []
    seen: set[tuple[str, ...]] = set()
    colour: dict[str, int] = defaultdict(int)  # 0 white, 1 grey, 2 black
    stack: list[str] = []

    def real_edges(name: str) -> list[str]:
        return sorted(t for t, k in mods[name].internal.items()
                      if k != TYPE_ONLY and t in mods)

    def walk(name: str):
        colour[name] = 1
        stack.append(name)
        for nxt in real_edges(name):
            if colour[nxt] == 1:
                cyc = stack[stack.index(nxt):]
                key = tuple(sorted(cyc))
                if key not in seen:
                    seen.add(key)
                    chain = cyc + [nxt]
                    hard = all(mods[a].internal.get(b) == RUNTIME
                               for a, b in zip(chain, chain[1:]))
                    cycles.append((chain, hard))
            elif colour[nxt] == 0:
                walk(nxt)
        stack.pop()
        colour[name] = 2

    sys.setrecursionlimit(10000)
    for name in sorted(mods):
        if colour[name] == 0:
            walk(name)
    return cycles


def build_graph(mods: dict[str, Module]) -> dict:
    nodes, edges = [], []

    for mod in sorted(mods.values(), key=lambda m: m.name):
        cats = [c for c in ("db", "http", "cloud", "queue", "fs", "config") if mod.integrations.get(c)]
        nodes.append({
            "id": mod.name,
            "label": mod.name.rsplit(".", 1)[-1],
            "package": mod.package,
            "type": "module",
            "category": cats[0] if cats else None,
            "loc": mod.loc,
            "docstring": mod.docstring,
            "public": mod.public,
            "path": mod.path,
        })
        for target, kind in sorted(mod.internal.items()):
            edges.append({"source": mod.name, "target": target, "type": "import",
                          "label": "" if kind == RUNTIME else kind, "direction": "a_to_b"})

    # One external node per (category, library), shared by every module using it.
    ext_owners: dict[tuple[str, str], list[str]] = defaultdict(list)
    for mod in mods.values():
        for cat, libs in mod.integrations.items():
            for lib in libs:
                ext_owners[(cat, lib)].append(mod.name)

    for (cat, lib), owners in sorted(ext_owners.items()):
        ext_id = f"ext:{cat}:{lib}"
        nodes.append({
            "id": ext_id, "label": lib, "package": f"external.{cat}", "type": "external",
            "category": cat, "loc": 0,
            "docstring": f"External {cat} integration: {lib}. Used by {len(owners)} module(s).",
            "public": [], "path": "",
        })
        for owner in sorted(owners):
            edges.append({"source": owner, "target": ext_id, "type": "import",
                          "label": "", "direction": "a_to_b"})

    # Endpoints are kept apart from client libraries: `requests` is how you call
    # out, `data.ecan.govt.nz` is who you call. Same category, different package,
    # so the map can group and style them separately.
    #
    # The edge says how the module relates to the host, because a URL literal and
    # the client that calls it often live in different modules — every weather
    # source here keeps its base URL in `config/*_sites.py` and does the GET from
    # `sources/*.py`. `calls` means the owning module imports an HTTP client, so
    # this is a real call site. `declares` means it is a URL literal in a data or
    # config module, handed to someone else to call — or, sometimes, just a link
    # in an email template. Both are recorded; the label is what separates them.
    host_owners: dict[str, list[tuple[str, bool]]] = defaultdict(list)
    for mod in mods.values():
        for host in mod.hosts:
            host_owners[host].append((mod.name, mod.has_http_client))

    for host, owners in sorted(host_owners.items()):
        ext_id = f"ext:endpoint:{host}"
        called = any(is_client for _, is_client in owners)
        nodes.append({
            "id": ext_id, "label": host, "package": "external.http.endpoints",
            "type": "external", "category": "http", "loc": 0,
            "docstring": f"HTTP endpoint. Referenced by {len(owners)} module(s); "
                         + ("at least one imports an HTTP client, so this is called."
                            if called else
                            "no referencing module imports an HTTP client, so this is "
                            "declared as a literal and either called elsewhere or never "
                            "requested at all."),
            "public": [], "path": "",
        })
        for owner, is_client in sorted(owners):
            edges.append({"source": owner, "target": ext_id, "type": "dataflow",
                          "label": "calls" if is_client else "declares",
                          "direction": "a_to_b"})

    # Dataflow edges: a verb observed at a call site, aimed at that category's
    # libraries actually imported by the same module.
    for mod in sorted(mods.values(), key=lambda m: m.name):
        for cat, label, outbound in sorted(mod.flows):
            for lib in sorted(mod.integrations.get(cat, ())):
                ext_id = f"ext:{cat}:{lib}"
                if not any(n["id"] == ext_id for n in nodes):
                    continue
                src, dst = (mod.name, ext_id) if outbound else (ext_id, mod.name)
                edges.append({"source": src, "target": dst, "type": "dataflow",
                              "label": label, "direction": "a_to_b"})

    return {"nodes": nodes, "edges": edges}


def slug(package: str) -> str:
    return package.replace(".", "-")


def package_view(mods: dict[str, Module]):
    """Per-package inbound/outbound package-level coupling."""
    pkgs: dict[str, list[Module]] = defaultdict(list)
    for mod in mods.values():
        pkgs[mod.package].append(mod)
    for members in pkgs.values():
        members.sort(key=lambda m: m.name)

    out: dict[str, set[str]] = defaultdict(set)
    inn: dict[str, set[str]] = defaultdict(set)
    for mod in mods.values():
        for target, kind in mod.internal.items():
            if kind == TYPE_ONLY:
                continue  # never executes; not real coupling
            tp = mods[target].package
            if tp != mod.package:
                out[mod.package].add(tp)
                inn[tp].add(mod.package)
    return pkgs, inn, out


def summarise(text: str, limit: int = 100) -> str:
    line = " ".join(text.split())
    return (line[: limit - 1] + "…") if len(line) > limit else line


def write_packages(mods, pkgs, inn, out):
    (OUT / "packages").mkdir(parents=True, exist_ok=True)
    # Drop pages for packages that no longer exist, so a rename cannot leave a
    # stale page behind that still reads as current.
    live = {f"{slug(p)}.md" for p in pkgs}
    for old in (OUT / "packages").glob("*.md"):
        if old.name not in live:
            old.unlink()
            print(f"  - removed stale page: packages/{old.name}")

    for pkg, members in sorted(pkgs.items()):
        L = [f"# `{pkg}`", ""]
        loc = sum(m.loc for m in members)
        L += [f"{len(members)} modules, {loc:,} lines. "
              f"[← architecture overview](../README.md)", ""]

        # Only the package's own __init__ can speak for the package. Promoting an
        # arbitrary member's docstring here would read as a declared purpose while
        # actually describing one module.
        own = mods.get(pkg)
        documented = sum(1 for m in members if m.docstring)
        dirs = sorted({m.path.rsplit("/", 1)[0] for m in members})
        L += ["## Purpose", ""]
        if own and own.docstring:
            L += [summarise(own.docstring, 600), ""]
        else:
            L += [f"_Not declared — this package has no `__init__.py` docstring. It is the code "
                  f"under `{'`, `'.join(dirs)}`; {documented} of its {len(members)} modules "
                  f"carry a docstring of their own, listed below._", ""]

        L += ["## Modules", "", "| Module | LOC | Public interface | Summary |",
              "| --- | --- | --- | --- |"]
        for m in members:
            pub = ", ".join(f"`{p}`" for p in m.public[:6]) or "—"
            if len(m.public) > 6:
                pub += f" _+{len(m.public) - 6} more_"
            L.append(f"| `{m.name}`<br/><sub>{m.path}</sub> | {m.loc} | {pub} | "
                     f"{summarise(m.docstring) or '—'} |")
        L.append("")

        for title, rel, verb in (("Inbound dependencies", inn[pkg], "imports this package"),
                                 ("Outbound dependencies", out[pkg], "is imported by this package")):
            L += [f"## {title}", ""]
            if not rel:
                L += ["_None._", ""]
                continue
            for other in sorted(rel):
                link = f"[`{other}`]({slug(other)}.md)" if other in pkgs else f"`{other}`"
                L.append(f"- {link} — {verb}")
            L.append("")

        ints: dict[str, set[str]] = defaultdict(set)
        for m in members:
            for cat, libs in m.integrations.items():
                ints[cat].update(libs)
        L += ["## Integration points owned", ""]
        if not ints:
            L += ["_None — this package is pure internal logic._", ""]
        else:
            L += ["| Category | Libraries / targets | Modules |", "| --- | --- | --- |"]
            for cat in sorted(ints):
                owners = sorted(m.name for m in members if m.integrations.get(cat))
                shown = ", ".join(f"`{o}`" for o in owners[:4])
                if len(owners) > 4:
                    shown += f" _+{len(owners) - 4} more_"
                L.append(f"| **{cat}** | {', '.join(f'`{x}`' for x in sorted(ints[cat]))} | {shown} |")
            L.append("")

        flows = sorted({f for m in members for f in m.flows})
        if flows:
            L += ["## Dataflows", ""]
            for cat, label, outbound in flows:
                arrow = f"`{pkg}` → **{cat}**" if outbound else f"**{cat}** → `{pkg}`"
                L.append(f"- {arrow} — {label}")
            L.append("")

        (OUT / "packages" / f"{slug(pkg)}.md").write_text("\n".join(L), encoding="utf-8")


def write_readme(mods, pkgs, inn, out, graph, cycles):
    ext = [n for n in graph["nodes"] if n["type"] == "external"]
    # Group by package, not category, so client libraries and the hosts they call
    # stay in separate rows rather than one undifferentiated `http` blob.
    by_cat: dict[str, list[str]] = defaultdict(list)
    for n in ext:
        by_cat[n["package"].split(".", 1)[1]].append(n["label"])

    endpoint_kind: dict[str, str] = {}
    for e in graph["edges"]:
        if e["label"] in ("calls", "declares"):
            host = e["target"].split(":", 2)[2]
            if e["label"] == "calls" or host not in endpoint_kind:
                endpoint_kind[host] = e["label"]

    L = ["# Architecture — as built", "",
         "Generated by [`analyze.py`](analyze.py) from a pure `ast` parse of the source; "
         "no target code is imported or executed. Refresh with "
         "`python docs/architecture/analyze.py` from the repository root — it needs no "
         "dependencies beyond the standard library, and rewrites every file in this "
         "directory. Do not hand-edit these pages; edit the analyzer.", "",
         "**Interactive map.** Open [`index.html`](index.html) in a browser — double-clicking "
         "the file is enough, no server needed. Modules are grouped into collapsible package "
         "boxes; click any node for its docstring, public interface and connections. It loads "
         "Cytoscape.js from a CDN, so the first open needs an internet connection. Full "
         "instructions: [`regenerate.md`](regenerate.md).", "",
         "**Scope.** `backend/` and `ingestion/`, plus the root `run.py` entrypoint. "
         "Excluded: `alembic/` and `migrations/` (mechanical migration scripts), "
         "`backend_taste/` (a separate deployable), and `backend/venv/` (a vendored virtualenv).", "",
         "**Package naming.** `backend/` is an import root, not a package — its subdirectories "
         "carry no `__init__.py` and the code imports `db.models.block`, not "
         "`backend.db.models.block`. Packages below are therefore named as the code imports them.", "",
         "## At a glance", "",
         f"- **{len(pkgs)} packages**, **{len(mods)} modules**, "
         f"**{sum(m.loc for m in mods.values()):,} lines**",
         f"- **{sum(1 for e in graph['edges'] if e['type'] == 'import')} import edges**, "
         f"**{sum(1 for e in graph['edges'] if e['type'] == 'dataflow')} dataflow edges**",
         f"- **{len(ext)} external integration points** across {len(by_cat)} categories",
         f"- **{sum(1 for _, h in cycles if h)} hard circular dependencies**, "
         f"{sum(1 for _, h in cycles if not h)} broken by deferred imports", "",
         "## Packages", "", "| Package | Modules | LOC | Imports | Imported by | Integrations |",
         "| --- | --- | --- | --- | --- | --- |"]

    for pkg, members in sorted(pkgs.items(), key=lambda kv: -sum(m.loc for m in kv[1])):
        cats = sorted({c for m in members for c in m.integrations})
        L.append(f"| [`{pkg}`](packages/{slug(pkg)}.md) | {len(members)} | "
                 f"{sum(m.loc for m in members):,} | {len(out[pkg])} | {len(inn[pkg])} | "
                 f"{', '.join(cats) or '—'} |")
    L.append("")

    L += ["## Integration surface", "", "| Category | Targets |", "| --- | --- |"]
    for cat in sorted(by_cat):
        if cat == "http.endpoints":
            continue
        L.append(f"| **{cat}** ({len(by_cat[cat])}) | "
                 f"{', '.join(f'`{x}`' for x in sorted(by_cat[cat]))} |")
    L.append("")

    if endpoint_kind:
        called = sorted(h for h, k in endpoint_kind.items() if k == "calls")
        declared = sorted(h for h, k in endpoint_kind.items() if k == "declares")
        L += ["### HTTP endpoints", "",
              "Hosts appearing as URL literals. **Called** means the module holding the "
              "literal also imports an HTTP client, so it is a real call site. **Declared** "
              "means the literal sits in a data or config module and is handed elsewhere to "
              "be called — every weather source works this way, keeping its base URL in "
              "`config/*_sites.py` and issuing the request from `sources/*.py`. A declared "
              "host may also be an ordinary link (an app-store badge, a JSON-LD vocabulary) "
              "that is never requested at all; static analysis cannot tell those apart, so "
              "both are listed.", ""]
        L += [f"- **Called** ({len(called)}): {', '.join(f'`{h}`' for h in called)}"] if called else []
        L += [f"- **Declared** ({len(declared)}): {', '.join(f'`{h}`' for h in declared)}"] if declared else []
        L.append("")

    hard = [c for c, h in cycles if h]
    soft = [c for c, h in cycles if not h]

    L += ["## Warnings", "", "### Circular dependencies", "",
          "Counted over real edges only. Imports under `if TYPE_CHECKING:` are excluded — "
          "they never execute, so they cannot form a cycle. This matters here: the "
          "`db.models` package is full of them, and counting them would report a dozen "
          "cycles that do not exist at runtime.", ""]
    if hard:
        L += [f"**{len(hard)} hard cycle(s)** — every edge runs at import time. These are real:", ""]
        L += [f"- `{'` → `'.join(c)}`" for c in hard[:40]]
        L.append("")
    else:
        L += ["**No hard cycles.** No chain of module-level imports returns to its own start.", ""]
    if soft:
        L += [f"**{len(soft)} deferred {'cycle' if len(soft) == 1 else 'cycles'}** — "
              "the dependency is mutual, but at least one "
              "edge is an import inside a function body, so nothing breaks at import time. "
              "This is usually a deliberate workaround, and marks coupling worth revisiting "
              "rather than a live bug:", ""]
        L += [f"- `{'` → `'.join(c)}`" for c in soft[:40]]
        L.append("")

    fan = sorted(((len(out[p]), p) for p in pkgs), reverse=True)[:5]
    hubs = sorted(((sum(1 for m in mods.values() if n.name in m.internal), n.name)
                   for n in mods.values()), reverse=True)[:10]
    L += ["### Coupling", "",
          "Packages importing the most other packages (fan-out):", ""]
    L += [f"- `{p}` → {c} packages" for c, p in fan if c]
    L += ["", "Most-imported modules (fan-in) — the load-bearing ones, where a breaking change "
          "travels furthest:", ""]
    L += [f"- `{n}` — imported by {c} modules" for c, n in hubs if c]
    L.append("")

    (OUT / "README.md").write_text("\n".join(L), encoding="utf-8")


def write_map(graph: dict) -> bool:
    """Inject the graph into map_template.html and write index.html.

    The map fetches graph.json when it can, but fetch is blocked by CORS over
    file://, which is how this page is normally opened. So the graph is also
    inlined here at generate time, giving the page a copy it can always read.
    """
    template = OUT / "map_template.html"
    if not template.exists():
        print(f"  ! {template.name} missing — skipped index.html", file=sys.stderr)
        return False

    # `</script>` inside the JSON would close the host <script> tag early. The
    # escaped form is still valid JSON to the parser.
    payload = json.dumps(graph, separators=(",", ":")).replace("</", "<\\/")
    html = template.read_text(encoding="utf-8")
    if "__GRAPH_JSON__" not in html:
        print("  ! template has no __GRAPH_JSON__ marker — skipped index.html", file=sys.stderr)
        return False
    (OUT / "index.html").write_text(html.replace("__GRAPH_JSON__", payload), encoding="utf-8")
    return True


def write_regenerate(graph: dict, mods: dict) -> None:
    (OUT / "regenerate.md").write_text("""# Regenerating the architecture map

Everything in this directory is generated. **Do not hand-edit `README.md`,
`packages/*.md`, `graph.json`, or `index.html`** — the next run overwrites them.

## Refresh after a code change

From the repository root:

```bash
python docs/architecture/analyze.py
```

Standard library only — no virtualenv, no install, no network. It parses every
in-scope file with `ast` and never imports or executes the code it reads, so it
is safe to run against a branch that does not start.

It rewrites, in one pass:

| File | What it is |
| --- | --- |
| `graph.json` | The machine-readable graph. The source of truth for the map. |
| `README.md` | Overview: packages, integration surface, cycles, coupling. |
| `packages/*.md` | One page per package. Stale pages are deleted automatically. |
| `index.html` | The interactive map, with `graph.json` inlined into it. |

## Opening the map

Open `docs/architecture/index.html` in a browser — double-clicking the file is
enough, no server needed. It pulls Cytoscape.js from a CDN, so the first open
needs an internet connection.

## Editing the map itself

`index.html` is generated: it is `map_template.html` with the graph substituted
into the `__GRAPH_JSON__` marker. To change the map's appearance or behaviour,
edit **`map_template.html`** and re-run the analyzer. Edits made directly to
`index.html` are lost on the next run.

## Changing what gets analyzed

The knobs are the constants at the top of `analyze.py`:

- `SCOPE` — directories walked. Currently `backend/`, `ingestion/`, and `run.py`.
  Excluded: `alembic/` and `migrations/` (mechanical migration scripts),
  `backend_taste/` (a separate deployable), `backend/venv/` (a vendored virtualenv).
- `PRUNE` — directory names never descended into, at any depth.
- `SOURCE_ROOTS` — the directories that are on `sys.path` at runtime. Used to
  **resolve** imports: a module is a valid target under any name it can be
  imported by. Add a root here when a new deployable gets its own import base.
- `CANONICAL_ROOTS` — which root **names** a module when several could, first
  match winning. Deliberately not the same list; see the comment above it.
- `CATEGORIES` — library roots mapped to an integration category. Add a library
  here when a new dependency starts talking to the outside world.
- `DATAFLOW_CALLS` — call names that evidence a dataflow, and its direction.

## What the analysis will and will not tell you

It is static, so it sees imports and call sites, not runtime behaviour. Three
consequences worth knowing before trusting a number:

- **Import kinds are distinguished, and this matters.** An import under
  `if TYPE_CHECKING:` never executes; one inside a function body executes only
  when called. Only module-level imports run at import time. Cycle counts ignore
  type-only edges entirely — counting them would report a dozen cycles in
  `db.models` that do not exist.
- **A URL literal is not proof of a call.** Hosts are labelled `calls` when the
  module holding the literal also imports an HTTP client, and `declares` when it
  does not. Declared hosts are usually real APIs called from elsewhere — every
  weather source keeps its base URL in `ingestion/config/*_sites.py` and issues
  the request from `ingestion/sources/*.py` — but some are ordinary links in an
  email template. Static analysis cannot separate those; both are listed.
- **Dynamic imports are invisible.** `importlib.import_module(name)` on a
  computed name, or a plugin registry, produces no edge.
""", encoding="utf-8")


def main():
    files = in_scope_files()
    print(f"Parsing {len(files)} files…")

    mods: dict[str, Module] = {}
    for path in files:
        mod = parse(path)
        if mod is None:
            continue
        if mod.name in mods:
            print(f"  ! name collision: {mod.name} ({mod.path} vs {mods[mod.name].path})",
                  file=sys.stderr)
            continue
        mods[mod.name] = mod

    resolve_internal(mods)
    cycles = find_cycles(mods)
    graph = build_graph(mods)
    pkgs, inn, out = package_view(mods)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "graph.json").write_text(json.dumps(graph, indent=2), encoding="utf-8")
    write_packages(mods, pkgs, inn, out)
    write_readme(mods, pkgs, inn, out, graph, cycles)
    mapped = write_map(graph)
    write_regenerate(graph, mods)

    ext = [n for n in graph["nodes"] if n["type"] == "external"]
    by_cat: dict[str, int] = defaultdict(int)
    for n in ext:
        by_cat[n["category"]] += 1

    print(f"\n  packages          {len(pkgs)}")
    print(f"  modules           {len(mods)}")
    print(f"  LOC               {sum(m.loc for m in mods.values()):,}")
    print(f"  import edges      {sum(1 for e in graph['edges'] if e['type'] == 'import')}")
    print(f"  dataflow edges    {sum(1 for e in graph['edges'] if e['type'] == 'dataflow')}")
    print(f"  external nodes    {len(ext)}  ({', '.join(f'{k}:{v}' for k, v in sorted(by_cat.items()))})")
    print(f"  cycles            {sum(1 for _, h in cycles if h)} hard, "
          f"{sum(1 for _, h in cycles if not h)} deferred")
    print(f"\nWrote {OUT.relative_to(REPO)}/: README.md, graph.json, packages/*.md, "
          f"regenerate.md{', index.html' if mapped else ''}")
    if mapped:
        print(f"Open {(OUT / 'index.html').relative_to(REPO)} in a browser for the interactive map.")


if __name__ == "__main__":
    main()
