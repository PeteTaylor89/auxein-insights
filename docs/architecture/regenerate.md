# Regenerating the architecture map

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
