"""add protocol file columns

Revision ID: add_protocol_files
Revises: add_folder_tree
Create Date: 2026-06-11

Stores a reference to an attached SOP file (PDF / Word). `file_path` holds a
local filesystem path now; when you migrate to IONOS Object Storage it will
hold the S3 object key instead -- same column, no further migration needed.
"""
from alembic import op
import sqlalchemy as sa

# --- revision identifiers ---------------------------------------------------
revision = "add_protocol_files"
down_revision = "add_folder_tree"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("protocols", sa.Column("file_path", sa.Text, nullable=True))
    op.add_column("protocols", sa.Column("file_name", sa.Text, nullable=True))
    op.add_column("protocols", sa.Column("file_mime", sa.Text, nullable=True))
    op.add_column("protocols", sa.Column("file_size", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("protocols", "file_size")
    op.drop_column("protocols", "file_mime")
    op.drop_column("protocols", "file_name")
    op.drop_column("protocols", "file_path")