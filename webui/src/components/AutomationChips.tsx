import { useEffect, useState } from "react";

import { AutomationChip } from "@/components/AutomationChip";
import { useAutomationPanel } from "@/components/AutomationPanelContext";
import { useClient } from "@/providers/ClientProvider";

interface AutomationStatus {
  kind: string;
  label: string | null;
  turnId: string | null;
  status: string;
  error?: string;
}

export interface AutomationChipsProps {
  chatId: string | null;
  isTurnActive: boolean;
}

export function AutomationChips({ chatId, isTurnActive }: AutomationChipsProps) {
  const { client } = useClient();
  const panel = useAutomationPanel();
  const [statuses, setStatuses] = useState<Map<string, AutomationStatus>>(new Map());

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
    });
    return off;
  }, [chatId, client]);

  const entries = Array.from(statuses.entries()).filter(
    ([, s]) => s.status === "running" || s.status === "done" || s.status === "error",
  );
  if (!entries.length) return null;

  return (
    <div className="flex flex-col gap-1">
      {entries.map(([key, s]) => (
        <AutomationChip
          key={key}
          turnId={key}
          kind={s.kind}
          label={s.label}
          status={s.status}
          isTurnActive={isTurnActive}
          onOpen={panel?.open}
        />
      ))}
    </div>
  );
}
