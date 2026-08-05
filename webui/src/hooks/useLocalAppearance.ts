import { useEffect } from "react";
import {
  LOCAL_PREFS_CHANGED_EVENT,
  readLocalPreferences,
} from "@/lib/local-preferences";

function apply(root: HTMLElement): void {
  const prefs = readLocalPreferences();
  root.dataset.font = prefs.font;
  root.dataset.accent = prefs.accent;
}

export function useLocalAppearance(): void {
  useEffect(() => {
    apply(document.documentElement);
    const onChange = () => apply(document.documentElement);
    window.addEventListener(LOCAL_PREFS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_PREFS_CHANGED_EVENT, onChange);
  }, []);
}
