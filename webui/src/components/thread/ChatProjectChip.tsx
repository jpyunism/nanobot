import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatProject } from "@/hooks/useChatProject";
import { useClient } from "@/providers/ClientProvider";
import { useProjects } from "@/hooks/useProjects";
import { useSessions } from "@/hooks/useSessions";
import { cn } from "@/lib/utils";

interface ChatProjectChipProps {
  chatId: string;
  sessionKey: string;
  projectId: string | null | undefined;
  token: string;
  onChanged?: () => void;
}

export function ChatProjectChip({
  chatId,
  sessionKey,
  projectId,
  token,
  onChanged,
}: ChatProjectChipProps) {
  const { t } = useTranslation("common");
  const { token: clientToken } = useClient();
  const base = "";
  const [open, setOpen] = useState(false);
  const effectiveToken = token || clientToken;
  const projectsState = useProjects(base, effectiveToken);
  const binding = useChatProject(base, effectiveToken, sessionKey, projectId);
  const { refresh: refreshSessions } = useSessions();

  useEffect(() => {
    if (open) {
      void projectsState.refresh();
    }
    // Intentionally exclude `projectsState` from deps: it is recreated on every
    // render and including it would re-trigger the fetch in a tight loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveToken]);

  const bound = projectsState.projects.find((p) => p.id === binding.projectId);
  const displayName = bound?.name ?? t("chat.projectNone", { defaultValue: "No project" });

  const onPick = async (id: string) => {
    try {
      await binding.bind(id);
      // Refresh the sidebar session list so the chat jumps to the new
      // project group without waiting for the next turn-end.
      void refreshSessions();
      onChanged?.();
    } catch {
      // useChatProject already surfaces the error
    }
  };

  const onClear = async () => {
    try {
      await binding.unbind();
      void refreshSessions();
      onChanged?.();
    } catch {
      // ignored
    }
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "host-no-drag inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            bound
              ? "bg-accent/40 text-accent-foreground hover:bg-accent"
              : "text-muted-foreground/70 hover:bg-accent/30 hover:text-muted-foreground",
          )}
          aria-label={t("chat.projectAriaLabel", { defaultValue: "Project binding" })}
          data-chat-id={chatId}
        >
          <FolderKanban className="h-3 w-3" />
          <span className="max-w-[5.5rem] truncate sm:max-w-[10rem]">{displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("projects.bindToChat", { defaultValue: "Bind chat to project" })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projectsState.loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("projects.loading", { defaultValue: "Loading…" })}
          </div>
        ) : projectsState.projects.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {t("projects.empty", { defaultValue: "No projects yet." })}
          </div>
        ) : (
          projectsState.projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              disabled={binding.loading || p.id === binding.projectId}
              onSelect={() => void onPick(p.id)}
              className="flex items-center gap-2"
            >
              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === binding.projectId ? (
                <span className="text-[10px] text-muted-foreground">
                  {t("chat.projectCurrent", { defaultValue: "current" })}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        {binding.projectId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={binding.loading}
              onSelect={() => void onClear()}
              className="flex items-center gap-2 text-destructive"
            >
              <X className="h-3.5 w-3.5" />
              {t("chat.projectUnassign", { defaultValue: "Unassign" })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default Button;
