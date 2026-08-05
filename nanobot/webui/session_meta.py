"""Per-chat project binding persistence.

Lives in ``session.metadata`` so it survives normal session read/write paths
without introducing a new on-disk file. Both the binding (``project_id``)
and the one-shot inject flag (``_project_context_injected``) travel
together: setting ``project_id`` resets the flag so the next turn reinjects
the block; clearing ``project_id`` removes both keys.
"""

from __future__ import annotations

from typing import Any

CHAT_PROJECT_ID_METADATA_KEY = "project_id"
CHAT_PROJECT_INJECTED_FLAG = "_project_context_injected"
CHAT_TODO_LIST_METADATA_KEY = "todo_list"
CHAT_AGENDA_APPOINTMENT_METADATA_KEY = "agenda_appointment"


def chat_project_id_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    """Return the project id bound to a chat, or ``None`` if unbound."""
    if not isinstance(metadata, dict):
        return None
    raw = metadata.get(CHAT_PROJECT_ID_METADATA_KEY)
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    return cleaned or None


def set_chat_project_id(
    session: Any,
    project_id: str | None,
) -> None:
    """Bind or unbind a session to a project. Resets the inject flag.

    Pass ``None`` to unbind. The caller is responsible for ``session.save()``.
    """
    if not hasattr(session, "metadata") or not isinstance(session.metadata, dict):
        return
    if project_id is None:
        session.metadata.pop(CHAT_PROJECT_ID_METADATA_KEY, None)
        session.metadata.pop(CHAT_PROJECT_INJECTED_FLAG, None)
        return
    cleaned = project_id.strip()
    if not cleaned:
        session.metadata.pop(CHAT_PROJECT_ID_METADATA_KEY, None)
        session.metadata.pop(CHAT_PROJECT_INJECTED_FLAG, None)
        return
    session.metadata[CHAT_PROJECT_ID_METADATA_KEY] = cleaned
    session.metadata[CHAT_PROJECT_INJECTED_FLAG] = False


def mark_project_context_injected(session: Any) -> None:
    """Flag the session so the project context block is not prepended again."""
    if not hasattr(session, "metadata") or not isinstance(session.metadata, dict):
        return
    session.metadata[CHAT_PROJECT_INJECTED_FLAG] = True


def chat_todo_list_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    """Return the todo list slug bound to a chat, or ``None`` if unbound."""
    if not isinstance(metadata, dict):
        return None
    raw = metadata.get(CHAT_TODO_LIST_METADATA_KEY)
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    return cleaned or None


def set_chat_todo_list(session: Any, todo_list: str | None) -> None:
    """Bind or unbind a session to a todo list.

    Pass ``None`` or an empty string to unbind. The caller is responsible for
    ``session.save()``.
    """
    if not hasattr(session, "metadata") or not isinstance(session.metadata, dict):
        return
    if todo_list is None:
        session.metadata.pop(CHAT_TODO_LIST_METADATA_KEY, None)
        return
    cleaned = todo_list.strip()
    if not cleaned:
        session.metadata.pop(CHAT_TODO_LIST_METADATA_KEY, None)
        return
    session.metadata[CHAT_TODO_LIST_METADATA_KEY] = cleaned


def chat_agenda_appointment_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    """Return the agenda appointment id bound to a chat, or ``None`` if unbound."""
    if not isinstance(metadata, dict):
        return None
    raw = metadata.get(CHAT_AGENDA_APPOINTMENT_METADATA_KEY)
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    return cleaned or None


def set_chat_agenda_appointment(session: Any, appointment_id: str | None) -> None:
    """Bind or unbind a session to an agenda appointment.

    Pass ``None`` or an empty string to unbind. The caller is responsible for
    ``session.save()``.
    """
    if not hasattr(session, "metadata") or not isinstance(session.metadata, dict):
        return
    if appointment_id is None:
        session.metadata.pop(CHAT_AGENDA_APPOINTMENT_METADATA_KEY, None)
        return
    cleaned = appointment_id.strip()
    if not cleaned:
        session.metadata.pop(CHAT_AGENDA_APPOINTMENT_METADATA_KEY, None)
        return
    session.metadata[CHAT_AGENDA_APPOINTMENT_METADATA_KEY] = cleaned
