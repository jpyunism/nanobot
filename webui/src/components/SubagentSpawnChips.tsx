import { useEffect, useState } from "react";

import { SubagentChip } from "@/components/thread/activity/SubagentChip";
import { useSubagentPanel } from "@/components/SubagentPanelContext";
import { useClient } from "@/providers/ClientProvider";
import type { SubagentPhase, SubagentStatusPayload } from "@/lib/types";

/** Lightweight per-task state shown on the chip before live WS status arrives. */
interface ChipSeed {
  taskId: string;
  label: string | null;
}

export interface SubagentSpawnChipsProps {
  chatId: string | null;
  /** Spawns extracted from the message trace (stable across re-renders). */
  seeds: ChipSeed[];
  /** Whether the current agent turn is still streaming. */
  isTurnActive: boolean;
}

/**
 * Renders one clickable chip per known subagent spawn, pulling live phase
 * from the WebSocket stream when available. Clicking opens the side panel.
 */
export function SubagentSpawnChips({ chatId, seeds, isTurnActive }: SubagentSpawnChipsProps) {
  const { client } = useClient();
  const panel = useSubagentPanel();
  const [liveStatuses, setLiveStatuses] = useState<Map<string, SubagentStatusPayload>>(new Map());

  useEffect(() => {
    if (!chatId || !client) return;
    const off = client.onChat(chatId, (ev) => {
      if (ev.event !== "subagent_update") return;
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
      setLiveStatuses((prev) => {
        const next = new Map(prev);
        next.set(ev.task_id, payload);
        return next;
      });
    });
    return off;
  }, [chatId, client]);

  if (!seeds.length) return null;

  return (
    <div className="flex flex-col gap-1">
      {seeds.map((seed) => {
        const live = liveStatuses.get(seed.taskId);
        const phase: SubagentPhase = live?.phase ?? (seed.taskId ? "initializing" : "initializing");
        const label = live?.label ?? seed.label ?? "subagent";
        return (
          <SubagentChip
            key={seed.taskId}
            taskId={seed.taskId}
            label={label}
            phase={phase}
            isTurnActive={isTurnActive}
            onOpen={panel?.open}
          />
        );
      })}
    </div>
  );
}
