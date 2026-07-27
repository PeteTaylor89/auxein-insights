# `db.models`

65 modules, 7,564 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/db/models`; 6 of its 65 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `db.models`<br/><sub>backend/db/models/__init__.py</sub> | 69 | — | — |
| `db.models.article`<br/><sub>backend/db/models/article.py</sub> | 39 | `Article` | — |
| `db.models.article_engagement`<br/><sub>backend/db/models/article_engagement.py</sub> | 31 | `ArticleComment`, `ArticleLike` | — |
| `db.models.asset`<br/><sub>backend/db/models/asset.py</sub> | 518 | `Asset`, `AssetCalibration`, `AssetCalibrationSchedule`, `AssetCalibrationSpec`, `AssetMaintenance`, `StockMovement` _+1 more_ | — |
| `db.models.block`<br/><sub>backend/db/models/block.py</sub> | 92 | `BlockStatus`, `VineyardBlock` | — |
| `db.models.blockchain`<br/><sub>backend/db/models/blockchain.py</sub> | 137 | `BlockchainChain`, `BlockchainEvent`, `BlockchainNode`, `FruitReceived` | Blockchain DAG Models for Vineyard Traceability @author: Peter Taylor |
| `db.models.climate`<br/><sub>backend/db/models/climate.py</sub> | 309 | `ClimateBaselineMonthly`, `ClimateHistoryMonthly`, `ClimateProjection`, `ClimateProjectionExtremes`, `ClimateZone`, `ClimateZoneSeasonBaseline` _+1 more_ | Climate data models for Regional Intelligence app. Tables: - climate_zones: 20 NZ wine climate zone… |
| `db.models.climate_historical`<br/><sub>backend/db/models/climate_historical.py</sub> | 54 | `ClimateHistoricalData`, `DataQuality` | — |
| `db.models.company`<br/><sub>backend/db/models/company.py</sub> | 408 | `Company` | — |
| `db.models.company_land_ownership`<br/><sub>backend/db/models/company_land_ownership.py</sub> | 57 | `CompanyLandOwnership` | — |
| `db.models.contractor`<br/><sub>backend/db/models/contractor.py</sub> | 251 | `Contractor` | — |
| `db.models.contractor_assignment`<br/><sub>backend/db/models/contractor_assignment.py</sub> | 290 | `ContractorAssignment` | — |
| `db.models.contractor_movement`<br/><sub>backend/db/models/contractor_movement.py</sub> | 275 | `ContractorMovement` | — |
| `db.models.contractor_relationship`<br/><sub>backend/db/models/contractor_relationship.py</sub> | 186 | `ContractorRelationship` | — |
| `db.models.contractor_training`<br/><sub>backend/db/models/contractor_training.py</sub> | 364 | `ContractorTraining` | — |
| `db.models.data_platform`<br/><sub>backend/db/models/data_platform.py</sub> | 144 | `Country`, `DataSource`, `DeviceMeasurement`, `IngestionCredential`, `MeasurementCatalog` | Data Ingestion Platform catalog models. Phase 0.1 of DATA_INGESTION_PLATFORM_PLAN.md. Introduces th… |
| `db.models.email_campaign`<br/><sub>backend/db/models/email_campaign.py</sub> | 51 | `EmailCampaign`, `EmailSend`, `EmailTemplate` | — |
| `db.models.external_alias`<br/><sub>backend/db/models/external_alias.py</sub> | 31 | `ExternalAlias` | — |
| `db.models.file`<br/><sub>backend/db/models/file.py</sub> | 82 | `File`, `FileEntityTypes` | — |
| `db.models.geographical_indication`<br/><sub>backend/db/models/geographical_indication.py</sub> | 64 | `GeographicalIndication` | — |
| `db.models.incident`<br/><sub>backend/db/models/incident.py</sub> | 396 | `Incident` | — |
| `db.models.invitation`<br/><sub>backend/db/models/invitation.py</sub> | 66 | `Invitation` | — |
| `db.models.management_relationship`<br/><sub>backend/db/models/management_relationship.py</sub> | 40 | `ManagementRelationship` | — |
| `db.models.notification`<br/><sub>backend/db/models/notification.py</sub> | 66 | `Notification`, `NotificationType` | — |
| `db.models.observation_link`<br/><sub>backend/db/models/observation_link.py</sub> | 17 | `ObservationTaskLink` | — |
| `db.models.observation_run`<br/><sub>backend/db/models/observation_run.py</sub> | 59 | `ObservationRun`, `ObservationSpot` | — |
| `db.models.observation_template`<br/><sub>backend/db/models/observation_template.py</sub> | 23 | `ObservationTemplate` | — |
| `db.models.parcel_sync_log`<br/><sub>backend/db/models/parcel_sync_log.py</sub> | 66 | `ParcelSyncLog` | — |
| `db.models.primary_parcel`<br/><sub>backend/db/models/primary_parcel.py</sub> | 48 | `PrimaryParcel` | — |
| `db.models.property`<br/><sub>backend/db/models/property.py</sub> | 41 | `Property` | — |
| `db.models.public_user`<br/><sub>backend/db/models/public_user.py</sub> | 100 | `PublicUser` | — |
| `db.models.realtime_climate`<br/><sub>backend/db/models/realtime_climate.py</sub> | 326 | `ClimateZoneDaily`, `ClimateZoneDailyBaseline`, `ClimateZoneHourly`, `DiseasePressure`, `PhenologyEstimate`, `PhenologyThreshold` _+1 more_ | Real-time climate models for Regional Intelligence. Tables: - WeatherDataDaily: Daily aggregates pe… |
| `db.models.reference_item`<br/><sub>backend/db/models/reference_item.py</sub> | 38 | `ReferenceItem` | — |
| `db.models.reference_item_file`<br/><sub>backend/db/models/reference_item_file.py</sub> | 18 | `ReferenceItemFile` | — |
| `db.models.research`<br/><sub>backend/db/models/research.py</sub> | 54 | `ResearchReport`, `ResearchSection` | — |
| `db.models.research_engagement`<br/><sub>backend/db/models/research_engagement.py</sub> | 44 | `ResearchComment`, `ResearchFile`, `ResearchLike` | — |
| `db.models.risk_action`<br/><sub>backend/db/models/risk_action.py</sub> | 190 | `RiskAction` | — |
| `db.models.seasonal_stats_submission`<br/><sub>backend/db/models/seasonal_stats_submission.py</sub> | 26 | `SeasonalStatsSubmission` | Captures user-submitted seasonal stats requests for modelling. Each submission records what zone/va… |
| `db.models.site_banner`<br/><sub>backend/db/models/site_banner.py</sub> | 37 | `BannerAudience`, `BannerType`, `SiteBanner` | Site-wide announcement banners for the landing page. Managed by admins, displayed publicly to all u… |
| `db.models.site_risk`<br/><sub>backend/db/models/site_risk.py</sub> | 120 | `SiteRisk` | — |
| `db.models.spatial_area`<br/><sub>backend/db/models/spatial_area.py</sub> | 61 | `SpatialArea` | — |
| `db.models.spray_coverage`<br/><sub>backend/db/models/spray_coverage.py</sub> | 73 | `SprayCoverage` | — |
| `db.models.subscription`<br/><sub>backend/db/models/subscription.py</sub> | 148 | `Subscription` | — |
| `db.models.task`<br/><sub>backend/db/models/task.py</sub> | 167 | `Task`, `TaskStatus` | — |
| `db.models.task_assignment`<br/><sub>backend/db/models/task_assignment.py</sub> | 55 | `TaskAssignment` | — |
| `db.models.task_gps_summary`<br/><sub>backend/db/models/task_gps_summary.py</sub> | 61 | `TaskGPSSummary` | — |
| `db.models.task_gps_track`<br/><sub>backend/db/models/task_gps_track.py</sub> | 46 | `TaskGPSTrack` | — |
| `db.models.task_row`<br/><sub>backend/db/models/task_row.py</sub> | 78 | `TaskRow` | — |
| `db.models.task_template`<br/><sub>backend/db/models/task_template.py</sub> | 68 | `TaskCategory`, `TaskTemplate` | — |
| `db.models.timesheet`<br/><sub>backend/db/models/timesheet.py</sub> | 140 | `TimeEntry`, `TimesheetDay`, `TimesheetStatus` | — |
| `db.models.token_blacklist`<br/><sub>backend/db/models/token_blacklist.py</sub> | 17 | `TokenBlacklist` | — |
| `db.models.training_attempt`<br/><sub>backend/db/models/training_attempt.py</sub> | 119 | `TrainingAttempt` | — |
| `db.models.training_module`<br/><sub>backend/db/models/training_module.py</sub> | 86 | `TrainingModule` | — |
| `db.models.training_question`<br/><sub>backend/db/models/training_question.py</sub> | 106 | `TrainingQuestion` | — |
| `db.models.training_question_option`<br/><sub>backend/db/models/training_question_option.py</sub> | 73 | `TrainingQuestionOption` | — |
| `db.models.training_record`<br/><sub>backend/db/models/training_record.py</sub> | 125 | `TrainingRecord` | — |
| `db.models.training_response`<br/><sub>backend/db/models/training_response.py</sub> | 111 | `TrainingResponse` | — |
| `db.models.training_slide`<br/><sub>backend/db/models/training_slide.py</sub> | 189 | `TrainingSlide` | — |
| `db.models.user`<br/><sub>backend/db/models/user.py</sub> | 203 | `User` | — |
| `db.models.user_enrichment`<br/><sub>backend/db/models/user_enrichment.py</sub> | 31 | `UserEvent`, `UserProfile` | — |
| `db.models.user_property_scope`<br/><sub>backend/db/models/user_property_scope.py</sub> | 16 | `UserPropertyScope` | — |
| `db.models.vineyard_row`<br/><sub>backend/db/models/vineyard_row.py</sub> | 87 | `VineyardRow` | — |
| `db.models.visitor`<br/><sub>backend/db/models/visitor.py</sub> | 141 | `Visitor`, `VisitorVisit` | — |
| `db.models.weather`<br/><sub>backend/db/models/weather.py</sub> | 67 | `IngestionLog`, `WeatherData`, `WeatherStation` | — |
| `db.models.wine_region`<br/><sub>backend/db/models/wine_region.py</sub> | 69 | `WineRegion` | — |

## Inbound dependencies

- [`api`](api.md) — imports this package
- [`api.v1`](api-v1.md) — imports this package
- [`app`](app.md) — imports this package
- [`backend`](backend.md) — imports this package
- [`core`](core.md) — imports this package
- [`core.security`](core-security.md) — imports this package
- [`db`](db.md) — imports this package
- [`permissions`](permissions.md) — imports this package
- [`scripts`](scripts.md) — imports this package
- [`services`](services.md) — imports this package
- [`utils`](utils.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`core.security`](core-security.md) — is imported by this package
- [`db`](db.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `geoalchemy2`, `sqlalchemy` | `db.models.article`, `db.models.article_engagement`, `db.models.asset`, `db.models.block` _+60 more_ |

## Dataflows

- **db** → `db.models` — reads rows
- `db.models` → **db** — writes rows
