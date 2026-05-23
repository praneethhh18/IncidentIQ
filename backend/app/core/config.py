"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings.

    Reads from environment variables and a local ``.env`` file. Every external
    credential is optional — when missing, the corresponding service falls
    back to demo data so the application stays fully functional end-to-end.
    """

    # AWS Bedrock
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"
    bedrock_model_id: str = "amazon.nova-pro-v1:0"

    # Datadog
    datadog_api_key: str | None = None
    datadog_app_key: str | None = None
    datadog_site: str = "datadoghq.com"

    # Grafana
    grafana_url: str | None = None
    grafana_api_key: str | None = None

    # New Relic
    new_relic_user_key: str | None = None
    new_relic_account_id: str | None = None

    # Slack webhook for auto-posting analyses (optional)
    slack_webhook_url: str | None = None

    # SendGrid for resolution emails (optional)
    sendgrid_api_key: str | None = None
    sendgrid_from_email: str = "incidentiq@example.com"
    notify_email: str | None = None

    # Server — store as raw string and expose parsed list via property so
    # pydantic-settings doesn't try to JSON-decode comma-separated input
    # from .env files.
    port: int = 8000
    cors_origins_raw: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        validation_alias=AliasChoices("CORS_ORIGINS", "cors_origins_raw"),
    )
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_prefix="",
        # Allow CORS_ORIGINS as an alias for cors_origins_raw
    )

    @property
    def cors_origins(self) -> List[str]:
        return [
            origin.strip()
            for origin in (self.cors_origins_raw or "").split(",")
            if origin.strip()
        ]

    # ── Derived flags ──────────────────────────────────────────────────────

    @property
    def bedrock_enabled(self) -> bool:
        return bool(self.aws_access_key_id and self.aws_secret_access_key)

    @property
    def datadog_enabled(self) -> bool:
        return bool(self.datadog_api_key and self.datadog_app_key)

    @property
    def grafana_enabled(self) -> bool:
        return bool(self.grafana_url and self.grafana_api_key)

    @property
    def newrelic_enabled(self) -> bool:
        return bool(self.new_relic_user_key and self.new_relic_account_id)

    @property
    def slack_enabled(self) -> bool:
        return bool(self.slack_webhook_url)

    @property
    def email_enabled(self) -> bool:
        return bool(self.sendgrid_api_key and self.notify_email)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached Settings instance."""
    return Settings()
