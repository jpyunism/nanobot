import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubagentPanelHost } from "@/components/SubagentPanelHost";
import { SubagentSpawnChips } from "@/components/SubagentSpawnChips";
import { fetchSubagentStatus } from "@/lib/api";
import type { InboundEvent } from "@/lib/types";
import { ClientProvider } from "@/providers/ClientProvider";

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

function fakeClient() {
  const handlers = new Map<string, Set<(ev: InboundEvent) => void>>();
  const sentEnvelopes: Record<string, unknown>[] = [];
  return {
    client: {
      status: "open" as const,
      defaultChatId: null as string | null,
      onStatus: () => () => {},
      onError: () => () => {},
      getRunStartedAt: () => null,
      getGoalState: () => undefined,
      onChat(chatId: string, h: (ev: InboundEvent) => void) {
        let set = handlers.get(chatId);
        if (!set) {
          set = new Set();
          handlers.set(chatId, set);
        }
        set.add(h);
        return () => {
          set!.delete(h);
        };
      },
      sendMessage: vi.fn(),
      newChat: vi.fn(),
      forkChat: vi.fn(),
      attach: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
      updateUrl: vi.fn(),
      sendEnvelope(envelope: Record<string, unknown>) {
        sentEnvelopes.push(envelope);
      },
    },
    emit(chatId: string, ev: InboundEvent) {
      const set = handlers.get(chatId);
      set?.forEach((h) => h(ev));
    },
    sentEnvelopes,
  };
}

describe("SubagentPanelHost + chips click flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens panel with status when a chip is clicked (HTTP fallback path)", async () => {
    const fake = fakeClient();
    vi.mocked(fetchSubagentStatus).mockResolvedValue({
      task_id: "abc12345",
      label: "Refactor",
      task_description: "do the thing",
      phase: "awaiting_tools",
      iteration: 1,
      tool_events: [],
      usage: {},
      stop_reason: null,
      error: null,
      result: null,
      chat_id: "chat-1",
    });

    render(
      <ClientProvider
        client={fake.client as unknown as import("@/lib/nanobot-client").NanobotClient}
        token="tok"
      >
        <SubagentPanelHost chatId="chat-1" sessionKey="websocket:chat-1">
          <SubagentSpawnChips
            chatId="chat-1"
            seeds={[{ taskId: "abc12345", label: "Refactor" }]}
            isTurnActive={true}
          />
        </SubagentPanelHost>
      </ClientProvider>,
    );

    expect(screen.getByTestId("subagent-chip-abc12345")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-panel")).toBeNull();

    await userEvent.click(screen.getByTestId("subagent-chip-abc12345"));

    await waitFor(() => {
      expect(screen.getByTestId("subagent-panel")).toBeInTheDocument();
    });
    expect(fetchSubagentStatus).toHaveBeenCalledWith(
      "tok",
      "websocket:chat-1",
      "abc12345",
    );
    await waitFor(() => {
      expect(screen.getByTestId("subagent-panel-task")).toHaveTextContent("do the thing");
    });
  });

  it("renders a WS-pushed subagent_update even when the HTTP fetch returns null", async () => {
    const fake = fakeClient();
    vi.mocked(fetchSubagentStatus).mockResolvedValue(null);

    render(
      <ClientProvider
        client={fake.client as unknown as import("@/lib/nanobot-client").NanobotClient}
        token="tok"
      >
        <SubagentPanelHost chatId="chat-1" sessionKey="websocket:chat-1">
          <SubagentSpawnChips
            chatId="chat-1"
            seeds={[{ taskId: "abc12345", label: "Refactor" }]}
            isTurnActive={true}
          />
        </SubagentPanelHost>
      </ClientProvider>,
    );

    await userEvent.click(screen.getByTestId("subagent-chip-abc12345"));

    // The panel mounts with liveStatus=null and starts the HTTP fetch.
    // Simulate the server pushing a subagent_update after subscribe_subagent
    // (in production this is emitted immediately by the gateway handler).
    await act(async () => {
      fake.emit("chat-1", {
        event: "subagent_update",
        chat_id: "chat-1",
        task_id: "abc12345",
        label: "Refactor",
        task_description: "ws pushed task",
        phase: "awaiting_tools",
        iteration: 1,
        tool_events: [{ call_id: "x", name: "read_file", status: "running", detail: null }],
        usage: {},
        stop_reason: null,
        error: null,
        result: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("subagent-panel")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("subagent-panel-task")).toHaveTextContent("ws pushed task");
    });
    expect(screen.getByTestId("subagent-panel-tools")).toHaveTextContent("read_file");
  });
});
