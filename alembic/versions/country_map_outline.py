"""A drawable land outline per country, so the home map is not New Zealand-shaped.

Revision ID: country_map_outline
Revises: surface_projection_run
Create Date: 2026-08-24

Phase 4b of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`: the landing
page gets a clickable region map, and it has to work for the second country
without a rewrite.

## Why a table rather than reading `nz_land` directly

`nz_land` is the LINZ 51153 coastline — 2,354 MultiPolygons, 9 MB, and its NAME
is the problem: an endpoint that reads it is an endpoint that only ever draws
New Zealand. Australia would need a second table and a branch, which is exactly
the shape this whole workstream is removing.

`country_outline` is one row per country holding a **pre-simplified, dissolved**
outline ready to draw. Australia becomes an INSERT, not a code change.

## Pre-simplified, and that is the point

Dissolving and simplifying 9 MB of coastline per request would be slow enough to
be felt on the landing page — the highest-traffic URL on the domain. It is done
once here.

Tolerance is **0.02 degrees**, about 2 km. At the size this renders — a hero
column perhaps 400 px wide for 1,500 km of country — one pixel is roughly 4 km,
so 2 km is already finer than the display can show. Measured: 1,489 vertices
across the 12 mainland parts, ~29 KB of GeoJSON, which becomes far less as
integer SVG path data.

Parts smaller than 0.0005 square degrees are dropped. That keeps the two main
islands, Stewart Island and the larger offshore islands, and discards ~2,340
rocks that cost vertices and render as sub-pixel specks. Waiheke survives, which
matters because it is a wine region in its own right.

## What this is NOT for

Drawing only. Nothing spatial should join against it — `nz_land` remains the
authority for "is this point on land", exactly as `climate_zones.geometry`
remains authoritative over `geometry_clipped`. The comment on that column
already makes the same distinction and for the same reason.
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = 'country_map_outline'
down_revision = 'surface_projection_run'
branch_labels = None
depends_on = None


# ~2 km. See the docstring: finer than the hero map can resolve.
SIMPLIFY_TOLERANCE = 0.02

# Square degrees. Drops ~2,340 rocks, keeps the islands anyone would name.
MIN_PART_AREA = 0.0005


def upgrade():
    op.create_table(
        'country_outline',
        sa.Column('country_id', sa.Integer(),
                  sa.ForeignKey('countries.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('geometry', Geometry('MULTIPOLYGON', srid=4326),
                  nullable=False),
        # Provenance, because a simplified outline is derived data and the next
        # person needs to know what it came from and how coarse it is.
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('simplify_tolerance', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()')),
    )

    conn = op.get_bind()
    nz = conn.execute(sa.text(
        "SELECT id FROM countries WHERE iso2 = 'NZ'")).scalar()

    # ST_Union dissolves the parts, ST_Multi guarantees the declared type even
    # if the union collapses to a single polygon, and the simplify runs LAST so
    # it is applied to the dissolved shape rather than to each part separately
    # (which would leave slivers where neighbouring parts no longer meet).
    conn.execute(sa.text("""
        INSERT INTO country_outline
              (country_id, geometry, source, simplify_tolerance)
        SELECT :cid,
               ST_Multi(ST_SimplifyPreserveTopology(ST_Union(geom), :tol)),
               'LINZ 51153 via nz_land, dissolved',
               :tol
          FROM nz_land
         WHERE ST_Area(geom) > :amin
    """), {"cid": nz, "tol": SIMPLIFY_TOLERANCE, "amin": MIN_PART_AREA})


def downgrade():
    op.drop_table('country_outline')
