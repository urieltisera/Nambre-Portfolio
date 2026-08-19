from io import BytesIO
from pathlib import Path

import qrcode
import qrcode.image.svg
from PIL import Image, ImageDraw
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Business, DynamicLink, QRCode, QRStatus, QRType


def qr_payload(public_code: str) -> str:
    base_url = get_settings().public_base_url.rstrip("/")
    return f"{base_url}/r/{public_code}"


def generate_qr_assets(db: Session, business_id: str) -> list[QRCode]:
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    if link is None:
        return []
    db.execute(
        delete(QRCode).where(QRCode.business_id == business_id, QRCode.qr_type != QRType.artistic)
    )
    business = db.get(Business, business_id)
    root = Path(get_settings().storage_path) / "qr" / business_id
    root.mkdir(parents=True, exist_ok=True)
    created: list[QRCode] = []
    for qr_type in (QRType.standard, QRType.branded):
        for fmt in ("png", "svg"):
            url = _write_qr(root, business_id, link.public_code, qr_type, fmt, business)
            record = QRCode(
                business_id=business_id,
                dynamic_link_id=link.id,
                qr_type=qr_type,
                status=QRStatus.approved,
                asset_url=url,
            )
            db.add(record)
            created.append(record)
    db.flush()
    return created


def _write_qr(
    root: Path,
    business_id: str,
    public_code: str,
    qr_type: QRType,
    fmt: str,
    business: Business | None,
) -> str:
    payload = qr_payload(public_code)
    name = f"{qr_type.value}.{fmt}"
    path = root / name
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=4, box_size=12)
    qr.add_data(payload)
    qr.make(fit=True)
    if fmt == "svg":
        image = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
        with path.open("wb") as fh:
            image.save(fh)
    else:
        image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        if qr_type == QRType.branded:
            _draw_center_mark(image, business)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        path.write_bytes(buffer.getvalue())
    return f"/api/businesses/{business_id}/qr-assets/{name}"


def _draw_center_mark(image: Image.Image, business: Business | None) -> None:
    draw = ImageDraw.Draw(image)
    width, height = image.size
    side = width // 6
    left = (width - side) // 2
    top = (height - side) // 2
    draw.rounded_rectangle([left, top, left + side, top + side], radius=side // 8, fill="white")
    logo_path = _logo_path(business)
    if logo_path is not None:
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((side - 12, side - 12))
        image.paste(logo, (left + (side - logo.width) // 2, top + (side - logo.height) // 2), logo)
        return
    draw.text((left + side * 0.32, top + side * 0.25), "M", fill="black")


def _logo_path(business: Business | None) -> Path | None:
    if business is None or not business.logo_url:
        return None
    prefix = f"/logos/{business.id}"
    if business.logo_url != prefix:
        return None
    root = Path(get_settings().storage_path) / "businesses" / business.id / "logo"
    for candidate in root.glob("logo.*"):
        if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            return candidate
    return None
