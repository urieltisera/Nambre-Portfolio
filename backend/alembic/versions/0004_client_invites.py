"""client invitation onboarding

Revision ID: 0004_client_invites
Revises: 0003_access_session_gate
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_client_invites"
down_revision: str | None = "0003_access_session_gate"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invitation_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_invitation_tokens_user_id"),
        "invitation_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_invitation_tokens_business_id"),
        "invitation_tokens",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_invitation_tokens_token_hash"),
        "invitation_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_invitation_tokens_expires_at"),
        "invitation_tokens",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invitation_tokens_expires_at"), table_name="invitation_tokens")
    op.drop_index(op.f("ix_invitation_tokens_token_hash"), table_name="invitation_tokens")
    op.drop_index(op.f("ix_invitation_tokens_business_id"), table_name="invitation_tokens")
    op.drop_index(op.f("ix_invitation_tokens_user_id"), table_name="invitation_tokens")
    op.drop_table("invitation_tokens")
