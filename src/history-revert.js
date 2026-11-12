/**
 * Undo one earlier action on its own: the records, notes and settings it
 * changed go back to how they were before it, and everything changed by
 * later actions stays. If a later action changed the same thing, reverting
 * would overwrite that work, so a HistoryConflictError explains what changed.
 */

export class HistoryConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "HistoryConflictError";
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

const same = (left, right) => stable(left) === stable(right);
const named = (item) =>
  String(item?.title ?? item?.text ?? "")
    .split("\n")[0]
    .slice(0, 60);

/**
 * Apply one entry's before/after changes in reverse to a list of items with
 * ids, keeping later changes. Deleted items return beside their old
 * neighbours; created items are removed.
 */
function revertList(current, changes, beforeOrder, kind) {
  const list = [...current];
  const indexOf = (id) => list.findIndex((item) => item.id === id);
  for (const change of changes) {
    const now = list[indexOf(change.id)] ?? null;
    if (!same(now, change.after)) {
      const title = named(change.after || change.before || now);
      throw new HistoryConflictError(
        `${kind === "note" ? "Not" : "Kayıt"} “${title}” bu işlemden sonra yeniden değişti.`,
      );
    }
  }
  for (const change of changes) {
    const at = indexOf(change.id);
    if (change.before === null) {
      list.splice(at, 1);
    } else if (change.after === null) {
      // Put it back after the nearest earlier neighbour that still exists.
      const order = beforeOrder.indexOf(change.id);
      let insertAt = 0;
      for (let index = order - 1; index >= 0; index--) {
        const neighbour = indexOf(beforeOrder[index]);
        if (neighbour !== -1) {
          insertAt = neighbour + 1;
          break;
        }
      }
      list.splice(insertAt, 0, change.before);
    } else list[at] = change.before;
  }
  return list;
}

function noteChanges(beforeNotes = [], afterNotes = []) {
  const before = new Map(beforeNotes.map((note) => [note.id, note]));
  const after = new Map(afterNotes.map((note) => [note.id, note]));
  const changes = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id) ?? null;
    const next = after.get(id) ?? null;
    if (!same(previous, next))
      changes.push({ id, before: previous, after: next });
  }
  return changes;
}

/**
 * The workspace with only this entry undone, or a HistoryConflictError.
 * `current` is { records, preferences, notes? } as the store holds them.
 */
export function revertHistoryEntry(current, entry) {
  if (!entry || !Array.isArray(entry.changes))
    throw new Error("Geri alınacak işlem bulunamadı.");
  if (entry.sessionChange)
    throw new HistoryConflictError(
      "Bu işlem çalışma notlarını da değiştirdi; tek başına geri alınamaz.",
    );
  const records = revertList(
    current.records,
    entry.changes,
    entry.beforeOrder || [],
    "record",
  );
  let preferences = current.preferences;
  if (!same(entry.beforePreferences, entry.afterPreferences)) {
    if (!same(current.preferences, entry.afterPreferences))
      throw new HistoryConflictError(
        "Görünüm ayarları bu işlemden sonra yeniden değişti.",
      );
    preferences = entry.beforePreferences;
  }
  const changedNotes = noteChanges(entry.beforeNotes, entry.afterNotes);
  const notes = changedNotes.length
    ? revertList(
        current.notes || [],
        changedNotes,
        (entry.beforeNotes || []).map((note) => note.id),
        "note",
      )
    : current.notes;
  return {
    records,
    preferences,
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** A short line naming what an entry changed, for the history list. */
export function describeHistoryEntry(entry) {
  const items = [
    ...(entry?.changes || []).map((change) => change.after || change.before),
    ...noteChanges(entry?.beforeNotes, entry?.afterNotes).map(
      (change) => change.after || change.before,
    ),
  ].filter(Boolean);
  if (!items.length) return "";
  const first = named(items[0]);
  return items.length > 1 ? `${first} +${items.length - 1}` : first;
}
