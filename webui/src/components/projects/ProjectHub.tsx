import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, KanbanSquare, LayoutPanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { BoardView } from "@/components/projects/BoardView";
import { useBoard } from "@/hooks/useBoard";
import { useClient } from "@/providers/ClientProvider";
import type { ProjectsState } from "@/hooks/useProjects";

type Props = {
  projectId: string;
  state: ProjectsState;
  onBack: () => void;
};

export function ProjectHub({ projectId, state, onBack }: Props) {
  const { t } = useTranslation();
  const { token } = useClient();
  const [tab, setTab] = useState<"overview" | "board">("overview");
  const board = useBoard("", token, tab === "board" ? projectId : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("projects.back", { defaultValue: "Back" })}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("projects.detailTitle", { defaultValue: "Project" })}
          </h1>
        </div>
        <div className="flex items-center rounded-md border border-border/60 p-0.5">
          <Button
            variant={tab === "overview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setTab("overview")}
          >
            <LayoutPanelLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("projects.overviewTab", { defaultValue: "Overview" })}
          </Button>
          <Button
            variant={tab === "board" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setTab("board")}
          >
            <KanbanSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("projects.boardTab", { defaultValue: "Board" })}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">(beta)</span>
          </Button>
        </div>
      </div>

      {tab === "overview" ? (
        <ProjectDetail projectId={projectId} state={state} onClose={() => undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          {board.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {board.error}
            </div>
          ) : null}
          {board.loading && !board.board ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("projects.loading", { defaultValue: "Loading…" })}
            </div>
          ) : board.board ? (
            <BoardView projectId={projectId} board={board.board} state={board} />
          ) : null}
        </div>
      )}
    </div>
  );
}
