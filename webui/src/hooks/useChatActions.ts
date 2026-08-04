import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { defaultShellRoute, shellViewForSettingsSection, type ShellView } from "@/lib/routing";
import type { SettingsSectionKey, SidebarStatePayload } from "@/lib/types";
import type { ChatSummary, SessionAutomationJob, WorkspaceScopePayload } from "@/lib/types";

interface CreateChatFn {
  (scope?: WorkspaceScopePayload | null): Promise<string>;
}

interface ForkChatFn {
  (sourceChatId: string, beforeUserIndex: number, title?: string): Promise<string>;
}

interface DeleteChatFn {
  (
    key: string,
    options?: { deleteAutomations?: boolean },
  ): Promise<{ blocked_by_automations?: boolean; automations?: SessionAutomationJob[] }>;
}

interface GetSessionAutomationsFn {
  (key: string): Promise<SessionAutomationJob[]>;
}

export interface ActionsApi {
  chat: {
    onCreate: (scope?: WorkspaceScopePayload | null) => Promise<string | null>;
    onFork: (sourceChatId: string, beforeUserIndex: number) => Promise<string | null>;
    onNew: () => void;
    onNewInProject: (projectPath: string, projectName: string) => void;
    onSelect: (key: string) => void;
    onBackToChat: () => void;
    onTogglePin: (key: string) => void;
    onToggleArchive: (key: string) => void;
    onToggleArchived: () => void;
    onToggleGroup: (groupId: string) => void;
    onRequestRename: (key: string, label: string) => void;
    onConfirmRename: (title: string) => void;
    onRequestRenameProject: (key: string, label: string) => void;
    onConfirmProjectRename: (title: string) => void;
    onRequestDelete: (key: string, label: string) => Promise<void>;
    onConfirmDelete: () => Promise<void>;
    pendingDelete: { key: string; label: string; automations?: SessionAutomationJob[] } | null;
    pendingRename: { key: string; label: string } | null;
    pendingProjectRename: { key: string; label: string } | null;
    onSelectSearchResult: (key: string) => void;
    onOpenSessionSearch: () => void;
  };
  utility: {
    onOpen: (view: Extract<ShellView, "apps" | "automations" | "skills" | "projects">) => void;
    onOpenSettings: (section?: SettingsSectionKey) => void;
    onOpenModelSettings: () => void;
    onSettingsIntent: () => void;
    onSettingsSectionChange: (section: SettingsSectionKey) => void;
  };
}

export interface UseChatActionsArgs {
  sessions: ChatSummary[];
  activeKey: string | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  sidebarState: SidebarStatePayload;
  updateSidebarState: (
    updater: (current: SidebarStatePayload) => SidebarStatePayload,
  ) => Promise<void>;
  createChat: CreateChatFn;
  forkChat: ForkChatFn;
  deleteChat: DeleteChatFn;
  getSessionAutomations: GetSessionAutomationsFn;
  navigate: (route: { view: ShellView; activeKey: string | null; settingsSection: SettingsSectionKey }) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  onWorkspaceErrorCleared: () => void;
  setWorkspaceOverrides: (
    updater: (current: Record<string, WorkspaceScopePayload>) => Record<string, WorkspaceScopePayload>,
  ) => void;
  setDraftWorkspaceScope: (scope: WorkspaceScopePayload | null) => void;
  setUpdatedChatIds: (
    updater: (current: Set<string>) => Set<string>,
  ) => void;
  workspaces: { default_scope?: WorkspaceScopePayload | null } | null;
  loadSettingsView: () => Promise<unknown>;
  dialogs: {
    pendingDelete: { key: string; label: string; automations?: SessionAutomationJob[] } | null;
    pendingRename: { key: string; label: string } | null;
    pendingProjectRename: { key: string; label: string } | null;
    requestDelete: (payload: { key: string; label: string; automations?: SessionAutomationJob[] }) => void;
    cancelDelete: () => void;
    requestRename: (payload: { key: string; label: string }) => void;
    cancelRename: () => void;
    requestProjectRename: (payload: { key: string; label: string }) => void;
    cancelProjectRename: () => void;
    openSessionSearch: () => void;
    closeSessionSearch: () => void;
  };
  normalizeWorkspaceScope: (scope: WorkspaceScopePayload) => WorkspaceScopePayload;
}


export function useChatActions(args: UseChatActionsArgs): ActionsApi {
  const { t } = useTranslation();
  const {
    sessions,
    activeKey,
    activeWorkspaceScope,
    sidebarState,
    updateSidebarState,
    createChat,
    forkChat,
    onWorkspaceErrorCleared,
    deleteChat,
    getSessionAutomations,
    navigate,
    setMobileSidebarOpen,
    setWorkspaceOverrides,
    setDraftWorkspaceScope,
    setUpdatedChatIds,
    workspaces,
    dialogs,
    normalizeWorkspaceScope,
  } = args;

  const onSelectChat = useCallback(
    (key: string) => {
      const selected = sessions.find((session) => session.key === key);
      const selectedChatId = selected?.chatId;
      if (selectedChatId) {
        setUpdatedChatIds((current) => {
          if (!current.has(selectedChatId)) return current;
          const next = new Set(current);
          next.delete(selectedChatId);
          return next;
        });
      }
      if (selected?.workspaceScope) {
        setDraftWorkspaceScope(normalizeWorkspaceScope(selected.workspaceScope));
      } else {
        setDraftWorkspaceScope(null);
      }
      onWorkspaceErrorCleared();
      navigate({ view: "chat", activeKey: key, settingsSection: "overview" });
      setMobileSidebarOpen(false);
    },
    [sessions, navigate, setUpdatedChatIds, setDraftWorkspaceScope, onWorkspaceErrorCleared, setMobileSidebarOpen, normalizeWorkspaceScope],
  );

  const onCreateChat = useCallback(
    async (workspaceScope?: WorkspaceScopePayload | null) => {
      try {
        const scope = workspaceScope ?? activeWorkspaceScope;
        const chatId = await createChat(scope);
        navigate({
          view: "chat",
          activeKey: `websocket:${chatId}`,
          settingsSection: "overview",
        });
        setMobileSidebarOpen(false);
        if (scope) {
          setWorkspaceOverrides((current) => ({
            ...current,
            [chatId]: normalizeWorkspaceScope(scope),
          }));
        }
        return chatId;
      } catch (e) {
        console.error("Failed to create chat", e);
        // workspace_scope_rejected errors are surfaced by useWorkspaceScope's onError listener
        return null;
      }
    },
    [activeWorkspaceScope, createChat, navigate, setMobileSidebarOpen, onWorkspaceErrorCleared, setWorkspaceOverrides, normalizeWorkspaceScope, t],
  );

  const onForkChat = useCallback(
    async (sourceChatId: string, beforeUserIndex: number) => {
      try {
        const sourceSession = sessions.find((session) => session.chatId === sourceChatId);
        const sourceTitle = sourceSession
          ? (sidebarState.title_overrides[sourceSession.key] ?? sourceSession.title ?? "")
          : "";
        const chatId = await forkChat(
          sourceChatId,
          beforeUserIndex,
          t("chat.forkTitle", { title: sourceTitle }),
        );
        navigate({
          view: "chat",
          activeKey: `websocket:${chatId}`,
          settingsSection: "overview",
        });
        setMobileSidebarOpen(false);
        return chatId;
      } catch (e) {
        console.error("Failed to fork chat", e);
        return null;
      }
    },
    [forkChat, navigate, sessions, sidebarState.title_overrides, setMobileSidebarOpen, t],
  );

  const onNewChat = useCallback(() => {
    navigate(defaultShellRoute());
    setDraftWorkspaceScope(null);
    onWorkspaceErrorCleared();
    dialogs.closeSessionSearch();
    setMobileSidebarOpen(false);
  }, [navigate, setDraftWorkspaceScope, onWorkspaceErrorCleared, dialogs, setMobileSidebarOpen]);

  const onNewChatInProject = useCallback(
    (projectPath: string, projectName: string) => {
      const base = workspaces?.default_scope ?? activeWorkspaceScope;
      const trimmed = projectPath.trim();
      if (!base || !trimmed) {
        onNewChat();
        return;
      }
      navigate(defaultShellRoute());
      setDraftWorkspaceScope(normalizeWorkspaceScope({
        project_path: trimmed,
        project_name: projectName || "",
        access_mode: base.access_mode,
        restrict_to_workspace: base.access_mode === "restricted",
      }));
      onWorkspaceErrorCleared();
      setMobileSidebarOpen(false);
    },
    [activeWorkspaceScope, navigate, onNewChat, workspaces?.default_scope, setDraftWorkspaceScope, onWorkspaceErrorCleared, setMobileSidebarOpen, normalizeWorkspaceScope],
  );

  const onSelectSearchResult = useCallback(
    (key: string) => {
      dialogs.closeSessionSearch();
      onSelectChat(key);
    },
    [dialogs, onSelectChat],
  );

  const onOpenSessionSearch = useCallback(() => {
    setMobileSidebarOpen(false);
    dialogs.openSessionSearch();
  }, [setMobileSidebarOpen, dialogs]);

  const onTogglePin = useCallback(
    (key: string) => {
      void updateSidebarState((current) => {
        const pinned = new Set(current.pinned_keys);
        if (pinned.has(key)) pinned.delete(key);
        else pinned.add(key);
        return { ...current, pinned_keys: Array.from(pinned) };
      });
    },
    [updateSidebarState],
  );

  const onToggleArchive = useCallback(
    (key: string) => {
      void updateSidebarState((current) => {
        const archived = new Set(current.archived_keys);
        const pinned = current.pinned_keys.filter((item) => item !== key);
        if (archived.has(key)) archived.delete(key);
        else archived.add(key);
        return {
          ...current,
          pinned_keys: pinned,
          archived_keys: Array.from(archived),
        };
      });
      if (activeKey === key && !sidebarState.archived_keys.includes(key)) {
        const archived = new Set([...sidebarState.archived_keys, key]);
        const next = sessions.find((session) => !archived.has(session.key));
        navigate({ view: "chat", activeKey: next?.key ?? null, settingsSection: "overview" });
      }
    },
    [activeKey, navigate, sessions, sidebarState.archived_keys, updateSidebarState],
  );

  const onToggleArchived = useCallback(() => {
    void updateSidebarState((current) => ({
      ...current,
      view: {
        ...current.view,
        show_archived: !current.view.show_archived,
      },
    }));
  }, [updateSidebarState]);

  const onToggleGroup = useCallback(
    (groupId: string) => {
      void updateSidebarState((current) => {
        const collapsedGroups = { ...current.collapsed_groups };
        if (groupId === "workspace:chats" || groupId === "date:all") {
          if (collapsedGroups[groupId] === false) {
            delete collapsedGroups[groupId];
          } else {
            collapsedGroups[groupId] = false;
          }
          return {
            ...current,
            collapsed_groups: collapsedGroups,
          };
        }
        if (collapsedGroups[groupId]) {
          delete collapsedGroups[groupId];
        } else {
          collapsedGroups[groupId] = true;
        }
        return {
          ...current,
          collapsed_groups: collapsedGroups,
        };
      });
    },
    [updateSidebarState],
  );

  const onRequestRename = useCallback(
    (key: string, label: string) => dialogs.requestRename({ key, label }),
    [dialogs],
  );

  const onConfirmRename = useCallback(
    (title: string) => {
      if (!dialogs.pendingRename) return;
      const target = dialogs.pendingRename;
      const key = target.key;
      dialogs.cancelRename();
      void updateSidebarState((current) => {
        const titleOverrides = { ...current.title_overrides };
        const cleaned = title.trim();
        if (cleaned) titleOverrides[key] = cleaned;
        else delete titleOverrides[key];
        return { ...current, title_overrides: titleOverrides };
      });
    },
    [dialogs, updateSidebarState],
  );

  const onRequestRenameProject = useCallback(
    (key: string, label: string) => dialogs.requestProjectRename({ key, label }),
    [dialogs],
  );

  const onConfirmProjectRename = useCallback(
    (title: string) => {
      if (!dialogs.pendingProjectRename) return;
      const target = dialogs.pendingProjectRename;
      const key = target.key;
      dialogs.cancelProjectRename();
      void updateSidebarState((current) => {
        const projectNameOverrides = { ...current.project_name_overrides };
        const cleaned = title.trim();
        if (cleaned) projectNameOverrides[key] = cleaned;
        else delete projectNameOverrides[key];
        return { ...current, project_name_overrides: projectNameOverrides };
      });
    },
    [dialogs, updateSidebarState],
  );

  const onRequestDelete = useCallback(
    async (key: string, label: string) => {
      let automations: SessionAutomationJob[] = [];
      try {
        automations = await getSessionAutomations(key);
      } catch {
        // delete remains protected by the backend block
      }
      dialogs.requestDelete({ key, label, automations });
    },
    [getSessionAutomations, dialogs],
  );

  const onConfirmDelete = useCallback(async () => {
    const target = dialogs.pendingDelete;
    if (!target) return;
    const key = target.key;
    const hasAutomations = (target.automations?.length ?? 0) > 0;
    const deletingActive = activeKey === key;
    const currentIndex = sessions.findIndex((s) => s.key === key);
    const fallbackKey = deletingActive
      ? (sessions[currentIndex + 1]?.key ?? sessions[currentIndex - 1]?.key ?? null)
      : activeKey;
    try {
      const result = await deleteChat(
        key,
        hasAutomations ? { deleteAutomations: true } : undefined,
      );
      if (result.blocked_by_automations) {
        dialogs.requestDelete({
          ...target,
          automations: result.automations ?? [],
        });
        return;
      }
      dialogs.cancelDelete();
      if (deletingActive) {
        navigate({
          view: "chat",
          activeKey: fallbackKey,
          settingsSection: "overview",
        });
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  }, [dialogs, deleteChat, activeKey, navigate, sessions]);

  const onBackToChat = useCallback(() => {
    setMobileSidebarOpen(false);
    const nextKey = (() => {
      if (!activeKey) return null;
      if (sessions.some((session) => session.key === activeKey)) return activeKey;
      return sessions[0]?.key ?? null;
    })();
    navigate({
      view: "chat",
      activeKey: nextKey,
      settingsSection: "overview",
    });
  }, [activeKey, navigate, sessions, setMobileSidebarOpen]);

  const onOpenUtility = useCallback(
    (view: Extract<ShellView, "apps" | "automations" | "skills" | "projects">) => {
      dialogs.closeSessionSearch();
      navigate({
        view,
        activeKey,
        settingsSection: view === "projects" ? "overview" : view,
      });
      setMobileSidebarOpen(false);
    },
    [dialogs, navigate, activeKey, setMobileSidebarOpen],
  );

  const onOpenSettings = useCallback(
    (section: SettingsSectionKey = "overview") => {
      dialogs.closeSessionSearch();
      navigate({ view: "settings", activeKey, settingsSection: section });
      setMobileSidebarOpen(false);
    },
    [dialogs, navigate, activeKey, setMobileSidebarOpen],
  );

  const onOpenModelSettings = useCallback(() => onOpenSettings("models"), [onOpenSettings]);

  const onSettingsIntent = useCallback(() => {
    void args.loadSettingsView();
  }, [args]);

  const onSettingsSectionChange = useCallback(
    (section: SettingsSectionKey) => {
      navigate({
        view: shellViewForSettingsSection(section),
        activeKey,
        settingsSection: section,
      });
    },
    [navigate, activeKey],
  );

  return {
    chat: {
      onCreate: onCreateChat,
      onFork: onForkChat,
      onNew: onNewChat,
      onNewInProject: onNewChatInProject,
      onSelect: onSelectChat,
      onBackToChat,
      onTogglePin,
      onToggleArchive,
      onToggleArchived,
      onToggleGroup,
      onRequestRename,
      onConfirmRename,
      onRequestRenameProject,
      onConfirmProjectRename,
      onRequestDelete,
      onConfirmDelete,
      pendingDelete: dialogs.pendingDelete,
      pendingRename: dialogs.pendingRename,
      pendingProjectRename: dialogs.pendingProjectRename,
      onSelectSearchResult,
      onOpenSessionSearch,
    },
    utility: {
      onOpen: onOpenUtility,
      onOpenSettings,
      onOpenModelSettings,
      onSettingsIntent,
      onSettingsSectionChange,
    },
  };
}
