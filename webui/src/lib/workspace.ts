import type { WorkspaceAccessMode, WorkspaceScopePayload } from "@/lib/types";

export function scopeWithAccessMode(
  scope: WorkspaceScopePayload,
  accessMode: WorkspaceAccessMode,
): WorkspaceScopePayload {
  return {
    ...scope,
    access_mode: accessMode,
    restrict_to_workspace: accessMode === "restricted",
  };
}

export function projectNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || path;
}

export function shortWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

export function isAbsoluteWorkspacePath(path: string): boolean {
  const trimmed = path.trim();
  return (
    trimmed === "~"
    || trimmed.startsWith("~/")
    || trimmed.startsWith("~\\")
    || trimmed.startsWith("/")
    || /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

export function selectedProjectScope(
  scope: WorkspaceScopePayload | null,
  defaultScope: WorkspaceScopePayload | null,
): WorkspaceScopePayload | null {
  if (!scope || !defaultScope) return null;
  return sameWorkspacePath(scope.project_path, defaultScope.project_path) ? null : scope;
}

export function normalizeWorkspacePath(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized || "/";
}

export function sameWorkspacePath(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b);
}

export type WorkspaceViewMode = "list" | "icons" | "thumbnails";

const WORKSPACE_VIEW_MODE_KEY = "nanobot.workspace.viewMode";
const WORKSPACE_SHOW_PROTECTED_KEY = "nanobot.workspace.showProtected";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
]);

export function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function loadWorkspaceViewMode(): WorkspaceViewMode {
  const raw = typeof window !== "undefined" ? localStorage.getItem(WORKSPACE_VIEW_MODE_KEY) : null;
  if (raw === "list" || raw === "icons" || raw === "thumbnails") return raw;
  return "list";
}

export function saveWorkspaceViewMode(mode: WorkspaceViewMode): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WORKSPACE_VIEW_MODE_KEY, mode);
  }
}

export function loadWorkspaceShowProtected(): boolean {
  const raw = typeof window !== "undefined" ? localStorage.getItem(WORKSPACE_SHOW_PROTECTED_KEY) : null;
  if (raw === "false") return false;
  if (raw === "true") return true;
  return true;
}

export function saveWorkspaceShowProtected(show: boolean): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WORKSPACE_SHOW_PROTECTED_KEY, show ? "true" : "false");
  }
}
