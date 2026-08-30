from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import get_settings


class LocalStorage:
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or get_settings().storage_path)
        self.root.mkdir(parents=True, exist_ok=True)

    def build_key(self, business_id: str, suffix: str) -> str:
        return f"businesses/{business_id}/menus/{uuid4()}{suffix}"

    def logo_key(self, business_id: str, suffix: str) -> str:
        return f"businesses/{business_id}/logo/logo{suffix}"

    def qr_logo_key(self, business_id: str, suffix: str) -> str:
        return f"businesses/{business_id}/qr-logo/logo{suffix}"

    def menu_item_image_key(self, business_id: str, item_id: str, suffix: str) -> str:
        return f"businesses/{business_id}/digital-menu/items/{item_id}/{uuid4()}{suffix}"

    async def save_upload(self, upload: UploadFile, key: str) -> int:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        with path.open("wb") as target:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                target.write(chunk)
        await upload.seek(0)
        return size

    def save_bytes(self, key: str, content: bytes) -> int:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return len(content)

    def open(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_file() or self.root.resolve() not in path.parents:
            raise FileNotFoundError(key)
        return path

    def delete(self, key: str) -> None:
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if root not in path.parents:
            raise FileNotFoundError(key)
        path.unlink(missing_ok=True)

    def starts_with(self, key: str, signature: bytes) -> bool:
        path = self.open(key)
        with path.open("rb") as source:
            return source.read(len(signature)) == signature
