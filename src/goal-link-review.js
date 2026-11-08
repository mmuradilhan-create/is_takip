import { localDate } from "./model.js";
import { matchesDashboardQuery } from "./dashboard-model.js";
import { makePlanningPeriod } from "./planning-periods.js";
import { weeklyPeriodFromKey } from "./weekly-flow.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function openDaily(record) {
  return (
    record?.type === "daily" &&
    !CLOSED.has(record.status) &&
    record.workContext !== "ad_hoc"
  );
}

function normalizedTitle(title) {
  return typeof title === "string"
    ? title
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ")
        .toLocaleLowerCase("tr-TR")
    : "";
}

function goalWeek(record) {
  const explicit = weeklyPeriodFromKey(record.periodKey);
  if (explicit) return explicit;
  try {
    return record.dueDate ? makePlanningPeriod("weekly", record.dueDate) : null;
  } catch {
    return null;
  }
}

/** Suggestions are review-only; an old title never silently changes a link. */
export function proposeGoalLinks(
  records,
  { today = localDate(), query = "" } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError("Hedef bağlantıları için kayıt listesi gereklidir.");
  const current = makePlanningPeriod("weekly", today);
  const byId = new Map(records.map((record) => [record.id, record]));
  const candidates = records.filter((record) => {
    if (record.type !== "weekly" || CLOSED.has(record.status)) return false;
    const period = goalWeek(record);
    return period && period.start >= current.start;
  });
  return records
    .filter(
      (record) =>
        openDaily(record) &&
        record.parentId &&
        matchesDashboardQuery(record, query),
    )
    .flatMap((record) => {
      const previousGoal = byId.get(record.parentId) || null;
      if (previousGoal && previousGoal.type !== "weekly") return [];
      if (previousGoal && !CLOSED.has(previousGoal.status)) return [];
      const title = normalizedTitle(previousGoal?.title);
      const matches = title
        ? candidates.filter(
            (candidate) => normalizedTitle(candidate.title) === title,
          )
        : [];
      return [
        {
          record,
          previousGoal,
          suggestedGoal: matches.length === 1 ? matches[0] : null,
          candidates: matches,
        },
      ];
    });
}

function editTimestamp(value) {
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
      /* Reject JavaScript's normalization of impossible calendar dates. */
    }
  }
  throw new Error("Hedef bağlantısının kayıt zamanı geçersiz.");
}

/** An explicit batch is validated in full before changing any record. */
export function applyGoalLinks(records, changes, { now = new Date() } = {}) {
  if (!Array.isArray(records) || !Array.isArray(changes))
    throw new TypeError(
      "Hedef bağlantıları için kayıt ve değişiklik listesi gereklidir.",
    );
  if (!changes.length) return records;
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length)
    throw new Error(
      "Tekrarlanan kayıt kimlikleriyle hedef bağlantısı değiştirilemez.",
    );
  const seen = new Set();
  const replacements = new Map();
  for (const change of changes) {
    if (
      !change ||
      typeof change.recordId !== "string" ||
      !change.recordId.trim() ||
      !Object.hasOwn(change, "fromParentId") ||
      (change.fromParentId !== null &&
        typeof change.fromParentId !== "string") ||
      typeof change.toParentId !== "string" ||
      !change.toParentId.trim()
    )
      throw new Error("Hedef bağlantısı değişikliği geçersiz.");
    if (seen.has(change.recordId))
      throw new Error("Aynı günlük iş için birden fazla bağlantı seçilemez.");
    seen.add(change.recordId);
    const record = byId.get(change.recordId);
    if (!openDaily(record))
      throw new Error(
        "Yalnızca açık, planlı günlük işlerin hedef bağlantısı değiştirilebilir.",
      );
    if ((record.parentId || null) !== (change.fromParentId || null))
      throw new Error(
        "İşin hedef bağlantısı başka bir işlemde değişti. Listeyi yenileyip tekrar dene.",
      );
    const target = byId.get(change.toParentId);
    if (target?.type !== "weekly" || CLOSED.has(target.status))
      throw new Error("Bağlantı için açık bir haftalık hedef seçin.");
    if (record.parentId !== target.id) replacements.set(record.id, target.id);
  }
  if (!replacements.size) return records;
  const timestamp = editTimestamp(now);
  return records.map((record) =>
    replacements.has(record.id)
      ? {
          ...record,
          parentId: replacements.get(record.id),
          updatedAt: timestamp,
        }
      : record,
  );
}
