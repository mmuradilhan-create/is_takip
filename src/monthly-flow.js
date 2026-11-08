import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Use the same strict calendar bounds as the monthly period navigation. */
export function monthlyPeriodFromKey(value) {
  if (typeof value !== "string") return null;
  try {
    return shiftPlanningPeriod({ type: "monthly", key: value.trim() }, 0);
  } catch {
    return null;
  }
}

function selectedMonth(period) {
  return period?.type === "monthly" ? monthlyPeriodFromKey(period.key) : null;
}

function openMonthly(record) {
  return record?.type === "monthly" && !CLOSED.has(record.status);
}

function recordMonth(record) {
  const explicit = monthlyPeriodFromKey(record.periodKey);
  if (explicit) return explicit;
  if (typeof record.dueDate !== "string" || !record.dueDate) return null;
  try {
    return makePlanningPeriod("monthly", record.dueDate);
  } catch {
    return null;
  }
}

/** Older open monthly goals remain saved until the user chooses to move one. */
export function previousMonthlyGoals(records, period) {
  if (!Array.isArray(records))
    throw new TypeError("Aylık hedefler için kayıt listesi gereklidir.");
  const target = selectedMonth(period);
  if (!target) return [];
  return records
    .filter(openMonthly)
    .map((record) => ({ record, period: recordMonth(record) }))
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
      /* Reject normalized invalid dates such as February 30. */
    }
  }
  throw new Error("Aylık taşıma zamanı geçersiz.");
}

/** Preserve the same monthly goal, its deadline, metrics and hierarchy. */
export function moveMonthlyGoal(
  records,
  id,
  period,
  now = new Date(),
  reason = "",
) {
  if (!Array.isArray(records))
    throw new TypeError("Aylık hedefler için kayıt listesi gereklidir.");
  const target = selectedMonth(period);
  if (!target) throw new Error("Taşımak için geçerli bir ay seçin.");
  const record = records.find((candidate) => candidate?.id === id);
  if (!record || record.type !== "monthly")
    throw new Error("Taşınacak aylık hedef bulunamadı.");
  if (!openMonthly(record))
    throw new Error("Yalnızca açık aylık hedefler taşınabilir.");
  const source = recordMonth(record);
  if (source?.key === target.key) return records;
  if (!source || source.start >= target.start)
    throw new Error("Yalnızca önceki aylardaki hedefler bu aya alınabilir.");
  const existing = record.sourceFields?.__monthlyMoves;
  if (existing !== undefined && !Array.isArray(existing))
    throw new Error("Hedefin aylık taşıma geçmişi okunamıyor.");
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
      __monthlyMoves: [
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
