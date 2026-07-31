/** Helpers to extract subagent spawn calls from tool traces and progress events. */

import type { ToolProgressEvent, UIMessage } from "@/lib/types";

export interface SubagentSpawn {
  /** Stable identifier for the spawn (the tool call id). */
  callId: string;
  /** Server-side subagent task id parsed from the tool result. */
  taskId: string | null;
  /** Optional label the agent passed to ``spawn``. */
  label: string | null;
  /** Whether the underlying tool call completed successfully. */
  done: boolean;
}

const TASK_ID_RE = /id:\s*([A-Za-z0-9]{1,64})/;

function parseSpawnArgLabel(args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const record = args as Record<string, unknown>;
  const label = record.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function parseSpawnResultTaskId(result: unknown): string | null {
  if (typeof result !== "string") return null;
  const match = TASK_ID_RE.exec(result);
  return match ? match[1] : null;
}

export function extractSubagentSpawns(messages: UIMessage[]): SubagentSpawn[] {
  const seen = new Map<string, SubagentSpawn>();
  for (const message of messages) {
    if (message.kind !== "trace") continue;
    for (const event of message.toolEvents ?? []) {
      if (event.name !== "spawn") continue;
      const callId = event.call_id;
      if (!callId) continue;
      const existing = seen.get(callId) ?? {
        callId,
        taskId: null,
        label: null,
        done: false,
      };
      const args = (event as { function?: { arguments?: unknown } }).function?.arguments
        ?? event.arguments;
      const labelFromArgs = parseSpawnArgLabel(args);
      const taskIdFromResult = parseSpawnResultTaskId(event.result);
      const label = labelFromArgs ?? existing.label;
      const taskId = taskIdFromResult ?? existing.taskId;
      const done = event.phase === "end" || event.phase === "error" ? true : existing.done;
      seen.set(callId, { callId, taskId, label, done });
    }
  }
  return [...seen.values()].filter((spawn) => spawn.taskId);
}

export function subagentTraceLineKey(line: string): string | null {
  const match = /^spawn\(/.test(line.trim());
  return match ? line : null;
}

/** Return the subset of ``events`` whose call_id matches a spawn line. */
export function spawnEventsByCallId(events: ToolProgressEvent[] | undefined): Map<string, ToolProgressEvent> {
  const out = new Map<string, ToolProgressEvent>();
  if (!events) return out;
  for (const event of events) {
    if (event.name !== "spawn") continue;
    if (!event.call_id) continue;
    out.set(event.call_id, event);
  }
  return out;
}
