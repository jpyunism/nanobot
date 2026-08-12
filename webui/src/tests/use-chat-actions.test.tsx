import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChatActions } from "@/hooks/useChatActions";
import type { SidebarStatePayload } from "@/lib/types";

function makeSidebarState(): SidebarStatePayload {
  return {
    schema_version: 1,
    pinned_keys: [],
    archived_keys: [],
    title_overrides: {},
    project_name_overrides: {},
    tags_by_key: {},
    collapsed_groups: {},
    view: {
      density: "comfortable",
      show_previews: true,
      show_timestamps: true,
      show_archived: false,
      sort: "updated",
    },
  };
}

function makeArgs(overrides: Record<string, unknown> = {}) {
  const navigate = vi.fn();
  const updateSidebarState = vi.fn().mockResolvedValue(undefined);
  const setWorkspaceOverrides = vi.fn();
  const setDraftWorkspaceScope = vi.fn();
  const setUpdatedChatIds = vi.fn();
  const dialogs = {
    pendingDelete: null,
    pendingRename: null,
    pendingProjectRename: null,
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    requestRename: vi.fn(),
    cancelRename: vi.fn(),
    requestProjectRename: vi.fn(),
    cancelProjectRename: vi.fn(),
    openSessionSearch: vi.fn(),
    closeSessionSearch: vi.fn(),
  };
  return {
    sessions: [],
    activeKey: "websocket:abc",
    activeWorkspaceScope: null,
    sidebarState: makeSidebarState(),
    updateSidebarState,
    createChat: vi.fn(),
    forkChat: vi.fn(),
    deleteChat: vi.fn(),
    getSessionAutomations: vi.fn(),
    navigate,
    setMobileSidebarOpen: vi.fn(),
    onWorkspaceErrorCleared: vi.fn(),
    setWorkspaceOverrides,
    setDraftWorkspaceScope,
    setUpdatedChatIds,
    workspaces: null,
    loadSettingsView: vi.fn(),
    dialogs,
    normalizeWorkspaceScope: (scope: unknown) => scope as never,
    ...overrides,
  };
}

describe("useChatActions.onOpenUtility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to projects with activeKey null (no chat session key leak)", () => {
    const args = makeArgs({ activeKey: "websocket:abc" });
    const { result } = renderHook(() => useChatActions(args));

    act(() => {
      result.current.utility.onOpen("projects");
    });

    expect(args.navigate).toHaveBeenCalledWith({
      view: "projects",
      activeKey: null,
      settingsSection: "overview",
    });
  });

  it("keeps activeKey when opening other utility views", () => {
    const args = makeArgs({ activeKey: "websocket:abc" });
    const { result } = renderHook(() => useChatActions(args));

    act(() => {
      result.current.utility.onOpen("skills");
    });

    expect(args.navigate).toHaveBeenCalledWith({
      view: "skills",
      activeKey: "websocket:abc",
      settingsSection: "skills",
    });
  });
});
