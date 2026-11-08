const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const DAY_MS = 86400000;
const REASON_LIMIT = 1000;

function localToday() {
  const date = new Date();
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return Math.floor(date.getTime() / DAY_MS);
}

function updatedDay(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    dayNumber(value.slice(0, 10)) === null ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayNumber(
    `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  );
}

export function normalizeWaitingReason(value) {
  if (typeof value !== "string" || value.length > REASON_LIMIT)
    throw new Error(
      `Bekleme nedeni en fazla ${REASON_LIMIT} karakter olmalıdır.`,
    );
  return value.trim();
}

function migrationMetadata(record) {
  const previous = record.sourceFields?.__waitingStateMigration;
  return {
    version: 1,
    originalStatus: record.status,
    originalBlocked: record.blocked,
    originalBlockReason: record.blockReason ?? "",
    ...(Object.hasOwn(record, "waitingReason")
      ? { originalWaitingReason: record.waitingReason }
      : {}),
    ...(previous === undefined ? {} : { previous }),
  };
}

/** Explicit, undoable conversion. Validating or loading a record never runs it. */
export function migrateBlockedToWaiting(records) {
  if (!Array.isArray(records))
    throw new TypeError("Bekleme düzeni için kayıt listesi gereklidir.");
  let changed = false;
  const migrated = records.map((record) => {
    if (record?.type !== "daily") return record;
    if (record.sourceFields?.__waitingStateMigration?.version === 1)
      return record;
    const legacyReason =
      typeof record.blockReason === "string" ? record.blockReason.trim() : "";
    if (!record.blocked && !legacyReason) return record;
    const currentReason =
      typeof record.waitingReason === "string"
        ? record.waitingReason.trim()
        : "";
    changed = true;
    return {
      ...record,
      status:
        record.blocked && !CLOSED.has(record.status)
          ? "waiting"
          : record.status,
      blocked: false,
      ...(!currentReason && legacyReason
        ? { waitingReason: legacyReason }
        : {}),
      sourceFields: {
        ...record.sourceFields,
        __waitingStateMigration: migrationMetadata(record),
      },
    };
  });
  return changed ? migrated : records;
}

export function waitingStateMigrationInfo(records) {
  const migrated = migrateBlockedToWaiting(records);
  let recordsChanged = 0;
  let statusesChanged = 0;
  let reasonsPreserved = 0;
  for (let index = 0; index < records.length; index++) {
    if (records[index] === migrated[index]) continue;
    recordsChanged++;
    if (records[index].status !== migrated[index].status) statusesChanged++;
    if (
      typeof records[index].blockReason === "string" &&
      records[index].blockReason.trim()
    )
      reasonsPreserved++;
  }
  return { recordsChanged, statusesChanged, reasonsPreserved };
}

/** Seven local calendar days without a saved update; never infer work progress. */
export function listReviewRecords(
  records,
  today = localToday(),
  { runningRecordId = null } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError(
      "Gözden geçirilecek işler için kayıt listesi gereklidir.",
    );
  const currentDay = dayNumber(today);
  if (currentDay === null) throw new Error("Gözden geçirme tarihi geçersiz.");
  return records
    .filter((record) => {
      if (
        record?.type !== "daily" ||
        CLOSED.has(record.status) ||
        record.id === runningRecordId
      )
        return false;
      const updated = updatedDay(record.updatedAt);
      return updated !== null && currentDay - updated >= 7;
    })
    .sort(
      (first, second) =>
        new Date(first.updatedAt).getTime() -
          new Date(second.updatedAt).getTime() ||
        String(first.id).localeCompare(String(second.id)),
    );
}
