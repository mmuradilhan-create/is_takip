import { localDate } from "./model.js";
import { matchesDashboardQuery } from "./dashboard-model.js";
import {
  makePlanningPeriod,
  matchesPlanningPeriod,
} from "./planning-periods.js";
import { previousWeeklyGoals, weeklyPeriodFromKey } from "./weekly-flow.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3 };

function active(record) {
  return !CLOSED.has(record.status);
}

function compareDate(first, second) {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second);
}

function comparePriority(first, second) {
  return (PRIORITY[first.priority] ?? 2) - (PRIORITY[second.priority] ?? 2);
}

function compareName(first, second) {
  return (
    String(first.title).localeCompare(String(second.title), "tr-TR") ||
    String(first.id).localeCompare(String(second.id))
  );
}

function limited(records, value, fallback) {
  const count =
    value === Infinity
      ? Infinity
      : Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : fallback;
  return records.slice(0, count);
}

function dateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return "";
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

/** Current goals remain separate from the older unfinished-goal cue. */
export function selectDashboardGoals(
  records,
  { today = localDate(), query = "", limit = 3 } = {},
) {
  const period = makePlanningPeriod("weekly", today);
  const matching = records.filter((record) =>
    matchesDashboardQuery(record, query),
  );
  const current = matching
    .filter(
      (record) =>
        record.type === "weekly" &&
        active(record) &&
        matchesPlanningPeriod(record, period),
    )
    .sort(
      (first, second) =>
        comparePriority(first, second) ||
        compareDate(first.dueDate, second.dueDate) ||
        compareName(first, second),
    );
  return {
    records: limited(current, limit, 3),
    total: current.length,
    previous: previousWeeklyGoals(matching, period).length,
  };
}

function goalWeek(record) {
  const explicit = weeklyPeriodFromKey(record.periodKey);
  if (explicit) return explicit;
  if (typeof record.dueDate !== "string" || !record.dueDate) return null;
  try {
    return makePlanningPeriod("weekly", record.dueDate);
  } catch {
    return null;
  }
}

/** Preview the nearest planned week only when this week's search has no goals. */
export function selectDashboardWeek(
  records,
  { today = localDate(), query = "", limit = 3 } = {},
) {
  const period = makePlanningPeriod("weekly", today);
  const current = selectDashboardGoals(records, { today, query, limit });
  if (current.total) return { ...current, period, isUpcoming: false };

  let upcoming = null;
  for (const record of records) {
    if (
      record.type !== "weekly" ||
      !active(record) ||
      !matchesDashboardQuery(record, query)
    )
      continue;
    const planned = goalWeek(record);
    if (
      planned &&
      planned.start > period.start &&
      (!upcoming || planned.start < upcoming.start)
    )
      upcoming = planned;
  }
  if (!upcoming) return { ...current, period, isUpcoming: false };
  const next = selectDashboardGoals(records, {
    today: upcoming.start,
    query,
    limit,
  });
  return {
    records: next.records,
    total: next.total,
    period: upcoming,
    isUpcoming: true,
    previous: current.previous,
  };
}

/** Only real external follow-up plans enter the attention queue. */
export function selectAttention(
  records,
  { today = localDate(), query = "", limit = 4 } = {},
) {
  const current = dateKey(today);
  if (!current) throw new Error("Geçerli bir gündem tarihi seçin.");
  const end = new Date(`${current}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 3);
  const nearEnd = end.toISOString().slice(0, 10);
  const attention = records
    .filter((record) => active(record) && matchesDashboardQuery(record, query))
    .flatMap((record) => {
      if (record.type !== "waiting") return [];
      const date = dateKey(record.nextFollowUpDate);
      if (!date || date > nearEnd) return [];
      return [
        {
          record,
          date,
          group: date < current ? 0 : date === current ? 1 : 2,
        },
      ];
    })
    .sort(
      (first, second) =>
        first.group - second.group ||
        compareDate(first.date, second.date) ||
        comparePriority(first.record, second.record) ||
        compareName(first.record, second.record),
    )
    .map((item) => item.record);
  return { records: limited(attention, limit, 4), total: attention.length };
}
