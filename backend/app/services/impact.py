"""Derive Business Impact and 5 Whys postmortem from an analysis.

These two views are computed locally from the structured analysis the
LLM already produced. We don't make another LLM call for them - instead
we use heuristics keyed on severity, affected-service roles, and the
forensic report. This keeps latency flat and ensures the views are
present even when running on demo fallback.
"""

from __future__ import annotations

from typing import List

from app.models import (
    AnalyzeResponse,
    BusinessImpact,
    FiveWhys,
    Severity,
    WhyStep,
)


# ── Business impact ───────────────────────────────────────────────────────


_SEVERITY_USER_BASE = {
    Severity.P1: 12_000,
    Severity.P2: 2_400,
    Severity.P3: 400,
}

_SEVERITY_ARPU_USD = {
    Severity.P1: 0.85,  # higher-impact flows (checkout etc) skew up
    Severity.P2: 0.45,
    Severity.P3: 0.20,
}

_SEVERITY_MTTR_MIN = {
    Severity.P1: 35,
    Severity.P2: 75,
    Severity.P3: 180,
}


def build_business_impact(analysis: AnalyzeResponse) -> BusinessImpact:
    """Synthesize business-facing impact metrics from the analysis."""
    severity = analysis.severity
    base_users = _SEVERITY_USER_BASE[severity]

    # Service-count multiplier: more affected services = wider impact.
    service_multiplier = 1.0 + 0.18 * max(0, len(analysis.affected_services) - 1)
    affected_users = int(base_users * service_multiplier)

    arpu = _SEVERITY_ARPU_USD[severity]
    # Duration multiplier from the forensic detection time, if available.
    mttd_minutes = (analysis.forensic.minutes_to_detection if analysis.forensic else None) or 5
    # Revenue at risk = users * ARPU * (estimated duration in hours)
    duration_hours = max(0.25, (mttd_minutes + _SEVERITY_MTTR_MIN[severity]) / 60.0)
    revenue_at_risk = int(affected_users * arpu * duration_hours)

    sla_breached = severity == Severity.P1 or (
        severity == Severity.P2 and len(analysis.affected_services) >= 3
    )
    sla_detail = (
        "99.9% availability SLA likely breached for the duration of the cascade."
        if sla_breached
        else "Within SLA threshold - no customer credits due."
    )

    user_segments = _infer_user_segments(analysis)
    label = _format_users(affected_users)

    return BusinessImpact(
        affected_users_estimate=affected_users,
        affected_users_label=label,
        revenue_at_risk_usd=revenue_at_risk,
        revenue_basis=(
            f"{label} × ${arpu:.2f} ARPU × {duration_hours:.1f}h "
            f"(MTTD {mttd_minutes}m + est. MTTR {_SEVERITY_MTTR_MIN[severity]}m)"
        ),
        sla_breached=sla_breached,
        sla_detail=sla_detail,
        estimated_mttr_minutes=_SEVERITY_MTTR_MIN[severity],
        customer_communication_required=sla_breached,
        user_segments=user_segments,
    )


def _format_users(n: int) -> str:
    if n >= 1_000_000:
        return f"~{n / 1_000_000:.1f}M users"
    if n >= 1_000:
        return f"~{n / 1_000:.1f}k users"
    return f"~{n} users"


def _infer_user_segments(analysis: AnalyzeResponse) -> List[str]:
    segments: List[str] = []
    if analysis.forensic:
        for entity in analysis.forensic.blast_radius:
            if entity.kind == "user_segment":
                segments.append(entity.name)
    # Heuristics from service names
    service_names = " ".join(s.name.lower() for s in analysis.affected_services)
    if "checkout" in service_names:
        segments.append("Checkout-flow users")
    if "payment" in service_names:
        segments.append("Paying customers")
    if "auth" in service_names or "login" in service_names:
        segments.append("All authenticated users")
    if "search" in service_names or "recommend" in service_names:
        segments.append("Browse-mode users")
    # De-dup while preserving order
    seen: set[str] = set()
    deduped: List[str] = []
    for seg in segments:
        if seg.lower() not in seen:
            seen.add(seg.lower())
            deduped.append(seg)
    return deduped or ["All active users on affected paths"]


# ── 5 Whys ────────────────────────────────────────────────────────────────


def build_five_whys(analysis: AnalyzeResponse) -> FiveWhys:
    """Generate a 5 Whys ladder from the analysis context.

    Uses the symptom (severity rationale) as Why #1, then chains down
    through the root cause and forensic trigger to reach a systemic
    explanation. Always produces 5 steps even with sparse input.
    """
    symptom = _first_symptom(analysis)
    root_cause = analysis.root_cause.strip().rstrip(".")
    trigger = (
        analysis.forensic.trigger_hypothesis.strip().rstrip(".")
        if analysis.forensic
        else ""
    )
    patient_zero = (
        analysis.forensic.patient_zero.detail.strip().rstrip(".")
        if analysis.forensic
        else ""
    )

    steps: List[WhyStep] = [
        WhyStep(
            n=1,
            question=f"Why did the user-visible symptom happen? - {symptom}",
            answer=f"Because {_lower_first(root_cause)}.",
        ),
        WhyStep(
            n=2,
            question="Why did that occur in the first place?",
            answer=(
                f"Because {_lower_first(trigger)}."
                if trigger
                else "Because an upstream condition allowed the failure to propagate without an early circuit-breaker."
            ),
        ),
        WhyStep(
            n=3,
            question="Why was that condition allowed to develop?",
            answer=(
                f"The earliest observable signal was: {_lower_first(patient_zero)}. "
                "It existed for minutes before user impact, but there was no alert that would have paged the on-call early enough."
                if patient_zero
                else "Because the relevant SLO indicator wasn't being measured or wasn't paging early enough."
            ),
        ),
        WhyStep(
            n=4,
            question="Why wasn't there a guardrail that caught it earlier?",
            answer=_layer_four_answer(analysis),
        ),
        WhyStep(
            n=5,
            question="Why does the system permit that class of failure at all?",
            answer=_layer_five_answer(analysis),
        ),
    ]

    counter_factual = _counter_factual(analysis)
    final_root_cause = steps[-1].answer
    return FiveWhys(
        steps=steps,
        final_root_cause=final_root_cause,
        counter_factual=counter_factual,
    )


def _first_symptom(analysis: AnalyzeResponse) -> str:
    rationale = analysis.severity_rationale.strip().rstrip(".")
    return rationale or "user-facing errors / degraded latency on a critical path"


def _layer_four_answer(analysis: AnalyzeResponse) -> str:
    # Top-priority fix tells us what guardrail was missing.
    if analysis.fixes:
        top_fix = sorted(analysis.fixes, key=lambda f: f.priority)[0]
        return (
            f"Because the safeguard described by the top remediation - "
            f"'{top_fix.title.lower()}' - was not in place or not enforced. "
            "The fix exists as a known practice but hadn't been adopted on this path."
        )
    return (
        "Because there was no automated guardrail (rate limit, circuit breaker, "
        "resource budget, or canary) that would have contained the blast radius."
    )


def _layer_five_answer(analysis: AnalyzeResponse) -> str:
    sev = analysis.severity
    if sev == Severity.P1:
        return (
            "Because the platform's reliability budget for this critical path is "
            "treated as 'best-effort' rather than 'must not break' - meaning "
            "individual teams ship without an enforced quality gate, and the "
            "absence of guardrails accumulates silently until one cascade exposes it."
        )
    if sev == Severity.P2:
        return (
            "Because non-critical paths inherit the same shared infrastructure as "
            "critical ones but without the same defensive posture - when load or "
            "leaks cross a quiet threshold, the non-critical path is the first to give."
        )
    return (
        "Because slow-burn issues on non-customer-critical paths don't trigger "
        "the same investigative urgency, so they accumulate until an alert finally fires."
    )


def _counter_factual(analysis: AnalyzeResponse) -> str:
    if not analysis.fixes:
        return ""
    top_fix = sorted(analysis.fixes, key=lambda f: f.priority)[0]
    return (
        f"If '{top_fix.title}' had already been in place, "
        "patient zero would either not have occurred or would have been auto-mitigated "
        "before any user-visible symptom - turning this from a P1 into a tracked warning."
    )


def _lower_first(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    return text[0].lower() + text[1:]
