import { useBootstrap } from "@/hooks/useBootstrap";
import { useLocalAppearance } from "@/hooks/useLocalAppearance";
import { useNativeEngineRestart } from "@/hooks/useNativeEngineRestart";
import { ClientProvider } from "@/providers/ClientProvider";
import { AppShell } from "@/components/shell/AppShell";

export default function App() {
  const boot = useBootstrap();
  useLocalAppearance();
  const onNativeEngineRestart = useNativeEngineRestart({
    state: boot.state,
    bootRefreshReady: boot.refreshReady,
  });

  if (boot.state.status === "loading") {
    return <boot.LoadingView />;
  }
  if (boot.state.status === "auth") {
    return <boot.AuthView />;
  }
  if (boot.state.status === "error") {
    return <boot.ErrorView />;
  }
  const state = boot.state;
  return (
    <ClientProvider
      client={state.client}
      token={state.token}
      modelName={state.modelName}
      ingressLimits={state.ingressLimits}
    >
      <AppShell
        runtimeSurface={state.runtimeSurface}
        onModelNameChange={boot.setModelName}
        onLogout={boot.logout}
        onNativeEngineRestart={onNativeEngineRestart}
      />
    </ClientProvider>
  );
}
