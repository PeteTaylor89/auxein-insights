# `ingestion.config`

9 modules, 2,044 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `ingestion/config`; 8 of its 9 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `ingestion.config`<br/><sub>ingestion/config/__init__.py</sub> | 0 | — | — |
| `ingestion.config.ecan_sites`<br/><sub>ingestion/config/ecan_sites.py</sub> | 57 | — | ECAN (Environment Canterbury) weather site configuration API Documentation: http://data.ecan.govt.n… |
| `ingestion.config.gdc_sites`<br/><sub>ingestion/config/gdc_sites.py</sub> | 83 | — | GDC (Gisborne District Council) weather site configuration API: http://hilltop.gdc.govt.nz/data.hts… |
| `ingestion.config.gw_sites`<br/><sub>ingestion/config/gw_sites.py</sub> | 61 | — | GW (Greater Wellington) weather site configuration API: https://hilltop.gw.govt.nz/Data.hts (Hillto… |
| `ingestion.config.harvest_stations`<br/><sub>ingestion/config/harvest_stations.py</sub> | 618 | — | Harvest Electronics weather station configuration TODO: Fill in your actual trace IDs and coordinat… |
| `ingestion.config.hbrc_sites`<br/><sub>ingestion/config/hbrc_sites.py</sub> | 147 | — | HBRC (Hawke's Bay Regional Council) weather site configuration API: https://data.hbrc.govt.nz/Envir… |
| `ingestion.config.mdc_sites`<br/><sub>ingestion/config/mdc_sites.py</sub> | 153 | — | MDC (Marlborough District Council) weather site configuration API: https://hydro.marlborough.govt.n… |
| `ingestion.config.synop_sites`<br/><sub>ingestion/config/synop_sites.py</sub> | 773 | — | WMO SYNOP station configuration (data_source = 'SYNOP_GTS'). Auto-generated 2026-06-17 from NOAA is… |
| `ingestion.config.tdc_sites`<br/><sub>ingestion/config/tdc_sites.py</sub> | 152 | — | TDC (Tasman District Council) weather site configuration API: http://envdata.tasman.govt.nz/data.ht… |

## Inbound dependencies

- [`ingestion`](ingestion.md) — imports this package
- [`ingestion.sources`](ingestion-sources.md) — imports this package

## Outbound dependencies

_None._

## Integration points owned

_None — this package is pure internal logic._
