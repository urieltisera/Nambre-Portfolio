"""digital menu draft publish snapshots

Revision ID: 0010_digital_menu_draft_publish_snapshots
Revises: 0009_digital_menu_theme
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_digital_menu_draft_publish_snapshots"
down_revision: str | None = "0009_digital_menu_theme"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "digital_menus",
        sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "digital_menus",
        sa.Column("published_revision", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "digital_menus",
        sa.Column("published_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "digital_menus",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "digital_menu_published_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("digital_menu_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["digital_menu_id"], ["digital_menus.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "digital_menu_id",
            "version",
            name="uq_digital_menu_snapshot_version",
        ),
    )
    op.create_index(
        op.f("ix_digital_menu_published_snapshots_created_by_user_id"),
        "digital_menu_published_snapshots",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_digital_menu_published_snapshots_digital_menu_id"),
        "digital_menu_published_snapshots",
        ["digital_menu_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_digital_menu_published_snapshots_digital_menu_id"),
        table_name="digital_menu_published_snapshots",
    )
    op.drop_index(
        op.f("ix_digital_menu_published_snapshots_created_by_user_id"),
        table_name="digital_menu_published_snapshots",
    )
    op.drop_table("digital_menu_published_snapshots")
    op.drop_column("digital_menus", "published_at")
    op.drop_column("digital_menus", "published_version")
    op.drop_column("digital_menus", "published_revision")
    op.drop_column("digital_menus", "draft_revision")
