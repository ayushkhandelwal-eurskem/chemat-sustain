"""add display_name to protocol_tests

Revision ID: add_test_display_name
Revises: add_protocol_files
Create Date: 2026-06-11

The (work_package_name, element_cms_id, test_name) triple stays frozen because
it is the key used to fetch data from /tests/listings. display_name is a
separate, freely-renameable label shown in the UI. Render display_name ?? test_name.
"""
from alembic import op
import sqlalchemy as sa

revision = "add_test_display_name"
down_revision = "add_protocol_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "protocol_tests", sa.Column("display_name", sa.Text, nullable=True)
    )


def downgrade() -> None:
    op.drop_column("protocol_tests", "display_name")