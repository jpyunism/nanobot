import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Loader2, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/useProjects";
import { useClient } from "@/providers/ClientProvider";
import { cn } from "@/lib/utils";

interface ChatProjectChipProps {
  chatId: string;
  projectId: string | null | undefined;
  token: string | null;
  baseUrl?: string;
  onChanged?: () => void;
}

export function ChatProjectChip({
  chatId,
  projectId,
  token,
  baseUrl = "",
  onChanged,
}: ChatProjectChipProps) {
  const { t } = useTranslation();
  const ctx = useClient();
  const { projects, loading, refresh } = useProjects({ token, baseUrl });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentProject = useMemo(
    () => (projectId ? projects.find((p) => p.id === projectId) : null),
    [projectId, projects],
  );

  const handleBind = useCallback(
    async (targetProjectId: string) => {
      setBusy(true);
      try {
        await ctx.client.bindProject(chatId, targetProjectId);
        await refresh();
        onChanged?.();
      } catch (err) {
        console.warn("bind project failed", err);
      } finally {
        setBusy(false);
        setOpen(false);
      }
    },
    [chatId, ctx.client, refresh, onChanged],
  );

  const handleUnbind = useCallback(async () => {
    setBusy(true);
    try {
      await ctx.client.unbindProject(chatId);
      await refresh();
      onChanged?.();
    } catch (err) {
      console.warn("unbind project failed", err);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, [chatId, ctx.client, refresh, onChanged]);

  if (!token) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            currentProject
              ? "bg-accent/40 text-accent-foreground hover:bg-accent"
              : "text-muted-foreground/70 hover:bg-accent/30 hover:text-muted-foreground",
          )}
        >
          <FolderKanban className="h-3 w-3" />
          {currentProject ? currentProject.name : t("chat.projectNone", { defaultValue: "No project" })}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("projects.loading", { defaultValue: "Loading…" })}
          </div>
        ) : (
          <>
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                disabled={busy || p.id === projectId}
                onSelect={() => void handleBind(p.id)}
                className="flex items-center gap-2"
              >
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === projectId && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("chat.projectCurrent", { defaultValue: "current" })}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            {projectId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void handleUnbind()}
                  className="flex items-center gap-2 text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("chat.projectUnassign", { defaultValue: "Unassign" })}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
