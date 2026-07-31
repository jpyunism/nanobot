import { useEffect, useRef } from "react";
import type { NanobotClient } from "@/lib/nanobot-client";

type SetActiveChatId = (id: string | null) => void;
type SetUpdatedChatIds = (updater: (current: Set<string>) => Set<string>) => void;

type Args = {
  client: NanobotClient;
  activeChatId: string | null;
  setActiveChatIdTracker: SetActiveChatId;
  setUpdatedChatIds: SetUpdatedChatIds;
};

export function useThreadSessionSync({
  client,
  activeChatId,
  setActiveChatIdTracker,
  setUpdatedChatIds,
}: Args) {
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    setActiveChatIdTracker(activeChatId);
  }, [activeChatId, setActiveChatIdTracker]);

  useEffect(() => {
    return client.onSessionUpdate((chatId, scope) => {
      if (scope !== "thread") return;
      setUpdatedChatIds((current) => {
        const next = new Set(current);
        if (activeChatIdRef.current === chatId) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        return next.size === current.size && next.has(chatId) === current.has(chatId)
          ? current
          : next;
      });
    });
  }, [client, setUpdatedChatIds]);
}
