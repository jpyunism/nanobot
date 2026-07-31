import { useEffect, useMemo, useState } from "react";
import { fetchProjects } from "@/lib/projects";
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

  useEffect(() => {
    if (!token) {
      setNames({});
      return;
    }
    let cancelled = false;
    fetchProjects(base, token)
      .then((payload) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const project of payload.projects) {
          next[`project_id:${project.id}`] = project.name;
        }
        setNames(next);
      })
      .catch((err) => {
        if (cancelled) return;
        // Surfacing the error here would just spam the console for a non-fatal
        // sidebar metadata miss. The sidebar still falls back to the project id.
        console.warn("useProjectNames: failed to load project list:", toMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [base, token]);

  return useMemo(() => ({ ...names, ...fallback }), [names, fallback]);
}
