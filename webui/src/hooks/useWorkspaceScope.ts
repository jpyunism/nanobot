import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchWorkspaces } from "@/lib/api";
import { projectNameFromPath } from "@/lib/workspace";
import type { ChatSummary, WorkspaceScopePayload, WorkspacesPayload } from "@/lib/types";
import type { NanobotClient } from "@/lib/nanobot-client";

export function normalizeWorkspaceScope(
  scope: WorkspaceScopePayload,
): WorkspaceScopePayload {
  const accessMode = scope.access_mode === "restricted" ? "restricted" : "full";
  return {
    ...scope,
    project_name: scope.project_name ?? projectNameFromPath(scope.project_path),
    access_mode: accessMode,
    restrict_to_workspace: accessMode === "restricted",
  };
}

export interface UseWorkspaceScopeArgs {
  client: NanobotClient;
  token: string;
  activeSession: ChatSummary | null;
  activeChatId: string | null;
  activeChatRunning: boolean;
  loading: boolean;
  shouldClearDraftScope: boolean;
}

export interface UseWorkspaceScopeApi {
  workspaces: WorkspacesPayload | null;
  error: string | null;
  setError: (err: string | null) => void;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  refresh: () => Promise<void>;
  apply: (scope: WorkspaceScopePayload) => void;
  setDraftScope: (scope: WorkspaceScopePayload | null) => void;
  setOverrides: (
    updater: (current: Record<string, WorkspaceScopePayload>) => Record<string, WorkspaceScopePayload>,
  ) => void;
  pruneOverrides: (knownChatIds: Set<string>) => void;
}

export function useWorkspaceScope(args: UseWorkspaceScopeArgs): UseWorkspaceScopeApi {
  const { client, token, activeSession, activeChatId, activeChatRunning, loading, shouldClearDraftScope } = args;
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState<WorkspaceScopePayload | null>(null);
  const [overrides, setOverrides] = useState<Record<string, WorkspaceScopePayload>>({});

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchWorkspaces(token);
      setWorkspaces(payload);
    } catch {
      setWorkspaces(null);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setError(null);
    if (shouldClearDraftScope) {
      setDraftScope(null);
    }
  }, [loading, shouldClearDraftScope]);

  useEffect(() => {
    if (loading) return;
    const knownChatIds = new Set([activeChatId].filter((id): id is string => Boolean(id)));
    setOverrides((current) => {
      const entries = Object.entries(current).filter(([chatId]) => knownChatIds.has(chatId));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [loading, activeChatId]);

  useEffect(() => {
    return client.onSessionUpdate((chatId, scope, workspaceScope) => {
      if (scope === "thread") return;
      if (!workspaceScope) return;
      const next = normalizeWorkspaceScope(workspaceScope);
      setOverrides((current) => ({
        ...current,
        [chatId]: next,
      }));
      setDraftScope(next);
      setError(null);
      void refresh();
    });
  }, [client, refresh]);

  useEffect(() => {
    return client.onError((err) => {
      if (err.kind !== "workspace_scope_rejected") return;
      setError(t("errors.workspaceScopeRejected.body"));
      void refresh();
    });
  }, [client, refresh, t]);

  const activeWorkspaceScope = useMemo<WorkspaceScopePayload | null>(() => {
    if (activeChatId && overrides[activeChatId]) {
      return overrides[activeChatId];
    }
    if (activeSession?.workspaceScope) {
      return activeSession.workspaceScope;
    }
    return draftScope ?? workspaces?.default_scope ?? null;
  }, [
    activeChatId,
    activeSession?.workspaceScope,
    draftScope,
    overrides,
    workspaces?.default_scope,
  ]);

  const apply = useCallback(
    (scope: WorkspaceScopePayload) => {
      const next = normalizeWorkspaceScope(scope);
      setError(null);
      if (activeChatId) {
        if (!activeChatRunning) {
          client.setWorkspaceScope(activeChatId, next);
        }
        return;
      }
      setDraftScope(next);
    },
    [activeChatId, activeChatRunning, client],
  );

  const pruneOverrides = useCallback((knownChatIds: Set<string>) => {
    setOverrides((current) => {
      const entries = Object.entries(current).filter(([chatId]) => knownChatIds.has(chatId));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, []);

  return {
    workspaces,
    error,
    setError,
    activeWorkspaceScope,
    refresh,
    apply,
    setDraftScope,
    setOverrides,
    pruneOverrides,
  };
}
