"""Generalize geographical_indications -> geographic designations (additive).

Phase 0b of DATA_INGESTION_PLATFORM_PLAN.md.

Rather than rename the table (which would need updatable-view complexity for
prod safety), we **extend** geographical_indications with the generalized
fields needed for multi-country designation systems. The table stays named
geographical_indications; existing prod code continues to read and write it
unchanged.

Adds:
  - designation_system VARCHAR  -- 'IPoNZ_GI' | 'EU_PDO' | 'AU_GI' | 'US_AVA' | 'AOC' | ...
  - country_id FK countries
  - parent_designation_id self-FK (for AOC/DOCG-style nesting)
  - designation_metadata JSONB   -- per-system metadata bag

Backfill: every existing row (NZ IPoNZ GIs) gets designation_system='IPoNZ_GI',
country_id=NZ, and a metadata blob built from the current IPoNZ columns
(ip_number, iponz_url, status, renewal_date, notes). Existing columns stay in
place — prod reads them through the original ORM model unaffected.

Prod safety:
  - All new columns nullable or have defaults.
  - No existing column dropped, renamed, or re-typed.
  - No new CHECK / FK that would reject current data.

Revision ID: add_designation_columns
Revises: rename_to_devices_timeseries
Create Date: 2026-04-20

NOTE: revision IDs must fit alembic_version VARCHAR(32). Hence the abbreviation.
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_designation_columns'
down_revision = 'rename_to_devices_timeseries'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Additive columns
    # ------------------------------------------------------------------
    op.add_column('geographical_indications',
        sa.Column('designation_system', sa.String(50), nullable=False,
                  server_default='IPoNZ_GI'))
    op.add_column('geographical_indications',
        sa.Column('country_id', sa.Integer(),
                  sa.ForeignKey('countries.id'), nullable=True))
    op.add_column('geographical_indications',
        sa.Column('parent_designation_id', sa.Integer(),
                  sa.ForeignKey('geographical_indications.id'), nullable=True))
    op.add_column('geographical_indications',
        sa.Column('designation_metadata',
                  sa.dialects.postgresql.JSONB(), nullable=True))

    op.create_index('ix_gi_designation_system', 'geographical_indications',
                    ['designation_system'])
    op.create_index('ix_gi_country', 'geographical_indications', ['country_id'])
    op.create_index('ix_gi_parent', 'geographical_indications',
                    ['parent_designation_id'])

    # ------------------------------------------------------------------
    # Backfill — existing NZ IPoNZ GIs
    # ------------------------------------------------------------------
    op.execute("""
        UPDATE geographical_indications
        SET country_id = (SELECT id FROM countries WHERE iso2='NZ')
        WHERE country_id IS NULL;
    """)
    op.execute("""
        UPDATE geographical_indications
        SET designation_metadata = jsonb_strip_nulls(jsonb_build_object(
            'ip_number',         ip_number,
            'iponz_url',         iponz_url,
            'status',            status,
            'registration_date', registration_date,
            'renewal_date',      renewal_date,
            'notes',             notes,
            'color',             color
        ))
        WHERE designation_metadata IS NULL;
    """)


def downgrade():
    op.drop_index('ix_gi_parent', table_name='geographical_indications')
    op.drop_index('ix_gi_country', table_name='geographical_indications')
    op.drop_index('ix_gi_designation_system',
                  table_name='geographical_indications')
    op.drop_column('geographical_indications', 'designation_metadata')
    op.drop_column('geographical_indications', 'parent_designation_id')
    op.drop_column('geographical_indications', 'country_id')
    op.drop_column('geographical_indications', 'designation_system')
