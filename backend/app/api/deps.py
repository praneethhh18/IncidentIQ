"""Shared FastAPI dependencies — singleton services for request handlers."""

from __future__ import annotations

from threading import Lock

from app.core.config import get_settings
from app.services.analyzer import Analyzer
from app.services.bedrock import BedrockClient
from app.services.github_auth import GitHubAuthService, get_github_auth_service
from app.services.integrations import IntegrationRegistry
from app.services.store import AnalysisStore, get_store

_bedrock_singleton: BedrockClient | None = None
_registry_singleton: IntegrationRegistry | None = None
_lock = Lock()


def _ensure_singletons() -> tuple[BedrockClient, IntegrationRegistry]:
    global _bedrock_singleton, _registry_singleton
    if _bedrock_singleton is None or _registry_singleton is None:
        with _lock:
            if _bedrock_singleton is None:
                _bedrock_singleton = BedrockClient(get_settings())
            if _registry_singleton is None:
                _registry_singleton = IntegrationRegistry(get_settings())
    return _bedrock_singleton, _registry_singleton


def get_bedrock() -> BedrockClient:
    bedrock, _ = _ensure_singletons()
    return bedrock


def get_integrations() -> IntegrationRegistry:
    _, registry = _ensure_singletons()
    return registry


def get_analyzer() -> Analyzer:
    bedrock, registry = _ensure_singletons()
    return Analyzer(get_settings(), bedrock, registry)


def get_analysis_store() -> AnalysisStore:
    return get_store()


def get_github_auth() -> GitHubAuthService:
    return get_github_auth_service(get_settings())
