"""Message classification for smart compaction decisions.

Provides importance scoring and semantic classification of session messages
so that compaction algorithms can preserve high-value content (decisions,
config, bugfixes) while aggressively compacting low-value content (trivia,
repeated errors, large tool results).
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Category definitions
# ---------------------------------------------------------------------------

# Importance score 0.0 (discard first) → 1.0 (keep at all costs)
CATEGORY_IMPORTANCE: dict[str, float] = {
    "decision": 0.95,
    "config": 0.90,
    "bugfix": 0.85,
    "user_query": 0.70,
    "assistant_response": 0.60,
    "error_first": 0.55,
    "tool_result_medium": 0.40,
    "tool_result_large": 0.20,
    "trivia": 0.10,
    "repeated_error": 0.05,
    "tool_result_compacted": 0.02,
}

# Tools whose results tend to be large and low-value after first use
LARGE_OUTPUT_TOOLS = frozenset({
    "read_file", "exec", "grep", "find_files",
    "web_search", "web_fetch", "list_dir",
})

# Patterns that suggest a user message contains a decision or conclusion
_DECISION_PATTERNS = re.compile(
    r"\b(?:"
    r"usemos?|vamos a|decid[íi]|opt[oó]|escojo|prefiero|mejor|"
    r"cambiemos|qued[ée]monos|definimos|acordamos|conclusi[óo]n|"
    r"entonces |ok[.,] |dale[.,] |listo[.,] |resuelto|"
    r"funciona|solucionado|arreglado"
    r")\b",
    re.IGNORECASE,
)

_CONFIG_PATTERNS = re.compile(
    r"\b(?:puerto|port|host|url|endpoint|token|api[_-]?key|"
    r"contraseña|password|db_?name|database|config|setting|"
    r"variable|path|ruta|directorio|dir|archivo|file)\b",
    re.IGNORECASE,
)

_BUGFIX_PATTERNS = re.compile(
    r"\b(?:bug|error|fix|arregl[oó]|soluci[oó]n|issue|problema|"
    r"falla|crash|excepci[oó]n|traceback|stack.?trace|"
    r"no funci|no anda|se rompe|est[aá] mal|por qué)\b",
    re.IGNORECASE,
)

_ERROR_PATTERNS = re.compile(
    r"\b(?:error|exception|traceback|failed|failure|"
    r"permission denied|not found|does not exist|"
    r"cannot|unable to|killed|segfault|oom|timeout)\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


def classify_message(msg: dict[str, Any]) -> str:
    """Return a category string for a single message.

    Categories (highest to lowest importance):
        decision, config, bugfix, user_query, assistant_response,
        error_first, tool_result_medium, tool_result_large,
        trivia, repeated_error, tool_result_compacted
    """
    role = msg.get("role", "")
    content = msg.get("content", "")
    name = msg.get("name", "")
    text = str(content) if content else ""

    # Tool results
    if role == "tool":
        # Already compacted placeholder
        if text.startswith("Error: The previous"):
            return "tool_result_compacted"
        # Error content
        if _ERROR_PATTERNS.search(text):
            return "error_first"
        # Size-based
        length = len(text)
        if length > 5000:
            return "tool_result_large"
        if length > 500:
            return "tool_result_medium"
        return "tool_result_small"  # falls back to ~0.4 importance

    # User messages
    if role == "user":
        if _DECISION_PATTERNS.search(text):
            return "decision"
        if _CONFIG_PATTERNS.search(text):
            return "config"
        if _BUGFIX_PATTERNS.search(text):
            return "bugfix"
        if len(text.strip()) < 20:
            return "trivia"
        return "user_query"

    # Assistant responses
    if role == "assistant":
        return "assistant_response"

    return "trivia"


def compute_importance(msg: dict[str, Any], category: str | None = None) -> float:
    """Return importance score 0.0–1.0 for a message."""
    cat = category or classify_message(msg)
    return CATEGORY_IMPORTANCE.get(cat, 0.3)


# ---------------------------------------------------------------------------
# Repeated error detection
# ---------------------------------------------------------------------------


def find_repeated_errors(
    messages: list[dict[str, Any]],
    *,
    max_distance: int = 20,
) -> set[int]:
    """Return indices of messages that are repeated errors.

    A message is a "repeated error" if:
    - It's classified as ``error_first``
    - Another ``error_first`` message with similar content appears within
      ``max_distance`` positions before it.

    This lets compaction drop redundant error outputs while keeping the
    first occurrence.
    """
    error_indices: list[tuple[int, str]] = []
    for idx, msg in enumerate(messages):
        if classify_message(msg) == "error_first":
            text = str(msg.get("content", ""))[:200]
            error_indices.append((idx, text))

    repeated: set[int] = set()
    for i in range(1, len(error_indices)):
        idx_i, text_i = error_indices[i]
        for j in range(max(0, i - 3), i):
            idx_j, text_j = error_indices[j]
            if abs(idx_i - idx_j) <= max_distance and _texts_similar(text_i, text_j):
                repeated.add(idx_i)
                break

    return repeated


def _texts_similar(a: str, b: str, threshold: float = 0.4) -> bool:
    """Rough similarity check: shared word ratio."""
    if not a or not b:
        return False
    words_a = set(a.lower().split()[:30])
    words_b = set(b.lower().split()[:30])
    if not words_a or not words_b:
        return False
    intersection = words_a & words_b
    return len(intersection) / max(len(words_a), len(words_b)) >= threshold


# ---------------------------------------------------------------------------
# Session type detection
# ---------------------------------------------------------------------------

SESSION_TYPE_PATTERNS: dict[str, list[str]] = {
    "code": [
        "código", "code", "implement", "function", "clase", "class",
        "refactor", "test", "debug", "bug", "npm", "python", "node",
        "typescript", "javascript", "git", "pr", "merge", "commit",
    ],
    "casual": [
        "hola", "cómo estás", "gracias", "chao", "ok", "dale",
        "jaja", "lol", "bueno", "genial",
    ],
    "pr_review": [
        "pr", "pull request", "review", "revisa", "cambios", "diff",
        "code review", "aprueba", "merge",
    ],
    "research": [
        "investiga", "busca", "encuentra", "research", "investigación",
        "artículo", "paper", "fuente", "source", "referencia",
    ],
}


def detect_session_type(messages: list[dict[str, Any]]) -> str:
    """Detect the dominant session type from recent user messages.

    Returns one of: ``code``, ``casual``, ``pr_review``, ``research``, ``general``.
    """
    user_texts: list[str] = []
    for msg in messages:
        if msg.get("role") == "user":
            text = str(msg.get("content", ""))
            user_texts.append(text)

    if not user_texts:
        return "general"

    scores: dict[str, int] = {"code": 0, "casual": 0, "pr_review": 0, "research": 0}
    for text in user_texts[-10:]:  # last 10 user messages
        lower = text.lower()
        for stype, patterns in SESSION_TYPE_PATTERNS.items():
            for pat in patterns:
                if pat in lower:
                    scores[stype] += 1
                    break

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"


# ---------------------------------------------------------------------------
# Adaptive window sizing
# ---------------------------------------------------------------------------

def adaptive_recent_count(
    messages: list[dict[str, Any]],
    *,
    base_count: int = 8,
    min_count: int = 4,
    max_count: int = 20,
    importance_threshold: float = 0.7,
) -> int:
    """Calculate how many recent messages to keep based on information density.

    Scans the last ``base_count * 2`` messages and counts how many are
    high-importance. If density is high, increase the window; if low, shrink it.
    """
    tail = messages[-base_count * 2:] if len(messages) > base_count * 2 else messages
    if not tail:
        return base_count

    high_value = sum(
        1 for msg in tail
        if compute_importance(msg) >= importance_threshold
    )
    density = high_value / len(tail)

    # Scale: density 0.0 → min_count, 1.0 → max_count
    window = int(min_count + (max_count - min_count) * density)
    return max(min_count, min(max_count, window))
