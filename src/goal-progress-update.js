import { makePlanningPeriod } from "./planning-periods.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);
const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const CONFIG_FIELDS = ["targetValue", "metric", "status"];

function progressValue(value) {
  if (
    !["string", "number"].includes(typeof value) ||
    (typeof value === "string" && !value.trim())
  )
    throw new Error("Mevcut değer için sıfır veya pozitif bir sayı yaz.");
  const parsed =
    typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error("Mevcut değer için sıfır veya pozitif bir sayı yaz.");
  return parsed;
}

function timestamp(value) {
  if (value instanceof Date) {
    if (
      !Number.isNaN(value.getTime()) &&
      value.getUTCFullYear() >= 1 &&
      value.getUTCFullYear() <= 9999
    )
      return value.toISOString();
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
      /* Invalid calendar dates must not be normalized into another day. */
    }
  }
  throw new Error("İlerleme kaydının zamanı geçersiz.");
}

/** Change only an existing goal's own count, with the user's original baseline. */
export function updateGoalProgress(
  record,
  value,
  { expectedCurrent, expectedSnapshot, updatedAt = new Date() } = {},
) {
  if (!record || !GOALS.has(record.type))
    throw new Error("İlerlemesi değiştirilecek hedef bulunamıyor.");
  if (CLOSED.has(record.status))
    throw new Error("İlerlemeyi değiştirmek için hedefi yeniden aç.");
  if (!Number.isFinite(record.targetValue) || record.targetValue <= 0)
    throw new Error(
      "Bu hedefin ilerlemesi bağlı kayıtlarından hesaplanıyor. Kendi ölçümünü düzenlemek için önce ölçüm ekle.",
    );
  if (!Object.is(record.currentValue, expectedCurrent))
    throw new Error(
      "İlerleme başka bir işlemde değişti. Yazdığın değer korunuyor; güncel değeri alıp yeniden deneyebilirsin.",
    );
  if (
    expectedSnapshot !== undefined &&
    (!expectedSnapshot ||
      typeof expectedSnapshot !== "object" ||
      Array.isArray(expectedSnapshot) ||
      CONFIG_FIELDS.some(
        (field) =>
          !Object.hasOwn(expectedSnapshot, field) ||
          !Object.is(record[field], expectedSnapshot[field]),
      ))
  )
    throw new Error(
      "Hedefin ölçümü veya durumu değişti. Yazdığın değer korunuyor; güncel değeri alıp yeniden deneyebilirsin.",
    );
  const currentValue = progressValue(value);
  if (Object.is(record.currentValue, currentValue)) return record;
  return { ...record, currentValue, updatedAt: timestamp(updatedAt) };
}
