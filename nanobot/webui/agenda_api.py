"""WebUI Agenda API.

CRUD over a single JSON file ``<workspace>/agenda/appointments.json`` with
this shape::

    {
      "appointments": [
        {
          "id": "uuid",
          "title": "Cita medica",
          "date": "2026-08-04",
          "time": "09:30",
          "all_day": false,
          "description": "Control anual",
          "category": "health",
          "color": "#ef4444",
          "created_at": "ISO",
          "updated_at": "ISO"
        }
      ]
    }

Mutations are atomic (write to a temp file then ``os.replace`` + fsync).
All public functions take a :class:`WorkspaceScope` and return ``{"error": ...}``
dicts on failure rather than raising.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from nanobot.security.workspace_access import WorkspaceScope
from nanobot.security.workspace_policy import (
    WorkspaceBoundaryError,
    resolve_allowed_path,
)
from nanobot.utils.atomic_write import atomic_write_text

AGENDA_DIR_NAME = "agenda"
AGENDA_FILENAME = "appointments.json"
AGENDA_APPOINTMENT_METADATA_KEY = "agenda_appointment"

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")

# Known categories with default colors. Users can override the color per
# appointment; this table provides sensible defaults.
DEFAULT_CATEGORIES: dict[str, str] = {
    "personal": "#3b82f6",
    "work": "#10b981",
    "health": "#ef4444",
    "reminder": "#f59e0b",
    "journal": "#8b5cf6",
    "other": "#64748b",
}

_APPOINTMENT_MUTABLE_FIELDS = (
    "title",
    "date",
    "time",
    "all_day",
    "description",
    "category",
    "color",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _workspace_root(scope: WorkspaceScope) -> Path:
    return scope.project_path


def _agenda_dir(scope: WorkspaceScope) -> Path:
    return _workspace_root(scope) / AGENDA_DIR_NAME


def _resolve_agenda_dir(scope: WorkspaceScope, *, create: bool = False) -> Path:
    """Return the agenda dir path, optionally creating it. Jails to workspace."""
    workspace = _workspace_root(scope)
    allowed_root = workspace if scope.restrict_to_workspace else None
    try:
        resolved = resolve_allowed_path(
            AGENDA_DIR_NAME,
            workspace=workspace,
            allowed_root=allowed_root,
            strict=False,
        )
    except (WorkspaceBoundaryError, OSError, ValueError) as exc:
        raise ValueError(f"agenda dir is outside workspace boundary: {exc}") from exc
    if create and not resolved.exists():
        resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def _agenda_file(scope: WorkspaceScope) -> Path:
    return _agenda_dir(scope) / AGENDA_FILENAME


def _atomic_write(path: Path, data: dict[str, Any]) -> None:
    encoded = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    atomic_write_text(path, encoded)


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _is_valid_date(value: Any) -> bool:
    return isinstance(value, str) and bool(_DATE_RE.fullmatch(value))


def _is_valid_time(value: Any) -> bool:
    return value is None or (isinstance(value, str) and bool(_TIME_RE.fullmatch(value)))


def _normalize_appointment(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    category = str(raw.get("category") or "other")
    color = raw.get("color")
    if not isinstance(color, str) or not color.strip():
        color = DEFAULT_CATEGORIES.get(category, DEFAULT_CATEGORIES["other"])
    all_day = bool(raw.get("all_day") or False)
    time_value = raw.get("time")
    # all_day appointments must have null time; timed appointments must have time.
    if all_day:
        time_value = None
    return {
        "id": str(raw.get("id") or uuid.uuid4()),
        "title": str(raw.get("title") or ""),
        "date": str(raw.get("date") or ""),
        "time": time_value,
        "all_day": all_day,
        "description": str(raw.get("description") or ""),
        "category": category,
        "color": color,
        "created_at": str(raw.get("created_at") or _now_iso()),
        "updated_at": str(raw.get("updated_at") or _now_iso()),
    }


def _normalize_data(raw: dict[str, Any]) -> dict[str, Any]:
    appts_raw = raw.get("appointments")
    appts = [_normalize_appointment(x) for x in appts_raw] if isinstance(appts_raw, list) else []
    return {"appointments": appts}


def _read_agenda(scope: WorkspaceScope) -> dict[str, Any]:
    """Return the agenda data, creating an empty store if missing."""
    try:
        agenda_dir = _resolve_agenda_dir(scope)
    except ValueError:
        return {"appointments": []}
    path = agenda_dir / AGENDA_FILENAME
    raw = _read_json_file(path)
    if raw is None:
        return {"appointments": []}
    return _normalize_data(raw)


def _write_agenda(scope: WorkspaceScope, data: dict[str, Any]) -> None:
    agenda_dir = _resolve_agenda_dir(scope, create=True)
    _atomic_write(agenda_dir / AGENDA_FILENAME, _normalize_data(data))


def _validate_appointment_fields(appt: dict[str, Any], *, require_date: bool = True) -> str | None:
    """Return an error string if the appointment is invalid, else None."""
    title = str(appt.get("title") or "").strip()
    if not title:
        return "title is required"
    if require_date and not _is_valid_date(appt.get("date")):
        return "date must be a YYYY-MM-DD string"
    if not _is_valid_time(appt.get("time")):
        return "time must be an HH:MM string or null"
    return None


# -- Public API ----------------------------------------------------------------


def list_appointments(scope: WorkspaceScope) -> dict[str, Any]:
    """Return all appointments sorted by date and time."""
    try:
        agenda_dir = _resolve_agenda_dir(scope)
    except ValueError as e:
        return {"error": str(e), "appointments": []}
    if not agenda_dir.is_dir():
        return {"appointments": []}
    path = agenda_dir / AGENDA_FILENAME
    raw = _read_json_file(path)
    if raw is None:
        return {"appointments": []}
    data = _normalize_data(raw)
    appts = sorted(
        data["appointments"],
        key=lambda a: (a.get("date") or "", a.get("time") or ""),
    )
    return {"appointments": appts}


def fetch_appointment(appointment_id: str, scope: WorkspaceScope) -> dict[str, Any]:
    try:
        agenda_dir = _resolve_agenda_dir(scope)
    except ValueError as e:
        return {"error": str(e)}
    if not agenda_dir.is_dir():
        return {"error": "agenda directory does not exist"}
    data = _read_agenda(scope)
    for appt in data.get("appointments", []):
        if appt.get("id") == appointment_id:
            return {"appointment": appt}
    return {"error": f"appointment '{appointment_id}' not found"}


def create_appointment(payload: dict[str, Any], scope: WorkspaceScope) -> dict[str, Any]:
    appt = _normalize_appointment(payload)
    err = _validate_appointment_fields(appt)
    if err is not None:
        return {"error": err}
    data = _read_agenda(scope)
    appt["created_at"] = _now_iso()
    appt["updated_at"] = appt["created_at"]
    data.setdefault("appointments", []).append(appt)
    try:
        _write_agenda(scope, data)
    except ValueError as e:
        return {"error": str(e)}
    return {"appointment": appt}


def update_appointment(
    appointment_id: str,
    changes: dict[str, Any],
    scope: WorkspaceScope,
) -> dict[str, Any]:
    data = _read_agenda(scope)
    target = None
    for appt in data.get("appointments", []):
        if appt.get("id") == appointment_id:
            target = appt
            break
    if target is None:
        return {"error": f"appointment '{appointment_id}' not found"}
    changed = False
    for field in _APPOINTMENT_MUTABLE_FIELDS:
        if field in changes:
            target[field] = changes[field]
            changed = True
    # Re-normalize to keep all_day/time consistency. If the caller did not
    # explicitly provide a color, drop the existing one so the default color
    # for the (possibly new) category is applied.
    if "color" not in changes:
        target.pop("color", None)
    merged = _normalize_appointment(target)
    target.clear()
    target.update(merged)
    err = _validate_appointment_fields(target)
    if err is not None:
        return {"error": err}
    if changed:
        target["updated_at"] = _now_iso()
        try:
            _write_agenda(scope, data)
        except ValueError as e:
            return {"error": str(e)}
    return {"appointment": target}


def delete_appointment(appointment_id: str, scope: WorkspaceScope) -> dict[str, Any]:
    data = _read_agenda(scope)
    before = len(data.get("appointments", []))
    data["appointments"] = [
        x for x in data.get("appointments", []) if x.get("id") != appointment_id
    ]
    if len(data["appointments"]) == before:
        return {"error": f"appointment '{appointment_id}' not found"}
    try:
        _write_agenda(scope, data)
    except ValueError as e:
        return {"error": str(e)}
    return {"ok": True, "id": appointment_id}
