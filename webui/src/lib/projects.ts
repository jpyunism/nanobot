// Project CRUD client wrapper for the WebUI.
//
// The gateway exposes project CRUD via GET-only HTTP routes that pass JSON
// bodies through a single `?body=...` query parameter (the gateway's Request
// object does not expose the HTTP body). File uploads happen via the WebSocket
// channel directly because base64 data URLs of any reasonable size do not fit
// in a query string.

import type { ProjectDetail, ProjectListResponse, ProjectFile, ProjectChatsPayload } from "./types";
import { ApiError } from "./api";

const PROJECT_READ_TIMEOUT_MS = 20_000;

function buildUrl(path: string, base: string): string {
  return `${base}${path}`;
}

function buildQuery(op: string, body?: unknown): string {
  const query = new URLSearchParams();
  query.set("op", op);
  if (body !== undefined) {
    query.set("body", JSON.stringify(body));
  }
  return `?${query.toString()}`;
}

async function requestJson<T>(
  path: string,
  token: string,
  // Reserved for future per-request timeouts when uploads reintroduce them.
  // Keeps the call sites uniform with the rest of the lib.
  timeoutMs: number = PROJECT_READ_TIMEOUT_MS,
): Promise<T> {
  void timeoutMs;
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = (await res.text()).trim();
    let detail = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        detail = String((parsed as { error: unknown }).error);
      }
    } catch {
      // body was not JSON; keep raw text
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function listProjects(
  token: string,
  base: string = "",
): Promise<ProjectListResponse> {
  return requestJson<ProjectListResponse>(
    buildUrl(`/api/projects${buildQuery("list")}`, base),
    token,
  );
}

export async function createProject(
  token: string,
  payload: { name: string; instructions_md?: string },
  base: string = "",
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    buildUrl(`/api/projects${buildQuery("create", payload)}`, base),
    token,
  );
}

export async function getProject(
  token: string,
  projectId: string,
  base: string = "",
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    buildUrl(`/api/projects/${encodeURIComponent(projectId)}${buildQuery("get")}`, base),
    token,
  );
}

export async function updateProject(
  token: string,
  projectId: string,
  payload: Partial<{ name: string; instructions_md: string }>,
  base: string = "",
): Promise<ProjectDetail> {
  return requestJson<ProjectDetail>(
    buildUrl(
      `/api/projects/${encodeURIComponent(projectId)}${buildQuery("update", payload)}`,
      base,
    ),
    token,
  );
}

export async function deleteProject(
  token: string,
  projectId: string,
  base: string = "",
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    buildUrl(`/api/projects/${encodeURIComponent(projectId)}${buildQuery("delete")}`, base),
    token,
  );
}

export async function listProjectFiles(
  token: string,
  projectId: string,
  base: string = "",
): Promise<{ files: ProjectFile[] }> {
  return requestJson<{ files: ProjectFile[] }>(
    buildUrl(
      `/api/projects/${encodeURIComponent(projectId)}/files${buildQuery("list")}`,
      base,
    ),
    token,
  );
}

export async function deleteProjectFile(
  token: string,
  projectId: string,
  fileName: string,
  base: string = "",
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    buildUrl(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileName)}${buildQuery("delete")}`,
      base,
    ),
    token,
  );
}

export async function bindChatToProject(
  token: string,
  chatId: string,
  projectId: string,
  base: string = "",
): Promise<{ chat_id: string; project_id: string; workspace_path: string }> {
  return requestJson<{ chat_id: string; project_id: string; workspace_path: string }>(
    buildUrl(
      `/api/sessions/${encodeURIComponent(chatId)}/project${buildQuery("bind", { project_id: projectId })}`,
      base,
    ),
    token,
  );
}

export async function unbindChatFromProject(
  token: string,
  chatId: string,
  base: string = "",
): Promise<{ chat_id: string }> {
  return requestJson<{ chat_id: string }>(
    buildUrl(
      `/api/sessions/${encodeURIComponent(chatId)}/project${buildQuery("unbind")}`,
      base,
    ),
    token,
  );
}

export async function listProjectChats(
  token: string,
  projectId: string,
  base: string = "",
): Promise<ProjectChatsPayload> {
  return requestJson<ProjectChatsPayload>(
    buildUrl(
      `/api/projects/${encodeURIComponent(projectId)}/chats`,
      base,
    ),
    token,
  );
}
