import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addProjectFolder,
  createProject,
  deleteProject,
  deleteProjectFile,
  fetchProject,
  fetchProjects,
  fileToDataUrl,
  listProjectFiles,
  ProjectApiError,
  readProjectFile,
  removeProjectFolder,
  updateProject,
  uploadProjectFile,
} from "@/lib/projects";
import { notifyProjectsChanged } from "@/lib/project-events";
import type { ProjectDetail, ProjectFile, ProjectFolder, ProjectSummary } from "@/lib/types";

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
  addFolder: (projectId: string, path: string) => Promise<ProjectFolder>;
  removeFolder: (projectId: string, path: string) => Promise<void>;
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
      notifyProjectsChanged();
      return detail;
    },
    [base, refresh, token],
  );

  const remove = useCallback(
    async (projectId: string) => {
      await deleteProject(base, token, projectId);
      await refresh();
      notifyProjectsChanged();
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
      notifyProjectsChanged();
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
      notifyProjectsChanged();
      return created;
    },
    [base, token],
  );

  const removeFileFn = useCallback(
    async (projectId: string, fileId: string) => {
      await deleteProjectFile(base, token, projectId, fileId);
      notifyProjectsChanged();
    },
    [base, token],
  );

  const downloadFileFn = useCallback(
    async (projectId: string, fileId: string) =>
      readProjectFile(base, token, projectId, fileId),
    [base, token],
  );

  const addFolderFn = useCallback(
    async (projectId: string, path: string) => {
      const folder = await addProjectFolder(base, token, projectId, path);
      notifyProjectsChanged();
      return folder;
    },
    [base, token],
  );

  const removeFolderFn = useCallback(
    async (projectId: string, path: string) => {
      await removeProjectFolder(base, token, projectId, path);
      notifyProjectsChanged();
    },
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
      addFolder: addFolderFn,
      removeFolder: removeFolderFn,
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
      addFolderFn,
      removeFolderFn,
    ],
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ProjectApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
