"""Loader for drop-in Python workflows."""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import sys
from pathlib import Path

from loguru import logger

# Engine modules that live alongside builtin workflows — never workflows.
_BUILTIN_SKIP = frozenset({"__init__", "loader", "runner"})


class WorkflowLoader:
    """Scan ``workspace/workflows/*.py`` (and the builtin dir) for async ``run(args, ctx)`` modules.

    Workspace workflows shadow builtin workflows with the same name.
    """

    def __init__(
        self,
        workspace: Path,
        builtin_workflows_dir: Path | None = None,
        disabled_workflows: set[str] | None = None,
    ) -> None:
        self.workspace = workspace
        self.workspace_workflows = workspace / "workflows"
        self.builtin_workflows = builtin_workflows_dir or Path(__file__).parent
        self.disabled_workflows = disabled_workflows or set()

    def _entries_from_dir(
        self,
        base: Path,
        source: str,
        *,
        skip_names: set[str] | None = None,
    ) -> list[dict[str, str]]:
        if not base.exists():
            return []
        entries: list[dict[str, str]] = []
        for path in sorted(base.glob("*.py")):
            name = path.stem
            if name.startswith("_") or name in (skip_names or set()):
                continue
            entries.append({"name": name, "path": str(path), "source": source})
        return entries

    def list_workflows(self) -> list[dict[str, str]]:
        """List all enabled workflows as ``{name, path, source}`` dicts."""
        entries = self._entries_from_dir(self.workspace_workflows, "workspace")
        workspace_names = {entry["name"] for entry in entries}
        if self.builtin_workflows and self.builtin_workflows.exists():
            entries.extend(
                self._entries_from_dir(
                    self.builtin_workflows,
                    "builtin",
                    skip_names=workspace_names | _BUILTIN_SKIP,
                )
            )
        if self.disabled_workflows:
            entries = [e for e in entries if e["name"] not in self.disabled_workflows]
        return entries

    def load(self, name: str) -> object | None:
        """Import and return a workflow module by name, or None if missing/invalid."""
        for entry in self.list_workflows():
            if entry["name"] == name:
                return self._load_module(entry["path"], name)
        return None

    def _load_module(self, path: str, name: str) -> object | None:
        digest = hashlib.sha1(path.encode("utf-8")).hexdigest()[:8]
        module_name = f"_nanobot_workflow_{name}_{digest}"
        try:
            spec = importlib.util.spec_from_file_location(module_name, path)
            if spec is None or spec.loader is None:
                return None
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        except Exception:
            logger.exception("Failed to import workflow '{}' from {}", name, path)
            return None
        run = getattr(module, "run", None)
        if not callable(run) or not asyncio.iscoroutinefunction(run):
            logger.warning("Workflow '{}' has no async run(args, ctx); skipping", name)
            return None
        return module
