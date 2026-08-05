import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  DEFAULT_LOCAL_PREFS,
  writeLocalPreferences,
} from "@/lib/local-preferences";
import { useLocalAppearance } from "@/hooks/useLocalAppearance";

describe("useLocalAppearance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-font");
  });

  it("applies stored accent/font on mount", () => {
    writeLocalPreferences({ ...DEFAULT_LOCAL_PREFS, accent: "blue", font: "serif" });
    renderHook(() => useLocalAppearance());
    expect(document.documentElement.dataset.accent).toBe("blue");
    expect(document.documentElement.dataset.font).toBe("serif");
  });

  it("re-applies on preference change events", () => {
    renderHook(() => useLocalAppearance());
    writeLocalPreferences({ ...DEFAULT_LOCAL_PREFS, accent: "rose" });
    expect(document.documentElement.dataset.accent).toBe("rose");
  });
});
