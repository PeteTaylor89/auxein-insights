# `db`

4 modules, 80 lines. [← architecture overview](../README.md)

## Purpose

Created on Wed Apr 16 20:59:49 2025 @author: Peter Taylor

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `db`<br/><sub>backend/db/__init__.py</sub> | 5 | — | Created on Wed Apr 16 20:59:49 2025 @author: Peter Taylor |
| `db.base`<br/><sub>backend/db/base.py</sub> | 37 | — | Created on Wed Apr 16 20:38:25 2025 @author: Peter Taylor |
| `db.base_class`<br/><sub>backend/db/base_class.py</sub> | 7 | — | Created on Wed Apr 16 21:31:31 2025 @author: Peter Taylor |
| `db.session`<br/><sub>backend/db/session.py</sub> | 31 | `get_db`, `get_engine` | — |

## Inbound dependencies

- [`api`](api.md) — imports this package
- [`api.v1`](api-v1.md) — imports this package
- [`app`](app.md) — imports this package
- [`db.models`](db-models.md) — imports this package
- [`ingestion`](ingestion.md) — imports this package
- [`scripts`](scripts.md) — imports this package
- [`scripts.data_import`](scripts-data_import.md) — imports this package
- [`utils`](utils.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `sqlalchemy` | `db.base_class`, `db.session` |
