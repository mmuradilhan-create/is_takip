import { createRecord, validateStore } from "./model.js";
import { normalizePreferences, validPreferences } from "./preferences.js";
import { normalizeNotes } from "./workspace-notes.js";
import { readWorkSessionSnapshot } from "./work-session-store.js";

const DEFAULT_MAX_ENTRIES = 30;
const DEFAULT_MAX_BYTES = 1_500_000;
const SIGNATURE_PATTERN = /^w1:\d+:[0-9a-f]{8}:[0-9a-f]{8}$/;
const staleMessage =
  "Çalışma alanı başka bir işlemde veya pencerede değişti. Eski işlem güvenle geri alınamıyor.";

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

// Stable object-key ordering avoids mistaking a JSON key reorder for a change.
// Array ordering remains significant, including the workspace's record order.
function stableJSON(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index))
        throw new Error("Geçmiş verisi geçersiz.");
      items.push(stableJSON(value[index]));
    }
    return `[${items.join(",")}]`;
  }
  if (plainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Geçmiş yalnızca geçerli JSON verisi içerebilir.");
}

function clone(value) {
  // Validate first: JSON.stringify must not silently drop unsupported fields.
  stableJSON(value);
  return JSON.parse(JSON.stringify(value));
}

function same(left, right) {
  return stableJSON(left) === stableJSON(right);
}

function preferences(input) {
  if (!plainObject(input) || !validPreferences(input, { strict: true })) {
    throw new Error("Geçmişteki görünüm tercihi geçersiz.");
  }
  return normalizePreferences(input);
}

function canonicalRecord(record) {
  if (
    !plainObject(record) ||
    typeof record.id !== "string" ||
    !record.id.trim()
  ) {
    throw new Error("Geçmişteki kayıt geçersiz.");
  }
  const detached = clone(record);
  const normalized = createRecord(detached);
  if (!same(detached, normalized)) {
    throw new Error("Geçmişteki kayıt eksik veya geçersiz alanlar içeriyor.");
  }
  return detached;
}

function snapshot(input) {
  if (!plainObject(input) || !Array.isArray(input.records)) {
    throw new Error("Çalışma alanı geçmişi geçersiz.");
  }
  const records = clone(input.records);
  const checked = validateStore({ version: 1, records }).records;
  if (!same(records, checked)) {
    throw new Error("Geçmiş kaydı değişmeden doğrulanamadı.");
  }
  return {
    records,
    preferences: preferences(input.preferences),
    ...(Object.hasOwn(input, "notes")
      ? { notes: normalizeNotes(input.notes) }
      : {}),
  };
}

function signatureOfJSON(serialized) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index++) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `w1:${serialized.length}:${(first >>> 0)
    .toString(16)
    .padStart(8, "0")}:${(second >>> 0).toString(16).padStart(8, "0")}`;
}

/** A change detector, not an authentication or cryptographic integrity token. */
export function workspaceSignature(input) {
  return signatureOfJSON(stableJSON(snapshot(input)));
}

function actionLabel(value) {
  return (
    String(value ?? "Kayıt değişikliği")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 120) || "Kayıt değişikliği"
  );
}

function sessionSnapshot(value) {
  return readWorkSessionSnapshot(JSON.stringify(value));
}

function sessionChange(value) {
  if (!plainObject(value) || value.version !== 1)
    throw new Error("Çalışma notlarının geri alma kaydı geçersiz.");
  const before = sessionSnapshot(value.before);
  const after = sessionSnapshot(value.after);
  if (same(before, after))
    throw new Error("Çalışma notlarının geri alma kaydı değişiklik içermiyor.");
  return { version: 1, before, after };
}

export function makeHistoryEntry(
  beforeInput,
  afterInput,
  label,
  { sessionChange: sessionInput } = {},
) {
  const before = snapshot(beforeInput);
  const after = snapshot(afterInput);
  const beforeJSON = stableJSON(before);
  const afterJSON = stableJSON(after);
  const sessions =
    sessionInput === undefined ? null : sessionChange(sessionInput);
  if (beforeJSON === afterJSON && !sessions) return null;

  const beforeById = new Map(
    before.records.map((record) => [record.id, record]),
  );
  const afterById = new Map(after.records.map((record) => [record.id, record]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes = [];
  for (const id of ids) {
    const previous = beforeById.get(id) ?? null;
    const next = afterById.get(id) ?? null;
    if (!same(previous, next))
      changes.push({ id, before: previous, after: next });
  }
  return {
    version: 1,
    label: actionLabel(label),
    beforeSignature: signatureOfJSON(beforeJSON),
    afterSignature: signatureOfJSON(afterJSON),
    beforeOrder: before.records.map((record) => record.id),
    afterOrder: after.records.map((record) => record.id),
    beforePreferences: before.preferences,
    afterPreferences: after.preferences,
    ...(Object.hasOwn(before, "notes") ? { beforeNotes: before.notes } : {}),
    ...(Object.hasOwn(after, "notes") ? { afterNotes: after.notes } : {}),
    ...(sessions ? { sessionChange: sessions } : {}),
    changes,
  };
}

function ids(input) {
  if (!Array.isArray(input))
    throw new Error("Geçmişteki kayıt sırası geçersiz.");
  const seen = new Set();
  for (const id of input) {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) {
      throw new Error("Geçmişteki kayıt sırası geçersiz.");
    }
    seen.add(id);
  }
  return [...input];
}

function parseEntry(input) {
  if (
    !plainObject(input) ||
    input.version !== 1 ||
    typeof input.label !== "string" ||
    !SIGNATURE_PATTERN.test(input.beforeSignature) ||
    !SIGNATURE_PATTERN.test(input.afterSignature) ||
    !Array.isArray(input.changes)
  ) {
    throw new Error("Geri alma kaydı geçersiz.");
  }
  const beforeOrder = ids(input.beforeOrder);
  const afterOrder = ids(input.afterOrder);
  if (input.changes.length > beforeOrder.length + afterOrder.length) {
    throw new Error("Geri alma değişiklikleri geçersiz.");
  }
  const beforeIds = new Set(beforeOrder);
  const afterIds = new Set(afterOrder);
  const changedIds = new Set();
  const changes = input.changes.map((change) => {
    if (
      !plainObject(change) ||
      typeof change.id !== "string" ||
      !change.id.trim() ||
      changedIds.has(change.id) ||
      (change.before === null && change.after === null)
    ) {
      throw new Error("Geri alma değişiklikleri geçersiz.");
    }
    changedIds.add(change.id);
    const before =
      change.before === null ? null : canonicalRecord(change.before);
    const after = change.after === null ? null : canonicalRecord(change.after);
    if (
      (before !== null && before.id !== change.id) ||
      (after !== null && after.id !== change.id) ||
      beforeIds.has(change.id) !== (before !== null) ||
      afterIds.has(change.id) !== (after !== null) ||
      same(before, after)
    ) {
      throw new Error("Geri alma değişiklikleri kayıtlarla eşleşmiyor.");
    }
    return { id: change.id, before, after };
  });
  for (const id of beforeIds) {
    if (!afterIds.has(id) && !changedIds.has(id)) {
      throw new Error("Geri almada silinen kayıt bilgisi eksik.");
    }
  }
  for (const id of afterIds) {
    if (!beforeIds.has(id) && !changedIds.has(id)) {
      throw new Error("Geri almada eklenen kayıt bilgisi eksik.");
    }
  }
  const beforePreferences = preferences(input.beforePreferences);
  const afterPreferences = preferences(input.afterPreferences);
  const hasBeforeNotes = Object.hasOwn(input, "beforeNotes");
  const hasAfterNotes = Object.hasOwn(input, "afterNotes");
  const beforeNotes = hasBeforeNotes ? normalizeNotes(input.beforeNotes) : null;
  const afterNotes = hasAfterNotes ? normalizeNotes(input.afterNotes) : null;
  const sessions = Object.hasOwn(input, "sessionChange")
    ? sessionChange(input.sessionChange)
    : null;
  if (
    !changes.length &&
    same(beforeOrder, afterOrder) &&
    same(beforePreferences, afterPreferences) &&
    hasBeforeNotes === hasAfterNotes &&
    same(beforeNotes, afterNotes) &&
    !sessions
  ) {
    throw new Error("Geri alma kaydı herhangi bir değişiklik içermiyor.");
  }
  return {
    version: 1,
    label: actionLabel(input.label),
    beforeSignature: input.beforeSignature,
    afterSignature: input.afterSignature,
    beforeOrder,
    afterOrder,
    beforePreferences,
    afterPreferences,
    ...(hasBeforeNotes ? { beforeNotes } : {}),
    ...(hasAfterNotes ? { afterNotes } : {}),
    ...(sessions ? { sessionChange: sessions } : {}),
    changes,
  };
}

function restoreEntry(currentInput, rawEntry, checkSession) {
  const current = snapshot(currentInput);
  const entry = parseEntry(rawEntry);
  if (
    checkSession &&
    entry.sessionChange &&
    (!Object.hasOwn(currentInput, "workSessions") ||
      !same(
        sessionSnapshot(currentInput.workSessions),
        entry.sessionChange.after,
      ))
  ) {
    const error = new Error(
      "Çalışma notları yedek yüklendikten sonra değişti. Güncel notları korumak için bu işlem geri alınamadı.",
    );
    error.name = "WorkDraftConflictError";
    throw error;
  }
  if (signatureOfJSON(stableJSON(current)) !== entry.afterSignature) {
    throw new Error(staleMessage);
  }
  if (
    !same(
      current.records.map((record) => record.id),
      entry.afterOrder,
    ) ||
    !same(current.preferences, entry.afterPreferences) ||
    Object.hasOwn(current, "notes") !== Object.hasOwn(entry, "afterNotes") ||
    (Object.hasOwn(current, "notes") && !same(current.notes, entry.afterNotes))
  ) {
    throw new Error("Geri alma kaydı mevcut çalışma alanıyla eşleşmiyor.");
  }
  const byId = new Map(current.records.map((record) => [record.id, record]));
  for (const change of entry.changes) {
    if (!same(byId.get(change.id) ?? null, change.after)) {
      throw new Error("Geri alma kaydındaki son durum doğrulanamadı.");
    }
    if (change.before === null) byId.delete(change.id);
    else byId.set(change.id, change.before);
  }
  if (byId.size !== entry.beforeOrder.length) {
    throw new Error("Geri alma kaydındaki kayıt sırası doğrulanamadı.");
  }
  const restored = snapshot({
    records: entry.beforeOrder.map((id) => byId.get(id)),
    preferences: entry.beforePreferences,
    ...(Object.hasOwn(entry, "beforeNotes")
      ? { notes: entry.beforeNotes }
      : {}),
  });
  if (signatureOfJSON(stableJSON(restored)) !== entry.beforeSignature) {
    throw new Error("Geri alma kaydındaki önceki durum doğrulanamadı.");
  }
  return {
    ...restored,
    ...(entry.sessionChange
      ? { workSessions: clone(entry.sessionChange.before) }
      : Object.hasOwn(currentInput, "workSessions")
        ? { workSessions: sessionSnapshot(currentInput.workSessions) }
        : {}),
  };
}

export function undoEntry(currentInput, rawEntry) {
  return restoreEntry(currentInput, rawEntry, true);
}

function jsonByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function pushHistory(
  history,
  entry,
  { maxEntries = DEFAULT_MAX_ENTRIES, maxBytes = DEFAULT_MAX_BYTES } = {},
) {
  if (!Array.isArray(history)) throw new Error("Geçmiş listesi geçersiz.");
  if (entry == null) return [...history];
  if (
    !Number.isSafeInteger(maxEntries) ||
    maxEntries < 1 ||
    !Number.isFinite(maxBytes) ||
    maxBytes < 0
  ) {
    throw new Error("Geçmiş sınırları geçersiz.");
  }
  const retained = [...history, entry].slice(-maxEntries);
  const sizes = retained.map(jsonByteLength);
  let bytes =
    2 + sizes.reduce((total, size) => total + size, 0) + retained.length - 1;
  while (retained.length > 1 && bytes > maxBytes) {
    bytes -= sizes.shift() + 1;
    retained.shift();
  }
  return retained;
}

// Undo steps never change once written, yet every read of the workspace (each
// work-note save seen from another window, each sync) used to rebuild and
// re-check the whole chain: about a second with 400 records and 25 steps.
// The last verified chain is remembered; an unchanged chain, one new step on
// top of it or one step undone is checked by that step alone.
let verified = null;

function domainKey(current) {
  return JSON.stringify([
    current.records,
    current.preferences,
    Object.hasOwn(current, "notes") ? [current.notes] : [],
  ]);
}

function sameList(left, right) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function remember(serialized, key, result) {
  verified = { serialized, key, result };
  return [...result];
}

/** Invalid optional history never prevents opening the actual task records. */
export function readHistory(raw, current) {
  let serialized = null;
  let key = null;
  try {
    if (Array.isArray(raw) && raw.length) {
      serialized = raw
        .slice(-DEFAULT_MAX_ENTRIES)
        .map((entry) => JSON.stringify(entry));
      key = domainKey(current);
    }
  } catch {
    serialized = null;
  }
  if (serialized && verified?.result.length) {
    const known = verified.serialized;
    const last = verified.result.at(-1);
    try {
      // Nothing changed but the work notes.
      if (key === verified.key && sameList(serialized, known))
        return [...verified.result];
      const offset = (list, length) => list.length - length;
      // One new step on top of the verified chain.
      const kept = serialized.slice(0, -1);
      const start = offset(known, kept.length);
      if (kept.length && start >= 0 && sameList(kept, known.slice(start))) {
        const entry = parseEntry(raw.at(-1));
        if (entry.beforeSignature === last.afterSignature) {
          restoreEntry(current, entry, false);
          const retained = pushHistory(verified.result.slice(start), entry);
          return remember(serialized.slice(-retained.length), key, retained);
        }
      }
      // The top step undone.
      const before = known.slice(0, -1);
      const from = offset(before, serialized.length);
      if (
        from >= 0 &&
        sameList(serialized, before.slice(from)) &&
        workspaceSignature(current) === last.beforeSignature
      ) {
        const retained = verified.result.slice(from, -1);
        return remember(serialized, key, retained);
      }
    } catch {
      /* Anything unexpected is checked from the start below. */
    }
  }
  const result = readFullHistory(raw, current);
  if (serialized && result.length)
    return remember(serialized.slice(-result.length), key, result);
  verified = null;
  return result;
}

function readFullHistory(raw, current) {
  try {
    if (!Array.isArray(raw) || !raw.length) return [];
    const limited = raw.slice(-DEFAULT_MAX_ENTRIES).map(parseEntry);
    const retained = pushHistory(limited.slice(0, -1), limited.at(-1));
    let cursor = snapshot(current);
    for (let index = retained.length - 1; index >= 0; index--) {
      // Live typing intentionally does not invalidate ordinary record history.
      // The session comparison belongs to the actual Undo action, not loading.
      cursor = restoreEntry(cursor, retained[index], false);
    }
    return retained;
  } catch {
    return [];
  }
}
