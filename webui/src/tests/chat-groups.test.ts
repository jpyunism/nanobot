import { describe, expect, it } from "vitest";

import { groupSessions } from "@/lib/chat-groups";

function makeSession(overrides: Record<string, unknown>) {
  return {
    key: `websocket:chat-${Math.random().toString(36).slice(2, 8)}`,
    chatId: "chat",
    channel: "websocket",
    createdAt: null,
    updatedAt: "2024-01-01T00:00:00Z",
    title: "Chat",
    preview: "preview",
    modelPreset: null,
    runStartedAt: null,
    workspaceScope: null,
    projectId: null,
    ...overrides,
  };
}

const labels = {
  pinned: "Pinned",
  all: "Topics",
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
  archived: "Archived",
  projects: "Projects",
  fallbackTitle: "New chat",
};

describe("groupSessions by projectId", () => {
  it("routes sessions with projectId through the project branch", () => {
    const a = makeSession({ projectId: "alpha", updatedAt: "2024-02-01T00:00:00Z" });
    const b = makeSession({ projectId: "alpha", updatedAt: "2024-01-01T00:00:00Z" });
    const c = makeSession({ projectId: "beta", updatedAt: "2024-01-15T00:00:00Z" });
    const groups = groupSessions([a, b, c], labels, {
      pinnedKeys: [],
      archivedKeys: [],
      titleOverrides: {},
      projectNameOverrides: {
        "project_id:alpha": "Alpha Project",
        "project_id:beta": "Beta Project",
      },
      showArchived: false,
      sort: "updated_desc",
      defaultWorkspacePath: null,
    });
    const projectGroups = groups.filter((g) => g.kind === "project");
    expect(projectGroups).toHaveLength(2);
    const labels2 = projectGroups.map((g) => g.label).sort();
    expect(labels2).toEqual(["Alpha Project", "Beta Project"]);
  });

  it("falls back to project id when no name override exists", () => {
    const a = makeSession({ projectId: "alpha" });
    const groups = groupSessions([a], labels, {
      pinnedKeys: [],
      archivedKeys: [],
      titleOverrides: {},
      projectNameOverrides: {},
      showArchived: false,
      sort: "updated_desc",
      defaultWorkspacePath: null,
    });
    const projectGroups = groups.filter((g) => g.kind === "project");
    expect(projectGroups).toHaveLength(1);
    expect(projectGroups[0].label).toBe("alpha");
    expect(projectGroups[0].projectKey).toBe("project_id:alpha");
  });

  it("does not group by projectId when no chat is bound", () => {
    const a = makeSession({ updatedAt: "2024-02-01T00:00:00Z" });
    const b = makeSession({ updatedAt: "2024-01-01T00:00:00Z" });
    const groups = groupSessions([a, b], labels, {
      pinnedKeys: [],
      archivedKeys: [],
      titleOverrides: {},
      projectNameOverrides: {},
      showArchived: false,
      sort: "updated_desc",
      defaultWorkspacePath: null,
    });
    expect(groups.every((g) => g.kind !== "project")).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
  });

  it("projectId takes precedence over workspaceScope.project_path", () => {
    const a = makeSession({
      projectId: "alpha",
      updatedAt: "2024-02-01T00:00:00Z",
      workspaceScope: {
        project_path: "/Users/me/somepath",
        project_name: "Some Path",
        restrict_to_workspace: true,
      },
    });
    const groups = groupSessions([a], labels, {
      pinnedKeys: [],
      archivedKeys: [],
      titleOverrides: {},
      projectNameOverrides: { "project_id:alpha": "Alpha" },
      showArchived: false,
      sort: "updated_desc",
      defaultWorkspacePath: null,
    });
    const projectGroups = groups.filter((g) => g.kind === "project");
    expect(projectGroups).toHaveLength(1);
    expect(projectGroups[0].label).toBe("Alpha");
  });
});
