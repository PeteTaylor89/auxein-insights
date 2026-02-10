"""Add notifications table

Revision ID: add_notifications
Revises: add_hourly_climate
Create Date: 2026-02-10

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'add_notifications'
down_revision: str = 'add_hourly_climate'
branch_labels = None
depends_on = None


def upgrade():
    # Create notification type enum
    notification_type_enum = sa.Enum(
        'task', 'incident', 'action', 'training', 'visitor', 'timesheet', 'system',
        name='notificationtype'
    )
    notification_type_enum.create(op.get_bind(), checkfirst=True)

    # Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('contractor_id', sa.Integer(), nullable=True),
        sa.Column('type', notification_type_enum, nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contractor_id'], ['contractors.id'], ondelete='CASCADE'),
        sa.CheckConstraint(
            "(user_id IS NOT NULL AND contractor_id IS NULL) OR "
            "(user_id IS NULL AND contractor_id IS NOT NULL)",
            name='ck_notification_single_recipient'
        ),
    )

    # Create indexes
    op.create_index('ix_notifications_id', 'notifications', ['id'])
    op.create_index('ix_notifications_company_id', 'notifications', ['company_id'])
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_contractor_id', 'notifications', ['contractor_id'])
    op.create_index('ix_notifications_type', 'notifications', ['type'])
    op.create_index('ix_notifications_read', 'notifications', ['read'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])

    # Composite indexes for common query patterns
    op.create_index(
        'ix_notification_user_unread',
        'notifications',
        ['company_id', 'user_id', 'read', 'created_at']
    )
    op.create_index(
        'ix_notification_contractor_unread',
        'notifications',
        ['company_id', 'contractor_id', 'read', 'created_at']
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_notification_contractor_unread', table_name='notifications')
    op.drop_index('ix_notification_user_unread', table_name='notifications')
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_index('ix_notifications_read', table_name='notifications')
    op.drop_index('ix_notifications_type', table_name='notifications')
    op.drop_index('ix_notifications_contractor_id', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_index('ix_notifications_company_id', table_name='notifications')
    op.drop_index('ix_notifications_id', table_name='notifications')

    # Drop table
    op.drop_table('notifications')

    # Drop enum type
    sa.Enum(name='notificationtype').drop(op.get_bind(), checkfirst=True)
