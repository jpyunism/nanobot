import { useMemo } from "react";
import type { ChatSummary, SidebarStatePayload, WorkspacesPayload } from "@/lib/types";
import type { ActionsApi } from "@/hooks/useChatActions";
import { useProjectNames } from "@/hooks/useProjectNames";

type Args = {
  sessions: ChatSummary[];
  activeKey: string | null;
  loading: boolean;
  view: "chat" | "settings" | "apps" | "automations" | "skills" | "projects" | "workspace";
  sidebarState: SidebarStatePayload;
  workspaces: WorkspacesPayload | null;
  runningChatIdList: string[];
  updatedChatIdList: string[];
  chatActions: ActionsApi["chat"];
  utility: ActionsApi["utility"];
  onOpenUtility: ActionsApi["utility"]["onOpen"];
  token: string;
};

export function useSidebarProps({
  sessions,
  activeKey,
  loading,
  view,
  sidebarState,
  workspaces,
  runningChatIdList,
  updatedChatIdList,
  chatActions,
  utility,
  onOpenUtility,
  token,
}: Args) {
  const projectNameOverrides = useProjectNames(
    "",
    token,
    sidebarState.project_name_overrides,
  );
  return useMemo(
    () => ({
      sessions,
      activeKey,
      loading,
      onNewChat: chatActions.onNew,
      onSelect: chatActions.onSelect,
      onRequestDelete: chatActions.onRequestDelete,
      onTogglePin: chatActions.onTogglePin,
      onRequestRename: chatActions.onRequestRename,
      onToggleArchive: chatActions.onToggleArchive,
      onToggleGroup: chatActions.onToggleGroup,
      onRequestRenameProject: chatActions.onRequestRenameProject,
      onNewChatInProject: chatActions.onNewInProject,
      onOpenSettings: utility.onOpenSettings,
      onOpenApps: () => onOpenUtility("apps"),
      onOpenAutomations: () => onOpenUtility("automations"),
      onOpenSkills: () => onOpenUtility("skills"),
      onOpenProjects: () => onOpenUtility("projects"),
      onOpenWorkspace: () => onOpenUtility("workspace"),
      onSettingsIntent: utility.onSettingsIntent,
      onOpenSearch: chatActions.onOpenSessionSearch,
      activeUtility:
        view === "apps" ||
        view === "automations" ||
        view === "skills" ||
        view === "projects" ||
        view === "workspace"
          ? view
          : null,
      onToggleArchived: chatActions.onToggleArchived,
      pinnedKeys: sidebarState.pinned_keys,
      archivedKeys: sidebarState.archived_keys,
      titleOverrides: sidebarState.title_overrides,
      projectNameOverrides,
      collapsedGroups: sidebarState.collapsed_groups,
      runningChatIds: runningChatIdList,
      updatedChatIds: updatedChatIdList,
      viewState: sidebarState.view,
      showArchived: sidebarState.view.show_archived,
      archivedCount: sidebarState.archived_keys.length,
      defaultWorkspacePath: workspaces?.default_scope.project_path ?? null,
    }),
    [
      sessions,
      activeKey,
      loading,
      view,
      sidebarState,
      workspaces,
      runningChatIdList,
      updatedChatIdList,
      chatActions,
      utility,
      onOpenUtility,
      projectNameOverrides,
    ],
  );
}
