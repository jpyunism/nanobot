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
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";
import { cn } from "@/lib/utils";

interface ComposerProjectPickerProps {
  chatId?: string;
  sessionKey: string | null;
  projectId: string | null | undefined;
  token: string;
  isHero?: boolean;
  disabled?: boolean;
  onChanged?: () => void;
  onPendingProjectChange?: (projectId: string | null) => void;
}

export function ComposerProjectPicker({
  chatId,
  sessionKey,
  projectId,
  token,
  isHero = false,
  disabled = false,
  onChanged,
  onPendingProjectChange,
}: ComposerProjectPickerProps) {
  const { t } = useTranslation("common");
  const { token: clientToken } = useClient();
  const base = "";
  const [open, setOpen] = useState(false);
  const effectiveToken = token || clientToken;
  const projectsState = useProjects(base, effectiveToken);
  const binding = useChatProject(base, effectiveToken, sessionKey ?? null, projectId);
  const { refresh: refreshSessions } = useSessions();

  useEffect(() => {
    if (open) {
      void projectsState.refresh();
    }
    // Intentionally exclude `projectsState` from deps: it is recreated on every
    // render and including it would re-trigger the fetch in a tight loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveToken]);

  useEffect(() => {
    const refreshOnChanged = () => {
      if (open) {
        void projectsState.refresh();
      }
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, refreshOnChanged);
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, refreshOnChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectsState.refresh]);

  const bound = projectsState.projects.find((p) => p.id === binding.projectId);
  const displayName = bound?.name ?? t("chat.projectNone", { defaultValue: "No project" });

  const onPick = async (id: string) => {
    if (!sessionKey) {
      onPendingProjectChange?.(id);
      setOpen(false);
      return;
    }
    try {
      await binding.bind(id);
      // Refresh the sidebar session list so the chat jumps to the new
      // project group without waiting for the next turn-end.
      void refreshSessions();
      onChanged?.();
    } catch {
      // useChatProject already surfaces the error
    } finally {
      setOpen(false);
    }
  };

  const onClear = async () => {
    if (!sessionKey) {
      onPendingProjectChange?.(null);
      setOpen(false);
      return;
    }
    try {
      await binding.unbind();
      void refreshSessions();
      onChanged?.();
    } catch {
      // ignored
    } finally {
      setOpen(false);
    }
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          data-testid="composer-project-picker"
          data-chat-id={chatId}
          aria-label={t("chat.projectAriaLabel", { defaultValue: "Project binding" })}
          className={cn(
            "thread-composer-action touch-target inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border/55 font-medium transition-colors",
            isHero
              ? "h-8 px-2.5 text-[12px]"
              : "h-9 px-3 text-[12.5px]",
            bound
              ? "bg-accent/30 text-accent-foreground hover:bg-accent/50"
              : "bg-card text-muted-foreground hover:bg-muted/65 hover:text-foreground",
          )}
        >
          <FolderKanban className={cn("h-3.5 w-3.5 shrink-0", bound && "text-primary")} />
          <span className="max-w-[6rem] truncate sm:max-w-[10rem]">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={8}
        className="w-56 rounded-[18px]"
      >
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
