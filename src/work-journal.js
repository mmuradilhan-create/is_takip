const MAX_TEXT_LENGTH = 10000;

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isoTimestamp(value) {
  // Require an explicit timezone. A locale-dependent date must not change when
  // a backup is opened on a different computer.
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !validDate(value.slice(0, 10)) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    throw new Error("İş günlüğü bitiş zamanı geçerli bir ISO tarih olmalıdır.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error("İş günlüğü bitiş zamanı geçerli bir ISO tarih olmalıdır.");
  return parsed.toISOString();
}

function text(value, label) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)
    throw new Error(`${label} en fazla ${MAX_TEXT_LENGTH} karakter olmalıdır.`);
  return value;
}

export function makeWorkLogEntry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("İş günlüğü kaydı geçerli bir nesne olmalıdır.");
  if (
    typeof input.id !== "string" ||
    !input.id.trim() ||
    input.id.length > 1000
  )
    throw new Error("İş günlüğü oturum kimliği eksik veya geçersiz.");
  if (!validDate(input.date))
    throw new Error("İş günlüğü tarihi geçerli bir tarih olmalıdır.");
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0)
    throw new Error(
      "İş günlüğü süresi sıfır veya pozitif bir tam sayı olmalıdır.",
    );
  return {
    id: input.id.trim(),
    date: input.date,
    endedAt: isoTimestamp(input.endedAt),
    durationMs: input.durationMs,
    note: text(input.note, "İş günlüğü sonucu"),
    nextAction: text(input.nextAction, "Sonraki adım"),
  };
}

export function normalizeWorkLog(entries) {
  if (!Array.isArray(entries))
    throw new Error("İş günlüğü geçerli bir liste olmalıdır.");
  const seen = new Set();
  return entries.map((input) => {
    const entry = makeWorkLogEntry(input);
    if (seen.has(entry.id))
      throw new Error(`Tekrarlanan iş günlüğü oturumu: ${entry.id}`);
    seen.add(entry.id);
    return entry;
  });
}

function logsFor(record) {
  return Object.hasOwn(record || {}, "workLog")
    ? normalizeWorkLog(record.workLog)
    : [];
}

// A durable session id makes retries and simultaneous finish requests
// idempotent. The first completed entry, including its next step, wins.
export function appendWorkLog(record, input, options = {}) {
  const entry = makeWorkLogEntry(input);
  const entries = logsFor(record);
  if (entries.some((existing) => existing.id === entry.id)) return record;
  const updated = {
    ...record,
    updatedAt: isoTimestamp(options.updatedAt ?? entry.endedAt),
    workLog: [...entries, entry],
  };
  if (Object.hasOwn(options, "nextAction"))
    updated.nextAction = text(options.nextAction, "Sonraki adım").trim();
  return updated;
}

function editableRecord(record) {
  if (!record || record.type !== "daily")
    throw new Error("İş günlüğü kaydının günlük işi bulunamadı.");
}

/** Correct a saved snapshot without changing the task's current next step. */
export function updateWorkLogEntry(record, id, patch, options = {}) {
  editableRecord(record);
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    Object.keys(patch).some(
      (key) => !["date", "durationMs", "note", "nextAction"].includes(key),
    )
  )
    throw new Error(
      "Yalnızca oturum tarihi, süresi, sonucu ve sonraki adımı düzenlenebilir.",
    );
  const entries = logsFor(record);
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("Düzenlenecek çalışma oturumu bulunamadı.");
  const updated = makeWorkLogEntry({ ...entries[index], ...patch });
  if (JSON.stringify(updated) === JSON.stringify(entries[index])) return record;
  return {
    ...record,
    updatedAt: isoTimestamp(options.updatedAt ?? new Date().toISOString()),
    workLog: entries.map((entry, item) => (item === index ? updated : entry)),
  };
}

/** Repeated deletion is a no-op; legacy records never gain an empty journal. */
export function removeWorkLogEntry(record, id, options = {}) {
  editableRecord(record);
  if (typeof id !== "string" || !id.trim())
    throw new Error("Silinecek çalışma oturumunun kimliği geçersiz.");
  const entries = logsFor(record);
  if (!entries.some((entry) => entry.id === id)) return record;
  return {
    ...record,
    updatedAt: isoTimestamp(options.updatedAt ?? new Date().toISOString()),
    workLog: entries.filter((entry) => entry.id !== id),
  };
}

function addDuration(total, duration) {
  // Keep the API's millisecond totals safe even for an extremely large backup.
  return Math.min(Number.MAX_SAFE_INTEGER, total + duration);
}

export function totalWorkMs(record) {
  return logsFor(record).reduce(
    (total, entry) => addDuration(total, entry.durationMs),
    0,
  );
}

export function weeklyGoalWorkMs(goalId, records) {
  return records
    .filter((record) => record.type === "daily" && record.parentId === goalId)
    .reduce((total, record) => addDuration(total, totalWorkMs(record)), 0);
}

export function weekWorkSummary(records, { start, end }) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw new Error("İş günlüğü özeti için geçerli bir tarih aralığı seçin.");
  const byDay = new Map();
  const byRecord = [];
  let totalMs = 0;
  let sessionCount = 0;
  for (const record of records) {
    if (record.type !== "daily") continue;
    const entries = logsFor(record)
      .filter((entry) => entry.date >= start && entry.date <= end)
      .sort(
        (a, b) =>
          a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id),
      );
    if (!entries.length) continue;
    let recordTotal = 0;
    for (const entry of entries) {
      recordTotal = addDuration(recordTotal, entry.durationMs);
      totalMs = addDuration(totalMs, entry.durationMs);
      sessionCount += 1;
      const day = byDay.get(entry.date) || {
        date: entry.date,
        totalMs: 0,
        sessionCount: 0,
      };
      day.totalMs = addDuration(day.totalMs, entry.durationMs);
      day.sessionCount += 1;
      byDay.set(entry.date, day);
    }
    byRecord.push({
      recordId: record.id,
      title: record.title,
      totalMs: recordTotal,
      sessionCount: entries.length,
      entries,
    });
  }
  return {
    start,
    end,
    totalMs,
    sessionCount,
    recordCount: byRecord.length,
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byRecord: byRecord.sort(
      (a, b) =>
        b.totalMs - a.totalMs ||
        a.title.localeCompare(b.title, "tr") ||
        a.recordId.localeCompare(b.recordId),
    ),
  };
}
