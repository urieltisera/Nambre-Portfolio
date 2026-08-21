"""legal and security gate v1

Revision ID: 0002_legal_security_gate
Revises: 0001_initial
Create Date: 2026-08-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_legal_security_gate"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("memberships", recreate="auto") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.Enum("owner", "manager", name="membershiprole"),
            type_=sa.Enum("owner", "manager", "staff", name="membershiprole"),
            existing_nullable=False,
        )
    op.create_table(
        "legal_acceptances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=True),
        sa.Column(
            "document_type",
            sa.Enum(
                "terms",
                "privacy",
                "acceptable_use",
                "cookies_analytics",
                "ai_policy",
                name="legaldocumenttype",
            ),
            nullable=False,
        ),
        sa.Column("document_version", sa.String(length=64), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "acceptance_method",
            sa.Enum("ui_checkbox", "admin_recorded", "seeded", name="acceptancemethod"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_legal_acceptances_user_id"), "legal_acceptances", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_legal_acceptances_business_id"),
        "legal_acceptances",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_legal_acceptances_document_type"),
        "legal_acceptances",
        ["document_type"],
        unique=False,
    )
    op.create_index(
        "uq_legal_acceptance_global_version",
        "legal_acceptances",
        ["user_id", "document_type", "document_version"],
        unique=True,
        sqlite_where=sa.text("business_id IS NULL"),
        postgresql_where=sa.text("business_id IS NULL"),
    )
    op.create_index(
        "uq_legal_acceptance_business_version",
        "legal_acceptances",
        ["user_id", "business_id", "document_type", "document_version"],
        unique=True,
        sqlite_where=sa.text("business_id IS NOT NULL"),
        postgresql_where=sa.text("business_id IS NOT NULL"),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(length=120), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_sessions_user_id"), "user_sessions", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_user_sessions_expires_at"), "user_sessions", ["expires_at"], unique=False
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("business_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=120), nullable=True),
        sa.Column("target_id", sa.String(length=120), nullable=True),
        sa.Column("details_json", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_audit_events_actor_user_id"), "audit_events", ["actor_user_id"], unique=False
    )
    op.create_index(
        op.f("ix_audit_events_business_id"), "audit_events", ["business_id"], unique=False
    )
    op.create_index(
        op.f("ix_audit_events_event_type"), "audit_events", ["event_type"], unique=False
    )
    op.create_index(
        op.f("ix_audit_events_occurred_at"), "audit_events", ["occurred_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("uq_legal_acceptance_business_version", table_name="legal_acceptances")
    op.drop_index("uq_legal_acceptance_global_version", table_name="legal_acceptances")
    op.drop_table("audit_events")
    op.drop_table("user_sessions")
    op.drop_table("legal_acceptances")
    with op.batch_alter_table("memberships", recreate="auto") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.Enum("owner", "manager", "staff", name="membershiprole"),
            type_=sa.Enum("owner", "manager", name="membershiprole"),
            existing_nullable=False,
        )
