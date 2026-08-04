import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchProjects } from "@/lib/projects";
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";
import { ApiError } from "@/lib/api";

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useProjectNames(
  base: string,
  token: string,
  fallback: Record<string, string> = {},
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) {
      setNames({});
      return;
    }
    try {
      const payload = await fetchProjects(base, token);
      const next: Record<string, string> = {};
      for (const project of payload.projects) {
        next[`project_id:${project.id}`] = project.name;
      }
      setNames(next);
    } catch (err) {
      // Surfacing the error here would just spam the console for a non-fatal
      // sidebar metadata miss. The sidebar still falls back to the project id.
      console.warn("useProjectNames: failed to load project list:", toMessage(err));
    }
  }, [base, token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setNames({});
      return;
    }
    load();
    const refreshOnFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (!cancelled) load();
    };
    const refreshOnChanged = () => {
      if (!cancelled) load();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener(PROJECTS_CHANGED_EVENT, refreshOnChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener(PROJECTS_CHANGED_EVENT, refreshOnChanged);
    };
  }, [base, token, load]);

  return useMemo(() => ({ ...names, ...fallback }), [names, fallback]);
}
