# `api.v1`

57 modules, 26,415 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/api/v1`; 12 of its 57 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `api.v1`<br/><sub>backend/api/v1/__init__.py</sub> | 3 | — | — |
| `api.v1.admin`<br/><sub>backend/api/v1/admin.py</sub> | 939 | `CompanyAdminCreate`, `CompanyAdminResponse`, `ContractorAdminCreate`, `ContractorAdminUpdate`, `admin_create_contractor`, `admin_delete_contractor` _+18 more_ | — |
| `api.v1.admin_banners`<br/><sub>backend/api/v1/admin_banners.py</sub> | 72 | `create_banner`, `delete_banner`, `list_banners`, `update_banner` | Admin CRUD endpoints for site banners. |
| `api.v1.admin_data`<br/><sub>backend/api/v1/admin_data.py</sub> | 470 | `check_value_quality`, `detect_gaps`, `get_climate_data_status`, `get_data_gaps`, `get_data_overview`, `get_quality_issues` _+1 more_ | — |
| `api.v1.admin_grow_banners`<br/><sub>backend/api/v1/admin_grow_banners.py</sub> | 83 | `create_banner`, `delete_banner`, `list_banners`, `require_auxein_admin`, `update_banner` | Grow admin CRUD endpoints for site banners. Mirrors the Insights admin endpoints (`admin_banners.py… |
| `api.v1.admin_users`<br/><sub>backend/api/v1/admin_users.py</sub> | 516 | `export_users`, `get_activity_timeline`, `get_marketing_segment`, `get_marketing_segments`, `get_user_detail`, `get_user_stats` _+3 more_ | — |
| `api.v1.admin_weather`<br/><sub>backend/api/v1/admin_weather.py</sub> | 546 | `calculate_station_health`, `cleanup_old_logs`, `derive_station_interval_minutes`, `get_expected_records_for_station`, `get_expected_records_for_station`, `get_ingestion_logs` _+7 more_ | — |
| `api.v1.aliases`<br/><sub>backend/api/v1/aliases.py</sub> | 134 | `create_alias`, `delete_alias`, `get_alias`, `get_aliases_for_entity`, `list_aliases`, `update_alias` | — |
| `api.v1.article_images`<br/><sub>backend/api/v1/article_images.py</sub> | 116 | `upload_article_image` | — |
| `api.v1.articles`<br/><sub>backend/api/v1/articles.py</sub> | 492 | `add_comment`, `admin_get_article`, `admin_list_articles`, `archive_article`, `create_article`, `delete_comment` _+9 more_ | — |
| `api.v1.assets`<br/><sub>backend/api/v1/assets.py</sub> | 996 | `associate_file_with_asset`, `build_asset_scope_filter`, `check_asset_scope`, `create_asset`, `create_calibration_spec`, `delete_asset` _+17 more_ | — |
| `api.v1.auth`<br/><sub>backend/api/v1/auth.py</sub> | 825 | `EnhancedToken`, `RefreshTokenRequest`, `change_password`, `create_contractor`, `create_user`, `delete_current_user_avatar` _+14 more_ | — |
| `api.v1.blockchain`<br/><sub>backend/api/v1/blockchain.py</sub> | 130 | `create_chain_for_block`, `get_chain_by_block`, `get_provenance_trace`, `verify_chain_integrity` | — |
| `api.v1.blocks`<br/><sub>backend/api/v1/blocks.py</sub> | 706 | `Geography`, `area_ha`, `assign_block_to_company`, `create_block_with_polygon`, `get_all_blocks_geojson`, `get_block_blockchain_status` _+6 more_ | — |
| `api.v1.blocks_query`<br/><sub>backend/api/v1/blocks_query.py</sub> | 771 | `BlockQueryResponse`, `ClickLog`, `ClickTracker`, `GeoJSONRateLimiter`, `IssueReport`, `RateLimiter` _+8 more_ | Public API endpoint for querying vineyard blocks by clicking on map. Returns block metadata WITHOUT… |
| `api.v1.calendar`<br/><sub>backend/api/v1/calendar.py</sub> | 303 | `get_calendar_events` | — |
| `api.v1.calibration_schedules`<br/><sub>backend/api/v1/calibration_schedules.py</sub> | 68 | `get_calibration_schedule`, `list_calibration_schedules` | — |
| `api.v1.calibrations`<br/><sub>backend/api/v1/calibrations.py</sub> | 488 | `create_calibration_record`, `create_pending_schedule`, `delete_calibration_record`, `get_asset_calibration_history`, `get_calibration_record`, `get_calibrations_due` _+2 more_ | — |
| `api.v1.climate`<br/><sub>backend/api/v1/climate.py</sub> | 651 | `bulk_import_climate_data`, `debug_climate_data`, `delete_climate_record`, `get_available_seasons`, `get_climate_stats`, `get_climate_summary` _+10 more_ | — |
| `api.v1.companies`<br/><sub>backend/api/v1/companies.py</sub> | 430 | `create_company`, `create_company_public`, `get_current_company`, `get_current_company_stats`, `get_managed_properties`, `read_companies` _+4 more_ | — |
| `api.v1.company_admin`<br/><sub>backend/api/v1/company_admin.py</sub> | 248 | `generate_feed_token`, `get_ical_feed`, `get_timesheet_summary`, `get_training_summary`, `get_user_property_scopes`, `set_user_property_scopes` | — |
| `api.v1.contractor_management`<br/><sub>backend/api/v1/contractor_management.py</sub> | 1668 | `ContractorAssignmentSelfCreate`, `ContractorIncidentSelfCreate`, `ContractorInsuranceUpdate`, `ContractorObservationSelfCreate`, `ContractorProfileUpdate`, `PasswordChange` _+38 more_ | — |
| `api.v1.email_campaigns`<br/><sub>backend/api/v1/email_campaigns.py</sub> | 396 | `campaign_stats`, `create_campaign`, `estimate_recipients`, `get_campaign`, `get_preferences`, `get_template` _+8 more_ | — |
| `api.v1.enrichment`<br/><sub>backend/api/v1/enrichment.py</sub> | 242 | `content_performance`, `events_diagnostic`, `get_user_profile`, `list_profiles`, `record_event`, `record_events_batch` _+3 more_ | — |
| `api.v1.feedback`<br/><sub>backend/api/v1/feedback.py</sub> | 107 | `submit_feedback` | — |
| `api.v1.files`<br/><sub>backend/api/v1/files.py</sub> | 422 | `create_upload_directory`, `delete_file`, `download_file`, `get_entity_files`, `get_file`, `list_files` _+4 more_ | — |
| `api.v1.forecast`<br/><sub>backend/api/v1/forecast.py</sub> | 76 | `current_at_point`, `forecast_at_point`, `forecast_for_property` | api/v1/forecast.py — Forecast endpoints. Thin layer over services.forecast_service. Routes (all req… |
| `api.v1.gis`<br/><sub>backend/api/v1/gis.py</sub> | 278 | `GIDetail`, `GIListItem`, `get_gi_bounds`, `get_gi_detail`, `get_gis_geojson`, `list_gis` | backend/api/v1/gis.py Public API endpoints for Geographical Indications (GIs). Requires public auth… |
| `api.v1.insights_feedback`<br/><sub>backend/api/v1/insights_feedback.py</sub> | 119 | `FeedbackPayload`, `submit_insights_feedback` | — |
| `api.v1.invitations`<br/><sub>backend/api/v1/invitations.py</sub> | 338 | `accept_invitation`, `create_invitation`, `get_invitation_by_token`, `list_invitations`, `login_with_temp_credentials` | — |
| `api.v1.maintenance`<br/><sub>backend/api/v1/maintenance.py</sub> | 299 | `create_maintenance_record`, `delete_maintenance_record`, `get_asset_maintenance_history`, `get_maintenance_due`, `get_maintenance_record`, `list_maintenance_records` _+1 more_ | — |
| `api.v1.notifications`<br/><sub>backend/api/v1/notifications.py</sub> | 92 | `get_notifications`, `get_unread_count`, `mark_all_notifications_read`, `mark_notification_read` | — |
| `api.v1.observation_runs_complete`<br/><sub>backend/api/v1/observation_runs_complete.py</sub> | 56 | `api_complete_observation_run`, `api_get_observation_run_summary` | — |
| `api.v1.observations`<br/><sub>backend/api/v1/observations.py</sub> | 684 | `add_spot`, `attach_reference_item_image`, `build_run_scope_filter`, `cancel_run`, `check_run_access`, `complete_run_endpoint` _+20 more_ | — |
| `api.v1.parcels`<br/><sub>backend/api/v1/parcels.py</sub> | 681 | `assign_parcel_to_company`, `get_company_parcels_geojson`, `get_parcel_details`, `get_parcel_statistics`, `get_parcels_by_company`, `get_parcels_geojson` _+7 more_ | — |
| `api.v1.properties`<br/><sub>backend/api/v1/properties.py</sub> | 338 | `add_user_property_scope`, `create_management_relationship`, `create_property`, `get_management_history`, `get_property`, `get_property_blocks` _+5 more_ | — |
| `api.v1.public_auth`<br/><sub>backend/api/v1/public_auth.py</sub> | 443 | `exchange_sso_token`, `get_current_user_info`, `get_regions`, `get_user_types`, `login`, `request_password_reset` _+6 more_ | — |
| `api.v1.public_banners`<br/><sub>backend/api/v1/public_banners.py</sub> | 34 | `get_active_banners` | Public endpoint for active site banners. No authentication required. Supports an `audience` query p… |
| `api.v1.public_climate`<br/><sub>backend/api/v1/public_climate.py</sub> | 944 | `build_projection_extremes`, `build_season_extremes`, `build_season_extremes_baseline`, `calc_pct_diff`, `calculate_season_baseline`, `compare_seasons` _+15 more_ | Public Climate API endpoints for Regional Intelligence. Provides access to: - Climate zones and reg… |
| `api.v1.public_climate_zones`<br/><sub>backend/api/v1/public_climate_zones.py</sub> | 119 | `get_blocks_in_climate_zone`, `get_climate_zones_geojson` | backend/api/v1/public_climate_zones.py Public API endpoints for climate zone map layer. - GeoJSON e… |
| `api.v1.realtime_climate`<br/><sub>backend/api/v1/realtime_climate.py</sub> | 868 | `adjust_gdd_to_sep1`, `baseline_daily_gdd_col`, `calc_baseline_comparison`, `daily_gdd_from_mean`, `date_to_day_of_vintage`, `get_aug31_gdd_offset` _+15 more_ | Realtime Climate Intelligence API endpoints. Provides current season climate data, phenology estima… |
| `api.v1.regions`<br/><sub>backend/api/v1/regions.py</sub> | 260 | `RegionDetail`, `RegionListItem`, `get_region_bounds`, `get_region_detail`, `get_regions_geojson`, `list_regions` | backend/api/v1/regions.py Public API endpoints for wine regions. Requires public authentication. UP… |
| `api.v1.reports`<br/><sub>backend/api/v1/reports.py</sub> | 480 | `asset_report_export`, `asset_report_summary`, `contractor_report_export`, `contractor_report_summary`, `observation_report_export`, `observation_report_summary` _+4 more_ | — |
| `api.v1.research`<br/><sub>backend/api/v1/research.py</sub> | 432 | `add_comment`, `add_section`, `admin_get_report`, `admin_list_reports`, `archive_report`, `create_report` _+13 more_ | — |
| `api.v1.risk_management`<br/><sub>backend/api/v1/risk_management.py</sub> | 1392 | `RiskStatus`, `RiskStatusUpdate`, `check_incident_compliance`, `close_incident_with_validation`, `complete_action`, `convert_location_data` _+35 more_ | Risk Management API Router Integrates with existing vineyard management system |
| `api.v1.seasonal_stats`<br/><sub>backend/api/v1/seasonal_stats.py</sub> | 153 | `SeasonalStatsRequest`, `SeasonalStatsResponse`, `calculate_seasonal_stats` | backend/api/v1/seasonal_stats.py Public endpoint for seasonal stats widget. Calculates climate metr… |
| `api.v1.seo`<br/><sub>backend/api/v1/seo.py</sub> | 120 | `rss_feed`, `sitemap`, `validate_seo` | — |
| `api.v1.site`<br/><sub>backend/api/v1/site.py</sub> | 113 | `list_on_site` | — |
| `api.v1.spatial_areas`<br/><sub>backend/api/v1/spatial_areas.py</sub> | 381 | `create_spatial_area_with_polygon`, `delete_spatial_area`, `get_all_spatial_areas`, `get_all_spatial_areas_geojson`, `get_area_types_summary`, `get_company_spatial_areas` _+4 more_ | — |
| `api.v1.stock_movements`<br/><sub>backend/api/v1/stock_movements.py</sub> | 392 | `create_bulk_stock_movements`, `create_stock_movement`, `delete_stock_movement`, `get_asset_stock_history`, `get_block_stock_movements`, `get_stock_movement` _+4 more_ | — |
| `api.v1.subscriptions`<br/><sub>backend/api/v1/subscriptions.py</sub> | 312 | `calculate_pricing_for_hectares`, `check_feature_access`, `get_all_subscriptions`, `get_current_subscription_pricing`, `get_current_user_subscription`, `get_pricing_estimate` _+3 more_ | — |
| `api.v1.task_rows`<br/><sub>backend/api/v1/task_rows.py</sub> | 338 | `bulk_complete_rows`, `bulk_skip_rows`, `complete_task_row`, `generate_task_rows`, `get_row_progress`, `list_task_rows` _+2 more_ | — |
| `api.v1.tasks`<br/><sub>backend/api/v1/tasks.py</sub> | 2775 | `SprayConfirmRequest`, `TaskAssetUpsert`, `accept_assignment`, `add_bulk_gps_points`, `add_gps_point`, `add_or_update_task_asset` _+59 more_ | — |
| `api.v1.timesheets`<br/><sub>backend/api/v1/timesheets.py</sub> | 400 | `approve_timesheet_day`, `create_time_entry`, `create_timesheet_day`, `delete_time_entry`, `get_timesheet_day`, `list_timesheet_days` _+6 more_ | — |
| `api.v1.training`<br/><sub>backend/api/v1/training.py</sub> | 720 | `archive_training_module`, `assign_training`, `complete_slide`, `complete_training_session`, `create_training_module`, `create_training_question` _+14 more_ | — |
| `api.v1.vineyard_rows`<br/><sub>backend/api/v1/vineyard_rows.py</sub> | 423 | `bulk_create_rows`, `create_row`, `create_row_set`, `delete_all_rows_by_block`, `delete_row`, `generate_row_numbers` _+9 more_ | — |
| `api.v1.visitors`<br/><sub>backend/api/v1/visitors.py</sub> | 533 | `ban_visitor`, `create_visit`, `create_visitor`, `export_visitor_data`, `get_active_visits`, `get_visit` _+10 more_ | — |

## Inbound dependencies

- [`app`](app.md) — imports this package

## Outbound dependencies

- [`api`](api.md) — is imported by this package
- [`core`](core.md) — is imported by this package
- [`core.security`](core-security.md) — is imported by this package
- [`db`](db.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package
- [`permissions`](permissions.md) — is imported by this package
- [`schemas`](schemas.md) — is imported by this package
- [`scripts`](scripts.md) — is imported by this package
- [`services`](services.md) — is imported by this package
- [`utils`](utils.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **cloud** | `boto3` | `api.v1.article_images` |
| **config** | `os.environ` | `api.v1.blocks_query`, `api.v1.email_campaigns`, `api.v1.parcels` |
| **db** | `geoalchemy2`, `sqlalchemy` | `api.v1.admin`, `api.v1.admin_banners`, `api.v1.admin_data`, `api.v1.admin_grow_banners` _+50 more_ |
| **fs** | `csv`, `io`, `open()`, `pathlib` | `api.v1.admin_users`, `api.v1.article_images`, `api.v1.auth`, `api.v1.climate` _+2 more_ |

## Dataflows

- `api.v1` → **cloud** — uploads objects
- `api.v1` → **db** — executes SQL
- **db** → `api.v1` — reads rows
- `api.v1` → **db** — writes rows
