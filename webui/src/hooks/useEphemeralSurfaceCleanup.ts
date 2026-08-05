import { useEffect, useRef } from "react";

import type { ChatSummary } from "@/lib/types";

/** True for chats created by the Agenda/Todos surfaces (invisible + ephemeral). */
export function isEphemeralSurfaceSession(session: ChatSummary): boolean {
  return Boolean(session.todoList || session.agendaAppointmentId);
}

/**
 * Surface chats (agenda / todos) keep their context only for the current page
 * session. This deletes leftovers from previous sessions on startup and does a
 * best-effort keepalive cleanup on page unload so no record outlives the app.
 */
export function useEphemeralSurfaceCleanup(
  sessions: ChatSummary[],
  loading: boolean,
  deleteChat: (key: string) => Promise<unknown>,
  token: string,
): void {
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const done = useRef(false);

  useEffect(() => {
    if (done.current || loading || sessions.length === 0) return;
    done.current = true;
    for (const session of sessions) {
      if (isEphemeralSurfaceSession(session)) {
        void deleteChat(session.key).catch(() => undefined);
      }
    }
  }, [sessions, loading, deleteChat]);

  // ponytail: best-effort only — mobile/background-kill may skip pagehide; the
  // startup cleanup above is the reliable path and catches any survivor.
  useEffect(() => {
    const onPageHide = () => {
      for (const session of sessions) {
        if (!isEphemeralSurfaceSession(session)) continue;
        try {
          fetch(`/api/sessions/${encodeURIComponent(session.key)}/delete`, {
            method: "GET",
            headers: { Authorization: `Bearer ${tokenRef.current}` },
            keepalive: true,
          });
        } catch {
          // best-effort
        }
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [sessions]);
}
