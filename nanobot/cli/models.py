"""Model information helpers for the onboard wizard.

Model database / autocomplete is temporarily disabled while litellm is
being replaced.  All public function signatures are preserved so callers
continue to work without changes.
"""

from __future__ import annotations


def get_model_context_limit(model: str, provider: str = "auto") -> int | None:
    return None


def get_model_suggestions(_partial: str, provider: str = "auto", limit: int = 20) -> list[str]:
    return []
