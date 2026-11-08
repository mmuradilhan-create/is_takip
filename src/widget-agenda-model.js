import { calendarEntries } from "./calendar-model.js";
import { localDate } from "./model.js";

/** Today/tomorrow are relative local calendar days; reading never edits work. */
export function widgetAgenda(
  records,
  date = new Date(),
  { dayOffset = 0 } = {},
) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new TypeError("Ajanda için geçerli bir tarih gereklidir.");
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const today = localDate(date);
  const tomorrow = localDate(next);
  const offset = dayOffset === 1 ? 1 : 0;
  const selectedDate = offset ? tomorrow : today;
  const entries = calendarEntries(records);
  return {
    today,
    tomorrow,
    selectedDate,
    dayOffset: offset,
    todayCount: entries.filter((entry) => entry.date === today).length,
    tomorrowCount: entries.filter((entry) => entry.date === tomorrow).length,
    entries: entries.filter((entry) => entry.date === selectedDate),
  };
}
