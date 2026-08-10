import type {
  ProjectSummary,
  ProjectFile,
  ProjectDetail,
  ProjectFolder,
  Board,
  BoardColumn,
  BoardCard,
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

export function addProjectFolder(
  base: string,
  token: string,
  projectId: string,
  path: string,
): Promise<ProjectFolder> {
  return request<ProjectFolder>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/folders/add`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ path }),
      },
    },
  );
}

export function removeProjectFolder(
  base: string,
  token: string,
  projectId: string,
  path: string,
): Promise<{ ok: true; path: string }> {
  return request<{ ok: true; path: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/folders/remove`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ path }),
      },
    },
  );
}

// ---- Board (kanban of worktrees) ----

export function fetchBoard(
  base: string,
  token: string,
  projectId: string,
): Promise<Board> {
  return request<Board>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board`,
    token,
  );
}

export function setupBoard(
  base: string,
  token: string,
  projectId: string,
  repoPath: string,
): Promise<Board> {
  return request<Board>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/setup`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ repo_path: repoPath }),
      },
    },
  );
}

export function addBoardColumn(
  base: string,
  token: string,
  projectId: string,
  name: string,
): Promise<BoardColumn> {
  return request<BoardColumn>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/columns/add`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ name }),
      },
    },
  );
}

export function removeBoardColumn(
  base: string,
  token: string,
  projectId: string,
  columnId: string,
): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/columns/${encodeURIComponent(columnId)}/remove`,
    token,
  );
}

export function renameBoardColumn(
  base: string,
  token: string,
  projectId: string,
  columnId: string,
  name: string,
): Promise<BoardColumn> {
  return request<BoardColumn>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/columns/${encodeURIComponent(columnId)}/rename`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ name }),
      },
    },
  );
}

export function addBoardCard(
  base: string,
  token: string,
  projectId: string,
  brief: string,
  columnId: string,
  title?: string,
): Promise<BoardCard> {
  return request<BoardCard>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/add`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ brief, column_id: columnId, ...(title ? { title } : {}) }),
      },
    },
  );
}

export function moveBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
  columnId: string,
): Promise<BoardCard> {
  return request<BoardCard>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/move`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ column_id: columnId }),
      },
    },
  );
}

export function setBoardCardChat(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
  sessionKey: string,
): Promise<BoardCard> {
  return request<BoardCard>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/chat`,
    token,
    {
      headers: {
        "X-Nanobot-Project-Data": JSON.stringify({ session_key: sessionKey }),
      },
    },
  );
}

export function deleteBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/delete`,
    token,
  );
}

export function mergeBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
  into: string,
): Promise<{ ok: true; output: string }> {
  return request<{ ok: true; output: string }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/merge?into=${encodeURIComponent(into)}`,
    token,
  );
}

export function spawnBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<BoardCard> {
  return runCardPhase(base, token, projectId, cardId, "build");
}

export function planBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<BoardCard> {
  return runCardPhase(base, token, projectId, cardId, "plan");
}

export function buildBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<BoardCard> {
  return runCardPhase(base, token, projectId, cardId, "build");
}

export function validateBoardCard(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<BoardCard> {
  return runCardPhase(base, token, projectId, cardId, "validate");
}

function runCardPhase(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
  phase: string,
): Promise<BoardCard> {
  return request<BoardCard>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/${encodeURIComponent(phase)}`,
    token,
  );
}

export function fetchBoardCardSubagent(
  base: string,
  token: string,
  projectId: string,
  cardId: string,
): Promise<Record<string, unknown> | { status: null }> {
  return request<Record<string, unknown> | { status: null }>(
    `${base}/api/projects/${encodeURIComponent(projectId)}/board/cards/${encodeURIComponent(cardId)}/subagent`,
    token,
  );
}
