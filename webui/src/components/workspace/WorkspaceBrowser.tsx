import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClient } from "@/providers/ClientProvider";
import {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  fetchWorkspaceList,
  fetchWorkspaceRead,
  renameWorkspaceEntry,
  writeWorkspaceFile,
} from "@/lib/api";
import type { WorkspaceEntry, WorkspaceListPayload } from "@/lib/types";
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

export function WorkspaceBrowser({ onBackToChat }: { onBackToChat?: () => void }) {
  const { t } = useTranslation();
  const { token } = useClient();
  const base = "";
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileIsBinary, setFileIsBinary] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [creatingDir, setCreatingDir] = useState(false);

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
        setFileContent(null);
        setFileIsBinary(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const openEntry = useCallback(
    async (entry: WorkspaceEntry) => {
      if (entry.is_directory) {
        void load(entry.path);
        return;
      }
      setSelected(entry);
      setFileContent(null);
      setFileIsBinary(false);
      try {
        const payload = await fetchWorkspaceRead(token, entry.path, base);
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
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, load],
  );

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
        void load(currentPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, currentPath, load, t],
  );

  const onRename = useCallback(
    async (entry: WorkspaceEntry) => {
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

  const onSaveFile = useCallback(async () => {
    if (!selected || fileContent === null) return;
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
  }, [selected, fileContent, token, currentPath, load]);

  const breadcrumb = currentPath ? currentPath.split("/").filter(Boolean) : [];

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void load(currentPath)}
              aria-label={t("workspace.refresh", { defaultValue: "Refresh" })}
              disabled={loading}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
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

        {/* File list */}
        <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
          {currentPath ? (
            <button
              type="button"
              onClick={goUp}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {t("workspace.up", { defaultValue: "Up" })}
            </button>
          ) : null}
          {entries.length === 0 && !loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("workspace.empty", { defaultValue: "This folder is empty." })}
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                className={cn(
                  "flex w-full items-center gap-2 border-t border-border/40 px-3 py-2 text-sm transition-colors",
                  selected?.path === entry.path && !entry.is_directory
                    ? "bg-muted/40"
                    : "hover:bg-muted/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => void openEntry(entry)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {entry.is_directory ? (
                    <Folder className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-sky-500" aria-hidden />
                  )}
                  <span className="truncate font-medium text-foreground">{entry.name}</span>
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
                    aria-label={t("workspace.rename", { defaultValue: "Rename" })}
                  >
                    <File className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => void onDelete(entry)}
                    aria-label={t("workspace.delete", { defaultValue: "Delete" })}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* File preview / editor */}
        {selected && !selected.is_directory ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{selected.name}</h2>
              {!fileIsBinary && fileContent !== null ? (
                <Button size="sm" onClick={() => void onSaveFile()}>
                  {t("workspace.save", { defaultValue: "Save" })}
                </Button>
              ) : null}
            </div>
            {fileIsBinary ? (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                {t("workspace.binary", {
                  defaultValue: "This is a binary file and cannot be displayed as text.",
                })}
              </div>
            ) : fileContent !== null ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                spellCheck={false}
                className="h-96 w-full resize-y rounded-md border border-border/60 bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary/50"
              />
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                {t("workspace.loadingFile", { defaultValue: "Loading…" })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
