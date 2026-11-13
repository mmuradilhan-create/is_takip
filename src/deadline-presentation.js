import { localDate } from "./model.js";
import { deadlineTone } from "./deadlines.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});
const SYMBOLS = {
  warning: "M12 3 2 21h20L12 3Zm0 6v5m0 3h.01",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  calendar: "M7 2v4M17 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  minus: "M5 12h14",
  // A target: due today, the strongest of the near dates.
  today:
    "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M13.6 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0",
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

/** The date remains the only visible label; its state has an explicit tooltip. */
export function deadlinePresentation(record, today = localDate()) {
  const date = record?.dueDate ? new Date(`${record.dueDate}T12:00:00`) : null;
  const hasDate =
    date && !Number.isNaN(date.getTime()) && localDate(date) === record.dueDate;
  const tone = hasDate ? deadlineTone(record, today) : "";
  const state = !hasDate
    ? "missing"
    : CLOSED.has(record.status)
      ? "closed"
      : tone || "scheduled";
  const status = {
    missing: "Teslim tarihi belirlenmedi",
    closed: "Kapalı kayıt",
    overdue: "Teslim tarihi geçti",
    "due-soon":
      record?.dueDate === today ? "Bugün teslim" : "3 gün içinde teslim",
    scheduled:
      record?.dueDate === today ? "Bugün teslim" : "Planlanan teslim tarihi",
  }[state];
  // Due today reads as a filled box with a target; the next days keep the
  // light amber and clock.
  const dueToday =
    ["due-soon", "scheduled"].includes(state) && record?.dueDate === today;
  const icon = dueToday
    ? "today"
    : {
        overdue: "warning",
        "due-soon": "clock",
        scheduled: "calendar",
        closed: "calendar",
        missing: "minus",
      }[state];
  return {
    tone,
    state,
    status,
    icon,
    dueToday,
    label: hasDate ? dateFormatter.format(date) : "Tarih yok",
  };
}

export function deadlineChipContent(
  record,
  { label, today = localDate() } = {},
) {
  const presentation = deadlinePresentation(record, today);
  const text =
    presentation.state === "missing"
      ? presentation.label
      : label || presentation.label;
  return `<svg class="deadline-symbol" data-deadline-icon="${presentation.icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${SYMBOLS[presentation.icon]}"></path></svg><span class="deadline-label">${esc(text)}</span>`;
}

/** A read-only chip for summaries and supporting-work panels. */
export function renderDeadlineChip(
  record,
  { label, today = localDate(), className = "" } = {},
) {
  const presentation = deadlinePresentation(record, today);
  const text =
    presentation.state === "missing"
      ? presentation.label
      : label || presentation.label;
  const title = `${text} · ${presentation.status}`;
  return `<span class="deadline-tag ${esc(className)} ${presentation.tone}" data-deadline-state="${presentation.state}"${presentation.dueToday ? " data-due-today" : ""} title="${esc(title)}" aria-label="${esc(title)}">${deadlineChipContent(record, { label: text, today })}</span>`;
}
