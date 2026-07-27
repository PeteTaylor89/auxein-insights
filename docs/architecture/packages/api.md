# `api`

1 modules, 298 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/api`; 0 of its 1 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `api.deps`<br/><sub>backend/api/deps.py</sub> | 298 | `get_current_contractor`, `get_current_user`, `get_current_user_or_contractor`, `get_db`, `require_company_user_permission`, `require_permission` _+2 more_ | — |

## Inbound dependencies

- [`api.v1`](api-v1.md) — imports this package
- [`core`](core.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`core.security`](core-security.md) — is imported by this package
- [`db`](db.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `sqlalchemy` | `api.deps` |

## Dataflows

- **db** → `api` — reads rows
