import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjects } from "@/hooks/useProjects";
import { useClient } from "@/providers/ClientProvider";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import type { ProjectSummary } from "@/lib/types";

export function ProjectsSurface() {
  const { t } = useTranslation();
  const { token } = useClient();
  const base = "";
  const state = useProjects(base, token);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const detail = await state.create(newName.trim(), newInstructions.trim());
      setShowCreate(false);
      setNewName("");
      setNewInstructions("");
      setSelectedId(detail.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm(t("projects.deleteConfirm", { defaultValue: "Delete this project?" }))) {
      return;
    }
    setBusy(true);
    try {
      await state.remove(id);
      if (selectedId === id) setSelectedId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("projects.title", { defaultValue: "Projects" })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("projects.subtitle", {
                defaultValue:
                  "Bundle instructions and files into reusable capsules for focused chats.",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void state.refresh()}
              aria-label={t("projects.refresh", { defaultValue: "Refresh" })}
              disabled={state.loading}
            >
              <RefreshCw
                className={state.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                aria-hidden="true"
              />
            </Button>
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t("projects.new", { defaultValue: "New project" })}</span>
            </Button>
          </div>
        </header>

        {state.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        ) : null}

        {showCreate ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="grid gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {t("projects.nameLabel", { defaultValue: "Name" })}
                </label>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("projects.namePlaceholder", {
                    defaultValue: "e.g. refactor-research",
                  })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {t("projects.instructionsLabel", { defaultValue: "Instructions" })}
                </label>
                <Textarea
                  rows={4}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder={t("projects.instructionsPlaceholder", {
                    defaultValue:
                      "Optional instructions prepended to the agent's context when this project is attached.",
                  })}
                />
              </div>
              {createError ? (
                <p className="text-xs text-destructive">{createError}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  {t("projects.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  onClick={onCreate}
                  disabled={!newName.trim() || creating}
                >
                  {creating
                    ? t("projects.creating", { defaultValue: "Creating…" })
                    : t("projects.create", { defaultValue: "Create" })}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {state.projects.length === 0 && !state.loading ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
            {t("projects.empty", {
              defaultValue:
                "No projects yet. Click 'New project' to create one.",
            })}
          </div>
        ) : (
          <ul className="grid gap-3">
            {state.projects.map((p) => (
              <li key={p.id}>
                <ProjectCard
                  project={p}
                  selected={selectedId === p.id}
                  onSelect={() =>
                    setSelectedId((current) => (current === p.id ? null : p.id))
                  }
                  onDelete={() => void onDelete(p.id)}
                  busy={busy}
                />
              </li>
            ))}
          </ul>
        )}

        {selectedId ? (
          <ProjectDetail
            projectId={selectedId}
            state={state}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

type CardProps = {
  project: ProjectSummary;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

function ProjectCard({ project, selected, busy, onSelect, onDelete }: CardProps) {
  const { t } = useTranslation();
  const updated = new Date(project.updated_at_ms);
  return (
    <div
      className={
        "group rounded-lg border bg-card p-4 transition-colors " +
        (selected ? "border-primary" : "border-border/60 hover:border-border")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <div className="font-medium text-foreground">{project.name}</div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {project.instructions_md || t("projects.noInstructions", {
              defaultValue: "No instructions yet.",
            })}
          </p>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>
              {t("projects.fileCount", { defaultValue: "{{count}} file", count: project.file_count })}
            </span>
            <span>
              {t("projects.byteCount", {
                defaultValue: "{{bytes}} bytes",
                bytes: project.byte_count,
              })}
            </span>
            <span>
              {t("projects.updated", {
                defaultValue: "Updated {{date}}",
                date: updated.toLocaleString(),
              })}
            </span>
          </div>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive"
        >
          {t("projects.delete", { defaultValue: "Delete" })}
        </Button>
      </div>
    </div>
  );
}
