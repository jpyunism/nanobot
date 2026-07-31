import { useCallback, useEffect, useState } from "react";
import { fetchSettings } from "@/lib/api";
import type { SettingsPayload } from "@/lib/types";

type Args = { token: string };

export function useSettingsSnapshot({ token }: Args) {
  const [snapshot, setSnapshot] = useState<SettingsPayload | null>(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchSettings(token);
      setSnapshot(payload);
    } catch {
      setSnapshot(null);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchSettings(token);
        if (!cancelled) setSnapshot(payload);
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { snapshot, setSnapshot, refresh };
}
