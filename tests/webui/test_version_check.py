"""Tests for the on-demand version checker (GitHub-based)."""

from __future__ import annotations

import time

import pytest

from nanobot import __version__
from nanobot.webui import version_check


@pytest.fixture(autouse=True)
def _reset_cache():
    """Reset the module-level cache before each test."""
    version_check._cache = (0.0, None)
    yield
    version_check._cache = (0.0, None)


def _bump(version: str) -> str:
    parts = [int(p) for p in version.split(".")]
    parts[-1] += 1
    return ".".join(str(p) for p in parts)


def test_update_available_when_remote_newer(monkeypatch) -> None:
    latest = _bump(__version__)
    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        lambda: latest,
    )
    result = version_check.check_for_update()
    assert result is not None
    assert result["currentVersion"] == __version__
    assert result["latestVersion"] == latest
    assert result["githubUrl"] == "https://github.com/madkoding/nanobot"


def test_up_to_date_when_remote_equal(monkeypatch) -> None:
    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        lambda: __version__,
    )
    assert version_check.check_for_update() is None


def test_up_to_date_when_remote_older(monkeypatch) -> None:
    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        lambda: "0.0.1",
    )
    assert version_check.check_for_update() is None


def test_network_error_returns_none(monkeypatch) -> None:
    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        lambda: None,
    )
    assert version_check.check_for_update() is None


def test_invalid_remote_version_returns_none(monkeypatch) -> None:
    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        lambda: "not-a-version",
    )
    assert version_check.check_for_update() is None


def test_cache_ttl_avoids_repeated_remote_calls(monkeypatch) -> None:
    latest = _bump(__version__)
    calls = {"n": 0}

    def fake_fetch() -> str:
        calls["n"] += 1
        return latest

    monkeypatch.setattr(
        "nanobot.webui.version_check.get_remote_pyproject_version",
        fake_fetch,
    )
    assert version_check.check_for_update() is not None
    assert version_check.check_for_update() is not None
    assert calls["n"] == 1

    # Expire the cache: a new call should hit the remote again.
    version_check._cache = (time.monotonic() - version_check._CACHE_TTL_S - 1, latest)
    assert version_check.check_for_update() is not None
    assert calls["n"] == 2
