export const MAX_WORKSPACE_NOTES = 100;
export const MAX_WORKSPACE_NOTE_LENGTH = 2000;

const fields = new Set(["id", "text", "createdAt", "updatedAt", "remindAt"]);

/** A reminder is a local wall-clock minute, "YYYY-MM-DDTHH:MM". */
export function validRemindAt(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    return false;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return false;
  const local = new Date(year, month - 1, day, hour, minute);
  return (
    local.getFullYear() === year &&
    local.getMonth() === month - 1 &&
    local.getDate() === day
  );
}

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/** Validate personal note content without trimming, coercing or discarding it. */
export function validNotes(value) {
  if (!Array.isArray(value) || value.length > MAX_WORKSPACE_NOTES) return false;
  const ids = new Set();
  for (let index = 0; index < value.length; index++) {
    const note = value[index];
    if (
      !Object.hasOwn(value, index) ||
      !plainObject(note) ||
      Object.keys(note).some((key) => !fields.has(key)) ||
      typeof note.id !== "string" ||
      !note.id.trim() ||
      note.id.length > 200 ||
      ids.has(note.id) ||
      typeof note.text !== "string" ||
      !note.text.trim() ||
      note.text.length > MAX_WORKSPACE_NOTE_LENGTH ||
      !timestamp(note.createdAt) ||
      !timestamp(note.updatedAt) ||
      (Object.hasOwn(note, "remindAt") && !validRemindAt(note.remindAt))
    )
      return false;
    ids.add(note.id);
  }
  return true;
}

/** A detached, validated copy; existing note text and dates remain exact. */
export function normalizeNotes(value) {
  if (!validNotes(value))
    throw new Error(
      `Notlar geçersiz. En fazla ${MAX_WORKSPACE_NOTES} madde ve her maddede ${MAX_WORKSPACE_NOTE_LENGTH} karakter kullanılabilir.`,
    );
  return value.map(({ id, text, createdAt, updatedAt, ...rest }) => ({
    id,
    text,
    createdAt,
    updatedAt,
    ...(Object.hasOwn(rest, "remindAt") ? { remindAt: rest.remindAt } : {}),
  }));
}

/** Native backups and full workspace envelopes may both carry notes. */
export function notesFromBackup(input) {
  if (!plainObject(input)) throw new Error("Not yedeği geçersiz.");
  const topLevel = Object.hasOwn(input, "notes");
  const metadata = input.odak;
  const nested = plainObject(metadata) && Object.hasOwn(metadata, "notes");
  if (nested && metadata.version !== 1)
    throw new Error("Yedekteki notların sürümü desteklenmiyor.");
  const topNotes = topLevel ? normalizeNotes(input.notes) : null;
  const nestedNotes = nested ? normalizeNotes(metadata.notes) : null;
  if (
    topLevel &&
    nested &&
    JSON.stringify(topNotes) !== JSON.stringify(nestedNotes)
  )
    throw new Error("Yedekteki not alanları birbiriyle eşleşmiyor.");
  return {
    present: topLevel || nested,
    notes: topNotes || nestedNotes || [],
  };
}
