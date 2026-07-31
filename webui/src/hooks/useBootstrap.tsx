import * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { createRuntimeHost, toRuntimeSurface } from "@/lib/runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NanobotClient } from "@/lib/nanobot-client";
import {
  bootstrapTokenExpiresAt,
  clearSavedSecret,
  consumeUrlBootstrapSecret,
  deriveWsUrl,
  fetchBootstrap,
  isBootstrapAuthRequired,
  loadSavedSecret,
  saveSecret,
  tokenRefreshDelayMs,
} from "@/lib/bootstrap";
import type { BootstrapResponse, RuntimeSurface } from "@/lib/types";

export type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "auth"; failed?: boolean }
  | {
      status: "ready";
      client: NanobotClient;
      token: string;
      tokenExpiresAt: number;
      modelName: string | null;
      ingressLimits: BootstrapResponse["limits"] | null;
      runtimeSurface: RuntimeSurface;
    };

export function AuthForm({
  failed,
  onSecret,
}: {
  failed: boolean;
  onSecret: (secret: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const secret = value.trim();
    if (!secret) return;
    setSubmitting(true);
    onSecret(secret);
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-semibold">{t("app.auth.title")}</p>
          <p className="text-sm text-muted-foreground">{t("app.auth.hint")}</p>
        </div>
        {failed && (
          <p className="text-center text-sm text-destructive">
            {t("app.auth.invalid")}
          </p>
        )}
        <Input
          type="password"
          placeholder={t("app.auth.placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting}
          autoFocus
        />
        <Button
          type="submit"
          className="w-full"
          disabled={!value.trim() || submitting}
        >
          {t("app.auth.submit")}
        </Button>
      </form>
    </div>
  );
}

export interface UseBootstrapApi {
  state: BootState;
  AuthView: () => React.ReactNode;
  LoadingView: () => React.ReactNode;
  ErrorView: () => React.ReactNode;
  submitSecret: (secret: string) => void;
  logout: () => void;
  setModelName: (modelName: string | null) => void;
  refreshReady: (
    client: NanobotClient,
    fallbackSurface: RuntimeSurface,
  ) => Promise<{ token: string; url: string }>;
}

// ponytail: minimal hook that owns BootState + AuthForm + the two refresh paths.
// App.tsx only cares about `state` and the three render functions.
// All token-refresh internals (expiry math, localStorage, onReauth) stay here.
export function useBootstrap(): UseBootstrapApi {
  const { t } = useTranslation();
  const [state, setState] = useState<BootState>({ status: "loading" });
  const bootstrapSecretRef = useRef("");

  const refreshReady = useCallback(
    async (client: NanobotClient, fallbackSurface: RuntimeSurface) => {
      const boot = await fetchBootstrap("", bootstrapSecretRef.current);
      const url = deriveWsUrl(boot.ws_path, boot.token, boot.ws_url);
      const runtimeSurface = boot.runtime_surface
        ? toRuntimeSurface(boot.runtime_surface)
        : fallbackSurface;
      const runtimeHost = createRuntimeHost(runtimeSurface, boot.runtime_capabilities);
      const tokenExpiresAt = bootstrapTokenExpiresAt(boot.expires_in);
      if (runtimeHost.socketFactory) {
        client.updateUrl(url, runtimeHost.socketFactory);
      } else {
        client.updateUrl(url);
      }
      setState((current) =>
        current.status === "ready" && current.client === client
          ? {
              ...current,
              token: boot.api_token,
              tokenExpiresAt,
              modelName: boot.model_name ?? current.modelName,
              ingressLimits: boot.limits ?? current.ingressLimits,
              runtimeSurface,
            }
          : current,
      );
      return { token: boot.api_token, url };
    },
    [],
  );

  const submitSecret = useCallback(
    (secret: string) => {
      let cancelled = false;
      (async () => {
        setState({ status: "loading" });
        try {
          const boot = await fetchBootstrap("", secret);
          if (cancelled) return;
          if (secret) saveSecret(secret);
          const url = deriveWsUrl(boot.ws_path, boot.token, boot.ws_url);
          const runtimeSurface = toRuntimeSurface(boot.runtime_surface);
          const runtimeHost = createRuntimeHost(runtimeSurface, boot.runtime_capabilities);
          const client = new NanobotClient({
            url,
            socketFactory: runtimeHost.socketFactory,
            onReauth: async () => {
              try {
                const refreshed = await refreshReady(client, runtimeSurface);
                return refreshed.url;
              } catch {
                return null;
              }
            },
          });
          bootstrapSecretRef.current = secret;
          client.connect();
          setState({
            status: "ready",
            client,
            token: boot.api_token,
            tokenExpiresAt: bootstrapTokenExpiresAt(boot.expires_in),
            modelName: boot.model_name ?? null,
            ingressLimits: boot.limits ?? null,
            runtimeSurface,
          });
        } catch (e) {
          if (cancelled) return;
          if (isBootstrapAuthRequired(e)) {
            setState({ status: "auth", failed: !!secret });
          } else {
            setState({
              status: "error",
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    },
    [refreshReady],
  );

  useEffect(() => {
    const saved = consumeUrlBootstrapSecret() || loadSavedSecret();
    submitSecret(saved);
  }, [submitSecret]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const client = state.client;
    const timer = window.setTimeout(async () => {
      try {
        await refreshReady(client, state.runtimeSurface);
      } catch (e) {
        if (isBootstrapAuthRequired(e)) {
          setState({ status: "auth", failed: !!bootstrapSecretRef.current });
        }
      }
    }, tokenRefreshDelayMs(state.tokenExpiresAt));
    return () => window.clearTimeout(timer);
  }, [refreshReady, state]);

  const logout = useCallback(() => {
    if (state.status === "ready") {
      state.client.close();
    }
    clearSavedSecret();
    setState({ status: "auth" });
  }, [state]);

  const setModelName = useCallback((modelName: string | null) => {
    setState((current) =>
      current.status === "ready" ? { ...current, modelName } : current,
    );
  }, []);

  const LoadingView = useCallback(
    () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground/60" />
            </span>
            {t("app.loading.connecting")}
          </div>
        </div>
      </div>
    ),
    [t],
  );

  const ErrorView = useCallback(
    () =>
      state.status === "error" ? (
        <div className="flex h-full w-full items-center justify-center px-4 text-center">
          <div className="flex max-w-md flex-col items-center gap-3">
            <p className="text-lg font-semibold">{t("app.error.title")}</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              {t("app.error.gatewayHint")}
            </p>
          </div>
        </div>
      ) : null,
    [t, state],
  );

  const AuthView = useCallback(
    () =>
      state.status === "auth" ? (
        <AuthForm
          failed={!!state.failed}
          onSecret={(s) => submitSecret(s)}
        />
      ) : null,
    [state, submitSecret],
  );

  const api = useMemo<UseBootstrapApi>(
    () => ({
      state,
      AuthView,
      LoadingView,
      ErrorView,
      submitSecret,
      logout,
      setModelName,
      refreshReady,
    }),
    [state, AuthView, LoadingView, ErrorView, submitSecret, logout, setModelName, refreshReady],
  );
  return api;
}
