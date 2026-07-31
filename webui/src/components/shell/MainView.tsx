import { lazy, Suspense, type ReactNode } from "react";
import { ThreadShell } from "@/components/thread/ThreadShell";
import type { ChatSummary, SettingsPayload, WorkspaceScopePayload, WorkspacesPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const SettingsView = lazy(() =>
  import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })),
);

type ThreadProps = React.ComponentProps<typeof ThreadShell>;
type SettingsProps = React.ComponentProps<typeof SettingsView>;

type Args = {
  view: "chat" | "settings" | "apps" | "automations" | "skills";
  session: ChatSummary | null;
  title: string;
  settingsInitialSection: SettingsProps["initialSection"];
  settingsSnapshot: SettingsPayload | null;
  skills: ThreadProps["skills"];
  workspaces: WorkspacesPayload | null;
  activeWorkspaceScope: WorkspaceScopePayload | null;
  activeChatRunning: boolean;
  workspaceError: string | null;
  hostChromeInset: boolean;
  isRestarting: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onCreateChat: ThreadProps["onCreateChat"];
  onForkChat: ThreadProps["onForkChat"];
  onTurnEnd: ThreadProps["onTurnEnd"];
  theme: "light" | "dark";
  onToggleTheme: () => void;
  hostChromeTitleInset: boolean;
  onWorkspaceScopeChange: (scope: WorkspaceScopePayload) => void;
  onOpenModelSettings: () => void;
  onBackToChat: () => void;
  onModelNameChange: SettingsProps["onModelNameChange"];
  onSettingsChange: (snapshot: SettingsPayload | null) => void;
  onWorkspaceSettingsChange: () => void;
  onSectionChange: SettingsProps["onSectionChange"];
  onLogout: SettingsProps["onLogout"];
  onRestart: SettingsProps["onRestart"];
  onNativeEngineRestart: SettingsProps["onNativeEngineRestart"];
  showSidebar: boolean;
  fallback: ReactNode;
};

export function MainView({
  view,
  session,
  title,
  settingsInitialSection,
  settingsSnapshot,
  skills,
  workspaces,
  activeWorkspaceScope,
  activeChatRunning,
  workspaceError,
  hostChromeInset,
  isRestarting,
  onToggleSidebar,
  onNewChat,
  onCreateChat,
  onForkChat,
  onTurnEnd,
  theme,
  onToggleTheme,
  hostChromeTitleInset,
  onWorkspaceScopeChange,
  onOpenModelSettings,
  onBackToChat,
  onModelNameChange,
  onSettingsChange,
  onWorkspaceSettingsChange,
  onSectionChange,
  onLogout,
  onRestart,
  onNativeEngineRestart,
  showSidebar,
  fallback,
}: Args) {
  return (
    <main
      className={cn(
        "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col",
          view !== "chat" && "hidden",
        )}
      >
        <ThreadShell
          session={session}
          title={title}
          onToggleSidebar={onToggleSidebar}
          onNewChat={onNewChat}
          onCreateChat={onCreateChat}
          onForkChat={onForkChat}
          onTurnEnd={onTurnEnd}
          theme={theme}
          onToggleTheme={onToggleTheme}
          hideSidebarToggleForHostChrome
          hostChromeTitleInset={hostChromeTitleInset}
          hideHeader={false}
          workspaceScope={activeWorkspaceScope}
          workspaceDefaultScope={workspaces?.default_scope ?? null}
          workspaceControls={workspaces?.controls ?? null}
          workspaceScopeDisabled={activeChatRunning}
          workspaceError={workspaceError}
          onWorkspaceScopeChange={onWorkspaceScopeChange}
          settingsSnapshot={settingsSnapshot}
          onOpenModelSettings={onOpenModelSettings}
          skills={skills}
        />
      </div>
      {view !== "chat" && (
        <div className="absolute inset-0 flex flex-col">
          <Suspense fallback={fallback}>
            <SettingsView
              theme={theme}
              initialSection={settingsInitialSection}
              initialSettings={settingsSnapshot}
              showSidebar={showSidebar}
              onToggleTheme={onToggleTheme}
              onBackToChat={onBackToChat}
              onModelNameChange={onModelNameChange}
              onSettingsChange={onSettingsChange}
              skills={skills}
              onWorkspaceSettingsChange={onWorkspaceSettingsChange}
              onSectionChange={onSectionChange}
              onLogout={onLogout}
              onRestart={onRestart}
              onNativeEngineRestart={onNativeEngineRestart}
              isRestarting={isRestarting}
              hostChromeInset={hostChromeInset}
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
