"""AWS Bedrock client — Amazon Nova Pro inference for root-cause analysis."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from app.core.config import Settings

logger = logging.getLogger(__name__)


class BedrockUnavailable(RuntimeError):
    """Raised when Bedrock is not configured or the call fails irrecoverably."""


class BedrockClient:
    """Thin wrapper around the Bedrock Runtime ``Converse`` API.

    The Converse API normalises payloads across foundation models. We use it
    so the same code path works for Nova Pro today and for any future model
    swap (Nova Premier, Claude on Bedrock, etc.).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

        if not settings.bedrock_enabled:
            logger.info("Bedrock disabled — AWS credentials not configured")
            return

        try:
            import boto3  # local import keeps cold-start cheap when unused

            self._client = boto3.client(
                "bedrock-runtime",
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
            logger.info(
                "Bedrock client ready: region=%s model=%s",
                settings.aws_region,
                settings.bedrock_model_id,
            )
        except Exception:  # noqa: BLE001 — startup must never crash
            logger.exception("Failed to initialise Bedrock client")
            self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @property
    def model_id(self) -> str:
        return self._settings.bedrock_model_id

    def converse_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 2048,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """Call Bedrock and parse the response as a JSON object.

        Raises :class:`BedrockUnavailable` when the client is not configured
        or the response cannot be parsed as JSON.
        """
        if self._client is None:
            raise BedrockUnavailable("Bedrock client is not configured")

        try:
            response = self._client.converse(
                modelId=self._settings.bedrock_model_id,
                system=[{"text": system_prompt}],
                messages=[{"role": "user", "content": [{"text": user_prompt}]}],
                inferenceConfig={
                    "maxTokens": max_tokens,
                    "temperature": temperature,
                    "topP": 0.9,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bedrock converse call failed")
            raise BedrockUnavailable(str(exc)) from exc

        text = _extract_text(response)
        return _parse_json_strict(text)


def _extract_text(response: Dict[str, Any]) -> str:
    """Extract the assistant message text from a Converse response."""
    try:
        return response["output"]["message"]["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise BedrockUnavailable(f"Unexpected Bedrock response shape: {exc!r}") from exc


def _parse_json_strict(text: str) -> Dict[str, Any]:
    """Parse model output as JSON, tolerating leading/trailing prose."""
    text = text.strip()
    if text.startswith("```"):
        # Strip ```json fences if the model ignored instructions.
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last-ditch: find the outermost {...} object.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError as exc:
                raise BedrockUnavailable(
                    f"Model returned non-JSON output: {exc}"
                ) from exc
        raise BedrockUnavailable("Model returned non-JSON output")
