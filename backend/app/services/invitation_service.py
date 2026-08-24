import hashlib
import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.config import get_settings
from app.models import (
    AcceptanceMethod,
    Business,
    BusinessStatus,
    InvitationToken,
    LegalAcceptance,
    Membership,
    MembershipRole,
    User,
)
from app.services.auth_service import revoke_user_sessions
from app.services.legal_service import accept_legal_documents
from app.services.user_admin_service import normalize_email, validate_password


class InvitationError(ValueError):
    pass


class InvitationTokenError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class InvitationIssueResult:
    business: Business
    invitation: InvitationToken
    token: str
    user: User


@dataclass
class InvitationAcceptResult:
    acceptances: list[LegalAcceptance]
    business: Business
    user: User


def hash_invitation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def slugify_business_name(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower().strip()).strip("-")
    return slug


def issue_invitation(
    db: Session,
    *,
    business_name: str,
    email: str,
) -> InvitationIssueResult:
    normalized_name = business_name.strip()
    if not normalized_name:
        raise InvitationError("Business name is required")

    slug = slugify_business_name(normalized_name)
    if not slug:
        raise InvitationError("Business name is invalid")

    normalized_email = normalize_email(email)
    existing_business = db.scalar(select(Business).where(Business.slug == slug))
    if existing_business is not None:
        raise InvitationError("Business already exists")

    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is not None and user.is_active:
        raise InvitationError("User email already exists with an active account")

    pending_invitation = None
    if user is not None:
        pending_invitation = db.scalar(
            select(InvitationToken)
            .where(
                InvitationToken.user_id == user.id,
                InvitationToken.consumed_at.is_(None),
                InvitationToken.expires_at > datetime.now(UTC),
            )
            .order_by(InvitationToken.created_at.desc())
        )
    if pending_invitation is not None:
        raise InvitationError("There is already a pending invitation for this email")

    business = Business(name=normalized_name, slug=slug, status=BusinessStatus.active)
    db.add(business)
    db.flush()

    if user is None:
        user = User(
            email=normalized_email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_active=False,
        )
        db.add(user)
        db.flush()

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.business_id == business.id,
        )
    )
    if membership is not None:
        raise InvitationError("User already belongs to this business")

    db.add(Membership(user_id=user.id, business_id=business.id, role=MembershipRole.owner))
    token = secrets.token_urlsafe(32)
    invitation = InvitationToken(
        user_id=user.id,
        business_id=business.id,
        token_hash=hash_invitation_token(token),
        expires_at=datetime.now(UTC) + timedelta(hours=get_settings().invitation_token_hours),
    )
    db.add(invitation)
    db.flush()
    return InvitationIssueResult(business=business, invitation=invitation, token=token, user=user)


def accept_invitation(
    db: Session,
    *,
    token: str,
    new_password: str,
) -> InvitationAcceptResult:
    now = datetime.now(UTC)
    invitation = db.scalar(
        select(InvitationToken).where(InvitationToken.token_hash == hash_invitation_token(token))
    )
    if invitation is None:
        raise InvitationTokenError("invalid")

    expires_at = (
        invitation.expires_at.replace(tzinfo=UTC)
        if invitation.expires_at.tzinfo is None
        else invitation.expires_at
    )
    if invitation.consumed_at is not None:
        raise InvitationTokenError("used")
    if expires_at <= now:
        raise InvitationTokenError("expired")

    user = db.get(User, invitation.user_id)
    business = db.get(Business, invitation.business_id)
    if user is None or business is None:
        invitation.consumed_at = now
        raise InvitationTokenError("invalid")
    if user.is_active:
        invitation.consumed_at = now
        raise InvitationTokenError("used")

    validated_password = validate_password(new_password)
    user.password_hash = hash_password(validated_password)
    user.is_active = True
    invitation.consumed_at = now
    acceptances = accept_legal_documents(
        db,
        user=user,
        acceptance_method=AcceptanceMethod.ui_checkbox,
    )
    revoke_user_sessions(db, user.id, "invitation_accepted")
    return InvitationAcceptResult(acceptances=acceptances, business=business, user=user)
