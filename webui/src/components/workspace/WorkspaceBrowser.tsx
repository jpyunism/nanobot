import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  EyeOff,
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Image,
  LayoutGrid,
  List,
  Lock,
  MoreVertical,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MarkdownText } from "@/components/MarkdownText";
import { useClient } from "@/providers/ClientProvider";
import {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  fetchWorkspaceFileBlob,
  fetchWorkspaceList,
  fetchWorkspaceRead,
  moveWorkspaceEntry,
  renameWorkspaceEntry,
  writeWorkspaceFile,
} from "@/lib/api";
import type { WorkspaceEntry, WorkspaceListPayload } from "@/lib/types";
import {
  isImageFile,
  loadWorkspaceShowProtected,
  loadWorkspaceViewMode,
  saveWorkspaceShowProtected,
  saveWorkspaceViewMode,
  type WorkspaceViewMode,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return "";
  }
}

function fileIconFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"].includes(ext)) {
    return Image;
  }
  if (["js", "ts", "tsx", "jsx", "py", "java", "go", "rs", "cpp", "c", "h"].includes(ext)) {
    return FileCode;
  }
  if (["md", "txt", "json", "yaml", "yml", "toml", "csv"].includes(ext)) {
    return FileText;
  }
  return File;
}

const VIEW_MODES: { key: WorkspaceViewMode; icon: typeof List; labelKey: string }[] = [
  { key: "list", icon: List, labelKey: "workspace.viewMode.list" },
  { key: "icons", icon: LayoutGrid, labelKey: "workspace.viewMode.icons" },
  { key: "thumbnails", icon: Image, labelKey: "workspace.viewMode.thumbnails" },
];

export function WorkspaceBrowser({ onBackToChat }: { onBackToChat?: () => void }) {
  const { t } = useTranslation();
  const { token } = useClient();
  const base = "";
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>(() => loadWorkspaceViewMode());
  const [showProtected, setShowProtected] = useState<boolean>(() => loadWorkspaceShowProtected());

  const visibleEntries = useMemo(
    () => entries.filter((entry) => showProtected || !entry.protected),
    [entries, showProtected],
  );
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileIsBinary, setFileIsBinary] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState(true);
  const [newDirName, setNewDirName] = useState("");
  const [creatingDir, setCreatingDir] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [draggedEntry, setDraggedEntry] = useState<WorkspaceEntry | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);
  const previewAbortController = useRef<AbortController | null>(null);

  const selectedIsMarkdown = useMemo(() => {
    if (!selected || selected.is_directory) return false;
    return selected.name.toLowerCase().endsWith(".md");
  }, [selected]);

  const changeViewMode = useCallback((mode: WorkspaceViewMode) => {
    setViewMode(mode);
    saveWorkspaceViewMode(mode);
  }, []);

  const toggleShowProtected = useCallback(() => {
    setShowProtected((prev) => {
      const next = !prev;
      saveWorkspaceShowProtected(next);
      return next;
    });
  }, []);

  const revokeObjectUrls = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const payload: WorkspaceListPayload = await fetchWorkspaceList(token, path, base);
        if (payload.error) {
          setError(payload.error);
          return;
        }
        setCurrentPath(payload.current_path ?? "");
        setEntries(payload.files ?? []);
        setSelected(null);
        setPreviewOpen(false);
        setFileContent(null);
        setFileIsBinary(false);
        setSelectedImageUrl(null);
        revokeObjectUrls();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [token, revokeObjectUrls],
  );

  useEffect(() => {
    void load("");
    return () => {
      previewAbortController.current?.abort();
      revokeObjectUrls();
    };
  }, [load, revokeObjectUrls]);

  const loadPreview = useCallback(
    async (entry: WorkspaceEntry) => {
      previewAbortController.current?.abort();
      const controller = new AbortController();
      previewAbortController.current = controller;

      setFileContent(null);
      setFileIsBinary(false);
      setSelectedImageUrl(null);
      revokeObjectUrls();

      if (isImageFile(entry.name)) {
        try {
          const blob = await fetchWorkspaceFileBlob(token, entry.path, base, controller.signal);
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          objectUrls.current.push(url);
          setSelectedImageUrl(url);
        } catch (err) {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      try {
        const payload = await fetchWorkspaceRead(token, entry.path, base, controller.signal);
        if (controller.signal.aborted) return;
        if (payload.error) {
          setError(payload.error);
          return;
        }
        if (payload.is_binary) {
          setFileIsBinary(true);
          return;
        }
        setFileContent(payload.content ?? "");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, revokeObjectUrls],
  );

  const openEntry = useCallback(
    async (entry: WorkspaceEntry) => {
      if (entry.is_directory) {
        void load(entry.path);
        return;
      }
      setSelected(entry);
      setPreviewOpen(true);
      void loadPreview(entry);
    },
    [load, loadPreview],
  );

  const closePreview = useCallback(() => {
    previewAbortController.current?.abort();
    previewAbortController.current = null;
    setPreviewOpen(false);
    setSelected(null);
    setFileContent(null);
    setFileIsBinary(false);
    setSelectedImageUrl(null);
    revokeObjectUrls();
  }, [revokeObjectUrls]);

  const goUp = useCallback(() => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    void load(parts.join("/"));
  }, [currentPath, load]);

  const onCreateDir = useCallback(async () => {
    const name = newDirName.trim();
    if (!name) return;
    setCreatingDir(true);
    setError(null);
    try {
      const target = currentPath ? `${currentPath}/${name}` : name;
      const result = await createWorkspaceDirectory(token, target, base);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewDirName("");
      void load(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingDir(false);
    }
  }, [newDirName, currentPath, token, load]);

  const onDelete = useCallback(
    async (entry: WorkspaceEntry) => {
      if (entry.protected) {
        setError(
          t("workspace.protectedCannotDelete", {
            defaultValue: `Cannot delete "${entry.name}": required for nanobot to function`,
          }),
        );
        return;
      }
      if (!confirm(t("workspace.deleteConfirm", { defaultValue: `Delete "${entry.name}"?` }))) {
        return;
      }
      setError(null);
      try {
        const result = await deleteWorkspaceEntry(token, entry.path, base);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (selected?.path === entry.path) {
          closePreview();
        }
        void load(currentPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, currentPath, load, t, selected, closePreview],
  );

  const onRename = useCallback(
    async (entry: WorkspaceEntry) => {
      if (entry.protected) {
        setError(
          t("workspace.protectedCannotRename", {
            defaultValue: `Cannot rename "${entry.name}": required for nanobot to function`,
          }),
        );
        return;
      }
      const newName = prompt(
        t("workspace.renamePrompt", { defaultValue: `Rename "${entry.name}" to:` }),
        entry.name,
      );
      if (!newName || newName === entry.name) return;
      setError(null);
      try {
        const result = await renameWorkspaceEntry(token, entry.path, newName, base);
        if (result.error) {
          setError(result.error);
          return;
        }
        void load(currentPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, currentPath, load, t],
  );

  const onMove = useCallback(
    async (source: WorkspaceEntry, targetPath: string) => {
      if (source.protected) {
        setError(
          t("workspace.protectedCannotMove", {
            defaultValue: `Cannot move "${source.name}": required for nanobot to function`,
          }),
        );
        return;
      }
      if (!targetPath) return;
      if (source.is_directory && targetPath.startsWith(`${source.path}/`)) {
        setError(
          t("workspace.moveIntoSelf", { defaultValue: "Cannot move a folder into itself or its children" }),
        );
        return;
      }
      setError(null);
      try {
        const result = await moveWorkspaceEntry(token, source.path, targetPath, base);
        if (result.error) {
          setError(result.error);
          return;
        }
        void load(currentPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, currentPath, load, t],
  );

  const onSaveFile = useCallback(async () => {
    if (!selected || fileContent === null) return;
    if (selected.protected) {
      setError(
        t("workspace.protectedCannotModify", {
          defaultValue: `Cannot modify "${selected.name}": required for nanobot to function`,
        }),
      );
      return;
    }
    setError(null);
    try {
      const result = await writeWorkspaceFile(token, selected.path, fileContent, base);
      if (result.error) {
        setError(result.error);
        return;
      }
      void load(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selected, fileContent, token, currentPath, load, t]);

  const onDownload = useCallback(async () => {
    if (!selected) return;
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await fetchWorkspaceFileBlob(token, selected.path, base);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = selected.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }, [selected, token, downloading]);

  const breadcrumb = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const selectedIcon = useMemo(() => {
    if (!selected) return File;
    if (selected.is_directory) return Folder;
    return fileIconFor(selected.name);
  }, [selected]);

  const SelectedIcon = selectedIcon;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 md:h-full md:overflow-hidden">
        {onBackToChat ? (
          <button
            type="button"
            onClick={onBackToChat}
            className="touch-target -ml-1 mb-1 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground lg:hidden"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            {t("settings.backToChat", { defaultValue: "Back to chat" })}
          </button>
        ) : null}
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("workspace.title", { defaultValue: "Workspace" })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("workspace.subtitle", {
                defaultValue: "Browse and edit files in the current workspace.",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-2 flex items-center rounded-md border border-border/60 p-0.5">
              {VIEW_MODES.map(({ key, icon: Icon, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeViewMode(key)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors",
                    viewMode === key
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                  aria-label={t(labelKey)}
                  title={t(labelKey)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void load(currentPath)}
              aria-label={t("workspace.refresh", { defaultValue: "Refresh" })}
              disabled={loading}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(!showProtected && "text-destructive hover:text-destructive")}
              onClick={toggleShowProtected}
              aria-label={t(
                showProtected ? "workspace.hideProtected" : "workspace.showProtected",
                { defaultValue: showProtected ? "Hide protected" : "Show protected" },
              )}
              title={t(
                showProtected ? "workspace.hideProtected" : "workspace.showProtected",
                { defaultValue: showProtected ? "Hide protected" : "Show protected" },
              )}
            >
              {showProtected ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => void load("")}
            className={cn(
              "touch-target rounded-full px-2 py-1 font-medium transition-colors",
              currentPath === "" ? "text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {t("workspace.root", { defaultValue: "Workspace" })}
          </button>
          {breadcrumb.map((part, idx) => {
            const path = breadcrumb.slice(0, idx + 1).join("/");
            const isLast = idx === breadcrumb.length - 1;
            return (
              <span key={path} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
                <button
                  type="button"
                  onClick={() => void load(path)}
                  className={cn(
                    "touch-target rounded-full px-2 py-1 font-medium transition-colors",
                    isLast ? "text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        {/* New directory */}
        <div className="flex items-center gap-2">
          <Input
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            placeholder={t("workspace.newDirPlaceholder", { defaultValue: "New folder name…" })}
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") void onCreateDir();
            }}
          />
          <Button onClick={() => void onCreateDir()} disabled={creatingDir || !newDirName.trim()}>
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            <span>{t("workspace.newDir", { defaultValue: "New folder" })}</span>
          </Button>
        </div>

        {/* Main browser area */}
        <div
          className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-muted/10"
          onDragOver={(e) => {
            if (draggedEntry && currentPath) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggedEntry && currentPath) {
              void onMove(draggedEntry, currentPath);
            }
            setDraggedEntry(null);
            setDropTargetPath(null);
          }}
        >
          <div className="h-full overflow-auto p-3">
            {currentPath ? (
              <button
                type="button"
                onClick={goUp}
                className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t("workspace.up", { defaultValue: "Up" })}
              </button>
            ) : null}
            {visibleEntries.length === 0 && !loading ? (
              <div className="px-3 py-12 text-center text-sm text-muted-foreground">
                {t("workspace.empty", { defaultValue: "This folder is empty." })}
              </div>
            ) : viewMode === "list" ? (
              <div className="overflow-hidden rounded-md border border-border/40">
                {visibleEntries.map((entry) => {
                  const isDropTarget = dropTargetPath === entry.path && entry.is_directory;
                  return (
                    <div
                      key={entry.path}
                      draggable={!entry.protected}
                      onDragStart={(e) => {
                        if (entry.protected) {
                          e.preventDefault();
                          return;
                        }
                        setDraggedEntry(entry);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", entry.path);
                      }}
                      onDragOver={(e) => {
                        if (entry.is_directory && draggedEntry && draggedEntry.path !== entry.path) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTargetPath(entry.path);
                        }
                      }}
                      onDragLeave={() => setDropTargetPath(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTargetPath(null);
                        if (draggedEntry && entry.is_directory && draggedEntry.path !== entry.path) {
                          void onMove(draggedEntry, entry.path);
                        }
                        setDraggedEntry(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 border-t border-border/40 px-3 py-2 text-sm transition-colors first:border-t-0",
                        selected?.path === entry.path && !entry.is_directory
                          ? "bg-muted/40"
                          : "hover:bg-muted/30",
                        entry.protected && "bg-destructive/5",
                        isDropTarget && "ring-2 ring-inset ring-primary/50 bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void openEntry(entry)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {entry.is_directory ? (
                          <Folder className={cn("h-4 w-4 shrink-0", entry.protected ? "text-destructive" : "text-amber-500")} aria-hidden />
                        ) : (
                          <File className={cn("h-4 w-4 shrink-0", entry.protected ? "text-destructive" : "text-sky-500")} aria-hidden />
                        )}
                        <span className={cn("truncate font-medium", entry.protected ? "text-destructive" : "text-foreground")}>
                          {entry.name}
                        </span>
                        {entry.protected ? (
                          <Lock className="h-3 w-3 shrink-0 text-destructive" aria-hidden />
                        ) : null}
                      </button>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {entry.is_directory ? "—" : formatBytes(entry.size)}
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                        {formatDate(entry.modified_at)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => void onRename(entry)}
                          disabled={entry.protected}
                          aria-label={t("workspace.rename", { defaultValue: "Rename" })}
                          title={entry.protected ? t("workspace.protected", { defaultValue: "Protected" }) : t("workspace.rename", { defaultValue: "Rename" })}
                        >
                          <File className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive disabled:opacity-40"
                          onClick={() => void onDelete(entry)}
                          disabled={entry.protected}
                          aria-label={t("workspace.delete", { defaultValue: "Delete" })}
                          title={entry.protected ? t("workspace.protected", { defaultValue: "Protected" }) : t("workspace.delete", { defaultValue: "Delete" })}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={cn(
                  "grid gap-3",
                  viewMode === "thumbnails"
                    ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
                )}
              >
                {visibleEntries.map((entry) => {
                  const EntryIcon = entry.is_directory ? Folder : fileIconFor(entry.name);
                  const isSelected = selected?.path === entry.path;
                  const isDropTarget = dropTargetPath === entry.path && entry.is_directory;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      draggable={!entry.protected}
                      onDragStart={(e) => {
                        if (entry.protected) {
                          e.preventDefault();
                          return;
                        }
                        setDraggedEntry(entry);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", entry.path);
                      }}
                      onDragOver={(e) => {
                        if (entry.is_directory && draggedEntry && draggedEntry.path !== entry.path) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTargetPath(entry.path);
                        }
                      }}
                      onDragLeave={() => setDropTargetPath(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTargetPath(null);
                        if (draggedEntry && entry.is_directory && draggedEntry.path !== entry.path) {
                          void onMove(draggedEntry, entry.path);
                        }
                        setDraggedEntry(null);
                      }}
                      onClick={() => void openEntry(entry)}
                      onDoubleClick={() => entry.is_directory && void load(entry.path)}
                      className={cn(
                        "group relative flex flex-col items-center overflow-hidden rounded-lg border border-border/50 bg-background p-3 text-center transition-colors hover:border-border hover:bg-muted/40",
                        isSelected && !entry.is_directory && "border-primary/40 bg-primary/5",
                        entry.protected && "border-destructive/30 bg-destructive/5",
                        isDropTarget && "ring-2 ring-inset ring-primary/50 bg-primary/5",
                      )}
                    >
                      {entry.protected ? (
                        <div className="absolute right-1 top-1 z-10 rounded-full bg-destructive/10 p-0.5">
                          <Lock className="h-3 w-3 text-destructive" aria-hidden />
                        </div>
                      ) : null}
                      <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t("workspace.actions", { defaultValue: "Actions" })}
                            >
                              <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => void onRename(entry)}
                              disabled={entry.protected}
                            >
                              {t("workspace.rename", { defaultValue: "Rename" })}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void onDelete(entry)}
                              disabled={entry.protected}
                            >
                              {t("workspace.delete", { defaultValue: "Delete" })}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted/20">
                        {viewMode === "thumbnails" && !entry.is_directory && isImageFile(entry.name) ? (
                          <WorkspaceThumbnail token={token} path={entry.path} name={entry.name} />
                        ) : (
                          <EntryIcon
                            className={cn(
                              "h-12 w-12 shrink-0",
                              entry.is_directory
                                ? entry.protected ? "text-destructive" : "text-amber-500"
                                : entry.protected ? "text-destructive" : "text-sky-500",
                            )}
                            aria-hidden
                          />
                        )}
                      </div>
                      <span className={cn("w-full truncate text-xs font-medium", entry.protected ? "text-destructive" : "text-foreground")}>
                        {entry.name}
                      </span>
                      <span className="mt-0.5 w-full truncate text-[10px] text-muted-foreground">
                        {entry.is_directory ? t("workspace.folder", { defaultValue: "Folder" }) : formatBytes(entry.size)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right preview sidebar */}
      <aside
        aria-label={t("workspace.preview.title", { defaultValue: "Preview" })}
        className={cn(
          "absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border/70 bg-background shadow-2xl transition-transform duration-300 ease-out md:w-[480px] md:shadow-none",
          previewOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <SelectedIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate text-sm font-medium text-foreground" title={selected?.path}>
              {selected?.name}
            </span>
          </div>
          {selectedIsMarkdown ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setMarkdownPreview((prev) => !prev)}
              aria-label={
                markdownPreview
                  ? t("workspace.preview.edit", { defaultValue: "Edit" })
                  : t("workspace.preview.preview", { defaultValue: "Preview" })
              }
              title={
                markdownPreview
                  ? t("workspace.preview.edit", { defaultValue: "Edit" })
                  : t("workspace.preview.preview", { defaultValue: "Preview" })
              }
            >
              {markdownPreview ? (
                <Edit3 className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => void onDownload()}
            disabled={downloading || !selected}
            aria-label={t("workspace.preview.download", { defaultValue: "Download" })}
            title={t("workspace.preview.download", { defaultValue: "Download" })}
          >
            {downloading ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={closePreview}
            aria-label={t("workspace.preview.close", { defaultValue: "Close preview" })}
            title={t("workspace.preview.close", { defaultValue: "Close preview" })}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("workspace.preview.empty", { defaultValue: "Select a file to preview." })}
            </div>
          ) : selectedImageUrl ? (
            <div className="flex h-full items-center justify-center">
              <img
                src={selectedImageUrl}
                alt={selected.name}
                className="max-h-full max-w-full rounded-md object-contain shadow-sm"
              />
            </div>
          ) : fileIsBinary ? (
            <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
              {t("workspace.binary", {
                defaultValue: "This is a binary file and cannot be displayed as text.",
              })}
            </div>
          ) : fileContent !== null ? (
            <div className="flex h-full flex-col gap-2">
              <div className="flex justify-end gap-2">
                {selectedIsMarkdown ? (
                  <Button
                    size="sm"
                    variant={markdownPreview ? "outline" : "default"}
                    onClick={() => setMarkdownPreview((prev) => !prev)}
                  >
                    {markdownPreview
                      ? t("workspace.preview.edit", { defaultValue: "Edit" })
                      : t("workspace.preview.preview", { defaultValue: "Preview" })}
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => void onSaveFile()}>
                  {t("workspace.save", { defaultValue: "Save" })}
                </Button>
              </div>
              {selectedIsMarkdown && markdownPreview ? (
                <div className="prose prose-sm dark:prose-invert max-w-none flex-1 overflow-auto rounded-md border border-border/60 bg-background p-3">
                  <MarkdownText>{fileContent}</MarkdownText>
                </div>
              ) : (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  spellCheck={false}
                  className="min-h-[16rem] flex-1 resize-y rounded-md border border-border/60 bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
                />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("workspace.loadingFile", { defaultValue: "Loading…" })}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay backdrop */}
      {previewOpen ? (
        <div
          className="absolute inset-0 z-20 bg-black/20 md:hidden"
          onClick={closePreview}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function WorkspaceThumbnail({
  token,
  path,
  name,
}: {
  token: string;
  path: string;
  name: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchWorkspaceFileBlob(token, path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, path]);

  if (failed || !url) {
    const FallbackIcon = fileIconFor(name);
    return (
      <FallbackIcon className="h-12 w-12 shrink-0 text-sky-500" aria-hidden />
    );
  }

  return (
    <img
      src={url}
      alt={name}
      className="h-full w-full object-contain p-1"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
