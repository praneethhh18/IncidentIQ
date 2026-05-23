"""SendGrid email notifier.

Sends a single templated email when an incident transitions to
``resolved``. Uses SendGrid's v3 REST API directly via httpx so we don't
need to pull in the official SDK. Authenticated with a single
``SENDGRID_API_KEY``.

Email sending is intentionally best-effort: failures are logged but
never block the incident update pipeline.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.models import AnalyzeResponse

logger = logging.getLogger(__name__)

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"


class EmailNotifier:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def enabled(self) -> bool:
        return self._settings.email_enabled

    async def send_resolution(
        self, *, analysis: AnalyzeResponse, dashboard_base_url: str = ""
    ) -> bool:
        """Send a 'this incident appears resolved' email. Returns success bool."""
        if not self.enabled:
            return False

        subject = f"[Resolved] {analysis.incident_id} - {analysis.title[:80]}"
        body_html = self._build_html(analysis, dashboard_base_url)
        body_text = self._build_text(analysis, dashboard_base_url)

        payload: dict[str, Any] = {
            "personalizations": [
                {
                    "to": [{"email": self._settings.notify_email}],
                    "subject": subject,
                }
            ],
            "from": {
                "email": self._settings.sendgrid_from_email,
                "name": "IncidentIQ",
            },
            "content": [
                {"type": "text/plain", "value": body_text},
                {"type": "text/html", "value": body_html},
            ],
        }

        headers = {
            "Authorization": f"Bearer {self._settings.sendgrid_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.post(SENDGRID_URL, json=payload, headers=headers)
                if response.status_code >= 400:
                    logger.warning(
                        "SendGrid returned %s: %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return False
                return True
        except Exception:  # noqa: BLE001
            logger.exception("SendGrid send failed")
            return False

    def _build_text(self, a: AnalyzeResponse, base: str) -> str:
        link = f"{base}/incidents/{a.incident_id}" if base else f"/incidents/{a.incident_id}"
        return (
            f"Incident {a.incident_id} appears resolved.\n\n"
            f"Title: {a.title}\n"
            f"Severity: {a.severity.value}\n"
            f"Root cause: {a.root_cause}\n"
            f"Resolution note: {a.resolution_summary or 'Error pattern no longer observed.'}\n\n"
            f"View incident: {link}\n\n"
            f"IncidentIQ"
        )

    def _build_html(self, a: AnalyzeResponse, base: str) -> str:
        link = f"{base}/incidents/{a.incident_id}" if base else f"/incidents/{a.incident_id}"
        return f"""
        <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;
                    background:#09090b;color:#fafafa;padding:32px;max-width:560px;
                    margin:auto;border-radius:14px;">
          <div style="display:inline-block;padding:4px 10px;border-radius:9999px;
                      background:rgba(34,197,94,0.12);color:#86efac;
                      border:1px solid rgba(34,197,94,0.3);font-size:11px;
                      font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">
            Resolved
          </div>
          <h2 style="margin:14px 0 6px;font-size:22px;line-height:1.3;">
            {a.title}
          </h2>
          <div style="color:#a1a1aa;font-size:13px;">
            {a.incident_id} &nbsp;&middot;&nbsp; {a.severity.value}
          </div>
          <hr style="border:none;border-top:1px solid #27272a;margin:18px 0;">
          <p style="color:#d4d4d8;line-height:1.5;font-size:14px;">
            <strong style="color:#fafafa;">Root cause:</strong> {a.root_cause}
          </p>
          <p style="color:#d4d4d8;line-height:1.5;font-size:14px;">
            <strong style="color:#fafafa;">Resolution:</strong>
            {a.resolution_summary or 'Error pattern no longer observed on recheck.'}
          </p>
          <a href="{link}"
             style="display:inline-block;margin-top:18px;padding:10px 16px;
                    background:#fafafa;color:#09090b;text-decoration:none;
                    border-radius:8px;font-weight:600;font-size:13px;">
            View incident
          </a>
          <p style="color:#71717a;font-size:11px;margin-top:24px;">
            Sent by IncidentIQ. Reply to this incident in the dashboard.
          </p>
        </div>
        """
