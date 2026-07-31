import { useCallback } from "react";
import type { SettingsSectionKey } from "@/lib/types";
import { shellViewForSettingsSection, type ShellView } from "@/lib/routing";

type ShellRoute = {
  view: ShellView;
  activeKey: string | null;
  settingsSection: SettingsSectionKey;
};

type Args = {
  activeKey: string | null;
  navigate: (route: ShellRoute) => void;
  closeSessionSearch: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  loadSettingsView: () => Promise<unknown>;
};

export type UtilityActions = {
  onOpenSettings: (section?: SettingsSectionKey) => void;
  onOpenModelSettings: () => void;
  onOpenApps: () => void;
  onOpenAutomations: () => void;
  onOpenSkills: () => void;
  onOpenUtility: (view: Extract<ShellView, "apps" | "automations" | "skills">) => void;
  onSettingsIntent: () => void;
  onSettingsSectionChange: (section: SettingsSectionKey) => void;
};

export function useUtilityActions({
  activeKey,
  navigate,
  closeSessionSearch,
  setMobileSidebarOpen,
  loadSettingsView,
}: Args): UtilityActions {
  const openUtility = useCallback(
    (view: Extract<ShellView, "apps" | "automations" | "skills">) => {
      closeSessionSearch();
      navigate({ view, activeKey, settingsSection: view });
      setMobileSidebarOpen(false);
    },
    [activeKey, closeSessionSearch, navigate, setMobileSidebarOpen],
  );

  const onOpenSettings = useCallback(
    (section: SettingsSectionKey = "overview") => {
      closeSessionSearch();
      navigate({ view: "settings", activeKey, settingsSection: section });
      setMobileSidebarOpen(false);
    },
    [activeKey, closeSessionSearch, navigate, setMobileSidebarOpen],
  );

  const onOpenModelSettings = useCallback(
    () => onOpenSettings("models"),
    [onOpenSettings],
  );

  const onSettingsIntent = useCallback(
    () => void loadSettingsView(),
    [loadSettingsView],
  );

  const onSettingsSectionChange = useCallback(
    (section: SettingsSectionKey) => {
      navigate({
        view: shellViewForSettingsSection(section),
        activeKey,
        settingsSection: section,
      });
    },
    [activeKey, navigate],
  );

  return {
    onOpenSettings,
    onOpenModelSettings,
    onOpenApps: () => openUtility("apps"),
    onOpenAutomations: () => openUtility("automations"),
    onOpenSkills: () => openUtility("skills"),
    onOpenUtility: openUtility,
    onSettingsIntent,
    onSettingsSectionChange,
  };
}
