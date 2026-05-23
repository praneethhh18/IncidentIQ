"""In-memory incident store.

For v1 we keep analyses in-process. This is intentional — it makes the
hackathon deploy trivial and keeps the integration story focused on
monitoring tools rather than on a database. Swap with SQLite/Postgres
when persistence is required (see :mod:`AnalysisStore` for the interface).
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import List, Optional

from app.models import AnalyzeResponse, IncidentSummary


class AnalysisStore:
    """Thread-safe, bounded, in-memory store for completed analyses."""

    def __init__(self, capacity: int = 200) -> None:
        self._capacity = capacity
        self._items: "OrderedDict[str, AnalyzeResponse]" = OrderedDict()
        self._lock = threading.Lock()

    def save(self, analysis: AnalyzeResponse) -> None:
        with self._lock:
            self._items[analysis.incident_id] = analysis
            self._items.move_to_end(analysis.incident_id)
            while len(self._items) > self._capacity:
                self._items.popitem(last=False)

    def get(self, incident_id: str) -> Optional[AnalyzeResponse]:
        with self._lock:
            return self._items.get(incident_id)

    def list_recent(self, limit: int = 25) -> List[IncidentSummary]:
        with self._lock:
            ordered = list(self._items.values())[::-1]  # newest first
        return [
            IncidentSummary(
                incident_id=a.incident_id,
                title=a.title,
                created_at=a.created_at,
                severity=a.severity,
                root_cause=a.root_cause,
                affected_service_count=len(a.affected_services),
            )
            for a in ordered[:limit]
        ]

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


_default_store = AnalysisStore()


def get_store() -> AnalysisStore:
    return _default_store
