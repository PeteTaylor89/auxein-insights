# `core`

10 modules, 2,430 lines. [← architecture overview](../README.md)

## Purpose

Created on Wed Apr 16 20:59:49 2025 @author: Peter Taylor

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `core`<br/><sub>backend/core/__init__.py</sub> | 7 | — | Created on Wed Apr 16 20:59:49 2025 @author: Peter Taylor |
| `core.admin_security`<br/><sub>backend/core/admin_security.py</sub> | 20 | `get_current_admin_user` | — |
| `core.branding`<br/><sub>backend/core/branding.py</sub> | 59 | `Brand` | Brand abstraction for outgoing emails and other user-facing surfaces. Background: prior to 2026-05-… |
| `core.config`<br/><sub>backend/core/config.py</sub> | 259 | `Settings`, `debug_settings`, `get_database_url`, `get_upload_dir` | — |
| `core.email_templates`<br/><sub>backend/core/email_templates.py</sub> | 464 | `get_invitation_email_template`, `send_invitation_email`, `send_invitation_reminder_email`, `send_welcome_email` | — |
| `core.email_utils`<br/><sub>backend/core/email_utils.py</sub> | 1068 | `EmailService`, `get_app_badges_html`, `get_app_badges_text`, `get_base_email_styles`, `get_contractor_verification_email_template`, `get_contractor_welcome_email_template` _+9 more_ | — |
| `core.permissions`<br/><sub>backend/core/permissions.py</sub> | 177 | `UserType`, `get_platform_access`, `get_scope`, `has_permission` | Centralized permission matrix for Auxein Insights Pro. This module defines the 5-tier user type sys… |
| `core.public_security`<br/><sub>backend/core/public_security.py</sub> | 254 | `create_access_token`, `decode_access_token`, `generate_reset_token`, `generate_verification_token`, `get_any_authenticated_user`, `get_current_public_user` _+4 more_ | — |
| `core.utils_helpers`<br/><sub>backend/core/utils_helpers.py</sub> | 18 | `compare_datetimes`, `make_aware`, `utc_now` | — |
| `core.vintage`<br/><sub>backend/core/vintage.py</sub> | 104 | `day_of_vintage`, `day_of_vintage_for_country`, `vintage_year_for`, `vintage_year_for_country` | Hemisphere-aware vintage year helpers. Reads vintage convention from the `countries` table (hemisph… |

## Inbound dependencies

- [`api`](api.md) — imports this package
- [`api.v1`](api-v1.md) — imports this package
- [`app`](app.md) — imports this package
- [`core.security`](core-security.md) — imports this package
- [`db`](db.md) — imports this package
- [`db.models`](db-models.md) — imports this package
- [`scripts`](scripts.md) — imports this package
- [`scripts.data_import`](scripts-data_import.md) — imports this package
- [`services`](services.md) — imports this package
- [`utils`](utils.md) — imports this package

## Outbound dependencies

- [`api`](api.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package
- [`services`](services.md) — is imported by this package
- [`utils`](utils.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **config** | `dotenv`, `os.environ`, `pydantic_settings` | `core.config` |
| **db** | `sqlalchemy` | `core.public_security` |
| **fs** | `pathlib` | `core.config` |

## Dataflows

- **db** → `core` — reads rows
- `core` → **db** — writes rows
