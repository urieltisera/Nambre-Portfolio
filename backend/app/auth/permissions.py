from enum import StrEnum

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Business, BusinessStatus, Membership, MembershipRole, User


class BusinessPermission(StrEnum):
    view_business = "view_business"
    edit_business = "edit_business"
    manage_logo = "manage_logo"
    manage_menu = "manage_menu"
    rollback_menu = "rollback_menu"
    view_qr = "view_qr"
    manage_qr = "manage_qr"
    view_analytics = "view_analytics"


_ROLE_PERMISSIONS: dict[MembershipRole, set[BusinessPermission]] = {
    MembershipRole.owner: set(BusinessPermission),
    MembershipRole.manager: {
        BusinessPermission.view_business,
        BusinessPermission.manage_menu,
        BusinessPermission.view_qr,
        BusinessPermission.manage_qr,
        BusinessPermission.view_analytics,
    },
    MembershipRole.staff: {
        BusinessPermission.view_business,
        BusinessPermission.view_qr,
        BusinessPermission.view_analytics,
    },
}

_MUTATING_PERMISSIONS = {
    BusinessPermission.edit_business,
    BusinessPermission.manage_logo,
    BusinessPermission.manage_menu,
    BusinessPermission.rollback_menu,
    BusinessPermission.manage_qr,
}


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


def require_business_permission(
    db: Session,
    user: User,
    business_id: str,
    permission: BusinessPermission,
) -> Membership | None:
    membership = require_membership(db, user, business_id)
    if user.is_platform_admin:
        return membership
    if membership is None or permission not in _ROLE_PERMISSIONS[membership.role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if permission in _MUTATING_PERMISSIONS:
        require_operable_business(db, user, business_id)
    return membership


def require_platform_admin(user: User) -> None:
    if not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_operable_business(db: Session, user: User, business_id: str) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    if business.status == BusinessStatus.suspended and not user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business is suspended",
        )
    return business
