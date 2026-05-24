"""GitHub OAuth + API helpers.

This is the connector that makes the code-fix pipeline feel like a real
SaaS integration: instead of pasting a repo URL, the user clicks
"Connect GitHub", goes through the official OAuth dance, and IncidentIQ
gets a token it can use to list their repos and clone (including
private ones) by injecting the token into the clone URL.

Hackathon scope: single-user, in-memory token store. There's no
multi-tenancy here yet - the next user who logs in just overwrites the
previous token. Production would key this by an IncidentIQ user id.
"""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_BASE = "https://api.github.com"

# Scopes we ask for. "repo" reads + writes private repos, which is more
# than we need for read-only clone, but GitHub doesn't offer a finer
# scope for private-repo read access on OAuth Apps. (GitHub Apps do.)
GITHUB_OAUTH_SCOPES = ["read:user", "repo"]


@dataclass
class GitHubSession:
    access_token: str
    login: str
    avatar_url: str
    granted_scopes: str
    obtained_at: float


class GitHubAuthService:
    """In-memory state for the OAuth dance and the current session.

    Holds:
      * ``_pending_states`` - one-shot anti-CSRF tokens we issued and are
        waiting for the callback to echo back.
      * ``_session`` - the single live :class:`GitHubSession`, or None.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pending_states: Dict[str, float] = {}
        self._session: Optional[GitHubSession] = None

    # ── Configuration ─────────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return self._settings.github_oauth_enabled

    # ── Login start (state) ───────────────────────────────────────────

    def build_authorize_url(self) -> str:
        if not self.enabled:
            raise RuntimeError(
                "GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and "
                "GITHUB_OAUTH_CLIENT_SECRET in the backend .env."
            )

        state = secrets.token_urlsafe(24)
        self._pending_states[state] = time.time()
        self._prune_expired_states()

        params = {
            "client_id": self._settings.github_oauth_client_id or "",
            "redirect_uri": self._settings.github_oauth_callback_url,
            "scope": " ".join(GITHUB_OAUTH_SCOPES),
            "state": state,
            "allow_signup": "false",
        }
        return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"

    def _prune_expired_states(self) -> None:
        cutoff = time.time() - 600  # 10 minute window
        for key in [k for k, v in self._pending_states.items() if v < cutoff]:
            self._pending_states.pop(key, None)

    def consume_state(self, state: str) -> bool:
        """One-shot consume the state. False if unknown or expired."""
        self._prune_expired_states()
        return self._pending_states.pop(state, None) is not None

    # ── Callback exchange ─────────────────────────────────────────────

    async def exchange_code(self, code: str) -> GitHubSession:
        if not self.enabled:
            raise RuntimeError("GitHub OAuth not configured")

        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                GITHUB_ACCESS_TOKEN_URL,
                data={
                    "client_id": self._settings.github_oauth_client_id,
                    "client_secret": self._settings.github_oauth_client_secret,
                    "code": code,
                    "redirect_uri": self._settings.github_oauth_callback_url,
                },
                headers={"Accept": "application/json"},
            )
            token_resp.raise_for_status()
            payload = token_resp.json()

            if "access_token" not in payload:
                raise RuntimeError(
                    f"GitHub did not return an access_token: {payload}"
                )

            access_token = payload["access_token"]
            granted_scopes = payload.get("scope", "")

            user_resp = await client.get(
                f"{GITHUB_API_BASE}/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            user_resp.raise_for_status()
            user = user_resp.json()

        session = GitHubSession(
            access_token=access_token,
            login=user.get("login", "unknown"),
            avatar_url=user.get("avatar_url", ""),
            granted_scopes=granted_scopes,
            obtained_at=time.time(),
        )
        self._session = session
        logger.info("GitHub OAuth session established for @%s", session.login)
        return session

    # ── Session access ────────────────────────────────────────────────

    @property
    def is_connected(self) -> bool:
        return self._session is not None

    @property
    def session(self) -> Optional[GitHubSession]:
        return self._session

    def disconnect(self) -> None:
        if self._session is not None:
            logger.info("GitHub OAuth session disconnected for @%s", self._session.login)
        self._session = None

    def public_status(self) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "enabled": False,
                "connected": False,
                "reason": "GitHub OAuth not configured on this server.",
            }
        if self._session is None:
            return {"enabled": True, "connected": False}
        return {
            "enabled": True,
            "connected": True,
            "login": self._session.login,
            "avatar_url": self._session.avatar_url,
            "scopes": self._session.granted_scopes,
        }

    # ── Authenticated GitHub API helpers ──────────────────────────────

    def _require_session(self) -> GitHubSession:
        if self._session is None:
            raise RuntimeError("Not connected to GitHub. Click 'Connect GitHub' first.")
        return self._session

    async def list_repos(self, per_page: int = 50) -> List[Dict[str, Any]]:
        """Return the user's most recently updated repos."""
        session = self._require_session()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/user/repos",
                params={
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": per_page,
                    "affiliation": "owner,collaborator,organization_member",
                },
                headers={
                    "Authorization": f"Bearer {session.access_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            repos = resp.json()

        # Slim payload - the frontend only needs identity + clone URL.
        return [
            {
                "full_name": r["full_name"],
                "name": r["name"],
                "private": r.get("private", False),
                "clone_url": r["clone_url"],
                "default_branch": r.get("default_branch", "main"),
                "description": r.get("description") or "",
                "updated_at": r.get("updated_at"),
                "language": r.get("language") or "",
            }
            for r in repos
        ]

    def authenticated_clone_url(self, repo_url: str) -> str:
        """Inject the access token into a clone URL.

        ``https://github.com/owner/repo.git`` becomes
        ``https://x-access-token:<token>@github.com/owner/repo.git`` which
        lets git clone private repos without an interactive credential
        prompt. If no session is active, returns the URL unchanged.
        """
        if self._session is None:
            return repo_url
        if not repo_url.startswith("https://github.com/"):
            return repo_url
        return repo_url.replace(
            "https://github.com/",
            f"https://x-access-token:{self._session.access_token}@github.com/",
            1,
        )


_service_singleton: Optional[GitHubAuthService] = None


def get_github_auth_service(settings: Settings) -> GitHubAuthService:
    """Return the process-wide GitHub auth service (single-user scope)."""
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = GitHubAuthService(settings)
    return _service_singleton
