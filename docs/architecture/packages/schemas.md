# `schemas`

41 modules, 7,051 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/schemas`; 3 of its 41 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `schemas.admin`<br/><sub>backend/schemas/admin.py</sub> | 287 | `ActivityTimelineItem`, `ActivityTimelineResponse`, `ClimateDataOverview`, `DataGap`, `DataGapsResponse`, `DataOverviewResponse` _+26 more_ | — |
| `schemas.article`<br/><sub>backend/schemas/article.py</sub> | 94 | `ArticleCreate`, `ArticleDetail`, `ArticleListItem`, `ArticleListResponse`, `ArticleUpdate`, `CommentCreate` _+1 more_ | — |
| `schemas.asset`<br/><sub>backend/schemas/asset.py</sub> | 549 | `AssetBase`, `AssetCategory`, `AssetCreate`, `AssetResponse`, `AssetStats`, `AssetStatus` _+30 more_ | — |
| `schemas.block`<br/><sub>backend/schemas/block.py</sub> | 68 | `Block`, `BlockBase`, `BlockCreate`, `BlockFilter`, `BlockStatus`, `BlockUpdate` _+2 more_ | — |
| `schemas.blockchain`<br/><sub>backend/schemas/blockchain.py</sub> | 105 | `BlockchainChain`, `BlockchainChainBase`, `BlockchainChainCreate`, `BlockchainChainWithBlock`, `BlockchainEvent`, `BlockchainEventBase` _+9 more_ | — |
| `schemas.calendar`<br/><sub>backend/schemas/calendar.py</sub> | 33 | `CalendarEvent`, `CalendarEventType` | — |
| `schemas.climate`<br/><sub>backend/schemas/climate.py</sub> | 104 | `CSVImportResult`, `ClimateHistorical`, `ClimateHistoricalBase`, `ClimateHistoricalBulkCreate`, `ClimateHistoricalCreate`, `ClimateHistoricalSummary` _+4 more_ | — |
| `schemas.company`<br/><sub>backend/schemas/company.py</sub> | 140 | `Company`, `CompanyBase`, `CompanyCreate`, `CompanyInDBBase`, `CompanyStats`, `CompanySubscriptionUpdate` _+4 more_ | — |
| `schemas.contractor`<br/><sub>backend/schemas/contractor.py</sub> | 580 | `Contractor`, `ContractorAssignment`, `ContractorAssignmentBase`, `ContractorAssignmentCreate`, `ContractorAssignmentInDB`, `ContractorAssignmentUpdate` _+31 more_ | — |
| `schemas.email_campaign`<br/><sub>backend/schemas/email_campaign.py</sub> | 92 | `CampaignCreate`, `CampaignListResponse`, `CampaignResponse`, `CampaignSendRequest`, `CampaignStatsResponse`, `CampaignTestSendRequest` _+5 more_ | — |
| `schemas.enrichment`<br/><sub>backend/schemas/enrichment.py</sub> | 53 | `ContentPerformanceItem`, `EventBatchCreate`, `EventCreate`, `SegmentCount`, `UserProfileListItem`, `UserProfileListResponse` _+1 more_ | — |
| `schemas.external_alias`<br/><sub>backend/schemas/external_alias.py</sub> | 31 | `ExternalAliasBase`, `ExternalAliasCreate`, `ExternalAliasOut`, `ExternalAliasUpdate` | — |
| `schemas.file`<br/><sub>backend/schemas/file.py</sub> | 91 | `FileBase`, `FileCategory`, `FileCreate`, `FileEntityType`, `FileResponse`, `FileSummary` _+3 more_ | — |
| `schemas.image`<br/><sub>backend/schemas/image.py</sub> | 16 | `ImageBase`, `ImageCreate`, `ImageResponse` | — |
| `schemas.incident`<br/><sub>backend/schemas/incident.py</sub> | 367 | `IncidentBase`, `IncidentCategory`, `IncidentClosure`, `IncidentCreate`, `IncidentInvestigation`, `IncidentMetrics` _+10 more_ | — |
| `schemas.invitation`<br/><sub>backend/schemas/invitation.py</sub> | 158 | `BulkInvitation`, `Invitation`, `InvitationAccept`, `InvitationBase`, `InvitationCreate`, `InvitationInDBBase` _+5 more_ | — |
| `schemas.notification`<br/><sub>backend/schemas/notification.py</sub> | 65 | `NotificationCreate`, `NotificationListResponse`, `NotificationMarkAllRead`, `NotificationMarkRead`, `NotificationResponse`, `NotificationType` _+1 more_ | — |
| `schemas.observations`<br/><sub>backend/schemas/observations.py</sub> | 217 | `ObservationRunBase`, `ObservationRunCreate`, `ObservationRunOut`, `ObservationRunUpdate`, `ObservationSpotBase`, `ObservationSpotCreate` _+9 more_ | — |
| `schemas.property`<br/><sub>backend/schemas/property.py</sub> | 93 | `ManagementRelationshipCreate`, `ManagementRelationshipOut`, `PropertyBase`, `PropertyCreate`, `PropertyOut`, `PropertyUpdate` _+2 more_ | — |
| `schemas.public_climate`<br/><sub>backend/schemas/public_climate.py</sub> | 276 | `BaselineComparison`, `ClimateValue`, `ClimateZoneBrief`, `ClimateZoneDetail`, `HistoryResponse`, `MonthlyBaseline` _+27 more_ | Pydantic schemas for Climate API responses. |
| `schemas.public_user`<br/><sub>backend/schemas/public_user.py</sub> | 311 | `EmailVerificationRequest`, `MarketingPreferencesUpdate`, `MessageResponse`, `PasswordResetConfirm`, `PasswordResetRequest`, `PublicUserBase` _+9 more_ | — |
| `schemas.realtime_climate`<br/><sub>backend/schemas/realtime_climate.py</sub> | 217 | `BaselineComparison`, `ClimateZoneBrief`, `CurrentSeasonResponse`, `DailyClimateData`, `DailyDiseasePressure`, `DiseasePressureResponse` _+14 more_ | Pydantic schemas for Realtime Climate Intelligence API. Provides response models for: - Current sea… |
| `schemas.reference_items`<br/><sub>backend/schemas/reference_items.py</sub> | 65 | `ReferenceItemBase`, `ReferenceItemCreate`, `ReferenceItemImageCreate`, `ReferenceItemImageOut`, `ReferenceItemOut`, `ReferenceItemOut` _+1 more_ | — |
| `schemas.report`<br/><sub>backend/schemas/report.py</sub> | 51 | `AssetReportSummary`, `CategoryCount`, `ContractorReportSummary`, `ObservationReportSummary`, `PropertyVisitCount`, `StatusCount` _+3 more_ | — |
| `schemas.research`<br/><sub>backend/schemas/research.py</sub> | 134 | `ResearchCommentCreate`, `ResearchCommentResponse`, `ResearchCreate`, `ResearchDetail`, `ResearchFileResponse`, `ResearchListItem` _+7 more_ | — |
| `schemas.risk_action`<br/><sub>backend/schemas/risk_action.py</sub> | 296 | `ActionCompletion`, `ActionEffectiveness`, `ActionMetrics`, `ActionPriority`, `ActionProgressUpdate`, `ActionStatus` _+11 more_ | — |
| `schemas.site_banner`<br/><sub>backend/schemas/site_banner.py</sub> | 41 | `BannerAudience`, `BannerCreate`, `BannerListResponse`, `BannerResponse`, `BannerType`, `BannerUpdate` | — |
| `schemas.site_risk`<br/><sub>backend/schemas/site_risk.py</sub> | 272 | `ResidualRiskUpdate`, `RiskAssessment`, `RiskCategory`, `RiskHazardChip`, `RiskLevel`, `RiskMatrix` _+8 more_ | — |
| `schemas.spatial_area`<br/><sub>backend/schemas/spatial_area.py</sub> | 80 | `AreaType`, `SpatialAreaBase`, `SpatialAreaCreate`, `SpatialAreaFilter`, `SpatialAreaResponse`, `SpatialAreaUpdate` _+1 more_ | — |
| `schemas.subscription`<br/><sub>backend/schemas/subscription.py</sub> | 254 | `BillingCalculation`, `CompanyBillingSummary`, `FeatureCheck`, `Subscription`, `SubscriptionBase`, `SubscriptionCreate` _+6 more_ | — |
| `schemas.task`<br/><sub>backend/schemas/task.py</sub> | 300 | `ConsumableActual`, `TaskActionRequest`, `TaskBase`, `TaskBulkActionRequest`, `TaskBulkUpdateRequest`, `TaskCalendarEvent` _+14 more_ | — |
| `schemas.task_assignment`<br/><sub>backend/schemas/task_assignment.py</sub> | 123 | `AssignmentRole`, `AssignmentStatus`, `MyTasksFilter`, `TaskAssignmentAcceptRequest`, `TaskAssignmentBase`, `TaskAssignmentBulkCreate` _+9 more_ | — |
| `schemas.task_gps_track`<br/><sub>backend/schemas/task_gps_track.py</sub> | 188 | `GPSPointBase`, `TaskGPSCoverageAnalysis`, `TaskGPSHeatmapData`, `TaskGPSQualityReport`, `TaskGPSSegmentInfo`, `TaskGPSSpeedProfile` _+12 more_ | — |
| `schemas.task_row`<br/><sub>backend/schemas/task_row.py</sub> | 147 | `TaskRowBase`, `TaskRowBulkCompleteRequest`, `TaskRowBulkCreate`, `TaskRowBulkSkipRequest`, `TaskRowCompleteRequest`, `TaskRowCreate` _+10 more_ | — |
| `schemas.task_template`<br/><sub>backend/schemas/task_template.py</sub> | 130 | `TaskCategory`, `TaskPriority`, `TaskTemplateBase`, `TaskTemplateCreate`, `TaskTemplateFilter`, `TaskTemplateResponse` _+3 more_ | — |
| `schemas.timesheet`<br/><sub>backend/schemas/timesheet.py</sub> | 93 | `TimeEntryBase`, `TimeEntryCreate`, `TimeEntryOut`, `TimeEntryUpdate`, `TimesheetDayBase`, `TimesheetDayCreate` _+4 more_ | — |
| `schemas.token`<br/><sub>backend/schemas/token.py</sub> | 29 | `EnhancedToken`, `Token`, `TokenData` | Created on Thu May 1 19:51:53 2025 @author: Peter Taylor |
| `schemas.training`<br/><sub>backend/schemas/training.py</sub> | 375 | `BulkAssignTrainingRequest`, `CompleteSlideRequest`, `CompleteTrainingRequest`, `SlideImageInfo`, `StartTrainingRequest`, `SubmitAnswerRequest` _+37 more_ | — |
| `schemas.user`<br/><sub>backend/schemas/user.py</sub> | 212 | `EmailVerification`, `PasswordReset`, `PasswordResetConfirm`, `User`, `UserBase`, `UserCreate` _+9 more_ | — |
| `schemas.vineyard_row`<br/><sub>backend/schemas/vineyard_row.py</sub> | 90 | `BulkRowCreationBase`, `BulkRowCreationRequest`, `BulkRowCreationResponse`, `ClonalSection`, `VineyardRow`, `VineyardRowBase` _+4 more_ | — |
| `schemas.visitor`<br/><sub>backend/schemas/visitor.py</sub> | 224 | `BulkVisitorCreate`, `Visitor`, `VisitorBase`, `VisitorCreate`, `VisitorInDBBase`, `VisitorIncident` _+14 more_ | — |

## Inbound dependencies

- [`api.v1`](api-v1.md) — imports this package
- [`services`](services.md) — imports this package

## Outbound dependencies

- [`core.security`](core-security.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `geoalchemy2`, `sqlalchemy` | `schemas.asset`, `schemas.incident`, `schemas.observations`, `schemas.property` _+2 more_ |
