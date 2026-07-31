import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  File as FileIcon,
  Folder,
  FolderPlus,
  Loader2,
  MessageSquare,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import type { ProjectDetail, ProjectSummary } from "@/lib/types";
import { useProjectChats, useProjectDetail, useProjectFiles, useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useClient } from "@/providers/ClientProvider";
import { cn } from "@/lib/utils";

interface ProjectsViewProps {
  token: string | null;
  baseUrl?: string;
  clientApi?: ProjectClientApi | null;
  onBackToChat: () => void;
}

interface ProjectClientApi {
  uploadFile: (projectId: string, file: File) => Promise<void>;
  bindChatToProject: (chatId: string, projectId: string) => Promise<void>;
  unbindChatFromProject: (chatId: string) => Promise<void>;
}

export type { ProjectClientApi };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectsView({
  token,
  baseUrl = "",
  clientApi = null,
  onBackToChat,
}: ProjectsViewProps) {
  const { t } = useTranslation();
  const projectsApi = useProjects({ token, baseUrl });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);

  useEffect(() => {
    if (selectedId && !projectsApi.projects.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [projectsApi.projects, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("sidebar.back", { defaultValue: "Back" })}
            onClick={onBackToChat}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {t("projects.title", { defaultValue: "Projects" })}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("projects.subtitle", {
                defaultValue:
                  "Group context, files, and chats into a single workspace.",
              })}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setCreatorOpen(true)}
          className="gap-2"
          size="sm"
        >
          <FolderPlus className="h-4 w-4" />
          {t("projects.new", { defaultValue: "New project" })}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,18rem)_1fr]">
        <ProjectList
          projects={projectsApi.projects}
          loading={projectsApi.loading}
          error={projectsApi.error}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ProjectDetailPanel
          token={token}
          baseUrl={baseUrl}
          projectId={selectedId}
          clientApi={clientApi}
          onUpdated={projectsApi.refresh}
        />
      </div>
      {creatorOpen && (
        <CreateProjectDialog
          busy={projectsApi.loading}
          onCancel={() => setCreatorOpen(false)}
          onCreate={async (name, instructions) => {
            const detail = await projectsApi.create(name, instructions);
            setCreatorOpen(false);
            setSelectedId(detail.id);
          }}
        />
      )}
    </div>
  );
}

function ProjectList({
  projects,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="flex min-h-0 flex-col border-r border-border/70 bg-muted/20">
      <div className="flex items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t("projects.count", { defaultValue: "Projects" })}</span>
        <span>{projects.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && projects.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("projects.loading", { defaultValue: "Loading…" })}
          </div>
        ) : null}
        {error && (
          <div className="mx-1 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive">
            {error}
          </div>
        )}
        {!loading && projects.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {t("projects.empty", { defaultValue: "No projects yet." })}
          </p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onSelect(project.id)}
                className={cn(
                  "group flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors",
                  selectedId === project.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/55",
                )}
              >
                <span className="flex items-center gap-2">
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{project.name}</span>
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{project.file_count} files</span>
                  <span aria-hidden>·</span>
                  <span>{formatBytes(project.total_bytes)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function ProjectDetailPanel({
  token,
  baseUrl,
  projectId,
  clientApi,
  onUpdated,
}: {
  token: string | null;
  baseUrl: string;
  projectId: string | null;
  clientApi: ProjectClientApi | null;
  onUpdated: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const ctx = useClient();
  const detail = useProjectDetail({ token, projectId, baseUrl });
  const files = useProjectFiles({ token, projectId, baseUrl });
  const chats = useProjectChats({ token, projectId, baseUrl });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyChat, setBusyChat] = useState<string | null>(null);

  const view = useMemo<ProjectDetail | null>(() => detail.detail, [detail.detail]);

  useEffect(() => {
    if (view) {
      setDraftName(view.name);
      setDraftInstructions(view.instructions_md);
    }
  }, [view?.id, view?.name, view?.instructions_md]);

  const handleUnbindChat = useCallback(
    async (chatId: string) => {
      setBusyChat(chatId);
      try {
        await ctx.client.unbindProject(chatId);
        await chats.refresh();
        onUpdated();
      } catch (err) {
        console.warn("unbind failed", err);
      } finally {
        setBusyChat(null);
      }
    },
    [ctx.client, chats, onUpdated],
  );

  if (!projectId) {
    return (
      <section className="flex min-h-0 items-center justify-center px-6 text-sm text-muted-foreground">
        {t("projects.detailEmpty", { defaultValue: "Select a project to inspect it." })}
      </section>
    );
  }

  if (detail.loading && !view) {
    return (
      <section className="flex min-h-0 items-center justify-center px-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("projects.loading", { defaultValue: "Loading…" })}
      </section>
    );
  }

  if (detail.error) {
    return (
      <section className="flex min-h-0 items-center justify-center px-6 text-sm text-destructive">
        {detail.error}
      </section>
    );
  }

  if (!view) {
    return null;
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold">{view.name}</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{view.workspace_path}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraftName(view.name);
                  setDraftInstructions(view.instructions_md);
                }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={detail.loading}
                onClick={async () => {
                  await detail.refresh();
                  onUpdated();
                  setEditing(false);
                }}
              >
                {t("common.save", { defaultValue: "Save" })}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              {t("projects.edit", { defaultValue: "Edit" })}
            </Button>
          )}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_minmax(0,20rem)]">
        <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("projects.context", { defaultValue: "Project context" })}
          </h3>
          {editing ? (
            <div className="flex flex-col gap-3">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t("projects.namePlaceholder", { defaultValue: "Project name" })}
              />
              <Textarea
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                rows={12}
                placeholder={t("projects.instructionsPlaceholder", {
                  defaultValue: "Mission, tone, must-follows…",
                })}
              />
            </div>
          ) : (
            <div className="space-y-3 text-sm leading-relaxed">
              <p className="whitespace-pre-wrap text-foreground">
                {view.instructions_md || (
                  <span className="text-muted-foreground">
                    {t("projects.noInstructions", {
                      defaultValue: "No instructions yet — click Edit to add some.",
                    })}
                  </span>
                )}
              </p>
            </div>
          )}
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("projects.chats", { defaultValue: "Chats" })}
            </h3>
            {chats.loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("projects.loading", { defaultValue: "Loading…" })}
              </div>
            ) : chats.chats.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("projects.noChats", { defaultValue: "No chats bound to this project." })}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {chats.chats.map((chat) => (
                  <li
                    key={chat.chat_id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{chat.title || chat.chat_id}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busyChat === chat.chat_id}
                      onClick={() => void handleUnbindChat(chat.chat_id)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      aria-label={t("chat.projectUnassign", { defaultValue: "Unassign" })}
                    >
                      {busyChat === chat.chat_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col border-l border-border/70 bg-muted/10">
          <header className="flex items-center justify-between border-b border-border/70 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("projects.files", { defaultValue: "Files" })}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {view.file_count} · {formatBytes(view.total_bytes)}
            </span>
          </header>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {files.files.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {t("projects.noFiles", { defaultValue: "No files uploaded yet." })}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {files.files.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatBytes(file.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void files.remove(file.name)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("projects.deleteFile", { defaultValue: "Delete file" })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border/70 px-3 py-3">
            <FileUploadControl
              projectId={projectId}
              clientApi={clientApi}
              onUploaded={async () => {
                await Promise.all([files.refresh(), detail.refresh(), onUpdated()]);
              }}
              onError={setUploadError}
            />
            {uploadError && (
              <p className="mt-2 text-xs text-destructive">{uploadError}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FileUploadControl({
  projectId,
  clientApi,
  onUploaded,
  onError,
}: {
  projectId: string;
  clientApi: ProjectClientApi | null;
  onUploaded: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground transition-colors",
        "hover:border-primary/40 hover:bg-accent/30",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <UploadCloud className="h-3.5 w-3.5" />
      <span>{t("projects.uploadCta", { defaultValue: "Upload file" })}</span>
      <input
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file || !clientApi) return;
          setBusy(true);
          try {
            await clientApi.uploadFile(projectId, file);
            await onUploaded();
            onError("");
          } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
            event.target.value = "";
          }
        }}
      />
    </label>
  );
}

function CreateProjectDialog({
  onCancel,
  onCreate,
  busy,
}: {
  onCancel: () => void;
  onCreate: (name: string, instructions: string) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
        <h2 className="text-base font-semibold">
          {t("projects.createTitle", { defaultValue: "New project" })}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("projects.createHint", {
            defaultValue: "Give it a name and the context the agent should always see.",
          })}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projects.namePlaceholder", { defaultValue: "Project name" })}
          />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder={t("projects.instructionsPlaceholder", {
              defaultValue: "Mission, tone, must-follows…",
            })}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void onCreate(name.trim(), instructions.trim())}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("projects.create", { defaultValue: "Create" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
