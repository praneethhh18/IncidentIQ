"""GET /api/v1/integrations — connection status for monitoring tools."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.api.deps import get_integrations
from app.models import IntegrationStatus
from app.services.integrations import IntegrationRegistry

router = APIRouter()


@router.get("/integrations", response_model=List[IntegrationStatus])
async def list_integrations(
    registry: IntegrationRegistry = Depends(get_integrations),
) -> List[IntegrationStatus]:
    return await registry.status_all()
