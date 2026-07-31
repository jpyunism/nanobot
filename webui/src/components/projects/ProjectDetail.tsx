import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { File as FileIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectsState } from "@/hooks/useProjects";
import type { ProjectDetail as ProjectDetailPayload, ProjectFile } from "@/lib/types";

type Args = {
  projectId: string;
  state: ProjectsState;
  onClose: () => void;
};

export function ProjectDetail({ projectId, state, onClose }: Args) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ProjectDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    state
      .load(projectId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setName(d.name);
        setInstructions(d.instructions_md);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, state]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await state.save(projectId, name.trim(), instructions);
      setDetail(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await state.uploadFile(projectId, file.name, file);
      const refreshed = await state.load(projectId);
      setDetail(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const onRemoveFile = async (fileId: string) => {
    setError(null);
    try {
      await state.removeFile(projectId, fileId);
      const refreshed = await state.load(projectId);
      setDetail(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!detail) {
    return (
      <section
        aria-label={t("projects.detail.ariaLabel", { defaultValue: "Project detail" })}
        className="rounded-lg border border-border/60 bg-muted/10 p-6 text-sm text-muted-foreground"
      >
        {error ?? t("projects.detail.loading", { defaultValue: "Loading project…" })}
      </section>
    );
  }

  return (
    <section
      aria-label={t("projects.detail.ariaLabel", { defaultValue: "Project detail" })}
      className="rounded-lg border border-border/60 bg-card p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {t("projects.detail.title", { defaultValue: "Project detail" })}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("projects.detail.close", { defaultValue: "Close" })}
        </Button>
      </header>
      <div className="mt-4 grid gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("projects.nameLabel", { defaultValue: "Name" })}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projects.namePlaceholder", { defaultValue: "e.g. refactor-research" })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("projects.instructionsLabel", { defaultValue: "Instructions" })}
          </label>
          <Textarea
            rows={6}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t("projects.instructionsPlaceholder", {
              defaultValue: "Optional instructions prepended to the agent's context when this project is attached.",
            })}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {saving
              ? t("projects.detail.saving", { defaultValue: "Saving…" })
              : t("projects.detail.save", { defaultValue: "Save" })}
          </Button>
        </div>

        <FileList
          files={detail.files}
          uploading={uploading}
          onUpload={onUpload}
          onRemove={onRemoveFile}
        />
      </div>
    </section>
  );
}

type FileListProps = {
  files: ProjectFile[];
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: (fileId: string) => Promise<void>;
};

function FileList({ files, uploading, onUpload, onRemove }: FileListProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {t("projects.files.title", { defaultValue: "Files" })}
        </h3>
        <label className="inline-flex items-center gap-2">
          <input
            type="file"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = "";
            }}
            className="sr-only"
            aria-label={t("projects.files.upload", { defaultValue: "Upload file" })}
          />
          <span
            className={
              "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-3 text-xs font-medium " +
              (uploading
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-muted/30")
            }
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploading
              ? t("projects.files.uploading", { defaultValue: "Uploading…" })
              : t("projects.files.upload", { defaultValue: "Upload" })}
          </span>
        </label>
      </div>
      {files.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("projects.files.empty", { defaultValue: "No files yet." })}
        </p>
      ) : (
        <ul className="grid gap-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs"
            >
              <FileIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 truncate font-medium text-foreground">
                {f.name}
              </span>
              <span className="text-muted-foreground">{f.mime_type}</span>
              <span className="text-muted-foreground">{f.size} B</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onRemove(f.id)}
                aria-label={t("projects.files.remove", { defaultValue: "Remove file" })}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
