# `scripts`

36 modules, 7,449 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/scripts`; 33 of its 36 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `scripts`<br/><sub>backend/scripts/__init__.py</sub> | 0 | — | — |
| `scripts.aggregate_profiles`<br/><sub>backend/scripts/aggregate_profiles.py</sub> | 93 | `aggregate_profiles` | aggregate_profiles.py - Aggregate user_events into user_profiles for segmentation. Usage: python -m… |
| `scripts.audit_credentials`<br/><sub>backend/scripts/audit_credentials.py</sub> | 229 | `check_a_resolution`, `check_b_orphan_device_refs`, `check_c_unused_credentials`, `check_d_aws_hygiene`, `main`, `print_text_report` _+1 more_ | scripts/audit_credentials.py Hygiene audit for the ingestion credential system. Run before customer… |
| `scripts.backfill_grow_insights_profiles`<br/><sub>backend/scripts/backfill_grow_insights_profiles.py</sub> | 126 | `csv_set`, `main`, `matches_filters`, `parse_args` | Backfill / migrate Insights projection rows for Grow users (Phase 2). Provisions a linked public_us… |
| `scripts.backfill_incident_notifiability`<br/><sub>backend/scripts/backfill_incident_notifiability.py</sub> | 78 | `main` | Re-classify WorkSafe notifiability for existing incidents. Runs the authoritative Incident.determin… |
| `scripts.backfill_unsubscribe_tokens`<br/><sub>backend/scripts/backfill_unsubscribe_tokens.py</sub> | 20 | — | Backfill unsubscribe_token for existing public_users who don't have one. Run after the add_unsubscr… |
| `scripts.check_disease_data`<br/><sub>backend/scripts/check_disease_data.py</sub> | 156 | `check_table_structure`, `main`, `query_disease_pressure` | CLI script to query disease_pressure table for debugging. Usage: python scripts/check_disease_data.… |
| `scripts.check_schema`<br/><sub>backend/scripts/check_schema.py</sub> | 41 | `run_check` | — |
| `scripts.cleanup_blacklist`<br/><sub>backend/scripts/cleanup_blacklist.py</sub> | 27 | `main` | scripts/cleanup_blacklist.py Remove expired entries from the token blacklist table. Run daily via t… |
| `scripts.compute_completed_season`<br/><sub>backend/scripts/compute_completed_season.py</sub> | 51 | `main` | scripts/compute_completed_season.py Fold a completed growing season's extreme metrics (frost / hot … |
| `scripts.daily_aggregation`<br/><sub>backend/scripts/daily_aggregation.py</sub> | 249 | `aggregate_station_day`, `get_active_stations`, `main`, `process_date`, `run_daily_aggregation`, `upsert_daily_record` | scripts/daily_aggregation.py Aggregate raw weather_data into weather_data_daily table. Calculates d… |
| `scripts.disease_service_v2`<br/><sub>backend/scripts/disease_service_v2.py</sub> | 575 | `BotrytisModel`, `BotrytisResult`, `DownyMildewModel`, `DownyMildewResult`, `PMResult`, `UCDavisPMIndex` _+9 more_ | scripts/disease_service_v2.py Enhanced disease pressure calculation using peer-reviewed models. Use… |
| `scripts.generate_blocks_image`<br/><sub>backend/scripts/generate_blocks_image.py</sub> | 293 | `generate_image_matplotlib`, `generate_metadata`, `generate_variety_images`, `get_blocks_geojson`, `main` | scripts/generate_blocks_image.py Generate static PNG image overlay of all NZ vineyard blocks. This … |
| `scripts.harvest_csv_backfill`<br/><sub>backend/scripts/harvest_csv_backfill.py</sub> | 303 | `extract_station_and_variable`, `get_station_lookup`, `insert_batch`, `main`, `parse_timestamp`, `parse_value` _+2 more_ | scripts/harvest_csv_backfill.py Import historical weather data from Harvest Electronics CSV exports… |
| `scripts.hourly_aggregation`<br/><sub>backend/scripts/hourly_aggregation.py</sub> | 662 | `aggregate_to_zone`, `calculate_dew_point`, `check_available_variables`, `check_station_variables`, `determine_confidence`, `estimate_leaf_wetness` _+8 more_ | scripts/hourly_aggregation.py Aggregate weather station data to hourly zone-level climate. Includes… |
| `scripts.import_el_stage_images`<br/><sub>backend/scripts/import_el_stage_images.py</sub> | 143 | `detect_mime`, `ensure_dir`, `main`, `parse_el_key`, `upload_subdir` | Core-based importer to avoid ORM registry issues. - Scans --src-dir for el_*.jpg|jpeg|png|webp - Co… |
| `scripts.load_climate_zone_geometry`<br/><sub>backend/scripts/load_climate_zone_geometry.py</sub> | 103 | `load_shapefile`, `main` | scripts/load_climate_zone_geometry.py Load shapefile geometry into the climate_zones table. Expects… |
| `scripts.phenology_service`<br/><sub>backend/scripts/phenology_service.py</sub> | 305 | `determine_stage`, `estimate_date`, `get_average_daily_gdd`, `get_baseline_gdd`, `get_day_of_vintage`, `get_gdd_offset_at_day` _+6 more_ | scripts/phenology_service.py Calculate phenological stage estimates for each variety in each zone b… |
| `scripts.probe_credential_resolver`<br/><sub>backend/scripts/probe_credential_resolver.py</sub> | 113 | `list_active_refs`, `main`, `probe` | scripts/probe_credential_resolver.py Resolve a credential ref against the live DB + AWS / env, prin… |
| `scripts.run_daily_processing`<br/><sub>backend/scripts/run_daily_processing.py</sub> | 182 | `main`, `run_script` | scripts/run_daily_processing.py Run the complete daily processing pipeline: 1. Daily aggregation (w… |
| `scripts.seed_climate_zones`<br/><sub>backend/scripts/seed_climate_zones.py</sub> | 261 | `main`, `seed_climate_zones` | scripts/seed_climate_zones.py Seed the 20 climate zones with FK links to wine_regions. Usage: pytho… |
| `scripts.seed_el_simple`<br/><sub>backend/scripts/seed_el_simple.py</sub> | 96 | `main`, `seed_category` | Seed EL stages (and phases) into reference_items using raw SQL (no ORM imports). Usage: # uses DATA… |
| `scripts.seed_email_templates`<br/><sub>backend/scripts/seed_email_templates.py</sub> | 58 | `seed` | scripts/seed_email_templates.py Seed the email_templates table with the 3 campaign template types: … |
| `scripts.seed_gis`<br/><sub>backend/scripts/seed_gis.py</sub> | 338 | `calculate_bounds`, `ensure_multipolygon`, `esri_rings_to_geojson`, `find_parent_region`, `generate_slug`, `main` _+4 more_ | scripts/seed_gis.py Seed Geographical Indications (GIs) from ESRI JSON files. This script: 1. Reads… |
| `scripts.seed_pest_disease_catalogs`<br/><sub>backend/scripts/seed_pest_disease_catalogs.py</sub> | 168 | `main`, `prune_extras`, `seed_category` | Seed system (company_id=NULL) reference catalogs: - category='disease' - category='pest' Adds the e… |
| `scripts.seed_reference_el_stages`<br/><sub>backend/scripts/seed_reference_el_stages.py</sub> | 128 | `main`, `upsert_el_phases`, `upsert_el_stages` | Seed EL stages (and phases) into reference_items. Usage: # seed global/system items python scripts/… |
| `scripts.seed_regions`<br/><sub>backend/scripts/seed_regions.py</sub> | 517 | `build_varieties_list`, `calculate_bounds`, `fetch_linz_boundary`, `main`, `merge_geometries`, `seed_regions` | scripts/seed_regions.py Seed wine regions with: 1. Boundaries from Stats NZ Datafinder 2. Stats fro… |
| `scripts.seed_system_templates`<br/><sub>backend/scripts/seed_system_templates.py</sub> | 295 | `main`, `scope_fields`, `upsert_template` | Seed system (company_id=NULL) observation templates with field schemas that match the vineyard oper… |
| `scripts.synthesize_overview_climate`<br/><sub>backend/scripts/synthesize_overview_climate.py</sub> | 272 | `count_source_subzones`, `find_target_zones`, `main`, `preview_row_counts`, `synthesize_for_zone` | scripts/synthesize_overview_climate.py Synthesize climate_history_monthly, climate_projections, cli… |
| `scripts.test_db_config`<br/><sub>backend/scripts/test_db_config.py</sub> | 66 | `test_connection` | — |
| `scripts.upload_baseline`<br/><sub>backend/scripts/upload_baseline.py</sub> | 255 | `extract_zone_name_from_filename`, `get_zone_lookup`, `load_baseline_csv`, `main`, `parse_decimal`, `upload_baseline_climatology` _+1 more_ | scripts/upload_baseline.py Upload 1986-2005 daily climatology data into climate_zone_daily_baseline… |
| `scripts.upload_climate_extremes`<br/><sub>backend/scripts/upload_climate_extremes.py</sub> | 352 | `dec`, `iter_frost_files`, `iter_zone_files`, `load_frost`, `load_frost_baseline`, `load_projection_extremes` _+7 more_ | scripts/upload_climate_extremes.py Load the seasonal extreme datasets in backend/data/Regional_addi… |
| `scripts.upload_climate_history`<br/><sub>backend/scripts/upload_climate_history.py</sub> | 193 | `get_zone_name_from_filename`, `main`, `parse_decimal`, `upload_climate_history`, `upload_history_file` | scripts/upload_climate_history.py Upload monthly climate history from CSV files to climate_history_… |
| `scripts.upload_climate_projections`<br/><sub>backend/scripts/upload_climate_projections.py</sub> | 243 | `get_zone_name_from_filename`, `main`, `parse_decimal`, `upload_climate_projections`, `upload_projections_file` | scripts/upload_climate_projections.py Upload climate projections from CSV files to: - climate_basel… |
| `scripts.upload_phenology`<br/><sub>backend/scripts/upload_phenology.py</sub> | 175 | `load_phenology_csv`, `main`, `parse_decimal`, `upload_phenology_thresholds` | scripts/upload_phenology.py Upload phenology GDD thresholds from CSV into the phenology_thresholds … |
| `scripts.zone_aggregation`<br/><sub>backend/scripts/zone_aggregation.py</sub> | 283 | `aggregate_zone_day`, `get_previous_cumulative_gdd`, `get_vintage_year`, `get_zone_stations_with_data`, `get_zones_with_stations`, `main` _+3 more_ | scripts/zone_aggregation.py Aggregate station-level daily data (weather_data_daily) into zone-level… |

## Inbound dependencies

- [`api.v1`](api-v1.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`core.security`](core-security.md) — is imported by this package
- [`db`](db.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package
- [`services`](services.md) — is imported by this package
- [`utils`](utils.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **cloud** | `boto3`, `botocore` | `scripts.audit_credentials` |
| **config** | `dotenv`, `os.environ` | `scripts.audit_credentials`, `scripts.check_schema`, `scripts.import_el_stage_images`, `scripts.seed_el_simple` _+4 more_ |
| **db** | `geoalchemy2`, `sqlalchemy` | `scripts.aggregate_profiles`, `scripts.audit_credentials`, `scripts.check_disease_data`, `scripts.check_schema` _+23 more_ |
| **fs** | `csv`, `json file i/o`, `open()`, `pathlib`, `shutil` | `scripts.audit_credentials`, `scripts.check_disease_data`, `scripts.cleanup_blacklist`, `scripts.compute_completed_season` _+26 more_ |
| **http** | `requests` | `scripts.generate_blocks_image`, `scripts.seed_regions` |

## Dataflows

- `scripts` → **db** — executes SQL
- **db** → `scripts` — reads rows
- `scripts` → **db** — writes rows
- **http** → `scripts` — fetches
