import { matchesDashboardQuery } from "./dashboard-model.js";
import { makePlanningPeriod } from "./planning-periods.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3 };
const DUE_TYPES = new Set(["daily", "weekly", "monthly"]);

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Geçerli bir takvim tarihi seçin.");
  makePlanningPeriod("monthly", value);
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(0);
  result.setUTCHours(12, 0, 0, 0);
  result.setUTCFullYear(year, month - 1, day);
  return result;
}

function validDate(value) {
  try {
    calendarDate(value);
    return value;
  } catch {
    return null;
  }
}

function dateKey(value) {
  const year = value.getUTCFullYear();
  if (year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function daysFrom(start, count) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return dateKey(day);
  });
}

/** The calendar uses saved deadlines and follow-up plans, never inferred dates. */
export function calendarEntries(records, { query = "" } = {}) {
  if (!Array.isArray(records))
    throw new TypeError("Takvim için kayıt listesi gereklidir.");
  return records
    .filter(
      (record) =>
        !CLOSED.has(record.status) && matchesDashboardQuery(record, query),
    )
    .flatMap((record) => {
      if (record.type === "waiting") {
        const date = validDate(record.nextFollowUpDate);
        return date ? [{ record, date, kind: "followup" }] : [];
      }
      if (!DUE_TYPES.has(record.type)) return [];
      const date = validDate(record.dueDate);
      return date ? [{ record, date, kind: "due" }] : [];
    })
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        Number(first.kind === "followup") -
          Number(second.kind === "followup") ||
        (PRIORITY[first.record.priority] ?? 2) -
          (PRIORITY[second.record.priority] ?? 2) ||
        String(first.record.title).localeCompare(
          String(second.record.title),
          "tr-TR",
        ) ||
        String(first.record.id).localeCompare(String(second.record.id)),
    );
}

/** Monday-first month grids include adjacent dates to fill complete weeks. */
export function buildCalendarMonth(date) {
  calendarDate(date);
  const period = makePlanningPeriod("monthly", date);
  const first = calendarDate(period.start);
  const offset = (first.getUTCDay() + 6) % 7;
  const count =
    Math.ceil((offset + calendarDate(period.end).getUTCDate()) / 7) * 7;
  first.setUTCDate(first.getUTCDate() - offset);
  return { period, days: daysFrom(first, count) };
}

/** Week calculations use local calendar keys with UTC arithmetic across DST. */
export function buildCalendarWeek(date) {
  const first = calendarDate(date);
  const period = makePlanningPeriod("weekly", date);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return { period, days: daysFrom(first, 7) };
}
