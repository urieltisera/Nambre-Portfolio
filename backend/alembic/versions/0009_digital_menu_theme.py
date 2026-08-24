"""digital menu theme

Revision ID: 0009_digital_menu_theme
Revises: 0008_menu_item_images
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_digital_menu_theme"
down_revision: str | None = "0008_menu_item_images"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "digital_menus",
        sa.Column("accent_color", sa.String(length=7), nullable=False, server_default="#955F32"),
    )
    op.add_column(
        "digital_menus",
        sa.Column(
            "background_color",
            sa.String(length=7),
            nullable=False,
            server_default="#F6F0E8",
        ),
    )
    op.add_column(
        "digital_menus",
        sa.Column("surface_color", sa.String(length=7), nullable=False, server_default="#FFF7EE"),
    )
    op.add_column(
        "digital_menus",
        sa.Column("text_color", sa.String(length=7), nullable=False, server_default="#241711"),
    )
    op.add_column(
        "digital_menus",
        sa.Column(
            "muted_text_color",
            sa.String(length=7),
            nullable=False,
            server_default="#6F6258",
        ),
    )
    op.add_column(
        "digital_menus",
        sa.Column(
            "heading_font",
            sa.Enum("editorial", "modern", "classic", "rounded", name="headingfontkey"),
            nullable=False,
            server_default="editorial",
        ),
    )
    op.add_column(
        "digital_menus",
        sa.Column(
            "body_font",
            sa.Enum("clean", "humanist", "modern", name="bodyfontkey"),
            nullable=False,
            server_default="clean",
        ),
    )
    op.add_column(
        "digital_menus",
        sa.Column(
            "card_style",
            sa.Enum("square", "soft", "rounded", name="cardstylekey"),
            nullable=False,
            server_default="rounded",
        ),
    )


def downgrade() -> None:
    op.drop_column("digital_menus", "card_style")
    op.drop_column("digital_menus", "body_font")
    op.drop_column("digital_menus", "heading_font")
    op.drop_column("digital_menus", "muted_text_color")
    op.drop_column("digital_menus", "text_color")
    op.drop_column("digital_menus", "surface_color")
    op.drop_column("digital_menus", "background_color")
    op.drop_column("digital_menus", "accent_color")
