// React hooks for the WebUI Projects feature.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  bindChatToProject,
  createProject,
  deleteProject,
  deleteProjectFile,
  getProject,
  listProjectChats,
  listProjectFiles,
  listProjects,
  unbindChatFromProject,
  updateProject,
} from "../lib/projects";
import type {
  ProjectDetail,
  ProjectFile,
  ProjectListResponse,
  ProjectSummary,
} from "../lib/types";

interface UseProjectsArgs {
  token: string | null;
  baseUrl?: string;
}

export function useProjects({ token, baseUrl = "" }: UseProjectsArgs) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setProjects([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: ProjectListResponse = await listProjects(token, baseUrl);
      setProjects(payload.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string, instructions_md: string): Promise<ProjectDetail> => {
      if (!token) throw new Error("missing token");
      const detail = await createProject(token, { name, instructions_md }, baseUrl);
      await refresh();
      return detail;
    },
    [token, baseUrl, refresh],
  );

  const update = useCallback(
    async (
      projectId: string,
      payload: Partial<{ name: string; instructions_md: string }>,
    ): Promise<ProjectDetail> => {
      if (!token) throw new Error("missing token");
      const detail = await updateProject(token, projectId, payload, baseUrl);
      await refresh();
      return detail;
    },
    [token, baseUrl, refresh],
  );

  const remove = useCallback(
    async (projectId: string): Promise<void> => {
      if (!token) throw new Error("missing token");
      await deleteProject(token, projectId, baseUrl);
      await refresh();
    },
    [token, baseUrl, refresh],
  );

  const bind = useCallback(
    async (chatId: string, projectId: string) => {
      if (!token) throw new Error("missing token");
      return bindChatToProject(token, chatId, projectId, baseUrl);
    },
    [token, baseUrl],
  );

  const unbind = useCallback(
    async (chatId: string) => {
      if (!token) throw new Error("missing token");
      return unbindChatFromProject(token, chatId, baseUrl);
    },
    [token, baseUrl],
  );

  return useMemo(
    () => ({
      projects,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      bind,
      unbind,
    }),
    [projects, loading, error, refresh, create, update, remove, bind, unbind],
  );
}

interface UseProjectDetailArgs extends UseProjectsArgs {
  projectId: string | null;
}

export function useProjectDetail({ token, projectId, baseUrl = "" }: UseProjectDetailArgs) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !projectId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getProject(token, projectId, baseUrl);
      setDetail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, projectId, baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ detail, loading, error, refresh, setDetail }),
    [detail, loading, error, refresh],
  );
}

interface UseProjectFilesArgs extends UseProjectsArgs {
  projectId: string | null;
}

export function useProjectFiles({ token, projectId, baseUrl = "" }: UseProjectFilesArgs) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !projectId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await listProjectFiles(token, projectId, baseUrl);
      setFiles(payload.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, projectId, baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (name: string) => {
      if (!token || !projectId) throw new Error("missing project context");
      await deleteProjectFile(token, projectId, name, baseUrl);
      await refresh();
    },
    [token, projectId, baseUrl, refresh],
  );

  return useMemo(
    () => ({ files, loading, error, refresh, remove, setFiles }),
    [files, loading, error, refresh, remove],
  );
}

interface UseProjectChatsArgs extends UseProjectsArgs {
  projectId: string | null;
}

export function useProjectChats({ token, projectId, baseUrl = "" }: UseProjectChatsArgs) {
  const [chats, setChats] = useState<Array<{ key: string; chat_id: string; title: string; preview: string; updated_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !projectId) {
      setChats([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await listProjectChats(token, projectId, baseUrl);
      setChats(payload.chats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, projectId, baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ chats, loading, error, refresh, setChats }),
    [chats, loading, error, refresh],
  );
}
