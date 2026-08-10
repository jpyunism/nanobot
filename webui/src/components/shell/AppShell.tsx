import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { MainView } from "@/components/shell/MainView";
import { Overlays } from "@/components/shell/Overlays";
import { ShellNativeHeader } from "@/components/shell/ShellNativeHeader";
import { SidebarLayout } from "@/components/shell/SidebarLayout";
import { useShellBootstrap } from "@/hooks/useShellBootstrap";
import { useClient } from "@/providers/ClientProvider";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { displayTitle } from "@/lib/chat-groups";
import type { RuntimeSurface } from "@/lib/types";

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
  const { client, token } = useClient();
  const { theme, toggle } = useTheme();
  const shell = useShellBootstrap({
    client,
    token,
    runtimeSurface,
    onModelNameChange,
  });
  const { t } = useTranslation();

  return (
    <ThemeProvider theme={theme}>
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          shell.showHostChrome && "host-window-shell",
        )}
      >
        {shell.showHostChrome ? (
          <ShellNativeHeader
            showMainSidebar={shell.showMainSidebar}
            showChat={shell.view === "chat"}
            toggleHostSidebar={shell.toggleHostSidebar}
            openHostSidebarPreview={shell.openHostSidebarPreview}
            scheduleHostSidebarPreviewClose={shell.scheduleHostSidebarPreviewClose}
            hostSidebarOpen={shell.hostSidebarOpen}
          />
        ) : null}
        <div className="relative flex h-full w-full overflow-hidden">
          <SidebarLayout
            showHostChrome={shell.showHostChrome}
            showMainSidebar={shell.showMainSidebar}
            hostSidebarOpen={shell.hostSidebarOpen}
            hostSidebarPreviewOpen={shell.showHostSidebarPreview}
            hostSidebarFlowWidth={shell.hostSidebarFlowWidth}
            renderHostSidebarFlowContent={shell.renderHostSidebarFlowContent}
            mobileSidebarOpen={shell.mobileSidebarOpen}
            setMobileSidebarOpen={shell.setMobileSidebarOpen}
            closeHostSidebar={shell.closeHostSidebar}
            openHostSidebar={shell.openHostSidebar}
            openHostSidebarPreview={shell.openHostSidebarPreview}
            scheduleHostSidebarPreviewClose={shell.scheduleHostSidebarPreviewClose}
            closeMobileSidebar={shell.closeMobileSidebar}
            sidebarProps={shell.sidebarProps}
          />

          {shell.dialogs.sessionSearchOpen ? (
            <Suspense fallback={null}>
              <SessionSearchDialog
                open
                onOpenChange={(open) =>
                  open
                    ? shell.dialogs.openSessionSearch()
                    : shell.dialogs.closeSessionSearch()
                }
                sessions={shell.sessions}
                activeKey={shell.activeKey}
                loading={shell.loading}
                titleOverrides={shell.sidebarState.title_overrides}
                onSelect={shell.onSelectSearchResult}
              />
            </Suspense>
          ) : null}

          <MainView
            view={shell.view}
            session={shell.activeSession}
            title={
              shell.activeSession
                ? displayTitle(shell.activeSession, shell.sidebarState.title_overrides, "")
                : ""
            }
            settingsInitialSection={shell.settingsInitialSection}
            settingsSnapshot={shell.settingsSnapshot}
            skills={shell.skills}
            workspaces={shell.workspaces}
            activeWorkspaceScope={shell.activeWorkspaceScope}
            activeChatRunning={shell.activeChatRunning}
            workspaceError={shell.workspaceError}
            hostChromeInset={shell.showHostChrome}
            isRestarting={shell.engineRestart.isRestarting}
            onToggleSidebar={shell.toggleSidebar}
            onNewChat={shell.onNewChat}
            onOpenResearch={shell.onOpenResearch}
            onCreateChat={shell.onCreateChat}
            onForkChat={shell.onForkChat}
            onTurnEnd={shell.onTurnEnd}
            theme={theme}
            onToggleTheme={toggle}
            hostChromeTitleInset={shell.hostSidebarCollapsed}
            onWorkspaceScopeChange={shell.applyWorkspaceScope}
            onOpenModelSettings={shell.chatOnOpenModelSettings}
            onBackToChat={shell.onBackToChat}
            onModelNameChange={onModelNameChange}
            onSettingsChange={shell.setSettingsSnapshot}
            onWorkspaceSettingsChange={shell.refreshWorkspaces}
            onSectionChange={shell.chatOnSettingsSectionChange}
            onLogout={onLogout}
            onRestart={shell.engineRestart.onRestart}
            onNativeEngineRestart={onNativeEngineRestart}
            showSidebar={shell.view === "settings"}
            todoSlug={shell.todoSlug}
            onOpenTodoSlug={shell.onOpenTodoSlug}
            todos={shell.todos}
            agenda={shell.agenda}
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
          pendingDelete={shell.dialogs.pendingDelete}
          pendingRename={shell.dialogs.pendingRename}
          pendingProjectRename={shell.dialogs.pendingProjectRename}
          cancelDelete={shell.dialogs.cancelDelete}
          cancelRename={shell.dialogs.cancelRename}
          cancelProjectRename={shell.dialogs.cancelProjectRename}
          onConfirmDelete={shell.onConfirmDelete}
          onConfirmRename={shell.onConfirmRename}
          onConfirmProjectRename={shell.onConfirmProjectRename}
          projectRenameTitle={t("chat.renameProjectTitle")}
          projectRenameDescription={t("chat.renameProjectDescription")}
          projectRenamePlaceholder={t("chat.renameProjectPlaceholder")}
          restartToast={shell.engineRestart.toast}
          visiblePairingRequests={shell.pairing.visibleRequests}
          pairingBusyCode={shell.pairing.busyCode}
          pairingError={shell.pairing.error}
          onPairingApprove={(code) =>
            void shell.pairing.onPairingAction("approve", code)
          }
          onDismissPairingRequest={shell.pairing.onDismissPairingRequest}
        />
      </div>
    </ThemeProvider>
  );
}
