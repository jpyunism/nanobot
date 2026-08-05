import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import type { UseAgenda } from "@/hooks/useAgenda";
import type {
  AgendaAppointment,
  AgendaCategory,
  AgendaCreatePayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function useCategories(t: (key: string) => string): { value: AgendaCategory; label: string; color: string }[] {
  return useMemo(
    () => [
      { value: "personal", label: t("agenda.categories.personal"), color: "#3b82f6" },
      { value: "work", label: t("agenda.categories.work"), color: "#10b981" },
      { value: "health", label: t("agenda.categories.health"), color: "#ef4444" },
      { value: "reminder", label: t("agenda.categories.reminder"), color: "#f59e0b" },
      { value: "journal", label: t("agenda.categories.journal"), color: "#8b5cf6" },
      { value: "other", label: t("agenda.categories.other"), color: "#64748b" },
    ],
    [t],
  );
}

function useWeekdayLabels(t: (key: string) => string): string[] {
  return useMemo(
    () => [
      t("agenda.weekday.mon"),
      t("agenda.weekday.tue"),
      t("agenda.weekday.wed"),
      t("agenda.weekday.thu"),
      t("agenda.weekday.fri"),
      t("agenda.weekday.sat"),
      t("agenda.weekday.sun"),
    ],
    [t],
  );
}

function activeLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(activeLocale(), {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

function toISODate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(year, month, day);
}

interface Props {
  agenda: UseAgenda;
  onBackToChat: () => void;
}

export function AgendaSurface({ agenda, onBackToChat }: Props) {
  const { t } = useTranslation();
  const WEEKDAY_LABELS = useWeekdayLabels(t);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(() =>
    toISODate(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [editing, setEditing] = useState<AgendaAppointment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [composerText, setComposerText] = useState("");

  const sendComposer = useCallback(() => {
    const text = composerText.trim();
    if (!text || agenda.assistant.running) return;
    void agenda.sendMessage(text);
    setComposerText("");
  }, [composerText, agenda]);

  const byDate = useMemo(() => {
    const map = new Map<string, AgendaAppointment[]>();
    for (const appt of agenda.appointments) {
      const list = map.get(appt.date) ?? [];
      list.push(appt);
      map.set(appt.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [agenda.appointments]);

  const selectedAppointments = byDate.get(selectedDate) ?? [];

  const goPrev = () => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };
  const goNext = () => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };
  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(toISODate(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  const cells = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-settings-canvas">
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("agenda.backToChats")}
          </button>
          <div className="mx-2 h-5 w-px bg-border" />
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">{t("agenda.title")}</h1>
        </div>

        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("agenda.prevMonthAria")}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="min-w-[180px] text-center text-xl font-semibold capitalize text-foreground">
              {monthLabel(viewYear, viewMonth)}
            </h2>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("agenda.nextMonthAria")}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {t("agenda.today")}
          </button>
        </div>

        {/* Calendar grid */}
        <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const isCurrentMonth = cell.month === viewMonth;
              const iso = toISODate(cell.year, cell.month, cell.day);
              const appts = byDate.get(iso) ?? [];
              const isSelected = iso === selectedDate;
              const isToday = iso === toISODate(today.getFullYear(), today.getMonth(), today.getDate());
              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}`}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={cn(
                    "flex min-h-[64px] flex-col items-start gap-1 border-t border-r border-border p-1.5 text-left transition-colors",
                    "border-t-0 first:border-l-0",
                    !isCurrentMonth && "bg-muted/40",
                    isSelected && "bg-accent/60 ring-1 ring-inset ring-primary/40",
                    "hover:bg-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-sm",
                      isToday
                        ? "bg-primary font-bold text-primary-foreground"
                        : isCurrentMonth
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {cell.day}
                  </span>
                  {appts.length > 0 && (
                    <span className="flex flex-wrap gap-0.5 px-0.5">
                      {appts.slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          title={a.title}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: a.color }}
                        />
                      ))}
                      {appts.length > 3 && (
                        <span className="text-[10px] leading-3 text-muted-foreground">
                          +{appts.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day appointments */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              {formatSelectedDate(selectedDate)}
            </h3>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen((o) => !o);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
            <Plus className="h-4 w-4" />
            {t("agenda.newAppointment")}
          </button>
          </div>

          {agenda.loading && !formOpen ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : selectedAppointments.length === 0 && !formOpen ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t("agenda.noAppointments")}
            </p>
          ) : null}

          {selectedAppointments.length > 0 && (
            <ul className="space-y-2">
              {selectedAppointments.map((appt) => (
                <li
                  key={appt.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                  style={{ borderLeftWidth: 4, borderLeftColor: appt.color }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {appt.time ? appt.time : t("agenda.allDay")}
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {appt.title}
                      </span>
                    </div>
                    {appt.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {appt.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Editar ${appt.title}`}
                      onClick={() => {
                        setEditing(appt);
                        setFormOpen(true);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${appt.title}`}
                      onClick={() => void agenda.removeAppointment(appt.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Input form */}
          {formOpen && (
            <AgendaForm
              defaultDate={selectedDate}
              editing={editing}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              onSave={async (payload) => {
                if (editing) {
                  await agenda.updateAppointment(editing.id, payload);
                } else {
                  await agenda.createAppointment(payload);
                }
                setFormOpen(false);
                setEditing(null);
              }}
            />
          )}

          {agenda.error && (
            <p className="mt-2 text-sm text-destructive">{agenda.error}</p>
          )}

          {/* Assistant strip */}
          {agenda.assistant.lastText && (
            <div className="mb-4 border-t border-border/40 bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground">
              <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                <Sparkles className="h-3 w-3" />
                {t("agenda.assistant")}
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap break-words leading-4">
                {agenda.assistant.lastText}
              </div>
            </div>
          )}

          {/* Ask AI composer */}
          <div className="border-t border-border/60 bg-background p-3">
            <div className="mx-auto flex max-w-[58rem] flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  <Sparkles className="h-3 w-3" />
                  {t("agenda.askAi")}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder={t("agenda.composer.placeholder")}
                  disabled={agenda.assistant.running}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendComposer();
                    }
                  }}
                  className="min-h-[2.25rem] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                <Button
                  size="icon"
                  onClick={sendComposer}
                  disabled={!composerText.trim() || agenda.assistant.running}
                  aria-label={t("agenda.composer.send")}
                >
                  {agenda.assistant.running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GridCell {
  year: number;
  month: number;
  day: number;
}

function buildGrid(year: number, month: number): GridCell[] {
  const firstOfMonth = new Date(year, month, 1);
  // Monday-first: JS getDay() returns 0=Sunday, so (getDay() + 6) % 7
  const leading = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - leading);
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    });
  }
  return cells;
}

function formatSelectedDate(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat(activeLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

interface AgendaFormProps {
  defaultDate: string;
  editing: AgendaAppointment | null;
  onCancel: () => void;
  onSave: (payload: AgendaCreatePayload) => Promise<void>;
}

function AgendaForm({ defaultDate, editing, onCancel, onSave }: AgendaFormProps) {
  const { t } = useTranslation();
  const CATEGORIES = useCategories(t);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [time, setTime] = useState(editing?.time ?? "09:00");
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [category, setCategory] = useState<AgendaCategory>(
    (editing?.category as AgendaCategory) || "personal",
  );
  const [description, setDescription] = useState(editing?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AgendaCreatePayload = {
      title: title.trim(),
      date,
      all_day: allDay,
      description: description.trim(),
      category,
    };
    if (!allDay) payload.time = time || null;
    else payload.time = null;
    setSaving(true);
    setError(null);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            {editing ? t("agenda.form.editTitle") : t("agenda.form.newTitle")}
          </h4>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("agenda.form.close")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">
          {t("agenda.form.titleLabel")}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("agenda.form.titlePlaceholder")}
            required
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium text-foreground">
            {t("agenda.form.dateLabel")}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            {t("agenda.form.categoryLabel")}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AgendaCategory)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className={cn(
              "block text-sm font-medium text-foreground",
              allDay && "opacity-50",
            )}
          >
            {t("agenda.form.timeLabel")}
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={allDay}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          {t("agenda.form.allDay")}
        </label>

        <label className="block text-sm font-medium text-foreground">
          {t("agenda.form.notesLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("agenda.form.notesPlaceholder")}
            className="mt-1 block w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          {t("agenda.form.cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? t("agenda.form.save") : t("agenda.form.add")}
        </button>
      </div>
    </form>
  );
}
