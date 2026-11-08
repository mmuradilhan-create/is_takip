const DETAIL_LIMITS = {
  projectCode: { max: 120, label: "Proje kodu" },
  blockReason: { max: 1000, label: "Engel açıklaması" },
};

export const DEFAULT_WORK_TYPES = [
  "Tasarım",
  "Analiz",
  "Dokümantasyon",
  "Test",
  "İnceleme",
  "Takip",
];

export function normalizeDetailText(value, kind) {
  const rule = DETAIL_LIMITS[kind];
  if (!rule) throw new Error("Geçersiz iş ayrıntısı.");
  if (typeof value !== "string" || value.length > rule.max)
    throw new Error(`${rule.label} en fazla ${rule.max} karakter olmalıdır.`);
  return value.trim();
}

function normalizedHeader(value) {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const GENERATED_HEADERS = new Set(["gun", "gecikme", "odaksira"]);
const DESCRIPTION_HEADERS = new Set(
  [
    "Notlar",
    "Not",
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

function cleanupDescription(record) {
  if (!record || typeof record.description !== "string")
    return record?.description;
  const fields = record.sourceFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    return record.description;
  const generated = new Map();
  const protectedLines = new Map();
  for (const [header, raw] of Object.entries(fields)) {
    if (header.startsWith("__")) continue;
    const key = normalizedHeader(header);
    // Rich-text/formula source notes are not plain strings. Their original
    // wording cannot be established by this narrow cleanup, so keep the
    // whole description rather than risking genuine note content.
    if (DESCRIPTION_HEADERS.has(key) && raw !== null && typeof raw === "object")
      return record.description;
    const value = plainSourceValue(raw);
    if (GENERATED_HEADERS.has(key) && value.trim())
      generated.set(`${header}: ${value}`, 1);
    if (DESCRIPTION_HEADERS.has(key) && value.trim()) {
      // Real note columns are independent of the metadata appended by the
      // importer. Preserve their lines, even when one happens to look alike.
      for (const line of value.trim().split(/\r?\n/))
        protectedLines.set(line, (protectedLines.get(line) || 0) + 1);
    }
  }
  if (!generated.size) return record.description;
  const lines = record.description.split("\n");
  const matching = new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/, "");
    if (!generated.has(line)) continue;
    if (!matching.has(line)) matching.set(line, []);
    matching.get(line).push(index);
  }
  const remove = new Set();
  for (const [line, indexes] of matching) {
    // Extra copies beyond the original note and the importer's single column
    // are ambiguous. Keep them rather than treating repeated user text as
    // more generated content on a later cleanup run.
    if (indexes.length > (protectedLines.get(line) || 0) + generated.get(line))
      continue;
    const spare = indexes.length - (protectedLines.get(line) || 0);
    const count = Math.min(generated.get(line), Math.max(0, spare));
    // Generated columns were appended after the original note. Remove at
    // most their proven single copy; repeated/user-authored text survives.
    for (const index of indexes.slice(indexes.length - count))
      if (count) remove.add(index);
  }
  if (!remove.size) return record.description;
  return lines
    .filter((_, index) => !remove.has(index))
    .join("\n")
    .trim();
}

/** Remove only metadata proven to have been appended by the old importer. */
export function cleanupImportedNotes(records) {
  if (!Array.isArray(records))
    throw new TypeError("Not temizliği için kayıt listesi gereklidir.");
  let changed = false;
  const result = records.map((record) => {
    const description = cleanupDescription(record);
    if (description === record?.description) return record;
    changed = true;
    return { ...record, description };
  });
  return changed ? result : records;
}

export function importedNoteCleanupInfo(records) {
  const cleaned = cleanupImportedNotes(records);
  let recordsChanged = 0;
  let linesRemoved = 0;
  for (let index = 0; index < records.length; index++) {
    if (cleaned[index] === records[index]) continue;
    recordsChanged++;
    const before = records[index].description
      .split(/\r?\n/)
      .filter((line) => line.trim()).length;
    const after = cleaned[index].description
      ? cleaned[index].description.split(/\r?\n/).filter((line) => line.trim())
          .length
      : 0;
    linesRemoved += before - after;
  }
  return { recordsChanged, linesRemoved };
}

/** Suggestions come from all saved work, including completed records. */
export function learnedChoices(records, kind) {
  if (!Array.isArray(records) || !["projectCode", "workType"].includes(kind))
    throw new TypeError("Geçerli bir iş ayrıntısı seçim listesi gereklidir.");
  const choices = new Map();
  const add = (raw) => {
    if (typeof raw !== "string") return;
    const value = raw.trim();
    if (!value) return;
    const key = value.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if (!choices.has(key)) choices.set(key, value);
  };
  if (kind === "workType") DEFAULT_WORK_TYPES.forEach(add);
  for (const record of records) add(record?.[kind]);
  return [...choices.values()].sort((a, b) =>
    a.localeCompare(b, "tr", { sensitivity: "base", numeric: true }),
  );
}
