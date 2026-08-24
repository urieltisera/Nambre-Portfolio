from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from os import PathLike
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_audit_event
from app.auth.permissions import (
    BusinessPermission,
    require_business_permission,
    require_membership,
    require_operable_business,
    require_platform_admin,
)
from app.auth.security import (
    AuthContext,
    clear_session_cookie,
    create_access_token,
    create_user_session,
    get_current_auth,
    get_current_user,
    hash_password,
    set_session_cookie,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.legal import CURRENT_LEGAL_VERSIONS
from app.models import (
    AcceptanceMethod,
    Business,
    BusinessFeatureKey,
    BusinessStatus,
    DestinationType,
    DigitalMenu,
    DynamicLink,
    InvitationToken,
    LegalAcceptance,
    LegalDocumentType,
    Membership,
    MenuAsset,
    MenuCategory,
    MenuItem,
    QRCode,
    User,
)
from app.repositories.digital_menu_repository import get_business_menu_item
from app.schemas import (
    AdminInviteIn,
    AnalyticsSummaryOut,
    BusinessCreate,
    BusinessOut,
    BusinessPatch,
    ChangePasswordIn,
    DailyScanOut,
    DigitalMenuCreateIn,
    DigitalMenuOut,
    DigitalMenuPatchIn,
    DigitalMenuPreviewOut,
    DigitalMenuPublishOut,
    InvitationAcceptIn,
    InvitationCreateOut,
    LegalAcceptIn,
    LegalDocumentStatusOut,
    LegalStatusOut,
    LoginIn,
    MenuAssetOut,
    MenuCategoryCreateIn,
    MenuCategoryOut,
    MenuCategoryPatchIn,
    MenuItemCreateIn,
    MenuItemOut,
    MenuItemPatchIn,
    MenuStateOut,
    MessageOut,
    OwnerAssignIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    PublicDigitalMenuOut,
    PublicDigitalMenuPageOut,
    QRCodeOut,
    RollbackIn,
    TokenOut,
    UserOut,
)
from app.services.analytics_service import daily_series, record_scan, summary
from app.services.auth_service import (
    InvalidCurrentPasswordError,
    PasswordResetTokenError,
    change_password,
    issue_password_reset_token,
    reset_password,
)
from app.services.digital_menu_service import (
    build_draft_preview_payload,
    create_business_digital_menu,
    create_menu_category,
    create_menu_item,
    get_business_digital_menu,
    get_public_digital_menu_page_payload,
    get_public_digital_menu_payload,
    get_published_snapshot_image_key,
    list_menu_categories,
    list_menu_items,
    public_menu_response_from_snapshot,
    publish_digital_menu,
    remove_menu_category,
    remove_menu_item,
    sync_current_destination,
    unpublish_digital_menu,
    update_business_digital_menu,
    update_menu_category,
    update_menu_item,
)
from app.services.email_service import (
    EmailDeliveryError,
    outbound_email_enabled,
    password_reset_delivery_enabled,
    send_invitation_email,
    send_password_reset_email,
)
from app.services.entitlements import (
    business_has_feature,
    plan_includes_feature,
    require_business_feature,
)
from app.services.invitation_service import (
    InvitationError,
    InvitationTokenError,
    accept_invitation,
    hash_invitation_token,
    issue_invitation,
)
from app.services.legal_service import (
    accept_legal_documents,
    latest_legal_acceptances,
    pending_legal_documents,
)
from app.services.menu_item_image_service import (
    build_private_menu_item_image_url,
    delete_menu_item_image,
    upload_menu_item_image,
)
from app.services.menu_service import (
    get_active_menu,
    rollback_menu,
    upload_menu_pdf,
)
from app.services.qr_service import generate_qr_assets
from app.services.user_admin_service import AdminCreationError, normalize_email
from app.storage.local import LocalStorage

router = APIRouter()
_login_attempts: dict[str, deque[datetime]] = defaultdict(deque)
_password_reset_attempts: dict[str, deque[datetime]] = defaultdict(deque)
LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg"}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/login", response_model=TokenOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenOut:
    _check_login_rate(payload.email, request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        record_audit_event(
            db,
            event_type="auth.login_failed",
            target_type="user_email",
            target_id=payload.email.lower(),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    pending = pending_legal_documents(db, user)
    if pending:
        if not payload.accept_legal:
            legal_status = _legal_status_payload(db, user)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "legal_acceptance_required",
                    "legal_status": legal_status.model_dump(mode="json"),
                    "message": "Legal acceptance required",
                },
            )
        created = accept_legal_documents(
            db,
            user=user,
            acceptance_method=AcceptanceMethod.ui_checkbox,
        )
        _record_legal_acceptance_events(db, user.id, created)
    session = create_user_session(db, user)
    record_audit_event(db, event_type="auth.login_succeeded", actor_user_id=user.id)
    db.commit()
    access_token = create_access_token(user, session)
    set_session_cookie(response, access_token)
    return TokenOut(access_token=access_token)


@router.post("/auth/logout", status_code=204)
def logout(
    auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_db)
) -> Response:
    if auth.session is not None and auth.session.revoked_at is None:
        auth.session.revoked_at = datetime.now(UTC)
        auth.session.revoke_reason = "logout"
        record_audit_event(
            db,
            event_type="auth.logout",
            actor_user_id=auth.user.id,
            target_type="session",
            target_id=auth.session.id,
        )
        db.commit()
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


@router.post("/auth/change-password", response_model=TokenOut)
def authenticated_change_password(
    payload: ChangePasswordIn,
    response: Response,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> TokenOut:
    try:
        access_token = change_password(
            db,
            auth.user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except InvalidCurrentPasswordError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        ) from None
    except AdminCreationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    record_audit_event(
        db,
        event_type="auth.password_changed",
        actor_user_id=auth.user.id,
        target_type="user",
        target_id=auth.user.id,
    )
    db.commit()
    set_session_cookie(response, access_token)
    return TokenOut(access_token=access_token)


@router.post("/auth/password-reset/request", response_model=MessageOut, status_code=202)
def request_password_reset(
    payload: PasswordResetRequestIn, request: Request, db: Session = Depends(get_db)
) -> MessageOut:
    _check_password_reset_rate(payload.email, request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    response_message = (
        "Si existe una cuenta asociada, recibiras instrucciones para recuperar el acceso."
    )
    if user is None or not user.is_active:
        record_audit_event(
            db,
            event_type="auth.password_reset_requested",
            target_type="user_email",
            target_id=payload.email.lower(),
            details={"delivery": "skipped"},
        )
        db.commit()
        return MessageOut(message=response_message)

    token = issue_password_reset_token(db, user)
    delivery = "sent"
    if password_reset_delivery_enabled():
        try:
            send_password_reset_email(user.email, token)
        except EmailDeliveryError:
            delivery = "failed"
    else:
        delivery = "skipped_not_configured"
    record_audit_event(
        db,
        event_type="auth.password_reset_requested",
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        details={
            "delivery": delivery,
        },
    )
    db.commit()
    return MessageOut(message=response_message)


@router.post("/auth/password-reset/confirm", response_model=MessageOut)
def confirm_password_reset(
    payload: PasswordResetConfirmIn, db: Session = Depends(get_db)
) -> MessageOut:
    try:
        user_id = reset_password(db, token=payload.token, new_password=payload.new_password)
    except PasswordResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        ) from None
    except AdminCreationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    record_audit_event(
        db,
        event_type="auth.password_reset_completed",
        actor_user_id=user_id,
        target_type="user",
        target_id=user_id,
    )
    db.commit()
    return MessageOut(message="La contraseña fue actualizada.")


@router.post("/auth/invitations/accept", response_model=MessageOut)
def confirm_invitation(
    payload: InvitationAcceptIn, db: Session = Depends(get_db)
) -> MessageOut:
    if not payload.accept_legal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Legal acceptance is required",
        )
    try:
        result = accept_invitation(db, token=payload.token, new_password=payload.new_password)
    except InvitationTokenError as exc:
        invitation = db.scalar(
            select(InvitationToken).where(
                InvitationToken.token_hash == hash_invitation_token(payload.token)
            )
        )
        if invitation is not None:
            record_audit_event(
                db,
                event_type=(
                    "invitation.expired" if exc.reason == "expired" else "invitation.rejected"
                ),
                actor_user_id=invitation.user_id,
                business_id=invitation.business_id,
                target_type="invitation",
                target_id=invitation.id,
                details={"reason": exc.reason},
            )
            db.commit()
        detail = {
            "expired": "Invitation expired",
            "used": "Invitation already used",
            "invalid": "Invalid invitation token",
        }[exc.reason]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None
    except AdminCreationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _record_legal_acceptance_events(db, result.user.id, result.acceptances)
    record_audit_event(
        db,
        event_type="invitation.accepted",
        actor_user_id=result.user.id,
        business_id=result.business.id,
        target_type="invitation",
        target_id=result.user.id,
    )
    db.commit()
    return MessageOut(message="Tu cuenta fue activada.")


@router.get("/api/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> User:
    _enforce_legal_acceptance(db, user)
    return user


@router.get("/api/legal/status", response_model=LegalStatusOut)
def legal_status(
    business_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LegalStatusOut:
    if business_id is not None:
        require_membership(db, user, business_id)
    return _legal_status_payload(db, user, business_id)


@router.post("/api/legal/accept", response_model=LegalStatusOut)
def accept_legal(
    payload: LegalAcceptIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LegalStatusOut:
    if payload.business_id is not None:
        require_membership(db, user, payload.business_id)
    created = accept_legal_documents(
        db,
        user=user,
        acceptance_method=payload.acceptance_method,
        business_id=payload.business_id,
        document_types=payload.document_types,
    )
    _record_legal_acceptance_events(db, user.id, created)
    db.commit()
    return _legal_status_payload(db, user, payload.business_id)


@router.get("/api/me/businesses", response_model=list[BusinessOut])
def my_businesses(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Business]:
    _enforce_legal_acceptance(db, user)
    if user.is_platform_admin:
        return _list_all_businesses(db)
    return list(
        db.scalars(
            select(Business)
            .join(Membership, Membership.business_id == Business.id)
            .where(Membership.user_id == user.id)
            .order_by(Business.name)
        ).all()
    )


@router.get("/api/businesses/{business_id}", response_model=BusinessOut)
def get_business(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.patch("/api/businesses/{business_id}", response_model=BusinessOut)
def patch_business(
    business_id: str,
    payload: BusinessPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.edit_business)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    data = payload.model_dump(exclude_unset=True)
    if not user.is_platform_admin:
        if "plan_key" in data:
            raise HTTPException(status_code=403, detail="Forbidden")
        data.pop("status", None)
        if data:
            business = require_operable_business(db, user, business_id)
    data = _validated_business_patch(data)
    next_plan_key = data.get("plan_key", business.plan_key)
    if (
        data.get("destination_type") == DestinationType.digital_menu
        and not plan_includes_feature(next_plan_key, BusinessFeatureKey.digital_menu)
    ):
        raise HTTPException(status_code=403, detail="Feature not enabled: digital_menu")
    for key, value in data.items():
        setattr(business, key, value)
    sync_current_destination(db, business)
    business.updated_at = datetime.now(UTC)
    db.commit()
    return business


@router.post("/api/businesses/{business_id}/logo", response_model=BusinessOut)
async def upload_logo(
    business_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_logo)
    business = require_operable_business(db, user, business_id)
    suffix = LOGO_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(status_code=400, detail="Only PNG or JPEG logos are allowed")
    storage = LocalStorage()
    key = storage.logo_key(business_id, suffix)
    size = await storage.save_upload(file, key)
    if size == 0:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Logo file is empty")
    if size > 2 * 1024 * 1024:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Logo too large")
    try:
        with Image.open(storage.open(key)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image") from exc
    _delete_existing_logo_files(business_id, keep=storage.open(key))
    business.logo_url = f"/logos/{business.id}"
    business.updated_at = datetime.now(UTC)
    db.commit()
    return business


@router.get("/logos/{business_id}", response_model=None)
def public_logo(business_id: str, db: Session = Depends(get_db)) -> FileResponse:
    business = db.get(Business, business_id)
    if business is None or business.status == BusinessStatus.suspended:
        raise HTTPException(status_code=404, detail="Not found")
    root = Path(get_settings().storage_path) / "businesses" / business_id / "logo"
    for candidate in root.glob("logo.*"):
        if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            return FileResponse(candidate, headers={"Cache-Control": "no-store"})
    raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/businesses/{business_id}/menu", response_model=MenuStateOut)
def menu_state(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    versions = db.scalars(
        select(MenuAsset)
        .where(MenuAsset.business_id == business_id)
        .order_by(MenuAsset.version.desc())
    ).all()
    current = get_active_menu(db, business_id)
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    current_out = MenuAssetOut.model_validate(current) if current is not None else None
    versions_out = [MenuAssetOut.model_validate(asset) for asset in versions]
    return MenuStateOut(
        current=current_out,
        versions=versions_out,
        public_code=link.public_code if link else None,
    )


@router.get("/api/businesses/{business_id}/digital-menu", response_model=DigitalMenuOut)
def get_digital_menu(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DigitalMenu:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    return get_business_digital_menu(db, business_id)


@router.post("/api/businesses/{business_id}/digital-menu", response_model=DigitalMenuOut)
def create_digital_menu(
    business_id: str,
    payload: DigitalMenuCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DigitalMenu:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    menu = create_business_digital_menu(
        db,
        business,
        name=payload.name,
        template_key=payload.template_key,
        theme=payload.theme.model_dump(exclude_none=True) if payload.theme is not None else None,
        status_value=payload.status,
        is_published=payload.is_published,
    )
    record_audit_event(
        db,
        event_type="digital_menu.created",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="digital_menu",
        target_id=menu.id,
        details={"template_key": menu.template_key},
    )
    db.commit()
    return menu


@router.patch("/api/businesses/{business_id}/digital-menu/{menu_id}", response_model=DigitalMenuOut)
def patch_digital_menu(
    business_id: str,
    menu_id: str,
    payload: DigitalMenuPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DigitalMenu:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    menu = get_business_digital_menu(db, business_id, menu_id)
    data = payload.model_dump(exclude_unset=True)
    updated = update_business_digital_menu(
        db,
        business,
        menu,
        name=data.get("name"),
        template_key=data.get("template_key"),
        theme=data.get("theme"),
        status_value=data.get("status"),
        is_published=data.get("is_published"),
    )
    record_audit_event(
        db,
        event_type="digital_menu.updated",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="digital_menu",
        target_id=menu.id,
        details=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    return updated


@router.get(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/preview",
    response_model=DigitalMenuPreviewOut,
)
def preview_digital_menu(
    business_id: str,
    menu_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    menu = get_business_digital_menu(db, business_id, menu_id)
    return build_draft_preview_payload(db, business, menu)


@router.post(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/publish",
    response_model=DigitalMenuPublishOut,
)
def publish_business_digital_menu(
    business_id: str,
    menu_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    menu = get_business_digital_menu(db, business_id, menu_id)
    snapshot = publish_digital_menu(db, business=business, menu=menu, actor_user_id=user.id)
    record_audit_event(
        db,
        event_type="digital_menu.publish",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="digital_menu",
        target_id=menu.id,
        details={"published_at": snapshot.published_at.isoformat(), "version": snapshot.version},
    )
    db.commit()
    db.refresh(menu)
    return {"menu": menu, "published_at": snapshot.published_at, "version": snapshot.version}


@router.post(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/unpublish",
    response_model=DigitalMenuOut,
)
def unpublish_business_digital_menu(
    business_id: str,
    menu_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DigitalMenu:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    menu = get_business_digital_menu(db, business_id, menu_id)
    updated = unpublish_digital_menu(menu)
    record_audit_event(
        db,
        event_type="digital_menu.unpublish",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="digital_menu",
        target_id=menu.id,
        details={"published_version": menu.published_version},
    )
    db.commit()
    return updated


@router.get(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/categories",
    response_model=list[MenuCategoryOut],
)
def get_digital_menu_categories(
    business_id: str,
    menu_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MenuCategory]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    return list_menu_categories(db, business_id, menu_id)


@router.post(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/categories",
    response_model=MenuCategoryOut,
)
def post_digital_menu_category(
    business_id: str,
    menu_id: str,
    payload: MenuCategoryCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuCategory:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    category = create_menu_category(
        db,
        business_id=business_id,
        menu_id=menu_id,
        name=payload.name,
        description=payload.description,
        position=payload.position,
        is_visible=payload.is_visible,
    )
    record_audit_event(
        db,
        event_type="digital_menu.category_created",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_category",
        target_id=category.id,
        details={"menu_id": menu_id},
    )
    db.commit()
    return category


@router.patch(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/categories/{category_id}",
    response_model=MenuCategoryOut,
)
def patch_digital_menu_category(
    business_id: str,
    menu_id: str,
    category_id: str,
    payload: MenuCategoryPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuCategory:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    data = payload.model_dump(exclude_unset=True)
    category = update_menu_category(
        db,
        business_id=business_id,
        menu_id=menu_id,
        category_id=category_id,
        name=data.get("name"),
        description=data.get("description"),
        position=data.get("position"),
        is_visible=data.get("is_visible"),
    )
    record_audit_event(
        db,
        event_type="digital_menu.category_updated",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_category",
        target_id=category.id,
        details=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    return category


@router.delete("/api/businesses/{business_id}/digital-menu/{menu_id}/categories/{category_id}")
def delete_digital_menu_category(
    business_id: str,
    menu_id: str,
    category_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    remove_menu_category(db, business_id=business_id, menu_id=menu_id, category_id=category_id)
    record_audit_event(
        db,
        event_type="digital_menu.category_deleted",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_category",
        target_id=category_id,
        details={"menu_id": menu_id},
    )
    db.commit()
    return MessageOut(message="Category deleted")


@router.get(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/items",
    response_model=list[MenuItemOut],
)
def get_digital_menu_items(
    business_id: str,
    menu_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MenuItem]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    return list_menu_items(db, business_id, menu_id)


@router.post(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/categories/{category_id}/items",
    response_model=MenuItemOut,
)
def post_digital_menu_item(
    business_id: str,
    menu_id: str,
    category_id: str,
    payload: MenuItemCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuItem:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    item = create_menu_item(
        db,
        business_id=business_id,
        menu_id=menu_id,
        category_id=category_id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        currency=payload.currency,
        position=payload.position,
        is_visible=payload.is_visible,
        is_available=payload.is_available,
        is_featured=payload.is_featured,
    )
    record_audit_event(
        db,
        event_type="digital_menu.item_created",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_item",
        target_id=item.id,
        details={"menu_id": menu_id, "category_id": category_id},
    )
    db.commit()
    return item


@router.patch(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}",
    response_model=MenuItemOut,
)
def patch_digital_menu_item(
    business_id: str,
    menu_id: str,
    item_id: str,
    payload: MenuItemPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuItem:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    data = payload.model_dump(exclude_unset=True)
    item = update_menu_item(
        db,
        business_id=business_id,
        menu_id=menu_id,
        item_id=item_id,
        name=data.get("name"),
        description=data.get("description"),
        price=data.get("price"),
        currency=data.get("currency"),
        position=data.get("position"),
        is_visible=data.get("is_visible"),
        is_available=data.get("is_available"),
        is_featured=data.get("is_featured"),
    )
    record_audit_event(
        db,
        event_type="digital_menu.item_updated",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_item",
        target_id=item.id,
        details=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    return item


@router.post(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}/image",
    response_model=MenuItemOut,
)
async def post_digital_menu_item_image(
    business_id: str,
    menu_id: str,
    item_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuItem:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    item = await upload_menu_item_image(
        db,
        business_id=business_id,
        menu_id=menu_id,
        item_id=item_id,
        file=file,
    )
    record_audit_event(
        db,
        event_type="digital_menu.item_image_uploaded",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_item",
        target_id=item.id,
        details={"menu_id": menu_id},
    )
    db.commit()
    return item


@router.get("/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}/image")
def get_digital_menu_item_image(
    business_id: str,
    menu_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None or not item.image_key:
        raise HTTPException(status_code=404, detail="Product image not found")
    if item.image_url != build_private_menu_item_image_url(business_id, menu_id, item_id):
        item.image_url = build_private_menu_item_image_url(business_id, menu_id, item_id)
        db.commit()
    path = LocalStorage().open(item.image_key)
    return FileResponse(path, media_type="image/webp", headers=_dynamic_public_cache_headers())


@router.delete(
    "/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}/image",
    response_model=MenuItemOut,
)
def delete_digital_menu_item_image(
    business_id: str,
    menu_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuItem:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    item = delete_menu_item_image(
        db,
        business_id=business_id,
        menu_id=menu_id,
        item_id=item_id,
    )
    record_audit_event(
        db,
        event_type="digital_menu.item_image_deleted",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_item",
        target_id=item.id,
        details={"menu_id": menu_id},
    )
    db.commit()
    return item


@router.delete("/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}")
def delete_digital_menu_item(
    business_id: str,
    menu_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    business = require_operable_business(db, user, business_id)
    require_business_feature(business, BusinessFeatureKey.digital_menu)
    remove_menu_item(db, business_id=business_id, menu_id=menu_id, item_id=item_id)
    record_audit_event(
        db,
        event_type="digital_menu.item_deleted",
        actor_user_id=user.id,
        business_id=business_id,
        target_type="menu_item",
        target_id=item_id,
        details={"menu_id": menu_id},
    )
    db.commit()
    return MessageOut(message="Item deleted")


@router.post("/api/businesses/{business_id}/menu", response_model=MenuStateOut)
@router.post("/api/businesses/{business_id}/menu/replace", response_model=MenuStateOut)
async def replace_menu(
    business_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    await upload_menu_pdf(db, business_id, user, file)
    db.commit()
    return menu_state(business_id, db, user)


@router.post("/api/businesses/{business_id}/menu/rollback", response_model=MenuStateOut)
def rollback(
    business_id: str,
    payload: RollbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.rollback_menu)
    rollback_menu(db, business_id, payload.menu_asset_id)
    db.commit()
    return menu_state(business_id, db, user)


@router.get("/api/businesses/{business_id}/qr", response_model=list[QRCodeOut])
def list_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_qr)
    return list(db.scalars(select(QRCode).where(QRCode.business_id == business_id)).all())


@router.post("/api/businesses/{business_id}/qr/generate", response_model=list[QRCodeOut])
def generate_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_qr)
    created = generate_qr_assets(db, business_id)
    db.commit()
    return created


@router.get("/api/businesses/{business_id}/qr-assets/{filename}")
def download_qr(
    business_id: str,
    filename: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_qr)
    if filename not in {"standard.png", "standard.svg", "branded.png", "branded.svg"}:
        raise HTTPException(status_code=404, detail="QR not found")
    path = Path(get_settings().storage_path) / "qr" / business_id / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="QR not found")
    return FileResponse(path, headers=_dynamic_public_cache_headers())


@router.get("/api/businesses/{business_id}/analytics/summary", response_model=AnalyticsSummaryOut)
def analytics_summary(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, int | None]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_analytics)
    return summary(db, business_id)


@router.get("/api/businesses/{business_id}/analytics/scans", response_model=list[DailyScanOut])
def analytics_scans(
    business_id: str,
    period: str = "30d",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, str | int]]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_analytics)
    if period not in {"1d", "7d", "30d"}:
        raise HTTPException(status_code=400, detail="Unsupported period")
    return daily_series(db, business_id, period)


@router.get("/r/{public_code}", response_model=None)
def public_redirect(
    public_code: str, user_agent: str | None = Header(default=None), db: Session = Depends(get_db)
) -> RedirectResponse | PlainTextResponse:
    resolved = _resolve_public_redirect_target(db, public_code)
    if isinstance(resolved, PlainTextResponse):
        return resolved
    link, redirect_url = resolved
    record_scan(db, link.id, link.business_id, user_agent)
    db.commit()
    return RedirectResponse(
        url=redirect_url,
        status_code=302,
        headers=_dynamic_public_cache_headers(),
    )


@router.get("/m/{public_code}/digital-menu", response_model=PublicDigitalMenuOut)
def public_digital_menu(
    public_code: str, db: Session = Depends(get_db)
) -> PublicDigitalMenuOut | PlainTextResponse:
    payload_result = _get_public_digital_menu_payload_or_response(db, public_code)
    if isinstance(payload_result, PlainTextResponse):
        return payload_result
    _, _, snapshot_payload = payload_result
    payload = public_menu_response_from_snapshot(snapshot_payload, public_code)
    menu = payload["menu"]
    return PublicDigitalMenuOut(
        id=menu["id"],
        business_id=menu["business_id"],
        name=menu["name"],
        template_key=menu["template_key"],
        theme=payload["theme"],
        categories=payload["categories"],
    )


@router.get("/api/public/digital-menus/{public_code}", response_model=PublicDigitalMenuPageOut)
def public_digital_menu_page_data(
    public_code: str, db: Session = Depends(get_db)
) -> PublicDigitalMenuPageOut | PlainTextResponse:
    payload_result = _get_public_digital_menu_page_payload_or_response(db, public_code)
    if isinstance(payload_result, PlainTextResponse):
        return payload_result
    business, _, snapshot_payload = payload_result
    payload = public_menu_response_from_snapshot(snapshot_payload, public_code)
    return PublicDigitalMenuPageOut(
        business=payload["business"],
        menu=payload["menu"],
        theme=payload["theme"],
        categories=payload["categories"],
    )


@router.get(
    "/api/public/digital-menus/{public_code}/images/{version}/{item_id}/{filename}",
    response_model=None,
)
def public_menu_item_image(
    public_code: str,
    version: int,
    item_id: str,
    filename: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    image_key = get_published_snapshot_image_key(
        db,
        public_code=public_code,
        version=version,
        item_id=item_id,
        filename=filename,
    )
    path = LocalStorage().open(image_key)
    return FileResponse(
        path,
        media_type="image/webp",
        headers=_immutable_public_asset_headers(),
    )


@router.get("/m/{public_code}/menu.pdf", response_model=None)
def public_menu_file(
    public_code: str, v: str | None = None, db: Session = Depends(get_db)
) -> FileResponse | PlainTextResponse:
    del v
    resolved = _resolve_public_menu_asset(db, public_code)
    if isinstance(resolved, PlainTextResponse):
        return resolved
    asset, path = resolved
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            **_dynamic_public_cache_headers(),
            "Content-Type": "application/pdf",
            "Content-Disposition": _inline_content_disposition(asset.original_filename),
        },
    )


@router.get("/admin/businesses", response_model=list[BusinessOut])
def admin_businesses(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Business]:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    return _list_all_businesses(db)


@router.post("/admin/businesses", response_model=BusinessOut)
def admin_create_business(
    payload: BusinessCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Business:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = Business(**_validated_business_patch(payload.model_dump()))
    if (
        business.destination_type == DestinationType.digital_menu
        and not plan_includes_feature(business.plan_key, BusinessFeatureKey.digital_menu)
    ):
        raise HTTPException(status_code=403, detail="Feature not enabled: digital_menu")
    db.add(business)
    try:
        db.flush()
        sync_current_destination(db, business)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "slug" in str(exc).lower():
            raise HTTPException(status_code=400, detail="Slug already exists") from exc
        raise
    return business


@router.patch("/admin/businesses/{business_id}", response_model=BusinessOut)
def admin_patch_business(
    business_id: str,
    payload: BusinessPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    data = _validated_business_patch(payload.model_dump(exclude_unset=True))
    next_plan_key = data.get("plan_key", business.plan_key)
    if (
        data.get("destination_type") == DestinationType.digital_menu
        and not plan_includes_feature(next_plan_key, BusinessFeatureKey.digital_menu)
    ):
        raise HTTPException(status_code=403, detail="Feature not enabled: digital_menu")
    for key, value in data.items():
        setattr(business, key, value)
    _apply_plan_destination_fallback(db, business, payload)
    sync_current_destination(db, business)
    business.updated_at = datetime.now(UTC)
    record_audit_event(
        db,
        event_type="business.status_changed" if payload.status is not None else "business.updated",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="business",
        target_id=business.id,
        details=data,
    )
    db.commit()
    return business


@router.post("/admin/businesses/{business_id}/owner", response_model=UserOut)
def admin_assign_owner(
    business_id: str,
    payload: OwnerAssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    normalized_email = normalize_email(payload.email)
    owner = db.scalar(select(User).where(User.email == normalized_email))
    if owner is None:
        owner = User(email=normalized_email, password_hash=hash_password(payload.password))
        db.add(owner)
        db.flush()
    elif not verify_password(payload.password, owner.password_hash):
        raise HTTPException(
            status_code=409,
            detail="User email already exists with a different password",
        )
    if not db.scalar(
        select(Membership).where(
            Membership.user_id == owner.id, Membership.business_id == business_id
        )
    ):
        db.add(Membership(user_id=owner.id, business_id=business_id, role=payload.role))
    record_audit_event(
        db,
        event_type="membership.assigned",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="user",
        target_id=owner.id,
        details={"email": owner.email, "role": payload.role.value},
    )
    db.commit()
    return owner


@router.post("/admin/invitations", response_model=InvitationCreateOut, status_code=202)
def admin_invite_client(
    payload: AdminInviteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InvitationCreateOut:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    if not outbound_email_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP invitation delivery is not configured",
        )
    try:
        result = issue_invitation(
            db,
            business_name=payload.business_name,
            email=payload.email,
        )
        send_invitation_email(result.user.email, result.token)
    except InvitationError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except EmailDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invitation email delivery failed",
        ) from exc
    record_audit_event(
        db,
        event_type="invitation.created",
        actor_user_id=user.id,
        business_id=result.business.id,
        target_type="invitation",
        target_id=result.invitation.id,
        details={"email": result.user.email},
    )
    record_audit_event(
        db,
        event_type="invitation.sent",
        actor_user_id=user.id,
        business_id=result.business.id,
        target_type="invitation",
        target_id=result.invitation.id,
        details={"email": result.user.email},
    )
    db.commit()
    return InvitationCreateOut(
        business_id=result.business.id,
        email=result.user.email,
        message=f"Invitación enviada a {result.user.email}",
    )


def _check_login_rate(email: str, request: Request) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    keys = _rate_limit_keys(email, request)
    window_start = now - timedelta(minutes=1)
    for key in list(_login_attempts.keys()):
        bucket = _login_attempts[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if not bucket:
            _login_attempts.pop(key, None)
    for key in keys:
        if len(_login_attempts[key]) >= settings.login_rate_limit_per_minute:
            raise HTTPException(status_code=429, detail="Too many login attempts")
    for key in keys:
        _login_attempts[key].append(now)


def _check_password_reset_rate(email: str, request: Request) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    keys = _rate_limit_keys(email, request)
    window_start = now - timedelta(hours=1)
    for key in list(_password_reset_attempts.keys()):
        bucket = _password_reset_attempts[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if not bucket:
            _password_reset_attempts.pop(key, None)
    for key in keys:
        if len(_password_reset_attempts[key]) >= settings.password_reset_rate_limit_per_hour:
            raise HTTPException(status_code=429, detail="Too many password reset attempts")
    for key in keys:
        _password_reset_attempts[key].append(now)


def _rate_limit_keys(email: str, request: Request) -> set[str]:
    keys = {f"email:{email.lower()}"}
    client_host = request.client.host if request.client is not None else None
    if client_host:
        keys.add(f"ip:{client_host}")
        keys.add(f"email_ip:{email.lower()}@{client_host}")
    return keys


def _delete_existing_logo_files(business_id: str, keep: Path | None = None) -> None:
    root = Path(get_settings().storage_path) / "businesses" / business_id / "logo"
    for candidate in root.glob("logo.*"):
        if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"} and candidate != keep:
            candidate.unlink(missing_ok=True)


def _inline_content_disposition(filename: str | PathLike[str]) -> str:
    safe_name = Path(filename).name or "menu.pdf"
    encoded = quote(safe_name)
    return f"inline; filename=\"{safe_name}\"; filename*=UTF-8''{encoded}"


def _dynamic_public_cache_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def _immutable_public_asset_headers() -> dict[str, str]:
    return {
        "Cache-Control": "public, max-age=31536000, immutable",
    }


def _apply_plan_destination_fallback(
    db: Session, business: Business, payload: BusinessPatch
) -> None:
    if payload.plan_key is None:
        return
    if business.destination_type != DestinationType.digital_menu:
        return
    if business_has_feature(business, BusinessFeatureKey.digital_menu):
        return
    if _business_has_valid_external_url(business):
        business.destination_type = DestinationType.external_url
        return
    active_menu = get_active_menu(db, business.id)
    if active_menu is not None:
        business.destination_type = DestinationType.menu_pdf


def _business_has_valid_external_url(business: Business) -> bool:
    if not business.external_url:
        return False
    parsed = urlparse(business.external_url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _validated_business_patch(data: dict[str, object]) -> dict[str, object]:
    validated = dict(data)
    if "external_url" in validated and isinstance(validated["external_url"], str):
        validated["external_url"] = validated["external_url"].strip()
    destination_type = validated.get("destination_type")
    external_url = validated.get("external_url")
    if destination_type == DestinationType.external_url:
        if not isinstance(external_url, str) or not external_url:
            raise HTTPException(status_code=400, detail="External URL is required")
        parsed = urlparse(external_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(status_code=400, detail="External URL is invalid")
    if (
        "external_url" in validated
        and isinstance(validated["external_url"], str)
        and validated["external_url"] == ""
    ):
        raise HTTPException(status_code=400, detail="External URL is invalid")
    return validated


def _public_unavailable_response() -> PlainTextResponse:
    return PlainTextResponse("Este menú no se encuentra disponible actualmente.", status_code=403)


def _get_public_link_or_404(db: Session, public_code: str) -> DynamicLink:
    link = db.scalar(select(DynamicLink).where(DynamicLink.public_code == public_code))
    if link is None:
        raise HTTPException(status_code=404, detail="Not found")
    return link


def _get_public_link_and_business(
    db: Session, public_code: str
) -> tuple[DynamicLink, Business] | PlainTextResponse:
    link = _get_public_link_or_404(db, public_code)
    business = db.get(Business, link.business_id)
    if (
        business is None
        or not link.is_active
        or business.status not in {BusinessStatus.active, BusinessStatus.demo}
    ):
        return _public_unavailable_response()
    return link, business


def _resolve_public_redirect_target(
    db: Session, public_code: str
) -> tuple[DynamicLink, str] | PlainTextResponse:
    link_and_business = _get_public_link_and_business(db, public_code)
    if isinstance(link_and_business, PlainTextResponse):
        return link_and_business
    link, business = link_and_business
    if business.destination_type == DestinationType.external_url:
        external_url = _resolve_external_destination_url(business)
        if external_url is None:
            return _public_unavailable_response()
        return link, external_url
    if business.destination_type == DestinationType.digital_menu:
        payload_result = _get_public_digital_menu_page_payload_or_response(db, public_code)
        if isinstance(payload_result, PlainTextResponse):
            return payload_result
        return link, _public_menu_page_url(public_code)
    if business.destination_type == DestinationType.menu_pdf:
        asset_result = _resolve_public_menu_asset(db, public_code)
        if isinstance(asset_result, PlainTextResponse):
            return asset_result
        return link, _public_menu_url(public_code)
    return _public_unavailable_response()


def _resolve_external_destination_url(business: Business) -> str | None:
    if not business.external_url:
        return None
    parsed = urlparse(business.external_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return business.external_url


def _resolve_public_menu_asset(
    db: Session, public_code: str
) -> tuple[MenuAsset, Path] | PlainTextResponse:
    link_and_business = _get_public_link_and_business(db, public_code)
    if isinstance(link_and_business, PlainTextResponse):
        return link_and_business
    _, business = link_and_business
    if business.destination_type != DestinationType.menu_pdf:
        return _public_unavailable_response()
    asset = get_active_menu(db, business.id)
    if asset is None:
        return _public_unavailable_response()
    try:
        path = LocalStorage().open(asset.storage_key)
    except FileNotFoundError:
        return _public_unavailable_response()
    return asset, path


def _get_public_digital_menu_payload_or_response(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, dict[str, object]] | PlainTextResponse:
    try:
        return get_public_digital_menu_payload(db, public_code)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _public_unavailable_response()
        raise


def _get_public_digital_menu_page_payload_or_response(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, dict[str, object]] | PlainTextResponse:
    try:
        return get_public_digital_menu_page_payload(db, public_code)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _public_unavailable_response()
        raise


def _public_menu_url(public_code: str) -> str:
    return f"/m/{public_code}/menu.pdf"


def _public_digital_menu_url(public_code: str) -> str:
    return f"/m/{public_code}/digital-menu"


def _public_menu_page_url(public_code: str) -> str:
    return f"/m/{public_code}"


def _list_all_businesses(db: Session) -> list[Business]:
    return list(db.scalars(select(Business).order_by(Business.name, Business.id)).all())


def _record_legal_acceptance_events(
    db: Session, user_id: str, acceptances: list[LegalAcceptance]
) -> None:
    for acceptance in acceptances:
        record_audit_event(
            db,
            event_type="legal.accepted",
            actor_user_id=user_id,
            business_id=acceptance.business_id,
            target_type="legal_document",
            target_id=acceptance.document_type.value,
            details={
                "acceptance_method": acceptance.acceptance_method.value,
                "document_version": acceptance.document_version,
            },
        )


def _legal_status_payload(
    db: Session, user: User, business_id: str | None = None
) -> LegalStatusOut:
    latest = latest_legal_acceptances(db, user.id, business_id)
    pending = pending_legal_documents(db, user, business_id)
    documents = [
        _legal_document_status(document_type, current_version, latest, pending)
        for document_type, current_version in CURRENT_LEGAL_VERSIONS.items()
    ]
    return LegalStatusOut(
        documents=documents,
        pending_documents=pending,
        requires_acceptance=bool(pending),
    )


def _legal_document_status(
    document_type: LegalDocumentType,
    current_version: str,
    latest: dict[LegalDocumentType, LegalAcceptance],
    pending: list[LegalDocumentType],
) -> LegalDocumentStatusOut:
    acceptance = latest.get(document_type)
    return LegalDocumentStatusOut(
        document_type=document_type,
        current_version=current_version,
        accepted_version=acceptance.document_version if acceptance is not None else None,
        accepted_at=acceptance.accepted_at if acceptance is not None else None,
        is_current=document_type not in pending,
    )


def _enforce_legal_acceptance(db: Session, user: User, business_id: str | None = None) -> None:
    pending = pending_legal_documents(db, user, business_id)
    if pending:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal acceptance required",
        )
