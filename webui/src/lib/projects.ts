import type {
  ProjectSummary,
  ProjectFile,
  ProjectDetail,
} from "./types";
import { fetchWithTimeout } from "./http";

const API_READ_TIMEOUT_MS = 20_000;

export type ProjectListPayload = { projects: ProjectSummary[] };

export class ProjectApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ProjectApiError";
  }
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchWithTimeout(
    url,
    {
      ...(init ?? {}),
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
    },
    API_READ_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = typeof res.text === "function" ? (await res.text()).trim() : "";
    throw new ProjectApiError(res.status, text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchProjects(
  base: string,
  token: string,
): Promise<ProjectListPayload> {
  return request<ProjectListPayload>(
    `${base}/api/projects`,
    token,
  );
}

export function fetchProject(
  base: string,
  token: string,
  projectId: string,
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`${base}/api/projects/${encodeURIComponent(projectId)}`, token);
}

export function createProject(
  base: string,
  token: string,
  name: string,
  instructionsMd: string,
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`${base}/api/projects/create`, token, {
    headers: {
      "X-Nanobot-Project-Data": JSON.stringify({ name, instructions_md: instructionsMd }),
    },
  });
}

export function updateProject(
  base: string,
  token: string,
  projectId: string,
  name: string,
  instructionsMd: string,
): Promise<ProjectDetail> {
  return request<ProjectDetail>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/update`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ name, instructions_md: instructionsMd }),
      },
    },
  );
}

export function deleteProject(
  base: string,
  token: string,
  projectId: string,
): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/delete`,
    token,
  );
}

export function listProjectFiles(
  base: string,
  token: string,
  projectId: string,
): Promise<{ files: ProjectFile[] }> {
  return request<{ files: ProjectFile[] }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/files`,
    token,
  );
}

export function uploadProjectFile(
  base: string,
  token: string,
  projectId: string,
  name: string,
  dataUrl: string,
): Promise<ProjectFile> {
  return request<ProjectFile>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/files/upload`,
    token,
    {
      headers: {
        "X-Nanobot-Project-File": JSON.stringify({ name, data_url: dataUrl }),
      },
    },
  );
}

export function readProjectFile(
  base: string,
  token: string,
  projectId: string,
  fileId: string,
): Promise<ProjectFile & { data_url: string }> {
  return request<ProjectFile & { data_url: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
    token,
  );
}

export function deleteProjectFile(
  base: string,
  token: string,
  projectId: string,
  fileId: string,
): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/delete`,
    token,
  );
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("file did not produce a data URL"));
      }
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}
