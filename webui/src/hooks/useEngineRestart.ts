import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  rememberRestartRoute,
  RESTART_ROUTE_KEY,
  RESTART_STARTED_KEY,
} from "@/lib/routing";
import type { NanobotClient } from "@/lib/nanobot-client";
import type { ChatSummary } from "@/lib/types";

interface UseEngineRestartArgs {
  client: NanobotClient;
  activeSession: ChatSummary | null;
  defaultChatId: string | null;
}

export type EngineRestartApi = {
  isRestarting: boolean;
  toast: string | null;
  setToast: (toast: string | null) => void;
  onRestart: () => void;
};

export function useEngineRestart(args: UseEngineRestartArgs): EngineRestartApi {
  const { client, activeSession, defaultChatId } = args;
  const { t } = useTranslation();
  const sawDisconnectRef = useRef(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onRestart = useCallback(() => {
    const chatId = activeSession?.chatId ?? defaultChatId;
    if (!chatId) return;
    sawDisconnectRef.current = false;
    setIsRestarting(true);
    rememberRestartRoute();
    try {
      window.localStorage.setItem(RESTART_STARTED_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    void client.sendSystemCommand(chatId, "/restart").catch(() => {});
  }, [activeSession?.chatId, client, defaultChatId]);

  useEffect(() => {
    const off = client.onStatus((status) => {
      const startedAt = (() => {
        try {
          return Number(window.localStorage.getItem(RESTART_STARTED_KEY) ?? "0");
        } catch {
          return 0;
        }
      })();
      if (!startedAt) return;
      if (status !== "open") {
        sawDisconnectRef.current = true;
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      if (!sawDisconnectRef.current && elapsedMs < 1500) return;
      try {
        window.localStorage.removeItem(RESTART_STARTED_KEY);
        window.localStorage.removeItem(RESTART_ROUTE_KEY);
      } catch {
        // ignore storage errors
      }
      setIsRestarting(false);
      setToast(t("app.restart.completed", { seconds: (elapsedMs / 1000).toFixed(1) }));
      window.setTimeout(() => setToast(null), 3_500);
    });
    return () => off?.();
  }, [client, t]);

  return { isRestarting, toast, setToast, onRestart };
}
