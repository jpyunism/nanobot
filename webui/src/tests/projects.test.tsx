import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import {
  createProject,
  deleteProject,
  deleteProjectFile,
  fetchProject,
  fetchProjects,
  listProjectFiles,
  ProjectApiError,
  readProjectFile,
  updateProject,
  uploadProjectFile,
} from "@/lib/projects";
import { useProjects } from "@/hooks/useProjects";
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

describe("webui projects API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ projects: [] })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchProjects hits /api/projects with bearer token", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ projects: [{ id: "demo" }] }),
    );
    await expect(fetchProjects("", "tok")).resolves.toEqual({
      projects: [{ id: "demo" }],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/projects");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("fetchProject hits /api/projects/{id}", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ id: "demo", files: [] }),
    );
    await expect(fetchProject("", "tok", "demo")).resolves.toMatchObject({
      id: "demo",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/demo",
      expect.anything(),
    );
  });

  it("createProject encodes data in X-Nanobot-Project-Data header", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ id: "demo" }));
    await createProject("", "tok", "Demo", "instructions here");
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/projects/create");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Nanobot-Project-Data"]).toBe(
      JSON.stringify({ name: "Demo", instructions_md: "instructions here" }),
    );
  });

  it("mutating calls never POST (WS+HTTP transport accepts GET only)", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValue(mockJsonResponse({ ok: true, id: "x" }));
    await createProject("", "tok", "X", "");
    await updateProject("", "tok", "x", "X", "");
    await deleteProject("", "tok", "x");
    await uploadProjectFile("", "tok", "x", "f.txt", "data:text/plain;base64,YQ==");
    await deleteProjectFile("", "tok", "x", "f1");
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const method = (init?.method ?? "GET").toUpperCase();
      expect(method).toBe("GET");
    }
  });

  it("updateProject puts data in header", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ id: "demo" }));
    await updateProject("", "tok", "demo", "New", "x");
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/projects/demo/update");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Nanobot-Project-Data"]).toBe(
      JSON.stringify({ name: "New", instructions_md: "x" }),
    );
  });

  it("deleteProject hits /api/projects/{id}/delete", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ ok: true, id: "demo" }));
    await deleteProject("", "tok", "demo");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/demo/delete",
      expect.anything(),
    );
  });

  it("listProjectFiles returns the files array", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ files: [{ id: "f1" }] }),
    );
    await expect(listProjectFiles("", "tok", "demo")).resolves.toEqual({
      files: [{ id: "f1" }],
    });
  });

  it("uploadProjectFile puts data in X-Nanobot-Project-File header", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ id: "f1", name: "x.txt" }),
    );
    await uploadProjectFile(
      "",
      "tok",
      "demo",
      "x.txt",
      "data:text/plain;base64,aGVsbG8=",
    );
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("/api/projects/demo/files/upload");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Nanobot-Project-File"]).toBe(
      JSON.stringify({ name: "x.txt", data_url: "data:text/plain;base64,aGVsbG8=" }),
    );
  });

  it("readProjectFile returns the file payload with data_url", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        id: "f1",
        project_id: "demo",
        name: "x.txt",
        mime_type: "text/plain",
        size: 5,
        created_at_ms: 1,
        data_url: "data:text/plain;base64,aGVsbG8=",
      }),
    );
    const result = await readProjectFile("", "tok", "demo", "f1");
    expect(result.data_url).toBe("data:text/plain;base64,aGVsbG8=");
  });

  it("deleteProjectFile hits /api/projects/{pid}/files/{fid}/delete", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ ok: true, id: "f1" }));
    await deleteProjectFile("", "tok", "demo", "f1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/demo/files/f1/delete",
      expect.anything(),
    );
  });

  it("throws ProjectApiError on non-2xx responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse("not found", 404),
    );
    await expect(fetchProjects("", "tok")).rejects.toBeInstanceOf(ProjectApiError);
  });
});

describe("useProjects hook", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ projects: [] })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads projects on mount and exposes them in state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        projects: [
          {
            id: "demo",
            name: "Demo",
            instructions_md: "",
            created_at_ms: 1,
            updated_at_ms: 2,
            file_count: 0,
            byte_count: 0,
          },
        ],
      }),
    );
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1);
    });
    expect(result.current.projects[0].id).toBe("demo");
  });

  it("refresh triggers another fetch", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          projects: [
            {
              id: "x",
              name: "X",
              instructions_md: "",
              created_at_ms: 1,
              updated_at_ms: 2,
              file_count: 0,
              byte_count: 0,
            },
          ],
        }),
      );
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("create posts and refreshes the list", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(
        mockJsonResponse({
          id: "demo",
          name: "Demo",
          instructions_md: "",
          created_at_ms: 1,
          updated_at_ms: 1,
          file_count: 0,
          byte_count: 0,
          files: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          projects: [
            {
              id: "demo",
              name: "Demo",
              instructions_md: "",
              created_at_ms: 1,
              updated_at_ms: 1,
              file_count: 0,
              byte_count: 0,
            },
          ],
        }),
      );
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let eventCount = 0;
    const listener = () => { eventCount += 1; };
    window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
    await act(async () => {
      await result.current.create("Demo", "");
    });
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(eventCount).toBe(1);
  });

  it("remove posts and refreshes the list", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, id: "demo" }))
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }));
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let eventCount = 0;
    const listener = () => { eventCount += 1; };
    window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
    await act(async () => {
      await result.current.remove("demo");
    });
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(eventCount).toBe(1);
  });

  it("save posts and emits projects-changed", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ id: "demo", name: "New", instructions_md: "x" }))
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }));
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let eventCount = 0;
    const listener = () => { eventCount += 1; };
    window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
    await act(async () => {
      await result.current.save("demo", "New", "x");
    });
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(eventCount).toBe(1);
  });

  it("uploadFile emits projects-changed", async () => {
    const fetchSpy = vi.mocked(fetch);
    const file = new File(["a"], "x.txt", { type: "text/plain" });
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ id: "f1", name: "x.txt" }));
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let eventCount = 0;
    const listener = () => { eventCount += 1; };
    window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
    await act(async () => {
      await result.current.uploadFile("demo", "x.txt", file);
    });
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    expect(eventCount).toBe(1);
  });

  it("removeFile emits projects-changed", async () => {
    const fetchSpy = vi.mocked(fetch);
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, id: "f1" }));
    const { result } = renderHook(() => useProjects("", "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let eventCount = 0;
    const listener = () => { eventCount += 1; };
    window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
    await act(async () => {
      await result.current.removeFile("demo", "f1");
    });
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    expect(eventCount).toBe(1);
  });
});
