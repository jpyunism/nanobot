"""On-demand version checker for nanobot-ai releases.

Checks the madkoding/nanobot main branch on GitHub for newer versions when
explicitly requested (no background polling). The update flow itself is
git-based (see ``nanobot.utils.update``), so GitHub is the source of truth
rather than PyPI.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from packaging.version import InvalidVersion, Version

from nanobot import __version__
from nanobot.utils.update import get_remote_pyproject_version

logger = logging.getLogger(__name__)

GITHUB_REPO_URL = "https://github.com/madkoding/nanobot"
_CACHE_TTL_S = 300  # 5 minutes cache to avoid hammering the GitHub API

_cache: tuple[float, str | None] = (0.0, None)


def check_for_update() -> dict[str, Any] | None:
    """Check madkoding/nanobot main for a newer version. Returns update info or None.

    Uses a short cache to avoid repeated requests within the TTL window.
    This is a blocking call — invoke from a thread or background task.
    """
    global _cache
    now = time.monotonic()
    cached_at, cached_val = _cache
    if now - cached_at < _CACHE_TTL_S and cached_val is not None:
        latest = cached_val
    else:
        latest = get_remote_pyproject_version()
        if latest is not None:
            _cache = (now, latest)

    if not latest:
        return None
    try:
        remote = Version(latest)
        local = Version(__version__)
    except InvalidVersion:
        logger.debug("invalid remote version %r", latest)
        return None
    if remote <= local:
        return None
    return {
        "currentVersion": __version__,
        "latestVersion": latest,
        "githubUrl": GITHUB_REPO_URL,
    }
