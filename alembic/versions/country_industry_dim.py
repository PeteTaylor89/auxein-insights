"""Country + industry dimension: the site stops assuming New Zealand wine.

Revision ID: country_industry_dim
Revises: insights_site_daily
Create Date: 2026-08-24

Phase 1 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`. Additive only —
every existing query returns exactly what it returned before, because every new
column is backfilled to the value that was previously implicit.

## Why now, and not when Australia has data

`countries` already exists and is already well shaped (hemisphere,
vintage_start_month, default_timezone, is_active) — the ingestion platform's
Phase 0.2 built it, and `country_id` is already on climate_zones, wine_regions,
weather_stations, data_sources and geographical_indications.

Two things were left behind, and both are far cheaper to fix while New Zealand
is the only occupant:

  1. `surface_run` has no country key at all, and its two uniqueness indexes are
     (variable, granularity, [statistic,] valid_at, resolution_m,
     model_version). An Australian temp_min for 2026-08-24 would therefore
     COLLIDE with the New Zealand one rather than sit beside it. Retrofitting a
     key into a live archive of published rasters is a different and much worse
     job than adding one to an archive that only holds one country.

  2. There is no industry concept anywhere in the database. The industry list
     lives in a hardcoded array in IndustryChips.jsx, and everything else infers
     it from table NAMES (`wine_regions`). That is fine for a wine-only product
     and breaks the moment a second industry is real.

## Industry is a column on the zone, not a join table

A kiwifruit "Bay of Plenty" is not the same polygon as a wine "Bay of Plenty" —
the zones are block-intersected against the industry's own plantings. So a
second industry means new `climate_zones` ROWS with their own geometry, and
`industry_id` is a plain FK on the zone. A join table would model a sharing that
does not exist.

`wine_regions` gets `industry_id` too and KEEPS ITS NAME. Renaming an 11-row
table with several FK dependents buys nothing today and would touch the ORM, the
public API and the ordering migrations. Logged as debt, deliberately not done.

## surface_run.country_id is NOT NULL *with a server default*

The obvious shape is NOT NULL with no default, which would be stricter. It is
also how you break a running pipeline: `index_surfaces.py` and `stage_publish.py`
insert into this table and know nothing about a country column, and a migration
that redefines a table out from under its writer is precisely what took
production down on 2026-08-20.

So the column defaults to New Zealand. Existing writers keep working and their
rows land correctly. The default is a transitional guard: drop it when a second
country's archive exists and every writer names its country explicitly.

## season_start_month

`countries.vintage_start_month` is the VINTAGE-YEAR boundary (July for NZ).
`SEASON_START_MONTH = 9` in insights_dashboard.py and insights_site_baseline.py
is the GROWING-SEASON start (1 September). They are different quantities and
conflating them silently shifts every seasonal total, so the growing season gets
its own column rather than being read off the vintage one.

Known limitation, stated rather than hidden: this sits on `countries`, so it is
correct only while every active industry in a country shares a season start.
Kiwifruit does not start in September. When a second industry activates, this
column moves to a (country, industry) grain. It is not read by anything yet —
the services keep their constant until a Northern Hemisphere country exists,
because Australia is Southern Hemisphere and needs no change.

## Australia is seeded INACTIVE

`is_active = false`, so the country switcher will not offer it. It exists so
that the Australian ingest work has a `country_id` to attach to on day one
rather than needing a migration first.
"""
from alembic import op
import sqlalchemy as sa


revision = 'country_industry_dim'
down_revision = 'insights_site_daily'
branch_labels = None
depends_on = None


# Mirrors the hardcoded INDUSTRIES array in
# packages/insights/src/components/home/IndustryChips.jsx, which this table
# replaces. `key` is the URL segment (/nz/wine/marlborough), `icon` names a
# lucide-react export so the frontend keeps rendering the same glyphs without a
# second source of truth.
INDUSTRIES = [
    # (key, name, icon, is_active, display_order)
    ('wine',      'Wine',      'Grape',  True,  100),
    ('kiwifruit', 'Kiwifruit', 'Leaf',   False, 200),
    ('apples',    'Apples',    'Apple',  False, 300),
    ('cherries',  'Cherries',  'Cherry', False, 400),
    ('hops',      'Hops',      'Sprout', False, 500),
]

# 1 September — see the docstring. This is the growing season, NOT the vintage
# year boundary that `vintage_start_month` already holds.
NZ_SEASON_START_MONTH = 9


def upgrade():
    conn = op.get_bind()

    # ---------------------------------------------------------------- industries
    op.create_table(
        'industries',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('key', sa.String(30), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('icon', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),
        sa.Column('display_order', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()')),
    )
    op.create_index('ix_industries_key', 'industries', ['key'])

    for key, name, icon, is_active, order in INDUSTRIES:
        conn.execute(sa.text("""
            INSERT INTO industries (key, name, icon, is_active, display_order)
            VALUES (:key, :name, :icon, :is_active, :order)
        """), {'key': key, 'name': name, 'icon': icon,
               'is_active': is_active, 'order': order})

    wine_id = conn.execute(
        sa.text("SELECT id FROM industries WHERE key = 'wine'")
    ).scalar_one()

    # ------------------------------------------------- industry on zones/regions
    # Nullable first, backfilled, then NOT NULL — every existing row is wine by
    # definition, since wine is all this platform has ever held.
    op.add_column('climate_zones',
                  sa.Column('industry_id', sa.Integer(), nullable=True))
    op.add_column('wine_regions',
                  sa.Column('industry_id', sa.Integer(), nullable=True))

    conn.execute(sa.text("UPDATE climate_zones SET industry_id = :i"),
                 {'i': wine_id})
    conn.execute(sa.text("UPDATE wine_regions SET industry_id = :i"),
                 {'i': wine_id})

    op.alter_column('climate_zones', 'industry_id', nullable=False,
                    server_default=str(wine_id))
    op.alter_column('wine_regions', 'industry_id', nullable=False,
                    server_default=str(wine_id))

    op.create_foreign_key('fk_climate_zones_industry', 'climate_zones',
                          'industries', ['industry_id'], ['id'])
    op.create_foreign_key('fk_wine_regions_industry', 'wine_regions',
                          'industries', ['industry_id'], ['id'])

    op.create_index('ix_climate_zones_industry', 'climate_zones',
                    ['industry_id'])

    # ------------------------------------------------------------- countries
    op.add_column('countries', sa.Column(
        'season_start_month', sa.Integer(), nullable=False,
        server_default=str(NZ_SEASON_START_MONTH)))
    op.create_check_constraint(
        'ck_countries_season_month', 'countries',
        'season_start_month BETWEEN 1 AND 12')

    # Australia — Southern Hemisphere, so the vintage and season conventions are
    # identical to New Zealand's and nothing downstream needs a special case.
    # Australia/Adelaide is the wine-weighted choice among its five timezones;
    # see the plan's trap 5.4, `default_timezone` being a per-country scalar is
    # a known modelling gap that does not block the dimension.
    conn.execute(sa.text("""
        INSERT INTO countries (iso2, iso3, name, hemisphere, vintage_start_month,
                               season_start_month, default_timezone, is_active,
                               display_order)
        VALUES ('AU', 'AUS', 'Australia', 'S', 7, 9, 'Australia/Adelaide',
                false, 200)
        ON CONFLICT (iso2) DO NOTHING
    """))
    conn.execute(sa.text(
        "UPDATE countries SET display_order = 100 WHERE iso2 = 'NZ'"))

    # ----------------------------------------------------------- surface_run
    nz_id = conn.execute(
        sa.text("SELECT id FROM countries WHERE iso2 = 'NZ'")
    ).scalar_one()

    op.add_column('surface_run',
                  sa.Column('country_id', sa.Integer(), nullable=True))
    conn.execute(sa.text("UPDATE surface_run SET country_id = :c"),
                 {'c': nz_id})
    op.alter_column('surface_run', 'country_id', nullable=False,
                    server_default=str(nz_id))
    op.create_foreign_key('fk_surface_run_country', 'surface_run',
                          'countries', ['country_id'], ['id'])

    # The uniqueness indexes MUST carry the country or an Australian raster for
    # the same variable and date is a duplicate of the New Zealand one rather
    # than a distinct object. Rebuilt rather than added to, because a partial
    # unique index cannot be extended in place.
    op.drop_index('uq_surface_run_timestep', table_name='surface_run')
    op.drop_index('uq_surface_run_aggregate', table_name='surface_run')
    op.create_index(
        'uq_surface_run_timestep', 'surface_run',
        ['country_id', 'variable', 'granularity', 'valid_at', 'resolution_m',
         'model_version'],
        unique=True, postgresql_where=sa.text('statistic IS NULL'))
    op.create_index(
        'uq_surface_run_aggregate', 'surface_run',
        ['country_id', 'variable', 'granularity', 'statistic', 'valid_at',
         'resolution_m', 'model_version'],
        unique=True, postgresql_where=sa.text('statistic IS NOT NULL'))


def downgrade():
    op.drop_index('uq_surface_run_aggregate', table_name='surface_run')
    op.drop_index('uq_surface_run_timestep', table_name='surface_run')
    op.create_index(
        'uq_surface_run_timestep', 'surface_run',
        ['variable', 'granularity', 'valid_at', 'resolution_m', 'model_version'],
        unique=True, postgresql_where=sa.text('statistic IS NULL'))
    op.create_index(
        'uq_surface_run_aggregate', 'surface_run',
        ['variable', 'granularity', 'statistic', 'valid_at', 'resolution_m',
         'model_version'],
        unique=True, postgresql_where=sa.text('statistic IS NOT NULL'))

    op.drop_constraint('fk_surface_run_country', 'surface_run',
                       type_='foreignkey')
    op.drop_column('surface_run', 'country_id')

    op.execute("DELETE FROM countries WHERE iso2 = 'AU'")
    op.drop_constraint('ck_countries_season_month', 'countries',
                       type_='check')
    op.drop_column('countries', 'season_start_month')

    op.drop_index('ix_climate_zones_industry', table_name='climate_zones')
    op.drop_constraint('fk_wine_regions_industry', 'wine_regions',
                       type_='foreignkey')
    op.drop_constraint('fk_climate_zones_industry', 'climate_zones',
                       type_='foreignkey')
    op.drop_column('wine_regions', 'industry_id')
    op.drop_column('climate_zones', 'industry_id')

    op.drop_index('ix_industries_key', table_name='industries')
    op.drop_table('industries')
