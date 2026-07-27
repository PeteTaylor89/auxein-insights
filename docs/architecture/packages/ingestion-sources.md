# `ingestion.sources`

10 modules, 3,297 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `ingestion/sources`; 8 of its 10 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `ingestion.sources`<br/><sub>ingestion/sources/__init__.py</sub> | 0 | — | — |
| `ingestion.sources.ecan`<br/><sub>ingestion/sources/ecan.py</sub> | 243 | `ECANIngestion` | ECAN (Environment Canterbury) weather data ingestion |
| `ingestion.sources.gdc`<br/><sub>ingestion/sources/gdc.py</sub> | 362 | `GDCIngestion` | GDC (Gisborne District Council) weather data ingestion API: Hilltop Server at http://hilltop.gdc.go… |
| `ingestion.sources.gw`<br/><sub>ingestion/sources/gw.py</sub> | 356 | `GWIngestion` | GW (Greater Wellington Regional Council) weather data ingestion API: Hilltop Server at https://hill… |
| `ingestion.sources.harvest`<br/><sub>ingestion/sources/harvest.py</sub> | 346 | `HarvestIngestion` | — |
| `ingestion.sources.hbrc`<br/><sub>ingestion/sources/hbrc.py</sub> | 398 | `HBRCIngestion` | HBRC (Hawke's Bay Regional Council) weather data ingestion API: Hilltop Server at https://data.hbrc… |
| `ingestion.sources.mdc`<br/><sub>ingestion/sources/mdc.py</sub> | 357 | `MDCIngestion` | MDC (Marlborough District Council) weather data ingestion API: Hilltop Server at https://hydro.marl… |
| `ingestion.sources.noaa`<br/><sub>ingestion/sources/noaa.py</sub> | 450 | `NoaaIngestion` | NOAA NCEI ingestion — authoritative daily + hourly backfill for SYNOP stations. Phase B3 of NOAA_NC… |
| `ingestion.sources.synop`<br/><sub>ingestion/sources/synop.py</sub> | 423 | `SynopIngestion`, `decode_synop` | Near-real-time SYNOP ingestion — PROVISIONAL live tier (Ogimet bootstrap). Phase B2 of NOAA_NCEI_IN… |
| `ingestion.sources.tdc`<br/><sub>ingestion/sources/tdc.py</sub> | 362 | `TDCIngestion` | TDC (Tasman District Council) weather data ingestion API: Hilltop Server at http://envdata.tasman.g… |

## Inbound dependencies

- [`ingestion`](ingestion.md) — imports this package

## Outbound dependencies

- [`ingestion`](ingestion.md) — is imported by this package
- [`ingestion.config`](ingestion-config.md) — is imported by this package
- [`services`](services.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **db** | `psycopg2`, `sqlalchemy` | `ingestion.sources.ecan`, `ingestion.sources.gdc`, `ingestion.sources.gw`, `ingestion.sources.harvest` _+5 more_ |
| **fs** | `csv`, `io`, `pathlib` | `ingestion.sources.ecan`, `ingestion.sources.gdc`, `ingestion.sources.gw`, `ingestion.sources.harvest` _+5 more_ |
| **http** | `requests`, `urllib` | `ingestion.sources.ecan`, `ingestion.sources.gdc`, `ingestion.sources.gw`, `ingestion.sources.harvest` _+5 more_ |

## Dataflows

- `ingestion.sources` → **db** — executes SQL
- `ingestion.sources` → **db** — writes rows
- **http** → `ingestion.sources` — fetches
