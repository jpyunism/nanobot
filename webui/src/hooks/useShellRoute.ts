import { useCallback, useEffect, useReducer, useRef } from "react";
import type { SettingsSectionKey } from "@/components/settings/SettingsView";
import {
  defaultShellRoute,
  readShellRoute,
  writeShellRoute,
  type ShellRoute,
  type ShellView,
} from "@/lib/routing";

type Action =
  | { type: "set"; route: ShellRoute; replace?: boolean }
  | { type: "apply"; route: ShellRoute };

function routeReducer(state: ShellRoute, action: Action): ShellRoute {
  if (action.type === "set" || action.type === "apply") return action.route;
  return state;
}

export type UseShellRoute = {
  activeKey: string | null;
  view: ShellView;
  settingsSection: SettingsSectionKey;
  navigate: (route: ShellRoute, options?: { replace?: boolean }) => void;
  setSettingsSection: (section: SettingsSectionKey) => void;
};

export function useShellRoute(): UseShellRoute {
  const initialRef = useRef<ShellRoute | null>(null);
  if (!initialRef.current) initialRef.current = readShellRoute();
  const [route, dispatch] = useReducer(routeReducer, initialRef.current);

  useEffect(() => {
    const applyRoute = () => dispatch({ type: "apply", route: readShellRoute() });
    window.addEventListener("hashchange", applyRoute);
    return () => window.removeEventListener("hashchange", applyRoute);
  }, []);

  const navigate = useCallback(
    (next: ShellRoute, options?: { replace?: boolean }) => {
      writeShellRoute(next, options?.replace);
      dispatch({ type: "set", route: next, replace: options?.replace });
    },
    [],
  );

  const setSettingsSection = useCallback(
    (section: SettingsSectionKey) => {
      navigate({
        view: section === "apps" || section === "automations" || section === "skills"
          ? section
          : "settings",
        activeKey: route.activeKey,
        settingsSection: section,
      });
    },
    [navigate, route.activeKey],
  );

  return {
    activeKey: route.activeKey,
    view: route.view,
    settingsSection: route.settingsSection,
    navigate,
    setSettingsSection,
  };
}

export { defaultShellRoute };
