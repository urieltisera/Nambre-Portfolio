"""separate business identity logos

Revision ID: 0011_business_identity_logos
Revises: 0010_digital_menu_draft_publish_snapshots
Create Date: 2026-08-28
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_business_identity_logos"
down_revision = "0010_digital_menu_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("menu_logo_url", sa.String(length=500), nullable=True))
    op.add_column("businesses", sa.Column("qr_logo_url", sa.String(length=500), nullable=True))
    op.add_column(
        "businesses",
        sa.Column("use_menu_logo_for_qr", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("update businesses set menu_logo_url = logo_url where logo_url is not null")
    op.alter_column("businesses", "use_menu_logo_for_qr", server_default=None)


def downgrade() -> None:
    op.drop_column("businesses", "use_menu_logo_for_qr")
    op.drop_column("businesses", "qr_logo_url")
    op.drop_column("businesses", "menu_logo_url")
