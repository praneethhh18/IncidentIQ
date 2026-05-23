"""Root-cause analysis engine.

Coordinates Bedrock inference, integration data sources, and the demo
fallback so that callers always get a well-formed :class:`AnalyzeResponse`,
even when AWS or monitoring credentials are absent.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from app.core.config import Settings
from app.models import AnalyzeRequest, AnalyzeResponse, SourceKind
from app.prompts.root_cause import SYSTEM_PROMPT, build_user_prompt
from app.services.agent import IncidentAgent
from app.services.bedrock import BedrockClient, BedrockUnavailable
from app.services.demo_data import fallback_analysis
from app.services.integrations import IntegrationRegistry

logger = logging.getLogger(__name__)

MAX_LOG_CHARS = 80_000  # ~16k tokens — generous, still safely below model limits


class Analyzer:
    """High-level orchestration around Bedrock + integrations + fallbacks."""

    def __init__(
        self,
        settings: Settings,
        bedrock: BedrockClient,
        integrations: IntegrationRegistry,
        agent: IncidentAgent | None = None,
    ) -> None:
        self._settings = settings
        self._bedrock = bedrock
        self._integrations = integrations
        self._agent = agent or IncidentAgent()

    async def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        started = time.perf_counter()

        logs = await self._resolve_logs(request)
        if not logs:
            raise ValueError(
                "No logs provided. Either paste/upload a log payload, or "
                "configure an integration and pass an integration_query."
            )

        truncated = _truncate_logs(logs)

        # Phase 1 — agent runs its deterministic plan/observe loop and gathers
        # grounded context BEFORE the LLM ever sees the prompt. This is the
        # "agentic" part: the agent decides which tools to call based on what
        # it sees, and produces a visible reasoning trail.
        trail, agent_context = self._agent.plan_and_observe(truncated)

        # Phase 2 — synthesise the final structured analysis (LLM or fallback).
        result = self._run_inference(
            logs=truncated,
            agent_context=agent_context,
            service_hint=request.service_hint,
            source=request.source,
            title=request.title,
        )

        # Phase 3 — self-check and stitch the audit trail onto the response.
        result = self._agent.audit_and_annotate(trail, agent_context, result)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        result.duration_ms = elapsed_ms
        result.source = request.source
        if request.title:
            result.title = request.title
        return result

    # ── Source resolution ──────────────────────────────────────────────

    async def _resolve_logs(self, request: AnalyzeRequest) -> Optional[str]:
        """Return the raw text to analyse, pulling from integrations as needed."""
        if request.logs:
            return request.logs

        if request.source in (SourceKind.PASTE, SourceKind.UPLOAD, SourceKind.DEMO):
            return None  # nothing to fall back to

        integration = self._integrations.get(request.source)
        if integration is None:
            logger.warning("No integration registered for source=%s", request.source)
            return None

        return await integration.fetch_logs(
            query=request.integration_query,
            window_minutes=request.time_window_minutes,
        )

    # ── Inference + fallback ───────────────────────────────────────────

    def _run_inference(
        self,
        *,
        logs: str,
        agent_context: dict,
        service_hint: str | None,
        source: SourceKind,
        title: str | None,
    ) -> AnalyzeResponse:
        if not self._bedrock.enabled:
            logger.info("Bedrock disabled — returning demo fallback analysis")
            return _stamp_fallback(fallback_analysis(logs), title)

        user_prompt = build_user_prompt(
            logs=logs,
            service_hint=service_hint,
            source_label=source.value,
            agent_context=agent_context,
        )

        try:
            payload = self._bedrock.converse_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                max_tokens=2048,
                temperature=0.2,
            )
        except BedrockUnavailable as exc:
            logger.warning("Bedrock unavailable, falling back to demo: %s", exc)
            return _stamp_fallback(fallback_analysis(logs), title)

        try:
            response = AnalyzeResponse(
                model=self._bedrock.model_id,
                **payload,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Bedrock returned payload that failed schema validation")
            return _stamp_fallback(fallback_analysis(logs), title)

        return response


def _stamp_fallback(response: AnalyzeResponse, title: str | None) -> AnalyzeResponse:
    if title:
        response.title = title
    return response


def _truncate_logs(logs: str) -> str:
    if len(logs) <= MAX_LOG_CHARS:
        return logs
    head = logs[: MAX_LOG_CHARS // 2]
    tail = logs[-MAX_LOG_CHARS // 2 :]
    return f"{head}\n\n… [truncated {len(logs) - MAX_LOG_CHARS} chars] …\n\n{tail}"
