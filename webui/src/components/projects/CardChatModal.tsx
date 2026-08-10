import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MessageBubble } from "@/components/MessageBubble";
import { WorkspaceBrowser } from "@/components/workspace/WorkspaceBrowser";
import { useClient } from "@/providers/ClientProvider";
import { bindChatProject } from "@/lib/api";
import { fetchWebuiThread } from "@/lib/api";
import type {
  BoardCard,
  InboundEvent,
  SubagentStatusPayload,
  UIMessage,
} from "@/lib/types";
import type { BoardState } from "@/hooks/useBoard";

type Props = {
  projectId: string;
  card: BoardCard;
  state: BoardState;
  onClose: () => void;
};

export function CardChatModal({ projectId, card, state, onClose }: Props) {
  const { t } = useTranslation();
  const { client, token } = useClient();
  const [chatKey, setChatKey] = useState<string | null>(card.chat_session_key);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [composer, setComposer] = useState("");
  const [subagent, setSubagent] = useState<SubagentStatusPayload | null>(null);
  const chatKeyRef = useRef(chatKey);
  chatKeyRef.current = chatKey;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Resolve/create the card's chat bound to the worktree.
  useEffect(() => {
    let cancelled = false;
    const ensure = async () => {
      if (chatKeyRef.current) return;
      try {
        const scope = {
          project_path: card.worktree_path,
          project_name: card.title,
          access_mode: "restricted" as const,
          restrict_to_workspace: true,
        };
        const chatId = await client.newChat(10_000, scope);
        if (cancelled) return;
        const key = `websocket:${chatId}`;
        await bindChatProject(token, key, projectId).catch(() => undefined);
        await state.setCardChat(card.id, key);
        if (cancelled) return;
        setChatKey(key);
      } catch {
        if (!cancelled) {
          // ignore — user can retry by sending a message
        }
      }
    };
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [card, client, token, projectId, state]);

  // Load persisted history once the chat key is known.
  useEffect(() => {
    if (!chatKey) return;
    let cancelled = false;
    fetchWebuiThread(token, chatKey, { limit: 100, direction: "latest" })
      .then((payload) => {
        if (cancelled || !payload) return;
        setMessages(payload.messages ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatKey, token]);

  // Subscribe to live events.
  useEffect(() => {
    if (!chatKey) return;
    const handler = (ev: InboundEvent) => {
      if (ev.event === "message" && !ev.kind) {
        const text = ev.text ?? "";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: text, isStreaming: false },
            ];
          }
          return [
            ...prev,
            {
              id: `m-${prev.length}-${Date.now()}`,
              role: "assistant",
              content: text,
              kind: "message",
              createdAt: Date.now(),
            },
          ];
        });
      } else if (ev.event === "delta") {
        const text = ev.text ?? "";
        if (!text) return;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + text },
            ];
          }
          return [
            ...prev,
            {
              id: `m-${prev.length}-${Date.now()}`,
              role: "assistant",
              content: text,
              kind: "message",
              isStreaming: true,
              createdAt: Date.now(),
            },
          ];
        });
      } else if (ev.event === "stream_end") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, isStreaming: false, content: ev.text ?? last.content },
            ];
          }
          return prev;
        });
      } else if (ev.event === "turn_end") {
        setRunning(false);
      } else if (ev.event === "goal_status") {
        setRunning(ev.status === "running");
      } else if (ev.event === "subagent_update") {
        setSubagent({
          task_id: ev.task_id,
          label: ev.label,
          task_description: ev.task_description,
          phase: ev.phase,
          iteration: ev.iteration,
          tool_events: ev.tool_events,
          usage: ev.usage,
          stop_reason: ev.stop_reason,
          error: ev.error,
          result: ev.result,
        });
      }
    };
    const unsub = client.onChat(chatKey, handler);
    return () => unsub();
  }, [chatKey, client]);

  // Subscribe to the card's subagent if it has one.
  useEffect(() => {
    if (!card.subagent_task_id) return;
    client.sendEnvelope({ type: "subscribe_subagent", task_id: card.subagent_task_id });
  }, [card.subagent_task_id, client]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(() => {
    const text = composer.trim();
    if (!text || !chatKeyRef.current) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${prev.length}-${Date.now()}`,
        role: "user",
        content: text,
        kind: "message",
        createdAt: Date.now(),
      },
    ]);
    setComposer("");
    setRunning(true);
    client.sendMessage(chatKeyRef.current, text);
  }, [composer, client]);

  const subagentPhase = subagent?.phase;
  const subagentLive =
    subagentPhase && subagentPhase !== "done" && subagentPhase !== "error";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{card.title}</DialogTitle>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <GitBranch className="h-3 w-3" aria-hidden />
                <span className="truncate">{card.branch}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* Chat column */}
            <div className="flex min-w-0 flex-1 flex-col">
              {subagent ? (
                <div className="border-b border-border/40 bg-muted/20 px-4 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    {subagentLive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
                    ) : null}
                    <span className="font-medium text-foreground">
                      {t("board.subagent", { defaultValue: "Subagent" })}: {subagent.label}
                    </span>
                    <span className="text-muted-foreground">
                      {subagentLive
                        ? t("board.subagentRunning", { defaultValue: "working…" })
                        : subagent.phase === "done"
                          ? t("board.done", { defaultValue: "✓ done" })
                          : t("board.error", { defaultValue: "✗ error" })}
                    </span>
                  </div>
                  {subagent.tool_events.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {subagent.tool_events.map((te, i) => (
                        <span
                          key={te.call_id ?? i}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {te.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {subagent.result ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {subagent.result}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("board.noMessages", {
                      defaultValue: "No messages yet. Ask the agent to work on this task.",
                    })}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border/60 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={2}
                    placeholder={t("board.composerPlaceholder", {
                      defaultValue: "Ask the agent to work on this task…",
                    })}
                    className="min-h-[44px] flex-1 resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button onClick={send} disabled={!composer.trim() || running} size="icon">
                    <Send className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>

            {/* Worktree column */}
            <div className="relative hidden w-[40%] min-w-0 border-l border-border/60 md:block">
              <WorkspaceBrowser
                chatId={chatKey ? chatKey.replace("websocket:", "") : undefined}
                rootPath={card.worktree_path}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
