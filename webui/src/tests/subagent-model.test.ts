import { describe, expect, it } from "vitest";

import { extractSubagentSpawns } from "@/components/thread/activity/subagent-model";
import type { UIMessage } from "@/lib/types";

function traceMessage(callId: string, name: string, args: unknown, result: unknown): UIMessage {
  return {
    id: `trace-${callId}`,
    role: "assistant",
    content: `${name}(${JSON.stringify(args)})`,
    kind: "trace",
    createdAt: 0,
    toolEvents: [
      {
        phase: "end",
        call_id: callId,
        name,
        arguments: args,
        result,
      },
    ],
  };
}

describe("extractSubagentSpawns", () => {
  it("returns empty when no spawns", () => {
    const messages: UIMessage[] = [
      {
        id: "a",
        role: "assistant",
        content: "grep()",
        kind: "trace",
        createdAt: 0,
        toolEvents: [{ phase: "end", call_id: "1", name: "grep", result: "ok" }],
      },
    ];
    expect(extractSubagentSpawns(messages)).toEqual([]);
  });

  it("extracts task id and label from spawn result + args", () => {
    const messages: UIMessage[] = [
      traceMessage(
        "call-1",
        "spawn",
        { task: "do thing", label: "Refactor" },
        "Subagent [Refactor] started (id: abc12345).",
      ),
    ];
    const spawns = extractSubagentSpawns(messages);
    expect(spawns).toHaveLength(1);
    expect(spawns[0].taskId).toBe("abc12345");
    expect(spawns[0].label).toBe("Refactor");
    expect(spawns[0].callId).toBe("call-1");
    expect(spawns[0].done).toBe(true);
  });

  it("ignores spawns without a task id in the result", () => {
    const messages: UIMessage[] = [
      traceMessage("call-2", "spawn", { task: "x", label: "Y" }, "no task id here"),
    ];
    expect(extractSubagentSpawns(messages)).toEqual([]);
  });

  it("merges args + result when split across phases", () => {
    const messages: UIMessage[] = [
      {
        id: "t1",
        role: "assistant",
        content: "",
        kind: "trace",
        createdAt: 0,
        toolEvents: [
          {
            phase: "start",
            call_id: "call-3",
            name: "spawn",
            arguments: { task: "x", label: "Lbl" },
          },
          {
            phase: "end",
            call_id: "call-3",
            name: "spawn",
            result: "started (id: deadbeef)",
          },
        ],
      },
    ];
    const spawns = extractSubagentSpawns(messages);
    expect(spawns).toHaveLength(1);
    expect(spawns[0].taskId).toBe("deadbeef");
    expect(spawns[0].label).toBe("Lbl");
  });
});
