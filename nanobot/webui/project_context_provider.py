"""Runtime context provider that injects a bound project's metadata into the first turn.

The provider reads ``session.metadata["project_id"]`` (set by the WebUI
HTTP routes in ``ws_http.py``) and, on the first turn after binding,
returns a :class:`RuntimeContextBlock` with the project's name,
instructions, and file list. Subsequent turns skip the block — the agent
already has the context.

The provider is wired in by the gateway during startup, not by the agent
loop directly, so the agent core stays unaware of the WebUI feature.
"""

from __future__ import annotations

from loguru import logger

from nanobot.runtime_context import (
    RuntimeContextBlock,
    compile_project_context,
)
from nanobot.webui.projects import WebUIProjectsController
from nanobot.webui.session_meta import (
    CHAT_PROJECT_ID_METADATA_KEY,
    CHAT_PROJECT_INJECTED_FLAG,
    chat_project_id_from_metadata,
    mark_project_context_injected,
)


def make_project_context_provider(
    session_manager: object,
    projects: WebUIProjectsController,
):
    """Return a runtime-context provider bound to *session_manager* and *projects*."""

    async def provider(request) -> RuntimeContextBlock | None:
        session_key = getattr(request, "session_key", None)
        if not isinstance(session_key, str) or not session_key:
            return None
        read_session = getattr(session_manager, "read_session_metadata", None)
        if not callable(read_session):
            return None
        meta = read_session(session_key)
        if not isinstance(meta, dict):
            return None
        metadata = meta.get("metadata", {})
        if not isinstance(metadata, dict):
            return None
        project_id = chat_project_id_from_metadata(metadata)
        if not project_id:
            return None
        if metadata.get(CHAT_PROJECT_INJECTED_FLAG) is True:
            return None
        block = compile_project_context(projects, project_id)
        if block is None:
            return None
        get_or_create = getattr(session_manager, "get_or_create", None)
        save = getattr(session_manager, "save", None)
        if callable(get_or_create) and callable(save):
            try:
                session = get_or_create(session_key)
                if isinstance(getattr(session, "metadata", None), dict):
                    session.metadata[CHAT_PROJECT_ID_METADATA_KEY] = project_id
                    mark_project_context_injected(session)
                    save(session)
            except OSError as exc:
                logger.warning("failed to persist project-context flag: {}", exc)
        return block

    provider.__name__ = "project_context_provider"
    return provider
