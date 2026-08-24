from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import (
    AcceptanceMethod,
    BodyFontKey,
    BusinessPlanKey,
    BusinessStatus,
    CardStyleKey,
    DestinationType,
    DigitalMenuStatus,
    HeadingFontKey,
    LegalDocumentType,
    MembershipRole,
    MenuAssetStatus,
    QRStatus,
    QRType,
)
from app.services.digital_menu_theme_service import DEFAULT_MENU_THEME, HEX_COLOR_RE


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageOut(BaseModel):
    message: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    accept_legal: bool = False


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str


class InvitationAcceptIn(BaseModel):
    token: str
    new_password: str
    accept_legal: bool = False


class UserOut(BaseModel):
    id: str
    email: EmailStr
    is_platform_admin: bool
    model_config = ConfigDict(from_attributes=True)


class BusinessCreate(BaseModel):
    name: str
    slug: str
    logo_url: str | None = None
    plan_key: BusinessPlanKey = BusinessPlanKey.essential
    destination_type: DestinationType = DestinationType.menu_pdf
    external_url: str | None = None
    status: BusinessStatus = BusinessStatus.demo


class BusinessPatch(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    plan_key: BusinessPlanKey | None = None
    destination_type: DestinationType | None = None
    external_url: str | None = None
    status: BusinessStatus | None = None


class BusinessFeaturesOut(BaseModel):
    digital_menu: bool = False
    artistic_qr: bool = False
    advanced_analytics: bool = False
    scheduled_promotions: bool = False
    advanced_branding: bool = False


class BusinessOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None
    plan_key: BusinessPlanKey
    features: BusinessFeaturesOut
    destination_type: DestinationType
    external_url: str | None
    status: BusinessStatus
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


def _strip_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class OwnerAssignIn(BaseModel):
    email: EmailStr
    password: str
    role: MembershipRole = MembershipRole.owner


class AdminInviteIn(BaseModel):
    business_name: str
    email: EmailStr


class InvitationCreateOut(BaseModel):
    business_id: str
    email: EmailStr
    message: str


class MenuAssetOut(BaseModel):
    id: str
    original_filename: str
    content_type: str
    file_size: int
    version: int
    status: MenuAssetStatus
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MenuStateOut(BaseModel):
    current: MenuAssetOut | None
    versions: list[MenuAssetOut]
    public_code: str | None


class DigitalMenuThemePatchIn(BaseModel):
    accent_color: str | None = None
    background_color: str | None = None
    surface_color: str | None = None
    text_color: str | None = None
    muted_text_color: str | None = None
    heading_font: HeadingFontKey | None = None
    body_font: BodyFontKey | None = None
    card_style: CardStyleKey | None = None

    @field_validator(
        "accent_color",
        "background_color",
        "surface_color",
        "text_color",
        "muted_text_color",
    )
    @classmethod
    def validate_hex_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not HEX_COLOR_RE.fullmatch(normalized):
            raise ValueError("Theme colors must use #RRGGBB format")
        return normalized.upper()


class DigitalMenuThemeOut(BaseModel):
    accent_color: str
    background_color: str
    surface_color: str
    text_color: str
    muted_text_color: str
    heading_font: HeadingFontKey
    body_font: BodyFontKey
    card_style: CardStyleKey


class DigitalMenuCreateIn(BaseModel):
    name: str
    template_key: str = "modern"
    theme: DigitalMenuThemePatchIn | None = None
    status: DigitalMenuStatus = DigitalMenuStatus.draft
    is_published: bool = False

    @field_validator("name", "template_key")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped

    @model_validator(mode="after")
    def validate_publication_state(self) -> "DigitalMenuCreateIn":
        if self.is_published and self.status != DigitalMenuStatus.published:
            raise ValueError("Published menus must use published status")
        if not self.is_published and self.status == DigitalMenuStatus.published:
            raise ValueError("Published status requires is_published=true")
        return self


class DigitalMenuPatchIn(BaseModel):
    name: str | None = None
    template_key: str | None = None
    theme: DigitalMenuThemePatchIn | None = None
    status: DigitalMenuStatus | None = None
    is_published: bool | None = None

    @field_validator("name", "template_key")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped

    @model_validator(mode="after")
    def validate_publication_state(self) -> "DigitalMenuPatchIn":
        if self.status is not None and self.is_published is not None:
            if self.is_published and self.status != DigitalMenuStatus.published:
                raise ValueError("Published menus must use published status")
            if not self.is_published and self.status == DigitalMenuStatus.published:
                raise ValueError("Published status requires is_published=true")
        return self


class DigitalMenuOut(BaseModel):
    id: str
    business_id: str
    name: str
    status: DigitalMenuStatus
    template_key: str
    theme: DigitalMenuThemeOut = Field(
        default_factory=lambda: DigitalMenuThemeOut(**DEFAULT_MENU_THEME)
    )
    is_published: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MenuCategoryCreateIn(BaseModel):
    name: str
    description: str | None = None
    position: int = Field(default=0, ge=0)
    is_visible: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Category name is required")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        return _strip_optional_text(value)


class MenuCategoryPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    position: int | None = Field(default=None, ge=0)
    is_visible: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Category name is required")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_optional_description(cls, value: str | None) -> str | None:
        return _strip_optional_text(value)


class MenuCategoryOut(BaseModel):
    id: str
    digital_menu_id: str
    name: str
    description: str | None
    position: int
    is_visible: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MenuItemCreateIn(BaseModel):
    name: str
    description: str | None = None
    price: Decimal
    currency: str = "ARS"
    position: int = Field(default=0, ge=0)
    is_visible: bool = True
    is_available: bool = True
    is_featured: bool = False

    @field_validator("name")
    @classmethod
    def validate_item_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Item name is required")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_optional_text_fields(cls, value: str | None) -> str | None:
        return _strip_optional_text(value)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("Currency must be a 3-letter code")
        return normalized

    @field_validator("price")
    @classmethod
    def validate_price(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Price must be non-negative")
        normalized = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if normalized != value:
            raise ValueError("Price must use at most 2 decimal places")
        return normalized


class MenuItemPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    position: int | None = Field(default=None, ge=0)
    is_visible: bool | None = None
    is_available: bool | None = None
    is_featured: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_optional_item_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Item name is required")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_optional_item_text_fields(cls, value: str | None) -> str | None:
        return _strip_optional_text(value)

    @field_validator("currency")
    @classmethod
    def validate_optional_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("Currency must be a 3-letter code")
        return normalized

    @field_validator("price")
    @classmethod
    def validate_optional_price(cls, value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        if value < 0:
            raise ValueError("Price must be non-negative")
        normalized = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if normalized != value:
            raise ValueError("Price must use at most 2 decimal places")
        return normalized


class MenuItemOut(BaseModel):
    id: str
    category_id: str
    name: str
    description: str | None
    price: Decimal
    currency: str
    image_url: str | None
    position: int
    is_visible: bool
    is_available: bool
    is_featured: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PublicMenuCategoryOut(BaseModel):
    id: str
    name: str
    description: str | None
    position: int
    items: list["MenuItemOut"]


class PublicDigitalMenuOut(BaseModel):
    id: str
    business_id: str
    name: str
    template_key: str
    theme: DigitalMenuThemeOut = Field(
        default_factory=lambda: DigitalMenuThemeOut(**DEFAULT_MENU_THEME)
    )
    categories: list[PublicMenuCategoryOut]


class PublicBusinessSummaryOut(BaseModel):
    id: str
    name: str
    logo_url: str | None
    model_config = ConfigDict(from_attributes=True)


class PublicMenuItemCardOut(BaseModel):
    id: str
    category_id: str
    name: str
    description: str | None
    price: Decimal
    currency: str
    image_url: str | None
    position: int
    is_visible: bool
    is_available: bool
    is_featured: bool
    model_config = ConfigDict(from_attributes=True)


class PublicMenuCategorySectionOut(BaseModel):
    id: str
    name: str
    description: str | None
    position: int
    is_visible: bool
    items: list[PublicMenuItemCardOut]
    model_config = ConfigDict(from_attributes=True)


class PublicDigitalMenuPageOut(BaseModel):
    business: PublicBusinessSummaryOut
    menu: DigitalMenuOut
    theme: DigitalMenuThemeOut = Field(
        default_factory=lambda: DigitalMenuThemeOut(**DEFAULT_MENU_THEME)
    )
    categories: list[PublicMenuCategorySectionOut]


class RollbackIn(BaseModel):
    menu_asset_id: str


class QRCodeOut(BaseModel):
    id: str
    qr_type: QRType
    status: QRStatus
    asset_url: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AnalyticsSummaryOut(BaseModel):
    scans_today: int
    scans_7d: int
    scans_30d: int
    busiest_hour: int | None


class DailyScanOut(BaseModel):
    date: str
    scans: int


class LegalDocumentStatusOut(BaseModel):
    document_type: LegalDocumentType
    current_version: str
    accepted_version: str | None
    accepted_at: datetime | None
    is_current: bool


class LegalStatusOut(BaseModel):
    documents: list[LegalDocumentStatusOut]
    pending_documents: list[LegalDocumentType]
    requires_acceptance: bool


class LegalAcceptIn(BaseModel):
    acceptance_method: AcceptanceMethod = AcceptanceMethod.ui_checkbox
    business_id: str | None = None
    document_types: list[LegalDocumentType] | None = None
