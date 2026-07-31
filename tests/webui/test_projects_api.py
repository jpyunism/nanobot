"""Tests for the WebUI Projects controller."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any

import pytest

from nanobot.session.manager import SessionManager
from nanobot.webui.projects import (
    PROJECT_FILE_MAX_BYTES,
    PROJECT_QUOTA_TOTAL_BYTES,
    ProjectError,
    WebUIProjectsController,
    files_dir,
    project_dir,
    projects_root,
)


@pytest.fixture
def runtime_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point ``get_webui_dir`` at a tmp path so tests don't touch the host."""
    webui = tmp_path / "webui"
    webui.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(
        "nanobot.webui.projects.get_webui_dir", lambda: webui, raising=True
    )
    return webui


def _data_url(mime: str, payload: bytes) -> str:
    encoded = base64.b64encode(payload).decode()
    return f"data:{mime};base64,{encoded}"


def _fake_session_manager(workspace: Path) -> SessionManager:
    sm = SessionManager(workspace=workspace)
    return sm


def test_create_project_creates_files_layout(runtime_dir: Path) -> None:
    sm = _fake_session_manager(runtime_dir / "workspace")
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("Demo", "Covers feature X")
    assert summary.name == "Demo"
    assert (project_dir(summary.id) / "files").is_dir()
    assert (project_dir(summary.id) / "runs").is_dir()
    assert (project_dir(summary.id) / "project.json").is_file()


def test_update_project_round_trips_instructions(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("alpha", "first")
    again = controller.update_project(summary.id, instructions_md="second")
    assert again.id == summary.id
    assert controller.get_project(summary.id)["instructions_md"] == "second"


def test_delete_project_refuses_when_chat_is_bound(runtime_dir: Path) -> None:
    sm = _fake_session_manager(runtime_dir / "w")
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("p", "")
    controller.bind_chat("chat-1", summary.id)
    with pytest.raises(ProjectError) as exc:
        controller.delete_project(summary.id)
    assert exc.value.status == 409
    assert "chat-1" in exc.value.message
    controller.unbind_chat("chat-1")
    assert controller.delete_project(summary.id) is True


def test_add_file_writes_to_files_dir(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "")
    payload = b"hola mundo"
    f = controller.add_file(
        summary.id, name="note.txt", data_url=_data_url("text/plain", payload)
    )
    assert f.mime == "text/plain"
    assert f.size == len(payload)
    assert (files_dir(summary.id) / f.name).read_bytes() == payload


def test_add_file_rejects_oversized_payload(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "")
    too_big = b"x" * (PROJECT_FILE_MAX_BYTES + 1)
    with pytest.raises(ProjectError) as exc:
        controller.add_file(
            summary.id, name="big.bin", data_url=_data_url("application/octet-stream", too_big)
        )
    assert exc.value.status == 413


def test_add_file_rejects_quota_overflow(runtime_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "")
    monkeypatch.setattr(
        "nanobot.webui.projects.PROJECT_QUOTA_TOTAL_BYTES", 1024, raising=True
    )
    payload = b"x" * 900
    controller.add_file(summary.id, name="a.bin", data_url=_data_url("application/octet-stream", payload))
    with pytest.raises(ProjectError) as exc:
        controller.add_file(
            summary.id, name="b.bin", data_url=_data_url("application/octet-stream", b"y" * 300)
        )
    assert exc.value.status == 413
    assert "quota" in exc.value.message


def test_remove_file_deletes_payload(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "")
    f = controller.add_file(
        summary.id, name="note.txt", data_url=_data_url("text/plain", b"abc")
    )
    assert controller.remove_file(summary.id, f.name) is True
    assert not (files_dir(summary.id) / f.name).exists()


def test_list_files_returns_inventory(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "")
    controller.add_file(
        summary.id, name="a.txt", data_url=_data_url("text/plain", b"a")
    )
    controller.add_file(
        summary.id, name="b.txt", data_url=_data_url("text/plain", b"bb")
    )
    files = controller.list_files(summary.id)
    assert {f.name for f in files} == {"a.txt", "b.txt"}


def test_bind_and_unbind_chat_persists_metadata(runtime_dir: Path) -> None:
    workspace = runtime_dir / "w"
    sm = _fake_session_manager(workspace)
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("p", "")
    controller.bind_chat("chat-99", summary.id)
    # Force a fresh read from disk to confirm persistence.
    sm.invalidate("websocket:chat-99")
    assert controller.project_id_for_chat("chat-99") == summary.id
    controller.unbind_chat("chat-99")
    sm.invalidate("websocket:chat-99")
    assert controller.project_id_for_chat("chat-99") is None


def test_compile_first_turn_context_includes_instructions(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    summary = controller.create_project("p", "Always respond in Spanish")
    controller.add_file(
        summary.id, name="readme.md", data_url=_data_url("text/markdown", b"# Notes")
    )
    block = controller.compile_first_turn_context(summary.id, token_budget=2000)
    assert block is not None
    assert "Always respond in Spanish" in block
    assert "readme.md" in block
    assert block.startswith("<project_context>") and block.endswith("</project_context>")


def test_execute_for_chat_injects_once_then_skips(runtime_dir: Path) -> None:
    workspace = runtime_dir / "w"
    sm = _fake_session_manager(workspace)
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("p", "Mission: ship it")
    controller.bind_chat("chat-77", summary.id)
    prepend, already = controller.execute_for_chat("chat-77", token_budget=2000)
    assert already is False
    assert prepend is not None and "Mission: ship it" in prepend
    controller.persist_after_inject("chat-77")
    prepend2, already2 = controller.execute_for_chat("chat-77", token_budget=2000)
    assert already2 is True
    assert prepend2 is None


def test_execute_for_chat_returns_none_for_unbound(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    prepend, already = controller.execute_for_chat("chat-none")
    assert prepend is None and already is False


def test_list_chats_for_project_returns_bound_chats(runtime_dir: Path) -> None:
    sm = _fake_session_manager(runtime_dir / "w")
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("p", "")
    controller.bind_chat("chat-a", summary.id)
    controller.bind_chat("chat-b", summary.id)
    chats = controller.list_chats_for_project(summary.id)
    assert len(chats) == 2
    chat_ids = {c["chat_id"] for c in chats}
    assert chat_ids == {"chat-a", "chat-b"}


def test_list_chats_for_project_excludes_unbound(runtime_dir: Path) -> None:
    sm = _fake_session_manager(runtime_dir / "w")
    controller = WebUIProjectsController(session_manager=sm)
    summary = controller.create_project("p", "")
    controller.bind_chat("chat-x", summary.id)
    controller.unbind_chat("chat-x")
    chats = controller.list_chats_for_project(summary.id)
    assert len(chats) == 0


def test_list_chats_for_project_raises_on_missing(runtime_dir: Path) -> None:
    controller = WebUIProjectsController(session_manager=_fake_session_manager(runtime_dir / "w"))
    with pytest.raises(ProjectError) as exc:
        controller.list_chats_for_project("00000000-0000-0000-0000-000000000000")
    assert exc.value.status == 404
