import { getWeeklyProgress, localDate } from "./model.js";
import { matchesDashboardQuery } from "./dashboard-model.js";
import { selectDashboardGoals } from "./dashboard-planning.js";
import { makePlanningPeriod } from "./planning-periods.js";
import { listReviewRecords } from "./waiting-state.js";
import { previousWeeklyGoals } from "./weekly-flow.js";
import { previousMonthlyGoals } from "./monthly-flow.js";
import { waitingAge } from "./waiting-age.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNumericTarget(record) {
  return Number.isFinite(record.targetValue) && record.targetValue > 0;
}

const LATEST_UPDATE_AFTER_DAYS = 14;

function daysSince(timestamp, today) {
  const start = new Date(timestamp);
  if (Number.isNaN(start.getTime())) return null;
  const day = (value) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round(
    (day(new Date(`${today}T12:00:00`)) - day(start)) / 86400000,
  );
}

/**
 * What an open waiting item still misses. Without a contact or a next
 * follow-up date a topic never reaches "Takip gerekenler"; a missing latest
 * update only matters once a topic has waited two weeks without any
 * recorded follow-up.
 */
export function waitingGaps(record, today = localDate()) {
  if (!record || CLOSED.has(record.status)) return [];
  if (record.type === "waiting") {
    const gaps = [];
    if (!hasText(record.expectedFrom)) gaps.push("expectedFrom");
    if (!hasText(record.nextFollowUpDate)) gaps.push("nextFollowUpDate");
    const followed =
      Array.isArray(record.followUpLog) && record.followUpLog.length > 0;
    const age = waitingAge(record, today) ?? daysSince(record.createdAt, today);
    if (
      !hasText(record.latestUpdate) &&
      !followed &&
      age !== null &&
      age >= LATEST_UPDATE_AFTER_DAYS
    )
      gaps.push("latestUpdate");
    return gaps;
  }
  return record.type === "daily" &&
    record.status === "waiting" &&
    !hasText(record.waitingReason ?? record.blockReason)
    ? ["waitingReason"]
    : [];
}

/** Optional planning suggestions, never a combined urgency or completion score. */
export function selectPlanningPrompts(
  records,
  {
    today = localDate(),
    query = "",
    runningRecordId = null,
    activity = null,
  } = {},
) {
  const matching = records.filter((record) =>
    matchesDashboardQuery(record, query),
  );
  const currentGoals = selectDashboardGoals(records, {
    today,
    query,
    limit: Infinity,
  }).records;
  return {
    unplannedGoals: currentGoals.filter(
      (record) =>
        !hasNumericTarget(record) &&
        getWeeklyProgress(record.id, records).total === 0,
    ),
    waitingDetails: matching.filter(
      (record) => waitingGaps(record, today).length > 0,
    ),
    reviewRecords: listReviewRecords(matching, today, {
      runningRecordId,
      activity,
    }),
    previousGoals: [
      ...previousWeeklyGoals(matching, makePlanningPeriod("weekly", today)),
      ...previousMonthlyGoals(matching, makePlanningPeriod("monthly", today)),
    ],
  };
}
