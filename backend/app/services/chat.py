"""Follow-up chat tied to an incident's analysis.

Once an incident has been analysed, the user can keep talking to the
agent about it: simplify the explanation, ask for an alternative fix,
request a specific runbook snippet, etc. We feed the original analysis
into the chat as system context so every response stays grounded in
that incident.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from textwrap import dedent
from typing import List

from app.models import AnalyzeResponse, ChatMessage
from app.services.bedrock import BedrockClient, BedrockUnavailable

logger = logging.getLogger(__name__)


def build_chat_system_prompt(analysis: AnalyzeResponse) -> str:
    """Compose the system prompt for follow-up chat on this incident.

    Embeds the structured analysis so the model can answer questions
    without losing the incident context. We strip noisy fields (raw
    agent steps, full evidence) to keep the system prompt cheap.
    """
    severity = analysis.severity.value
    services = ", ".join(s.name for s in analysis.affected_services) or "no services identified"
    top_fix = (
        sorted(analysis.fixes, key=lambda f: f.priority)[0]
        if analysis.fixes
        else None
    )

    forensic_block = ""
    if analysis.forensic:
        forensic_block = dedent(
            f"""
            Forensic findings:
              Patient zero: {analysis.forensic.patient_zero.detail}
              Trigger hypothesis: {analysis.forensic.trigger_hypothesis}
              Propagation path: {' -> '.join(analysis.forensic.propagation_path)}
            """
        ).strip()

    return dedent(
        f"""
        You are IncidentIQ, the same SRE agent who analysed this incident.
        The user is now asking follow-up questions about it. Stay grounded
        in the analysis you produced; do not invent new facts.

        Style:
          - Plain English, no fluff.
          - Format any command or code in a markdown fence.
          - If the analysis doesn't cover what the user asked, say so;
            do not guess.

        When the user asks "how to fix" / "what command should I run" / any
        remediation question, structure your answer as three layers and
        label them. Never drop a single command in isolation:

          1. Immediate mitigation (minutes) - stop the bleeding so users
             stop seeing impact. Usually rollback, traffic shift, or
             feature flag flip. Include the exact command.
          2. Stabilise (within the hour) - reduce blast radius and add the
             missing guardrail. Include the exact command AND a one-line
             verify step ("now run X to confirm").
          3. Root-cause fix (next change) - what actually has to change in
             code, config, or design to make the failure mode unreachable.
             Be specific about what to investigate; do not say "optimise"
             or "review the code" without naming the suspect.

        Critical: if a fix only raises a limit (memory, pool size, retry
        count, timeout), call it out as a band-aid in one sentence and
        still give the layer-3 root cause. Bumping a limit on a leak just
        delays the next failure.

        When the user asks for an explanation, simplification, or context,
        answer in 1-3 short paragraphs. Skip the layered structure.

        --- ORIGINAL ANALYSIS ---
        Incident: {analysis.incident_id}
        Title: {analysis.title}
        Severity: {severity}
        Affected services: {services}
        Root cause: {analysis.root_cause}
        Severity rationale: {analysis.severity_rationale}

        {forensic_block}

        Top fix: {top_fix.title if top_fix else 'n/a'}
        Top fix action: {top_fix.action if top_fix else 'n/a'}
        Top fix snippet: {top_fix.snippet if top_fix and top_fix.snippet else 'n/a'}

        Summary: {analysis.summary}
        --- END ANALYSIS ---
        """
    ).strip()


def run_chat_turn(
    *,
    analysis: AnalyzeResponse,
    user_message: str,
    bedrock: BedrockClient,
) -> ChatMessage:
    """Append a user message + assistant reply to the incident's chat history.

    Returns the new assistant ``ChatMessage``. Mutates the analysis's
    ``chat_history`` in place so the caller can persist it.
    """
    now = datetime.now(timezone.utc)
    user_msg = ChatMessage(role="user", content=user_message.strip(), timestamp=now)
    analysis.chat_history.append(user_msg)

    if not bedrock.enabled:
        reply = _heuristic_reply(user_message, analysis)
    else:
        try:
            system_prompt = build_chat_system_prompt(analysis)
            history_payload = [
                {"role": m.role, "content": m.content}
                for m in analysis.chat_history
                if m.content.strip()
            ]
            reply = bedrock.chat(
                system_prompt=system_prompt,
                messages=history_payload,
                max_tokens=600,
                temperature=0.4,
            )
        except BedrockUnavailable as exc:
            logger.warning("Chat fell back to heuristic reply: %s", exc)
            reply = _heuristic_reply(user_message, analysis)

    assistant_msg = ChatMessage(
        role="assistant",
        content=reply,
        timestamp=datetime.now(timezone.utc),
    )
    analysis.chat_history.append(assistant_msg)
    return assistant_msg


def _heuristic_reply(message: str, analysis: AnalyzeResponse) -> str:
    """Deterministic fallback when Bedrock is unavailable.

    Looks at the user's question shape and replies from the analysis.
    Keeps demo mode functional end-to-end.
    """
    lower = message.lower()
    if any(k in lower for k in ("simplif", "explain", "plain")):
        return (
            f"In plain English: {analysis.root_cause} "
            f"This caused {len(analysis.affected_services)} services to behave incorrectly "
            f"and was rated {analysis.severity.value} because {analysis.severity_rationale.lower()}"
        )
    if any(k in lower for k in ("fix", "how do i", "command", "snippet")):
        if analysis.fixes:
            top = sorted(analysis.fixes, key=lambda f: f.priority)[0]
            snippet_block = f"\n\n```\n{top.snippet}\n```" if top.snippet else ""
            return (
                f"Start with the top fix: **{top.title}**.\n\n"
                f"{top.action}{snippet_block}"
            )
        return "No fix recommendations were attached to this analysis."
    if any(k in lower for k in ("similar", "before", "history")):
        return (
            "Check the History tab for past incidents that share keywords with "
            "this one. The agent already searched the local store during the original "
            "analysis."
        )
    if "deep trace" in lower or "more detail" in lower:
        if analysis.deep_trace:
            return (
                "Deep Trace has already been run on this incident. Scroll to the "
                "'Deep Trace - Emergency Investigator' panel for the hidden bugs "
                "and per-service probe results."
            )
        return "Click the **Run Deep Trace** button on this incident to escalate."
    return (
        "I can simplify the analysis, walk through the top fix, or help interpret "
        "the timeline. Try asking 'simplify the root cause' or 'how do I fix this?'."
    )
