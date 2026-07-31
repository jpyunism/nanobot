import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  readSessionUpdateChatIds,
  writeSessionUpdateChatIds,
} from "@/lib/sidebar-state-keys";
import type { ChatSummary } from "@/lib/types";
import type { NanobotClient } from "@/lib/nanobot-client";

export type RunTrackerApi = {
  runningChatIds: string[];
  updatedChatIds: string[];
  setActiveChatId: (id: string | null) => void;
  setUpdatedChatIds: (
    updater: (current: Set<string>) => Set<string>,
  ) => void;
};

export interface UseRunTrackerArgs {
  client: NanobotClient;
  sessions: ChatSummary[];
  loading: boolean;
  activeChatIdRef?: MutableRefObject<string | null>;
}

export function useRunTracker(args: UseRunTrackerArgs): RunTrackerApi {
  const { client, sessions, loading, activeChatIdRef } = args;
  const [running, setRunning] = useState<Set<string>>(() => new Set());
  const [updated, setUpdated] = useState<Set<string>>(readSessionUpdateChatIds);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);

  const setActiveChatId = useCallback(
    (id: string | null) => setActiveChatIdState(id),
    [],
  );
  const setUpdatedChatIds = useCallback(
    (updater: (current: Set<string>) => Set<string>) => setUpdated((c) => updater(c)),
    [],
  );
  const activeChatIdInternalRef = useRef<string | null>(null);
  const runningRef = useRef<Set<string>>(new Set());

  const ref = activeChatIdRef ?? activeChatIdInternalRef;
  ref.current = activeChatId;

  useEffect(() => {
    if (!activeChatId) return;
    setUpdated((current) => {
      if (!current.has(activeChatId)) return current;
      const next = new Set(current);
      next.delete(activeChatId);
      return next;
    });
  }, [activeChatId]);

  useEffect(() => {
    if (loading) return;
    const knownChatIds = new Set(sessions.map((session) => session.chatId));
    setUpdated((current) => {
      const next = new Set(
        Array.from(current).filter((id) => knownChatIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [loading, sessions]);

  useEffect(() => {
    writeSessionUpdateChatIds(updated);
  }, [updated]);

  useEffect(() => {
    if (loading) return;
    const activeRunIds = sessions
      .filter((session) => typeof session.runStartedAt === "number")
      .map((session) => session.chatId);
    if (activeRunIds.length === 0) return;

    for (const chatId of activeRunIds) {
      client.attach(chatId);
    }
    setRunning((current) => {
      let changed = false;
      const next = new Set(current);
      for (const chatId of activeRunIds) {
        if (!next.has(chatId)) {
          changed = true;
          next.add(chatId);
        }
      }
      if (!changed) return current;
      runningRef.current = next;
      return next;
    });
    setUpdated((current) => {
      let changed = false;
      const next = new Set(current);
      for (const chatId of activeRunIds) {
        if (next.delete(chatId)) changed = true;
      }
      return changed ? next : current;
    });
  }, [client, loading, sessions]);

  useEffect(() => {
    const offStatus = client.onRunStatus?.((chatId, startedAt) => {
      if (startedAt != null) {
        const nextRunning = new Set(runningRef.current);
        nextRunning.add(chatId);
        runningRef.current = nextRunning;
        setRunning(nextRunning);
        setUpdated((current) => {
          if (!current.has(chatId)) return current;
          const next = new Set(current);
          next.delete(chatId);
          return next;
        });
        return;
      }
      if (!runningRef.current.has(chatId)) return;
      const nextRunning = new Set(runningRef.current);
      nextRunning.delete(chatId);
      runningRef.current = nextRunning;
      setRunning(nextRunning);
      setUpdated((current) => {
        const next = new Set(current);
        if (ref.current === chatId) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        return next;
      });
    });
    return () => offStatus?.();
  }, [client, ref]);

  return {
    runningChatIds: useMemo(() => Array.from(running), [running]),
    updatedChatIds: useMemo(() => Array.from(updated), [updated]),
    setActiveChatId,
    setUpdatedChatIds,
  };
}
