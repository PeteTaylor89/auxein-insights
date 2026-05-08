"""Add s3_key column to files; make file_path nullable.

Background: `files.py` historically wrote uploads to local disk on the EB
instance via `UPLOAD_DIR`. EB instances are ephemeral, so every `eb deploy`
wiped uploads. This migration unblocks the S3 cutover:

  - New nullable `s3_key` column. Populated for new uploads (post-cutover).
  - `file_path` becomes nullable. Existing rows continue to read from local
    disk via this column (legacy fallback in `download_file`).
  - Reads prefer `s3_key` when present; otherwise fall back to `file_path`.

No data migration here. Existing local-disk rows are not migrated to S3 in
this revision (the "starting fresh" decision — historical files were already
lost in earlier deploys, and no script is needed).

Revision ID: add_files_s3_key
Revises: add_asset_calibration_spec
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_files_s3_key'
down_revision = 'add_asset_calibration_spec'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('files', sa.Column('s3_key', sa.String(500), nullable=True))
    op.create_index('ix_files_s3_key', 'files', ['s3_key'])
    op.alter_column('files', 'file_path', existing_type=sa.String(500), nullable=True)


def downgrade():
    op.alter_column('files', 'file_path', existing_type=sa.String(500), nullable=False)
    op.drop_index('ix_files_s3_key', table_name='files')
    op.drop_column('files', 's3_key')
