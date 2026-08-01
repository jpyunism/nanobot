import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProject,
  deleteProject,
  deleteProjectFile,
  fetchProject,
  fetchProjects,
  fileToDataUrl,
  listProjectFiles,
  ProjectApiError,
  readProjectFile,
  updateProject,
  uploadProjectFile,
} from "@/lib/projects";
import type { ProjectDetail, ProjectFile, ProjectSummary } from "@/lib/types";

export type ProjectsState = {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (name: string, instructionsMd: string) => Promise<ProjectDetail>;
  remove: (projectId: string) => Promise<void>;
  load: (projectId: string) => Promise<ProjectDetail>;
  save: (
    projectId: string,
    name: string,
    instructionsMd: string,
  ) => Promise<ProjectDetail>;
  listFiles: (projectId: string) => Promise<ProjectFile[]>;
  uploadFile: (
    projectId: string,
    name: string,
    file: File,
  ) => Promise<ProjectFile>;
  removeFile: (projectId: string, fileId: string) => Promise<void>;
  downloadFile: (
    projectId: string,
    fileId: string,
  ) => Promise<ProjectFile & { data_url: string }>;
};

export function useProjects(
  base: string,
  token: string,
): ProjectsState {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchProjects(base, token);
      setProjects(payload.projects);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [base, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string, instructionsMd: string) => {
      const detail = await createProject(base, token, name, instructionsMd);
      await refresh();
      return detail;
    },
    [base, refresh, token],
  );

  const remove = useCallback(
    async (projectId: string) => {
      await deleteProject(base, token, projectId);
      await refresh();
    },
    [base, refresh, token],
  );

  const load = useCallback(
    async (projectId: string) => fetchProject(base, token, projectId),
    [base, token],
  );

  const save = useCallback(
    async (projectId: string, name: string, instructionsMd: string) => {
      const detail = await updateProject(
        base,
        token,
        projectId,
        name,
        instructionsMd,
      );
      await refresh();
      return detail;
    },
    [base, refresh, token],
  );

  const listFilesFn = useCallback(
    async (projectId: string) => {
      const payload = await listProjectFiles(base, token, projectId);
      return payload.files;
    },
    [base, token],
  );

  const uploadFileFn = useCallback(
    async (projectId: string, name: string, file: File) => {
      const dataUrl = await fileToDataUrl(file);
      const created = await uploadProjectFile(
        base,
        token,
        projectId,
        name,
        dataUrl,
      );
      return created;
    },
    [base, token],
  );

  const removeFileFn = useCallback(
    async (projectId: string, fileId: string) => {
      await deleteProjectFile(base, token, projectId, fileId);
    },
    [base, token],
  );

  const downloadFileFn = useCallback(
    async (projectId: string, fileId: string) =>
      readProjectFile(base, token, projectId, fileId),
    [base, token],
  );

  return useMemo(
    () => ({
      projects,
      loading,
      error,
      refresh,
      create,
      remove,
      load,
      save,
      listFiles: listFilesFn,
      uploadFile: uploadFileFn,
      removeFile: removeFileFn,
      downloadFile: downloadFileFn,
    }),
    [
      projects,
      loading,
      error,
      refresh,
      create,
      remove,
      load,
      save,
      listFilesFn,
      uploadFileFn,
      removeFileFn,
      downloadFileFn,
    ],
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ProjectApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
