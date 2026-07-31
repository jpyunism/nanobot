import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { MainView } from "@/components/shell/MainView";
import { Overlays } from "@/components/shell/Overlays";
import { ShellNativeHeader } from "@/components/shell/ShellNativeHeader";
import { SidebarLayout } from "@/components/shell/SidebarLayout";

import { useSessions } from "@/hooks/useSessions";
import { useDeferredTitleRefresh } from "@/hooks/useDeferredTitleRefresh";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useShellRoute } from "@/hooks/useShellRoute";
import { useChatActions } from "@/hooks/useChatActions";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEngineRestart } from "@/hooks/useEngineRestart";
import { useMissingSessionRedirect } from "@/hooks/useMissingSessionRedirect";
import { useNativeHostClass } from "@/hooks/useNativeHostClass";
import { usePairing } from "@/hooks/usePairing";
import { useRunTracker } from "@/hooks/useRunTracker";
import { useRuntimeModelSync } from "@/hooks/useRuntimeModelSync";
import { useSettingsSnapshot } from "@/hooks/useSettingsSnapshot";
import { useShellShortcuts } from "@/hooks/useShellShortcuts";
import { useSkills } from "@/hooks/useSkills";
import { useThreadSessionSync } from "@/hooks/useThreadSessionSync";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { useBootstrap } from "@/hooks/useBootstrap";
import { useHostSidebarLayout } from "@/hooks/useHostSidebarLayout";
import { cn } from "@/lib/utils";
import { displayTitle } from "@/lib/chat-groups";
import { useDialogsState } from "@/lib/dialogs";
import { markRestartStarted } from "@/lib/routing";
import { normalizeWorkspaceScope, useWorkspaceScope } from "@/hooks/useWorkspaceScope";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import type {
  ChatSummary,
  RuntimeSurface,
} from "@/lib/types";
import { createRuntimeHost } from "@/lib/runtime";


const loadSettingsView = () => import("@/components/settings/SettingsView");
const SessionSearchDialog = lazy(async () => {
  const module = await import("@/components/SessionSearchDialog");
  return { default: module.SessionSearchDialog };
});

function SurfaceLoadingFallback() {
  return (
    <div
      aria-busy="true"
      className="flex h-full w-full flex-col gap-5 px-5 py-8 sm:px-8 lg:px-12"
    >
      <span className="sr-only">Loading</span>
      <div className="h-4 w-20 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      <div className="h-9 w-48 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      <div className="mt-4 h-12 w-full max-w-3xl animate-pulse rounded-md bg-muted/55 motion-reduce:animate-none" />
      <div className="h-28 w-full max-w-3xl animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}


export default function App() {
  const boot = useBootstrap();

  if (boot.state.status === "loading") {
    return <boot.LoadingView />;
  }
  if (boot.state.status === "auth") {
    return <boot.AuthView />;
  }
  if (boot.state.status === "error") {
    return <boot.ErrorView />;
  }
  const state = boot.state;

  const handleNativeEngineRestart = async (): Promise<string> => {
    const runtimeHost = createRuntimeHost(state.runtimeSurface);
    if (!runtimeHost.restartEngine) {
      throw new Error("native engine restart is unavailable");
    }
    markRestartStarted();
    try {
      await runtimeHost.restartEngine();
      const refreshed = await boot.refreshReady(
        state.client,
        state.runtimeSurface,
      );
      return refreshed.token;
    } finally {
      // routing module already removes its keys via maybeRestoreRestartHash
    }
  };

  return (
    <ClientProvider
      client={state.client}
      token={state.token}
      modelName={state.modelName}
      ingressLimits={state.ingressLimits}
    >
      <Shell
        runtimeSurface={state.runtimeSurface}
        onModelNameChange={boot.setModelName}
        onLogout={boot.logout}
        onNativeEngineRestart={handleNativeEngineRestart}
      />
    </ClientProvider>
  );
}

function Shell({
  runtimeSurface,
  onModelNameChange,
  onLogout,
  onNativeEngineRestart,
}: {
  runtimeSurface: RuntimeSurface;
  onModelNameChange: (modelName: string | null) => void;
  onLogout: () => void;
  onNativeEngineRestart: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const { client, token } = useClient();
  const { theme, toggle } = useTheme();
  const {
    sessions,
    loading,
    refresh,
    createChat,
    forkChat,
    deleteChat,
    getSessionAutomations,
  } = useSessions();
  const { state: sidebarState, update: updateSidebarState } =
    useSidebarState(sessions, !loading);
  const {
    activeKey,
    view,
    settingsSection: settingsInitialSection,
    navigate,
  } = useShellRoute();
  const dialogs = useDialogsState();
  const {
    sessionSearchOpen,
    pendingDelete,
    pendingRename,
    pendingProjectRename,
    openSessionSearch,
    closeSessionSearch,
    cancelDelete,
    cancelRename,
    cancelProjectRename,
  } = dialogs;
  const pairing = usePairing(token);
  const {
    visibleRequests: visiblePairingRequests,
    busyCode: pairingBusyCode,
    error: pairingError,
    onPairingAction,
    onDismissPairingRequest,
  } = pairing;
  const skills = useSkills(token);
  const settingsSnapshotApi = useSettingsSnapshot({ token });
  const { snapshot: settingsSnapshot, setSnapshot: setSettingsSnapshot } = settingsSnapshotApi;
  const activeChatIdRef = useRef<string | null>(null);
  const runTracker = useRunTracker({
    client,
    sessions,
    loading,
    activeChatIdRef,
  });
  const {
    runningChatIds: runningChatIdList,
    updatedChatIds: updatedChatIdList,
    setActiveChatId: setActiveChatIdTracker,
    setUpdatedChatIds,
  } = runTracker;
  const runningChatIds = useMemo(() => new Set(runningChatIdList), [runningChatIdList]);
  const effectiveRuntimeSurface =
    settingsSnapshot?.surface ?? settingsSnapshot?.runtime_surface ?? runtimeSurface;
  const showHostChrome = effectiveRuntimeSurface === "native";
  const showMainSidebar = view !== "settings";
  const sidebarLayout = useHostSidebarLayout({ showHostChrome, showMainSidebar });
  const {
    hostSidebarOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    openPreview: openHostSidebarPreview,
    schedulePreviewClose: scheduleHostSidebarPreviewClose,
    closeHost: closeHostSidebar,
    openHost: openHostSidebar,
    toggleHost: toggleHostSidebar,
    closeMobile: closeMobileSidebar,
    toggleSidebar,
    hostSidebarCollapsed,
    showHostSidebarPreview,
    hostSidebarFlowWidth,
    renderHostSidebarFlowContent,
  } = sidebarLayout;

  useEffect(() => {
    const reset = () => setWorkspaceError(null);
    window.addEventListener("hashchange", reset);
    return () => window.removeEventListener("hashchange", reset);
  }, []);

  const activeSession = useMemo<ChatSummary | null>(() => {
    if (!activeKey) return null;
    return sessions.find((s) => s.key === activeKey) ?? null;
  }, [sessions, activeKey]);
  const activeChatId = activeSession?.chatId ?? null;
  const activeChatRunning = activeChatId ? runningChatIds.has(activeChatId) : false;
  const engineRestart = useEngineRestart({
    client,
    activeSession,
    defaultChatId: client.defaultChatId,
  });
  const workspaceScopeApi = useWorkspaceScope({
    client,
    token,
    activeSession,
    activeChatId,
    activeChatRunning,
    loading,
    shouldClearDraftScope: view === "chat" && !activeKey,
  });
  const {
    workspaces,
    error: workspaceError,
    setError: setWorkspaceError,
    activeWorkspaceScope,
    refresh: refreshWorkspaces,
    apply: applyWorkspaceScope,
    setDraftScope: setDraftWorkspaceScope,
    setOverrides: setWorkspaceOverrides,
    pruneOverrides: pruneWorkspaceOverrides,
  } = workspaceScopeApi;
  useThreadSessionSync({
    client,
    activeChatId,
    setActiveChatIdTracker,
    setUpdatedChatIds,
  });

  useEffect(() => {
    if (loading) return;
    const knownChatIds = new Set(sessions.map((session) => session.chatId));
    pruneWorkspaceOverrides(knownChatIds);
  }, [loading, sessions, pruneWorkspaceOverrides]);

  useMissingSessionRedirect({
    activeKey,
    loading,
    sessions,
    view,
    settingsSection: settingsInitialSection,
    navigate,
  });

  const chatActions = useChatActions({
    sessions,
    activeKey,
    activeWorkspaceScope,
    sidebarState,
    updateSidebarState,
    createChat,
    forkChat,
    deleteChat,
    getSessionAutomations,
    navigate,
    setMobileSidebarOpen,
    onWorkspaceErrorCleared: () => setWorkspaceError(null),
    setWorkspaceOverrides,
    setDraftWorkspaceScope,
    setUpdatedChatIds,
    workspaces,
    loadSettingsView,
    dialogs,
    normalizeWorkspaceScope,
  });
  const {
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
      onSelectSearchResult,
      onOpenSessionSearch,
    },
    utility: {
      onOpen: onOpenUtility,
      onOpenSettings: chatOnOpenSettings,
      onOpenModelSettings: chatOnOpenModelSettings,
      onSettingsIntent: chatOnSettingsIntent,
      onSettingsSectionChange: chatOnSettingsSectionChange,
    },
  } = chatActions;

  useShellShortcuts({ onNewChat, onOpenSessionSearch });

  const onTurnEnd = useDeferredTitleRefresh(activeSession, refresh);

  useDocumentTitle({ view, activeSession, sidebarState });

  useRuntimeModelSync({ client, onModelNameChange });

  useNativeHostClass(showHostChrome);

  const sidebarProps = {
    sessions,
    activeKey,
    loading,
    onNewChat,
    onSelect: onSelectChat,
    onRequestDelete,
    onTogglePin,
    onRequestRename,
    onToggleArchive,
    onToggleGroup,
    onRequestRenameProject,
    onNewChatInProject,
    onOpenSettings: chatOnOpenSettings,
    onOpenApps: () => onOpenUtility("apps"),
    onOpenAutomations: () => onOpenUtility("automations"),
    onOpenSkills: () => onOpenUtility("skills"),
    onSettingsIntent: chatOnSettingsIntent,
    onOpenSearch: onOpenSessionSearch,
    activeUtility: view === "apps" || view === "automations" || view === "skills" ? view : null,
    onToggleArchived,
    pinnedKeys: sidebarState.pinned_keys,
    archivedKeys: sidebarState.archived_keys,
    titleOverrides: sidebarState.title_overrides,
    projectNameOverrides: sidebarState.project_name_overrides,
    collapsedGroups: sidebarState.collapsed_groups,
    runningChatIds: runningChatIdList,
    updatedChatIds: updatedChatIdList,
    viewState: sidebarState.view,
    showArchived: sidebarState.view.show_archived,
    archivedCount: sidebarState.archived_keys.length,
    defaultWorkspacePath: workspaces?.default_scope.project_path ?? null,
  };

  return (
    <ThemeProvider theme={theme}>
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          showHostChrome && "host-window-shell",
        )}
      >
        {showHostChrome ? (
          <ShellNativeHeader
            showMainSidebar={showMainSidebar}
            showChat={view === "chat"}
            toggleHostSidebar={toggleHostSidebar}
            openHostSidebarPreview={openHostSidebarPreview}
            scheduleHostSidebarPreviewClose={scheduleHostSidebarPreviewClose}
            hostSidebarOpen={hostSidebarOpen}
          />
        ) : null}
        <div className="relative flex h-full w-full overflow-hidden">
          <SidebarLayout
            showHostChrome={showHostChrome}
            showMainSidebar={showMainSidebar}
            hostSidebarOpen={hostSidebarOpen}
            hostSidebarPreviewOpen={showHostSidebarPreview}
            hostSidebarFlowWidth={hostSidebarFlowWidth}
            renderHostSidebarFlowContent={renderHostSidebarFlowContent}
            mobileSidebarOpen={mobileSidebarOpen}
            setMobileSidebarOpen={setMobileSidebarOpen}
            closeHostSidebar={closeHostSidebar}
            openHostSidebar={openHostSidebar}
            openHostSidebarPreview={openHostSidebarPreview}
            scheduleHostSidebarPreviewClose={scheduleHostSidebarPreviewClose}
            closeMobileSidebar={closeMobileSidebar}
            sidebarProps={sidebarProps}
          />

          {sessionSearchOpen ? (
            <Suspense fallback={null}>
              <SessionSearchDialog
                open
                onOpenChange={(open) => (open ? openSessionSearch() : closeSessionSearch())}
                sessions={sessions}
                activeKey={activeKey}
                loading={loading}
                titleOverrides={sidebarState.title_overrides}
                onSelect={onSelectSearchResult}
              />
            </Suspense>
          ) : null}

          <MainView
            view={view}
            session={activeSession}
            title={activeSession ? displayTitle(activeSession, sidebarState.title_overrides, "") : ""}
            settingsInitialSection={settingsInitialSection}
            settingsSnapshot={settingsSnapshot}
            skills={skills}
            workspaces={workspaces}
            activeWorkspaceScope={activeWorkspaceScope}
            activeChatRunning={activeChatRunning}
            workspaceError={workspaceError}
            hostChromeInset={showHostChrome}
            isRestarting={engineRestart.isRestarting}
            onToggleSidebar={toggleSidebar}
            onNewChat={onNewChat}
            onCreateChat={onCreateChat}
            onForkChat={onForkChat}
            onTurnEnd={onTurnEnd}
            theme={theme}
            onToggleTheme={toggle}
            hostChromeTitleInset={hostSidebarCollapsed}
            onWorkspaceScopeChange={applyWorkspaceScope}
            onOpenModelSettings={chatOnOpenModelSettings}
            onBackToChat={onBackToChat}
            onModelNameChange={onModelNameChange}
            onSettingsChange={setSettingsSnapshot}
            onWorkspaceSettingsChange={refreshWorkspaces}
            onSectionChange={chatOnSettingsSectionChange}
            onLogout={onLogout}
            onRestart={engineRestart.onRestart}
            onNativeEngineRestart={onNativeEngineRestart}
            showSidebar={view === "settings"}
            fallback={<SurfaceLoadingFallback />}
          />
        </div>

        <Overlays
          pendingDelete={pendingDelete}
          pendingRename={pendingRename}
          pendingProjectRename={pendingProjectRename}
          cancelDelete={cancelDelete}
          cancelRename={cancelRename}
          cancelProjectRename={cancelProjectRename}
          onConfirmDelete={onConfirmDelete}
          onConfirmRename={onConfirmRename}
          onConfirmProjectRename={onConfirmProjectRename}
          projectRenameTitle={t("chat.renameProjectTitle")}
          projectRenameDescription={t("chat.renameProjectDescription")}
          projectRenamePlaceholder={t("chat.renameProjectPlaceholder")}
          restartToast={engineRestart.toast}
          visiblePairingRequests={visiblePairingRequests}
          pairingBusyCode={pairingBusyCode}
          pairingError={pairingError}
          onPairingApprove={(code) => void onPairingAction("approve", code)}
          onDismissPairingRequest={onDismissPairingRequest}
        />
      </div>
    </ThemeProvider>
  );
}
