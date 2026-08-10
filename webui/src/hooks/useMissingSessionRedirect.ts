import { useEffect } from "react";
import type { ShellRoute, ShellView } from "@/lib/routing";

type Args = {
  activeKey: string | null;
  loading: boolean;
  sessions: { key: string }[];
  view: ShellView;
  navigate: (route: ShellRoute, options?: { replace?: boolean }) => void;
};

export function useMissingSessionRedirect({
  activeKey,
  loading,
  sessions,
  view,
  navigate,
}: Args) {
  useEffect(() => {
    if (loading || !activeKey) return;
    if (view !== "chat") return;
    if (sessions.some((session) => session.key === activeKey)) return;
    navigate(
      { view: "chat", activeKey: null, settingsSection: "overview" },
      { replace: true },
    );
  }, [activeKey, loading, navigate, sessions, view]);
}
