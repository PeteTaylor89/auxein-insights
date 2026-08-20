"""Grow's one-off setup fee, and the first-year comparison it creates.

Revision ID: insights_pro_setup_fee
Revises: insights_pro_commerce
Create Date: 2026-08-20

Grow carries a NZ$250 + GST one-off setup fee in year one. Insights Pro carries
none, confirmed 2026-08-20.

WHY THIS NEEDED FOUR COLUMNS RATHER THAN ONE
The fee does not merely shift Grow's total, it moves the crossover — and it
moves it far enough that the two comparisons disagree over a band that most
New Zealand vineyards sit in:

    ongoing breakeven      7.06 ha   (600 / 85)
    first-year breakeven   4.12 ha   ((600 - 250) / 85)

Between 4.12 and 7.06 ha, Insights Pro is cheaper in year one while Grow is
cheaper every year after it. There is no single honest answer to "which is
cheaper" in that band, so the calculator shows both and this table records
both. Storing only one basis would silently pick a side, and it would be the
side that happened to be convenient.

`grow_annual_ex_gst` keeps its meaning — the RECURRING annual cost, setup
excluded — so rows written before this migration remain comparable with rows
written after it.
"""
from alembic import op
import sqlalchemy as sa

revision = 'insights_pro_setup_fee'
down_revision = 'insights_pro_commerce'
branch_labels = None
depends_on = None


def upgrade():
    # The fee in force when the quote was taken, alongside the rates already
    # stored for the same reason: a price change must not rewrite the meaning
    # of a historical row.
    op.add_column('insights_pricing_quote',
                  sa.Column('grow_setup_ex_gst', sa.Numeric(10, 2),
                            nullable=False, server_default='0'))
    op.add_column('insights_pricing_quote',
                  sa.Column('grow_first_year_ex_gst', sa.Numeric(12, 2),
                            nullable=False, server_default='0'))
    op.add_column('insights_pricing_quote',
                  sa.Column('cheaper_first_year', sa.String(8),
                            nullable=False, server_default='equal'))
    op.add_column('insights_pricing_quote',
                  sa.Column('difference_first_year_ex_gst', sa.Numeric(12, 2),
                            nullable=False, server_default='0'))
    op.create_check_constraint(
        'ck_pricing_quote_cheaper_yr1', 'insights_pricing_quote',
        "cheaper_first_year IN ('pro','grow','equal')")


def downgrade():
    op.drop_constraint('ck_pricing_quote_cheaper_yr1', 'insights_pricing_quote',
                       type_='check')
    op.drop_column('insights_pricing_quote', 'difference_first_year_ex_gst')
    op.drop_column('insights_pricing_quote', 'cheaper_first_year')
    op.drop_column('insights_pricing_quote', 'grow_first_year_ex_gst')
    op.drop_column('insights_pricing_quote', 'grow_setup_ex_gst')
