import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardChatModal } from "@/components/projects/CardChatModal";
import type { Board, BoardCard, BoardColumn } from "@/lib/types";
import type { BoardState } from "@/hooks/useBoard";

type Props = {
  projectId: string;
  board: Board;
  state: BoardState;
};

export function BoardView({ projectId, board, state }: Props) {
  const { t } = useTranslation();
  const [repoDraft, setRepoDraft] = useState(board.repo_path);
  const [newCol, setNewCol] = useState("");
  const [newCard, setNewCard] = useState<{ col: string; brief: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [chatCard, setChatCard] = useState<BoardCard | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [subagentStatus, setSubagentStatus] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    if (!board.configured) return;
    const inProgress = board.cards.filter((c) => {
      const col = board.columns.find((x) => x.id === c.column_id);
      return col && col.name.toLowerCase().includes("progress");
    });
    if (inProgress.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      for (const card of inProgress) {
        if (cancelled) return;
        try {
          const status = await state.cardSubagentStatus(card.id);
          if (status) {
            setSubagentStatus((prev) => ({ ...prev, [card.id]: status }));
          }
        } catch {
          // ignore transient errors
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [board, state]);

  if (!board.configured) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="font-medium text-foreground">
          {t("board.setupTitle", { defaultValue: "Set up kanban board" })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("board.setupHint", {
            defaultValue:
              "Point this board at a git repository. Each card becomes a worktree on its own branch.",
          })}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={repoDraft}
            onChange={(e) => setRepoDraft(e.target.value)}
            placeholder={t("board.repoPlaceholder", {
              defaultValue: "/absolute/path/to/git/repo",
            })}
          />
          <Button
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                await state.setup(repoDraft.trim());
              } catch (err) {
                setMsg(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
            disabled={!repoDraft.trim() || busy}
          >
            {t("board.setup", { defaultValue: "Set up" })}
          </Button>
        </div>
        {msg ? <p className="mt-2 text-xs text-destructive">{msg}</p> : null}
      </div>
    );
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const cardId = String(active.id);
    const targetCol = String(over.id);
    const card = board.cards.find((c) => c.id === cardId);
    if (!card || card.column_id === targetCol) return;
    void state.moveCard(cardId, targetCol);
    const targetName = board.columns.find((c) => c.id === targetCol)?.name ?? "";
    const name = targetName.toLowerCase();
    if (name.includes("progress")) {
      void state.buildCard(cardId);
    } else if (name.includes("review")) {
      void state.validateCard(cardId);
    }
  };

  const openChat = (card: BoardCard) => {
    setChatCard(card);
  };

  const mergeCard = async (card: BoardCard) => {
    if (!confirm(t("board.mergeConfirm", { defaultValue: "Merge this card's branch into main?" }))) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const output = await state.mergeCard(card.id, "main");
      setMsg(t("board.merged", { defaultValue: "Merged: {{output}}", output }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("board.repo", { defaultValue: "Repo: {{path}}", path: board.repo_path })}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            placeholder={t("board.newColumn", { defaultValue: "New column…" })}
            className="h-8 w-40"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!newCol.trim()) return;
              await state.addColumn(newCol.trim());
              setNewCol("");
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {board.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={board.cards.filter((c) => c.column_id === col.id)}
              busy={busy}
              onAddCard={() => setNewCard({ col: col.id, brief: "" })}
              onRemoveColumn={() => void state.removeColumn(col.id)}
              onOpenChat={openChat}
              onMerge={mergeCard}
              onPlan={(cardId) => void state.planCard(cardId)}
              onDeleteCard={(id) => void state.deleteCard(id)}
              subagentStatus={subagentStatus}
            />
          ))}
        </div>
      </DndContext>

      {newCard ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <textarea
            autoFocus
            rows={4}
            value={newCard.brief}
            onChange={(e) => setNewCard({ ...newCard, brief: e.target.value })}
            placeholder={t("board.briefPlaceholder", {
              defaultValue: "Describe in detail what you want the agent to do…",
            })}
            className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNewCard(null)}>
              {t("board.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!newCard.brief.trim()) return;
                await state.addCard(newCard.brief.trim(), newCard.col);
                setNewCard(null);
              }}
              disabled={!newCard.brief.trim()}
            >
              {t("board.add", { defaultValue: "Add" })}
            </Button>
          </div>
        </div>
      ) : null}

      {chatCard ? (
        <CardChatModal
          projectId={projectId}
          card={chatCard}
          state={state}
          onClose={() => setChatCard(null)}
        />
      ) : null}
    </div>
  );
}

type ColumnProps = {
  column: BoardColumn;
  cards: BoardCard[];
  busy: boolean;
  onAddCard: () => void;
  onRemoveColumn: () => void;
  onOpenChat: (card: BoardCard) => void;
  onMerge: (card: BoardCard) => void;
  onPlan: (cardId: string) => void;
  onDeleteCard: (id: string) => void;
  subagentStatus: Record<string, Record<string, unknown>>;
};

function Column({
  column,
  cards,
  busy,
  onAddCard,
  onRemoveColumn,
  onOpenChat,
  onMerge,
  onPlan,
  onDeleteCard,
  subagentStatus,
}: ColumnProps) {
  const { t } = useTranslation();
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <span className="text-sm font-medium text-foreground">{column.name}</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">{cards.length}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemoveColumn}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </div>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-2">
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              busy={busy}
              status={subagentStatus[card.id]}
              onOpenChat={() => onOpenChat(card)}
              onMerge={() => onMerge(card)}
              onPlan={() => onPlan(card.id)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
        </div>
      </SortableContext>
      <button
        type="button"
        onClick={onAddCard}
        className="m-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {t("board.addCard", { defaultValue: "Add card" })}
      </button>
    </div>
  );
}

type CardProps = {
  card: BoardCard;
  busy: boolean;
  status?: Record<string, unknown>;
  onOpenChat: () => void;
  onMerge: () => void;
  onPlan: () => void;
  onDelete: () => void;
};

function SortableCard({ card, busy, status, onOpenChat, onMerge, onPlan, onDelete }: CardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border border-border/60 bg-card p-2.5 active:cursor-grabbing"
    >
      <div className="text-sm font-medium text-foreground">{card.title || t("board.untitled", { defaultValue: "Untitled task" })}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <GitBranch className="h-3 w-3" aria-hidden />
        <span className="truncate">{card.branch}</span>
      </div>
      {status ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          {status.phase === "done" ? (
            <span className="text-emerald-600">
              {t("board.done", { defaultValue: "✓ Done" })}
            </span>
          ) : status.phase === "error" ? (
            <span className="text-destructive">
              {t("board.error", { defaultValue: "✗ Error" })}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              {t("board.running", { defaultValue: "Running…" })}
            </span>
          )}
        </div>
      ) : null}
      {card.phase_history?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
          {card.phase_history.map((h) => (
            <span
              key={h.task_id}
              className={
                "rounded px-1 py-0.5 " +
                (h.status === "ok"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : h.status === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground")
              }
            >
              {h.phase}{h.status === "ok" ? " ✓" : h.status === "running" ? " …" : ""}
            </span>
          ))}
        </div>
      ) : null}
      {card.brief ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            {t("board.brief", { defaultValue: "Brief" })}
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{card.brief}</p>
        </details>
      ) : null}
      {card.plan ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            {t("board.plan", { defaultValue: "Plan" })}
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{card.plan}</p>
        </details>
      ) : null}
      {card.build_result ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            {t("board.buildResult", { defaultValue: "Build result" })}
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{card.build_result}</p>
        </details>
      ) : null}
      {card.review_summary ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            {t("board.reviewSummary", { defaultValue: "Review summary" })}
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{card.review_summary}</p>
        </details>
      ) : null}
      <div className="mt-2 flex items-center gap-1">
        {card.subagent_task_id ? null : (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onPlan} disabled={busy}>
            {t("board.generatePlan", { defaultValue: "Generate plan" })}
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onOpenChat} disabled={busy}>
          {t("board.openChat", { defaultValue: "Open chat" })}
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onMerge} disabled={busy}>
          {t("board.merge", { defaultValue: "Merge" })}
        </Button>
        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
