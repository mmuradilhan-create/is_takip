import { calendarEntries } from "./calendar-model.js";
import { localDate } from "./model.js";

/** Relative local days and overdue plans use saved dates; reading never edits work. */
export function widgetAgenda(
  records,
  date = new Date(),
  { dayOffset = 0, view } = {},
) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new TypeError("Ajanda için geçerli bir tarih gereklidir.");
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const today = localDate(date);
  const tomorrow = localDate(next);
  const selectedView = ["today", "tomorrow", "overdue"].includes(view)
    ? view
    : dayOffset === 1
      ? "tomorrow"
      : "today";
  const offset = selectedView === "tomorrow" ? 1 : 0;
  const selectedDate = offset ? tomorrow : today;
  const entries = calendarEntries(records);
  const overdue = entries.filter((entry) => entry.date < today);
  return {
    today,
    tomorrow,
    selectedDate,
    dayOffset: offset,
    view: selectedView,
    todayCount: entries.filter((entry) => entry.date === today).length,
    tomorrowCount: entries.filter((entry) => entry.date === tomorrow).length,
    overdueCount: overdue.length,
    entries:
      selectedView === "overdue"
        ? overdue
        : entries.filter((entry) => entry.date === selectedDate),
  };
}
