import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TodoListsIndex } from "@/components/todos/TodoListsIndex";
import type { TodoListSummary } from "@/lib/types";

function makeList(overrides: Partial<TodoListSummary> = {}): TodoListSummary {
  return {
    id: "id1",
    slug: "compras",
    name: "Compras",
    item_count: 5,
    done_count: 2,
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("TodoListsIndex", () => {
  it("renders lists with progress", () => {
    render(
      <TodoListsIndex
        lists={[makeList()]}
        loading={false}
        needsMigration={false}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        onRefresh={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );
    expect(screen.getByText("Compras")).toBeInTheDocument();
    expect(screen.getByText(/2\/5/)).toBeInTheDocument();
  });

  it("shows empty state when no lists", () => {
    render(
      <TodoListsIndex
        lists={[]}
        loading={false}
        needsMigration={false}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        onRefresh={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/No lists yet/i)).toBeInTheDocument();
  });

  it("shows migration banner when needsMigration is true", () => {
    render(
      <TodoListsIndex
        lists={[]}
        loading={false}
        needsMigration={true}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        onRefresh={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );
    expect(screen.getByText(/Legacy todos.json found/i)).toBeInTheDocument();
  });

  it("calls onOpen when clicking a list card", () => {
    const onOpen = vi.fn();
    render(
      <TodoListsIndex
        lists={[makeList()]}
        loading={false}
        needsMigration={false}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        onRefresh={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Compras"));
    expect(onOpen).toHaveBeenCalledWith("compras");
  });

  it("calls onCreate with trimmed name on Enter in the create form", () => {
    const onCreate = vi.fn();
    render(
      <TodoListsIndex
        lists={[]}
        loading={false}
        needsMigration={false}
        onOpen={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        onRefresh={vi.fn()}
        onBackToChat={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /New list/i }));
    const input = screen.getByPlaceholderText(/e\.g\. Compras/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Proyecto X  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith("Proyecto X");
  });
});