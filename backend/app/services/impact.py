"""Derive the 5 Whys postmortem from an analysis.

The 5 Whys ladder is computed locally from the structured analysis the
LLM already produced. We don't make another LLM call for it - instead
we chain plain-language Qs and As keyed on the root cause, forensic
trigger, and top fix. This keeps latency flat and ensures the ladder
is present even when running on demo fallback.

(A previous version of this module also synthesised a 'Business Impact'
view with affected-users / revenue-at-risk / MTTR estimates. That has
been removed because the numbers were heuristic - they were derived
from hard-coded severity dictionaries, not measured data - and showing
fabricated dollar figures alongside real telemetry was dishonest.)
"""

from __future__ import annotations

from typing import List

from app.models import (
    AnalyzeResponse,
    FiveWhys,
    Severity,
    WhyStep,
)


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
