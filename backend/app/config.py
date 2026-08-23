from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nambre"
    environment: str = "local"
    app_timezone: str = "America/Argentina/Buenos_Aires"
    database_url: str = "postgresql+psycopg://menuflow:menuflow@localhost:5432/menuflow"
    secret_key: str = Field(default="change-me-local-only", min_length=16)
    access_token_minutes: int = 60 * 8
    max_pdf_bytes: int = 10 * 1024 * 1024
    storage_path: str = "storage"
    public_base_url: str = "http://localhost:8000"
    scan_event_retention_days: int = 90
    audit_event_retention_days: int = 365
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
    password_reset_rate_limit_per_hour: int = 3
    password_reset_token_minutes: int = 30
    frontend_base_url: str = "http://localhost:3000"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Nambre"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 10

    @model_validator(mode="after")
    def validate_security_defaults(self) -> "Settings":
        insecure_secrets = {
            "change-me-local-only",
            "replace-with-a-long-random-secret",
        }
        if self.environment not in {"local", "test"} and self.secret_key in insecure_secrets:
            raise ValueError("SECRET_KEY must be overridden outside local/test environments")
        if self.smtp_use_ssl and self.smtp_use_tls:
            raise ValueError("SMTP_USE_SSL and SMTP_USE_TLS cannot both be enabled")
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
