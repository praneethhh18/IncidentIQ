"""GET /api/v1/incidents — recent analysis history."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_analysis_store
from app.models import AnalyzeResponse, IncidentSummary
from app.services.store import AnalysisStore

router = APIRouter()


@router.get("/incidents", response_model=List[IncidentSummary])
def list_incidents(
    limit: int = Query(default=25, ge=1, le=100),
    store: AnalysisStore = Depends(get_analysis_store),
) -> List[IncidentSummary]:
    return store.list_recent(limit=limit)


@router.get("/incidents/{incident_id}", response_model=AnalyzeResponse)
def get_incident(
    incident_id: str,
    store: AnalysisStore = Depends(get_analysis_store),
) -> AnalyzeResponse:
    analysis = store.get(incident_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return analysis
