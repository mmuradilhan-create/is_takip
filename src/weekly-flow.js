import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3 };

/** A round trip rejects week 53 in years that have only 52 ISO weeks. */
export function weeklyPeriodFromKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  try {
    return shiftPlanningPeriod({ type: "weekly", key }, 0);
  } catch {
    return null;
  }
}

function selectedWeek(period) {
  if (!period || period.type !== "weekly") return null;
  return weeklyPeriodFromKey(period.key);
}

export function isArchivedWeekly(record) {
  return record?.type === "weekly" && record.status === "transferred";
}

function openWeekly(record) {
  return record?.type === "weekly" && !CLOSED.has(record.status);
}

function recordWeek(record) {
  const explicit = weeklyPeriodFromKey(record.periodKey);
  if (explicit) return explicit;
  if (typeof record.dueDate !== "string" || !record.dueDate) return null;
  try {
    return makePlanningPeriod("weekly", record.dueDate);
  } catch {
    return null;
  }
}

/** Return saved open goals from older weeks; neither rows nor inputs change. */
export function previousWeeklyGoals(records, period) {
  if (!Array.isArray(records))
    throw new TypeError("Haftalık hedefler için kayıt listesi gereklidir.");
  const target = selectedWeek(period);
  if (!target) return [];
  return records
    .filter(openWeekly)
    .map((record) => ({ record, period: recordWeek(record) }))
    .filter((item) => item.period && item.period.start < target.start)
    .sort(
      (first, second) =>
        second.period.start.localeCompare(first.period.start) ||
        (PRIORITY[first.record.priority] ?? 2) -
          (PRIORITY[second.record.priority] ?? 2) ||
        (first.record.dueDate || "9999").localeCompare(
          second.record.dueDate || "9999",
        ) ||
        first.record.title.localeCompare(second.record.title, "tr") ||
        first.record.id.localeCompare(second.record.id),
    )
    .map((item) => item.record);
}

function moveTimestamp(value) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60
  ) {
    try {
      makePlanningPeriod("monthly", value.slice(0, 10));
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      /* A normalized JavaScript date must not accept February 30 silently. */
    }
  }
  throw new Error("Haftalık taşıma zamanı geçersiz.");
}

/** Move an existing prior goal, preserving its identity, children and deadline. */
export function moveWeeklyGoal(
  records,
  id,
  period,
  now = new Date(),
  reason = "",
) {
  if (!Array.isArray(records))
    throw new TypeError("Haftalık hedefler için kayıt listesi gereklidir.");
  const target = selectedWeek(period);
  if (!target) throw new Error("Taşımak için geçerli bir hafta seçin.");
  const record = records.find((candidate) => candidate?.id === id);
  if (!record || record.type !== "weekly")
    throw new Error("Taşınacak haftalık hedef bulunamadı.");
  if (!openWeekly(record))
    throw new Error("Yalnızca açık haftalık hedefler taşınabilir.");
  const source = recordWeek(record);
  if (source?.key === target.key) return records;
  if (!source || source.start >= target.start)
    throw new Error(
      "Yalnızca önceki haftalardaki hedefler bu haftaya alınabilir.",
    );
  const existing = record.sourceFields?.__weeklyMoves;
  if (existing !== undefined && !Array.isArray(existing))
    throw new Error("Hedefin haftalık taşıma geçmişi okunamıyor.");
  if (typeof reason !== "string" || reason.trim().length > 1000)
    throw new Error("Taşıma gerekçesi en fazla 1000 karakter olabilir.");
  const explanation = reason.trim();
  const timestamp = moveTimestamp(now);
  const moved = {
    ...record,
    periodKey: target.key,
    updatedAt: timestamp,
    sourceFields: {
      ...record.sourceFields,
      __weeklyMoves: [
        ...(existing || []),
        {
          from: source.key,
          to: target.key,
          movedAt: timestamp,
          previousPeriodKey: record.periodKey || "",
          ...(explanation ? { reason: explanation } : {}),
        },
      ],
    },
  };
  return records.map((candidate) => (candidate === record ? moved : candidate));
}
