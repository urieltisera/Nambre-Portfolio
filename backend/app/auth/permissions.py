from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Membership, MembershipRole, User


def require_membership(
    db: Session,
    user: User,
    business_id: str,
    allowed_roles: set[MembershipRole] | None = None,
) -> Membership | None:
    if user.is_platform_admin:
        return None
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.business_id == business_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if allowed_roles is not None and membership.role not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return membership


def require_platform_admin(user: User) -> None:
    if not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
