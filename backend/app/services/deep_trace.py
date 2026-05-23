"""Deep Trace — the emergency investigator that activates when the regular
pass isn't confident or hits trouble.

Three layers of investigation that the surface-level agent skips:

  1. **Hidden-signal scanners** — pattern detectors for things only an
     expert SRE would normally catch:
       * silent failures (2xx followed by ERROR within seconds)
       * timing anomalies (regular-interval patterns that hint at cron / GC / scheduled jobs)
       * order anomalies (events arriving in unexpected order — race conditions)
       * service silence (services that appear early then go quiet — often the culprit)

  2. **Per-service deep probes** — for each affected service, focused
     statistics (error burst rate, first/last appearance, silence) plus
     a classification (primary / propagator / bystander / sink).

  3. **Extended LLM pass** — when Bedrock is available, re-prompts Nova
     Pro with the scanner findings asking specifically about *hidden
     bugs an expert would catch*. Larger token budget than the regular
     pass. Returns a curated list of insights.
"""

from __future__ import annotations

import logging
import re
import statistics
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List

from app.models import (
    AnalyzeResponse,
    DeepTraceReport,
    HiddenSignal,
    ServiceProbe,
    Severity,
)
from app.services.agent_tools import ERROR_LEVEL_RE, ISO_TS_RE, SERVICE_RE
from app.services.bedrock import BedrockClient, BedrockUnavailable

logger = logging.getLogger(__name__)


# ── Escalation decision ──────────────────────────────────────────────────


def should_escalate(analysis: AnalyzeResponse) -> tuple[bool, str]:
    """Decide whether Deep Trace should auto-trigger after the regular pass.

    Returns (should_trigger, human-readable reason). Designed to fire only
    on genuinely uncertain or high-stakes cases — most incidents resolve
    fine with the regular agent.
    """
    if analysis.confidence < 0.5:
        return True, f"Regular-pass confidence is only {int(analysis.confidence * 100)}%."

    if analysis.forensic is None:
        return True, "Agent could not assemble a forensic report (no patient zero located)."

    if analysis.forensic and "unknown" in analysis.forensic.trigger_hypothesis.lower():
        return True, "Trigger hypothesis is 'unknown' — the regular pass cannot explain causality."

    # Detect the agent's own self-check flag in the trail.
    for step in analysis.agent_steps:
        if "weak grounding" in step.title.lower():
            return True, "Self-check flagged weak grounding — LLM named services not observed in logs."

    # P1 with no prior history is risky enough to deep-trace.
    if analysis.severity == Severity.P1 and not _has_similar_history(analysis):
        return True, "P1 incident with no matching history in the local incident store."

    return False, ""


def _has_similar_history(analysis: AnalyzeResponse) -> bool:
    for step in analysis.agent_steps:
        if step.tool == "query_similar_incidents" and step.output:
            matches = (step.output or {}).get("matches", [])
            if matches:
                return True
    return False


# ── Scanners ──────────────────────────────────────────────────────────────


HTTP_OK_RE = re.compile(r"\bstatus=20[0-46]\b|\bHTTP/[\d.]+ 20[0-46]\b|\b\"200\b")
HTTP_ERR_RE = re.compile(r"\bstatus=5\d{2}\b|\bHTTP/[\d.]+ 5\d{2}\b|\b\"5\d{2}\b")


def scan_silent_failures(logs: str) -> HiddenSignal | None:
    """Detect 2xx responses immediately followed by ERROR/FATAL on the same service."""
    lines = logs.splitlines()
    suspects: List[str] = []

    for i, line in enumerate(lines[:-1]):
        if not HTTP_OK_RE.search(line):
            continue
        # Look ahead a few lines for an ERROR on the same service
        service_match = SERVICE_RE.search(line.lower())
        if not service_match:
            continue
        service = service_match.group(1)
        for ahead in lines[i + 1 : i + 6]:
            if service in ahead.lower() and ERROR_LEVEL_RE.search(ahead):
                suspects.append(f"{line.strip()[:160]}  →  {ahead.strip()[:160]}")
                break

    if not suspects:
        return None
    return HiddenSignal(
        category="silent_failure",
        title=f"{len(suspects)} silent-failure pattern(s) detected",
        detail=(
            "Some requests logged a 2xx response and then failed within seconds. "
            "These are classic hidden bugs: the response shape looked fine, but "
            "the operation actually failed downstream. They hide in 'OK' "
            "responses and only surface as user-reported errors hours later."
        ),
        evidence=suspects[:4],
        severity=Severity.P2,
    )


def scan_timing_anomalies(logs: str) -> HiddenSignal | None:
    """Find evenly-spaced events — often scheduled jobs / GC / autoscaler cycles."""
    timestamps: List[datetime] = []
    for line in logs.splitlines():
        match = ISO_TS_RE.search(line)
        if not match:
            continue
        try:
            timestamps.append(
                datetime.fromisoformat(match.group(0).replace("Z", "+00:00"))
            )
        except ValueError:
            continue

    if len(timestamps) < 6:
        return None

    intervals = [
        (timestamps[i + 1] - timestamps[i]).total_seconds()
        for i in range(len(timestamps) - 1)
        if (timestamps[i + 1] - timestamps[i]).total_seconds() > 0
    ]
    if len(intervals) < 5:
        return None

    median = statistics.median(intervals)
    mean = statistics.fmean(intervals)
    if median == 0:
        return None

    try:
        stdev = statistics.pstdev(intervals)
    except statistics.StatisticsError:
        return None

    cv = stdev / mean if mean else 1.0

    # Regular pattern: coefficient of variation very low.
    if cv < 0.25 and median > 1:
        return HiddenSignal(
            category="timing_anomaly",
            title="Regular-interval event pattern detected",
            detail=(
                f"Log events arrive at a near-constant {median:.1f}s interval "
                f"(σ/μ = {cv:.2f}). That's the fingerprint of a scheduled job, "
                "garbage-collection cycle, or autoscaler kicking — and one of "
                "those is probably the trigger you're missing."
            ),
            evidence=[
                f"observed intervals (seconds): {[round(i, 1) for i in intervals[:8]]}",
                f"median={median:.2f}s, mean={mean:.2f}s, σ={stdev:.2f}s",
            ],
            severity=Severity.P3,
        )

    # Outlier latency: any single interval >> the rest.
    if max(intervals) > median * 4 and len(intervals) >= 6:
        return HiddenSignal(
            category="timing_anomaly",
            title="Latency outlier in the event timeline",
            detail=(
                f"One gap of {max(intervals):.1f}s sits inside an otherwise "
                f"~{median:.1f}s cadence. That's a stall — either a single "
                "slow operation (a long lock, a hung dependency, a flushed GC) "
                "or telemetry going dark for a window."
            ),
            evidence=[
                f"max_gap={max(intervals):.1f}s vs median={median:.1f}s",
            ],
            severity=Severity.P2,
        )

    return None


def scan_order_anomalies(logs: str) -> HiddenSignal | None:
    """Flag events that arrive out of expected temporal order (clock skew or race)."""
    parsed: List[tuple[int, datetime, str]] = []
    for idx, line in enumerate(logs.splitlines()):
        match = ISO_TS_RE.search(line)
        if not match:
            continue
        try:
            ts = datetime.fromisoformat(match.group(0).replace("Z", "+00:00"))
            parsed.append((idx, ts, line.strip()[:200]))
        except ValueError:
            continue

    if len(parsed) < 4:
        return None

    out_of_order: List[str] = []
    last_ts = parsed[0][1]
    for _idx, ts, text in parsed[1:]:
        if ts < last_ts:
            out_of_order.append(text)
        else:
            last_ts = ts

    if not out_of_order:
        return None

    return HiddenSignal(
        category="order_anomaly",
        title=f"{len(out_of_order)} out-of-order event(s) detected",
        detail=(
            "Some log lines arrive with timestamps earlier than the preceding "
            "line. This is either clock skew between hosts, asynchronous "
            "buffering at the log shipper, or — most importantly — a race "
            "condition where parallel paths report results in non-deterministic order."
        ),
        evidence=out_of_order[:4],
        severity=Severity.P2,
    )


def scan_service_silence(
    logs: str, affected_services: List[str]
) -> HiddenSignal | None:
    """Detect services that appear early in the log then go silent before the end."""
    if not affected_services:
        return None

    log_lines = logs.splitlines()
    total = len(log_lines)
    if total < 8:
        return None

    early_window = log_lines[: total // 3]
    late_window = log_lines[-total // 3 :]

    silent: List[str] = []
    for service in affected_services:
        s = service.lower()
        appears_early = any(s in line.lower() for line in early_window)
        appears_late = any(s in line.lower() for line in late_window)
        if appears_early and not appears_late:
            silent.append(service)

    if not silent:
        return None

    return HiddenSignal(
        category="service_silence",
        title=f"{len(silent)} service(s) went silent mid-incident",
        detail=(
            "Services appeared in the early portion of the logs and then "
            "stopped logging entirely. A silent service during an incident "
            "is rarely innocent — it's either the one that crashed (no more "
            "log lines to emit) or had its telemetry pipeline taken down by "
            "the cascade. Either way, prioritize investigating these."
        ),
        evidence=[f"silent_service: {s}" for s in silent],
        severity=Severity.P1 if len(silent) > 1 else Severity.P2,
    )


SCANNERS = [
    scan_silent_failures,
    scan_timing_anomalies,
    scan_order_anomalies,
]


# ── Per-service probe ────────────────────────────────────────────────────


def probe_services(
    logs: str, affected_services: List[str]
) -> List[ServiceProbe]:
    """Run a focused investigation per affected service."""
    by_service: Dict[str, List[tuple[int, datetime | None, str]]] = defaultdict(list)
    for idx, line in enumerate(logs.splitlines()):
        for service in affected_services:
            if service.lower() in line.lower():
                ts_match = ISO_TS_RE.search(line)
                ts: datetime | None = None
                if ts_match:
                    try:
                        ts = datetime.fromisoformat(ts_match.group(0).replace("Z", "+00:00"))
                    except ValueError:
                        ts = None
                by_service[service].append((idx, ts, line))
                break

    log_lines = logs.splitlines()
    total = len(log_lines)
    if total == 0:
        return []
    late_window_start = (2 * total) // 3
    probes: List[ServiceProbe] = []

    for service, hits in by_service.items():
        if not hits:
            continue
        first_idx, first_ts, _ = hits[0]
        last_idx, last_ts, _ = hits[-1]
        went_silent = last_idx < late_window_start and total > 6

        errors = sum(1 for _, _, ln in hits if ERROR_LEVEL_RE.search(ln))
        timestamps = [t for _, t, _ in hits if t is not None]
        if len(timestamps) >= 2:
            span_min = max(
                (timestamps[-1] - timestamps[0]).total_seconds() / 60.0, 0.1
            )
        else:
            span_min = 1.0
        burst_rate = errors / span_min

        findings: List[str] = []
        if went_silent:
            findings.append(
                "Stopped logging in the final third of the incident — likely crashed or had its telemetry severed."
            )
        if errors == len(hits) and errors > 1:
            findings.append("Every line for this service was an error or fatal — purely a victim or a crashing component.")
        if burst_rate > 30:
            findings.append(
                f"Error burst rate of ~{burst_rate:.0f}/min — extremely loud, almost certainly a propagator."
            )

        # Classification heuristic
        if went_silent:
            role_in_cascade = "primary"
        elif burst_rate > 20:
            role_in_cascade = "propagator"
        elif errors == 0:
            role_in_cascade = "bystander"
        elif errors == len(hits):
            role_in_cascade = "sink"
        else:
            role_in_cascade = "propagator"

        probes.append(
            ServiceProbe(
                service=service,
                role=_guess_role(service),
                line_count=len(hits),
                first_seen=first_ts.isoformat() if first_ts else None,
                last_seen=last_ts.isoformat() if last_ts else None,
                went_silent=went_silent,
                error_burst_rate=round(burst_rate, 1),
                findings=findings or ["Routine appearance — no anomalous pattern detected."],
                suspected_role_in_cascade=role_in_cascade,
            )
        )

    return probes


def _guess_role(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("db", "postgres", "mysql", "rds")):
        return "database"
    if any(x in n for x in ("redis", "cache")):
        return "cache"
    if any(x in n for x in ("gateway", "proxy", "ingress")):
        return "gateway"
    if "worker" in n or "queue" in n:
        return "worker"
    if n.endswith("-api"):
        return "api"
    return "service"


# ── Extended LLM pass ────────────────────────────────────────────────────


_EXPERT_SYSTEM_PROMPT = """\
You are an elite SRE called in to do a deep forensic investigation on an
incident that the first-pass agent could not fully explain. You have 20
years of experience and have personally led postmortems on FAANG-scale
outages. Your job is to find the HIDDEN BUGS — the subtle defects that
only an expert would catch on a normal read-through.

You are given:
  • The first-pass analysis (likely incomplete or low-confidence)
  • Hidden-signal scanner results (silent failures, timing anomalies, etc.)
  • Per-service probe data

Reply with a SINGLE JSON object:
{
  "expert_insights": [
    "string — one finding per element; a hidden bug, subtle interaction, or non-obvious cause"
  ],
  "revised_root_cause": "string — if the deep look changed the root cause, the corrected statement. Empty string if not.",
  "revised_confidence": 0.0
}

Rules:
  • Each insight must be ACTIONABLE and SPECIFIC — no generic SRE advice.
  • Quote evidence where possible.
  • If the original root cause was already right, leave revised_root_cause empty and set revised_confidence higher (e.g., 0.88) to reflect the deep-trace verification.
  • Output JSON only, no markdown, no commentary.
"""


def _build_expert_prompt(
    analysis: AnalyzeResponse,
    hidden: List[HiddenSignal],
    probes: List[ServiceProbe],
    logs: str,
) -> str:
    parts: List[str] = []
    parts.append(f"First-pass title: {analysis.title}")
    parts.append(f"First-pass root cause: {analysis.root_cause}")
    parts.append(f"First-pass confidence: {analysis.confidence}")
    if analysis.forensic:
        parts.append(f"First-pass trigger hypothesis: {analysis.forensic.trigger_hypothesis}")

    if hidden:
        parts.append("\nHidden-signal scanner findings:")
        for signal in hidden:
            parts.append(f"  • [{signal.category}] {signal.title} — {signal.detail}")

    if probes:
        parts.append("\nPer-service probe results:")
        for probe in probes:
            parts.append(
                f"  • {probe.service} ({probe.suspected_role_in_cascade}, role={probe.role}): "
                f"{probe.line_count} lines, burst={probe.error_burst_rate}/min, "
                f"silent={probe.went_silent}"
            )
            for finding in probe.findings:
                parts.append(f"     - {finding}")

    parts.append("\nRaw telemetry (truncated):")
    parts.append("─── BEGIN ──")
    parts.append(logs[:8000])
    parts.append("─── END ──")
    return "\n".join(parts)


# ── Orchestrator ─────────────────────────────────────────────────────────


def run_deep_trace(
    *,
    logs: str,
    analysis: AnalyzeResponse,
    bedrock: BedrockClient | None,
    triggered_reason: str,
    auto_triggered: bool,
) -> DeepTraceReport:
    """Run the full Deep Trace pipeline against an existing analysis."""
    started = time.perf_counter()

    affected_services = [s.name for s in analysis.affected_services]

    # 1. Run scanners
    hidden_signals: List[HiddenSignal] = []
    for scanner in SCANNERS:
        try:
            result = scanner(logs)
            if result:
                hidden_signals.append(result)
        except Exception:  # noqa: BLE001
            logger.exception("Deep Trace scanner %s failed", scanner.__name__)

    silence = scan_service_silence(logs, affected_services)
    if silence:
        hidden_signals.append(silence)

    # 2. Per-service probes
    probes = probe_services(logs, affected_services)

    # 3. Extended LLM pass (optional — Bedrock only)
    expert_insights: List[str] = []
    revised_root_cause = ""
    revised_confidence = 0.0
    extended_model = ""

    if bedrock and bedrock.enabled:
        try:
            payload = bedrock.converse_json(
                system_prompt=_EXPERT_SYSTEM_PROMPT,
                user_prompt=_build_expert_prompt(analysis, hidden_signals, probes, logs),
                max_tokens=4096,
                temperature=0.15,
            )
            expert_insights = [str(x) for x in payload.get("expert_insights", []) if x]
            revised_root_cause = str(payload.get("revised_root_cause", "") or "")
            revised_confidence = float(payload.get("revised_confidence", 0.0) or 0.0)
            extended_model = bedrock.model_id + " · extended"
        except BedrockUnavailable as exc:
            logger.warning("Expert pass failed: %s", exc)
            expert_insights = _fallback_expert_insights(hidden_signals, probes)
        except Exception:  # noqa: BLE001
            logger.exception("Expert pass crashed")
            expert_insights = _fallback_expert_insights(hidden_signals, probes)
    else:
        expert_insights = _fallback_expert_insights(hidden_signals, probes)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return DeepTraceReport(
        triggered_reason=triggered_reason,
        auto_triggered=auto_triggered,
        extended_model_used=extended_model,
        duration_ms=elapsed_ms,
        hidden_signals=hidden_signals,
        service_probes=probes,
        expert_insights=expert_insights,
        revised_root_cause=revised_root_cause,
        revised_confidence=revised_confidence,
    )


def _fallback_expert_insights(
    hidden: List[HiddenSignal], probes: List[ServiceProbe]
) -> List[str]:
    """When Bedrock isn't available, hand-craft expert-style insights from scanner data."""
    insights: List[str] = []
    for signal in hidden:
        insights.append(f"[{signal.category}] {signal.title}: {signal.detail.split('.')[0]}.")
    for probe in probes:
        if probe.suspected_role_in_cascade == "primary":
            insights.append(
                f"Service '{probe.service}' looks like the cascade's primary — "
                "it went silent during the incident, meaning the process likely "
                "crashed and stopped producing log output entirely. Start your "
                "investigation here, not at the loudest service."
            )
    if not insights:
        insights.append(
            "Deep Trace ran every scanner and found no hidden anomalies. The "
            "first-pass analysis appears complete — the incident is exactly as "
            "the regular agent described it."
        )
    return insights
