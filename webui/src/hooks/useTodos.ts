import { useCallback, useEffect, useRef, useState } from "react";

import { useClient } from "@/providers/ClientProvider";
import {
  bindChatTodo as bindChatTodoApi,
  createTodoItem,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  fetchTodoList,
  fetchTodoUsers,
  listTodoLists,
  migrateTodoLegacy,
  updateTodoItem,
  updateTodoUsers,
} from "@/lib/todos-api";
import type {
  ChatSummary,
  TodoItem,
  TodoList,
  TodoListSummary,
  TodoUser,
} from "@/lib/types";

interface TodosState {
  lists: TodoListSummary[];
  activeSlug: string | null;
  activeList: TodoList | null;
  users: Record<string, TodoUser>;
  loading: boolean;
  error: string | null;
  /** True when the legacy todos.json migration is available (never migrated). */
  needsMigration: boolean;
}

const initialState: TodosState = {
  lists: [],
  activeSlug: null,
  activeList: null,
  users: {},
  loading: true,
  error: null,
  needsMigration: false,
};

function withListSummary(
  list: TodoListSummary,
  prev: TodosState,
): TodosState {
  const lists = prev.lists.map((l) => (l.slug === list.slug ? list : l));
  if (!lists.some((l) => l.slug === list.slug)) lists.push(list);
  lists.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return { ...prev, lists };
}

export function useTodos(sessions: ChatSummary[]) {
  const { token } = useClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [state, setState] = useState<TodosState>(initialState);
  const activeListRef = useRef<TodoList | null>(null);
  activeListRef.current = state.activeList;
  const refreshSeqRef = useRef(0);

  // Refresh the index of lists + users.
  const refreshLists = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const seq = ++refreshSeqRef.current;
    try {
      const payload = await listTodoLists(t);
      if (seq !== refreshSeqRef.current) return;
      setState((prev) => ({
        ...prev,
        lists: payload.lists,
        loading: false,
        error: null,
      }));
    } catch (e) {
      if (seq !== refreshSeqRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: errToString(e) }));
    }
  }, []);

  // Refresh users roster.
  const refreshUsers = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const payload = await fetchTodoUsers(t);
      setState((prev) => ({ ...prev, users: payload.users }));
    } catch (e) {
      // Non-fatal: keep previous users
      setState((prev) => ({ ...prev, error: errToString(e) }));
    }
  }, []);

  // Initial load + periodic migration check.
  useEffect(() => {
    void (async () => {
      const t = tokenRef.current;
      if (!t) return;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await listTodoLists(t);
        // If the index is empty and there's a legacy todos.json, suggest migration.
        let needsMigration = false;
        if (payload.lists.length === 0) {
          needsMigration = true; // We'll try migrate lazily on first open
        }
        let users: Record<string, TodoUser> = {};
        try {
          users = (await fetchTodoUsers(t)).users;
        } catch {
          // users file may not exist yet
        }
        setState((prev) => ({
          ...prev,
          lists: payload.lists,
          users,
          loading: false,
          needsMigration,
        }));
      } catch (e) {
        setState((prev) => ({ ...prev, loading: false, error: errToString(e) }));
      }
    })();
  }, []);

  // Open a specific list (fetch full detail).
  const openList = useCallback(async (slug: string | null) => {
    const t = tokenRef.current;
    if (!slug) {
      setState((prev) => ({ ...prev, activeSlug: null, activeList: null }));
      return;
    }
    setState((prev) => ({ ...prev, activeSlug: slug }));
    try {
      const payload = await fetchTodoList(t, slug);
      setState((prev) => ({
        ...prev,
        activeList: payload.list,
        users: { ...prev.users, ...payload.users },
        error: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        activeList: null,
        error: errToString(e),
      }));
    }
  }, []);

  const refreshActiveList = useCallback(async () => {
    const t = tokenRef.current;
    const slug = activeListRef.current?.slug;
    if (!t || !slug) return;
    try {
      const payload = await fetchTodoList(t, slug);
      setState((prev) => ({
        ...prev,
        activeList: payload.list,
        users: { ...prev.users, ...payload.users },
      }));
    } catch {
      // ignore
    }
  }, []);

  const createList = useCallback(
    async (name: string, slug?: string) => {
      const t = tokenRef.current;
      if (!t) return null;
      try {
        const summary = await createTodoList(t, name, "", slug);
        setState((prev) => ({
          ...prev,
          lists: withListSummary(summary, prev).lists,
          needsMigration: false,
        }));
        return summary;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return null;
      }
    },
    [],
  );

  const removeList = useCallback(async (slug: string) => {
    const t = tokenRef.current;
    if (!t) return false;
    try {
      await deleteTodoList(t, slug);
      setState((prev) => ({
        ...prev,
        lists: prev.lists.filter((l) => l.slug !== slug),
        activeSlug: prev.activeSlug === slug ? null : prev.activeSlug,
        activeList: prev.activeSlug === slug ? null : prev.activeList,
      }));
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, error: errToString(e) }));
      return false;
    }
  }, []);

  const addItem = useCallback(
    async (slug: string, item: Partial<TodoItem> & { text: string }) => {
      const t = tokenRef.current;
      if (!t) return null;
      try {
        const res = await createTodoItem(t, slug, item);
        setState((prev) => ({
          ...prev,
          activeList:
            prev.activeList?.slug === slug
              ? { ...prev.activeList, items: [...prev.activeList.items, res.item] }
              : prev.activeList,
          lists: withListSummary(res.list, prev).lists,
        }));
        return res.item;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return null;
      }
    },
    [],
  );

  const patchItem = useCallback(
    async (slug: string, itemId: string, changes: Partial<TodoItem>) => {
      const t = tokenRef.current;
      if (!t) return null;
      try {
        const res = await updateTodoItem(t, slug, itemId, changes);
        setState((prev) => {
          const activeList =
            prev.activeList?.slug === slug
              ? {
                  ...prev.activeList,
                  items: prev.activeList.items.map((it) =>
                    it.id === itemId ? res.item : it,
                  ),
                }
              : prev.activeList;
          return { ...prev, activeList, lists: withListSummary(res.list, prev).lists };
        });
        return res.item;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return null;
      }
    },
    [],
  );

  const removeItem = useCallback(async (slug: string, itemId: string) => {
    const t = tokenRef.current;
    if (!t) return false;
    try {
      const res = await deleteTodoItem(t, slug, itemId);
      setState((prev) => {
        const activeList =
          prev.activeList?.slug === slug
            ? {
                ...prev.activeList,
                items: prev.activeList.items.filter((it) => it.id !== itemId),
              }
            : prev.activeList;
        return { ...prev, activeList, lists: withListSummary(res.list, prev).lists };
      });
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, error: errToString(e) }));
      return false;
    }
  }, []);

  const saveUsers = useCallback(
    async (users: Record<string, TodoUser>) => {
      const t = tokenRef.current;
      if (!t) return false;
      try {
        const res = await updateTodoUsers(t, users);
        setState((prev) => ({ ...prev, users: res.users }));
        return true;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return false;
      }
    },
    [],
  );

  const migrate = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return false;
    try {
      const res = await migrateTodoLegacy(t);
      if (res.migrated) {
        await refreshLists();
        await refreshUsers();
      }
      setState((prev) => ({ ...prev, needsMigration: !res.migrated }));
      return res.migrated;
    } catch (e) {
      setState((prev) => ({ ...prev, error: errToString(e) }));
      return false;
    }
  }, [refreshLists, refreshUsers]);

  // Find or create a chat bound to a todo list slug.
  const findChatForSlug = useCallback(
    (slug: string): ChatSummary | null => {
      return (
        sessions.find(
          (s) => s.todoList === slug && s.channel === "websocket",
        ) ?? null
      );
    },
    [sessions],
  );

  const bindChat = useCallback(
    async (sessionKey: string, slug: string) => {
      const t = tokenRef.current;
      if (!t) return false;
      try {
        await bindChatTodoApi(t, sessionKey, slug);
        return true;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return false;
      }
    },
    [],
  );

  return {
    ...state,
    refreshLists,
    refreshUsers,
    refreshActiveList,
    openList,
    createList,
    removeList,
    addItem,
    patchItem,
    removeItem,
    saveUsers,
    migrate,
    findChatForSlug,
    bindChat,
  };
}

function errToString(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type UseTodos = ReturnType<typeof useTodos>;