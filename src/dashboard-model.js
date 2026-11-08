import { dashboardStats, isOverdue, localDate } from "./model.js";
import {
  makePlanningPeriod,
  matchesPlanningPeriod,
} from "./planning-periods.js";
import { previousWeeklyGoals } from "./weekly-flow.js";
import { listReviewRecords } from "./waiting-state.js";

const closedStatuses = new Set(["completed", "cancelled", "transferred"]);
const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

function isActive(record) {
  return !closedStatuses.has(record.status);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDate(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareText(left, right);
}

function comparePriority(left, right) {
  return (
    (priorityOrder[left.priority] ?? priorityOrder.normal) -
    (priorityOrder[right.priority] ?? priorityOrder.normal)
  );
}

function compareUpdated(left, right) {
  return compareText(right.updatedAt || "", left.updatedAt || "");
}

function compareId(left, right) {
  return compareText(String(left.id), String(right.id));
}

function matchesQuery(record, query) {
  if (!query) return true;
  return [
    record.title,
    record.description,
    record.owner,
    record.nextAction,
    record.projectCode,
    record.workType,
    record.blockReason,
    record.waitingReason,
    record.expectedFrom,
    record.latestUpdate,
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .includes(query);
}

function normalizeQuery(query) {
  return String(query).trim().normalize("NFC").toLocaleLowerCase("tr-TR");
}

export function matchesDashboardQuery(record, query = "") {
  return matchesQuery(record, normalizeQuery(query));
}

function compareDue(left, right) {
  return compareDate(left.dueDate, right.dueDate);
}

const focusComparators = {
  priority: (left, right) =>
    comparePriority(left, right) ||
    compareDue(left, right) ||
    compareUpdated(left, right) ||
    compareId(left, right),
  due: (left, right) =>
    compareDue(left, right) ||
    comparePriority(left, right) ||
    compareUpdated(left, right) ||
    compareId(left, right),
  updated: (left, right) =>
    compareUpdated(left, right) ||
    compareDue(left, right) ||
    comparePriority(left, right) ||
    compareId(left, right),
};

export function openDaily(records) {
  return records.filter(
    (record) => record.type === "daily" && isActive(record),
  );
}

export function selectFocus(
  records,
  { filter = "open", sort = "priority", today = localDate(), query = "" } = {},
) {
  const search = normalizeQuery(query);
  return openDaily(records)
    .filter((record) => {
      if (filter === "today" && record.dueDate !== today) return false;
      if (filter === "overdue" && !isOverdue(record, today)) return false;
      return matchesQuery(record, search);
    })
    .sort(focusComparators[sort] || focusComparators.priority);
}

/** The dashboard stays in one actionable order, independent of list sorting. */
export function selectCurrentWork(
  records,
  {
    filter = "open",
    today = localDate(),
    query = "",
    runningRecordId = null,
  } = {},
) {
  const group = (record) => {
    if (record.id === runningRecordId) return 0;
    if (isOverdue(record, today)) return 1;
    if (record.dueDate === today) return 2;
    return record.dueDate ? 3 : 4;
  };
  return selectFocus(records, { filter, today, query }).sort(
    (left, right) =>
      group(left) - group(right) ||
      comparePriority(left, right) ||
      compareDue(left, right) ||
      String(left.title).localeCompare(String(right.title), "tr-TR") ||
      compareId(left, right),
  );
}

export function dashboardDailyStats(records, today = localDate()) {
  const daily = records.filter((record) => record.type === "daily");
  return {
    ...dashboardStats(daily, today),
    todayDue: openDaily(daily).filter((record) => record.dueDate === today)
      .length,
  };
}

/** Agenda counts come from current saved work, rather than inferred completions. */
export function dashboardAgendaSummary(
  records,
  today = localDate(),
  { runningRecordId = null } = {},
) {
  const period = makePlanningPeriod("weekly", today);
  const current = records.filter(
    (record) =>
      record.type === "weekly" &&
      isActive(record) &&
      matchesPlanningPeriod(record, period),
  ).length;
  const previous = previousWeeklyGoals(records, period).length;
  const waiting = { today: 0, overdue: 0, unscheduled: 0, total: 0 };
  for (const record of records) {
    if (record.type !== "waiting" || !isActive(record)) continue;
    const date = record.nextFollowUpDate;
    if (!date) waiting.unscheduled++;
    else if (date === today) waiting.today++;
    else if (date < today) waiting.overdue++;
  }
  waiting.total = waiting.today + waiting.overdue + waiting.unscheduled;
  return {
    weekly: { current, previous, total: current + previous },
    waiting,
    waitingJobs: {
      total: openDaily(records).filter((record) => record.status === "waiting")
        .length,
    },
    review: {
      total: listReviewRecords(records, today, { runningRecordId }).length,
    },
  };
}

export function selectOverview(records, type, { query = "", limit = 3 } = {}) {
  if (type !== "meeting" && type !== "waiting") return [];
  const search = normalizeQuery(query);
  const compare =
    type === "meeting"
      ? focusComparators.due
      : (left, right) =>
          compareDate(left.nextFollowUpDate, right.nextFollowUpDate) ||
          compareDate(left.lastFollowUpDate, right.lastFollowUpDate) ||
          String(left.title).localeCompare(String(right.title), "tr-TR") ||
          compareId(left, right);

  return records
    .filter(
      (record) =>
        record.type === type &&
        isActive(record) &&
        matchesQuery(record, search),
    )
    .sort(compare)
    .slice(0, limit);
}
