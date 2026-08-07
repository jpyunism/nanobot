"""Model-message governance for agent runner requests.

This module owns model-facing message shaping and tool-result content normalization.
It may return copied messages or persisted-result placeholders, but it must not
mutate an existing session history list in place.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

from nanobot.agent.message_classifier import (
    compute_importance,
    detect_session_type,
    find_repeated_errors,
)
from nanobot.utils.helpers import (
    estimate_message_tokens,
    estimate_prompt_tokens_chain,
    find_legal_message_start,
    maybe_persist_tool_result,
    truncate_text,
)
from nanobot.utils.runtime import ensure_nonempty_tool_result

if TYPE_CHECKING:
    from nanobot.providers.base import LLMProvider

SNIP_SAFETY_BUFFER = 1024
MICROCOMPACT_KEEP_RECENT = 10
MICROCOMPACT_MIN_CHARS = 500
INFLIGHT_COMPACT_TARGET_RATIO = 0.85
COMPACTABLE_TOOLS = frozenset({
    "read_file", "exec", "grep", "find_files",
    "web_search", "web_fetch", "list_dir", "list_exec_sessions",
})

# Session-type-aware compaction aggressiveness
SESSION_TYPE_AGGRESSION: dict[str, float] = {
    "code": 0.75,       # keep more context for coding sessions
    "casual": 0.95,     # compact aggressively for casual chat
    "pr_review": 0.70,  # keep diffs and comments
    "research": 0.80,   # keep sources and findings
    "general": 0.85,    # default
}

# Importance threshold below which messages are compaction candidates
LOW_IMPORTANCE_THRESHOLD = 0.3
# read_file is the recovery path for persisted results; exempting it prevents persist->read->persist loops.
TOOL_RESULT_OFFLOAD_EXEMPT_TOOLS = frozenset({"read_file"})
BACKFILL_CONTENT = "[Tool result unavailable — call was interrupted or lost]"
PLACEHOLDER_TEXTS = frozenset({
    "[Previous assistant message omitted.]",
})


def _tool_call_name_is_valid(tool_call: Any) -> bool:
    """Whether a persisted OpenAI-style tool_call carries a usable name.

    Mirrors ``ToolCallRequest.has_valid_name`` for the dict shape stored in
    message history: a degenerate call with ``name=None`` / ``""`` cannot be
    executed and is rejected by upstream APIs if replayed.
    """
    if not isinstance(tool_call, dict):
        return False
    fn = tool_call.get("function")
    name = fn.get("name") if isinstance(fn, dict) else tool_call.get("name")
    return isinstance(name, str) and bool(name)


@dataclass(slots=True)
class ContextGovernanceConfig:
    provider: LLMProvider
    model: str
    tools: Any
    workspace: Path | None
    session_key: str | None
    max_tool_result_chars: int
    context_window_tokens: int | None = None
    context_block_limit: int | None = None
    max_tokens: int | None = None
    inflight_start_index: int = 0


class ContextGovernor:
    """Prepare model-copy messages while preserving persisted history."""

    def prepare_for_model(
        self,
        config: ContextGovernanceConfig,
        messages: list[dict[str, Any]],
        compacted_tool_call_ids: set[str],
    ) -> list[dict[str, Any]]:
        updated = self.strip_placeholder_assistant_messages(messages)
        updated = self.strip_malformed_tool_calls(updated)
        updated = self.drop_orphan_tool_results(updated)
        updated = self.backfill_missing_tool_results(updated)
        updated = self.apply_tool_result_budget(config, updated)
        updated = self.compact_inflight_overflow(config, updated, compacted_tool_call_ids)
        updated = self.snip_history(config, updated)
        updated = self.drop_orphan_tool_results(updated)
        updated = self.strip_orphan_tool_calls(updated)
        return self.backfill_missing_tool_results(updated)

    @staticmethod
    def input_budget(config: ContextGovernanceConfig) -> int:
        if not config.context_window_tokens:
            return 0

        provider_max_tokens = getattr(
            getattr(config.provider, "generation", None),
            "max_tokens",
            4096,
        )
        max_output = config.max_tokens if isinstance(config.max_tokens, int) else (
            provider_max_tokens if isinstance(provider_max_tokens, int) else 4096
        )
        budget = config.context_block_limit or (
            config.context_window_tokens - max_output - SNIP_SAFETY_BUFFER
        )
        return budget if budget > 0 else 0

    @staticmethod
    def normalize_tool_result(
        config: ContextGovernanceConfig,
        tool_call_id: str,
        tool_name: str,
        result: Any,
    ) -> Any:
        result = ensure_nonempty_tool_result(tool_name, result)
        if tool_name in TOOL_RESULT_OFFLOAD_EXEMPT_TOOLS:
            return result
        try:
            content = maybe_persist_tool_result(
                config.workspace,
                config.session_key,
                tool_call_id,
                result,
                max_chars=config.max_tool_result_chars,
            )
        except Exception:
            logger.exception(
                "Tool result persist failed for {} in {}; using raw result",
                tool_call_id,
                config.session_key or "default",
            )
            content = result
        if isinstance(content, str) and len(content) > config.max_tool_result_chars:
            return truncate_text(content, config.max_tool_result_chars)
        return content

    @staticmethod
    def strip_placeholder_assistant_messages(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Remove assistant messages that are compaction placeholders.

        Messages like ``[Previous assistant message omitted.]`` carry no useful
        context for the model and can cause it to repeatedly attempt tool calls
        that previously failed, producing malformed responses in a loop.
        Consecutive same-role messages that result from removal are handled
        downstream by the provider's merge-consecutive logic. Only the
        model-facing copy is repaired; the persisted transcript is untouched
        (a copy is returned, or the same list object when nothing changes).
        """
        updated: list[dict[str, Any]] | None = None
        for idx, msg in enumerate(messages):
            if msg.get("role") != "assistant":
                if updated is not None:
                    updated.append(msg)
                continue
            content = msg.get("content", "")
            text = content if isinstance(content, str) else ""
            is_placeholder = text.strip() in PLACEHOLDER_TEXTS
            has_tool_calls = bool(msg.get("tool_calls"))
            if is_placeholder and not has_tool_calls:
                if updated is None:
                    updated = list(messages[:idx])
                logger.debug(
                    "Stripping placeholder assistant message from history: {!r}",
                    text[:60],
                )
                continue
            if updated is not None:
                updated.append(msg)
        if updated is None:
            return messages
        return updated

    @staticmethod
    def strip_malformed_tool_calls(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Drop persisted assistant tool_calls whose name is missing/non-string.

        A degenerate tool call (``name=None`` or ``""``) that slipped into the
        saved history before this guard existed gets replayed on every turn and
        makes upstream APIs reject the whole request
        (``messages.content.N.tool_use.name: Input should be a valid string``),
        permanently wedging the session. Removing the bad call here lets the
        existing orphan-result cleanup drop its now-dangling tool result, so a
        polluted session self-heals on its next turn. The persisted transcript
        is left untouched; only the model-facing copy is repaired (a copy is
        returned, or the same list object when nothing changes).
        """
        updated: list[dict[str, Any]] | None = None
        for idx, msg in enumerate(messages):
            if msg.get("role") != "assistant":
                if updated is not None:
                    updated.append(msg)
                continue
            calls = msg.get("tool_calls")
            if not calls:
                if updated is not None:
                    updated.append(msg)
                continue
            kept = [tc for tc in calls if _tool_call_name_is_valid(tc)]
            if len(kept) == len(calls):
                if updated is not None:
                    updated.append(msg)
                continue
            if updated is None:
                updated = [dict(m) for m in messages[:idx]]
            logger.warning(
                "Stripping {} malformed tool_call(s) with missing/non-string "
                "name from assistant history before request",
                len(calls) - len(kept),
            )
            repaired = dict(msg)
            if kept:
                repaired["tool_calls"] = kept
            else:
                repaired.pop("tool_calls", None)
            # An assistant turn with neither content nor any valid tool call is
            # itself invalid upstream; drop it entirely in that case.
            has_content = bool(repaired.get("content"))
            if not kept and not has_content:
                continue
            updated.append(repaired)

        if updated is None:
            return messages
        return updated

    @staticmethod
    def drop_orphan_tool_results(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Drop invalid tool results before history is sent back to providers."""
        declared: set[str] = set()
        fulfilled: set[str] = set()
        updated: list[dict[str, Any]] | None = None
        for idx, msg in enumerate(messages):
            role = msg.get("role")
            if role == "assistant":
                for tc in msg.get("tool_calls") or []:
                    if isinstance(tc, dict) and tc.get("id"):
                        declared.add(str(tc["id"]))
            if role == "tool":
                tid = msg.get("tool_call_id")
                tid_str = str(tid) if tid else ""
                if not tid_str or tid_str not in declared or tid_str in fulfilled:
                    if updated is None:
                        updated = [dict(m) for m in messages[:idx]]
                    continue
                fulfilled.add(tid_str)
            if updated is not None:
                updated.append(dict(msg))

        if updated is None:
            return messages
        return updated

    @staticmethod
    def backfill_missing_tool_results(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Insert synthetic error results for assistant tool_calls with missing tool outputs."""
        declared: list[tuple[int, str, str]] = []
        fulfilled: set[str] = set()
        for idx, msg in enumerate(messages):
            role = msg.get("role")
            if role == "assistant":
                for tc in msg.get("tool_calls") or []:
                    if isinstance(tc, dict) and tc.get("id"):
                        name = ""
                        func = tc.get("function")
                        if isinstance(func, dict):
                            name = func.get("name", "")
                        declared.append((idx, str(tc["id"]), name))
            elif role == "tool":
                tid = msg.get("tool_call_id")
                if tid:
                    fulfilled.add(str(tid))

        missing = [(ai, cid, name) for ai, cid, name in declared if cid not in fulfilled]
        if not missing:
            return messages

        updated = list(messages)
        offset = 0
        for assistant_idx, call_id, name in missing:
            insert_at = assistant_idx + 1 + offset
            while insert_at < len(updated) and updated[insert_at].get("role") == "tool":
                insert_at += 1
            updated.insert(insert_at, {
                "role": "tool",
                "tool_call_id": call_id,
                "name": name,
                "content": BACKFILL_CONTENT,
            })
            offset += 1
        return updated

    @staticmethod
    def strip_orphan_tool_calls(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Remove tool_calls from assistant turns whose results were dropped.

        Context compaction (snip_history, session file caps) can drop bulky
        tool results while preserving the cheap assistant turn that declared
        the calls. Without this guard, backfill_missing_tool_results would
        later insert a synthetic '[Tool result unavailable — call was
        interrupted or lost]' placeholder, misleading the model into thinking
        the tools failed when they actually ran. Dropping the orphaned calls
        keeps the conversation legal and honest.
        """
        fulfilled: set[str] = set()
        for msg in messages:
            if msg.get("role") == "tool":
                tid = msg.get("tool_call_id")
                if tid:
                    fulfilled.add(str(tid))

        updated: list[dict[str, Any]] | None = None
        for idx, msg in enumerate(messages):
            if msg.get("role") != "assistant":
                if updated is not None:
                    updated.append(msg)
                continue

            calls = msg.get("tool_calls") or []
            if not calls:
                if updated is not None:
                    updated.append(msg)
                continue

            kept = [
                tc for tc in calls
                if isinstance(tc, dict) and str(tc.get("id", "")) in fulfilled
            ]
            if len(kept) == len(calls):
                if updated is not None:
                    updated.append(msg)
                continue

            if updated is None:
                updated = [dict(m) for m in messages[:idx]]

            repaired = dict(msg)
            if kept:
                repaired["tool_calls"] = kept
            else:
                repaired.pop("tool_calls", None)

            # An assistant turn that is left with neither content nor valid
            # tool_calls is itself invalid upstream; drop it entirely.
            has_content = bool(repaired.get("content"))
            if not kept and not has_content:
                continue
            updated.append(repaired)

        if updated is None:
            return messages
        return updated

    def apply_tool_result_budget(
        self,
        config: ContextGovernanceConfig,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        updated = messages
        for idx, message in enumerate(messages):
            if message.get("role") != "tool":
                continue
            normalized = self.normalize_tool_result(
                config,
                str(message.get("tool_call_id") or f"tool_{idx}"),
                str(message.get("name") or "tool"),
                message.get("content"),
            )
            if normalized != message.get("content"):
                if updated is messages:
                    updated = [dict(m) for m in messages]
                updated[idx]["content"] = normalized
        return updated

    def compact_inflight_overflow(
        self,
        config: ContextGovernanceConfig,
        messages: list[dict[str, Any]],
        compacted_tool_call_ids: set[str],
    ) -> list[dict[str, Any]]:
        """Compact in-flight tool results only when the request would overflow."""
        budget = self.input_budget(config)
        if budget <= 0:
            return messages

        tools = config.tools.get_definitions()
        updated = self._apply_recorded_compactions(messages, compacted_tool_call_ids)
        estimate, source = estimate_prompt_tokens_chain(
            config.provider,
            config.model,
            updated,
            tools,
        )
        if estimate <= budget:
            return updated

        target = int(budget * INFLIGHT_COMPACT_TARGET_RATIO)
        candidates = self._inflight_compaction_candidates(
            config,
            updated,
            compacted_tool_call_ids,
        )
        if not candidates:
            return updated

        for candidate_idx, (idx, tool_call_id) in enumerate(candidates):
            is_newest_candidate = candidate_idx == len(candidates) - 1
            if is_newest_candidate and estimate <= budget:
                break
            if tool_call_id in compacted_tool_call_ids:
                continue
            if updated is messages:
                updated = [dict(m) for m in messages]
            compacted_tool_call_ids.add(tool_call_id)
            self._compact_tool_result_at(updated, idx)
            estimate, source = estimate_prompt_tokens_chain(
                config.provider,
                config.model,
                updated,
                tools,
            )
            if estimate <= target:
                break

        logger.debug(
            "In-flight context compaction for {}: prompt={} budget={} target={} via {}, ids={}",
            config.session_key or "default",
            estimate,
            budget,
            target,
            source,
            len(compacted_tool_call_ids),
        )
        return updated

    def snip_history(
        self,
        config: ContextGovernanceConfig,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not messages or not config.context_window_tokens:
            return messages

        budget = self.input_budget(config)
        if budget <= 0:
            return messages

        tools = config.tools.get_definitions()
        estimate, _ = estimate_prompt_tokens_chain(
            config.provider,
            config.model,
            messages,
            tools,
        )
        if estimate <= budget:
            return messages

        system_messages = [dict(msg) for msg in messages if msg.get("role") == "system"]
        non_system = [dict(msg) for msg in messages if msg.get("role") != "system"]
        if not non_system:
            return messages

        system_tokens = sum(estimate_message_tokens(msg) for msg in system_messages)
        fixed_tokens, _ = estimate_prompt_tokens_chain(
            config.provider,
            config.model,
            system_messages,
            tools,
        )
        remaining_budget = max(0, budget - max(system_tokens, fixed_tokens))

        # --- Smart snip: classify and prioritize ---
        session_type = detect_session_type(non_system)
        aggression = SESSION_TYPE_AGGRESSION.get(session_type, 0.85)
        target_budget = int(remaining_budget * aggression)

        # Detect repeated errors so we can drop duplicates
        repeated_error_indices = find_repeated_errors(non_system)

        # Score each message by importance
        scored: list[tuple[int, float, dict[str, Any]]] = []
        for idx, msg in enumerate(non_system):
            importance = compute_importance(msg)
            if idx in repeated_error_indices:
                importance = min(importance, 0.05)  # penalize repeated errors
            scored.append((idx, importance, msg))

        # Always keep the last user message (anchor)
        last_user_idx = -1
        for idx in range(len(non_system) - 1, -1, -1):
            if non_system[idx].get("role") == "user":
                last_user_idx = idx
                break

        # Sort by importance descending, but keep original order for same-importance
        scored.sort(key=lambda x: (-x[1], x[0]))

        kept: list[dict[str, Any]] = []
        kept_tokens = 0
        kept_indices: set[int] = set()

        for idx, importance, msg in scored:
            msg_tokens = estimate_message_tokens(msg)
            if kept_tokens + msg_tokens > target_budget:
                # If it's high importance, still try to keep it by dropping low-importance
                if importance >= 0.7:
                    # Try to make room by dropping lowest-importance kept
                    dropped = self._drop_lowest_importance(
                        kept, kept_indices, kept_tokens,
                        msg_tokens, target_budget, importance,
                        non_system,
                    )
                    if dropped:
                        kept, kept_indices, kept_tokens = dropped
                    else:
                        continue
                else:
                    continue
            kept.append(msg)
            kept_indices.add(idx)
            kept_tokens += msg_tokens

        # Ensure last user message is always present
        if last_user_idx >= 0 and last_user_idx not in kept_indices:
            last_msg = non_system[last_user_idx]
            last_tokens = estimate_message_tokens(last_msg)
            # Drop lowest-importance kept to make room
            while kept and kept_tokens + last_tokens > target_budget:
                lowest = min(
                    ((i, m) for i, m in enumerate(kept) if i != last_user_idx),
                    key=lambda x: compute_importance(x[1]),
                    default=None,
                )
                if lowest is None:
                    break
                li, lm = lowest
                kept_tokens -= estimate_message_tokens(lm)
                kept.pop(li)
            kept.append(last_msg)
            kept_tokens += last_tokens

        # Restore original order
        kept.sort(key=lambda m: non_system.index(m) if m in non_system else 0)

        return system_messages + self._legal_history_tail(kept, non_system)

    @staticmethod
    def _drop_lowest_importance(
        kept: list[dict[str, Any]],
        kept_indices: set[int],
        kept_tokens: int,
        needed_tokens: int,
        target_budget: int,
        incoming_importance: float,
        non_system: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], set[int], int] | None:
        """Try to drop low-importance kept messages to make room for a high-importance one."""
        if not kept:
            return None
        # Find kept messages with lower importance than incoming
        candidates = [
            (i, m) for i, m in enumerate(kept)
            if compute_importance(m) < incoming_importance - 0.1
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda x: compute_importance(x[1]))
        new_kept = list(kept)
        new_indices = set(kept_indices)
        new_tokens = kept_tokens
        for _ci, cm in candidates:
            if new_tokens + needed_tokens <= target_budget:
                break
            cm_tokens = estimate_message_tokens(cm)
            new_tokens -= cm_tokens
            new_kept.remove(cm)
            # Find and remove the original index
            for orig_idx in list(new_indices):
                if non_system[orig_idx] is cm:
                    new_indices.discard(orig_idx)
                    break
        if new_tokens + needed_tokens <= target_budget:
            return new_kept, new_indices, new_tokens
        return None

    @staticmethod
    def _tool_result_compaction_message(message: dict[str, Any]) -> str:
        name = message.get("name", "tool")
        return (
            f"Error: The previous {name} result was compacted to fit context because it was too "
            "large. Do not repeat the same call unchanged. Retry with a narrower path, query, "
            "range, or result limit, use another tool, or tell the user the task cannot fit in "
            "the available context."
        )

    def _legal_history_tail(
        self,
        kept: list[dict[str, Any]],
        non_system: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        fallback = kept if kept else (non_system[-1:] if non_system else [])
        kept = self._user_tail(kept) or self._user_tail(non_system, last=True) or fallback

        start = find_legal_message_start(kept)
        return kept[start:] if start else kept

    @staticmethod
    def _user_tail(messages: list[dict[str, Any]], *, last: bool = False) -> list[dict[str, Any]]:
        indexes = range(len(messages) - 1, -1, -1) if last else range(len(messages))
        for idx in indexes:
            if messages[idx].get("role") == "user":
                return messages[idx:]
        return []

    def _apply_recorded_compactions(
        self,
        messages: list[dict[str, Any]],
        compacted_tool_call_ids: set[str],
    ) -> list[dict[str, Any]]:
        if not compacted_tool_call_ids:
            return messages
        updated = messages
        for idx, msg in enumerate(messages):
            if msg.get("role") != "tool":
                continue
            tool_call_id = msg.get("tool_call_id")
            if not tool_call_id or str(tool_call_id) not in compacted_tool_call_ids:
                continue
            compaction_message = self._tool_result_compaction_message(msg)
            if msg.get("content") == compaction_message:
                continue
            if updated is messages:
                updated = [dict(m) for m in messages]
            updated[idx]["content"] = compaction_message
        return updated

    def _inflight_compaction_candidates(
        self,
        config: ContextGovernanceConfig,
        messages: list[dict[str, Any]],
        compacted_tool_call_ids: set[str],
    ) -> list[tuple[int, str]]:
        compactable: list[tuple[int, str]] = []
        for idx, msg in enumerate(messages):
            if idx < config.inflight_start_index:
                continue
            if msg.get("role") != "tool" or msg.get("name") not in COMPACTABLE_TOOLS:
                continue
            tool_call_id = msg.get("tool_call_id")
            if not tool_call_id or str(tool_call_id) in compacted_tool_call_ids:
                continue
            content = msg.get("content")
            if not isinstance(content, str) or len(content) < MICROCOMPACT_MIN_CHARS:
                continue
            compactable.append((idx, str(tool_call_id)))

        if not compactable:
            return []

        # --- Smart ordering: compact low-importance results first ---
        # Score each candidate by importance (lower = compact first)
        scored: list[tuple[float, int, str]] = []
        for idx, tid in compactable:
            msg = messages[idx]
            importance = compute_importance(msg)
            scored.append((importance, idx, tid))

        # Sort by importance ascending (lowest first), then by position
        scored.sort(key=lambda x: (x[0], x[1]))

        # Keep recent high-importance results unless we're in hard overflow
        primary_count = max(0, len(scored) - MICROCOMPACT_KEEP_RECENT)
        primary = [(idx, tid) for _imp, idx, tid in scored[:primary_count]]
        fallback = [(idx, tid) for _imp, idx, tid in scored[primary_count:]]

        return primary + fallback

    def _compact_tool_result_at(self, messages: list[dict[str, Any]], idx: int) -> None:
        messages[idx]["content"] = self._tool_result_compaction_message(messages[idx])
