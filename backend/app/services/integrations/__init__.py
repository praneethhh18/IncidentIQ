"""Monitoring integration registry.

Each integration implements :class:`MonitoringIntegration` and is registered
by source kind. Integrations gracefully degrade to seeded fixtures when
credentials are absent so the demo path is never broken.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from app.core.config import Settings
from app.models import IntegrationStatus, SourceKind
from app.services.integrations.base import MonitoringIntegration
from app.services.integrations.datadog import DatadogIntegration
from app.services.integrations.grafana import GrafanaIntegration
from app.services.integrations.newrelic import NewRelicIntegration


class IntegrationRegistry:
    """Lookup table from :class:`SourceKind` to an integration instance."""

    def __init__(self, settings: Settings) -> None:
        self._by_source: Dict[SourceKind, MonitoringIntegration] = {
            SourceKind.DATADOG: DatadogIntegration(settings),
            SourceKind.GRAFANA: GrafanaIntegration(settings),
            SourceKind.NEWRELIC: NewRelicIntegration(settings),
        }

    def get(self, source: SourceKind) -> Optional[MonitoringIntegration]:
        return self._by_source.get(source)

    def all(self) -> List[MonitoringIntegration]:
        return list(self._by_source.values())

    async def status_all(self) -> List[IntegrationStatus]:
        return [await integration.status() for integration in self.all()]


__all__ = ["IntegrationRegistry", "MonitoringIntegration"]
