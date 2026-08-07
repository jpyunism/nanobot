"""Tests for message classification importance scoring."""

from __future__ import annotations

from nanobot.agent.message_classifier import (
    _CLASSIFY_CACHE,
    _CLASSIFY_CACHE_MAX,
    _classify_cached,
    classify_message,
    compute_importance,
)


def _reset_cache():
    _CLASSIFY_CACHE.clear()


def _user(text: str) -> dict:
    return {"role": "user", "content": text}


def test_compute_importance_uses_category_dict():
    assert compute_importance(_user("usemos X")) == 0.95
    assert compute_importance(_user("x")) == 0.10
    assert compute_importance({}, category="decision") == 0.95


def test_classify_cached_memoizes_by_identity():
    _reset_cache()
    msg = _user("configurar el puerto 8080")
    assert classify_message(msg) == "config"
    # Second classification is served from cache.
    assert _classify_cached(msg) == "config"
    assert len(_CLASSIFY_CACHE) == 1
    _reset_cache()


def test_classify_cached_skips_cache_for_tool_results():
    _reset_cache()
    tool = {"role": "tool", "content": "x" * 600}
    assert _classify_cached(tool) == "tool_result_medium"
    assert len(_CLASSIFY_CACHE) == 0
    _reset_cache()


def test_tool_result_small_has_explicit_importance():
    _reset_cache()
    small = {"role": "tool", "content": "ok"}
    assert classify_message(small) == "tool_result_small"
    assert compute_importance(small) == 0.45
    _reset_cache()


def test_cache_bounded():
    _reset_cache()
    for i in range(_CLASSIFY_CACHE_MAX + 100):
        _classify_cached(_user(f"mensaje {i}"))
    assert len(_CLASSIFY_CACHE) <= _CLASSIFY_CACHE_MAX
    _reset_cache()
