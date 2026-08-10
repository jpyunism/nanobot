"""Git worktree tool: orient the agent inside a worktree and list worktrees.

The WebUI kanban creates/removes worktrees; this tool only lets the agent
inspect its current worktree (branch, dirty state) and list the worktrees of
the repo it is inside. It never creates or removes worktrees.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool, tool_parameters
from nanobot.agent.tools.schema import (
    StringSchema,
    tool_parameters_schema,
)
from nanobot.security.workspace_access import current_tool_workspace

_WT_PARAMETERS = tool_parameters_schema(
    action=StringSchema(
        "Action to run",
        enum=["status", "list"],
    ),
    required=["action"],
    description="Inspect git worktrees. status shows the current worktree; list shows all worktrees of the repo.",
)


@tool_parameters(_WT_PARAMETERS)
class GitWorktreeTool(Tool):
    """Inspect git worktrees (status / list)."""

    def __init__(self, workspace: str):
        self._workspace = workspace

    @classmethod
    def enabled(cls, ctx: Any) -> bool:
        return True

    @classmethod
    def create(cls, ctx: Any) -> Tool:
        return cls(workspace=ctx.workspace)

    @property
    def name(self) -> str:
        return "git_worktree"

    @property
    def description(self) -> str:
        return (
            "Inspect git worktrees. status: current worktree branch and whether it has "
            "uncommitted changes. list: all worktrees of the repo you are inside. "
            "Use this to confirm you are in a worktree and on the right branch."
        )

    async def execute(self, action: str, **kwargs: Any) -> str:
        from nanobot.webui import worktrees as wt

        access = current_tool_workspace(self._workspace)
        cwd = access.project_path or Path(self._workspace).expanduser()
        cwd = Path(cwd).resolve()

        if action == "status":
            branch = self._current_branch(cwd)
            dirty = wt.worktree_is_dirty(cwd)
            is_wt = (cwd / ".git").is_file()
            return (
                f"cwd: {cwd}\n"
                f"in_worktree: {is_wt}\n"
                f"branch: {branch or '(detached/none)'}\n"
                f"dirty: {dirty}"
            )

        if action == "list":
            repo = self._find_repo_root(cwd)
            if repo is None:
                return f"not inside a git repository: {cwd}"
            try:
                entries = wt.list_worktrees(repo)
            except Exception as exc:
                return f"failed to list worktrees: {exc}"
            if not entries:
                return f"no worktrees in {repo}"
            lines = [f"{w['branch'] or '(detached)'}  {w['path']}" for w in entries]
            return f"repo: {repo}\n" + "\n".join(lines)

        return f"unknown action: {action}"

    def _current_branch(self, cwd: Path) -> str | None:
        try:
            from dulwich import porcelain

            repo = porcelain.open_repo_closing(str(cwd)).__enter__()
            ref = repo.refs.follow(b"HEAD")[0][1]
            name = ref.decode("utf-8", "replace")
            if name.startswith("refs/heads/"):
                return name[len("refs/heads/") :]
            return name
        except Exception:
            return None

    def _find_repo_root(self, cwd: Path) -> Path | None:
        cur = cwd
        while cur is not None:
            if (cur / ".git").exists():
                return cur
            parent = cur.parent
            cur = parent if parent != cur else None
        return None
