import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ComposerProjectPicker } from "@/components/thread/ComposerProjectPicker";
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";

const mockRefresh = vi.fn().mockResolvedValue(undefined);
const mockBind = vi.fn().mockResolvedValue(undefined);
const mockUnbind = vi.fn().mockResolvedValue(undefined);
const mockRefreshSessions = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({
    projects: [
      {
        id: "proj-a",
        name: "Project A",
        instructions_md: "",
        created_at_ms: 1,
        updated_at_ms: 2,
        file_count: 0,
        byte_count: 0,
      },
      {
        id: "proj-b",
        name: "Project B",
        instructions_md: "",
        created_at_ms: 1,
        updated_at_ms: 2,
        file_count: 0,
        byte_count: 0,
      },
    ],
    loading: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/hooks/useChatProject", () => ({
  useChatProject: (
    _base: string,
    _token: string,
    sessionKey: string | null,
    initialProjectId: string | null | undefined,
  ) => ({
    projectId: initialProjectId ?? null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    bind: mockBind,
    unbind: mockUnbind,
  }),
}));

vi.mock("@/hooks/useSessions", () => ({
  useSessions: () => ({
    refresh: mockRefreshSessions,
  }),
}));

vi.mock("@/providers/ClientProvider", () => ({
  useClient: () => ({ token: "tok" }),
  ClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ComposerProjectPicker", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockBind.mockClear();
    mockUnbind.mockClear();
    mockRefreshSessions.mockClear();
  });

  it("renders current project name and lists projects", async () => {
    const user = userEvent.setup();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey="websocket:chat-1"
        projectId="proj-a"
        token="tok"
      />,
    );

    const trigger = screen.getByTestId("composer-project-picker");
    expect(trigger.textContent).toContain("Project A");

    await user.click(trigger);

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Project A")).toBeInTheDocument();
    expect(within(menu).getByText("Project B")).toBeInTheDocument();
  });

  it("refreshes project list when dropdown opens", async () => {
    const user = userEvent.setup();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey="websocket:chat-1"
        projectId={null}
        token="tok"
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("binds a project when an existing session is provided", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey="websocket:chat-1"
        projectId={null}
        token="tok"
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Project A"));

    await waitFor(() => {
      expect(mockBind).toHaveBeenCalledWith("proj-a");
      expect(mockRefreshSessions).toHaveBeenCalled();
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("unbinds a project when current project is cleared", async () => {
    const user = userEvent.setup();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey="websocket:chat-1"
        projectId="proj-a"
        token="tok"
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText(/Unassign/i));

    await waitFor(() => {
      expect(mockUnbind).toHaveBeenCalled();
      expect(mockRefreshSessions).toHaveBeenCalled();
    });
  });

  it("calls onPendingProjectChange in welcome mode (no sessionKey)", async () => {
    const user = userEvent.setup();
    const onPendingProjectChange = vi.fn();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey={null}
        projectId={null}
        token="tok"
        onPendingProjectChange={onPendingProjectChange}
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Project B"));

    await waitFor(() => {
      expect(onPendingProjectChange).toHaveBeenCalledWith("proj-b");
      expect(mockBind).not.toHaveBeenCalled();
    });
  });

  it("reflects a pending project selection in welcome mode", async () => {
    const user = userEvent.setup();
    const onPendingProjectChange = vi.fn();
    const { rerender } = render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey={null}
        projectId={null}
        token="tok"
        onPendingProjectChange={onPendingProjectChange}
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByText("Project B"));

    await waitFor(() => {
      expect(onPendingProjectChange).toHaveBeenCalledWith("proj-b");
    });

    // Simulate the parent (e.g. ThreadShell) updating projectId after selection.
    rerender(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey={null}
        projectId="proj-b"
        token="tok"
        onPendingProjectChange={onPendingProjectChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("composer-project-picker").textContent).toContain("Project B");
    });
  });

  it("refreshes project list on projects-changed event", async () => {
    const user = userEvent.setup();
    render(
      <ComposerProjectPicker
        chatId="chat-1"
        sessionKey="websocket:chat-1"
        projectId={null}
        token="tok"
      />,
    );

    await user.click(screen.getByTestId("composer-project-picker"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
    });

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(2));
  });
});
