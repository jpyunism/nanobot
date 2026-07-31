import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, Bot, CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CodeBlock } from "@/components/CodeBlock";
import { ApiError, fetchSubagentStatus } from "@/lib/api";
import type {
  SubagentPhase,
  SubagentStatusPayload,
  SubagentToolEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const PANEL_DEFAULT_WIDTH = 544;
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 860;
const PANEL_MIN_MAIN_WIDTH = 420;

function clampPanelWidth(width: number, maxWidth: number): number {
  return Math.min(Math.max(width, PANEL_MIN_WIDTH), maxWidth);
}

function maxPanelWidth(containerWidth: number): number {
  return Math.max(
    PANEL_MIN_WIDTH,
    Math.min(PANEL_MAX_WIDTH, containerWidth - PANEL_MIN_MAIN_WIDTH),
  );
}

function statusLabel(phase: SubagentPhase, label: string): string {
  switch (phase) {
    case "done":
      return `${label} completó`;
    case "error":
      return `${label} falló`;
    case "initializing":
      return `Iniciando ${label}`;
    case "awaiting_tools":
      return `${label} está trabajando`;
    case "tools_completed":
      return `${label} procesando resultado`;
    case "final_response":
      return `${label} finalizando`;
    default:
      return label;
  }
}

function ToolEventRow({ event }: { event: SubagentToolEvent }) {
  const Icon =
    event.status === "done"
      ? CheckCircle2
      : event.status === "error"
        ? AlertCircle
        : event.status === "running"
          ? Loader2
          : Circle;
  const color =
    event.status === "done"
      ? "text-emerald-500/80"
      : event.status === "error"
        ? "text-destructive/80"
        : event.status === "running"
          ? "text-muted-foreground/80"
          : "text-muted-foreground/55";
  return (
    <div
      className="flex items-start gap-2 py-1"
      data-testid="subagent-panel-tool-event"
      data-tool-status={event.status}
    >
      <Icon
        className={cn(
          "mt-[2px] h-3.5 w-3.5 shrink-0",
          color,
          event.status === "running" && "animate-spin",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] leading-5">
          <span className="font-medium text-foreground/85">{event.name}</span>
          {event.call_id ? (
            <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
              {event.status}
            </span>
          ) : null}
        </div>
        {event.detail ? (
          <div className="truncate text-[11.5px] text-muted-foreground/65" title={event.detail}>
            {event.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface SubagentPanelProps {
  sessionKey: string;
  taskId: string;
  token: string;
  /** Live status streamed via WebSocket; null until the first frame arrives. */
  liveStatus: SubagentStatusPayload | null;
  desktopWidth?: number;
  isClosing?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}

export function SubagentPanel({
  sessionKey,
  taskId,
  token,
  liveStatus,
  desktopWidth = PANEL_DEFAULT_WIDTH,
  isClosing = false,
  onResizeStart,
  onClose,
}: SubagentPanelProps) {
  const { t } = useTranslation();
  const [fetched, setFetched] = useState<SubagentStatusPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Prefer live status; fall back to HTTP fetch when the live stream hasn't
  // populated yet (e.g. panel opened after subagent already finished).
  const status = liveStatus ?? fetched;

  useEffect(() => {
    if (liveStatus) return;
    let cancelled = false;
    fetchSubagentStatus(token, sessionKey, taskId)
      .then((payload) => {
        if (cancelled) return;
        if (payload) setFetched(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : t("subagentPanel.fetchFailed", {
                defaultValue: "Could not load subagent status.",
              });
        setFetchError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [liveStatus, sessionKey, taskId, token, t]);

  const phase = status?.phase ?? "initializing";
  const label = status?.label ?? t("subagentPanel.placeholder", {
    defaultValue: "Subagent",
  });
  const phaseLabel = statusLabel(phase, label);
  const isLive = phase !== "done" && phase !== "error";

  const toolEvents = useMemo<SubagentToolEvent[]>(
    () => status?.tool_events ?? [],
    [status?.tool_events],
  );

  return (
    <aside
      aria-label={t("subagentPanel.aria", { defaultValue: "Subagent activity" })}
      style={{
        "--subagent-panel-width": `${desktopWidth}px`,
        "--subagent-panel-slot-width": !entered || isClosing ? "0px" : `${desktopWidth}px`,
      } as CSSProperties}
      className={cn(
        "absolute inset-y-0 right-0 z-30 w-[min(100vw,var(--subagent-panel-slot-width))] overflow-hidden",
        "transition-[width] duration-300 ease-out will-change-[width]",
        "md:relative md:z-auto md:w-[var(--subagent-panel-slot-width)] md:min-w-0 md:shrink-0",
        isClosing && "pointer-events-none",
      )}
      data-testid="subagent-panel"
      data-subagent-task-id={taskId}
      data-subagent-phase={phase}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(100vw,var(--subagent-panel-width))] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] md:w-[var(--subagent-panel-width)] md:pb-0",
          "border-l border-border/70 bg-background shadow-2xl md:shadow-none",
          "transition-[opacity,transform] duration-300 ease-out will-change-transform",
          !entered || isClosing ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
          "motion-reduce:translate-x-0",
        )}
      >
        {onResizeStart ? (
          <button
            type="button"
            aria-label={t("subagentPanel.resize", { defaultValue: "Resize subagent panel" })}
            className={cn(
              "group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none md:flex",
              "items-stretch justify-center focus-visible:outline-none",
            )}
            onPointerDown={onResizeStart}
          >
            <span
              aria-hidden
              className={cn(
                "h-full w-px bg-foreground/25 opacity-0 transition-opacity",
                "group-hover:opacity-100 group-focus-visible:bg-ring group-focus-visible:opacity-100",
              )}
            />
          </button>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3"
            data-testid="subagent-panel-header"
          >
            <Bot
              className={cn(
                "h-4 w-4 shrink-0",
                isLive ? "text-muted-foreground/80 animate-pulse" : "text-muted-foreground/60",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground" title={status?.label}>
                {status?.label ?? label}
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground/65" title={phaseLabel}>
                {phaseLabel}
              </div>
            </div>
            <span
              className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55"
              data-testid="subagent-panel-iteration"
            >
              {status?.iteration != null ? `iter ${status.iteration}` : ""}
            </span>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              title={t("subagentPanel.close", { defaultValue: "Close subagent panel" })}
              aria-label={t("subagentPanel.close", { defaultValue: "Close subagent panel" })}
              data-testid="subagent-panel-close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {fetchError && !status ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
                <div className="max-w-sm">
                  <AlertCircle
                    className="mx-auto mb-3 h-5 w-5 text-muted-foreground/70"
                    aria-hidden
                  />
                  <p>{fetchError}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <section
                  className="border-b border-border/60 px-4 py-3"
                  data-testid="subagent-panel-task"
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                    {t("subagentPanel.task", { defaultValue: "Task" })}
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-foreground/85">
                    {status?.task_description ?? t("subagentPanel.loading", {
                      defaultValue: "Loading…",
                    })}
                  </div>
                </section>

                <section
                  className="border-b border-border/60 px-4 py-3"
                  data-testid="subagent-panel-tools"
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                    {t("subagentPanel.toolCalls", { defaultValue: "Tool calls" })}
                    {toolEvents.length ? (
                      <span className="ml-1.5 text-muted-foreground/45">
                        {toolEvents.length}
                      </span>
                    ) : null}
                  </div>
                  {toolEvents.length === 0 ? (
                    <div className="mt-2 text-[12.5px] text-muted-foreground/65">
                      {t("subagentPanel.noTools", { defaultValue: "Esperando herramientas…" })}
                    </div>
                  ) : (
                    <div className="mt-1">
                      {toolEvents.map((event, index) => (
                        <ToolEventRow
                          key={
                            event.call_id
                              ? `${event.call_id}-${index}`
                              : `${event.name}-${index}`
                          }
                          event={event}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section
                  className="min-h-0 flex-1 px-4 py-3"
                  data-testid="subagent-panel-result"
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                    {t("subagentPanel.result", { defaultValue: "Result" })}
                  </div>
                  {status?.error ? (
                    <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive/85">
                      {status.error}
                    </div>
                  ) : status?.result ? (
                    <div className="mt-2 rounded-md border border-border/60 bg-muted/30">
                      <CodeBlock
                        language="markdown"
                        code={status.result}
                        chrome="none"
                        wrapLongLines
                        className="max-h-[60vh]"
                      />
                    </div>
                  ) : (
                    <div className="mt-2 text-[12.5px] text-muted-foreground/65">
                      {isLive
                        ? t("subagentPanel.running", {
                            defaultValue: "El subagente sigue trabajando…",
                          })
                        : t("subagentPanel.noResult", {
                            defaultValue: "Sin respuesta final.",
                          })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export { clampPanelWidth, maxPanelWidth, PANEL_DEFAULT_WIDTH };
