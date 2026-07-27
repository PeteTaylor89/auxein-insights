# `ingestion.scripts`

2 modules, 271 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `ingestion/scripts`; 1 of its 2 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `ingestion.scripts.harvest_json_extractor`<br/><sub>ingestion/scripts/harvest_json_extractor.py</sub> | 27 | — | — |
| `ingestion.scripts.probe_hilltop`<br/><sub>ingestion/scripts/probe_hilltop.py</sub> | 244 | `build_ctx`, `cmd_probe`, `cmd_report`, `fetch_measurements`, `fetch_sites`, `get` _+3 more_ | Probe an NZ council Hilltop server and dump a station/measurement inventory. Written 2026-07-16 for… |

## Inbound dependencies

_None._

## Outbound dependencies

_None._

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **fs** | `json file i/o`, `open()` | `ingestion.scripts.harvest_json_extractor`, `ingestion.scripts.probe_hilltop` |
| **http** | `urllib` | `ingestion.scripts.probe_hilltop` |
