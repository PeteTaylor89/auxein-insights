# `scripts.data_import`

9 modules, 2,499 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/scripts/data_import`; 4 of its 9 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `scripts.data_import`<br/><sub>backend/scripts/data_import/__init__.py</sub> | 0 | — | — |
| `scripts.data_import.csv_analyser`<br/><sub>backend/scripts/data_import/csv_analyser.py</sub> | 160 | `CSVAnalyzer` | — |
| `scripts.data_import.import_climate_csvs`<br/><sub>backend/scripts/data_import/import_climate_csvs.py</sub> | 346 | `get_available_csvs`, `get_block_info`, `import_csv_file`, `main` | Standalone Climate Data Import Script Run from the backend directory: python scripts/data_import/cl… |
| `scripts.data_import.import_climate_csvs_optimized`<br/><sub>backend/scripts/data_import/import_climate_csvs_optimized.py</sub> | 609 | `BulkClimateImporter`, `get_available_csvs`, `main` | Optimized Bulk Climate Data Import Script Handles 8,744+ CSV files with >10GB of data efficiently K… |
| `scripts.data_import.import_climate_standalone`<br/><sub>backend/scripts/data_import/import_climate_standalone.py</sub> | 503 | `BulkClimateImporter`, `get_available_csvs`, `main` | Standalone Climate Data Import Script for EC2 Optimized for AWS RDS import with PostgreSQL COPY Usa… |
| `scripts.data_import.preserve_id_importer`<br/><sub>backend/scripts/data_import/preserve_id_importer.py</sub> | 261 | `PreserveIDShapefileImporter` | — |
| `scripts.data_import.setup_database`<br/><sub>backend/scripts/data_import/setup_database.py</sub> | 97 | `DatabaseSetup` | — |
| `scripts.data_import.shapefile_importer`<br/><sub>backend/scripts/data_import/shapefile_importer.py</sub> | 239 | `BasicShapefileImporter` | — |
| `scripts.data_import.validate_before_import`<br/><sub>backend/scripts/data_import/validate_before_import.py</sub> | 284 | `check_blocks_in_database`, `check_existing_data`, `check_table_structure`, `estimate_import_time`, `get_connection`, `main` _+2 more_ | Pre-flight validation script for climate data import Checks database connectivity, block existence,… |

## Inbound dependencies

_None._

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`db`](db.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **config** | `dotenv`, `os.environ` | `scripts.data_import.import_climate_standalone`, `scripts.data_import.preserve_id_importer`, `scripts.data_import.setup_database`, `scripts.data_import.shapefile_importer` _+1 more_ |
| **db** | `psycopg2`, `sqlalchemy` | `scripts.data_import.import_climate_csvs`, `scripts.data_import.import_climate_csvs_optimized`, `scripts.data_import.import_climate_standalone`, `scripts.data_import.preserve_id_importer` _+3 more_ |
| **fs** | `csv`, `io`, `json file i/o`, `open()`, `pathlib` | `scripts.data_import.csv_analyser`, `scripts.data_import.import_climate_csvs`, `scripts.data_import.import_climate_csvs_optimized`, `scripts.data_import.import_climate_standalone` _+3 more_ |
| **http** | `urllib` | `scripts.data_import.preserve_id_importer`, `scripts.data_import.shapefile_importer` |

## Dataflows

- `scripts.data_import` → **db** — executes SQL
- `scripts.data_import` → **db** — writes rows
