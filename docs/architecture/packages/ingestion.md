# `ingestion`

11 modules, 1,237 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `ingestion`; 11 of its 11 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `ingestion.db_connection`<br/><sub>ingestion/db_connection.py</sub> | 20 | `get_ingestion_engine`, `get_ingestion_session` | Database connection for ingestion service Reuses backend session/engine directly |
| `ingestion.run_ingestion`<br/><sub>ingestion/run_ingestion.py</sub> | 282 | `main` | Main ingestion script for weather data sources Run from GitHub Actions or locally |
| `ingestion.setup_ecan_stations`<br/><sub>ingestion/setup_ecan_stations.py</sub> | 63 | `setup_ecan_stations` | One-time script to create ECAN station records in database |
| `ingestion.setup_gdc_stations`<br/><sub>ingestion/setup_gdc_stations.py</sub> | 114 | `setup_gdc_stations` | One-time script to create GDC (Gisborne District Council) station records in database Usage: python… |
| `ingestion.setup_gw_stations`<br/><sub>ingestion/setup_gw_stations.py</sub> | 115 | `setup_gw_stations` | One-time script to create GW (Greater Wellington) station records in database Usage: python setup_g… |
| `ingestion.setup_harvest_stations`<br/><sub>ingestion/setup_harvest_stations.py</sub> | 111 | `setup_harvest_stations` | Setup script for Harvest Electronics weather stations. Checks config against the database and inser… |
| `ingestion.setup_hbrc_stations`<br/><sub>ingestion/setup_hbrc_stations.py</sub> | 112 | `setup_hbrc_stations` | One-time script to create HBRC station records in database Usage: python setup_hbrc_stations.py --d… |
| `ingestion.setup_mdc_stations`<br/><sub>ingestion/setup_mdc_stations.py</sub> | 113 | `setup_mdc_stations` | One-time script to create MDC station records in database Usage: python setup_mdc_stations.py --dry… |
| `ingestion.setup_synop_stations`<br/><sub>ingestion/setup_synop_stations.py</sub> | 133 | `setup_synop_stations` | One-time script to create SYNOP (WMO/Unidata) station records in the database. Phase B1 of NOAA_NCE… |
| `ingestion.setup_tdc_stations`<br/><sub>ingestion/setup_tdc_stations.py</sub> | 114 | `setup_tdc_stations` | One-time script to create TDC (Tasman District Council) station records in database Usage: python s… |
| `ingestion.test_harvest`<br/><sub>ingestion/test_harvest.py</sub> | 60 | `check_results`, `test_ingestion` | Test script for Harvest ingestion - local development |

## Inbound dependencies

- [`ingestion.sources`](ingestion-sources.md) — imports this package

## Outbound dependencies

- [`db`](db.md) — is imported by this package
- [`ingestion.config`](ingestion-config.md) — is imported by this package
- [`ingestion.sources`](ingestion-sources.md) — is imported by this package
- [`services`](services.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **config** | `dotenv` | `ingestion.test_harvest` |
| **db** | `sqlalchemy` | `ingestion.setup_ecan_stations`, `ingestion.setup_gdc_stations`, `ingestion.setup_gw_stations`, `ingestion.setup_harvest_stations` _+5 more_ |
| **fs** | `pathlib` | `ingestion.db_connection`, `ingestion.run_ingestion`, `ingestion.setup_ecan_stations`, `ingestion.setup_gdc_stations` _+7 more_ |

## Dataflows

- `ingestion` → **db** — executes SQL
- `ingestion` → **db** — writes rows
