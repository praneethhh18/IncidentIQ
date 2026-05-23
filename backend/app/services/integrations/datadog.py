"""Datadog Logs integration.

Uses the public Logs Search API (v2) for on-demand pulls. When credentials
are absent or the API is unreachable, the integration falls back to a
seeded log stream so the analyser can still run end-to-end.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from app.core.config import Settings
from app.models import IntegrationStatus, SourceKind
from app.services.demo_data import CASCADING_FAILURE_LOGS
from app.services.integrations.base import MonitoringIntegration

logger = logging.getLogger(__name__)


class DatadogIntegration(MonitoringIntegration):
    source = SourceKind.DATADOG
    display_name = "Datadog"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        site = settings.datadog_site or "datadoghq.com"
        self._base_url = f"https://api.{site}"

    def is_configured(self) -> bool:
        return self._settings.datadog_enabled

    async def fetch_logs(
        self,
        *,
        query: Optional[str],
        window_minutes: int,
    ) -> str:
        if not self.is_configured():
            logger.info("Datadog not configured — returning seeded log stream")
            return f"# [demo] Datadog stream — query={query or '*'} window={window_minutes}m\n{CASCADING_FAILURE_LOGS}"

        url = f"{self._base_url}/api/v2/logs/events/search"
        now = datetime.now(timezone.utc)
        body = {
            "filter": {
                "query": query or "status:error OR status:warn",
                "from": (now - timedelta(minutes=window_minutes)).isoformat(),
                "to": now.isoformat(),
            },
            "page": {"limit": 200},
            "sort": "-timestamp",
        }
        headers = {
            "DD-API-KEY": self._settings.datadog_api_key or "",
            "DD-APPLICATION-KEY": self._settings.datadog_app_key or "",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Datadog fetch failed, using seeded stream: %s", exc)
            return f"# [fallback] Datadog API error: {exc}\n{CASCADING_FAILURE_LOGS}"

        events = payload.get("data", [])
        if not events:
            return "# No matching Datadog log events in the requested window."

        lines = []
        for event in events:
            attrs = event.get("attributes", {})
            ts = attrs.get("timestamp", "")
            service = attrs.get("service", "?")
            status = attrs.get("status", "?")
            message = (attrs.get("message") or "").replace("\n", " ").strip()
            lines.append(f"{ts} {status.upper():<5} {service:<20} {message}")
        return "\n".join(lines)

    async def status(self) -> IntegrationStatus:
        if not self.is_configured():
            return IntegrationStatus(
                name=self.display_name,
                connected=False,
                enabled=False,
                detail="Add DATADOG_API_KEY and DATADOG_APP_KEY to enable.",
            )

        url = f"{self._base_url}/api/v1/validate"
        headers = {
            "DD-API-KEY": self._settings.datadog_api_key or "",
            "DD-APPLICATION-KEY": self._settings.datadog_app_key or "",
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return IntegrationStatus(
                        name=self.display_name,
                        connected=True,
                        enabled=True,
                        detail=f"Connected to {self._settings.datadog_site}",
                    )
                return IntegrationStatus(
                    name=self.display_name,
                    connected=False,
                    enabled=True,
                    detail=f"Validation failed ({response.status_code})",
                )
        except Exception as exc:  # noqa: BLE001
            return IntegrationStatus(
                name=self.display_name,
                connected=False,
                enabled=True,
                detail=f"Network error: {exc}",
            )
