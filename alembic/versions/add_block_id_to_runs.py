from alembic import op
import sqlalchemy as sa

revision = "add_block_id_to_runs"
down_revision = "eee_reference_item_files"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("observation_runs", sa.Column("block_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_observation_runs_block",
        "observation_runs", "vineyard_blocks",
        ["block_id"], ["id"], ondelete="CASCADE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_observation_runs_company_block_active "
        "ON observation_runs (company_id, block_id) "
    )

def downgrade():
    op.drop_constraint("fk_observation_runs_block", "observation_runs", type_="foreignkey")
    op.drop_column("observation_runs", "block_id")
