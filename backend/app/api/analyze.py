"""POST /api/v1/analyze — run a root-cause analysis."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional

from app.api.deps import get_analyzer, get_analysis_store
from app.models import AnalyzeRequest, AnalyzeResponse, SourceKind
from app.services.analyzer import Analyzer
from app.services.store import AnalysisStore

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    analyzer: Analyzer = Depends(get_analyzer),
    store: AnalysisStore = Depends(get_analysis_store),
) -> AnalyzeResponse:
    """Run a root-cause analysis on the supplied logs or integration query."""
    try:
        result = await analyzer.analyze(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Analyzer failed")
        raise HTTPException(status_code=500, detail="Internal analyzer error") from exc

    store.save(result)
    return result


@router.post("/analyze/upload", response_model=AnalyzeResponse)
async def analyze_upload(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    service_hint: Optional[str] = Form(default=None),
    analyzer: Analyzer = Depends(get_analyzer),
    store: AnalysisStore = Depends(get_analysis_store),
) -> AnalyzeResponse:
    """Run analysis on the contents of an uploaded log file."""
    raw = await file.read()
    try:
        logs = raw.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Cannot decode file: {exc}") from exc

    request = AnalyzeRequest(
        source=SourceKind.UPLOAD,
        title=title or file.filename,
        service_hint=service_hint,
        logs=logs,
    )
    result = await analyzer.analyze(request)
    store.save(result)
    return result
