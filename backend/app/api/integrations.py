"""GET /api/v1/integrations + per-session credential management."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import (
    get_integrations,
    get_session_store,
    session_id_header,
)
from app.models import IntegrationStatus, SourceKind
from app.services.integrations import IntegrationRegistry
from app.services.session_creds import (
    DatadogCreds,
    GrafanaCreds,
    NewRelicCreds,
    SessionCredentialStore,
)

router = APIRouter()


# ── Integration status / discovery ────────────────────────────────────


@router.get("/integrations", response_model=List[IntegrationStatus])
async def list_integrations(
    registry: IntegrationRegistry = Depends(get_integrations),
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> List[IntegrationStatus]:
    """Per-user integration status.

    Each signed-in user has their own credential slot - we never leak the
    global EC2 .env Datadog/Grafana/NewRelic creds into a user's view of
    "what's connected", because that's exactly what produced the bug where
    a fresh Google sign-in saw the demo account already wired up.

    Status is computed purely from whether the user has pasted their own
    keys (booleans only, never echoes back the secrets). Validation
    against the upstream happens at credential-save time, not here.
    """
    statuses: List[IntegrationStatus] = []

    # For each integration, ``connected`` and ``enabled`` move together:
    # the frontend IntegrationCard interprets `enabled=true, connected=false`
    # as "configured but the upstream is unreachable" and slaps a red error
    # pill on it. We don't ping the upstream here (validation happens at
    # save time), so we set both to the same boolean. A future change can
    # split them by adding a real reachability ping.
    dd_overrides = session_store.get_datadog(session_id)
    dd_ok = bool(
        dd_overrides
        and getattr(dd_overrides, "api_key", None)
        and getattr(dd_overrides, "app_key", None)
    )
    statuses.append(
        IntegrationStatus(
            name="Datadog",
            connected=dd_ok,
            enabled=dd_ok,
            detail=(
                f"Connected to {getattr(dd_overrides, 'site', None) or 'datadoghq.com'}"
                if dd_ok
                else "Paste your Datadog API key + App key on the Settings page to enable."
            ),
        ),
    )

    gf_overrides = session_store.get_grafana(session_id)
    gf_ok = bool(
        gf_overrides
        and getattr(gf_overrides, "url", None)
        and getattr(gf_overrides, "api_key", None)
    )
    statuses.append(
        IntegrationStatus(
            name="Grafana",
            connected=gf_ok,
            enabled=gf_ok,
            detail=(
                f"Connected to {getattr(gf_overrides, 'url', '')}"
                if gf_ok
                else "Paste your Loki URL + access token on the Settings page to enable."
            ),
        ),
    )

    nr_overrides = session_store.get_newrelic(session_id)
    nr_ok = bool(
        nr_overrides
        and getattr(nr_overrides, "user_key", None)
        and getattr(nr_overrides, "account_id", None)
    )
    statuses.append(
        IntegrationStatus(
            name="New Relic",
            connected=nr_ok,
            enabled=nr_ok,
            detail=(
                f"Connected (account {getattr(nr_overrides, 'account_id', '')})"
                if nr_ok
                else "Paste your User Key + Account ID on the Settings page to enable."
            ),
        ),
    )

    # We deliberately ignore `registry` here - keeping the parameter in
    # the signature for backwards compatibility with code that depends on
    # the singleton being initialised on first request.
    _ = registry
    return statuses


@router.get("/integrations/datadog/services")
async def datadog_services(
    window_minutes: int = Query(60, ge=5, le=720),
    registry: IntegrationRegistry = Depends(get_integrations),
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    """Recent services that emitted error/warn logs - feeds the service dropdown."""
    integration = registry.get(SourceKind.DATADOG)
    if integration is None:
        return {"connected": False, "services": []}
    overrides = session_store.get_datadog(session_id)
    is_connected = getattr(integration, "is_configured_for", integration.is_configured)(overrides)  # type: ignore[arg-type]
    if not is_connected:
        return {"connected": False, "services": []}
    services = await integration.list_recent_services(  # type: ignore[attr-defined]
        window_minutes=window_minutes,
        overrides=overrides,
    )
    return {"connected": True, "services": services}


# ── Session lifecycle ─────────────────────────────────────────────────


@router.post("/session/new")
def session_new(
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    """Idempotent: returns the supplied session id if it's still valid,
    otherwise issues a fresh one. Frontend stores the result in
    localStorage and sends it on every subsequent request as
    ``X-IIQ-Session``."""
    sid = session_store.get_or_create(session_id)
    return {"session_id": sid, "status": session_store.public_status(sid)}


@router.get("/session/status")
def session_status(
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    """What credentials the current session has stashed (booleans only -
    never echoes the actual keys back)."""
    return {
        "session_id": session_id,
        "status": session_store.public_status(session_id),
    }


# ── Per-session credential CRUD ───────────────────────────────────────


class DatadogCredsBody(BaseModel):
    api_key: str = Field(..., min_length=8)
    app_key: str = Field(..., min_length=8)
    site: str = Field(default="datadoghq.com")


class GrafanaCredsBody(BaseModel):
    url: str = Field(..., min_length=8)
    api_key: str = Field(..., min_length=8)


class NewRelicCredsBody(BaseModel):
    user_key: str = Field(..., min_length=8)
    account_id: str = Field(..., min_length=1)


def _require_session(
    session_id: Optional[str],
    session_store: SessionCredentialStore,
) -> str:
    """Pin the credential entry to the caller's identity.

    Older versions threw away the caller's session id if it wasn't
    already in the in-memory store and issued a fresh random one - which
    meant after any backend restart, the user's pasted Datadog creds
    landed under a new key the frontend never read back from. We now
    trust whatever identifier the request carries (gh:/fb:/guest: from
    X-IIQ-User, or a legacy X-IIQ-Session uuid) and let the store create
    the entry lazily on first write.
    """
    if not session_id:
        return session_store.issue_session_id()
    return session_id


@router.post("/integrations/datadog/credentials")
def set_datadog_credentials(
    body: DatadogCredsBody,
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    sid = _require_session(session_id, session_store)
    session_store.set_datadog(
        sid, DatadogCreds(api_key=body.api_key, app_key=body.app_key, site=body.site),
    )
    return {"session_id": sid, "status": session_store.public_status(sid)}


@router.delete("/integrations/datadog/credentials")
def clear_datadog_credentials(
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    if not session_id:
        raise HTTPException(status_code=400, detail="No session header present")
    session_store.clear_datadog(session_id)
    return {"session_id": session_id, "status": session_store.public_status(session_id)}


@router.post("/integrations/grafana/credentials")
def set_grafana_credentials(
    body: GrafanaCredsBody,
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    sid = _require_session(session_id, session_store)
    session_store.set_grafana(sid, GrafanaCreds(url=body.url, api_key=body.api_key))
    return {"session_id": sid, "status": session_store.public_status(sid)}


@router.delete("/integrations/grafana/credentials")
def clear_grafana_credentials(
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    if not session_id:
        raise HTTPException(status_code=400, detail="No session header present")
    session_store.clear_grafana(session_id)
    return {"session_id": session_id, "status": session_store.public_status(session_id)}


@router.post("/integrations/newrelic/credentials")
def set_newrelic_credentials(
    body: NewRelicCredsBody,
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    sid = _require_session(session_id, session_store)
    session_store.set_newrelic(
        sid, NewRelicCreds(user_key=body.user_key, account_id=body.account_id),
    )
    return {"session_id": sid, "status": session_store.public_status(sid)}


@router.delete("/integrations/newrelic/credentials")
def clear_newrelic_credentials(
    session_store: SessionCredentialStore = Depends(get_session_store),
    session_id: Optional[str] = Depends(session_id_header),
) -> dict:
    if not session_id:
        raise HTTPException(status_code=400, detail="No session header present")
    session_store.clear_newrelic(session_id)
    return {"session_id": session_id, "status": session_store.public_status(session_id)}
