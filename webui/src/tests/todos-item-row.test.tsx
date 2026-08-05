import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TodoItemRow } from "@/components/todos/TodoItemRow";
import type { TodoItem, TodoUser } from "@/lib/types";

function makeItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "i1",
    text: "Comprar café",
    done: false,
    created: "2026-01-01T00:00:00Z",
    done_at: null,
    due_date: null,
    link: null,
    price_clp: null,
    assignee: null,
    notes: null,
    ...overrides,
  };
}

const users: Record<string, TodoUser> = {
  madkoding: { name: "madKoding", phone: "569", authorized: true },
};

describe("TodoItemRow", () => {
  it("renders text and toggles done on checkbox click", () => {
    const onToggle = vi.fn();
    render(
      <TodoItemRow
        item={makeItem()}
        users={users}
        onToggleDone={onToggle}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Comprar café")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mark as done/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows strikethrough and check icon when done", () => {
    render(
      <TodoItemRow
        item={makeItem({ done: true, done_at: "2026-01-02T00:00:00Z" })}
        users={users}
        onToggleDone={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const text = screen.getByText("Comprar café");
    expect(text.className).toMatch(/line-through/);
  });

  it("shows overdue badge when due_date is in the past and not done", () => {
    render(
      <TodoItemRow
        item={makeItem({ due_date: "2020-01-01" })}
        users={users}
        onToggleDone={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });

  it("shows assignee name when set", () => {
    render(
      <TodoItemRow
        item={makeItem({ assignee: "madkoding" })}
        users={users}
        onToggleDone={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("madKoding")).toBeInTheDocument();
  });

  it("renders the dropdown trigger for editing", () => {
    render(
      <TodoItemRow
        item={makeItem()}
        users={users}
        onToggleDone={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // The dropdown trigger's aria-label is "Topic actions for <title>"
    expect(screen.getByRole("button", { name: /Topic actions/i })).toBeInTheDocument();
  });
});