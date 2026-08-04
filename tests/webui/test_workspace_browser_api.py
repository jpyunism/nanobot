"""Tests for the WebUI workspace browser API helpers."""

from __future__ import annotations

from nanobot.security.workspace_access import default_workspace_scope
from nanobot.webui.workspace_browser_api import (
    NANOBOT_RUNTIME_PROTECTED,
    is_protected_runtime_path,
    workspace_copy,
    workspace_create_directory,
    workspace_delete,
    workspace_list_files,
    workspace_move,
    workspace_rename,
    workspace_write_file,
)


def _scope(tmp_path, restrict_to_workspace: bool = True):
    return default_workspace_scope(tmp_path, restrict_to_workspace=restrict_to_workspace)


def test_list_files_marks_protected_runtime_paths(tmp_path):
    scope = _scope(tmp_path)
    for name in NANOBOT_RUNTIME_PROTECTED:
        if name.endswith(".json") or name.endswith(".md"):
            (tmp_path / name).write_text("x", encoding="utf-8")
        else:
            (tmp_path / name).mkdir()
    (tmp_path / "normal.txt").write_text("hello", encoding="utf-8")

    payload = workspace_list_files(scope)

    assert payload.get("error") is None
    by_name = {f["name"]: f for f in payload["files"]}
    for name in NANOBOT_RUNTIME_PROTECTED:
        assert by_name[name]["protected"] is True
    assert by_name["normal.txt"]["protected"] is False


def test_list_files_hides_secrets_and_hidden_files(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / ".env").write_text("secret", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "visible.txt").write_text("ok", encoding="utf-8")

    payload = workspace_list_files(scope)

    by_name = {f["name"]: f for f in payload["files"]}
    assert ".env" not in by_name
    assert ".git" not in by_name
    assert "node_modules" not in by_name
    assert "visible.txt" in by_name


def test_protected_runtime_only_applies_to_workspace_root(tmp_path):
    scope = _scope(tmp_path)
    nested = tmp_path / "proyects" / "foo" / "sessions"
    nested.mkdir(parents=True)

    payload = workspace_list_files(scope, subpath="proyects/foo")

    by_name = {f["name"]: f for f in payload["files"]}
    assert by_name["sessions"]["protected"] is False


def test_delete_normal_file_succeeds(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "deleteme.txt").write_text("bye", encoding="utf-8")

    result = workspace_delete("deleteme.txt", scope)

    assert result.get("success") is True
    assert not (tmp_path / "deleteme.txt").exists()


def test_delete_protected_runtime_path_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "sessions").mkdir()

    result = workspace_delete("sessions", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]
    assert (tmp_path / "sessions").exists()


def test_delete_sensitive_hidden_file_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / ".env").write_text("secret", encoding="utf-8")

    result = workspace_delete(".env", scope)

    assert result.get("success") is None
    assert "restricted" in result["error"]


def test_rename_protected_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "users.json").write_text("{}", encoding="utf-8")

    result = workspace_rename("users.json", "users-old.json", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_rename_to_protected_name_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "normal.txt").write_text("ok", encoding="utf-8")

    result = workspace_rename("normal.txt", "users.json", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_move_from_protected_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "sessions").mkdir()
    (tmp_path / "backup").mkdir()

    result = workspace_move("sessions", "backup", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_move_to_protected_directory_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "sessions").mkdir()
    (tmp_path / "file.txt").write_text("x", encoding="utf-8")

    result = workspace_move("file.txt", "sessions", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_move_normal_file_succeeds(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "src").mkdir()
    (tmp_path / "dst").mkdir()
    (tmp_path / "src" / "file.txt").write_text("x", encoding="utf-8")

    result = workspace_move("src/file.txt", "dst", scope)

    assert result.get("success") is True
    assert not (tmp_path / "src" / "file.txt").exists()
    assert (tmp_path / "dst" / "file.txt").exists()


def test_copy_from_protected_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "AGENTS.md").write_text("x", encoding="utf-8")
    (tmp_path / "backup").mkdir()

    result = workspace_copy("AGENTS.md", "backup", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_copy_to_protected_directory_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "memory").mkdir()
    (tmp_path / "file.txt").write_text("x", encoding="utf-8")

    result = workspace_copy("file.txt", "memory", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]


def test_create_protected_directory_rejected(tmp_path):
    scope = _scope(tmp_path)

    result = workspace_create_directory("sessions", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]
    assert not (tmp_path / "sessions").exists()


def test_write_protected_file_rejected(tmp_path):
    scope = _scope(tmp_path)
    (tmp_path / "HEARTBEAT.md").write_text("ok", encoding="utf-8")

    result = workspace_write_file("HEARTBEAT.md", "new content", scope)

    assert result.get("success") is None
    assert "required for nanobot to function" in result["error"]
    assert (tmp_path / "HEARTBEAT.md").read_text(encoding="utf-8") == "ok"


def test_is_protected_runtime_path_helper(tmp_path):
    (tmp_path / "sessions").mkdir()
    (tmp_path / "proyects").mkdir()
    (tmp_path / "proyects" / "sessions").mkdir()

    assert is_protected_runtime_path(tmp_path / "sessions", tmp_path) is True
    assert is_protected_runtime_path(tmp_path / "proyects", tmp_path) is False
    assert is_protected_runtime_path(tmp_path / "proyects" / "sessions", tmp_path) is False
