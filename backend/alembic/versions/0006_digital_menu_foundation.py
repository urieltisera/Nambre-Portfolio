"""digital menu foundation

Revision ID: 0006_digital_menu_foundation
Revises: 0005_qr_destination
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_digital_menu_foundation"
down_revision: str | None = "0005_qr_destination"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "digital_menus",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="digitalmenustatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("template_key", sa.String(length=64), nullable=False, server_default="modern"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", name="uq_digital_menu_business"),
    )
    op.create_index(
        op.f("ix_digital_menus_business_id"), "digital_menus", ["business_id"], unique=False
    )
    op.create_table(
        "menu_categories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("digital_menu_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["digital_menu_id"], ["digital_menus.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_menu_categories_digital_menu_id"),
        "menu_categories",
        ["digital_menu_id"],
        unique=False,
    )
    op.create_index(
        "ix_menu_categories_menu_position",
        "menu_categories",
        ["digital_menu_id", "position"],
        unique=False,
    )
    op.create_table(
        "menu_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("category_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price >= 0", name="ck_menu_items_price_non_negative"),
        sa.ForeignKeyConstraint(["category_id"], ["menu_categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_menu_items_category_id"), "menu_items", ["category_id"], unique=False)
    op.create_index(
        "ix_menu_items_category_position",
        "menu_items",
        ["category_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_menu_items_category_position", table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_category_id"), table_name="menu_items")
    op.drop_table("menu_items")
    op.drop_index("ix_menu_categories_menu_position", table_name="menu_categories")
    op.drop_index(op.f("ix_menu_categories_digital_menu_id"), table_name="menu_categories")
    op.drop_table("menu_categories")
    op.drop_index(op.f("ix_digital_menus_business_id"), table_name="digital_menus")
    op.drop_table("digital_menus")
