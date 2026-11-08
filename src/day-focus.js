import { localDate } from "./model.js";
import { selectCurrentWork } from "./dashboard-model.js";
import { makePlanningPeriod } from "./planning-periods.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const LIMIT = 3;

function activeDaily(record) {
  return record?.type === "daily" && !CLOSED.has(record.status);
}

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Geçerli bir odak tarihi seçin.");
  try {
    makePlanningPeriod("monthly", value);
  } catch {
    throw new Error("Geçerli bir odak tarihi seçin.");
  }
  return value;
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
      calendarDate(value.slice(0, 10));
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      // JavaScript normalizes impossible dates; reject them before saving.
    }
  }
  throw new Error("Odak seçiminin kayıt zamanı geçersiz.");
}

/** Today's chosen work is independent of deadlines and saved progress states. */
export function selectDayFocus(
  records,
  { today = localDate(), query = "", runningRecordId = null } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError("Bugünün odağı için kayıt listesi gereklidir.");
  const date = calendarDate(today);
  return selectCurrentWork(records, {
    today: date,
    query,
    runningRecordId,
  }).filter((record) => record.focusDate === date);
}

/** One explicit planning edit; earlier dates and closed-record history persist. */
export function toggleDayFocus(
  records,
  id,
  { today = localDate(), now = new Date() } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError("Bugünün odağı için kayıt listesi gereklidir.");
  const date = calendarDate(today);
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Odak için seçilen iş bulunamadı.");
  if (!activeDaily(record))
    throw new Error("Bugünün odağına yalnızca açık günlük işler seçilebilir.");
  const removing = record.focusDate === date;
  if (
    !removing &&
    records.filter((item) => activeDaily(item) && item.focusDate === date)
      .length >= LIMIT
  )
    throw new Error("Bugünün odağına en fazla 3 iş seçebilirsin.");
  const replacement = {
    ...record,
    focusDate: removing ? null : date,
    updatedAt: editTimestamp(now),
  };
  return records.map((item) => (item === record ? replacement : item));
}
