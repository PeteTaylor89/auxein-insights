"""vineyard_blocks.geometry: record the SRID and GiST index prod already has; fix the one invalid block

Revision ID: vineyard_blocks_srid
Revises: grow_pipeline
Create Date: 2026-09-23

Groundwork for per-block satellite statistics (Phase 1 of the satellite
indices plan). Everything here is **already true in production** except the
geometry repair - the migration exists so every other environment matches it
and so the code stops describing a column that isn't there.

## The model and the history disagree with prod

`848feb1504bd` relaxed the column to a bare `GEOMETRY` with no SRID, and the ORM
still declares `Geometry('GEOMETRY')`. But on RDS (checked 2026-09-23) the column
is `geometry(Geometry,4326)`, and `idx_vineyard_blocks_geometry` (GiST) exists
though no migration creates it. All 8,798 rows are 4326 Polygons.

Both steps are therefore conditional: the typmod is applied only when the column
lacks it, and the index is `IF NOT EXISTS`. On prod both are no-ops.

## Why the typmod matters: queries were not using the index

Most block queries wrap the column - `ST_SetSRID(b.geometry, 4326)` - because
the model said the SRID was unknown. A function around the column prevents the
GiST index being used, so a point-in-zone join over the register ran for minutes.
With the SRID declared, query the column directly.

## The repair

One register block (id 3656 at the time of writing, 11.7 ha, Lower Wairau) has
a ring self-intersection. `ST_MakeValid` + polygon extraction fixes it in place;
`area` is left alone because the repair moves a sliver, not the block. The
repair is not reversed on downgrade - an invalid polygon is not a state worth
restoring.
"""
from alembic import op


revision = "vineyard_blocks_srid"
down_revision = "grow_pipeline"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        DECLARE bad integer;
        BEGIN
            IF (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
                WHERE attrelid = 'vineyard_blocks'::regclass AND attname = 'geometry')
               <> 'geometry(Geometry,4326)' THEN
                SELECT count(*) INTO bad FROM vineyard_blocks
                WHERE geometry IS NOT NULL AND ST_SRID(geometry) NOT IN (0, 4326);
                IF bad > 0 THEN
                    RAISE EXCEPTION 'vineyard_blocks has % rows in an SRID other than 4326; '
                                    'reproject them before this migration', bad;
                END IF;
                ALTER TABLE vineyard_blocks
                    ALTER COLUMN geometry TYPE geometry(Geometry, 4326)
                    USING ST_SetSRID(geometry, 4326);
            END IF;
        END $$;
    """)
    # A repair can return a MultiPolygon of one part; keep single parts as Polygon
    # so PUT /blocks/{id}/geometry (Polygon only) can still round-trip them.
    op.execute("""
        UPDATE vineyard_blocks b
        SET geometry = CASE WHEN ST_NumGeometries(f.fixed) = 1
                            THEN ST_GeometryN(f.fixed, 1) ELSE f.fixed END
        FROM (SELECT id, ST_CollectionExtract(ST_MakeValid(geometry), 3) AS fixed
              FROM vineyard_blocks
              WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)) f
        WHERE b.id = f.id AND NOT ST_IsEmpty(f.fixed)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_vineyard_blocks_geometry "
               "ON vineyard_blocks USING gist (geometry)")


def downgrade():
    # Deliberately a no-op. The index and SRID predate this migration in prod, so
    # dropping them would make a downgrade *remove* production state, and the
    # geometry repair is not worth reversing.
    pass
