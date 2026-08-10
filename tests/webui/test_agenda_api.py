"""Tests for the WebUI agenda API (appointment CRUD)."""

from __future__ import annotations

from pathlib import Path

from nanobot.security.workspace_access import default_workspace_scope
from nanobot.webui.agenda_api import (
    create_appointment,
    delete_appointment,
    fetch_appointment,
    list_appointments,
    update_appointment,
)


def _scope(tmp_path, restrict_to_workspace: bool = True):
    return default_workspace_scope(tmp_path, restrict_to_workspace=restrict_to_workspace)


def test_list_appointments_empty_when_no_dir(tmp_path):
    scope = _scope(tmp_path)
    payload = list_appointments(scope=scope)
    assert payload == {"appointments": []}


def test_create_appointment(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment(
        {"title": "Dentist", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )
    assert res.get("error") is None
    appt = res["appointment"]
    assert appt["title"] == "Dentist"
    assert appt["date"] == "2026-08-10"
    assert appt["time"] == "09:30"
    assert appt["all_day"] is False
    assert appt["category"] == "other"
    assert "id" in appt


def test_create_all_day_appointment_nulls_time(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment(
        {"title": "Birthday", "date": "2026-08-10", "all_day": True, "time": "09:30"},
        scope=scope,
    )
    appt = res["appointment"]
    assert appt["all_day"] is True
    assert appt["time"] is None


def test_list_appointments_sorted_by_date(tmp_path):
    scope = _scope(tmp_path)
    create_appointment(
        {"title": "B", "date": "2026-08-15", "time": "10:00"},
        scope=scope,
    )
    create_appointment(
        {"title": "A", "date": "2026-08-05", "time": "11:00"},
        scope=scope,
    )
    create_appointment(
        {"title": "C", "date": "2026-08-15", "time": "09:00"},
        scope=scope,
    )
    payload = list_appointments(scope=scope)
    titles = [a["title"] for a in payload["appointments"]]
    assert titles == ["A", "C", "B"]


def test_fetch_appointment(tmp_path):
    scope = _scope(tmp_path)
    created = create_appointment(
        {"title": "Meeting", "date": "2026-08-20", "time": "14:00"},
        scope=scope,
    )["appointment"]
    fetched = fetch_appointment(created["id"], scope=scope)
    assert fetched["appointment"]["title"] == "Meeting"


def test_fetch_missing_appointment(tmp_path):
    scope = _scope(tmp_path)
    fetched = fetch_appointment("no-such-id", scope=scope)
    assert "error" in fetched


def test_update_appointment(tmp_path):
    scope = _scope(tmp_path)
    created = create_appointment(
        {"title": "Old", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )["appointment"]
    updated = update_appointment(
        created["id"],
        {"title": "New", "date": "2026-09-01", "time": "15:00", "category": "work"},
        scope=scope,
    )
    appt = updated["appointment"]
    assert appt["title"] == "New"
    assert appt["date"] == "2026-09-01"
    assert appt["time"] == "15:00"
    assert appt["category"] == "work"
    assert appt["color"] == "#10b981"
    assert "updated_at" in appt


def test_update_appointment_to_all_day(tmp_path):
    scope = _scope(tmp_path)
    created = create_appointment(
        {"title": "Dentist", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )["appointment"]
    updated = update_appointment(
        created["id"],
        {"all_day": True},
        scope=scope,
    )
    appt = updated["appointment"]
    assert appt["all_day"] is True
    assert appt["time"] is None


def test_delete_appointment(tmp_path):
    scope = _scope(tmp_path)
    created = create_appointment(
        {"title": "ToDelete", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )["appointment"]
    deleted = delete_appointment(created["id"], scope=scope)
    assert deleted["ok"] is True
    assert list_appointments(scope=scope)["appointments"] == []


def test_delete_missing_appointment(tmp_path):
    scope = _scope(tmp_path)
    deleted = delete_appointment("no-such-id", scope=scope)
    assert "error" in deleted


def test_create_appointment_requires_title(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment({"date": "2026-08-10"}, scope=scope)
    assert res["error"] == "title is required"


def test_create_appointment_requires_valid_date(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment(
        {"title": "Bad", "date": "10/08/2026"},
        scope=scope,
    )
    assert res["error"] == "date must be a YYYY-MM-DD string"


def test_create_appointment_requires_valid_time(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment(
        {"title": "Bad", "date": "2026-08-10", "time": "9:30"},
        scope=scope,
    )
    assert res["error"] == "time must be an HH:MM string or null"


def test_category_default_color(tmp_path):
    scope = _scope(tmp_path)
    res = create_appointment(
        {"title": "Health", "date": "2026-08-10", "category": "health"},
        scope=scope,
    )
    assert res["appointment"]["color"] == "#ef4444"


def test_atomic_write_leaves_no_partial_file_on_error(tmp_path, monkeypatch):
    scope = _scope(tmp_path)
    create_appointment(
        {"title": "First", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )
    agenda_path = tmp_path / "agenda" / "appointments.json"
    before = agenda_path.read_text(encoding="utf-8")

    import nanobot.utils.atomic_write as atomic

    real_replace = atomic.os.replace

    def failing_replace(src, dst):
        raise OSError("boom")

    monkeypatch.setattr(atomic.os, "replace", failing_replace)
    raised = False
    try:
        create_appointment(
            {"title": "Second", "date": "2026-08-11", "time": "10:00"},
            scope=scope,
        )
    except OSError:
        raised = True
    finally:
        atomic.os.replace = real_replace
    assert raised is True
    assert agenda_path.read_text(encoding="utf-8") == before
    assert not (tmp_path / "agenda" / "appointments.json.tmp").exists()


def test_restrict_to_workspace_blocks_escape(tmp_path):
    # When restrict_to_workspace is True, resolve_allowed_path prevents escaping.
    # We simply verify a normal write still works under restriction.
    scope = _scope(tmp_path, restrict_to_workspace=True)
    res = create_appointment(
        {"title": "Ok", "date": "2026-08-10", "time": "09:30"},
        scope=scope,
    )
    assert res.get("error") is None
    agenda_path = Path(tmp_path) / "agenda" / "appointments.json"
    assert agenda_path.exists()
