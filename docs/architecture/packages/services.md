# `services`

23 modules, 6,139 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/services`; 7 of its 23 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `services`<br/><sub>backend/services/__init__.py</sub> | 0 | — | — |
| `services.block_service`<br/><sub>backend/services/block_service.py</sub> | 85 | `BlockService` | Block Service with Blockchain Integration Handles vineyard block assignments and auto-creates block… |
| `services.blockchain_service`<br/><sub>backend/services/blockchain_service.py</sub> | 392 | `BlockchainService`, `FlexibleSeasonManager` | Flexible Season Management for Viticultural Edge Cases Handles dessert wines, late harvest, multipl… |
| `services.climate_calculations`<br/><sub>backend/services/climate_calculations.py</sub> | 245 | `ClimateCalculations` | — |
| `services.credential_service`<br/><sub>backend/services/credential_service.py</sub> | 125 | `CredentialError`, `CredentialFetchFailed`, `CredentialNotFound`, `CredentialResolver` | Credential resolver for ingestion sources. Phase B1 of DATA_INGESTION_PLATFORM_PLAN.md. Resolves a … |
| `services.email_service`<br/><sub>backend/services/email_service.py</sub> | 639 | `UnifiedEmailService` | — |
| `services.file_storage`<br/><sub>backend/services/file_storage.py</sub> | 118 | `FileStorageNotConfigured`, `delete_object`, `generate_presigned_url`, `head_object`, `is_enabled`, `make_s3_key` _+2 more_ | S3-backed file storage for user uploads. Wraps boto3 so `files.py` can stay agnostic to the storage… |
| `services.forecast_service`<br/><sub>backend/services/forecast_service.py</sub> | 229 | `ForecastError`, `ForecastSlice`, `get_conditions`, `get_current_only` | services/forecast_service.py — MetOcean forecast proxy + cache + normalisation. Replaces the previo… |
| `services.gps_processing`<br/><sub>backend/services/gps_processing.py</sub> | 177 | `process_gps_track` | — |
| `services.insights_profile`<br/><sub>backend/services/insights_profile.py</sub> | 93 | `ensure_insights_profile`, `preview_insights_action` | Grow -> Insights provisioning (Phase 2). Resolves a Grow `users` identity to its single Insights `p… |
| `services.integrated_risk_service`<br/><sub>backend/services/integrated_risk_service.py</sub> | 525 | `IntegratedRiskService` | — |
| `services.linz_parcels_service`<br/><sub>backend/services/linz_parcels_service.py</sub> | 382 | `LINZParcelsService` | — |
| `services.management_service`<br/><sub>backend/services/management_service.py</sub> | 135 | `transfer_management` | — |
| `services.notification_service`<br/><sub>backend/services/notification_service.py</sub> | 276 | `NotificationService` | — |
| `services.parcel_sync_service`<br/><sub>backend/services/parcel_sync_service.py</sub> | 264 | `ParcelSyncService` | — |
| `services.property_service`<br/><sub>backend/services/property_service.py</sub> | 72 | `get_visible_property_ids`, `verify_block_access` | — |
| `services.risk_action_service`<br/><sub>backend/services/risk_action_service.py</sub> | 357 | `RiskActionService` | — |
| `services.risk_logic`<br/><sub>backend/services/risk_logic.py</sub> | 231 | `RiskBusinessLogic` | — |
| `services.run_completion`<br/><sub>backend/services/run_completion.py</sub> | 735 | `complete_run` | — |
| `services.season_extremes`<br/><sub>backend/services/season_extremes.py</sub> | 130 | `compute_season_extremes`, `season_is_complete`, `upsert_observed_season`, `vintage_window` | Compute seasonal extreme metrics for a completed growing season from the live zone-daily series, an… |
| `services.spray_coverage`<br/><sub>backend/services/spray_coverage.py</sub> | 521 | `assess_asset_spray_capability`, `assess_spray_readiness`, `compute_spray_coverage`, `detect_spray_blocks` | — |
| `services.timesheet_rules`<br/><sub>backend/services/timesheet_rules.py</sub> | 76 | `create_entry`, `delete_entry`, `recalc_day`, `set_day_hours`, `update_entry` | — |
| `services.visitor_service`<br/><sub>backend/services/visitor_service.py</sub> | 332 | `VisitorService` | — |

## Inbound dependencies

- [`api.v1`](api-v1.md) — imports this package
- [`app`](app.md) — imports this package
- [`core`](core.md) — imports this package
- [`ingestion`](ingestion.md) — imports this package
- [`ingestion.sources`](ingestion-sources.md) — imports this package
- [`scripts`](scripts.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package
- [`permissions`](permissions.md) — is imported by this package
- [`schemas`](schemas.md) — is imported by this package
- [`utils`](utils.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **cloud** | `boto3`, `botocore` | `services.credential_service`, `services.file_storage` |
| **config** | `os.environ` | `services.credential_service`, `services.email_service` |
| **db** | `geoalchemy2`, `sqlalchemy` | `services.block_service`, `services.blockchain_service`, `services.climate_calculations`, `services.credential_service` _+14 more_ |
| **http** | `httpx` | `services.forecast_service`, `services.linz_parcels_service` |

## Dataflows

- **cloud** → `services` — downloads objects
- `services` → **cloud** — uploads objects
- `services` → **db** — executes SQL
- **db** → `services` — reads rows
- `services` → **db** — writes rows
- **http** → `services` — fetches
- `services` → **http** — sends
