function normalizeHeader(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");
}

const contactHeaders = new Set(
  [
    "owner",
    "Sorumlu",
    "Sorumlu kişi",
    "Atanan",
    "Kişi",
    "Assignee",
    "participants",
    "Katılımcılar",
  ].map(normalizeHeader),
);
const isContactHeader = (key) => contactHeaders.has(normalizeHeader(key));
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Clear only discontinued meeting contact fields and their dedicated import copies. */
export function cleanupMeetingContacts(records) {
  let changed = false;
  const cleaned = records.map((record) => {
    if (record.type !== "meeting") return record;
    const fields = record.sourceFields;
    const fieldKeys = isObject(fields)
      ? Object.keys(fields).filter(isContactHeader)
      : [];
    const formulas = fields?.__formulas;
    const formulaKeys = isObject(formulas)
      ? Object.keys(formulas).filter(isContactHeader)
      : [];
    if (
      record.owner === "" &&
      record.participants === "" &&
      !fieldKeys.length &&
      !formulaKeys.length
    )
      return record;
    changed = true;
    const next = { ...record, owner: "", participants: "" };
    if (fieldKeys.length || formulaKeys.length) {
      next.sourceFields = { ...fields };
      for (const key of fieldKeys) delete next.sourceFields[key];
      if (formulaKeys.length) {
        next.sourceFields.__formulas = { ...formulas };
        for (const key of formulaKeys) delete next.sourceFields.__formulas[key];
        if (!Object.keys(next.sourceFields.__formulas).length)
          delete next.sourceFields.__formulas;
      }
    }
    return next;
  });
  return changed ? cleaned : records;
}

/** The separate marker survives record Undo so an intentional undo survives reload. */
export function runMeetingContactCleanup({
  records,
  storage,
  markerKey,
  saveRecords,
  token = `pending:${globalThis.crypto.randomUUID()}`,
}) {
  if (storage.getItem(markerKey))
    return { status: "skipped", recordsChanged: 0 };
  const cleaned = cleanupMeetingContacts(records);
  if (cleaned === records) {
    storage.setItem(markerKey, "1");
    return { status: "unchanged", recordsChanged: 0 };
  }
  // Reserve marker storage before the atomic record write. If finalizing the
  // smaller marker fails, this reservation still prevents reapplying after Undo.
  storage.setItem(markerKey, token);
  const rollback = () => {
    if (storage.getItem(markerKey) === token) storage.removeItem(markerKey);
  };
  try {
    if (!saveRecords(cleaned)) {
      rollback();
      return { status: "failed", recordsChanged: 0 };
    }
  } catch (error) {
    rollback();
    throw error;
  }
  try {
    storage.setItem(markerKey, "1");
  } catch {
    // The reserved marker already records completion outside record history.
  }
  return {
    status: "cleaned",
    recordsChanged: cleaned.filter((record, index) => record !== records[index])
      .length,
  };
}
