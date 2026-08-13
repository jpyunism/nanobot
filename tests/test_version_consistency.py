"""Version consistency: pyproject.toml (canonical semver) must match webui/package.json.

Fails if they diverge. Prevents the WebUI from shipping a stale version number
that disagrees with the Python package.
"""
from __future__ import annotations

import json
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _pyproject_version() -> str:
    data = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    version = data["project"]["version"]
    assert isinstance(version, str) and version
    return version


def _webui_version() -> str:
    data = json.loads((REPO_ROOT / "webui" / "package.json").read_text(encoding="utf-8"))
    version = data["version"]
    assert isinstance(version, str) and version
    return version


def test_webui_package_json_matches_pyproject_version() -> None:
    assert _webui_version() == _pyproject_version(), (
        "webui/package.json and pyproject.toml versions diverge. "
        "Run `python scripts/sync_versions.py` to sync."
    )
