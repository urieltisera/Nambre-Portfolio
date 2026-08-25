from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import (
    Business,
    BusinessPlanKey,
    BusinessStatus,
    DestinationType,
    DigitalMenu,
    DigitalMenuStatus,
    DynamicLink,
    Membership,
    MembershipRole,
    User,
)
from app.services.digital_menu_service import (
    create_business_digital_menu,
    set_digital_menu_as_business_destination,
)
from app.services.invitation_service import slugify_business_name
from app.services.user_admin_service import normalize_email, validate_password


class StagingBusinessProvisionError(ValueError):
    pass


@dataclass
class CreateStagingBusinessResult:
    user: User
    business: Business
    membership: Membership
    digital_menu: DigitalMenu
    dynamic_link: DynamicLink | None
    created_user: bool
    created_business: bool
    created_membership: bool
    created_digital_menu: bool
    promoted_membership_to_owner: bool


def create_staging_business(
    db: Session,
    *,
    email: str,
    password: str,
    business_name: str,
    reuse_existing: bool = False,
) -> CreateStagingBusinessResult:
    normalized_email = normalize_email(email)
    validated_password = validate_password(password)
    normalized_name = business_name.strip()
    if not normalized_name:
        raise StagingBusinessProvisionError("Business name is required.")

    slug = slugify_business_name(normalized_name)
    if not slug:
        raise StagingBusinessProvisionError("Business name is invalid.")

    created_user = False
    created_business = False
    created_membership = False
    created_digital_menu = False
    promoted_membership_to_owner = False

    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        user = User(
            email=normalized_email,
            password_hash=hash_password(validated_password),
            is_active=True,
        )
        db.add(user)
        db.flush()
        created_user = True
    elif not reuse_existing:
        raise StagingBusinessProvisionError(
            "User already exists. Re-run with --reuse-existing to reuse and reset it explicitly."
        )
    else:
        user.password_hash = hash_password(validated_password)
        user.is_active = True

    business = db.scalar(select(Business).where(Business.slug == slug))
    if business is None:
        business = Business(
            name=normalized_name,
            slug=slug,
            status=BusinessStatus.active,
            plan_key=BusinessPlanKey.premium,
            destination_type=DestinationType.digital_menu,
            external_url=None,
        )
        db.add(business)
        db.flush()
        created_business = True
    elif not reuse_existing:
        raise StagingBusinessProvisionError(
            "Business already exists. Re-run with --reuse-existing to reuse it explicitly."
        )
    else:
        business.name = normalized_name
        business.status = BusinessStatus.active
        business.plan_key = BusinessPlanKey.premium
        business.destination_type = DestinationType.digital_menu
        business.external_url = None

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.business_id == business.id,
        )
    )
    if membership is None:
        membership = Membership(
            user_id=user.id,
            business_id=business.id,
            role=MembershipRole.owner,
        )
        db.add(membership)
        db.flush()
        created_membership = True
    elif membership.role != MembershipRole.owner:
        if not reuse_existing:
            raise StagingBusinessProvisionError(
                "Existing membership is not owner. "
                "Re-run with --reuse-existing to promote it explicitly."
            )
        membership.role = MembershipRole.owner
        promoted_membership_to_owner = True

    digital_menu = db.scalar(select(DigitalMenu).where(DigitalMenu.business_id == business.id))
    if digital_menu is None:
        digital_menu = create_business_digital_menu(
            db,
            business,
            name=normalized_name,
            template_key="modern",
            theme=None,
            status_value=DigitalMenuStatus.draft,
            is_published=False,
        )
        created_digital_menu = True
    else:
        set_digital_menu_as_business_destination(db, business, digital_menu)

    db.flush()
    dynamic_link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    db.commit()
    db.refresh(user)
    db.refresh(business)
    db.refresh(membership)
    db.refresh(digital_menu)
    if dynamic_link is not None:
        db.refresh(dynamic_link)

    return CreateStagingBusinessResult(
        user=user,
        business=business,
        membership=membership,
        digital_menu=digital_menu,
        dynamic_link=dynamic_link,
        created_user=created_user,
        created_business=created_business,
        created_membership=created_membership,
        created_digital_menu=created_digital_menu,
        promoted_membership_to_owner=promoted_membership_to_owner,
    )
