"""ClawHub registry integration for the WebUI.

Talks to the public ClawHub registry (https://clawhub.ai) so the Skills
settings section can browse and install skills without leaving the WebUI.

Search/trending hit the public JSON API; install downloads the skill zip
and extracts it into the workspace skills directory (same layout the
``clawhub`` CLI produces with ``--workdir``).
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any

import httpx

CLAWHUB_API = "https://clawhub.ai"
_SEARCH_PATH = "/api/v1/search"
_TRENDING_PATH = "/api/v1/trending"
_DOWNLOAD_PATH = "/api/v1/download"
_TIMEOUT = 15.0
_MAX_RESULTS = 50


class ClawhubError(Exception):
    """Raised when the ClawHub registry call fails."""


def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = httpx.get(
            f"{CLAWHUB_API}{path}",
            params=params,
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as exc:
        raise ClawhubError(f"ClawHub responded {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise ClawhubError(f"Could not reach ClawHub: {exc}") from exc
    except ValueError as exc:
        raise ClawhubError("ClawHub returned an invalid response") from exc
    if not isinstance(data, dict):
        raise ClawhubError("ClawHub returned an invalid response")
    return data


def _split_reference(reference: str) -> tuple[str, str]:
    """Split an install reference like ``owner/slug`` into (owner, slug)."""
    parts = reference.split("/")
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return "", reference


def _summary_payload(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a ClawHub search/trending item into a safe summary."""
    install = item.get("install") or {}
    reference = install.get("reference") or item.get("slug") or ""
    owner, slug = _split_reference(reference)
    metrics = item.get("metrics") or {}
    return {
        "slug": slug,
        "owner": owner,
        "reference": reference,
        "name": item.get("displayName") or slug,
        "description": (item.get("summary") or "").strip(),
        "installs_60d": int(metrics.get("rolling60DayInstalls") or 0),
        "downloads": int(item.get("downloads") or 0),
        "kind": install.get("kind") or "clawhub",
    }


def clawhub_search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search the ClawHub registry by natural language query."""
    query = query.strip()
    if not query:
        return []
    data = _get(
        _SEARCH_PATH,
        {"q": query, "limit": max(1, min(limit, _MAX_RESULTS))},
    )
    results = data.get("results") or []
    return [_summary_payload(item) for item in results if isinstance(item, dict)]


def clawhub_trending(limit: int = 20) -> list[dict[str, Any]]:
    """Return trending skills from the ClawHub registry."""
    data = _get(
        _TRENDING_PATH,
        {"limit": max(1, min(limit, _MAX_RESULTS))},
    )
    items = data.get("items") or []
    return [_summary_payload(item) for item in items if isinstance(item, dict)]


def clawhub_install(reference: str, skills_dir: Path) -> dict[str, Any]:
    """Download and install a ClawHub skill into ``skills_dir``.

    ``reference`` is the install reference (``owner/slug``). The zip is
    extracted into ``skills_dir/<slug>/``, matching the layout the
    ``clawhub`` CLI produces.
    """
    reference = reference.strip()
    if not reference or "/" not in reference:
        raise ClawhubError("Invalid skill reference")
    owner, slug = _split_reference(reference)
    if not owner or not slug:
        raise ClawhubError("Invalid skill reference")

    try:
        response = httpx.get(
            f"{CLAWHUB_API}{_DOWNLOAD_PATH}",
            params={"slug": slug, "ownerHandle": owner},
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        response.raise_for_status()
        raw = response.content
    except httpx.HTTPStatusError as exc:
        raise ClawhubError(f"ClawHub responded {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise ClawhubError(f"Could not reach ClawHub: {exc}") from exc

    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except (TypeError, zipfile.BadZipFile) as exc:
        raise ClawhubError("ClawHub returned an invalid skill archive") from exc

    target = skills_dir / slug
    target.mkdir(parents=True, exist_ok=True)
    for member in archive.namelist():
        # Guard against zip-slip: never write outside the target directory.
        resolved = (target / member).resolve()
        if not resolved.is_relative_to(target.resolve()):
            raise ClawhubError("Skill archive contains unsafe paths")
        if member.endswith("/"):
            resolved.mkdir(parents=True, exist_ok=True)
            continue
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_bytes(archive.read(member))

    return {"slug": slug, "installed": True, "path": str(target)}
