"""business plan entitlements

Revision ID: 0007_business_plan_entitlements
Revises: 0006_digital_menu_foundation
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_business_plan_entitlements"
down_revision: str | None = "0006_digital_menu_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column(
            "plan_key",
            sa.Enum("essential", "premium", name="businessplankey"),
            nullable=False,
            server_default="essential",
        ),
    )


def downgrade() -> None:
    op.drop_column("businesses", "plan_key")
