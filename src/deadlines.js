import { isOverdue, localDate } from "./model.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/** Today's deliveries and the next three calendar days need an orange cue. */
export function isDueSoon(record, today = localDate()) {
  if (record?.type !== "daily" || CLOSED.has(record.status)) return false;
  const start = calendarDate(today);
  const due = calendarDate(record.dueDate);
  if (!start || !due) return false;
  const end = new Date(start);
  // Calendar arithmetic avoids treating a daylight-saving change as a whole
  // extra or missing day. Only dates, not local hours, define this window.
  end.setUTCDate(end.getUTCDate() + 3);
  return due >= start && due <= end;
}

export function deadlineTone(record, today = localDate()) {
  if (!record) return "";
  if (isOverdue(record, today)) return "overdue";
  return isDueSoon(record, today) ? "due-soon" : "";
}
