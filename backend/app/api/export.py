"""GET /api/v1/incidents/{id}/export.pdf — PDF post-mortem export."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.deps import get_analysis_store
from app.services.pdf_export import render_pdf
from app.services.store import AnalysisStore

router = APIRouter()


@router.get("/incidents/{incident_id}/export.pdf")
def export_pdf(
    incident_id: str,
    store: AnalysisStore = Depends(get_analysis_store),
) -> Response:
    analysis = store.get(incident_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    pdf_bytes = render_pdf(analysis)
    filename = f"IncidentIQ-{analysis.incident_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
