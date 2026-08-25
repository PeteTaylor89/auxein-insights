"""A surface-derived stand-in for `climate_history_monthly`, same column shape.

Revision ID: history_surface_view
Revises: country_map_outline
Create Date: 2026-08-24

`docs/plans/INSIGHTS_REFINEMENTS_2026-08-24b.md` §6. The public climate-history
endpoints read `climate_history_monthly`, which stops at **2023**. The surfaces
run to **2026-07** and their zone roll-up now does too, so the explorer was
three seasons behind the data underneath it.

## Why a view rather than rewriting the endpoints

`/zones/{slug}/history` and `/zones/{slug}/seasons` between them filter, group
and sum over that table in about a hundred lines of ORM. Presenting the surface
roll-up in the SAME COLUMN SHAPE lets both keep their logic verbatim and swap
one model reference — which is also what makes "the same level of detail" a
checkable claim rather than an intention.

`climate_history_monthly` itself is untouched. `upload_climate_history.py` still
writes it and it stays the record of what the pre-surface pipeline produced,
until someone decides to retire it.

## The pivot

`climate_zone_surface_monthly` is LONG — one row per (zone, variable, statistic,
year, month). The old table is WIDE. Hence the `FILTER` aggregates.

| old column | surface source |
|---|---|
| `tmean_mean` | `temp_mean` / `mean` |
| `tmin_mean` | `temp_min` / `mean` |
| `tmax_mean` | `temp_max` / `mean` |
| `gdd_mean` | `temp_mean` / `gdd10` |
| `rain_mean` | `rainfall` / `sum` |
| `rx1day_mean` | `rainfall` / `max` |
| `frost_days_mean` | `temp_min` / `frost_days` |
| `solar_mean` | **NULL — the surfaces do not carry solar** |

Solar is the only loss and nothing renders it (grepped across the climate
components: zero references). It is NULL here rather than being carried over
from a stale table, because a 2023 value sitting in a 2026 row is worse than an
absent one.

## `sd` is DERIVED, and it is a different quantity from before

The old table's `*_sd` is the spatial standard deviation across the zone's model
grid. The surface roll-up does not store an sd — it stores `p10`/`p90` over
planted cells, which is the same *kind* of quantity measured differently.

The explorer draws error bands from `sd`, so it has to be given one. It is
estimated as **(p90 - p10) / 2.5631**, the normal-distribution relationship, and
that assumption is only fair for the roughly symmetric fields. For rainfall and
frost days — both skewed and bounded at zero — it understates the upper tail.

That is acceptable for a band and it is NOT acceptable silently, so `p10` and
`p90` are exposed as real columns alongside it. Anything that wants the honest
spread should read those and ignore `sd`.

## Grain check

The old table has one row per (zone, year, month). This view groups by exactly
that, so the grain is identical and the endpoints' `group_by` clauses stay
correct. `vintage_year` uses the Sep-Apr convention labelled by the ending year,
matching `climate_history_monthly.vintage_year`.
"""
from alembic import op


revision = 'history_surface_view'
down_revision = 'country_map_outline'
branch_labels = None
depends_on = None


# p90 - p10 spans 2.5631 standard deviations for a normal distribution.
SD_FROM_P10_P90 = 2.5631


VIEW_SQL = f"""
CREATE VIEW climate_history_monthly_surface AS
SELECT
    -- A synthetic but STABLE key. The ORM needs a primary key to map a row,
    -- and zone/year/month is already unique here.
    (m.zone_id::bigint * 1000000 + m.year::bigint * 100 + m.month) AS id,
    m.zone_id,
    make_date(m.year, m.month, 1)                       AS date,
    m.month,
    m.year,
    -- Sep-Apr, labelled by the year the season ENDS in. Same convention as
    -- climate_history_monthly.vintage_year.
    CASE WHEN m.month >= 9 THEN m.year + 1 ELSE m.year END AS vintage_year,

    avg(m.mean) FILTER (WHERE m.variable='temp_mean' AND m.statistic='mean')  AS tmean_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='temp_mean' AND m.statistic='mean')          AS tmean_sd,
    avg(m.mean) FILTER (WHERE m.variable='temp_min' AND m.statistic='mean')   AS tmin_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='temp_min' AND m.statistic='mean')           AS tmin_sd,
    avg(m.mean) FILTER (WHERE m.variable='temp_max' AND m.statistic='mean')   AS tmax_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='temp_max' AND m.statistic='mean')           AS tmax_sd,
    avg(m.mean) FILTER (WHERE m.variable='temp_mean' AND m.statistic='gdd10') AS gdd_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='temp_mean' AND m.statistic='gdd10')         AS gdd_sd,
    avg(m.mean) FILTER (WHERE m.variable='rainfall' AND m.statistic='sum')    AS rain_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='rainfall' AND m.statistic='sum')            AS rain_sd,
    avg(m.mean) FILTER (WHERE m.variable='rainfall' AND m.statistic='max')    AS rx1day_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='rainfall' AND m.statistic='max')            AS rx1day_sd,
    avg(m.mean) FILTER (WHERE m.variable='temp_min' AND m.statistic='frost_days')
                                                                              AS frost_days_mean,
    avg((m.p90 - m.p10) / {SD_FROM_P10_P90})
        FILTER (WHERE m.variable='temp_min' AND m.statistic='frost_days')     AS frost_days_sd,

    -- The surfaces do not carry solar radiation. NULL rather than a stale
    -- value from the table this replaces.
    NULL::double precision AS solar_mean,
    NULL::double precision AS solar_sd,

    -- The honest spatial spread, for anything that would rather not trust the
    -- normal assumption baked into the `sd` columns above.
    avg(m.p10) FILTER (WHERE m.variable='temp_mean' AND m.statistic='mean')   AS tmean_p10,
    avg(m.p90) FILTER (WHERE m.variable='temp_mean' AND m.statistic='mean')   AS tmean_p90,
    avg(m.p10) FILTER (WHERE m.variable='temp_mean' AND m.statistic='gdd10')  AS gdd_p10,
    avg(m.p90) FILTER (WHERE m.variable='temp_mean' AND m.statistic='gdd10')  AS gdd_p90,
    avg(m.p10) FILTER (WHERE m.variable='rainfall' AND m.statistic='sum')     AS rain_p10,
    avg(m.p90) FILTER (WHERE m.variable='rainfall' AND m.statistic='sum')     AS rain_p90
FROM climate_zone_surface_monthly m
GROUP BY m.zone_id, m.year, m.month
"""


def upgrade():
    op.execute(VIEW_SQL)


def downgrade():
    op.execute("DROP VIEW IF EXISTS climate_history_monthly_surface")
