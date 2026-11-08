export const DAILY_CONTEXTS = {
  "": { label: "Planlı iş" },
  ad_hoc: { label: "Anlık iş" },
};

export function normalizeDailyWorkContext(value) {
  if (typeof value !== "string" || !Object.hasOwn(DAILY_CONTEXTS, value))
    throw new Error("Günlük iş bağlamı geçersiz.");
  return value;
}

function normalizedTitle(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const INBOX_TITLES = new Set([
  "gunlukpopupisler",
  "gunlukpopupisleri",
  "gunlukpopupis",
]);

export function isDailyInboxGoal(record) {
  return (
    record?.type === "weekly" && INBOX_TITLES.has(normalizedTitle(record.title))
  );
}

function metadata(record, kind, original) {
  const existing = record.sourceFields?.__dailyInboxMigration;
  if (existing?.version === 1 && existing.kind === kind) return existing;
  return {
    version: 1,
    kind,
    ...original,
    ...(existing === undefined ? {} : { previous: existing }),
  };
}

/**
 * Retire only the named Excel inbox goals, keeping their source information.
 * This is an explicit, undoable migration; loading a record never invokes it.
 */
export function migrateDailyInbox(records) {
  if (!Array.isArray(records))
    throw new TypeError("Günlük iş dönüşümü için kayıt listesi gereklidir.");
  const goals = new Map(
    records.filter(isDailyInboxGoal).map((record) => [record.id, record]),
  );
  if (!goals.size) return records;
  let changed = false;
  const migrated = records.map((record) => {
    if (goals.has(record.id)) {
      const previous = record.sourceFields?.__dailyInboxMigration;
      // Once retired, later intentional edits to the old goal remain intact.
      if (previous?.version === 1 && previous.kind === "goal") return record;
      changed = true;
      return {
        ...record,
        status: "transferred",
        sourceFields: {
          ...record.sourceFields,
          __dailyInboxMigration: metadata(record, "goal", {
            originalStatus: record.status,
            originalPeriodKey: record.periodKey || "",
            originalMetric: record.metric || "",
            originalCurrentValue: record.currentValue ?? null,
            originalTargetValue: record.targetValue ?? null,
          }),
        },
      };
    }
    const parent = goals.get(record.parentId);
    if (record.type !== "daily" || !parent) return record;
    changed = true;
    return {
      ...record,
      parentId: "",
      workContext: "ad_hoc",
      sourceFields: {
        ...record.sourceFields,
        __dailyInboxMigration: metadata(record, "daily", {
          originalParentId: record.parentId,
          originalPeriodKey: parent.periodKey || "",
          originalRecordPeriodKey: record.periodKey || "",
        }),
      },
    };
  });
  return changed ? migrated : records;
}
