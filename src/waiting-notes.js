const LATEST_UPDATE_LIMIT = 10000;

function normalizedHeader(value) {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const NOTE_HEADERS = new Set(
  [
    "Not",
    "Notlar",
    "Detay",
    "Detaylar",
    "İş açıklaması",
    "Görev açıklaması",
    "Açıklama",
    "Description",
  ].map(normalizedHeader),
);

function plainSourceValue(value) {
  return ["string", "number", "boolean"].includes(typeof value)
    ? String(value)
    : "";
}

function cleanRecord(record) {
  const unchanged = { record, linesRemoved: 0, promotedUpdates: 0 };
  if (record?.type !== "waiting" || typeof record.description !== "string")
    return unchanged;
  const source = record.sourceFields;
  if (!source || typeof source !== "object" || Array.isArray(source))
    return unchanged;

  const protectedLines = new Map();
  const candidates = [];
  for (const [header, raw] of Object.entries(source)) {
    if (header.startsWith("__")) continue;
    const key = normalizedHeader(header);
    // Rich text and formula objects cannot prove the wording of real notes.
    if (NOTE_HEADERS.has(key) && raw !== null && typeof raw === "object")
      return unchanged;
    const value = plainSourceValue(raw);
    if (!value.trim()) continue;
    if (NOTE_HEADERS.has(key)) {
      for (const line of value.trim().split(/\r?\n/))
        protectedLines.set(line, (protectedLines.get(line) || 0) + 1);
    }
    if (key === "kacgunbekledi" || key === "sondurum") {
      // A multiline source value cannot be proven by matching a single line.
      if (/[\r\n]/.test(header) || /[\r\n]/.test(value)) continue;
      candidates.push({
        kind: key,
        line: `${header}: ${value}`,
        value: value.trim(),
      });
    }
  }
  if (!candidates.length) return unchanged;

  const lines = record.description.split("\n");
  const eligible = [];
  for (const candidate of candidates) {
    const indexes = [];
    for (let index = 0; index < lines.length; index++)
      if (lines[index].replace(/\r$/, "") === candidate.line)
        indexes.push(index);
    const protectedCount = protectedLines.get(candidate.line) || 0;
    // Extra copies may be later user edits. Keep ambiguous text intact.
    if (indexes.length !== protectedCount + 1) continue;
    eligible.push({ ...candidate, index: indexes[indexes.length - 1] });
  }
  if (!eligible.length) return unchanged;

  const updates = eligible.filter((entry) => entry.kind === "sondurum");
  const updateValues = new Set(updates.map((entry) => entry.value));
  const currentUpdate =
    typeof record.latestUpdate === "string" ? record.latestUpdate.trim() : "";
  const canPromote =
    updateValues.size === 1 &&
    (!Object.hasOwn(record, "latestUpdate") ||
      (typeof record.latestUpdate === "string" && !currentUpdate));
  const promotedValue = canPromote ? updates[0].value : "";
  const safePromotion =
    canPromote && promotedValue.length <= LATEST_UPDATE_LIMIT;
  const remove = new Set();
  for (const entry of eligible) {
    if (
      entry.kind === "kacgunbekledi" ||
      (updateValues.size === 1 &&
        (safePromotion || currentUpdate === entry.value))
    )
      remove.add(entry.index);
  }
  if (!remove.size) return unchanged;
  return {
    record: {
      ...record,
      description: lines
        .filter((_, index) => !remove.has(index))
        .join("\n")
        .trim(),
      ...(safePromotion ? { latestUpdate: promotedValue } : {}),
    },
    linesRemoved: remove.size,
    promotedUpdates: safePromotion ? 1 : 0,
  };
}

/** Keep source-proven waiting metadata out of genuine notes. */
export function cleanupWaitingImportNotes(records) {
  if (!Array.isArray(records))
    throw new TypeError("Bekleyen konu notları için kayıt listesi gereklidir.");
  let changed = false;
  const cleaned = records.map((record) => {
    const result = cleanRecord(record).record;
    changed ||= result !== record;
    return result;
  });
  return changed ? cleaned : records;
}

export function waitingImportNoteCleanupInfo(records) {
  if (!Array.isArray(records))
    throw new TypeError("Bekleyen konu notları için kayıt listesi gereklidir.");
  let recordsChanged = 0;
  let linesRemoved = 0;
  let promotedUpdates = 0;
  for (const record of records) {
    const result = cleanRecord(record);
    if (result.record !== record) recordsChanged++;
    linesRemoved += result.linesRemoved;
    promotedUpdates += result.promotedUpdates;
  }
  return { recordsChanged, linesRemoved, promotedUpdates };
}
