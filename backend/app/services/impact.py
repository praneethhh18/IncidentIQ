"""Derive the 5 Whys postmortem from an analysis.

Layers 1-3 are mechanical: they restate the symptom, the LLM's root cause,
and the forensic patient-zero detail. These are already grounded in the
incident, so we don't re-summon the LLM for them.

Layers 4-5 ("missing guardrail" and "systemic cause") plus the
counter-factual need genuine reasoning about the surrounding org/process,
not the log lines. Those go through a small Bedrock call so the text is
specific to the incident instead of a templated paragraph keyed off
severity. If Bedrock isn't available, we degrade to a short, honest
statement derived from the actual root cause - never to canned prose.
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from app.models import (
    AnalyzeResponse,
    FiveWhys,
    WhyStep,
)
from app.services.bedrock import BedrockClient, BedrockUnavailable

logger = logging.getLogger(__name__)


_DEEP_WHYS_SYSTEM_PROMPT = (
    "You are an SRE postmortem facilitator finishing a 5 Whys ladder. "
    "Given the symptom, root cause, trigger and top remediation for a real "
    "incident, write the two deepest layers of the ladder plus a "
    "counter-factual. Be concrete and specific to this incident - do not "
    "speak in generalities. Reply with strict JSON only."
)

_DEEP_WHYS_SCHEMA_HINT = (
    'Return JSON with exactly these keys:\n'
    '{\n'
    '  "missing_guardrail": "one paragraph naming the specific safeguard '
    'that would have caught this earlier and why it was absent on this path",\n'
    '  "systemic_cause": "one paragraph on the organisational or '
    'architectural reason this class of failure is still possible - tie it '
    'back to the actual root cause, not generic SRE platitudes",\n'
    '  "counter_factual": "one sentence describing what specific change '
    'would have prevented patient zero from ever escalating to user impact"\n'
    '}'
)


def build_five_whys(
    analysis: AnalyzeResponse,
    bedrock: Optional[BedrockClient] = None,
) -> FiveWhys:
    """Generate a 5 Whys ladder from the analysis context.

    Layers 1-3 are derived directly from the structured analysis. Layers
    4-5 and the counter-factual come from Bedrock when available, and
    from a short root-cause-derived statement otherwise.
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

    deep = _deep_layers(analysis, bedrock)

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
                else "Because an upstream condition went unbounded; there was no early "
                "circuit-breaker on the path that failed."
            ),
        ),
        WhyStep(
            n=3,
            question="Why was that condition allowed to develop?",
            answer=(
                f"The earliest observable signal was: {_lower_first(patient_zero)}. "
                "It existed before user impact, but nothing paged the on-call early enough."
                if patient_zero
                else "Because the relevant SLO indicator wasn't measured, or wasn't paging early enough."
            ),
        ),
        WhyStep(
            n=4,
            question="Why wasn't there a guardrail that caught it earlier?",
            answer=deep["missing_guardrail"],
        ),
        WhyStep(
            n=5,
            question="Why does the system permit that class of failure at all?",
            answer=deep["systemic_cause"],
        ),
    ]

    return FiveWhys(
        steps=steps,
        final_root_cause=steps[-1].answer,
        counter_factual=deep["counter_factual"],
    )


# ── Deep layers (Bedrock-backed) ──────────────────────────────────────────


def _deep_layers(
    analysis: AnalyzeResponse,
    bedrock: Optional[BedrockClient],
) -> dict:
    """Return {missing_guardrail, systemic_cause, counter_factual}.

    Calls Bedrock when available; otherwise returns short statements
    derived from the actual root cause and top fix. Never returns
    templated severity-keyed prose.
    """
    if bedrock is not None and bedrock.enabled:
        try:
            return _llm_deep_layers(analysis, bedrock)
        except BedrockUnavailable as exc:
            logger.warning("5 Whys deep layers fell back; bedrock error: %s", exc)
        except Exception:  # noqa: BLE001
            logger.exception("5 Whys deep layers fell back on unexpected error")

    return _fallback_deep_layers(analysis)


def _llm_deep_layers(analysis: AnalyzeResponse, bedrock: BedrockClient) -> dict:
    user_prompt = _build_deep_prompt(analysis)
    raw = bedrock.converse_json(
        system_prompt=_DEEP_WHYS_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=900,
        temperature=0.3,
    )

    missing = str(raw.get("missing_guardrail", "")).strip()
    systemic = str(raw.get("systemic_cause", "")).strip()
    counter = str(raw.get("counter_factual", "")).strip()

    if not (missing and systemic):
        # Model returned malformed payload; degrade gracefully.
        raise BedrockUnavailable("incomplete 5 Whys payload")

    return {
        "missing_guardrail": missing,
        "systemic_cause": systemic,
        "counter_factual": counter,
    }


def _build_deep_prompt(analysis: AnalyzeResponse) -> str:
    top_fix = (
        sorted(analysis.fixes, key=lambda f: f.priority)[0] if analysis.fixes else None
    )
    forensic = analysis.forensic

    payload = {
        "title": analysis.title,
        "severity": analysis.severity.value,
        "symptom": analysis.severity_rationale,
        "root_cause": analysis.root_cause,
        "trigger_hypothesis": forensic.trigger_hypothesis if forensic else "",
        "patient_zero": forensic.patient_zero.detail if forensic else "",
        "propagation_path": forensic.propagation_path if forensic else [],
        "top_fix_title": top_fix.title if top_fix else "",
        "top_fix_action": top_fix.action if top_fix else "",
    }

    return (
        "Incident facts (JSON):\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{_DEEP_WHYS_SCHEMA_HINT}"
    )


def _fallback_deep_layers(analysis: AnalyzeResponse) -> dict:
    """Honest, root-cause-grounded text used when Bedrock can't answer.

    No severity-keyed templates, no canned 'reliability budget' prose -
    just a short statement that names the actual root cause and top fix
    so the ladder still completes.
    """
    root_cause = analysis.root_cause.strip().rstrip(".")
    top_fix = (
        sorted(analysis.fixes, key=lambda f: f.priority)[0] if analysis.fixes else None
    )

    if top_fix:
        missing = (
            f"The safeguard captured by '{top_fix.title}' was not in place on this path; "
            f"the remediation ({top_fix.action}) is the gap that let the cascade through."
        )
        counter = (
            f"If '{top_fix.title}' had already been deployed on this path, patient zero "
            "would have been contained before user-visible symptoms appeared."
        )
    else:
        missing = (
            "No automated guardrail (rate limit, circuit breaker, resource budget, "
            "or canary) was contesting the failure on this path."
        )
        counter = ""

    systemic = (
        f"This class of failure remains possible because '{root_cause}' is still a "
        "reachable state from normal operating conditions - the codepath that produced "
        "it lacks an enforced invariant that would make it unreachable."
    )

    return {
        "missing_guardrail": missing,
        "systemic_cause": systemic,
        "counter_factual": counter,
    }


# ── Helpers ────────────────────────────────────────────────────────────────


def _first_symptom(analysis: AnalyzeResponse) -> str:
    rationale = analysis.severity_rationale.strip().rstrip(".")
    return rationale or "user-facing errors / degraded latency on a critical path"


def _lower_first(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    return text[0].lower() + text[1:]
