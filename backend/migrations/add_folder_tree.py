"""add folder tree (categories, protocols, protocol_tests)

Revision ID: add_folder_tree
Revises: <SET_TO_YOUR_CURRENT_HEAD>
Create Date: 2026-06-11

Run `alembic heads` to find your current head revision and paste it into
`down_revision` below before running `alembic upgrade head`.
"""
from alembic import op
import sqlalchemy as sa

# --- revision identifiers ---------------------------------------------------
revision = "add_folder_tree"
down_revision = "<SET_TO_YOUR_CURRENT_HEAD>"  # <-- EDIT THIS
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )

    op.create_table(
        "protocols",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "category_id", sa.Integer,
            sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    op.create_index("idx_protocols_category", "protocols", ["category_id"])

    op.create_table(
        "protocol_tests",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "protocol_id", sa.Integer,
            sa.ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("work_package_name", sa.Text, nullable=False),
        sa.Column("element_cms_id", sa.Text, nullable=False),
        sa.Column("test_name", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.UniqueConstraint(
            "work_package_name", "element_cms_id", "test_name",
            name="uq_protocol_tests_triple",
        ),
    )
    op.create_index(
        "idx_protocol_tests_protocol", "protocol_tests", ["protocol_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_protocol_tests_protocol", "protocol_tests")
    op.drop_table("protocol_tests")
    op.drop_index("idx_protocols_category", "protocols")
    op.drop_table("protocols")
    op.drop_table("categories")