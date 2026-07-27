# `utils`

8 modules, 1,056 lines. [← architecture overview](../README.md)

## Purpose

_Not declared — this package has no `__init__.py` docstring. It is the code under `backend/utils`; 1 of its 8 modules carry a docstring of their own, listed below._

## Modules

| Module | LOC | Public interface | Summary |
| --- | --- | --- | --- |
| `utils`<br/><sub>backend/utils/__init__.py</sub> | 0 | — | — |
| `utils.aws_secrets`<br/><sub>backend/utils/aws_secrets.py</sub> | 59 | `get_rds_credentials` | — |
| `utils.el_scale`<br/><sub>backend/utils/el_scale.py</sub> | 387 | `get_el_stage_info`, `get_major_stages`, `get_next_stage`, `get_phases_for_dropdown`, `get_previous_stage`, `get_stages_by_phase` _+3 more_ | EL Scale (Eichhorn-Lorenz) reference data for grape phenology observations Based on the modified E-… |
| `utils.geometry`<br/><sub>backend/utils/geometry.py</sub> | 32 | `point_to_wkt`, `polygon_to_wkt` | — |
| `utils.geometry_helpers`<br/><sub>backend/utils/geometry_helpers.py</sub> | 125 | `calculate_row_length`, `create_row_geometry_from_endpoints`, `geojson_to_geometry`, `interpolate_row_positions`, `validate_linestring` | — |
| `utils.observation_helpers`<br/><sub>backend/utils/observation_helpers.py</sub> | 167 | `adjust_for_missing`, `basic_confidence_summary`, `berry_weight_from_100`, `budcount_summary`, `ci95`, `confidence_score` _+22 more_ | — |
| `utils.risk_permissions`<br/><sub>backend/utils/risk_permissions.py</sub> | 70 | `RiskPermissions` | — |
| `utils.seo_prerender`<br/><sub>backend/utils/seo_prerender.py</sub> | 216 | `delete_prerendered`, `prerender_article`, `prerender_research`, `regenerate_sitemap` | — |

## Inbound dependencies

- [`api.v1`](api-v1.md) — imports this package
- [`core`](core.md) — imports this package
- [`scripts`](scripts.md) — imports this package
- [`services`](services.md) — imports this package

## Outbound dependencies

- [`core`](core.md) — is imported by this package
- [`db`](db.md) — is imported by this package
- [`db.models`](db-models.md) — is imported by this package

## Integration points owned

| Category | Libraries / targets | Modules |
| --- | --- | --- |
| **cloud** | `boto3`, `botocore` | `utils.aws_secrets`, `utils.seo_prerender` |
| **config** | `os.environ` | `utils.aws_secrets` |
| **db** | `geoalchemy2`, `sqlalchemy` | `utils.geometry_helpers`, `utils.seo_prerender` |

## Dataflows

- **db** → `utils` — reads rows
