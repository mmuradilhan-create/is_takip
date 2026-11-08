import { getWeeklyProgress, localDate } from "./model.js";
import { matchesDashboardQuery } from "./dashboard-model.js";
import { selectDashboardGoals } from "./dashboard-planning.js";
import { makePlanningPeriod } from "./planning-periods.js";
import { listReviewRecords } from "./waiting-state.js";
import { previousWeeklyGoals } from "./weekly-flow.js";
import { previousMonthlyGoals } from "./monthly-flow.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNumericTarget(record) {
  return Number.isFinite(record.targetValue) && record.targetValue > 0;
}

function needsWaitingDetails(record) {
  if (CLOSED.has(record.status)) return false;
  if (record.type === "waiting")
    return !hasText(record.expectedFrom) || !hasText(record.latestUpdate);
  return (
    record.type === "daily" &&
    record.status === "waiting" &&
    !hasText(record.waitingReason ?? record.blockReason)
  );
}

/** Optional planning suggestions, never a combined urgency or completion score. */
export function selectPlanningPrompts(
  records,
  { today = localDate(), query = "", runningRecordId = null } = {},
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
    waitingDetails: matching.filter(needsWaitingDetails),
    reviewRecords: listReviewRecords(matching, today, { runningRecordId }),
    previousGoals: [
      ...previousWeeklyGoals(matching, makePlanningPeriod("weekly", today)),
      ...previousMonthlyGoals(matching, makePlanningPeriod("monthly", today)),
    ],
  };
}
