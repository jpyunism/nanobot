export const SIDEBAR_STORAGE_KEY = "nanobot-webui.sidebar";
export const SESSION_UPDATES_STORAGE_KEY = "nanobot-webui.sidebar.session-updates.v1";
export const LEGACY_COMPLETED_RUNS_STORAGE_KEY = "nanobot-webui.sidebar.completed-runs.v1";

export function readSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeSidebarOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

export function readSessionUpdateChatIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw =
      window.localStorage.getItem(SESSION_UPDATES_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_COMPLETED_RUNS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function writeSessionUpdateChatIds(chatIds: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SESSION_UPDATES_STORAGE_KEY,
      JSON.stringify(Array.from(chatIds)),
    );
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}
