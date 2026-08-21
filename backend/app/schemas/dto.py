from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import (
    AcceptanceMethod,
    BusinessStatus,
    LegalDocumentType,
    MembershipRole,
    MenuAssetStatus,
    QRStatus,
    QRType,
)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str
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
    status: BusinessStatus = BusinessStatus.demo


class BusinessPatch(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    status: BusinessStatus | None = None


class BusinessOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None
    status: BusinessStatus
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class OwnerAssignIn(BaseModel):
    email: EmailStr
    password: str
    role: MembershipRole = MembershipRole.owner


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
