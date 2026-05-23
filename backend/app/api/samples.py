"""GET /api/v1/samples — built-in demo incident fixtures."""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from app.services.demo_data import get_sample_logs, list_samples

router = APIRouter()


@router.get("/samples")
def samples() -> List[Dict[str, str]]:
    """Return metadata for the sample-incident picker."""
    return list_samples()


@router.get("/samples/{sample_id}")
def sample_payload(sample_id: str) -> Dict[str, Any]:
    """Return the raw log text for a named sample incident."""
    sample = get_sample_logs(sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    return sample
