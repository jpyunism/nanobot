import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AlertCircle, Bot, CheckCircle2, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AutomationPanelContext } from "@/components/AutomationPanelContext";
import { useClient } from "@/providers/ClientProvider";
import { cn } from "@/lib/utils";

const PANEL_DEFAULT_WIDTH = 544;
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 860;
const PANEL_MIN_MAIN_WIDTH = 420;

function clampPanelWidth(width: number, maxWidth: number): number {
  return Math.min(Math.max(width, PANEL_MIN_WIDTH), maxWidth);
}

function maxPanelWidth(containerWidth: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, containerWidth - PANEL_MIN_MAIN_WIDTH));
}

interface AutomationStatus {
  kind: string;
  label: string | null;
  turnId: string | null;
  status: string;
  error?: string;
}

export interface AutomationPanelHostProps {
  chatId: string | null;
  children?: ReactNode;
}

export function AutomationPanelHost({ chatId, children }: AutomationPanelHostProps) {
  const { client } = useClient();
  const [statuses, setStatuses] = useState<Map<string, AutomationStatus>>(new Map());
  const [turnId, setTurnId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(() => clampPanelWidth(PANEL_DEFAULT_WIDTH, maxPanelWidth(window.innerWidth)));
  const widthRef = useRef(width);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => { widthRef.current = width; }, [width]);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current, maxPanelWidth(window.innerWidth)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!chatId || !client) return;
    const off = client.onChat(chatId, (ev) => {
      if (ev.event !== "automation_update") return;
      const s: AutomationStatus = {
        kind: ev.kind,
        label: ev.label,
        turnId: ev.turn_id,
        status: ev.status,
        error: ev.error,
      };
      setStatuses((prev) => {
        const next = new Map(prev);
        const key = ev.turn_id || ev.kind;
        next.set(key, s);
        return next;
      });
      const key = ev.turn_id || ev.kind;
      if (turnId === key || turnId === null) {
        setClosing(false);
        setTurnId(key);
      }
    });
    return off;
  }, [chatId, client, turnId]);

  const open = useCallback((id: string) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setTurnId(id);
  }, []);

  const close = useCallback(() => {
    if (!turnId || closing) return;
    setClosing(true);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setTurnId(null);
      setStatuses((prev) => {
        if (!prev.has(turnId)) return prev;
        const next = new Map(prev);
        next.delete(turnId);
        return next;
      });
      setClosing(false);
      closeTimerRef.current = null;
    }, 320);
  }, [turnId, closing]);

  const liveStatus = useMemo(() => {
    if (!turnId) return null;
    return statuses.get(turnId) ?? null;
  }, [turnId, statuses]);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const onMove = (e: PointerEvent) => {
      const delta = startX - e.clientX;
      setWidth(clampPanelWidth(startWidth + delta, maxPanelWidth(window.innerWidth)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const controller = useMemo(() => ({ open }), [open]);

  return (
    <AutomationPanelContext.Provider value={controller}>
      {children}
      {turnId ? (
        <AutomationPanel
          status={liveStatus}
          desktopWidth={width}
          isClosing={closing}
          onResizeStart={handleResizeStart}
          onClose={close}
        />
      ) : null}
    </AutomationPanelContext.Provider>
  );
}

interface AutomationPanelProps {
  status: AutomationStatus | null;
  desktopWidth?: number;
  isClosing?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}

function AutomationPanel({
  status,
  desktopWidth = PANEL_DEFAULT_WIDTH,
  isClosing = false,
  onResizeStart,
  onClose,
}: AutomationPanelProps) {
  const { t } = useTranslation();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const phase = status?.status ?? "running";
  const label = status?.label ?? status?.kind ?? t("automationPanel.placeholder", { defaultValue: "Automation" });
  const isLive = phase === "running";

  const phaseLabel = isLive
    ? `${label} está ejecutando`
    : phase === "done"
      ? `${label} completó`
      : phase === "error"
        ? `${label} falló`
        : label;

  return (
    <aside
      aria-label={t("automationPanel.aria", { defaultValue: "Automation activity" })}
      style={{
        "--automation-panel-width": `${desktopWidth}px`,
        "--automation-panel-slot-width": !entered || isClosing ? "0px" : `${desktopWidth}px`,
      } as React.CSSProperties}
      className={cn(
        "absolute inset-y-0 right-0 z-30 w-[min(100vw,var(--automation-panel-slot-width))] overflow-hidden",
        "transition-[width] duration-300 ease-out will-change-[width]",
        "md:relative md:z-auto md:w-[var(--automation-panel-slot-width)] md:min-w-0 md:shrink-0",
        isClosing && "pointer-events-none",
      )}
      data-testid="automation-panel"
      data-automation-status={phase}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(100vw,var(--automation-panel-width))] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] md:w-[var(--automation-panel-width)] md:pb-0",
          "border-l border-border/70 bg-background shadow-2xl md:shadow-none",
          "transition-[opacity,transform] duration-300 ease-out will-change-transform",
          !entered || isClosing ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
          "motion-reduce:translate-x-0",
        )}
      >
        {onResizeStart ? (
          <button
            type="button"
            aria-label={t("automationPanel.resize", { defaultValue: "Resize automation panel" })}
            className={cn(
              "group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none md:flex",
              "items-stretch justify-center focus-visible:outline-none",
            )}
            onPointerDown={onResizeStart}
          >
            <span
              aria-hidden
              className="h-full w-px bg-foreground/25 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:bg-ring group-focus-visible:opacity-100"
            />
          </button>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3" data-testid="automation-panel-header">
            <Bot
              className={cn(
                "h-4 w-4 shrink-0",
                isLive ? "text-muted-foreground/80 animate-pulse" : "text-muted-foreground/60",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{label}</div>
              <div className="truncate text-[11.5px] text-muted-foreground/65">{phaseLabel}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              title={t("automationPanel.close", { defaultValue: "Close automation panel" })}
              aria-label={t("automationPanel.close", { defaultValue: "Close automation panel" })}
              data-testid="automation-panel-close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {status?.error ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
                <div className="max-w-sm">
                  <AlertCircle className="mx-auto mb-3 h-5 w-5 text-muted-foreground/70" aria-hidden />
                  <p>{status.error}</p>
                </div>
              </div>
            ) : isLive ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("automationPanel.running", { defaultValue: "La automatización está ejecutando…" })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500/80" aria-hidden />
                {t("automationPanel.done", { defaultValue: "Automatización completada." })}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
