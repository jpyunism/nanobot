import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";

import { ActivityStep } from "@/components/thread/activity/ActivityStep";
import type { SubagentPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SubagentChipProps {
  /** Stable id of the running subagent (8-char UUID prefix). */
  taskId: string;
  /** Short label set by the agent when spawning (e.g. "Refactor utils"). */
  label: string;
  /** Current lifecycle phase. */
  phase: SubagentPhase;
  /** Whether the agent turn that spun this subagent is still streaming. */
  isTurnActive: boolean;
  /** Optional click handler — opens the side panel. */
  onOpen?: (taskId: string) => void;
}

function chipLabel(phase: SubagentPhase, label: string): string {
  switch (phase) {
    case "initializing":
      return `Iniciando subagente ${label}`;
    case "awaiting_tools":
      return `Resolviendo con subagente ${label}`;
    case "tools_completed":
    case "final_response":
      return `Resumiendo con subagente ${label}`;
    case "done":
      return `Subagente ${label} terminó`;
    case "error":
      return `Subagente ${label} falló`;
    default:
      return `Subagente ${label}`;
  }
}

function chipTone(phase: SubagentPhase, isTurnActive: boolean): "active" | "success" | "error" | "neutral" {
  if (phase === "error") return "error";
  if (phase === "done") return isTurnActive ? "active" : "success";
  if (phase === "initializing" || phase === "awaiting_tools") return "active";
  return "active";
}

export function SubagentChip({
  taskId,
  label,
  phase,
  isTurnActive,
  onOpen,
}: SubagentChipProps) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (phase !== "awaiting_tools") return;
    const id = window.setInterval(() => setPulse((value) => !value), 1_200);
    return () => window.clearInterval(id);
  }, [phase]);

  const Icon =
    phase === "done"
      ? CheckCircle2
      : phase === "error"
        ? X
        : isTurnActive
          ? Loader2
          : Sparkles;

  const tone = chipTone(phase, isTurnActive);
  const status = chipLabel(phase, label);

  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(taskId) : undefined}
      className={cn(
        "block w-full text-left",
        onOpen && "cursor-pointer hover:bg-accent/30 rounded-md transition-colors",
      )}
      data-testid={`subagent-chip-${taskId}`}
      data-subagent-task-id={taskId}
      data-subagent-phase={phase}
      aria-label={status}
    >
      <ActivityStep
        active={tone === "active"}
        tone={tone}
        marker={(
          <span
            data-testid="subagent-chip-marker"
            className={cn(
              "grid h-4 w-4 place-items-center rounded-[5px] border bg-background",
              tone === "active" && "border-muted-foreground/30 text-muted-foreground/80",
              tone === "success" && "border-emerald-500/30 text-emerald-500/80",
              tone === "error" && "border-destructive/40 text-destructive/80",
              tone === "neutral" && "border-muted-foreground/18 text-muted-foreground/60",
              pulse && "animate-pulse",
            )}
            aria-hidden
          >
            <Icon
              className={cn(
                "h-3 w-3",
                isTurnActive && (phase === "awaiting_tools" || phase === "initializing") && "animate-spin",
              )}
            />
          </span>
        )}
        label={(
          <span className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-muted-foreground/65" aria-hidden />
            <span className="truncate">{status}</span>
          </span>
        )}
      />
    </button>
  );
}
