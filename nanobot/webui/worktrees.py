"""Git worktree helpers for the WebUI kanban.

Thin wrapper over ``dulwich`` for creating/listing/removing worktrees and
merging branches back into a repo. Kept I/O-only and dependency-free of the
agent so it can be used from the HTTP layer without circular imports.

Worktrees are created under a configurable root (``~/.nanobot/worktrees`` by
default), one directory per card.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from dulwich import porcelain

from nanobot.webui.projects import ProjectError


def _open_repo(repo_path: Path) -> Any:
    if not repo_path.is_dir():
        raise ProjectError(f"repo not found: {repo_path}")
    try:
        return porcelain.open_repo_closing(str(repo_path)).__enter__()
    except Exception as exc:  # dulwich raises various errors for non-repos
        raise ProjectError(f"not a git repository: {repo_path}") from exc


def repo_has_commits(repo_path: Path) -> bool:
    """True if the repo has at least one commit (worktrees need a HEAD)."""
    try:
        repo = _open_repo(repo_path)
        repo.head()
        return True
    except Exception:
        return False


def create_worktree(
    repo_path: Path,
    branch: str,
    worktree_path: Path,
) -> str:
    """Create a worktree for ``branch`` at ``worktree_path`` (like ``git worktree add -b``).

    Returns the absolute path of the new worktree. The branch is created from
    HEAD if it does not exist yet.
    """
    if not repo_has_commits(repo_path):
        raise ProjectError("repo has no commits yet; commit once before creating worktrees")
    if worktree_path.exists():
        raise ProjectError(f"worktree path already exists: {worktree_path}")
    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        return porcelain.worktree_add(
            str(repo_path),
            str(worktree_path),
            branch=branch,
        )
    except Exception as exc:
        raise ProjectError(f"failed to create worktree: {exc}") from exc


def list_worktrees(repo_path: Path) -> list[dict[str, Any]]:
    """List worktrees of a repo as plain dicts (path, branch, detached)."""
    if not repo_has_commits(repo_path):
        return []
    try:
        infos = porcelain.worktree_list(str(repo_path))
    except Exception as exc:
        raise ProjectError(f"failed to list worktrees: {exc}") from exc
    out: list[dict[str, Any]] = []
    for info in infos:
        branch = info.branch
        if isinstance(branch, bytes):
            branch = branch.decode("utf-8", "replace")
            if branch.startswith("refs/heads/"):
                branch = branch[len("refs/heads/") :]
        out.append(
            {
                "path": info.path,
                "branch": branch,
                "detached": bool(info.detached),
            }
        )
    return out


def remove_worktree(repo_path: Path, worktree_path: Path, *, force: bool = False) -> None:
    """Remove a worktree directory and its admin files. Does not delete the branch."""
    try:
        porcelain.worktree_remove(str(repo_path), str(worktree_path), force=force)
    except Exception as exc:
        raise ProjectError(f"failed to remove worktree: {exc}") from exc


def move_worktree(repo_path: Path, old_path: Path, new_path: Path) -> None:
    """Move a worktree to a new directory, preserving its branch and HEAD."""
    new_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        porcelain.worktree_move(str(repo_path), str(old_path), str(new_path))
    except Exception as exc:
        raise ProjectError(f"failed to move worktree: {exc}") from exc


def worktree_is_dirty(worktree_path: Path) -> bool:
    """True if the worktree has uncommitted changes (dulwich remove won't check)."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(worktree_path), "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return bool(proc.stdout.strip())


def merge_branch(repo_path: Path, branch: str, into: str = "main") -> str:
    """Merge ``branch`` into ``into`` in ``repo_path`` via the git CLI.

    Returns the merge output. Requires the ``git`` binary.
    """
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_path), "merge", "--no-ff", branch, "-m", f"merge {branch}"],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise ProjectError(f"git binary unavailable: {exc}") from exc
    if proc.returncode != 0:
        raise ProjectError(f"merge failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout.strip()
