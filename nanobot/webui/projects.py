"""WebUI Projects: per-project capsules with instructions and uploaded files.

Each project lives at ``<data_dir>/webui/projects/<id>/``::

    project.json   # {id, name, instructions_md, created_at, updated_at}
    files/         # uploaded files, one entry per file id

Files are stored on disk as ``<file_id>.bin`` with a sibling
``<file_id>.meta.json`` describing the original name and mime type.
This module is intentionally I/O-only and duck-types the
``SessionManager`` so it never pulls in ``nanobot.command`` or
``nanobot.agent`` (the modules that historically caused circular
imports when the WebUI was wired into the gateway startup).
"""

from __future__ import annotations

import base64
import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass


class ProjectError(Exception):
    """Raised when a project operation fails (404, validation, IO)."""


@dataclass(frozen=True)
class ProjectSummary:
    id: str
    name: str
    instructions_md: str
    created_at_ms: int
    updated_at_ms: int
    file_count: int
    byte_count: int
    folder_count: int = 0


@dataclass(frozen=True)
class ProjectFile:
    id: str
    project_id: str
    name: str
    mime_type: str
    size: int
    created_at_ms: int


@dataclass(frozen=True)
class ProjectFolder:
    path: str
    created_at_ms: int


_PROJECTS_DIRNAME = "projects"
_FILES_DIRNAME = "files"


def _slugify_id(raw: str) -> str:
    """Return a filesystem-safe id (UUID if input is empty/unsafe)."""
    candidate = "".join(
        c if c.isalnum() or c in ("-", "_") else "-" for c in (raw or "").strip()
    ).strip("-")
    if not candidate:
        candidate = uuid.uuid4().hex
    return candidate[:64] or uuid.uuid4().hex


def _now_ms() -> int:
    return int(time.time() * 1000)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectError(f"corrupt json at {path}: {exc}") from exc
    return data if isinstance(data, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _decode_data_url(data_url: str) -> tuple[bytes, str]:
    """Parse ``data:<mime>;base64,<payload>`` into (bytes, mime_type)."""
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        raise ProjectError("file must be a base64 data URL")
    head, _, payload = data_url.partition(",")
    if not payload:
        raise ProjectError("empty data URL payload")
    mime = "application/octet-stream"
    if ";" in head:
        mime = head[5:].split(";", 1)[0] or mime
    try:
        return base64.b64decode(payload, validate=True), mime
    except (ValueError, TypeError) as exc:
        raise ProjectError(f"invalid base64 payload: {exc}") from exc


class WebUIProjectsController:
    """CRUD for project capsules + file storage under ``<data_dir>/webui/projects/``."""

    def __init__(self, data_dir: Path) -> None:
        self._root = (data_dir / _PROJECTS_DIRNAME).resolve(strict=False)
        self._root.mkdir(parents=True, exist_ok=True)

    def _project_dir(self, project_id: str) -> Path:
        return self._root / project_id

    def _files_dir(self, project_id: str) -> Path:
        return self._project_dir(project_id) / _FILES_DIRNAME

    def _meta_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "project.json"

    def _file_meta_path(self, project_id: str, file_id: str) -> Path:
        return self._files_dir(project_id) / f"{file_id}.meta.json"

    def _file_data_path(self, project_id: str, file_id: str) -> Path:
        return self._files_dir(project_id) / f"{file_id}.bin"

    def _folders_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "folders.json"

    def list_projects(self) -> list[ProjectSummary]:
        out: list[ProjectSummary] = []
        for child in sorted(self._root.iterdir()):
            if not child.is_dir() or not (child / "project.json").is_file():
                continue
            try:
                out.append(self._summary(child))
            except ProjectError:
                continue
        return out

    def get_project(self, project_id: str) -> ProjectSummary:
        pdir = self._project_dir(project_id)
        if not (pdir / "project.json").is_file():
            raise ProjectError(f"project not found: {project_id}")
        return self._summary(pdir)

    def create_project(self, name: str, instructions_md: str) -> ProjectSummary:
        clean_name = (name or "").strip()
        if not clean_name:
            raise ProjectError("project name is required")
        clean_instructions = (instructions_md or "").strip()
        project_id = self._unique_id(clean_name)
        meta = {
            "id": project_id,
            "name": clean_name,
            "instructions_md": clean_instructions,
            "created_at_ms": _now_ms(),
            "updated_at_ms": _now_ms(),
        }
        pdir = self._project_dir(project_id)
        pdir.mkdir(parents=True, exist_ok=False)
        (pdir / _FILES_DIRNAME).mkdir(parents=True, exist_ok=True)
        _write_json(self._meta_path(project_id), meta)
        return self._summary(pdir)

    def update_project(
        self,
        project_id: str,
        name: str,
        instructions_md: str,
    ) -> ProjectSummary:
        meta_path = self._meta_path(project_id)
        if not meta_path.is_file():
            raise ProjectError(f"project not found: {project_id}")
        meta = _read_json(meta_path)
        clean_name = (name or "").strip()
        if not clean_name:
            raise ProjectError("project name is required")
        meta["name"] = clean_name
        meta["instructions_md"] = (instructions_md or "").strip()
        meta["updated_at_ms"] = _now_ms()
        _write_json(meta_path, meta)
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> None:
        pdir = self._project_dir(project_id)
        if not pdir.is_dir():
            raise ProjectError(f"project not found: {project_id}")
        for child in pdir.iterdir():
            if child.is_file() or child.is_symlink():
                child.unlink()
            elif child.is_dir():
                for sub in child.rglob("*"):
                    if sub.is_file() or sub.is_symlink():
                        sub.unlink()
                child.rmdir()
        pdir.rmdir()

    def list_files(self, project_id: str) -> list[ProjectFile]:
        fdir = self._files_dir(project_id)
        if not fdir.is_dir():
            raise ProjectError(f"project not found: {project_id}")
        out: list[ProjectFile] = []
        for meta in sorted(fdir.glob("*.meta.json")):
            try:
                data = _read_json(meta)
            except ProjectError:
                continue
            out.append(
                ProjectFile(
                    id=data.get("id", meta.stem),
                    project_id=project_id,
                    name=data.get("name", meta.stem),
                    mime_type=data.get("mime_type", "application/octet-stream"),
                    size=int(data.get("size", 0)),
                    created_at_ms=int(data.get("created_at_ms", 0)),
                )
            )
        return out

    def add_file(
        self,
        project_id: str,
        name: str,
        data_url: str,
    ) -> ProjectFile:
        if not self._meta_path(project_id).is_file():
            raise ProjectError(f"project not found: {project_id}")
        clean_name = (name or "").strip()
        if not clean_name:
            raise ProjectError("file name is required")
        payload, mime = _decode_data_url(data_url)
        fdir = self._files_dir(project_id)
        fdir.mkdir(parents=True, exist_ok=True)
        file_id = uuid.uuid4().hex
        data_path = self._file_data_path(project_id, file_id)
        meta_path = self._file_meta_path(project_id, file_id)
        with data_path.open("wb") as fh:
            fh.write(payload)
        meta = {
            "id": file_id,
            "name": clean_name,
            "mime_type": mime,
            "size": len(payload),
            "created_at_ms": _now_ms(),
        }
        _write_json(meta_path, meta)
        self._touch_project(project_id)
        return ProjectFile(
            id=file_id,
            project_id=project_id,
            name=clean_name,
            mime_type=mime,
            size=len(payload),
            created_at_ms=meta["created_at_ms"],
        )

    def read_file(self, project_id: str, file_id: str) -> tuple[bytes, ProjectFile]:
        meta_path = self._file_meta_path(project_id, file_id)
        if not meta_path.is_file():
            raise ProjectError(f"file not found: {file_id}")
        data_path = self._file_data_path(project_id, file_id)
        if not data_path.is_file():
            raise ProjectError(f"file payload missing: {file_id}")
        meta = _read_json(meta_path)
        with data_path.open("rb") as fh:
            return fh.read(), ProjectFile(
                id=meta.get("id", file_id),
                project_id=project_id,
                name=meta.get("name", file_id),
                mime_type=meta.get("mime_type", "application/octet-stream"),
                size=int(meta.get("size", 0)),
                created_at_ms=int(meta.get("created_at_ms", 0)),
            )

    def delete_file(self, project_id: str, file_id: str) -> None:
        meta_path = self._file_meta_path(project_id, file_id)
        if not meta_path.is_file():
            raise ProjectError(f"file not found: {file_id}")
        meta_path.unlink()
        data_path = self._file_data_path(project_id, file_id)
        if data_path.is_file():
            data_path.unlink()
        self._touch_project(project_id)

    def list_folders(self, project_id: str) -> list[ProjectFolder]:
        if not self._meta_path(project_id).is_file():
            raise ProjectError(f"project not found: {project_id}")
        data = _read_json(self._folders_path(project_id))
        raw = data.get("folders", [])
        out: list[ProjectFolder] = []
        for entry in raw if isinstance(raw, list) else []:
            if not isinstance(entry, dict):
                continue
            path = entry.get("path")
            if not isinstance(path, str) or not path.strip():
                continue
            out.append(
                ProjectFolder(
                    path=path.strip(),
                    created_at_ms=int(entry.get("created_at_ms", 0)),
                )
            )
        return out

    def add_folder(self, project_id: str, path: str) -> ProjectFolder:
        if not self._meta_path(project_id).is_file():
            raise ProjectError(f"project not found: {project_id}")
        clean = (path or "").strip()
        if not clean:
            raise ProjectError("folder path is required")
        if "\0" in clean:
            raise ProjectError("folder path contains invalid characters")
        folders = self.list_folders(project_id)
        if any(f.path == clean for f in folders):
            raise ProjectError("folder already associated")
        folder = ProjectFolder(path=clean, created_at_ms=_now_ms())
        self._write_folders(project_id, [*folders, folder])
        self._touch_project(project_id)
        return folder

    def remove_folder(self, project_id: str, path: str) -> None:
        if not self._meta_path(project_id).is_file():
            raise ProjectError(f"project not found: {project_id}")
        clean = (path or "").strip()
        folders = self.list_folders(project_id)
        remaining = [f for f in folders if f.path != clean]
        if len(remaining) == len(folders):
            raise ProjectError(f"folder not found: {clean}")
        self._write_folders(project_id, remaining)
        self._touch_project(project_id)

    def _write_folders(self, project_id: str, folders: list[ProjectFolder]) -> None:
        _write_json(
            self._folders_path(project_id),
            {
                "folders": [
                    {"path": f.path, "created_at_ms": f.created_at_ms}
                    for f in folders
                ]
            },
        )

    def _unique_id(self, name: str) -> str:
        base = _slugify_id(name.lower().replace(" ", "-"))
        candidate = base
        suffix = 1
        while (self._project_dir(candidate) / "project.json").exists():
            suffix += 1
            candidate = f"{base}-{suffix}"
        return candidate

    def _touch_project(self, project_id: str) -> None:
        meta_path = self._meta_path(project_id)
        if not meta_path.is_file():
            return
        meta = _read_json(meta_path)
        meta["updated_at_ms"] = _now_ms()
        _write_json(meta_path, meta)

    def _summary(self, pdir: Path) -> ProjectSummary:
        meta = _read_json(pdir / "project.json")
        if not meta:
            raise ProjectError(f"project meta missing in {pdir}")
        fdir = pdir / _FILES_DIRNAME
        file_count = 0
        byte_count = 0
        if fdir.is_dir():
            for meta_path in fdir.glob("*.meta.json"):
                file_count += 1
                try:
                    byte_count += int(_read_json(meta_path).get("size", 0))
                except ProjectError:
                    continue
        return ProjectSummary(
            id=meta.get("id", pdir.name),
            name=meta.get("name", pdir.name),
            instructions_md=meta.get("instructions_md", ""),
            created_at_ms=int(meta.get("created_at_ms", 0)),
            updated_at_ms=int(meta.get("updated_at_ms", 0)),
            file_count=file_count,
            byte_count=byte_count,
            folder_count=len(self.list_folders(meta.get("id", pdir.name))),
        )


# ---- payload builders (no IO) ----


def projects_list_payload(controller: WebUIProjectsController) -> dict[str, Any]:
    return {
        "projects": [
            {
                "id": s.id,
                "name": s.name,
                "instructions_md": s.instructions_md,
                "created_at_ms": s.created_at_ms,
                "updated_at_ms": s.updated_at_ms,
                "file_count": s.file_count,
                "byte_count": s.byte_count,
                "folder_count": s.folder_count,
            }
            for s in controller.list_projects()
        ]
    }


def project_detail_payload(
    controller: WebUIProjectsController,
    project_id: str,
) -> dict[str, Any]:
    s = controller.get_project(project_id)
    return {
        "id": s.id,
        "name": s.name,
        "instructions_md": s.instructions_md,
        "created_at_ms": s.created_at_ms,
        "updated_at_ms": s.updated_at_ms,
        "file_count": s.file_count,
        "byte_count": s.byte_count,
        "folders": [
            {"path": f.path, "created_at_ms": f.created_at_ms}
            for f in controller.list_folders(project_id)
        ],
        "files": [
            {
                "id": f.id,
                "name": f.name,
                "mime_type": f.mime_type,
                "size": f.size,
                "created_at_ms": f.created_at_ms,
            }
            for f in controller.list_files(project_id)
        ],
    }


def project_file_payload(
    controller: WebUIProjectsController,
    project_id: str,
    file_id: str,
) -> dict[str, Any]:
    payload, file = controller.read_file(project_id, file_id)
    return {
        "id": file.id,
        "project_id": file.project_id,
        "name": file.name,
        "mime_type": file.mime_type,
        "size": file.size,
        "created_at_ms": file.created_at_ms,
        "data_url": "data:"
        + file.mime_type
        + ";base64,"
        + base64.b64encode(payload).decode("ascii"),
    }
