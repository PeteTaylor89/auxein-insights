# `app`

4 modules, 816 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend`, `run.py`; 2 of its 4 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `init`<br/><sub>backend/init.py</sub> | 6 | — | Created on Wed Apr 16 21:33:55 2025 @author: Peter Taylor |
| `main`<br/><sub>backend/main.py</sub> | 601 | `api_root`, `custom_openapi`, `debug_auth`, `health_check`, `legacy_insights_redirect`, `list_all_routes` _+2 more_ | — |
| `run`<br/><sub>run.py</sub> | 8 | — | Created on Wed Apr 16 21:42:08 2025 @author: Peter Taylor |
| `sync_linz_parcels`<br/><sub>backend/sync_linz_parcels.py</sub> | 201 | `SimpleParcelsSync`, `main` | — |

## Inbound dependencies

_None._

## Outbound dependencies

- [`api.v1`](api-v1.md) — is imported by this package
- [`core`](core.md) — is imported by this package
- [`db`](db.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package
- [`services`](services.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **config** | `dotenv`, `os.environ` | `main`, `sync_linz_parcels` |
| **db** | `geoalchemy2`, `sqlalchemy` | `sync_linz_parcels` |
| **fs** | `open()`, `pathlib` | `main`, `sync_linz_parcels` |

## Dataflows

- `app` → **db** — executes SQL
- **db** → `app` — reads rows
- `app` → **db** — writes rows
