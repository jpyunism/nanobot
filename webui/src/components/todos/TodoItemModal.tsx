import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TodoItem, TodoUser } from "@/lib/types";

interface Props {
  open: boolean;
  item: TodoItem | null;
  users: Record<string, TodoUser>;
  onOpenChange: (open: boolean) => void;
  onSave: (changes: Partial<TodoItem>) => void;
}

export function TodoItemModal({ open, item, users, onOpenChange, onSave }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [link, setLink] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!item) return;
    setText(item.text ?? "");
    setAssignee(item.assignee ?? "");
    setDueDate(item.due_date ?? "");
    setLink(item.link ?? "");
    setPrice(item.price_clp != null ? String(item.price_clp) : "");
    setNotes(typeof item.notes === "string" ? item.notes : "");
  }, [item]);

  if (!item) return null;

  const save = () => {
    const changes: Partial<TodoItem> = {
      text: text.trim(),
      assignee: assignee.trim() || null,
      due_date: dueDate.trim() ? dueDate.trim() : null,
      link: link.trim() || null,
      price_clp: price.trim() === "" ? null : Number(price.replace(/[^\d]/g, "")) || null,
      notes: notes.trim() || null,
    };
    onSave(changes);
    onOpenChange(false);
  };

  const userOptions = Object.entries(users).map(([id, u]) => ({
    id,
    label: u?.name ?? id,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("todos.item.edit", { defaultValue: "Edit item" })}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("todos.item.text", { defaultValue: "Text" })}
            </span>
            <Textarea
              rows={2}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("todos.item.assignee", { defaultValue: "Assignee" })}
              </span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">
                  {t("todos.item.unassigned", { defaultValue: "— Unassigned —" })}
                </option>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("todos.item.dueDate", { defaultValue: "Due date" })}
              </span>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("todos.item.link", { defaultValue: "Link" })}
              </span>
              <Input
                type="url"
                placeholder="https://"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("todos.item.price", { defaultValue: "Price (CLP)" })}
              </span>
              <Input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="$0"
              />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("todos.item.notes", { defaultValue: "Notes" })}
            </span>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("todos.item.notesPlaceholder", { defaultValue: "Any extra details..." })}
              className="text-sm"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("todos.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onClick={save} disabled={!text.trim()}>
            {t("todos.save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}