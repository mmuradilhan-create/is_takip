const MAX_PAGE_SIZE = 50;
const SORTS = new Set(["due-asc", "due-desc", "created-desc", "created-asc"]);

function compareText(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareDate(first, second, direction) {
  const left = typeof first === "string" ? first : "";
  const right = typeof second === "string" ? second : "";
  // Missing dates stay after dated records, including in descending order.
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return direction * compareText(left, right);
}

/** Sort saved record references without changing their contents or source order. */
export function sortListRecords(
  records,
  sort = "created-desc",
  { dateField = "dueDate" } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError("Sıralama için kayıt listesi gereklidir.");
  const selected = SORTS.has(sort) ? sort : "created-desc";
  const field = selected.startsWith("created-")
    ? "createdAt"
    : dateField === "nextFollowUpDate"
      ? "nextFollowUpDate"
      : "dueDate";
  const direction = selected.endsWith("-asc") ? 1 : -1;
  return [...records].sort(
    (first, second) =>
      compareDate(first[field], second[field], direction) ||
      compareText(String(first.id), String(second.id)),
  );
}

function positiveInteger(value, fallback) {
  if (!["number", "string"].includes(typeof value)) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}

/** A stale page is clamped after filtering, deleting, or restoring records. */
export function paginateRecords(records, page = 1, pageSize = MAX_PAGE_SIZE) {
  if (!Array.isArray(records))
    throw new TypeError("Sayfalama için kayıt listesi gereklidir.");
  const size = Math.min(
    MAX_PAGE_SIZE,
    positiveInteger(pageSize, MAX_PAGE_SIZE),
  );
  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const selected = Math.min(pageCount, positiveInteger(page, 1));
  const offset = (selected - 1) * size;
  return {
    records: records.slice(offset, offset + size),
    total,
    page: selected,
    pageCount,
    start: total ? offset + 1 : 0,
    end: Math.min(total, offset + size),
  };
}
