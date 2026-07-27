# `core.security`

3 modules, 183 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/core/security`; 0 of its 3 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `core.security`<br/><sub>backend/core/security/__init__.py</sub> | 0 | — | — |
| `core.security.auth`<br/><sub>backend/core/security/auth.py</sub> | 113 | `blacklist_token`, `cleanup_expired_blacklist`, `create_access_token`, `create_refresh_token`, `decode_token`, `is_token_blacklisted` _+1 more_ | — |
| `core.security.password`<br/><sub>backend/core/security/password.py</sub> | 70 | `generate_random_password`, `get_password_hash`, `is_password_strong`, `validate_password`, `verify_password` | — |

## Inbound dependencies

- [`api`](api.md) — imports this package
- [`api.v1`](api-v1.md) — imports this package
- [`db.models`](db-models.md) — imports this package
- [`schemas`](schemas.md) — imports this package
- [`scripts`](scripts.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `sqlalchemy` | `core.security.auth` |

## Dataflows

- **db** → `core.security` — reads rows
- `core.security` → **db** — writes rows
