"""Site attendance — who is on a property, right now.

A third register alongside the visitor book and contractor movements, for the
people who actually work here. See db/models/site_attendance.py for why it is
not an extension of either.

## The partial unique index is the point

`uq_site_attendance_open` allows AT MOST ONE open attendance per person. Without
it a double-tap, a retry, or an offline replay leaves someone signed in twice
and the headcount is silently wrong — which is a number that only ever gets read
carefully during an evacuation. Making it a database constraint rather than a
code convention means the second sign-on fails loudly instead of succeeding
quietly.

It also encodes a real-world fact: a person cannot be on two properties at once.

No new user type is needed here — `users.user_type` is VARCHAR(20), not a
Postgres enum, so `general_user` needs no DDL.
"""
from alembic import op
import sqlalchemy as sa

revision = 'site_attendance'
down_revision = 'obs_spot_run_index'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'site_attendance',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('signed_in_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        # NULL means on site.
        sa.Column('signed_out_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sign_in_latitude', sa.Numeric(10, 7), nullable=True),
        sa.Column('sign_in_longitude', sa.Numeric(10, 7), nullable=True),
        sa.Column('sign_out_latitude', sa.Numeric(10, 7), nullable=True),
        sa.Column('sign_out_longitude', sa.Numeric(10, 7), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('signed_out_by_id', sa.Integer(), nullable=True),
        sa.Column('sign_out_reason', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['signed_out_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_site_attendance_id', 'site_attendance', ['id'])
    # Every FK gets an index. An unindexed FK turns a parent delete into a
    # sequential scan per deleted row, which is how deleting a block came to
    # scan 22 GB of climate data.
    op.create_index('ix_site_attendance_company_id', 'site_attendance', ['company_id'])
    op.create_index('ix_site_attendance_user_id', 'site_attendance', ['user_id'])
    op.create_index('ix_site_attendance_property_id', 'site_attendance', ['property_id'])
    # "Who is on site" is this query.
    op.create_index('ix_site_attendance_open', 'site_attendance',
                    ['company_id', 'signed_out_at'])
    op.create_index('ix_site_attendance_user_time', 'site_attendance',
                    ['user_id', 'signed_in_at'])
    # One open attendance per person, enforced by the database.
    op.execute(
        "CREATE UNIQUE INDEX uq_site_attendance_open "
        "ON site_attendance (user_id) WHERE signed_out_at IS NULL"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_site_attendance_open")
    op.drop_index('ix_site_attendance_user_time', table_name='site_attendance')
    op.drop_index('ix_site_attendance_open', table_name='site_attendance')
    op.drop_index('ix_site_attendance_property_id', table_name='site_attendance')
    op.drop_index('ix_site_attendance_user_id', table_name='site_attendance')
    op.drop_index('ix_site_attendance_company_id', table_name='site_attendance')
    op.drop_index('ix_site_attendance_id', table_name='site_attendance')
    op.drop_table('site_attendance')
