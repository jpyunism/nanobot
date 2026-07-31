import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubagentPanel } from "@/components/SubagentPanel";
import { fetchSubagentStatus } from "@/lib/api";

vi.mock("@/components/CodeBlock", () => ({
  CodeBlock: ({ code }: { code: string }) => (
    <pre data-testid="mock-code-block">{code}</pre>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchSubagentStatus: vi.fn(),
  };
});

describe("SubagentPanel", () => {
  beforeEach(() => {
    vi.mocked(fetchSubagentStatus).mockReset();
  });

  it("renders live status when provided and skips the HTTP fetch", async () => {
    const onClose = vi.fn();
    render(
      <SubagentPanel
        sessionKey="websocket:chat-1"
        taskId="abc12345"
        token="tok"
        liveStatus={{
          task_id: "abc12345",
          label: "Refactor",
          task_description: "do the thing",
          phase: "awaiting_tools",
          iteration: 2,
          tool_events: [
            { call_id: "x", name: "read_file", status: "done", detail: "ok" },
          ],
          usage: {},
          stop_reason: null,
          error: null,
          result: null,
        }}
        onClose={onClose}
      />,
    );

    expect(await screen.findByTestId("subagent-panel")).toHaveAttribute(
      "data-subagent-phase",
      "awaiting_tools",
    );
    expect(screen.getByText("Refactor")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-panel-tools")).toHaveTextContent("read_file");
    expect(fetchSubagentStatus).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("subagent-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to HTTP fetch when no live status is provided", async () => {
    vi.mocked(fetchSubagentStatus).mockResolvedValue({
      task_id: "abc12345",
      label: "Refactor",
      task_description: "do the thing",
      phase: "done",
      iteration: 3,
      tool_events: [
        { call_id: "y", name: "edit_file", status: "done", detail: "patched" },
      ],
      usage: {},
      stop_reason: "completed",
      error: null,
      result: "all done",
      chat_id: "chat-1",
    });

    render(
      <SubagentPanel
        sessionKey="websocket:chat-1"
        taskId="abc12345"
        token="tok"
        liveStatus={null}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(fetchSubagentStatus).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(fetchSubagentStatus).mock.calls[0];
    expect(callArgs[0]).toBe("tok");
    expect(callArgs[1]).toBe("websocket:chat-1");
    expect(callArgs[2]).toBe("abc12345");

    expect(await screen.findByText("all done")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-panel")).toHaveAttribute(
      "data-subagent-phase",
      "done",
    );
  });

  it("returns null on 404 (subagent already evicted)", async () => {
    vi.mocked(fetchSubagentStatus).mockResolvedValue(null);

    render(
      <SubagentPanel
        sessionKey="websocket:chat-1"
        taskId="missing"
        token="tok"
        liveStatus={null}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(fetchSubagentStatus).toHaveBeenCalled();
    });
    // Panel should not crash even when nothing resolves.
    expect(screen.getByTestId("subagent-panel")).toBeInTheDocument();
  });
});
