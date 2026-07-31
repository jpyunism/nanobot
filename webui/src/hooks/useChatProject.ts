import { useCallback, useEffect, useState } from "react";
import {
  bindChatProject,
  getChatProject,
  unbindChatProject,
} from "@/lib/api";
import { ApiError } from "@/lib/api";

export type ChatProjectState = {
  projectId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  bind: (projectId: string) => Promise<void>;
  unbind: () => Promise<void>;
};

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useChatProject(
  base: string,
  token: string,
  sessionKey: string | null,
  initialProjectId: string | null | undefined,
): ChatProjectState {
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionKey) {
      setProjectId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await getChatProject(token, sessionKey, base);
      setProjectId(payload.project_id ?? null);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [base, token, sessionKey]);

  useEffect(() => {
    if (sessionKey && initialProjectId === undefined) {
      void refresh();
    } else {
      setProjectId(initialProjectId ?? null);
    }
  }, [refresh, sessionKey, initialProjectId]);

  const bind = useCallback(
    async (nextProjectId: string) => {
      if (!sessionKey) return;
      const previous = projectId;
      setProjectId(nextProjectId);
      try {
        const payload = await bindChatProject(
          token,
          sessionKey,
          nextProjectId,
          base,
        );
        setProjectId(payload.project_id ?? nextProjectId);
      } catch (err) {
        setProjectId(previous);
        setError(toMessage(err));
        throw err;
      }
    },
    [base, token, sessionKey, projectId],
  );

  const unbind = useCallback(async () => {
    if (!sessionKey) return;
    const previous = projectId;
    setProjectId(null);
    try {
      await unbindChatProject(token, sessionKey, base);
    } catch (err) {
      setProjectId(previous);
      setError(toMessage(err));
      throw err;
    }
  }, [base, token, sessionKey, projectId]);

  return { projectId, loading, error, refresh, bind, unbind };
}
