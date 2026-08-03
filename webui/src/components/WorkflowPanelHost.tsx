import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { WorkflowPanel } from "@/components/WorkflowPanel";
import {
  WorkflowPanelContext,
  type WorkflowPanelController,
} from "@/components/WorkflowPanelContext";
import { useClient } from "@/providers/ClientProvider";
import type { WorkflowStatusPayload } from "@/lib/types";

const PANEL_DEFAULT_WIDTH = 544;

function clampPanelWidth(width: number, maxWidth: number): number {
  return Math.min(Math.max(width, 360), maxWidth);
}

function maxPanelWidth(containerWidth: number): number {
  return Math.max(360, Math.min(860, containerWidth - 420));
}

export interface WorkflowPanelHostProps {
  chatId: string | null;
  onOpenFilePreview?: (path: string) => void;
  children?: ReactNode;
}

export function WorkflowPanelHost({ chatId, onOpenFilePreview, children }: WorkflowPanelHostProps) {
  const { client } = useClient();
  const [statuses, setStatuses] = useState<Map<string, WorkflowStatusPayload>>(new Map());
  const [runId, setRunId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(() => clampPanelWidth(PANEL_DEFAULT_WIDTH, maxPanelWidth(window.innerWidth)));
  const widthRef = useRef(width);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const onResize = () => {
      const maxWidth = maxPanelWidth(window.innerWidth);
      setWidth((current) => clampPanelWidth(current, maxWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!chatId || !client) return;
    const off = client.onChat(chatId, (ev) => {
      if (ev.event === "workflow_update") {
        const payload: WorkflowStatusPayload = {
          run_id: ev.run_id,
          workflow: ev.workflow,
          phase: ev.phase ?? null,
          status: ev.status as WorkflowStatusPayload["status"],
          error: ev.error ?? null,
          result_preview: ev.result_preview ?? null,
        };
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(ev.run_id, payload);
          return next;
        });
        if (runId === ev.run_id || runId === null) {
          setClosing(false);
          setRunId(ev.run_id);
        }
      }
    });
    return off;
  }, [chatId, client, runId]);

  const open = useCallback(
    (id: string) => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setClosing(false);
      setRunId(id);
    },
    [],
  );

  const close = useCallback(() => {
    if (!runId || closing) return;
    setClosing(true);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setRunId(null);
      setStatuses((prev) => {
        if (!prev.has(runId ?? "")) return prev;
        const next = new Map(prev);
        next.delete(runId ?? "");
        return next;
      });
      setClosing(false);
      closeTimerRef.current = null;
    }, 320);
  }, [runId, closing]);

  const liveStatus = useMemo(() => {
    if (!runId) return null;
    return statuses.get(runId) ?? null;
  }, [runId, statuses]);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const onMove = (e: PointerEvent) => {
      const delta = startX - e.clientX;
      const containerWidth = window.innerWidth;
      const maxWidth = maxPanelWidth(containerWidth);
      setWidth(clampPanelWidth(startWidth + delta, maxWidth));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const controller = useMemo<WorkflowPanelController>(() => ({ open }), [open]);

  return (
    <WorkflowPanelContext.Provider value={controller}>
      {children}
      {runId ? (
        <WorkflowPanel
          runId={runId}
          liveStatus={liveStatus}
          desktopWidth={width}
          isClosing={closing}
          onResizeStart={handleResizeStart}
          onOpenFilePreview={onOpenFilePreview}
          onClose={close}
        />
      ) : null}
    </WorkflowPanelContext.Provider>
  );
}
