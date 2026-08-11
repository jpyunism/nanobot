"""Per-group workspace registry for WhatsApp.

Maps WhatsApp group JIDs (e.g. ``120363000@g.us``) to a workspace directory
whose ``AGENTS.md``/``SOUL.md`` override the channel-level workspace for turns
originating in that group. Backed by a literal ``dict[str, str]`` from
``WhatsAppConfig.group_workspaces`` — no filesystem walks, no auto-creation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from loguru import logger

from nanobot.utils.helpers import truncate_text


def is_group_jid(chat_id: str) -> bool:
    """Return True if *chat_id* looks like a WhatsApp group JID."""
    return "@g.us" in chat_id


class GroupWorkspaceRegistry:
    """Resolve a workspace directory for a given WhatsApp chat."""

    _MAX_RULESET_CHARS = 8_000

    def __init__(self, mapping: Mapping[str, str] | None, log: Any | None = None) -> None:
        self._log = log or logger
        self._paths: dict[str, Path] = {}
        for raw_jid, raw_path in (mapping or {}).items():
            jid = str(raw_jid).strip()
            if not jid or not is_group_jid(jid):
                self._log.warning(
                    "WhatsApp group_workspaces: ignoring non-group key {!r}",
                    jid,
                )
                continue
            expanded = Path(str(raw_path)).expanduser()
            if not expanded.is_absolute():
                self._log.warning(
                    "WhatsApp group_workspaces[{}]: path {} is not absolute, skipping",
                    jid,
                    expanded,
                )
                continue
            resolved = expanded.resolve(strict=False)
            if not resolved.is_dir():
                self._log.warning(
                    "WhatsApp group_workspaces[{}]: {} is not a directory, skipping",
                    jid,
                    resolved,
                )
                continue
            self._paths[jid] = resolved

    def resolve(self, chat_id: str) -> Path | None:
        """Return the configured workspace for *chat_id*, or ``None``."""
        if not is_group_jid(chat_id):
            return None
        return self._paths.get(chat_id)

    def load_ruleset(self, chat_id: str) -> str | None:
        """Load and cap ``AGENTS.md``/``SOUL.md`` from the group's workspace.

        Returns ``None`` when the chat has no workspace, when both files are
        missing or empty, or when reading fails. The format mirrors
        :class:`nanobot.agent.context.ContextBuilder` so the resulting block
        slots into the system prompt without surprising the model.
        """
        root = self.resolve(chat_id)
        if root is None:
            return None
        parts: list[str] = []
        for filename in ("AGENTS.md", "SOUL.md"):
            path = root / filename
            try:
                text = path.read_text(encoding="utf-8").rstrip()
            except (OSError, UnicodeDecodeError):
                continue
            if text:
                parts.append(f"{filename}:\n{text}")
        if not parts:
            return None
        joined = "\n\n".join(parts)
        return truncate_text(joined, self._MAX_RULESET_CHARS)

    def known_jids(self) -> tuple[str, ...]:
        return tuple(self._paths.keys())
