import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, RefreshCw } from "lucide-react";
import { fetchOllamaUsage } from "@/lib/api";
import type { OllamaUsagePayload } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCost(value: string | undefined): string {
  if (!value) return "—";
  return `$${value}`;
}

function UsageBar({ label, value }: { label: string; value?: number }) {
  const pct = value === undefined || value === null ? 0 : Math.min(100, value * 100);
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 font-medium text-foreground">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
        {formatPercent(value)}
      </span>
    </div>
  );
}

function ModelList({ models }: { models?: Array<{ name?: string; request_count?: number }> }) {
  if (!models || models.length === 0) return null;
  const sorted = [...models].sort((a, b) => (b.request_count ?? 0) - (a.request_count ?? 0));
  return (
    <div className="mt-2 space-y-1">
      {sorted.map((model) => (
        <div key={model.name ?? "?"} className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{model.name}</span>
          <span className="ml-2 shrink-0 tabular-nums">{model.request_count ?? 0} req</span>
        </div>
      ))}
    </div>
  );
}

export function OllamaUsageViewer() {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const { token } = useClient();
  const [data, setData] = useState<OllamaUsagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    if (!token) return;
    setLoading(true);
    fetchOllamaUsage(token)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading && !data) {
    return (
      <div className="mt-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        {tx("settings.usage.loadingOllama", "Loading Ollama usage…")}
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div className="mt-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        {tx("settings.usage.ollamaNotConfigured", "Ollama Cloud usage not configured.")}
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="mt-4 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        {tx("settings.usage.ollamaError", "Could not load Ollama usage.")}
        <button
          type="button"
          onClick={refresh}
          className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          {tx("settings.usage.retry", "Retry")}
        </button>
      </div>
    );
  }

  const session = data.limits?.session;
  const weekly = data.limits?.weekly;
  const cost = data.activity?.cost;

  return (
    <div className="mt-4 border-t border-border/50 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Cloud className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[11px] font-normal leading-none text-muted-foreground/64">
            {tx("settings.usage.ollamaCloud", "Ollama Cloud usage")}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {tx("settings.usage.refresh", "Refresh")}
        </button>
      </div>
      <div className="space-y-1.5">
        <UsageBar label={tx("settings.usage.session", "Session")} value={session?.usage} />
        <UsageBar label={tx("settings.usage.weekly", "Weekly")} value={weekly?.usage} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{tx("settings.usage.cost", "Activity cost")}</span>
        <span className="tabular-nums">{formatCost(cost)}</span>
      </div>
      <ModelList models={weekly?.models} />
    </div>
  );
}
