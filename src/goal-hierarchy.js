const PARENT_TYPES = Object.freeze({
  daily: "weekly",
  weekly: "monthly",
  monthly: "yearly",
});
const CHILD_TYPES = Object.freeze({
  weekly: "daily",
  monthly: "weekly",
  yearly: "monthly",
});
const EXCLUDED = new Set(["cancelled", "transferred"]);

export function parentGoalType(type) {
  return PARENT_TYPES[type] || null;
}

/** Valid immediate links only; reading a hierarchy never creates a link. */
export function goalChildren(record, records = []) {
  const childType = CHILD_TYPES[record?.type];
  if (!childType || !record.id) return [];
  return records.filter(
    (child) =>
      child?.type === childType &&
      child.id !== record.id &&
      (childType !== "daily" || child.workContext !== "ad_hoc") &&
      (childType === "daily" ? child.parentId : child.goalParentId) ===
        record.id,
  );
}

/** Eligible children have equal weight within their immediate parent. */
export function linkedGoalProgress(record, records = []) {
  const children = goalChildren(record, records).filter(
    (child) => !EXCLUDED.has(child.status),
  );
  if (!children.length) return null;
  const completed = children.filter(
    (child) => child.status === "completed",
  ).length;
  if (record.type === "weekly")
    return {
      total: children.length,
      completed,
      percent: Math.round((completed / children.length) * 100),
      basis: "linked",
    };
  return {
    total: children.length,
    completed,
    percent: Math.round(
      children.reduce(
        (sum, child) => sum + goalHierarchyProgress(child, records).percent,
        0,
      ) / children.length,
    ),
    basis: "rollup",
  };
}

/** The shared, derived progress calculation does not change stored statuses. */
export function goalHierarchyProgress(record, records = []) {
  if (record.status === "completed")
    return { total: 1, completed: 1, percent: 100, basis: "status" };
  if (Number.isFinite(record.targetValue) && record.targetValue > 0) {
    const current = Number.isFinite(record.currentValue)
      ? record.currentValue
      : 0;
    return {
      total: record.targetValue,
      completed: current,
      percent: Math.max(
        0,
        Math.min(100, Math.round((current / record.targetValue) * 100)),
      ),
      basis: "metric",
    };
  }
  return (
    linkedGoalProgress(record, records) || {
      total: 1,
      completed: 0,
      percent: 0,
      basis: "status",
    }
  );
}
