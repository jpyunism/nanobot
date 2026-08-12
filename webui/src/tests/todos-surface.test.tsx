import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import { TodosSurface } from "@/components/todos/TodosSurface";
import { ClientProvider } from "@/providers/ClientProvider";
import type { UseTodos } from "@/hooks/useTodos";
import type { NanobotClient } from "@/lib/nanobot-client";

function makeTodos(overrides: Partial<UseTodos> = {}): UseTodos {
  return {
    lists: [],
    activeSlug: null,
    activeList: null,
    users: {},
    loading: false,
    error: null,
    needsMigration: false,
    refreshLists: vi.fn(),
    refreshUsers: vi.fn(),
    refreshActiveList: vi.fn(),
    openList: vi.fn(),
    createList: vi.fn(),
    removeList: vi.fn(),
    addItem: vi.fn(),
    patchItem: vi.fn(),
    removeItem: vi.fn(),
    saveUsers: vi.fn(),
    migrate: vi.fn(),
    findChatForSlug: vi.fn(),
    bindChat: vi.fn(),
    ...overrides,
  };
}

function fakeClient(): NanobotClient {
  return {
    status: "open",
    newChat: vi.fn().mockResolvedValue("chat-1"),
    sendMessage: vi.fn(),
    onChat: () => () => {},
    onStatus: () => () => {},
    onError: () => () => {},
    onSessionUpdate: () => () => {},
    onRunStatus: () => () => {},
    getRunStartedAt: () => null,
  } as unknown as NanobotClient;
}

function wrap(client: NanobotClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ClientProvider client={client} token="tok">
        {children}
      </ClientProvider>
    );
  };
}

describe("TodosSurface", () => {
  it("opens the list once per slug, even when the todos object identity changes", () => {
    const openList = vi.fn();
    const first = makeTodos({ openList });
    const { rerender } = render(
      <TodosSurface
        todoSlug="compras"
        todos={first}
        onOpenSlug={vi.fn()}
        onBackToChat={vi.fn()}
      />,
      { wrapper: wrap(fakeClient()) },
    );

    // The real useTodos() returns a brand-new object on every state update
    // (e.g. right after openList() sets activeSlug). Re-render with a fresh
    // object identity but the same stable openList callback.
    const second = makeTodos({ openList });
    rerender(
      <TodosSurface
        todoSlug="compras"
        todos={second}
        onOpenSlug={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );

    expect(openList).toHaveBeenCalledTimes(1);
    expect(openList).toHaveBeenCalledWith("compras");
  });

  it("re-opens when the slug actually changes", () => {
    const openList = vi.fn();
    const todos = makeTodos({ openList });
    const { rerender } = render(
      <TodosSurface
        todoSlug="compras"
        todos={todos}
        onOpenSlug={vi.fn()}
        onBackToChat={vi.fn()}
      />,
      { wrapper: wrap(fakeClient()) },
    );
    rerender(
      <TodosSurface
        todoSlug="trabajo"
        todos={todos}
        onOpenSlug={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );

    expect(openList).toHaveBeenCalledTimes(2);
    expect(openList).toHaveBeenLastCalledWith("trabajo");
  });
});
