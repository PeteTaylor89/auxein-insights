# Codebase Architecture Mapping — Two-Phase Task

You will produce an "as-built" architecture map of this Python codebase in two distinct phases. **Complete Phase 1 fully and stop for my review before starting Phase 2.**

---

## PHASE 1 — Discovery & Markdown Documentation

Walk the entire repository and build a structured written record. Do not write any visualization code yet.

**Steps:**

1. **Inventory.** Identify every Python package and module. Use `ast` to parse each file — do not rely on regex or naming guesses. Record for each module: its package, path, LOC, module docstring, and public classes/functions (top-level, non-underscore).

2. **Internal dependencies.** For each module, resolve every `import` / `from x import y` that points to code *within this repo*. Record directed edges (importer → imported). Flag any circular dependencies you find.

3. **Integration points.** Detect where the code touches the outside world, by matching imports AND call sites against these categories (extend if you spot others):
   - **Databases** — sqlalchemy, psycopg, asyncpg, sqlite3, pymongo, redis
   - **HTTP / external APIs** — requests, httpx, aiohttp, urllib (note the target URLs/hostnames if statically visible)
   - **Cloud / storage** — boto3, google-cloud-*, azure-*, s3
   - **Queues / async / tasks** — celery, kafka, pika, rq
   - **Filesystem** — open(), pathlib, csv, json file reads/writes
   - **Config / secrets / env** — os.environ, dotenv, pydantic settings

   Record which module owns each integration point and its category.

4. **Dataflows.** Where you can infer direction of data movement (e.g. a module reads from DB and returns to a caller, or pushes to a queue), note it as a labelled flow (source → sink, with what flows).

**Deliverables (create these files):**

- `docs/architecture/README.md` — master overview: package list, high-level description of each, the integration surface, and any circular-dependency or coupling warnings.
- `docs/architecture/packages/<package>.md` — one file per package: purpose, its modules, public interface, inbound dependencies (who uses it), outbound dependencies (what it uses), integration points it owns, and relative Markdown links to the packages it connects to.
- `docs/architecture/graph.json` — machine-readable graph capturing everything above, using this schema:
  ```json
  {
    "nodes": [
      {"id": "pkg.module", "label": "module", "package": "pkg", "type": "module|external",
       "category": "db|http|cloud|queue|fs|config|null", "loc": 0,
       "docstring": "", "public": ["ClassA", "func_b"], "path": "src/..."}
    ],
    "edges": [
      {"source": "pkg.a", "target": "pkg.b", "type": "import|dataflow",
       "label": "", "direction": "a_to_b"}
    ]
  }
  ```

**Stop here.** Print a summary: package count, module count, edge count, integration points by category, and any warnings. Wait for my review before Phase 2.

---

## PHASE 2 — Interactive Map (run only after I approve Phase 1)

Build a self-contained interactive graph that reads `graph.json`.

**Requirements:**

- Single file `docs/architecture/index.html`, no build step, no server required (open directly in a browser).
- Use **Cytoscape.js** (via CDN) with the **fcose** or **cola** layout for force-directed placement.
- **Compound nodes**: group modules inside their package as collapsible parent nodes (these are the "tabs" — expandable to show internals, collapsible to show only package-level structure).
- **Visual encoding**: internal module nodes one style; external integration nodes styled distinctly *per category* (colour + icon/label) so DB/HTTP/queue/etc. are instantly distinguishable. Edges: import edges thin/grey, dataflow edges coloured with their labels visible on hover.
- **Interaction**: pan, zoom, click a node to open a side panel showing its docstring, public interface, LOC, path, and its inbound/outbound connections as clickable links that recentre the graph on that node. Search/filter box to jump to a package. Toggle to collapse all packages / expand all.
- **Legend** for node categories and edge types.
- If `graph.json` fails to load via `file://` fetch, fall back to inlining the JSON — detect and handle this so it always opens standalone.

**Deliverable:** `docs/architecture/index.html`, plus one line in `README.md` on how to open it.

Also add `docs/architecture/regenerate.md` documenting the exact commands to re-run Phase 1's analysis so the map can be refreshed as the code changes.

---

**Constraints throughout:** parse with `ast`, never execute the target code. Prefer stdlib. Keep the analyzer logic in a committed script (`docs/architecture/analyze.py`) so it's repeatable, not a one-off in-context pass.
