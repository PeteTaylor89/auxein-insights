"""Give map POIs a type vocabulary, so companies can add their own.

`map_features.feature_type` was already a plain VARCHAR — the model says so in
as many words, "adding a type should be a code change, not a migration plus an
ALTER TYPE". What it lacked was somewhere a type could EXIST before a feature
used it: the picker had nothing to offer, the legend had nothing to name, and a
rename would have meant rewriting every row.

So this adds the vocabulary table and seeds the original five as system rows
(company_id NULL). No data migration is needed — `feature_type` keeps holding
the slug, and every existing feature keeps matching.

The unique story needs two objects, not one. `UNIQUE (company_id, slug)` does
not constrain the system rows at all, because Postgres treats NULLs as distinct
and would happily accept two system 'water' types. The partial unique index on
slug WHERE company_id IS NULL closes that.

Revision ID: add_map_feature_types
Revises: zone_label_point
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_map_feature_types'
down_revision = 'zone_label_point'
branch_labels = None
depends_on = None


# Mirrors SYSTEM_FEATURE_TYPES in db/models/map_feature_type.py, which mirrors
# MAP_FEATURE_TYPES in maps-v2/components/mapFeatureTypes.js. Three copies is
# two too many, but the migration cannot import either without pinning this
# revision to today's model.
SYSTEM_TYPES = [
    ("access",         "Access",         "poiAccess",         "#0369a1"),
    ("infrastructure", "Infrastructure", "poiInfrastructure", "#6b7280"),
    ("water",          "Water",          "poiWater",          "#0891b2"),
    ("amenity",        "Amenity",        "poiAmenity",        "#7c3aed"),
    ("note",           "Note",           "poiNote",           "#2F2F2F"),
]


def upgrade():
    op.create_table(
        'map_feature_types',
        sa.Column('id', sa.Integer, primary_key=True),
        # NULL = system type, visible to every company.
        sa.Column('company_id', sa.Integer, sa.ForeignKey('companies.id'), nullable=True),
        sa.Column('slug', sa.String(40), nullable=False),
        sa.Column('label', sa.String(60), nullable=False),
        # An ICON_DEFS key, not a path — the icons are canvas-drawn geometry.
        sa.Column('icon', sa.String(40), nullable=False),
        sa.Column('colour', sa.String(7), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_by_id', sa.Integer, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, server_default=sa.text('now()')),
        sa.UniqueConstraint('company_id', 'slug', name='uq_map_feature_type_company_slug'),
    )
    op.create_index('ix_map_feature_types_company_id', 'map_feature_types', ['company_id'])
    op.create_index('ix_map_feature_types_slug', 'map_feature_types', ['slug'])
    op.create_index(
        'ix_map_feature_type_company_active',
        'map_feature_types',
        ['company_id', 'is_active'],
    )
    # The system rows are NOT covered by the UNIQUE above — NULL company_id is
    # distinct from NULL company_id in Postgres, so two system 'water' types
    # would both insert. This is what actually keeps the shared vocabulary
    # single-valued.
    op.create_index(
        'uq_map_feature_type_system_slug',
        'map_feature_types',
        ['slug'],
        unique=True,
        postgresql_where=sa.text('company_id IS NULL'),
    )

    types_table = sa.table(
        'map_feature_types',
        sa.column('company_id', sa.Integer),
        sa.column('slug', sa.String),
        sa.column('label', sa.String),
        sa.column('icon', sa.String),
        sa.column('colour', sa.String),
        sa.column('is_active', sa.Boolean),
    )
    op.bulk_insert(types_table, [
        {
            'company_id': None,
            'slug': slug,
            'label': label,
            'icon': icon,
            'colour': colour,
            'is_active': True,
        }
        for slug, label, icon, colour in SYSTEM_TYPES
    ])


def downgrade():
    # Features keep their feature_type strings; only the vocabulary goes. A
    # company type in use becomes an unresolvable slug, which the client already
    # falls back to a default icon for.
    op.drop_index('uq_map_feature_type_system_slug', table_name='map_feature_types')
    op.drop_index('ix_map_feature_type_company_active', table_name='map_feature_types')
    op.drop_index('ix_map_feature_types_slug', table_name='map_feature_types')
    op.drop_index('ix_map_feature_types_company_id', table_name='map_feature_types')
    op.drop_table('map_feature_types')
