import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronLeft,
  ListChecks,
  Plus,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TodoListSummary } from "@/lib/types";

interface Props {
  lists: TodoListSummary[];
  loading: boolean;
  needsMigration: boolean;
  onOpen: (slug: string) => void;
  onCreate: (name: string) => void;
  onDelete: (slug: string) => void;
  onMigrate: () => void;
  onRefresh: () => void;
  onBackToChat: () => void;
}

export function TodoListsIndex({
  lists,
  loading,
  needsMigration,
  onOpen,
  onCreate,
  onDelete,
  onMigrate,
  onRefresh,
  onBackToChat,
}: Props) {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      onCreate(newName.trim());
      setNewName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (slug: string, name: string) => {
    if (!confirm(t("todos.deleteConfirm", { defaultValue: `Delete list "${name}"?` }))) return;
    onDelete(slug);
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <button
          type="button"
          onClick={onBackToChat}
          className="touch-target -ml-1 mb-1 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground lg:hidden"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          {t("settings.backToChat", { defaultValue: "Back to chat" })}
        </button>
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <ListChecks className="h-6 w-6" aria-hidden />
              {t("todos.title", { defaultValue: "Todos" })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("todos.subtitle", {
                defaultValue: "Your todo lists. Each one has a dedicated chat to edit via the agent.",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              aria-label={t("todos.refresh", { defaultValue: "Refresh" })}
              disabled={loading}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
            </Button>
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden />
              <span>{t("todos.newList", { defaultValue: "New list" })}</span>
            </Button>
          </div>
        </header>

        {needsMigration ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  {t("todos.migrate.title", { defaultValue: "Legacy todos.json found" })}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("todos.migrate.body", {
                    defaultValue:
                      "Migrate the old single-file todos.json into one file per list.",
                  })}
                </p>
              </div>
              <Button size="sm" onClick={onMigrate}>
                <WandSparkles className="h-4 w-4" />
                {t("todos.migrate.button", { defaultValue: "Migrate" })}
              </Button>
            </div>
          </div>
        ) : null}

        {showCreate ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-end gap-3">
              <div className="grid flex-1 gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("todos.nameLabel", { defaultValue: "List name" })}
                </label>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("todos.namePlaceholder", { defaultValue: "e.g. Compras" })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleCreate();
                    }
                  }}
                />
              </div>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                {t("todos.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating
                  ? t("todos.creating", { defaultValue: "Creating…" })
                  : t("todos.create", { defaultValue: "Create" })}
              </Button>
            </div>
          </div>
        ) : null}

        {lists.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
            {t("todos.empty", { defaultValue: "No lists yet. Click 'New list' to create one." })}
          </div>
        ) : (
          <ul className="grid gap-3">
            {lists.map((l) => (
              <li key={l.slug}>
                <TodoListCard
                  list={l}
                  onOpen={() => onOpen(l.slug)}
                  onDelete={() => handleDelete(l.slug, l.name)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TodoListCard({
  list,
  onOpen,
  onDelete,
}: {
  list: TodoListSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const pct = list.item_count > 0 ? Math.round((list.done_count / list.item_count) * 100) : 0;
  return (
    <div className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-border">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <div className="font-medium text-foreground">{list.name}</div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3 w-3" aria-hidden />
            {t("todos.progress", {
              defaultValue: "{{done}}/{{total}} ({{pct}}%)",
              done: list.done_count,
              total: list.item_count,
              pct,
            })}
          </span>
          <span>{list.slug}</span>
        </div>
        {list.item_count > 0 ? (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}