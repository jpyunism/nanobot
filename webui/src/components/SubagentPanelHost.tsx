import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { SubagentPanel } from "@/components/SubagentPanel";
import {
  SubagentPanelContext,
  type SubagentPanelController,
} from "@/components/SubagentPanelContext";
import { useClient } from "@/providers/ClientProvider";
import type { SubagentStatusPayload } from "@/lib/types";

const PANEL_DEFAULT_WIDTH = 544;

function clampPanelWidth(width: number, maxWidth: number): number {
  return Math.min(Math.max(width, 360), maxWidth);
}

function maxPanelWidth(containerWidth: number): number {
  return Math.max(360, Math.min(860, containerWidth - 420));
}

export interface SubagentPanelHostProps {
  chatId: string | null;
  sessionKey: string | null;
}

/** Renders the side panel for the currently-open subagent, if any. */
export function SubagentPanelHost({ chatId, sessionKey }: SubagentPanelHostProps) {
  const { client, token } = useClient();
  const [statuses, setStatuses] = useState<Map<string, SubagentStatusPayload>>(new Map());
  const [taskId, setTaskId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [width, setWidth] = useState(() => clampPanelWidth(PANEL_DEFAULT_WIDTH, maxPanelWidth(window.innerWidth)));
  const widthRef = useRef(width);
  const closeTimerRef = useRef<number | null>(null);
  const subscribedRef = useRef<string | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // ponytail: re-clamp the panel width when the viewport shrinks (e.g. phone
  // orientation change, browser chrome show/hide). Without this, a panel
  // opened at 544px on desktop stays at 544px when the user switches to a
  // 380px phone layout, covering the whole thread.
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
      if (ev.event === "subagent_update") {
        const payload: SubagentStatusPayload = {
          task_id: ev.task_id,
          label: ev.label,
          task_description: ev.task_description,
          phase: ev.phase,
          iteration: ev.iteration,
          tool_events: ev.tool_events,
          usage: ev.usage,
          stop_reason: ev.stop_reason,
          error: ev.error,
          result: ev.result,
          chat_id: ev.chat_id,
        };
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(ev.task_id, payload);
          return next;
        });
        if (taskId === ev.task_id || taskId === null) {
          setClosing(false);
          setTaskId(ev.task_id);
        }
      } else if (ev.event === "subagent_subscribed") {
        subscribedRef.current = ev.task_id;
      }
    });
    return off;
  }, [chatId, client, taskId]);

  const open = useCallback(
    (id: string) => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setClosing(false);
      setTaskId(id);
      if (client && chatId) {
        client.sendEnvelope({ type: "subscribe_subagent", task_id: id });
      }
    },
    [client, chatId],
  );

  const close = useCallback(() => {
    if (!taskId || closing) return;
    setClosing(true);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setTaskId(null);
      setStatuses((prev) => {
        if (!prev.has(taskId ?? "")) return prev;
        const next = new Map(prev);
        next.delete(taskId ?? "");
        return next;
      });
      setClosing(false);
      closeTimerRef.current = null;
    }, 320);
  }, [taskId, closing]);

  const liveStatus = useMemo(() => {
    if (!taskId) return null;
    return statuses.get(taskId) ?? null;
  }, [taskId, statuses]);

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

  const controller = useMemo<SubagentPanelController>(() => ({ open }), [open]);

  return (
    <SubagentPanelContext.Provider value={controller}>
      {taskId && sessionKey ? (
        <SubagentPanel
          sessionKey={sessionKey}
          taskId={taskId}
          token={token}
          liveStatus={liveStatus}
          desktopWidth={width}
          isClosing={closing}
          onResizeStart={handleResizeStart}
          onClose={close}
        />
      ) : null}
    </SubagentPanelContext.Provider>
  );
}
