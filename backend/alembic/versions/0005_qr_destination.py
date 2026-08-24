"""qr destination settings

Revision ID: 0005_qr_destination
Revises: 0004_client_invites
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_qr_destination"
down_revision: str | None = "0004_client_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column(
            "destination_type",
            sa.Enum(
                "menu_pdf",
                "digital_menu",
                "promo",
                "external_url",
                "landing_page",
                name="destinationtype",
                create_type=False,
            ),
            nullable=False,
            server_default="menu_pdf",
        ),
    )
    op.add_column(
        "businesses",
        sa.Column("external_url", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("businesses", "external_url")
    op.drop_column("businesses", "destination_type")
