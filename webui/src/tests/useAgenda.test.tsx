import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgenda } from "@/hooks/useAgenda";
import * as agendaApi from "@/lib/agenda-api";
import { ClientProvider } from "@/providers/ClientProvider";
import type { InboundEvent } from "@/lib/types";

vi.mock("@/lib/agenda-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agenda-api")>();
  return {
    ...actual,
    listAgendaAppointments: vi.fn(),
    bindChatAgenda: vi.fn(),
  };
});

interface FakeClient {
  status: "open";
  newChat: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  onChat: ReturnType<typeof vi.fn>;
  onStatus: () => () => void;
  onError: () => () => void;
  onSessionUpdate: () => () => void;
  onRunStatus: () => () => void;
  getRunStartedAt: () => null;
  emitChat: (ev: InboundEvent) => void;
}

function fakeClient(): FakeClient {
  const chatHandlers = new Map<string, Set<(ev: InboundEvent) => void>>();
  return {
    status: "open",
    newChat: vi.fn().mockResolvedValue("chat-1"),
    sendMessage: vi.fn(),
    onChat: (chatId: string, handler: (ev: InboundEvent) => void) => {
      let handlers = chatHandlers.get(chatId);
      if (!handlers) {
        handlers = new Set();
        chatHandlers.set(chatId, handlers);
      }
      handlers.add(handler);
      return () => handlers?.delete(handler);
    },
    onStatus: () => () => {},
    onError: () => () => {},
    onSessionUpdate: () => () => {},
    onRunStatus: () => () => {},
    getRunStartedAt: () => null,
    emitChat: (ev: InboundEvent) => {
      const id = (ev as unknown as { chat_id?: string }).chat_id ?? "chat-1";
      for (const handler of chatHandlers.get(id) ?? []) handler(ev);
    },
  };
}

function wrap(client: FakeClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ClientProvider
        client={client as unknown as import("@/lib/nanobot-client").NanobotClient}
        token="tok"
      >
        {children}
      </ClientProvider>
    );
  };
}

describe("useAgenda", () => {
  beforeEach(() => {
    vi.mocked(agendaApi.listAgendaAppointments).mockReset();
    vi.mocked(agendaApi.bindChatAgenda).mockReset();
    vi.mocked(agendaApi.listAgendaAppointments).mockResolvedValue({
      appointments: [],
    });
    vi.mocked(agendaApi.bindChatAgenda).mockResolvedValue({
      session_key: "websocket:chat-1",
      agenda_appointment: "__surface__",
    });
  });

  it("does not create a chat until the first send", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAgenda(), { wrapper: wrap(client) });
    expect(client.newChat).not.toHaveBeenCalled();
    expect(result.current.chatKey).toBeNull();
  });

  it("lazily creates a chat on send, then sends the message", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAgenda(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.sendMessage("agrega una cita el martes");
    });

    expect(client.newChat).toHaveBeenCalledWith(
      10_000,
      null,
      { agendaAppointment: "__surface__" },
    );
    expect(agendaApi.bindChatAgenda).toHaveBeenCalledWith(
      "tok",
      "websocket:chat-1",
      "__surface__",
    );
    expect(client.sendMessage).toHaveBeenCalledWith(
      "chat-1",
      "agrega una cita el martes",
    );
    expect(result.current.assistant.running).toBe(true);
  });

  it("refreshes the calendar when the turn ends (no per-turn deletion)", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAgenda(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.sendMessage("agrega una cita el martes");
    });
    vi.mocked(agendaApi.listAgendaAppointments).mockResolvedValue({
      appointments: [
        {
          id: "a1",
          title: "Cita",
          date: "2026-08-05",
          time: null,
          all_day: false,
          category: "personal",
          color: "#3b82f6",
          updated_at: "2026-08-05T10:00:00Z",
        },
      ],
    });

    await act(async () => {
      client.emitChat({
        event: "turn_end",
        chat_id: "chat-1",
      } as unknown as InboundEvent);
    });

    await waitFor(() => {
      expect(result.current.assistant.running).toBe(false);
      expect(result.current.appointments).toHaveLength(1);
    });
  });
});
