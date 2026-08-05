"""Tests for the WebUI todos API (per-list CRUD + legacy migration)."""

from __future__ import annotations

import json

from nanobot.security.workspace_access import default_workspace_scope
from nanobot.webui.todos_api import (
    create_item,
    create_todo_list,
    delete_item,
    delete_todo_list,
    fetch_todo_list,
    fetch_users,
    list_todo_lists,
    migrate_legacy,
    update_item,
    update_users,
)


def _scope(tmp_path, restrict_to_workspace: bool = True):
    return default_workspace_scope(tmp_path, restrict_to_workspace=restrict_to_workspace)


def test_list_todo_lists_empty_when_no_dir(tmp_path):
    scope = _scope(tmp_path)
    payload = list_todo_lists(scope=scope)
    assert payload == {"lists": []}


def test_create_list_and_fetch(tmp_path):
    scope = _scope(tmp_path)
    res = create_todo_list("Compras", scope=scope)
    assert res.get("slug") == "compras"
    assert res.get("item_count") == 0
    detail = fetch_todo_list("compras", scope=scope)
    assert detail["list"]["name"] == "Compras"
    assert detail["list"]["items"] == []
    assert detail["users"] == {}


def test_create_list_slugifies_and_avoids_collisions(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Compras!!!", scope=scope)
    second = create_todo_list("Compras", scope=scope)
    assert second["slug"] == "compras-2"


def test_create_and_update_item(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    res = create_item("lista", {"text": "café"}, scope=scope)
    item_id = res["item"]["id"]
    assert res["item"]["done"] is False
    assert res["item"]["done_at"] is None
    # Toggle done
    updated = update_item("lista", item_id, {"done": True}, scope=scope)
    assert updated["item"]["done"] is True
    assert updated["item"]["done_at"] is not None
    # Update price + due_date
    updated = update_item(
        "lista",
        item_id,
        {"price_clp": 3000, "due_date": "2026-12-31"},
        scope=scope,
    )
    assert updated["item"]["price_clp"] == 3000
    assert updated["item"]["due_date"] == "2026-12-31"
    # Unmark done resets done_at
    updated = update_item("lista", item_id, {"done": False}, scope=scope)
    assert updated["item"]["done"] is False
    assert updated["item"]["done_at"] is None


def test_delete_item(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    res = create_item("lista", {"text": "a"}, scope=scope)
    item_id = res["item"]["id"]
    deleted = delete_item("lista", item_id, scope=scope)
    assert deleted["ok"] is True
    detail = fetch_todo_list("lista", scope=scope)
    assert detail["list"]["items"] == []


def test_delete_list(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    res = delete_todo_list("lista", scope=scope)
    assert res["ok"] is True
    assert list_todo_lists(scope=scope)["lists"] == []


def test_assignee_defaults_to_provided_value(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    res = create_item("lista", {"text": "x", "assignee": "madkoding"}, scope=scope)
    assert res["item"]["assignee"] == "madkoding"


def test_update_users_and_fetch(tmp_path):
    scope = _scope(tmp_path)
    res = update_users(
        {"users": {"madkoding": {"name": "madKoding", "phone": "569", "authorized": True}}},
        scope=scope,
    )
    assert "madkoding" in res["users"]
    fetched = fetch_users(scope=scope)
    assert fetched["users"]["madkoding"]["name"] == "madKoding"
    assert fetched["users"]["madkoding"]["authorized"] is True


def test_migrate_legacy_splits_users_into_lists(tmp_path):
    scope = _scope(tmp_path)
    todo_dir = tmp_path / "todo"
    todo_dir.mkdir()
    (todo_dir / "todos.json").write_text(
        json.dumps(
            {
                "users": {
                    "madkoding": {"name": "madKoding", "phone": "569", "authorized": True},
                    "mow": {"name": "Mow", "phone": "5", "authorized": True},
                },
                "lists": {
                    "madkoding": [
                        {
                            "id": "x1",
                            "text": "A",
                            "done": False,
                            "created": "2026-01-01T00:00:00+00:00",
                        }
                    ],
                    "mow": [
                        {
                            "id": "y1",
                            "text": "B",
                            "done": True,
                            "created": "2026-01-01T00:00:00+00:00",
                            "done_at": "2026-01-02T00:00:00+00:00",
                            "price_clp": 3000,
                        }
                    ],
                },
            }
        ),
        encoding="utf-8",
    )
    res = migrate_legacy(scope=scope)
    assert res["migrated"] is True
    assert sorted(res["lists"]) == ["madkoding", "mow"]
    assert "madkoding" in res["users"]
    # Legacy file renamed
    assert not (todo_dir / "todos.json").exists()
    assert (todo_dir / "todos.json.migrated").exists()

    # Lists now visible
    lists = list_todo_lists(scope=scope)["lists"]
    assert {item["slug"] for item in lists} == {"madkoding", "mow"}

    # Items carry assignee
    detail = fetch_todo_list("mow", scope=scope)
    assert detail["list"]["items"][0]["assignee"] == "mow"
    assert detail["list"]["items"][0]["done"] is True
    assert detail["list"]["items"][0]["price_clp"] == 3000


def test_migrate_legacy_idempotent(tmp_path):
    scope = _scope(tmp_path)
    todo_dir = tmp_path / "todo"
    todo_dir.mkdir()
    (todo_dir / "todos.json").write_text(
        json.dumps(
            {
                "users": {"madkoding": {"name": "madKoding", "phone": "569", "authorized": True}},
                "lists": {"madkoding": []},
            }
        ),
        encoding="utf-8",
    )
    migrate_legacy(scope=scope)
    # Second call: legacy file is gone, so no-op
    res = migrate_legacy(scope=scope)
    assert res["migrated"] is False


def test_migrate_legacy_when_no_file_is_noop(tmp_path):
    scope = _scope(tmp_path)
    res = migrate_legacy(scope=scope)
    assert res["migrated"] is False
    assert res["lists"] == []


def test_atomic_write_leaves_no_partial_file_on_error(tmp_path, monkeypatch):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    # Snapshot the file content before a failed write
    detail_before = fetch_todo_list("lista", scope=scope)
    # Force os.replace to fail
    import nanobot.webui.todos_api as mod

    real_replace = mod.os.replace

    def failing_replace(src, dst):
        raise OSError("boom")

    monkeypatch.setattr(mod.os, "replace", failing_replace)
    raised = False
    try:
        create_item("lista", {"text": "x"}, scope=scope)
    except OSError:
        raised = True
    finally:
        mod.os.replace = real_replace
    assert raised is True
    # The list file should still be readable and intact (no partial write, no tmp left)
    detail = fetch_todo_list("lista", scope=scope)
    assert detail["list"]["items"] == detail_before["list"]["items"]
    assert not (tmp_path / "todo" / "lista.json.tmp").exists()


def test_migrate_legacy_transfers_transfer_info_into_notes(tmp_path):
    scope = _scope(tmp_path)
    todo_dir = tmp_path / "todo"
    todo_dir.mkdir()
    (todo_dir / "todos.json").write_text(
        json.dumps(
            {
                "users": {"madkoding": {"name": "madKoding", "phone": "569", "authorized": True}},
                "lists": {
                    "madkoding": [
                        {
                            "id": "x1",
                            "text": "Pagar arriendo",
                            "done": False,
                            "created": "2026-01-01T00:00:00+00:00",
                            "transfer_info": {
                                "bank": "BancoEstado",
                                "account_type": "Cuenta Vista",
                                "account_number": "1234",
                                "rut": "11.111.111-1",
                            },
                        }
                    ]
                },
            }
        ),
        encoding="utf-8",
    )
    migrate_legacy(scope=scope)
    detail = fetch_todo_list("madkoding", scope=scope)
    item = detail["list"]["items"][0]
    assert item["notes"] is not None
    assert "BancoEstado" in item["notes"]
    assert "account_number: 1234" in item["notes"]
    assert "transfer_info" not in item


def test_notes_roundtrip(tmp_path):
    scope = _scope(tmp_path)
    create_todo_list("Lista", scope=scope)
    res = create_item(
        "lista",
        {"text": "x", "notes": "dirección: calle 1\ncod: 42"},
        scope=scope,
    )
    assert res["item"]["notes"] == "dirección: calle 1\ncod: 42"
    updated = update_item("lista", res["item"]["id"], {"notes": None}, scope=scope)
    assert updated["item"]["notes"] is None


def test_restrict_to_workspace_blocks_escape(tmp_path):
    scope = _scope(tmp_path)
    # Writing a slug with path separators should be rejected by _is_valid_slug
    res = create_todo_list("../escape", scope=scope)
    # _slugify turns "../escape" into "escape"
    assert res.get("slug") == "escape"
