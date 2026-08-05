import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bindChatTodo,
  createTodoItem,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  fetchTodoList,
  fetchTodoUsers,
  listTodoLists,
  migrateTodoLegacy,
  unbindChatTodo,
  updateTodoItem,
  updateTodoUsers,
} from "@/lib/todos-api";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("todos-api", () => {
  it("lists todo lists with GET /api/todos", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lists: [] }),
    } as Response);
    await listTodoLists("tok");
    expect(fetch).toHaveBeenCalledWith(
      "/api/todos",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });

  it("fetches a single list with encoded slug", async () => {
    await fetchTodoList("tok", "compras-2");
    expect(fetch).toHaveBeenCalledWith(
      "/api/todos/compras-2",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("creates a list via header payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slug: "x", name: "X", item_count: 0, done_count: 0, updated_at: "" }),
    } as Response);
    await createTodoList("tok", "Compras");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/todos/create");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "X-Nanobot-Todo-Data": JSON.stringify({ name: "Compras" }),
    });
  });

  it("delete list hits /api/todos/{slug}", async () => {
    await deleteTodoList("tok", "lista");
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/todos/lista");
  });

  it("create item sends text in header payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        item: { id: "i1", text: "café", done: false, created: "", done_at: null, due_date: null, link: null, price_clp: null, assignee: null },
        list: { slug: "compras", name: "Compras", item_count: 1, done_count: 0, updated_at: "" },
      }),
    } as Response);
    await createTodoItem("tok", "compras", { text: "café" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/todos/compras/items");
    expect(init.headers).toMatchObject({
      "X-Nanobot-Todo-Data": JSON.stringify({ text: "café" }),
    });
  });

  it("update item encodes slug and item id", async () => {
    await updateTodoItem("tok", "compras", "i 1", { done: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/todos/compras/items/i%201");
    expect(init.headers).toMatchObject({
      "X-Nanobot-Todo-Data": JSON.stringify({ done: true }),
    });
  });

  it("delete item uses /delete path", async () => {
    await deleteTodoItem("tok", "compras", "i1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/todos/compras/items/i1/delete",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("bind chat sends slug in query string", async () => {
    await bindChatTodo("tok", "websocket:abc", "compras");
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Aabc/todo/bind?slug=compras",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("unbind chat posts to /unbind", async () => {
    await unbindChatTodo("tok", "websocket:abc");
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/websocket%3Aabc/todo/unbind",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("fetch users hits /api/todos/_users", async () => {
    await fetchTodoUsers("tok");
    expect(fetch).toHaveBeenCalledWith(
      "/api/todos/_users",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("update users sends users object in header", async () => {
    await updateTodoUsers("tok", { madkoding: { name: "madKoding", authorized: true } });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-Nanobot-Todo-Data": JSON.stringify({ users: { madkoding: { name: "madKoding", authorized: true } } }),
    });
  });

  it("migrate hits /api/todos/migrate", async () => {
    await migrateTodoLegacy("tok");
    expect(fetch).toHaveBeenCalledWith(
      "/api/todos/migrate",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("throws with server error message on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid slug" }),
    } as Response);
    await expect(createTodoList("tok", "")).rejects.toThrow("invalid slug");
  });
});