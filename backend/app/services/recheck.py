"""Recheck an incident against fresh telemetry.

Given an existing analysis, pull a current sample from the same source
(or new logs supplied by the caller) and decide whether the original
error pattern is still happening. Updates the incident's lifecycle
status: ``open`` -> ``recovering`` -> ``resolved``.

The detection is intentionally simple: look for the same signature
keywords / error-level tokens that drove the original analysis. If
none of those appear in the fresh sample, the incident is resolved.
This is a hackathon-grade heuristic, not a production SLA monitor.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from app.models import AnalyzeRequest, AnalyzeResponse, SourceKind
from app.services.agent_tools import ERROR_LEVEL_RE
from app.services.integrations import IntegrationRegistry

logger = logging.getLogger(__name__)


@dataclass
class RecheckOutcome:
    status: str  # "resolved" | "recovering" | "still_active"
    summary: str
    matched_signals: List[str]
    fresh_log_lines: int


# Signature words we extract from the original analysis. Anything in the
# fresh sample matching one of these is treated as evidence the incident
# is still happening.
def _signature_terms(analysis: AnalyzeResponse) -> List[str]:
    terms: set[str] = set()

    # Affected service names
    for service in analysis.affected_services:
        if service.name:
            terms.add(service.name.lower())

    # Evidence log lines: pull short distinctive tokens (specific error
    # phrases, service-error pairs).
    for evidence in analysis.evidence[:6]:
        for token in re.findall(r"[A-Za-z][A-Za-z_-]{4,}", evidence):
            t = token.lower()
            if t in {
                "error",
                "fatal",
                "warn",
                "info",
                "debug",
                "trace",
                "would",
                "took",
                "have",
                "this",
                "that",
                "with",
            }:
                continue
            terms.add(t)

    # Forensic trigger keyword (e.g. "exhausted", "failover", "oom")
    if analysis.forensic:
        for word in re.findall(r"[a-z]{4,}", analysis.forensic.trigger_hypothesis.lower()):
            terms.add(word)

    # Cap and prioritise: longer terms are more specific.
    return sorted(terms, key=lambda t: (-len(t), t))[:20]


def _classify(
    analysis: AnalyzeResponse, fresh_logs: str
) -> RecheckOutcome:
    """Decide the incident status from a fresh log sample.

    Only count signature matches inside ERROR / WARN / FATAL lines: a
    service name mentioned in healthy INFO traffic doesn't indicate the
    incident is still happening.
    """
    line_count = fresh_logs.count("\n") + 1
    error_lines = [
        line for line in fresh_logs.splitlines() if ERROR_LEVEL_RE.search(line)
    ]
    error_count = len(error_lines)
    error_blob = " ".join(error_lines).lower()

    terms = _signature_terms(analysis)
    matched = [term for term in terms if term in error_blob]

    # Resolved: no error-level lines at all, OR error lines have none of
    # the original signatures in them.
    if error_count == 0:
        return RecheckOutcome(
            status="resolved",
            summary=(
                f"No ERROR/WARN/FATAL lines in the fresh sample "
                f"({line_count} lines total). The original error pattern is gone."
            ),
            matched_signals=[],
            fresh_log_lines=line_count,
        )

    if not matched:
        return RecheckOutcome(
            status="resolved",
            summary=(
                f"{error_count} new error line(s) found, but none match the "
                "original incident's signature. Looks like a different issue."
            ),
            matched_signals=[],
            fresh_log_lines=line_count,
        )

    if len(matched) <= 1 and error_count <= 2:
        return RecheckOutcome(
            status="recovering",
            summary=(
                f"Residual signals fading ({', '.join(matched)}). "
                f"Only {error_count} error line(s) remaining."
            ),
            matched_signals=matched,
            fresh_log_lines=line_count,
        )

    return RecheckOutcome(
        status="still_active",
        summary=(
            f"Original error pattern is still active. "
            f"{len(matched)} matching signals across {error_count} error line(s): "
            f"{', '.join(matched[:5])}."
        ),
        matched_signals=matched,
        fresh_log_lines=line_count,
    )


async def recheck_incident(
    *,
    analysis: AnalyzeResponse,
    fresh_logs: Optional[str],
    integrations: IntegrationRegistry,
) -> RecheckOutcome:
    """Run a recheck and update ``analysis`` in place.

    If ``fresh_logs`` is provided we use it directly. Otherwise, when the
    original incident came from an integration, we pull a fresh window
    from that same integration. If neither is available, we raise.
    """
    if fresh_logs is None:
        if analysis.source in (
            SourceKind.DATADOG,
            SourceKind.GRAFANA,
            SourceKind.NEWRELIC,
        ):
            integration = integrations.get(analysis.source)
            if integration is not None:
                fresh_logs = await integration.fetch_logs(
                    query=None, window_minutes=15
                )
        if fresh_logs is None:
            raise ValueError(
                "Cannot recheck without fresh logs. Paste a fresh sample or "
                "rerun against a configured monitoring integration."
            )

    outcome = _classify(analysis, fresh_logs)
    now = datetime.now(timezone.utc)

    analysis.last_checked_at = now
    analysis.recheck_count = (analysis.recheck_count or 0) + 1
    if outcome.status == "resolved":
        analysis.status = "resolved"
        analysis.resolved_at = now
        analysis.resolution_summary = outcome.summary
    elif outcome.status == "recovering":
        analysis.status = "recovering"
        analysis.resolution_summary = outcome.summary
    else:
        analysis.status = "investigating"
        analysis.resolution_summary = outcome.summary

    return outcome


def build_recheck_request(analysis: AnalyzeResponse) -> AnalyzeRequest:
    """Helper to reconstruct an AnalyzeRequest from a prior analysis,
    useful for tests / endpoint variants that want to re-run the agent."""
    return AnalyzeRequest(
        source=analysis.source,
        title=analysis.title,
    )
