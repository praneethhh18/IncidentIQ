"""Common interface for monitoring integrations."""

from __future__ import annotations

import abc
from typing import Optional

from app.models import IntegrationStatus, SourceKind


class MonitoringIntegration(abc.ABC):
    """Shape that every monitoring integration must implement."""

    source: SourceKind
    display_name: str

    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Return True when the integration has credentials and a target."""

    @abc.abstractmethod
    async def fetch_logs(
        self,
        *,
        query: Optional[str],
        window_minutes: int,
    ) -> str:
        """Return raw log/metric text to feed into the analyzer."""

    @abc.abstractmethod
    async def status(self) -> IntegrationStatus:
        """Probe the upstream and return a current connection status."""
