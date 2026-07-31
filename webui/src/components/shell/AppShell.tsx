import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
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
import { useSidebarProps } from "@/hooks/useSidebarProps";
import { useSkills } from "@/hooks/useSkills";
import { useThreadSessionSync } from "@/hooks/useThreadSessionSync";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { useHostSidebarLayout } from "@/hooks/useHostSidebarLayout";
import { useWorkspaceScope } from "@/hooks/useWorkspaceScope";
import { cn } from "@/lib/utils";
import { displayTitle } from "@/lib/chat-groups";
import { useDialogsState } from "@/lib/dialogs";
import { useClient } from "@/providers/ClientProvider";
import type { ChatSummary, RuntimeSurface } from "@/lib/types";

const SessionSearchDialog = lazy(() =>
  import("@/components/SessionSearchDialog").then((m) => ({
    default: m.SessionSearchDialog,
  })),
);

type Args = {
  runtimeSurface: RuntimeSurface;
  onModelNameChange: (modelName: string | null) => void;
  onLogout: () => void;
  onNativeEngineRestart: () => Promise<string>;
};

export function AppShell({
  runtimeSurface,
  onModelNameChange,
  onLogout,
  onNativeEngineRestart,
}: Args) {
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
  const { snapshot: settingsSnapshot, setSnapshot: setSettingsSnapshot } =
    settingsSnapshotApi;
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

  const activeSession = useMemo<ChatSummary | null>(() => {
    if (!activeKey) return null;
    return sessions.find((s) => s.key === activeKey) ?? null;
  }, [sessions, activeKey]);
  const activeChatId = activeSession?.chatId ?? null;
  const runningChatIds = useMemo(
    () => new Set(runningChatIdList),
    [runningChatIdList],
  );
  const activeChatRunning = activeChatId
    ? runningChatIds.has(activeChatId)
    : false;
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
    loadSettingsView: () => import("@/components/settings/SettingsView"),
    dialogs,
    normalizeWorkspaceScope: (scope) => scope,
  });
  const {
    chat: {
      onCreate: onCreateChat,
      onFork: onForkChat,
      onNew: onNewChat,
      onBackToChat,
      onConfirmRename,
      onConfirmProjectRename,
      onConfirmDelete,
      onSelectSearchResult,
      onOpenSessionSearch,
    },
    utility: {
      onOpen: onOpenUtility,
      onOpenModelSettings: chatOnOpenModelSettings,
      onSettingsSectionChange: chatOnSettingsSectionChange,
    },
  } = chatActions;

  useShellShortcuts({ onNewChat, onOpenSessionSearch });

  const onTurnEnd = useDeferredTitleRefresh(activeSession, refresh);

  useDocumentTitle({ view, activeSession, sidebarState });

  useRuntimeModelSync({ client, onModelNameChange });

  useNativeHostClass(showHostChrome);

  const sidebarProps = useSidebarProps({
    sessions,
    activeKey,
    loading,
    view,
    sidebarState,
    workspaces,
    runningChatIdList,
    updatedChatIdList,
    chatActions: chatActions.chat,
    utility: chatActions.utility,
    onOpenUtility,
  });

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

          {dialogs.sessionSearchOpen ? (
            <Suspense fallback={null}>
              <SessionSearchDialog
                open
                onOpenChange={(open) =>
                  open ? dialogs.openSessionSearch() : dialogs.closeSessionSearch()
                }
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
            title={
              activeSession
                ? displayTitle(activeSession, sidebarState.title_overrides, "")
                : ""
            }
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
            fallback={
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
            }
          />
        </div>

        <Overlays
          pendingDelete={dialogs.pendingDelete}
          pendingRename={dialogs.pendingRename}
          pendingProjectRename={dialogs.pendingProjectRename}
          cancelDelete={dialogs.cancelDelete}
          cancelRename={dialogs.cancelRename}
          cancelProjectRename={dialogs.cancelProjectRename}
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
