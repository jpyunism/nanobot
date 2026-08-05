import type {
  TodoItem,
  TodoListDetailPayload,
  TodoListSummary,
  TodoListsPayload,
  TodoUsersPayload,
} from "./types";
import { fetchWithTimeout } from "./http";

const API_READ_TIMEOUT_MS = 20_000;
const TODO_DATA_HEADER = "X-Nanobot-Todo-Data";

type TodoDataBody =
  | Record<string, unknown>
  | { name?: string; slug?: string; text?: string; done?: boolean }
  | Partial<TodoItem>;

async function todoRequest<T>(
  url: string,
  token: string,
  data?: TodoDataBody,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (data !== undefined) {
    headers[TODO_DATA_HEADER] = JSON.stringify(data);
  }
  const init: RequestInit = { method: "GET", headers };
  if (signal) init.signal = signal;
  const res = await fetchWithTimeout(url, init, API_READ_TIMEOUT_MS);
  if (!res.ok) {
    let message = `Todos API error ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "error" in body) {
        const err = (body as { error?: unknown }).error;
        if (typeof err === "string") message = err;
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function listTodoLists(
  token: string,
  base: string = "",
): Promise<TodoListsPayload> {
  return todoRequest<TodoListsPayload>(`${base}/api/todos`, token);
}

export async function fetchTodoList(
  token: string,
  slug: string,
  base: string = "",
): Promise<TodoListDetailPayload> {
  return todoRequest<TodoListDetailPayload>(
    `${base}/api/todos/${encodeURIComponent(slug)}`,
    token,
  );
}

export async function createTodoList(
  token: string,
  name: string,
  base: string = "",
  slug?: string,
): Promise<TodoListSummary> {
  return todoRequest<TodoListSummary>(`${base}/api/todos/create`, token, {
    name,
    ...(slug ? { slug } : {}),
  });
}

export async function deleteTodoList(
  token: string,
  slug: string,
  base: string = "",
): Promise<{ ok: boolean; slug: string }> {
  return todoRequest<{ ok: boolean; slug: string }>(
    `${base}/api/todos/${encodeURIComponent(slug)}`,
    token,
    undefined,
  );
}

export async function fetchTodoUsers(
  token: string,
  base: string = "",
): Promise<TodoUsersPayload> {
  return todoRequest<TodoUsersPayload>(`${base}/api/todos/_users`, token);
}

export async function updateTodoUsers(
  token: string,
  users: TodoUsersPayload["users"],
  base: string = "",
): Promise<TodoUsersPayload> {
  return todoRequest<TodoUsersPayload>(`${base}/api/todos/_users`, token, {
    users,
  });
}

export async function migrateTodoLegacy(
  token: string,
  base: string = "",
): Promise<{ ok: boolean; migrated: boolean; lists: string[] }> {
  return todoRequest<{ ok: boolean; migrated: boolean; lists: string[] }>(
    `${base}/api/todos/migrate`,
    token,
  );
}

export async function createTodoItem(
  token: string,
  slug: string,
  item: Partial<TodoItem> & { text: string },
  base: string = "",
): Promise<{ item: TodoItem; list: TodoListSummary }> {
  return todoRequest<{ item: TodoItem; list: TodoListSummary }>(
    `${base}/api/todos/${encodeURIComponent(slug)}/items`,
    token,
    item,
  );
}

export async function updateTodoItem(
  token: string,
  slug: string,
  itemId: string,
  changes: Partial<TodoItem>,
  base: string = "",
): Promise<{ item: TodoItem; list: TodoListSummary }> {
  return todoRequest<{ item: TodoItem; list: TodoListSummary }>(
    `${base}/api/todos/${encodeURIComponent(slug)}/items/${encodeURIComponent(itemId)}`,
    token,
    changes,
  );
}

export async function deleteTodoItem(
  token: string,
  slug: string,
  itemId: string,
  base: string = "",
): Promise<{ ok: boolean; item_id: string; list: TodoListSummary }> {
  return todoRequest<{ ok: boolean; item_id: string; list: TodoListSummary }>(
    `${base}/api/todos/${encodeURIComponent(slug)}/items/${encodeURIComponent(itemId)}/delete`,
    token,
  );
}

export async function bindChatTodo(
  token: string,
  sessionKey: string,
  slug: string,
  base: string = "",
): Promise<{ session_key: string; todo_list: string }> {
  const query = new URLSearchParams({ slug });
  return todoRequest<{ session_key: string; todo_list: string }>(
    `${base}/api/sessions/${encodeURIComponent(sessionKey)}/todo/bind?${query}`,
    token,
  );
}

export async function unbindChatTodo(
  token: string,
  sessionKey: string,
  base: string = "",
): Promise<{ session_key: string; todo_list: null }> {
  return todoRequest<{ session_key: string; todo_list: null }>(
    `${base}/api/sessions/${encodeURIComponent(sessionKey)}/todo/unbind`,
    token,
  );
}