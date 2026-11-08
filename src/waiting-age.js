const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const DAY_MS = 86400000;
const CLOSURE_KEY = "__waitingClosure";
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function localDay(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarDays(start, end) {
  const first = calendarDate(start);
  const last = calendarDate(end);
  if (!first || !last || last < first) return null;
  return Math.round((last - first) / DAY_MS);
}

function timestamp(value) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    calendarDate(value.slice(0, 10)) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60
  ) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new Error("Konunun kapanış zamanı geçersiz.");
}

function closure(record) {
  const value = record?.sourceFields?.[CLOSURE_KEY];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== 1 ||
    !calendarDate(value.closedDate)
  )
    return null;
  try {
    timestamp(value.closedAt);
    return value;
  } catch {
    return null;
  }
}

/** Only an actual edit from an existing open waiting topic establishes closure. */
export function stampWaitingClosures(
  previousRecords,
  nextRecords,
  options = {},
) {
  if (!Array.isArray(previousRecords) || !Array.isArray(nextRecords))
    throw new TypeError(
      "Kapanış için önceki ve yeni kayıt listeleri gereklidir.",
    );
  const previous = new Map();
  for (const record of previousRecords) {
    if (!record?.id) continue;
    previous.set(record.id, previous.has(record.id) ? null : record);
  }
  let stamp = null;
  let changed = false;
  const stamped = nextRecords.map((record) => {
    const before = previous.get(record?.id);
    if (
      before?.type !== "waiting" ||
      record?.type !== "waiting" ||
      CLOSED.has(before.status) ||
      !CLOSED.has(record.status)
    )
      return record;
    if (!stamp) {
      const closedAt = timestamp(options.closedAt ?? new Date());
      const closedDate =
        options.closedDate === undefined
          ? localDay(new Date(closedAt))
          : options.closedDate;
      if (!calendarDate(closedDate))
        throw new Error("Konunun kapanış tarihi geçersiz.");
      stamp = { version: 1, closedDate, closedAt };
    }
    changed = true;
    return {
      ...record,
      sourceFields: {
        ...record.sourceFields,
        [CLOSURE_KEY]: { ...stamp },
      },
    };
  });
  return changed ? stamped : nextRecords;
}

/** Closed totals require the recorded closing day, never a later update. */
export function waitingAge(record, today = localDay()) {
  if (record?.type !== "waiting") return null;
  if (CLOSED.has(record.status)) {
    const proof = closure(record);
    return proof ? calendarDays(record.sourceDate, proof.closedDate) : null;
  }
  return calendarDays(record.sourceDate, today);
}

/** Distinguish a measured total from the old Excel cache without rewriting it. */
export function waitingAgePresentation(
  record,
  today = localDay(),
  { formatDate = (value) => dateFormatter.format(calendarDate(value)) } = {},
) {
  const closed = record?.type === "waiting" && CLOSED.has(record.status);
  let days = waitingAge(record, today);
  let kind = days === null ? "unknown" : closed ? "closure" : "live";
  const start = calendarDate(record?.sourceDate);
  if (
    closed &&
    start &&
    days === null &&
    !Object.hasOwn(record.sourceFields || {}, CLOSURE_KEY)
  ) {
    const imported = record.sourceFields?.["Kaç Gün Bekledi"];
    if (Number.isSafeInteger(imported) && imported >= 0) {
      days = imported;
      kind = "imported";
    }
  }
  const text = days === null ? "—" : `${days} gün`;
  if (kind === "imported") {
    const provenance = "Excel’den aktarılan süre; kapanış tarihi bilinmiyor";
    return {
      kind,
      days,
      text,
      description: `${days} gün (Excel’den aktarılan süre)`,
      title: provenance,
      ariaLabel: `${days} gün; ${provenance}`,
    };
  }
  if (kind === "closure") {
    const closedDate = closure(record).closedDate;
    return {
      kind,
      days,
      text,
      description: `${days} gün bekledi`,
      title: `Beklemeye başlama: ${formatDate(record.sourceDate)} · Kapanış: ${formatDate(closedDate)}`,
      ariaLabel: `${days} gün bekledi; kapanış: ${formatDate(closedDate)}`,
    };
  }
  if (kind === "live") {
    return {
      kind,
      days,
      text,
      description:
        days === 0 ? "Bugün beklemeye alındı" : `${days} gündür bekliyor`,
      title: `Beklemeye başlama: ${formatDate(record.sourceDate)}`,
      ariaLabel: `${days} gündür bekliyor`,
    };
  }
  const description = !start
    ? record?.sourceDate
      ? "Bekleme süresi bilinmiyor"
      : "Bekleme başlangıcı yok"
    : closed
      ? "Kapanış tarihi bilinmiyor"
      : "Bekleme süresi bilinmiyor";
  return {
    kind,
    days: null,
    text,
    description,
    title: closed
      ? "Kapanış tarihi veya bekleme başlangıcı bilinmediğinden süre hesaplanamıyor"
      : start
        ? `Beklemeye başlama: ${formatDate(record.sourceDate)}`
        : "Beklemeye başlama tarihi belirlenmedi",
    ariaLabel: description,
  };
}
