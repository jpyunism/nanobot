import { useEffect } from "react";

import { TodoListsIndex } from "@/components/todos/TodoListsIndex";
import { TodoListDetail } from "@/components/todos/TodoListDetail";
import type { UseTodos } from "@/hooks/useTodos";

interface Props {
  todoSlug: string | null;
  todos: UseTodos;
  onOpenSlug: (slug: string | null) => void;
  onBackToChat: () => void;
}

export function TodosSurface({
  todoSlug,
  todos,
  onOpenSlug,
  onBackToChat,
}: Props) {

  // When the slug changes, ask the hook to open the list + trigger a migration
  // check if the index is empty.
  useEffect(() => {
    if (todoSlug) {
      void todos.openList(todoSlug);
    } else {
      void todos.openList(null);
    }
  }, [todoSlug, todos]);

  // If the index is empty on first open, try migrating (idempotent).
  useEffect(() => {
    if (todos.lists.length === 0 && !todos.loading && todos.needsMigration) {
      void todos.migrate();
    }
  }, [todos.lists.length, todos.loading, todos.needsMigration, todos.migrate]);

  // When the active list is open, poll for changes (the agent may edit the file).
  useEffect(() => {
    if (!todoSlug) return;
    const id = window.setInterval(() => {
      void todos.refreshActiveList();
    }, 5_000);
    return () => window.clearInterval(id);
  }, [todoSlug, todos.refreshActiveList]);

  if (todoSlug) {
    return (
      <TodoListDetail
        list={todos.activeList}
        users={todos.users}
        onBack={() => onOpenSlug(null)}
        onRefresh={() => void todos.refreshActiveList()}
        onCreateItem={todos.addItem}
        onPatchItem={todos.patchItem}
        onDeleteItem={todos.removeItem}
        onFindChatForSlug={todos.findChatForSlug}
        onBindChat={todos.bindChat}
      />
    );
  }

  return (
    <TodoListsIndex
      lists={todos.lists}
      loading={todos.loading}
      needsMigration={todos.needsMigration}
      onOpen={(slug) => onOpenSlug(slug)}
      onCreate={(name) => void todos.createList(name)}
      onDelete={(slug) => void todos.removeList(slug)}
      onMigrate={() => void todos.migrate()}
      onRefresh={() => void todos.refreshLists()}
      onBackToChat={onBackToChat}
    />
  );
}