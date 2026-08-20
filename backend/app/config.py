from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MenuFlow"
    environment: str = "local"
    app_timezone: str = "America/Argentina/Buenos_Aires"
    database_url: str = "postgresql+psycopg://menuflow:menuflow@localhost:5432/menuflow"
    secret_key: str = Field(default="change-me-local-only", min_length=16)
    access_token_minutes: int = 60 * 8
    max_pdf_bytes: int = 10 * 1024 * 1024
    storage_path: str = "storage"
    public_base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str | None = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
        r")(?::\d+)?$"
    )
    login_rate_limit_per_minute: int = 5

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
