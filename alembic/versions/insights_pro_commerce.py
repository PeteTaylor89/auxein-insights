"""Pricing-calculator usage and Insights Pro enquiries.

Revision ID: insights_pro_commerce
Revises: zone_display_order
Create Date: 2026-08-20

Two tables, for the two things the /pro page now does beyond describing itself.

`insights_pricing_quote` records every calculation a visitor runs, so the
commercial question "does anyone use this, and at what scale of vineyard" has
an answer. Most people who run it will never sign in, so `public_user_id` is
NULLABLE and the row stands on its own without it.

`insights_pro_enquiry` is the lead list. It exists because the alternative was
a mailto, and a mailto is not a list — it is somebody's inbox. `status` makes
it workable rather than a write-only log.

BOTH FKs ARE `ON DELETE SET NULL`, DELIBERATELY. A user who deletes their
account should stop being identifiable, but the fact that a calculation
happened is not theirs to erase and deleting the row would quietly rewrite
history. Setting the FK null de-identifies without destroying the record.

NO IP ADDRESS IS STORED on either table. Abuse is handled by the in-process
rate limiter in the router, which needs the IP only for the length of the
request. Keeping it out of the schema means there is no personal data here to
leak beyond what a person typed into a form themselves.
"""
from alembic import op
import sqlalchemy as sa

revision = 'insights_pro_commerce'
down_revision = 'zone_display_order'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'insights_pricing_quote',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('public_user_id', sa.Integer,
                  sa.ForeignKey('public_users.id', ondelete='SET NULL'),
                  nullable=True),

        # What the visitor entered.
        sa.Column('hectares', sa.Numeric(10, 2), nullable=False),
        sa.Column('sites', sa.SmallInteger, nullable=False),

        # What the SERVER computed from them. Never what the client sent: a
        # posted total is a number a stranger chose, and this table is meant to
        # be evidence.
        sa.Column('pro_annual_ex_gst', sa.Numeric(12, 2), nullable=False),
        sa.Column('grow_annual_ex_gst', sa.Numeric(12, 2), nullable=False),
        sa.Column('cheaper', sa.String(8), nullable=False),
        sa.Column('difference_ex_gst', sa.Numeric(12, 2), nullable=False),

        # The rates in force when the quote was taken. Without these a price
        # change silently rewrites the meaning of every historical row.
        sa.Column('pro_rate_ex_gst', sa.Numeric(10, 2), nullable=False),
        sa.Column('grow_rate_ex_gst', sa.Numeric(10, 2), nullable=False),

        # Opaque per-visit key so repeat calculations by one anonymous visitor
        # can be collapsed. Not a cookie, not an identifier, not persisted
        # client-side beyond the tab.
        sa.Column('session_key', sa.String(64), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),

        sa.CheckConstraint("cheaper IN ('pro','grow','equal')",
                           name='ck_pricing_quote_cheaper'),
        sa.CheckConstraint('hectares >= 0', name='ck_pricing_quote_hectares'),
        sa.CheckConstraint('sites >= 0', name='ck_pricing_quote_sites'),
    )
    op.create_index('ix_pricing_quote_created', 'insights_pricing_quote',
                    [sa.text('created_at DESC')])
    op.create_index('ix_pricing_quote_user', 'insights_pricing_quote',
                    ['public_user_id'])

    op.create_table(
        'insights_pro_enquiry',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('public_user_id', sa.Integer,
                  sa.ForeignKey('public_users.id', ondelete='SET NULL'),
                  nullable=True),

        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('email', sa.String(254), nullable=False),
        sa.Column('phone', sa.String(40), nullable=True),
        sa.Column('business', sa.String(160), nullable=True),
        sa.Column('region', sa.String(120), nullable=True),
        sa.Column('hectares', sa.Numeric(10, 2), nullable=True),
        sa.Column('sites', sa.SmallInteger, nullable=True),
        sa.Column('message', sa.Text, nullable=True),

        # Where on the site the enquiry came from, so the /pro page's
        # contribution is separable from any later entry point.
        sa.Column('source', sa.String(32), nullable=False,
                  server_default='pro_page'),

        # Makes this a list somebody can work rather than a write-only log.
        sa.Column('status', sa.String(16), nullable=False,
                  server_default='new'),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),

        sa.CheckConstraint(
            "status IN ('new','contacted','converted','declined')",
            name='ck_pro_enquiry_status'),
    )
    op.create_index('ix_pro_enquiry_created', 'insights_pro_enquiry',
                    [sa.text('created_at DESC')])
    op.create_index('ix_pro_enquiry_status', 'insights_pro_enquiry', ['status'])


def downgrade():
    op.drop_index('ix_pro_enquiry_status', table_name='insights_pro_enquiry')
    op.drop_index('ix_pro_enquiry_created', table_name='insights_pro_enquiry')
    op.drop_table('insights_pro_enquiry')
    op.drop_index('ix_pricing_quote_user', table_name='insights_pricing_quote')
    op.drop_index('ix_pricing_quote_created', table_name='insights_pricing_quote')
    op.drop_table('insights_pricing_quote')
