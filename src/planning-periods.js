import { localDate } from "./model.js";

const DAY_MS = 86400000;
const SUPPORTED_TYPES = new Set(["weekly", "monthly", "yearly"]);
const monthName = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  timeZone: "UTC",
});

// Calendar dates are calculated in UTC to avoid daylight-saving changes. The
// incoming/default date is still the user's local calendar date, not UTC now.
function calendarDate(value) {
  const text = value instanceof Date ? localDate(value) : String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("Geçerli bir dönem tarihi seçin.");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = fromParts(year, month, day);
  if (
    year < 1 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Geçerli bir dönem tarihi seçin.");
  }
  return date;
}

function fromParts(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function dateKey(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isoWeekKey(date) {
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday - fromParts(year, 1, 1)) / DAY_MS + 1) / 7);
  return `${String(year).padStart(4, "0")}-W${String(week).padStart(2, "0")}`;
}

function weekLabel(start, end) {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${monthName.format(end)} ${end.getUTCFullYear()}`;
  }
  const firstYear = sameYear ? "" : ` ${start.getUTCFullYear()}`;
  return `${start.getUTCDate()} ${monthName.format(start)}${firstYear} – ${end.getUTCDate()} ${monthName.format(end)} ${end.getUTCFullYear()}`;
}

/** Create one weekly, monthly or yearly period from a local calendar date. */
export function makePlanningPeriod(type, date = localDate()) {
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error("Bu liste için dönem seçimi kullanılamaz.");
  }
  const selected = calendarDate(date);
  let start;
  let end;
  let key;
  let label;
  if (type === "weekly") {
    start = new Date(selected);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    key = isoWeekKey(selected);
    label = weekLabel(start, end);
  } else if (type === "monthly") {
    const year = selected.getUTCFullYear();
    const month = selected.getUTCMonth() + 1;
    start = fromParts(year, month, 1);
    end = fromParts(year, month + 1, 0);
    key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    label = `${monthName.format(start)} ${year}`;
    label = label[0].toLocaleUpperCase("tr-TR") + label.slice(1);
  } else {
    const year = selected.getUTCFullYear();
    start = fromParts(year, 1, 1);
    end = fromParts(year, 12, 31);
    key = String(year).padStart(4, "0");
    label = String(year);
  }
  return { type, key, start: dateKey(start), end: dateKey(end), label };
}

/** Move by whole periods; starting at day one avoids month-end overflow. */
export function shiftPlanningPeriod(period, delta) {
  if (
    !period ||
    !SUPPORTED_TYPES.has(period.type) ||
    !Number.isInteger(delta)
  ) {
    throw new Error("Geçerli bir dönem ve adım seçin.");
  }
  const canonical = periodFromKey(period.type, period.key);
  if (!canonical) throw new Error("Geçerli bir dönem seçin.");
  const next = calendarDate(canonical.start);
  if (period.type === "weekly") next.setUTCDate(next.getUTCDate() + delta * 7);
  else if (period.type === "monthly")
    next.setUTCMonth(next.getUTCMonth() + delta);
  else next.setUTCFullYear(next.getUTCFullYear() + delta);
  return makePlanningPeriod(period.type, dateKey(next));
}

function periodFromKey(type, value) {
  const key = typeof value === "string" ? value.trim() : "";
  let anchor;
  if (type === "weekly") {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (year < 1 || year > 9999 || week < 1 || week > 53) return null;
    anchor = fromParts(year, 1, 4);
    anchor.setUTCDate(
      anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7) + (week - 1) * 7,
    );
  } else if (type === "monthly") {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(key)) return null;
    anchor = fromParts(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1);
  } else if (type === "yearly") {
    if (!/^\d{4}$/.test(key)) return null;
    anchor = fromParts(Number(key), 1, 1);
  } else return null;
  try {
    const period = makePlanningPeriod(type, dateKey(anchor));
    return period.key === key ? period : null;
  } catch {
    return null;
  }
}

/** An explicit, valid planning period wins over the record's delivery date. */
export function matchesPlanningPeriod(record, period) {
  if (period == null) return true;
  if (!record || record.type !== period.type) return false;
  const selected = periodFromKey(period.type, period.key);
  if (!selected) return false;
  const explicit = periodFromKey(record.type, record.periodKey);
  if (explicit) return explicit.key === selected.key;
  try {
    return makePlanningPeriod(record.type, record.dueDate).key === selected.key;
  } catch {
    return false;
  }
}
