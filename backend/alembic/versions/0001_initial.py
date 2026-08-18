"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "businesses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column(
            "status", sa.Enum("demo", "active", "suspended", name="businessstatus"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_businesses_slug"), "businesses", ["slug"], unique=True)
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_platform_admin", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "dynamic_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("public_code", sa.String(length=64), nullable=False),
        sa.Column(
            "destination_type",
            sa.Enum(
                "menu_pdf",
                "digital_menu",
                "promo",
                "external_url",
                "landing_page",
                name="destinationtype",
            ),
            nullable=False,
        ),
        sa.Column("destination_id", sa.String(length=36), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dynamic_links_business_id"), "dynamic_links", ["business_id"], unique=False
    )
    op.create_index(
        op.f("ix_dynamic_links_public_code"), "dynamic_links", ["public_code"], unique=True
    )
    op.create_table(
        "memberships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.Enum("owner", "manager", name="membershiprole"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "business_id", name="uq_membership_user_business"),
    )
    op.create_table(
        "menu_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("active", "archived", name="menuassetstatus"), nullable=False),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "version", name="uq_menu_asset_version"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(
        op.f("ix_menu_assets_business_id"), "menu_assets", ["business_id"], unique=False
    )
    op.create_index(op.f("ix_menu_assets_status"), "menu_assets", ["status"], unique=False)
    op.create_table(
        "qr_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("dynamic_link_id", sa.String(length=36), nullable=False),
        sa.Column(
            "qr_type", sa.Enum("standard", "branded", "artistic", name="qrtype"), nullable=False
        ),
        sa.Column("status", sa.Enum("draft", "approved", name="qrstatus"), nullable=False),
        sa.Column("asset_url", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dynamic_link_id"], ["dynamic_links.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_qr_codes_business_id"), "qr_codes", ["business_id"], unique=False)
    op.create_table(
        "scan_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dynamic_link_id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent_category", sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dynamic_link_id"], ["dynamic_links.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_scan_events_business_id"), "scan_events", ["business_id"], unique=False
    )
    op.create_index(op.f("ix_scan_events_scanned_at"), "scan_events", ["scanned_at"], unique=False)


def downgrade() -> None:
    op.drop_table("scan_events")
    op.drop_table("qr_codes")
    op.drop_table("menu_assets")
    op.drop_table("memberships")
    op.drop_table("dynamic_links")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_businesses_slug"), table_name="businesses")
    op.drop_table("businesses")
