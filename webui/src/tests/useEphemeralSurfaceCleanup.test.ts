import { describe, expect, it } from "vitest";

import { isEphemeralSurfaceSession } from "@/hooks/useEphemeralSurfaceCleanup";

function makeSession(overrides: Record<string, unknown>) {
  return {
    key: "websocket:chat-1",
    chatId: "chat-1",
    channel: "websocket",
    createdAt: null,
    updatedAt: null,
    title: "",
    preview: "",
    todoList: null,
    agendaAppointmentId: null,
    ...overrides,
  } as Parameters<typeof isEphemeralSurfaceSession>[0];
}

describe("isEphemeralSurfaceSession", () => {
  it("matches agenda surface chats", () => {
    expect(isEphemeralSurfaceSession(makeSession({ agendaAppointmentId: "__surface__" }))).toBe(true);
  });

  it("matches todo list chats", () => {
    expect(isEphemeralSurfaceSession(makeSession({ todoList: "groceries" }))).toBe(true);
  });

  it("does not match normal chats", () => {
    expect(isEphemeralSurfaceSession(makeSession({}))).toBe(false);
  });
});
