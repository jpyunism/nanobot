import { useEffect } from "react";
import type { SettingsSectionKey } from "@/lib/types";
import type { ShellRoute, ShellView } from "@/lib/routing";

type Args = {
  activeKey: string | null;
  loading: boolean;
  sessions: { key: string }[];
  view: ShellView;
  settingsSection: SettingsSectionKey;
  navigate: (route: ShellRoute, options?: { replace?: boolean }) => void;
};

export function useMissingSessionRedirect({
  activeKey,
  loading,
  sessions,
  view,
  settingsSection,
  navigate,
}: Args) {
  useEffect(() => {
    if (loading || !activeKey) return;
    if (sessions.some((session) => session.key === activeKey)) return;
    navigate(
      view === "chat"
        ? { view: "chat", activeKey: null, settingsSection: "overview" }
        : { view, activeKey: null, settingsSection },
      { replace: true },
    );
  }, [activeKey, loading, navigate, sessions, settingsSection, view]);
}
