import { useCallback, useEffect, useRef, useState } from "react";

import { useClient } from "@/providers/ClientProvider";
import type { InboundEvent } from "@/lib/types";

interface AssistantState {
  lastText: string;
  running: boolean;
}

const EMPTY: AssistantState = { lastText: "", running: false };

export function useResearch(onTurnEnd?: () => void) {
  const { token, client } = useClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [chatKey, setChatKey] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<AssistantState>(EMPTY);
  const chatKeyRef = useRef(chatKey);
  chatKeyRef.current = chatKey;
  const sendingRef = useRef(false);
  const onTurnEndRef = useRef(onTurnEnd);
  onTurnEndRef.current = onTurnEnd;

  // Lazily create the ephemeral research chat on first send.
  const ensureChat = useCallback(async (): Promise<string | null> => {
    if (chatKeyRef.current) return chatKeyRef.current;
    if (!client || typeof client.newChat !== "function") return null;
    try {
      const chatId = await client.newChat(10_000, null, {
        research: "__surface__",
      });
      setChatKey(chatId);
      return chatId;
    } catch {
      return null;
    }
  }, [client]);

  // Subscribe to inbound events for this chat.
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
        setAssistant((prev) => ({ ...prev, running: ev.status === "running" }));
      } else if (ev.event === "turn_end") {
        setAssistant((prev) => ({ ...prev, running: false }));
        onTurnEndRef.current?.();
      } else if (ev.event === "delta") {
        const text = ev.text ?? "";
        if (text) setAssistant((prev) => ({ ...prev, lastText: prev.lastText + text }));
      } else if (ev.event === "stream_end") {
        if (ev.text) setAssistant((prev) => ({ ...prev, lastText: ev.text ?? prev.lastText }));
      }
    };
    const unsub = client.onChat(chatKey, handler);
    // Force an immediate attach; the lazy new_chat may already have sent attached
    // before we subscribed, so replay any pending buffered events for this chat.
    const pending = (client as unknown as { getPendingInbound?: (chatId: string) => InboundEvent[] }).getPendingInbound?.(chatKey) ?? [];
    for (const ev of pending) {
      handler(ev);
    }
    return () => unsub();
  }, [chatKey, client]);

  const clearAssistant = useCallback(() => {
    setAssistant(EMPTY);
  }, []);

  // Clear stale assistant text once running has been true and then ends.
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !assistant.running) {
      const timer = setTimeout(() => {
        clearAssistant();
      }, 3_000);
      return () => clearTimeout(timer);
    }
    prevRunningRef.current = assistant.running;
  }, [assistant.running, clearAssistant]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setAssistant({ lastText: "", running: true });
      try {
        let key = chatKeyRef.current;
        if (!key) {
          key = await ensureChat();
        }
        if (!key || !client || typeof client.sendMessage !== "function") {
          setAssistant(EMPTY);
          return;
        }
        client.sendMessage(key, text);
      } finally {
        sendingRef.current = false;
      }
    },
    [client, ensureChat],
  );

  return {
    chatKey,
    assistant,
    sendMessage,
    clearAssistant,
  };
}

export type UseResearch = ReturnType<typeof useResearch>;
