import { Bot, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";

import { ActivityStep } from "@/components/thread/activity/ActivityStep";
import { cn } from "@/lib/utils";

export interface AutomationChipProps {
  turnId: string;
  kind: string;
  label: string | null;
  status: string;
  isTurnActive: boolean;
  onOpen?: (turnId: string) => void;
}

function chipLabel(kind: string, label: string | null, status: string): string {
  const name = label || kind;
  if (status === "running") return `Ejecutando automatización ${name}`;
  if (status === "done") return `Automatización ${name} terminó`;
  if (status === "error") return `Automatización ${name} falló`;
  return `Automatización ${name}`;
}

function chipTone(status: string, isTurnActive: boolean): "active" | "success" | "error" | "neutral" {
  if (status === "error") return "error";
  if (status === "done") return isTurnActive ? "active" : "success";
  return "active";
}

export function AutomationChip({ turnId, kind, label, status, isTurnActive, onOpen }: AutomationChipProps) {
  const Icon =
    status === "done"
      ? CheckCircle2
      : status === "error"
        ? X
        : isTurnActive
          ? Loader2
          : Sparkles;

  const tone = chipTone(status, isTurnActive);
  const text = chipLabel(kind, label, status);

  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(turnId) : undefined}
      className={cn(
        "block w-full text-left",
        onOpen && "cursor-pointer hover:bg-accent/30 rounded-md transition-colors",
      )}
      data-testid={`automation-chip-${turnId}`}
      data-automation-turn-id={turnId}
      data-automation-status={status}
      aria-label={text}
    >
      <ActivityStep
        active={tone === "active"}
        tone={tone}
        marker={(
          <span
            className={cn(
              "grid h-4 w-4 place-items-center rounded-[5px] border bg-background",
              tone === "active" && "border-muted-foreground/30 text-muted-foreground/80",
              tone === "success" && "border-emerald-500/30 text-emerald-500/80",
              tone === "error" && "border-destructive/40 text-destructive/80",
              tone === "neutral" && "border-muted-foreground/18 text-muted-foreground/60",
            )}
            aria-hidden
          >
            <Icon
              className={cn(
                "h-3 w-3",
                status === "running" && "animate-spin",
              )}
            />
          </span>
        )}
        label={(
          <span className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-muted-foreground/65" aria-hidden />
            <span className="truncate">{text}</span>
          </span>
        )}
      />
    </button>
  );
}
