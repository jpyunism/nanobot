"""WebUI Workspace File Browser API.

Provides HTTP endpoints for browsing and manipulating files within the workspace,
respecting workspace security policies and protecting sensitive files.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from nanobot.config.paths import get_workspace_path
from nanobot.security.workspace_access import (
    WorkspaceScope,
    current_workspace_scope,
)

# Sensitive file patterns that should never be exposed or modified through the UI
SENSITIVE_PATTERNS = {
    ".env",
    ".env.local", 
    ".env.production",
    ".git",
    ".gitignore",
    ".nanobot",
    "node_modules",
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".DS_Store",
    "Thumbs.db",
}


def is_sensitive_path(path: Path, workspace_root: Path) -> bool:
    """Check if a path is sensitive and should be protected."""
    try:
        rel_path = path.resolve(strict=False).relative_to(workspace_root.resolve(strict=False))
        parts = rel_path.parts
        
        # Check each part of the path against sensitive patterns
        for part in parts:
            if part in SENSITIVE_PATTERNS:
                return True
            # Block hidden files/directories (starting with .)
            if part.startswith("."):
                return True
        
        # Check filename patterns
        if parts and any(parts[-1].endswith(pattern.lstrip("*")) for pattern in SENSITIVE_PATTERNS if pattern.startswith("*")):
            return True
            
    except (ValueError, OSError):
        return True
    
    return False


def validate_workspace_path(path: str, workspace_root: Path) -> Path:
    """Validate that a path is within the workspace and not sensitive."""
    full_path = (workspace_root / path).resolve(strict=False)
    
    # Ensure it's within workspace
    try:
        full_path.relative_to(workspace_root.resolve(strict=False))
    except ValueError:
        raise ValueError(f"Path '{path}' is outside workspace boundary")
    
    # Check if sensitive
    if is_sensitive_path(full_path, workspace_root):
        raise ValueError(f"Access to '{path}' is restricted")
    
    return full_path


def workspace_list_files(
    workspace_root: Path | None = None,
    subpath: str = "",
) -> dict[str, Any]:
    """List files and directories in the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        target_path = validate_workspace_path(subpath, workspace_root)
    except ValueError as e:
        return {"error": str(e), "files": []}
    
    if not target_path.exists():
        return {"error": "Path does not exist", "files": []}
    
    if not target_path.is_dir():
        return {"error": "Path is not a directory", "files": []}
    
    files = []
    try:
        for entry in sorted(target_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            # Skip sensitive files/directories
            if is_sensitive_path(entry, workspace_root):
                continue
            
            try:
                stat = entry.stat()
                files.append({
                    "name": entry.name,
                    "path": str(entry.relative_to(workspace_root)),
                    "is_directory": entry.is_dir(),
                    "size": stat.st_size if entry.is_file() else 0,
                    "modified_at": stat.st_mtime,
                    "created_at": stat.st_ctime,
                })
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot access directory: {e}", "files": []}
    
    return {
        "current_path": str(target_path.relative_to(workspace_root)),
        "parent_path": str(target_path.parent.relative_to(workspace_root)) if target_path != workspace_root else None,
        "files": files,
    }


def workspace_read_file(
    path: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Read the contents of a file in the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        full_path = validate_workspace_path(path, workspace_root)
    except ValueError as e:
        return {"error": str(e)}
    
    if not full_path.exists():
        return {"error": "File does not exist"}
    
    if not full_path.is_file():
        return {"error": "Path is not a file"}
    
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "path": path,
            "content": content,
            "encoding": "utf-8",
            "size": len(content.encode("utf-8")),
        }
    except UnicodeDecodeError:
        try:
            size = full_path.stat().st_size
            return {
                "path": path,
                "is_binary": True,
                "size": size,
                "message": "This is a binary file and cannot be displayed as text",
            }
        except OSError as e:
            return {"error": f"Cannot read file: {e}"}
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot read file: {e}"}


def workspace_write_file(
    path: str,
    content: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Write content to a file in the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        full_path = validate_workspace_path(path, workspace_root)
    except ValueError as e:
        return {"error": str(e)}
    
    if full_path.exists() and is_sensitive_path(full_path, workspace_root):
        return {"error": f"Cannot modify restricted file: {path}"}
    
    try:
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        return {
            "success": True,
            "path": path,
            "size": len(content.encode("utf-8")),
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot write file: {e}"}


def workspace_rename(
    old_path: str,
    new_name: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Rename a file or directory in the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        old_full_path = validate_workspace_path(old_path, workspace_root)
    except ValueError as e:
        return {"error": str(e)}
    
    if not old_full_path.exists():
        return {"error": "Source path does not exist"}
    
    if ".." in new_name or "/" in new_name or "\\" in new_name:
        return {"error": "Invalid new name"}
    
    new_full_path = old_full_path.parent / new_name
    
    if is_sensitive_path(new_full_path, workspace_root):
        return {"error": "Cannot rename to restricted name"}
    
    if new_full_path.exists():
        return {"error": "Destination already exists"}
    
    try:
        old_full_path.rename(new_full_path)
        return {
            "success": True,
            "old_path": old_path,
            "new_path": str(new_full_path.relative_to(workspace_root)),
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot rename: {e}"}


def workspace_move(
    source_path: str,
    dest_path: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Move a file or directory within the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        source_full = validate_workspace_path(source_path, workspace_root)
    except ValueError as e:
        return {"error": f"Source: {e}"}
    
    try:
        dest_full = validate_workspace_path(dest_path, workspace_root)
    except ValueError as e:
        return {"error": f"Destination: {e}"}
    
    if not source_full.exists():
        return {"error": "Source path does not exist"}
    
    if is_sensitive_path(dest_full, workspace_root):
        return {"error": "Cannot move to restricted location"}
    
    if dest_full.is_dir():
        dest_full = dest_full / source_full.name
    
    try:
        shutil.move(str(source_full), str(dest_full))
        return {
            "success": True,
            "source": source_path,
            "destination": str(dest_full.relative_to(workspace_root)),
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot move: {e}"}


def workspace_delete(
    path: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Delete a file or directory from the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        full_path = validate_workspace_path(path, workspace_root)
    except ValueError as e:
        return {"error": str(e)}
    
    if not full_path.exists():
        return {"error": "Path does not exist"}
    
    if is_sensitive_path(full_path, workspace_root):
        return {"error": "Cannot delete restricted path"}
    
    try:
        if full_path.is_dir():
            shutil.rmtree(full_path)
        else:
            full_path.unlink()
        return {
            "success": True,
            "path": path,
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot delete: {e}"}


def workspace_create_directory(
    path: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Create a new directory in the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        full_path = validate_workspace_path(path, workspace_root)
    except ValueError as e:
        return {"error": str(e)}
    
    if full_path.exists():
        return {"error": "Path already exists"}
    
    if is_sensitive_path(full_path, workspace_root):
        return {"error": "Cannot create restricted directory"}
    
    try:
        full_path.mkdir(parents=True, exist_ok=True)
        return {
            "success": True,
            "path": path,
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot create directory: {e}"}


def workspace_copy(
    source_path: str,
    dest_path: str,
    workspace_root: Path | None = None,
) -> dict[str, Any]:
    """Copy a file or directory within the workspace."""
    if workspace_root is None:
        workspace_root = get_workspace_path()
    
    try:
        source_full = validate_workspace_path(source_path, workspace_root)
    except ValueError as e:
        return {"error": f"Source: {e}"}
    
    try:
        dest_full = validate_workspace_path(dest_path, workspace_root)
    except ValueError as e:
        return {"error": f"Destination: {e}"}
    
    if not source_full.exists():
        return {"error": "Source path does not exist"}
    
    if is_sensitive_path(dest_full, workspace_root):
        return {"error": "Cannot copy to restricted location"}
    
    if dest_full.is_dir():
        dest_full = dest_full / source_full.name
    
    try:
        if source_full.is_dir():
            shutil.copytree(str(source_full), str(dest_full))
        else:
            shutil.copy2(str(source_full), str(dest_full))
        return {
            "success": True,
            "source": source_path,
            "destination": str(dest_full.relative_to(workspace_root)),
        }
    except (OSError, PermissionError) as e:
        return {"error": f"Cannot copy: {e}"}
