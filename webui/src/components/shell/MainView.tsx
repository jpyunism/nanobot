import { Suspense, lazy, type ReactNode } from "react";
import { ThreadShell } from "@/components/thread/ThreadShell";
import { ProjectsSurface } from "@/components/projects/ProjectsSurface";
import type { ChatSummary, SettingsPayload, WorkspacesPayload, WorkspaceScopePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const SettingsView = lazy(() =>
  import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })),
);

type ThreadProps = React.ComponentProps<typeof ThreadShell>;
type SettingsProps = React.ComponentProps<typeof SettingsView>;

export type MainView =
  | "chat"
  | "settings"
  | "apps"
  | "automations"
  | "skills"
  | "projects";

type Args = {
  view: MainView;
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

function ChatSurface(props: Args) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        props.view !== "chat" && "hidden",
      )}
    >
      <ThreadShell
        session={props.session}
        title={props.title}
        onToggleSidebar={props.onToggleSidebar}
        onNewChat={props.onNewChat}
        onCreateChat={props.onCreateChat}
        onForkChat={props.onForkChat}
        onTurnEnd={props.onTurnEnd}
        theme={props.theme}
        onToggleTheme={props.onToggleTheme}
        hideSidebarToggleForHostChrome
        hostChromeTitleInset={props.hostChromeTitleInset}
        hideHeader={false}
        workspaceScope={props.activeWorkspaceScope}
        workspaceDefaultScope={props.workspaces?.default_scope ?? null}
        workspaceControls={props.workspaces?.controls ?? null}
        workspaceScopeDisabled={props.activeChatRunning}
        workspaceError={props.workspaceError}
        onWorkspaceScopeChange={props.onWorkspaceScopeChange}
        settingsSnapshot={props.settingsSnapshot}
        onOpenModelSettings={props.onOpenModelSettings}
        skills={props.skills}
      />
    </div>
  );
}

function SettingsSurface(props: Args) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        props.view === "chat" && "hidden",
      )}
    >
      <Suspense fallback={props.fallback}>
        <SettingsView
          theme={props.theme}
          initialSection={props.settingsInitialSection}
          initialSettings={props.settingsSnapshot}
          showSidebar={props.showSidebar}
          onToggleTheme={props.onToggleTheme}
          onBackToChat={props.onBackToChat}
          onModelNameChange={props.onModelNameChange}
          onSettingsChange={props.onSettingsChange}
          skills={props.skills}
          onWorkspaceSettingsChange={props.onWorkspaceSettingsChange}
          onSectionChange={props.onSectionChange}
          onLogout={props.onLogout}
          onRestart={props.onRestart}
          onNativeEngineRestart={props.onNativeEngineRestart}
          isRestarting={props.isRestarting}
          hostChromeInset={props.hostChromeInset}
        />
      </Suspense>
    </div>
  );
}

export function MainView(props: Args) {
  return (
    <main
      className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {props.view === "chat" ? (
        <ChatSurface {...props} />
      ) : props.view === "projects" ? (
        <ProjectsSurface />
      ) : (
        <SettingsSurface {...props} />
      )}
    </main>
  );
}

