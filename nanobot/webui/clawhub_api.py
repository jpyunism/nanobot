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
    """Split an install reference like ``owner/slug`` into (owner, slug).

    Handles skills.sh references (``skills-sh:owner/repo/slug`` or
    ``owner/repo@slug``) by stripping the prefix, so the owner shown in
    the UI is the GitHub user/org (``vercel-labs``), not
    ``skills-sh:vercel-labs``.
    """
    ref = reference.strip()
    if ref.startswith("skills-sh:"):
        ref = ref[len("skills-sh:") :].strip()
    parts = ref.split("/")
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return "", reference


def _summary_payload(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a ClawHub search/trending item into a safe summary."""
    install = item.get("install") or {}
    reference = install.get("reference") or item.get("slug") or ""
    owner, slug = _split_reference(reference)
    metrics = item.get("metrics") or {}
    rolling = metrics.get("rolling60DayInstalls")
    lifetime = metrics.get("lifetimeInstalls")
    # Trending items do not carry rolling60DayInstalls; fall back to the
    # best available install metric so sorting stays meaningful.
    installs = int(rolling) if rolling is not None else int(lifetime or 0)
    return {
        "slug": slug,
        "owner": owner,
        "reference": reference,
        "name": item.get("displayName") or slug,
        "description": (item.get("summary") or "").strip(),
        "installs_60d": installs,
        "lifetime_installs": int(lifetime or 0),
        "downloads": int(item.get("downloads") or 0),
        "kind": install.get("kind") or "clawhub",
    }


_INSTALLABLE_KINDS = {"clawhub", "skills-sh"}


def clawhub_search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search the ClawHub registry by natural language query.

    Only installable kinds are returned: ``clawhub`` (downloaded from the
    ClawHub download API) and ``skills-sh`` (downloaded from their GitHub
    source repository, see :func:`skills_sh_install`).
    """
    query = query.strip()
    if not query:
        return []
    data = _get(
        _SEARCH_PATH,
        {"q": query, "limit": max(1, min(limit, _MAX_RESULTS))},
    )
    results = data.get("results") or []
    payloads = [
        _summary_payload(item)
        for item in results
        if isinstance(item, dict) and (item.get("install") or {}).get("kind") in _INSTALLABLE_KINDS
    ]
    payloads.sort(key=lambda s: s["installs_60d"], reverse=True)
    return payloads


def clawhub_trending(limit: int = 20) -> list[dict[str, Any]]:
    """Return trending skills from the ClawHub registry, most installed first.

    Only installable kinds are returned (see ``clawhub_search``).
    """
    data = _get(
        _TRENDING_PATH,
        {"limit": max(1, min(limit, _MAX_RESULTS))},
    )
    items = data.get("items") or []
    payloads = [
        _summary_payload(item)
        for item in items
        if isinstance(item, dict) and (item.get("install") or {}).get("kind") in _INSTALLABLE_KINDS
    ]
    payloads.sort(key=lambda s: s["installs_60d"], reverse=True)
    return payloads


def _clawhub_download_install(reference: str, skills_dir: Path) -> dict[str, Any]:
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


def skills_sh_install(reference: str, skills_dir: Path) -> dict[str, Any]:
    """Install a ``skills-sh`` skill from its GitHub source repository.

    The skills.sh API itself requires a Vercel OIDC token, but skills are
    plain folders in GitHub repos, so we install them straight from the
    source: ``skills-sh:owner/repo/slug`` (or ``owner/repo@slug``) maps to
    the GitHub repo ``owner/repo`` and the skill folder ``<slug>`` inside
    it (conventionally under ``skills/<slug>/``). Files are downloaded from
    the repo tree and extracted into ``skills_dir/<slug>/``.
    """
    ref = reference.strip()
    if ref.startswith("skills-sh:"):
        ref = ref[len("skills-sh:") :].strip()
    if "@" in ref:
        owner_repo, slug = ref.rsplit("@", 1)
    else:
        parts = ref.split("/")
        if len(parts) != 3:
            raise ClawhubError(
                "Invalid skills-sh reference (expected owner/repo/slug)"
            )
        owner_repo, slug = "/".join(parts[:2]), parts[2]
    owner, sep, repo = owner_repo.partition("/")
    if not sep or not owner or not repo or not slug:
        raise ClawhubError("Invalid skills-sh reference (expected owner/repo/slug)")

    branch = _github_default_branch(owner, repo)
    try:
        tree = _github_get_json(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        )
    except ClawhubError as exc:
        raise ClawhubError(f"Could not read the skill repository: {exc}") from exc
    entries = tree.get("tree") if isinstance(tree, dict) else None
    if not isinstance(entries, list):
        raise ClawhubError("Could not read the skill repository tree")

    skill_paths = _skill_folder_paths(entries, slug)
    if not skill_paths:
        raise ClawhubError(
            f"Skill '{slug}' not found in {owner}/{repo} (looked for a '{slug}/SKILL.md' folder)"
        )
    prefix = skill_paths[0]  # deterministic: prefers skills/<slug>, then */<slug>
    files = [entry["path"] for entry in entries if entry["path"].startswith(prefix + "/")]

    target = skills_dir / slug
    target.mkdir(parents=True, exist_ok=True)
    for path in files:
        if not path.endswith("/"):
            resolved = (target / path[len(prefix) + 1 :]).resolve()
            if not resolved.is_relative_to(target.resolve()):
                raise ClawhubError("Skill source contains unsafe paths")
            resolved.parent.mkdir(parents=True, exist_ok=True)
            resolved.write_bytes(
                _github_get_raw(
                    f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
                )
            )

    return {"slug": slug, "installed": True, "path": str(target), "source": "skills-sh"}


def _github_default_branch(owner: str, repo: str) -> str:
    """Resolve the repository's default branch (needed for raw URLs)."""
    data = _github_get_json(f"https://api.github.com/repos/{owner}/{repo}")
    branch = data.get("default_branch")
    if not isinstance(branch, str) or not branch:
        raise ClawhubError("Could not resolve the repository default branch")
    return branch


def _github_get_json(url: str) -> dict[str, Any]:
    try:
        response = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True)
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as exc:
        raise ClawhubError(f"GitHub responded {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise ClawhubError(f"Could not reach GitHub: {exc}") from exc
    except ValueError as exc:
        raise ClawhubError("GitHub returned an invalid response") from exc
    if not isinstance(data, dict):
        raise ClawhubError("GitHub returned an invalid response")
    return data


def _github_get_raw(url: str) -> bytes:
    try:
        response = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True)
        response.raise_for_status()
        return response.content
    except httpx.HTTPStatusError as exc:
        raise ClawhubError(f"GitHub responded {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise ClawhubError(f"Could not reach GitHub: {exc}") from exc


def _skill_folder_paths(entries: list[dict[str, Any]], slug: str) -> list[str]:
    """Return candidate skill folder paths (containing SKILL.md) sorted by preference.

    The skills.sh convention is ``skills/<slug>/SKILL.md``; we prefer that,
    then any ``*/<slug>/SKILL.md``, then ``<slug>/SKILL.md`` at the root.
    """
    skl = slug.lower()
    candidates: list[str] = []
    for entry in entries:
        path = entry.get("path") or ""
        if path.endswith(f"/{slug}/SKILL.md") or path.endswith(f"/{skl}/SKILL.md"):
            folder = path[: -len("/SKILL.md")]
            candidates.append(folder)
    if not candidates:
        return []
    def _rank(folder: str) -> tuple[int, int]:
        parts = folder.split("/")
        if len(parts) == 2 and parts[0].lower() == "skills":
            return (0, 0)
        return (1, len(parts))
    candidates.sort(key=_rank)
    return candidates


def clawhub_install(reference: str, skills_dir: Path) -> dict[str, Any]:
    """Install a skill from ClawHub or skills.sh by reference.

    References starting with ``skills-sh:`` (or ``owner/repo@slug``) are
    installed from their GitHub source; anything else goes through the
    ClawHub download API.
    """
    if reference.strip().startswith("skills-sh:") or (
        reference.count("/") == 1 and "@" in reference
    ):
        return skills_sh_install(reference, skills_dir)
    return _clawhub_download_install(reference, skills_dir)
