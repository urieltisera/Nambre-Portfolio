from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import BusinessStatus, MembershipRole, MenuAssetStatus, QRStatus, QRType


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


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
