import { useEffect, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MarkdownText } from "@/components/MarkdownText";
import type { WorkflowStatusPayload } from "@/lib/types";
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

function statusLabel(status: string, workflow: string): string {
  switch (status) {
    case "running":
      return `${workflow} running…`;
    case "completed":
      return `${workflow} completed`;
    case "cancelled":
      return `${workflow} cancelled`;
    case "failed":
      return `${workflow} failed`;
    default:
      return workflow;
  }
}

export interface WorkflowPanelProps {
  runId: string;
  liveStatus: WorkflowStatusPayload | null;
  desktopWidth?: number;
  isClosing?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onOpenFilePreview?: (path: string) => void;
  onClose: () => void;
}

export function WorkflowPanel({
  runId,
  liveStatus,
  desktopWidth = PANEL_DEFAULT_WIDTH,
  isClosing = false,
  onResizeStart,
  onOpenFilePreview,
  onClose,
}: WorkflowPanelProps) {
  const { t } = useTranslation();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const status = liveStatus?.status ?? "running";
  const workflow = liveStatus?.workflow ?? "Workflow";
  const phase = liveStatus?.phase ?? null;
  const error = liveStatus?.error ?? null;
  const resultPreview = liveStatus?.result_preview ?? null;
  const isLive = status === "running";

  return (
    <aside
      aria-label={t("workflowPanel.aria", { defaultValue: "Workflow activity" })}
      style={{
        "--workflow-panel-width": `${desktopWidth}px`,
        "--workflow-panel-slot-width": !entered || isClosing ? "0px" : `${desktopWidth}px`,
      } as CSSProperties}
      className={cn(
        "absolute inset-y-0 right-0 z-30 w-[min(100vw,var(--workflow-panel-slot-width))] overflow-hidden",
        "transition-[width] duration-300 ease-out will-change-[width]",
        "md:relative md:z-auto md:w-[var(--workflow-panel-slot-width)] md:min-w-0 md:shrink-0",
        isClosing && "pointer-events-none",
      )}
      data-testid="workflow-panel"
      data-workflow-run-id={runId}
      data-workflow-status={status}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(100vw,var(--workflow-panel-width))] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] md:w-[var(--workflow-panel-width)] md:pb-0",
          "border-l border-border/70 bg-background shadow-2xl md:shadow-none",
          "transition-[opacity,transform] duration-300 ease-out will-change-transform",
          !entered || isClosing ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
          "motion-reduce:translate-x-0",
        )}
      >
        {onResizeStart ? (
          <button
            type="button"
            aria-label={t("workflowPanel.resize", { defaultValue: "Resize workflow panel" })}
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
            data-testid="workflow-panel-header"
          >
            {status === "running" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground/80" aria-hidden />
            ) : status === "completed" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/80" aria-hidden />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive/80" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground" title={workflow}>
                {workflow}
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground/65" title={statusLabel(status, workflow)}>
                {statusLabel(status, workflow)}
              </div>
            </div>
            <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
              {runId}
            </span>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              title={t("workflowPanel.close", { defaultValue: "Close workflow panel" })}
              aria-label={t("workflowPanel.close", { defaultValue: "Close workflow panel" })}
              data-testid="workflow-panel-close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="flex h-full flex-col">
              {phase ? (
                <section
                  className="border-b border-border/60 px-4 py-3"
                  data-testid="workflow-panel-phase"
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                    {t("workflowPanel.phase", { defaultValue: "Phase" })}
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-foreground/85">
                    {phase}
                  </div>
                </section>
              ) : null}

              {error ? (
                <section
                  className="border-b border-border/60 px-4 py-3"
                  data-testid="workflow-panel-error"
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                    {t("workflowPanel.error", { defaultValue: "Error" })}
                  </div>
                  <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive/85">
                    {error}
                  </div>
                </section>
              ) : null}

              <section
                className="min-h-0 flex-1 px-4 py-3 pb-6"
                data-testid="workflow-panel-result"
              >
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/55">
                  {t("workflowPanel.result", { defaultValue: "Result" })}
                </div>
                {resultPreview ? (
                  <div className="markdown-content mt-2">
                    <MarkdownText className="max-w-none" preserveStreamingLayout onOpenFilePreview={onOpenFilePreview}>
                      {resultPreview}
                    </MarkdownText>
                  </div>
                ) : (
                  <div className="mt-2 text-[12.5px] text-muted-foreground/65">
                    {isLive
                      ? t("workflowPanel.running", {
                          defaultValue: "Workflow is still running…",
                        })
                      : t("workflowPanel.noResult", {
                          defaultValue: "No result.",
                        })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export { clampPanelWidth, maxPanelWidth, PANEL_DEFAULT_WIDTH };
