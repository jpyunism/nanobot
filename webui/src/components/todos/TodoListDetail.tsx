import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TodoItemModal } from "@/components/todos/TodoItemModal";
import { TodoItemRow } from "@/components/todos/TodoItemRow";
import { useClient } from "@/providers/ClientProvider";
import type {
  ChatSummary,
  InboundEvent,
  TodoItem,
  TodoList,
  TodoUser,
} from "@/lib/types";

interface Props {
  list: TodoList | null;
  users: Record<string, TodoUser>;
  onBack: () => void;
  onRefresh: () => void;
  onCreateItem: (slug: string, item: Partial<TodoItem> & { text: string }) => void;
  onPatchItem: (slug: string, itemId: string, changes: Partial<TodoItem>) => void;
  onDeleteItem: (slug: string, itemId: string) => void;
  onFindChatForSlug: (slug: string) => ChatSummary | null;
  onBindChat: (sessionKey: string, slug: string) => Promise<boolean>;
}

interface AssistantState {
  lastText: string;
  running: boolean;
}

const EMPTY: AssistantState = { lastText: "", running: false };

export function TodoListDetail({
  list,
  users,
  onBack,
  onRefresh,
  onCreateItem,
  onPatchItem,
  onDeleteItem,
  onFindChatForSlug,
  onBindChat,
}: Props) {
  const { t } = useTranslation();
  const { client } = useClient();
  const [newItemText, setNewItemText] = useState("");
  const [composerText, setComposerText] = useState("");
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assistant, setAssistant] = useState<AssistantState>(EMPTY);
  const [chatKey, setChatKey] = useState<string | null>(null);
  const chatKeyRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const findChatRef = useRef(onFindChatForSlug);
  const bindChatRef = useRef(onBindChat);
  const creatingForSlugRef = useRef<string | null>(null);
  findChatRef.current = onFindChatForSlug;
  bindChatRef.current = onBindChat;
  chatKeyRef.current = chatKey;

  // Resolve / create a chat bound to this todo list.
  // We intentionally do NOT depend on onFindChatForSlug / sessions so that
  // frequent session-list updates do not re-trigger creation and spawn
  // multiple chats for the same list.
  useEffect(() => {
    if (!list) {
      setChatKey(null);
      setAssistant(EMPTY);
      creatingForSlugRef.current = null;
      return;
    }
    const existing = findChatRef.current(list.slug);
    if (existing) {
      setChatKey(existing.key);
      creatingForSlugRef.current = null;
      return;
    }
    // Avoid creating multiple chats when dependencies change rapidly or when
    // sessions update just before the newly created chat appears in the index.
    if (creatingForSlugRef.current === list.slug) {
      return;
    }
    creatingForSlugRef.current = list.slug;
    // No existing chat for this list — create one bound to the list.
    let cancelled = false;
    client
      .newChat(10_000, null, { todoList: list.slug })
      .then((chatId) => {
        if (cancelled) return;
        const key = `websocket:${chatId}`;
        setChatKey(key);
        // Bind server-side (metadata) — the new_chat envelope already set
        // todo_list, but call bind for sessions that may already exist.
        void bindChatRef.current(key, list.slug).catch(() => undefined);
      })
      .catch(() => {
        creatingForSlugRef.current = null;
        // Ignore — user can retry by sending a message
      });
    return () => {
      cancelled = true;
    };
  }, [list?.slug, client]);

  // Subscribe to inbound events for this chat to show the assistant's last reply.
  useEffect(() => {
    if (!chatKey) {
      setAssistant(EMPTY);
      return;
    }
    const handler = (ev: InboundEvent) => {
      if (ev.event === "message" && !ev.kind) {
        const text = ev.text?.trim();
        if (text) setAssistant((prev) => ({ ...prev, lastText: text }));
      } else if (ev.event === "goal_status") {
        setAssistant((prev) => ({
          ...prev,
          running: ev.status === "running",
        }));
      } else if (ev.event === "turn_end") {
        setAssistant((prev) => ({ ...prev, running: false }));
      } else if (ev.event === "delta") {
        // Live stream: show partial text
        const text = ev.text ?? "";
        if (text) setAssistant((prev) => ({ ...prev, lastText: prev.lastText + text }));
      } else if (ev.event === "stream_end") {
        // stream_end may carry the final text for this segment
        if (ev.text) setAssistant((prev) => ({ ...prev, lastText: ev.text ?? prev.lastText }));
      }
    };
    const unsub = client.onChat(chatKey, handler);
    return () => unsub();
  }, [chatKey, client]);

  // When a new turn starts (user sends), clear the previous assistant text.
  const sendComposer = useCallback(() => {
    const text = composerText.trim();
    if (!text || !chatKeyRef.current) return;
    setAssistant((prev) => ({ ...prev, lastText: "", running: true }));
    client.sendMessage(chatKeyRef.current, text);
    setComposerText("");
  }, [client, composerText]);

  const handleToggle = useCallback(
    (item: TodoItem) => {
      if (!list) return;
      onPatchItem(list.slug, item.id, { done: !item.done });
    },
    [list, onPatchItem],
  );

  const handleEdit = useCallback((item: TodoItem) => {
    setEditing(item);
    setModalOpen(true);
  }, []);

  const handleSaveEdit = useCallback(
    (changes: Partial<TodoItem>) => {
      if (!list || !editing) return;
      onPatchItem(list.slug, editing.id, changes);
    },
    [list, editing, onPatchItem],
  );

  const handleDelete = useCallback(
    (item: TodoItem) => {
      if (!list) return;
      onDeleteItem(list.slug, item.id);
    },
    [list, onDeleteItem],
  );

  const handleAddItem = useCallback(() => {
    const text = newItemText.trim();
    if (!text || !list) return;
    onCreateItem(list.slug, { text });
    setNewItemText("");
  }, [list, newItemText, onCreateItem]);

  if (!list) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("todos.listNotFound", { defaultValue: "List not found." })}
      </div>
    );
  }

  const pending = list.items.filter((x) => !x.done);
  const completed = list.items.filter((x) => x.done);

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("todos.back", { defaultValue: "Back" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{list.name}</h2>
          <p className="text-[11px] text-muted-foreground">
            {t("todos.itemsCount", {
              defaultValue: "{{done}} / {{total}} done",
              done: completed.length,
              total: list.items.length,
            })}
            {chatKey ? <span className="ml-2 text-muted-foreground/60">· chat</span> : null}
            {assistant.running ? (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
                <Sparkles className="h-3 w-3 animate-pulse" />
                {t("todos.thinking", { defaultValue: "thinking…" })}
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} aria-label={t("todos.refresh", { defaultValue: "Refresh" })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick add */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Input
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder={t("todos.quickAdd", { defaultValue: "Add an item…" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAddItem();
            }
          }}
          className="h-8"
        />
        <Button size="sm" variant="ghost" onClick={handleAddItem} disabled={!newItemText.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Items list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {pending.length > 0 ? (
          <section className="mb-3">
            <div className="px-2 pb-1 text-[12px] font-medium text-muted-foreground/65">
              {t("todos.pending", { defaultValue: "Pending" })}
            </div>
            <ul className="space-y-0.5">
              {pending.map((item) => (
                <li key={item.id}>
                  <TodoItemRow
                    item={item}
                    users={users}
                    onToggleDone={handleToggle}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {completed.length > 0 ? (
          <section>
            <div className="px-2 pb-1 text-[12px] font-medium text-muted-foreground/65">
              {t("todos.completed", { defaultValue: "Completed" })}
            </div>
            <ul className="space-y-0.5">
              {completed.map((item) => (
                <li key={item.id}>
                  <TodoItemRow
                    item={item}
                    users={users}
                    onToggleDone={handleToggle}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {list.items.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            {t("todos.empty", { defaultValue: "No items yet. Add one above or ask the agent below." })}
          </div>
        ) : null}
      </div>

      {/* Assistant strip (last reply) */}
      {assistant.lastText ? (
        <div className="border-t border-border/40 bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
            <Sparkles className="h-3 w-3" />
            {t("todos.assistant", { defaultValue: "Assistant" })}
          </div>
          <div className="line-clamp-3 whitespace-pre-wrap break-words leading-4">
            {assistant.lastText}
          </div>
        </div>
      ) : null}

      {/* Chat composer to ask the AI to adjust the current todo list */}
      <div className="border-t border-border/60 bg-background p-3">
        <div className="mx-auto flex max-w-[58rem] flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              <Sparkles className="h-3 w-3" />
              {t("todos.composer.label", { defaultValue: "Ask AI" })}
            </div>
            {chatKey ? null : (
              <span className="text-[11px] text-muted-foreground/70">
                {t("todos.composer.connecting", { defaultValue: "Connecting chat…" })}
              </span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder={
                chatKey
                  ? t("todos.composer.placeholder", { defaultValue: "Ask the agent to update this list…" })
                  : t("todos.composer.connecting", { defaultValue: "Connecting chat…" })
              }
              disabled={!chatKey}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendComposer();
                }
              }}
              className="min-h-[2.25rem] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={sendComposer}
              disabled={!chatKey || !composerText.trim() || assistant.running}
              aria-label={t("todos.composer.send", { defaultValue: "Send" })}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <TodoItemModal
        open={modalOpen}
        item={editing}
        users={users}
        onOpenChange={setModalOpen}
        onSave={handleSaveEdit}
      />
    </div>
  );
}