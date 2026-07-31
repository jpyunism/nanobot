import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import {
  bindChatProject,
  unbindChatProject,
  getChatProject,
  ApiError,
} from "@/lib/api";
import { useChatProject } from "@/hooks/useChatProject";

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

describe("webui chat project API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ session_key: "k", project_id: null })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("getChatProject hits /api/sessions/{key}/project", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ session_key: "websocket:1", project_id: "alpha" }),
    );
    const payload = await getChatProject("tok", "websocket:1", "");
    expect(payload.project_id).toBe("alpha");
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/sessions/websocket%3A1/project");
  });

  it("bindChatProject sends project_id in query", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ session_key: "websocket:1", project_id: "alpha" }),
    );
    await bindChatProject("tok", "websocket:1", "alpha", "");
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/sessions/websocket%3A1/project/bind?project_id=alpha");
  });

  it("unbindChatProject hits unbind endpoint", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ session_key: "websocket:1", project_id: null }),
    );
    await unbindChatProject("tok", "websocket:1", "");
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/sessions/websocket%3A1/project/unbind");
  });

  it("throws ApiError on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse("not found", 404));
    await expect(getChatProject("tok", "websocket:1", "")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("useChatProject hook", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ session_key: "k", project_id: null })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("exposes initialProjectId without fetching", async () => {
    const { result } = renderHook(() =>
      useChatProject("", "tok", "websocket:1", "alpha"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projectId).toBe("alpha");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("bind posts and updates state", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ session_key: "k", project_id: "beta" }),
    );
    const { result } = renderHook(() =>
      useChatProject("", "tok", "websocket:1", null),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.bind("beta");
    });
    expect(result.current.projectId).toBe("beta");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("unbind clears projectId", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ session_key: "k", project_id: null }),
    );
    const { result } = renderHook(() =>
      useChatProject("", "tok", "websocket:1", "alpha"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.unbind();
    });
    expect(result.current.projectId).toBeNull();
  });
});
