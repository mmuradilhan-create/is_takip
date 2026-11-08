export {
  cleanupWaitingImportNotes,
  waitingImportNoteCleanupInfo,
} from "./waiting-notes.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const MAX_TEXT_LENGTH = 10000;
const DAY_MS = 86400000;
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

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarDays(start, end) {
  const first = calendarDate(start);
  const last = calendarDate(end);
  if (!first || !last || last < first) return null;
  return Math.round((last - first) / DAY_MS);
}

export function normalizeFollowUpDate(value, label = "Takip tarihi") {
  if (value === "") return "";
  if (!calendarDate(value))
    throw new Error(`${label} geçerli bir tarih olmalıdır.`);
  return value;
}

export function normalizeLatestUpdate(value) {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)
    throw new Error(
      `Son gelişme en fazla ${MAX_TEXT_LENGTH} karakter olmalıdır.`,
    );
  return value.trim();
}

function followUpEntry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Takip kaydı geçerli bir nesne olmalıdır.");
  if (
    typeof input.id !== "string" ||
    !input.id.trim() ||
    input.id.length > 1000
  )
    throw new Error("Takip kaydının kimliği eksik veya geçersiz.");
  if (!calendarDate(input.date))
    throw new Error("Takip tarihi geçerli bir tarih olmalıdır.");
  if (
    input.note != null &&
    (typeof input.note !== "string" || input.note.length > MAX_TEXT_LENGTH)
  )
    throw new Error(
      `Takip sonucu en fazla ${MAX_TEXT_LENGTH} karakter olmalıdır.`,
    );
  if (
    Object.hasOwn(input, "previousUpdate") &&
    (typeof input.previousUpdate !== "string" ||
      input.previousUpdate.length > MAX_TEXT_LENGTH)
  )
    throw new Error(
      `Önceki son gelişme en fazla ${MAX_TEXT_LENGTH} karakter olmalıdır.`,
    );
  return {
    id: input.id.trim(),
    date: input.date,
    note: (input.note || "").trim(),
    nextFollowUpDate: normalizeFollowUpDate(
      input.nextFollowUpDate ?? "",
      "Sonraki takip tarihi",
    ),
    ...(Object.hasOwn(input, "previousUpdate")
      ? { previousUpdate: input.previousUpdate.trim() }
      : {}),
  };
}

/** Relative-to-today rules apply when recording, not when reading a backup. */
export function normalizeFollowUpLog(entries) {
  if (!Array.isArray(entries))
    throw new Error("Takip geçmişi geçerli bir liste olmalıdır.");
  const seen = new Set();
  return entries.map((input) => {
    const entry = followUpEntry(input);
    if (seen.has(entry.id))
      throw new Error(`Tekrarlanan takip kaydı kimliği: ${entry.id}`);
    seen.add(entry.id);
    return entry;
  });
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
  throw new Error("Takip kaydının güncelleme zamanı geçersiz.");
}

function sameCoreEntry(first, second) {
  return ["id", "date", "note", "nextFollowUpDate"].every(
    (key) => first[key] === second[key],
  );
}

function chronology(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (first, second) =>
        first.entry.date.localeCompare(second.entry.date) ||
        first.index - second.index,
    )
    .map(({ entry }) => entry);
}

function historyAuthority(entries) {
  const ordered = chronology(entries);
  let summary = "";
  for (const entry of ordered) {
    if (entry.note) summary = entry.note;
    else if (entry.previousUpdate) summary = entry.previousUpdate;
  }
  return { latest: ordered.at(-1), summary };
}

/** One explicit follow-up atomically updates its history and reminder. */
export function appendFollowUp(record, input, options = {}) {
  if (!record || record.type !== "waiting" || CLOSED.has(record.status))
    throw new Error("Yalnızca açık bekleyen konulara takip kaydı eklenebilir.");
  const entry = followUpEntry(input);
  const entries = Object.hasOwn(record, "followUpLog")
    ? normalizeFollowUpLog(record.followUpLog)
    : [];
  const existing = entries.find((item) => item.id === entry.id);
  if (existing) {
    if (!sameCoreEntry(existing, entry))
      throw new Error("Bu takip kaydı farklı içerikle zaten kaydedilmiş.");
    return record;
  }
  const today = options.today ?? localToday();
  if (!calendarDate(today)) throw new Error("Bugünün tarihi geçersiz.");
  if (entry.date > today)
    throw new Error("Takip tarihi bugünden sonra olamaz.");
  const last = normalizeFollowUpDate(
    record.lastFollowUpDate || "",
    "Son takip tarihi",
  );
  const latest = !last || entry.date >= last;
  const previousUpdate = normalizeLatestUpdate(record.latestUpdate ?? "");
  const replacesSummary = latest && entry.note && entry.note !== previousUpdate;
  if (
    replacesSummary &&
    previousUpdate &&
    !entries.some(
      (item) =>
        item.note === previousUpdate || item.previousUpdate === previousUpdate,
    )
  ) {
    if (entry.previousUpdate && entry.previousUpdate !== previousUpdate)
      throw new Error(
        "Önceki son gelişme bilgileri çakışıyor; takip kaydedilmedi.",
      );
    entry.previousUpdate = previousUpdate;
  }
  return {
    ...record,
    updatedAt: timestamp(options.updatedAt ?? new Date()),
    followUpLog: [...entries, entry],
    lastFollowUpDate: latest ? entry.date : last,
    nextFollowUpDate: entry.nextFollowUpDate,
    ...(latest && entry.note ? { latestUpdate: entry.note } : {}),
  };
}

/** Correct saved history while respecting separately edited live summary fields. */
export function updateFollowUp(record, entryId, patch, options = {}) {
  if (!record || record.type !== "waiting")
    throw new Error(
      "Yalnızca bekleyen konuların takip geçmişi düzenlenebilir.",
    );
  const entries = Object.hasOwn(record, "followUpLog")
    ? normalizeFollowUpLog(record.followUpLog)
    : [];
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error("Düzenlenecek takip kaydı artık bulunamıyor.");
  const original = entries[index];
  if (Object.hasOwn(options, "expectedEntry")) {
    const expected = followUpEntry(options.expectedEntry);
    if (JSON.stringify(expected) !== JSON.stringify(original))
      throw new Error(
        "Bu takip kaydı başka bir pencerede değişti. Güncel kaydı yeniden aç.",
      );
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Takip değişiklikleri geçerli bir nesne olmalıdır.");
  const fields = new Set([
    "date",
    "note",
    "nextFollowUpDate",
    "previousUpdate",
  ]);
  for (const key of Object.keys(patch))
    if (!fields.has(key))
      throw new Error("Takip kaydının bu alanı değiştirilemez.");
  const edited = followUpEntry({ ...original, ...patch });
  if (JSON.stringify(edited) === JSON.stringify(original)) return record;
  const today = options.today ?? localToday();
  if (!calendarDate(today)) throw new Error("Bugünün tarihi geçersiz.");
  if (edited.date > today)
    throw new Error("Takip tarihi bugünden sonra olamaz.");

  const nextEntries = entries.map((entry, at) =>
    at === index ? edited : entry,
  );
  const before = historyAuthority(entries);
  const after = historyAuthority(nextEntries);
  const currentLast = normalizeFollowUpDate(
    record.lastFollowUpDate || "",
    "Son takip tarihi",
  );
  const currentNext = normalizeFollowUpDate(
    record.nextFollowUpDate ?? "",
    "Sonraki takip tarihi",
  );
  const currentSummary = normalizeLatestUpdate(record.latestUpdate ?? "");
  const changes = {};
  if (currentLast === before.latest.date && after.latest.date !== currentLast)
    changes.lastFollowUpDate = after.latest.date;
  if (
    currentNext === before.latest.nextFollowUpDate &&
    after.latest.nextFollowUpDate !== currentNext
  )
    changes.nextFollowUpDate = after.latest.nextFollowUpDate;
  if (currentSummary === before.summary && after.summary !== currentSummary)
    changes.latestUpdate = after.summary;
  return {
    ...record,
    ...changes,
    updatedAt: timestamp(options.updatedAt ?? new Date()),
    followUpLog: nextEntries,
  };
}

/** A closed record has no proven closing date, so never invent a frozen age. */
export function waitingAge(record, today = localToday()) {
  if (record?.type !== "waiting" || CLOSED.has(record.status)) return null;
  return calendarDays(record.sourceDate, today);
}

export function followUpPresentation(record, today = localToday()) {
  const date = calendarDate(record?.nextFollowUpDate)
    ? record.nextFollowUpDate
    : "";
  const closed = CLOSED.has(record?.status);
  const distance = date ? calendarDays(today, date) : null;
  const state = closed
    ? "closed"
    : !date
      ? "missing"
      : date < today
        ? "overdue"
        : date === today
          ? "today"
          : distance !== null && distance <= 3
            ? "soon"
            : "scheduled";
  const status = {
    closed: "Konu kapalı",
    missing: "Sonraki takip tarihi belirlenmedi",
    overdue: "Takip tarihi geçti",
    today: "Bugün takip et",
    soon: "3 gün içinde takip",
    scheduled: "Planlanan takip tarihi",
  }[state];
  return {
    date,
    state,
    tone:
      state === "overdue"
        ? "overdue"
        : ["today", "soon"].includes(state)
          ? "due-soon"
          : "",
    label: date
      ? dateFormatter.format(calendarDate(date))
      : closed
        ? "Takip yok"
        : "Takip planla",
    status,
    icon:
      state === "overdue"
        ? "warning"
        : ["today", "soon"].includes(state)
          ? "clock"
          : date
            ? "calendar"
            : "minus",
    daysSinceLastFollowUp: calendarDays(record?.lastFollowUpDate, today),
  };
}
