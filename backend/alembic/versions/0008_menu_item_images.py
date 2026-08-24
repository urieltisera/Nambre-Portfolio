"""menu item images

Revision ID: 0008_menu_item_images
Revises: 0007_business_plan_entitlements
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_menu_item_images"
down_revision: str | None = "0007_business_plan_entitlements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("menu_items", sa.Column("image_key", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("menu_items", "image_key")
