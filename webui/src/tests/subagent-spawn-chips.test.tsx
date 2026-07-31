import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubagentPanelContext, type SubagentPanelController } from "@/components/SubagentPanelContext";
import { SubagentSpawnChips } from "@/components/SubagentSpawnChips";
import type { InboundEvent } from "@/lib/types";
import { ClientProvider } from "@/providers/ClientProvider";

function fakeClient() {
  const handlers = new Map<string, Set<(ev: InboundEvent) => void>>();
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
    },
    emit(chatId: string, ev: InboundEvent) {
      const set = handlers.get(chatId);
      set?.forEach((h) => h(ev));
    },
  };
}

function renderChips(
  seeds: { taskId: string; label: string | null }[],
  isTurnActive: boolean,
  open?: (id: string) => void,
) {
  const fake = fakeClient();
  const controller: SubagentPanelController | null = open ? { open } : null;
  const utils = render(
    <ClientProvider
      client={fake.client as unknown as import("@/lib/nanobot-client").NanobotClient}
      token="tok"
    >
      <SubagentPanelContext.Provider value={controller}>
        <SubagentSpawnChips chatId="chat-1" seeds={seeds} isTurnActive={isTurnActive} />
      </SubagentPanelContext.Provider>
    </ClientProvider>,
  );
  return { fake, utils };
}

describe("SubagentSpawnChips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there are no seeds", () => {
    renderChips([], false);
    expect(screen.queryByTestId(/subagent-chip-/)).toBeNull();
  });

  it("renders one chip per spawn with the extracted label", () => {
    renderChips(
      [
        { taskId: "abc12345", label: "Refactor" },
        { taskId: "deadbeef", label: "Analyze" },
      ],
      true,
    );
    expect(screen.getByTestId("subagent-chip-abc12345")).toHaveTextContent("Refactor");
    expect(screen.getByTestId("subagent-chip-deadbeef")).toHaveTextContent("Analyze");
  });

  it("invokes the panel controller when a chip is clicked", async () => {
    const open = vi.fn();
    renderChips([{ taskId: "abc12345", label: "Refactor" }], false, open);
    await userEvent.click(screen.getByTestId("subagent-chip-abc12345"));
    expect(open).toHaveBeenCalledWith("abc12345");
  });

  it("reflects live phase updates from subagent_update frames", async () => {
    const { fake } = renderChips([{ taskId: "abc12345", label: "Refactor" }], true);
    await act(async () => {
      fake.emit("chat-1", {
        event: "subagent_update",
        chat_id: "chat-1",
        task_id: "abc12345",
        label: "Refactor",
        task_description: "do thing",
        phase: "done",
        iteration: 2,
        tool_events: [],
        usage: {},
        stop_reason: "completed",
        error: null,
        result: "all done",
      });
    });
    expect(screen.getByTestId("subagent-chip-abc12345")).toHaveAttribute(
      "data-subagent-phase",
      "done",
    );
  });
});
