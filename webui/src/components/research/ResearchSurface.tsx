import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronLeft,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Telescope,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/MarkdownText";
import { useClient } from "@/providers/ClientProvider";
import { useResearch } from "@/hooks/useResearch";
import {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  fetchWorkspaceList,
  fetchWorkspaceRead,
} from "@/lib/api";
import { fetchSharemdInfo, shareResearchArticle } from "@/lib/research-api";

const RESEARCH_DIR = "research";

type View = "list" | "detail";

interface Props {
  onBackToChat: () => void;
}

interface ResearchProject {
  name: string;
  path: string;
  modified_at: number;
  reporte: string | null;
  articulo: string | null;
}

export function ResearchSurface({ onBackToChat }: Props) {
  const { t } = useTranslation();
  const { token } = useClient();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<ResearchProject | null>(null);
  const [detailContent, setDetailContent] = useState<{ title: string; content: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchWorkspaceList(token, RESEARCH_DIR);
      if (payload.error === "Path does not exist") {
        await createWorkspaceDirectory(token, RESEARCH_DIR);
        setProjects([]);
        return;
      }
      if (payload.error) {
        setError(payload.error);
        setProjects([]);
        return;
      }
      const dirs = (payload.files ?? []).filter((e) => e.is_directory);
      setProjects(
        dirs.map((d) => ({
          name: d.name,
          path: d.path,
          modified_at: d.modified_at,
          reporte: null,
          articulo: null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onTurnEnd = useCallback(() => {
    void load();
  }, [load]);

  const research = useResearch(onTurnEnd);

  const loadArticle = useCallback(
    async (project: ResearchProject, kind: "articulo" | "reporte" = "articulo") => {
      setDetailLoading(true);
      setDetailContent(null);
      setShareUrl(null);
      setShareError(null);
      setError(null);
      try {
        const target = kind === "articulo" ? `${project.path}/articulo.md` : `${project.path}/reporte.md`;
        const res = await fetchWorkspaceRead(token, target);
        if (res.error) {
          setError(res.error);
          return;
        }
        const title = kind === "articulo" ? t("research.articulo", { defaultValue: "Artículo" }) : t("research.reporte", { defaultValue: "Reporte" });
        setDetailContent({ title, content: res.content ?? "" });
        const sharemd = await fetchSharemdInfo(token, `${project.path}/sharemd.json`, "");
        setShareUrl(sharemd?.url ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [token, t],
  );

  const openProject = useCallback(
    async (project: ResearchProject, kind: "articulo" | "reporte" = "articulo") => {
      setSelected(project);
      setView("detail");
      await loadArticle(project, kind);
    },
    [loadArticle],
  );

  const closeDetail = useCallback(() => {
    setView("list");
    setSelected(null);
    setDetailContent(null);
    setShareUrl(null);
    setShareError(null);
  }, []);

  const handleShare = useCallback(async () => {
    if (!selected || detailContent?.title === t("research.reporte", { defaultValue: "Reporte" })) {
      setShareError(t("research.shareSelectArticle", { defaultValue: "Selecciona el artículo para compartir" }));
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      const result = await shareResearchArticle(token, `${selected.path}/articulo.md`);
      if (result.ok && result.url) {
        setShareUrl(result.url);
      } else {
        setShareError(result.error ?? t("research.shareFailed", { defaultValue: "No se pudo compartir" }));
      }
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  }, [selected, detailContent?.title, token, t]);

  const sendComposer = useCallback(() => {
    const text = composerText.trim();
    if (!text || research.assistant.running) return;
    void research.sendMessage(text);
    setComposerText("");
    research.clearAssistant();
  }, [composerText, research]);

  const handleDelete = useCallback(
    async (project: ResearchProject) => {
      if (!window.confirm(t("research.deleteConfirm", { defaultValue: "¿Eliminar esta investigación?" }))) {
        return;
      }
      setDeleting(project.path);
      setError(null);
      try {
        const res = await deleteWorkspaceEntry(token, project.path);
        if (res.error) {
          setError(res.error);
        } else {
          await load();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeleting(null);
      }
    },
    [token, load, t],
  );

  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.modified_at - a.modified_at),
    [projects],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-settings-canvas">
      {view === "detail" ? (
        <DetailView
          project={selected}
          content={detailContent}
          loading={detailLoading}
          shareUrl={shareUrl}
          sharing={sharing}
          shareError={shareError}
          onBack={closeDetail}
          onShare={handleShare}
          t={t}
        />
      ) : (
        <ListView
          projects={sorted}
          loading={loading}
          error={error}
          onBackToChat={onBackToChat}
          onRefresh={() => void load()}
          onFocusComposer={focusComposer}
          onOpenProject={openProject}
          onDelete={handleDelete}
          deleting={deleting}
          composerRef={composerRef}
          composerText={composerText}
          setComposerText={setComposerText}
          assistant={research.assistant}
          onSend={sendComposer}
          t={t}
        />
      )}
    </div>
  );
}

function ListView({
  projects,
  loading,
  error,
  onBackToChat,
  onRefresh,
  onFocusComposer,
  onOpenProject,
  onDelete,
  deleting,
  composerRef,
  composerText,
  setComposerText,
  assistant,
  onSend,
  t,
}: {
  projects: ResearchProject[];
  loading: boolean;
  error: string | null;
  onBackToChat: () => void;
  onRefresh: () => void;
  onFocusComposer: () => void;
  onOpenProject: (p: ResearchProject, kind: "articulo" | "reporte") => Promise<void>;
  onDelete: (p: ResearchProject) => Promise<void>;
  deleting: string | null;
  composerRef: React.Ref<HTMLTextAreaElement>;
  composerText: string;
  setComposerText: (s: string) => void;
  assistant: { lastText: string; running: boolean };
  onSend: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("research.backToChats", { defaultValue: "Back to chats" })}
          </button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Telescope className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">
            {t("research.title", { defaultValue: "Research" })}
          </h1>
        </div>

        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t("research.subtitle", {
              defaultValue: "Investigaciones guardadas en la carpeta research/.",
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              aria-label={t("research.refresh", { defaultValue: "Refresh" })}
              disabled={loading}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button onClick={onFocusComposer}>
              <Plus className="h-4 w-4" />
              {t("research.new", { defaultValue: "Nueva investigación" })}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("research.loading", { defaultValue: "Cargando…" })}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Telescope className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("research.empty", {
                defaultValue: "Aún no hay investigaciones. Escribe un tema abajo para empezar.",
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li
                key={project.path}
                className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <button
                  type="button"
                  onClick={() => void onOpenProject(project, "articulo")}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <Telescope className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(project.modified_at * 1000).toLocaleDateString()}
                  </span>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onOpenProject(project, "articulo")}
                  >
                    <FileText className="h-4 w-4" />
                    {t("research.readArticle", { defaultValue: "Leer artículo" })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onOpenProject(project, "reporte")}
                  >
                    <FileText className="h-4 w-4" />
                    {t("research.readReport", { defaultValue: "Leer reporte" })}
                  </Button>
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onDelete(project)}
                      disabled={deleting === project.path}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("research.delete", { defaultValue: "Eliminar" })}
                    >
                      {deleting === project.path ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {assistant.lastText && (
        <div className="border-t border-border/40 bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
            <Sparkles className="h-3 w-3" />
            {t("research.assistant", { defaultValue: "Assistant" })}
          </div>
          <div className="line-clamp-3 whitespace-pre-wrap break-words leading-4">{assistant.lastText}</div>
        </div>
      )}

      <div className="border-t border-border/60 bg-background p-3">
        <div className="mx-auto flex max-w-[58rem] flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              <Sparkles className="h-3 w-3" />
              {t("research.askAi", { defaultValue: "Ask AI" })}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder={t("research.composer.placeholder", {
                defaultValue: "¿Qué tema quieres investigar?",
              })}
              disabled={assistant.running}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              className="min-h-[2.25rem] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={onSend}
              disabled={!composerText.trim() || assistant.running}
              aria-label={t("research.composer.send", { defaultValue: "Send" })}
            >
              {assistant.running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailView({
  project,
  content,
  loading,
  shareUrl,
  sharing,
  shareError,
  onBack,
  onShare,
  t,
}: {
  project: ResearchProject | null;
  content: { title: string; content: string } | null;
  loading: boolean;
  shareUrl: string | null;
  sharing: boolean;
  shareError: string | null;
  onBack: () => void;
  onShare: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("research.back", { defaultValue: "Volver" })}
          </button>
          <div className="mx-2 h-5 w-px bg-border" />
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {project?.name ?? ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {shareUrl ? (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" />
              {t("research.shared", { defaultValue: "Compartido" })}
            </a>
          ) : (
            <Button onClick={onShare} disabled={sharing} size="sm">
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {t("research.share", { defaultValue: "Compartir" })}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {shareError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {shareError}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("research.loadingDocument", { defaultValue: "Cargando documento…" })}
            </div>
          ) : content ? (
            <article className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/[0.06] to-transparent"
              />
              <div
                aria-hidden
                className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-transparent"
              />
              <div className="relative px-6 py-8 sm:px-10 sm:py-10">
                <header className="mb-8 border-b border-border/60 pb-7">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
                    <FileText className="h-3.5 w-3.5" />
                    {project?.name ?? t("research.document", { defaultValue: "Documento" })}
                  </div>
                  <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
                    {content.title}
                  </h1>
                </header>
                <div className="document-reader">
                  <MarkdownText>{content.content}</MarkdownText>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
