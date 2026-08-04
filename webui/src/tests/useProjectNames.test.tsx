import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useProjectNames } from "@/hooks/useProjectNames";
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

describe("useProjectNames", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ projects: [] })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads project names on mount", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        projects: [
          { id: "demo", name: "Demo Project" },
        ],
      }),
    );
    const { result } = renderHook(() => useProjectNames("", "tok"));
    await waitFor(() => {
      expect(result.current["project_id:demo"]).toBe("Demo Project");
    });
  });

  it("refreshes when projects-changed event fires", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          projects: [
            { id: "new-proj", name: "New Project" },
          ],
        }),
      );
    const { result } = renderHook(() => useProjectNames("", "tok"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(result.current["project_id:new-proj"]).toBe("New Project");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("merges with fallback names", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ projects: [{ id: "a", name: "A" }] }),
    );
    const { result } = renderHook(() =>
      useProjectNames("", "tok", { project_id_b: "B Fallback" }),
    );
    await waitFor(() => {
      expect(result.current["project_id:a"]).toBe("A");
      expect(result.current["project_id_b"]).toBe("B Fallback");
    });
  });
});
