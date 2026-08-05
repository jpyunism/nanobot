import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ExternalLink,
  MoreHorizontal,
  NotepadText,
  Pencil,
  Trash2,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TodoItem, TodoUser } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  item: TodoItem;
  users: Record<string, TodoUser>;
  onToggleDone: (item: TodoItem) => void;
  onEdit: (item: TodoItem) => void;
  onDelete: (item: TodoItem) => void;
}

function isOverdue(dueDate: string | null, done: boolean): boolean {
  if (!dueDate || done) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return `$${price.toLocaleString("es-CL")}`;
}

export function TodoItemRow({ item, users, onToggleDone, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(item.due_date, item.done);
  const assigneeName = item.assignee ? (users[item.assignee]?.name ?? item.assignee) : null;
  const priceLabel = formatPrice(item.price_clp);

  const handleToggle = async () => {
    setBusy(true);
    try {
      onToggleDone(item);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex min-w-0 items-start gap-2 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
        "hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        aria-label={item.done ? t("todos.item.markUndone", { defaultValue: "Mark as not done" }) : t("todos.item.markDone", { defaultValue: "Mark as done" })}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          item.done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/40 hover:border-foreground/60",
        )}
      >
        {item.done ? <Check className="h-3 w-3" aria-hidden /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("leading-5", item.done && "text-muted-foreground line-through")}>
          {item.text}
        </div>
        {(item.due_date || item.link || item.price_clp != null || assigneeName || item.notes || overdue) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
            {overdue ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t("todos.item.overdue", { defaultValue: "Overdue" })}
              </span>
            ) : item.due_date ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" aria-hidden />
                {item.due_date}
              </span>
            ) : null}
            {assigneeName ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">{assigneeName}</span>
              </span>
            ) : null}
            {priceLabel ? (
              <span className="font-medium tabular-nums">{priceLabel}</span>
            ) : null}
            {item.notes ? (
              <span className="inline-flex items-center gap-1" title={item.notes}>
                <NotepadText className="h-3 w-3" aria-hidden />
                {t("todos.item.notes", { defaultValue: "Notes" })}
              </span>
            ) : null}
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                {t("todos.item.link", { defaultValue: "link" })}
              </a>
            ) : null}
          </div>
        )}
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className={cn(
            "touch-target inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/75 opacity-40 transition-opacity",
            "hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:opacity-100 focus-visible:opacity-100",
          )}
          aria-label={t("chat.actions", { title: item.text })}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[8.5rem] min-w-[8.5rem]">
          <DropdownMenuItem onSelect={() => onEdit(item)}>
            <Pencil className="h-4 w-4 shrink-0" />
            {t("todos.item.edit", { defaultValue: "Edit" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onDelete(item)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            {t("todos.item.delete", { defaultValue: "Delete" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}