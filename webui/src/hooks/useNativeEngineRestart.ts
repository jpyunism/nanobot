import { useCallback } from "react";
import { markRestartStarted } from "@/lib/routing";
import { createRuntimeHost } from "@/lib/runtime";
import type { BootState } from "@/hooks/useBootstrap";

type Args = {
  state: BootState;
  bootRefreshReady: (
    client: import("@/lib/nanobot-client").NanobotClient,
    surface: import("@/lib/types").RuntimeSurface,
  ) => Promise<{ token: string }>;
};

export function useNativeEngineRestart({ state, bootRefreshReady }: Args) {
  return useCallback(async (): Promise<string> => {
    if (state.status !== "ready") {
      throw new Error("native engine restart is unavailable");
    }
    const { runtimeSurface, client } = state;
    const runtimeHost = createRuntimeHost(runtimeSurface);
    if (!runtimeHost.restartEngine) {
      throw new Error("native engine restart is unavailable");
    }
    markRestartStarted();
    try {
      await runtimeHost.restartEngine();
      const refreshed = await bootRefreshReady(client, runtimeSurface);
      return refreshed.token;
    } finally {
      // routing module removes its keys via maybeRestoreRestartHash on next read
    }
  }, [state, bootRefreshReady]);
}
