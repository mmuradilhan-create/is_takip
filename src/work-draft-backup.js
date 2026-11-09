import { readWorkSessionSnapshot } from "./work-session-store.js";

const MAX_ENTRIES = 50;
const MAX_DRAFT_LENGTH = 10000;
const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const draftFields = new Set(["recordId", "sessionId", "draftNote", "status"]);
const plainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const validId = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
const emptyDrafts = () => ({ version: 1, entries: [] });
const invalidDrafts = () => new Error("Yedekteki çalışma notları geçersiz.");

/** A bounded, detached backup value containing only literal unfinished notes. */
export function normalizeWorkDrafts(value) {
  if (
    !plainObject(value) ||
    Object.keys(value).some((key) => key !== "version" && key !== "entries") ||
    !Object.hasOwn(value, "version") ||
    value.version !== 1 ||
    !Object.hasOwn(value, "entries") ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_ENTRIES
  )
    throw invalidDrafts();
  const recordIds = new Set();
  const sessionIds = new Set();
  const entries = [];
  for (let index = 0; index < value.entries.length; index++) {
    const entry = value.entries[index];
    if (
      !Object.hasOwn(value.entries, index) ||
      !plainObject(entry) ||
      Object.keys(entry).some((key) => !draftFields.has(key)) ||
      [...draftFields].some((key) => !Object.hasOwn(entry, key)) ||
      !validId(entry.recordId) ||
      !validId(entry.sessionId) ||
      recordIds.has(entry.recordId) ||
      sessionIds.has(entry.sessionId) ||
      typeof entry.draftNote !== "string" ||
      !entry.draftNote.trim() ||
      entry.draftNote.length > MAX_DRAFT_LENGTH ||
      (entry.status !== "running" && entry.status !== "paused")
    )
      throw invalidDrafts();
    recordIds.add(entry.recordId);
    sessionIds.add(entry.sessionId);
    entries.push({
      recordId: entry.recordId,
      sessionId: entry.sessionId,
      draftNote: entry.draftNote,
      status: entry.status,
    });
  }
  return { version: 1, entries };
}

function recordMap(records) {
  if (!Array.isArray(records)) throw invalidDrafts();
  return new Map(records.map((record) => [record?.id, record]));
}

function eligible(entry, byId) {
  const record = byId.get(entry.recordId);
  if (record?.type !== "daily") return false;
  const result = record.workLog?.find((log) => log.id === entry.sessionId);
  // A newer working note can share an already-recorded ID after a retirement
  // conflict. Keep it for the existing recovery/fork flow, with its raw bytes.
  return !result || String(result.note ?? "").trim() !== entry.draftNote.trim();
}

function eligibleDrafts(drafts, records) {
  const byId = recordMap(records);
  const entries = drafts.entries.filter((entry) => eligible(entry, byId));
  return {
    drafts: { version: 1, entries },
    ignoredCount: drafts.entries.length - entries.length,
  };
}

/** Legacy backups without this optional top-level field carry no draft change. */
export function workDraftsFromBackup(input, records) {
  if (!plainObject(input)) throw invalidDrafts();
  if (!Object.hasOwn(input, "workDrafts"))
    return { present: false, drafts: emptyDrafts(), ignoredCount: 0 };
  return {
    present: true,
    ...eligibleDrafts(normalizeWorkDrafts(input.workDrafts), records),
  };
}

function canonicalSnapshot(value) {
  return readWorkSessionSnapshot(JSON.stringify(value));
}

/** Export note content without exposing running ownership or elapsed time. */
export function exportWorkDrafts(sessionSnapshot, records) {
  const snapshot = canonicalSnapshot(sessionSnapshot);
  const byId = recordMap(records);
  return normalizeWorkDrafts({
    version: 1,
    entries: snapshot.entries
      .filter(
        (entry) =>
          entry.status !== "finished" &&
          typeof entry.draftNote === "string" &&
          entry.draftNote.trim() &&
          eligible(entry, byId),
      )
      .map(({ recordId, sessionId, draftNote, status }) => ({
        recordId,
        sessionId,
        draftNote,
        status,
      })),
  });
}

/** Preflight a detached merge; importing never resumes or owns another window. */
export function mergeWorkDrafts(
  currentSnapshot,
  drafts,
  records,
  { now = Date.now } = {},
) {
  const snapshot = canonicalSnapshot(currentSnapshot);
  const incoming = eligibleDrafts(normalizeWorkDrafts(drafts), records);
  const byId = recordMap(records);
  const selectedRecord = byId.get(snapshot.currentId);
  const clearSelection =
    snapshot.currentId !== null &&
    (selectedRecord?.type !== "daily" || CLOSED.has(selectedRecord.status));
  const retirements = snapshot.entries.filter((entry) => {
    if (entry.status === "finished") return false;
    const record = byId.get(entry.recordId);
    if (record?.type !== "daily") return false;
    const result = record.workLog?.find((log) => log.id === entry.sessionId);
    const text = (entry.draftNote ?? "").trim();
    return result && (!text || String(result.note ?? "").trim() === text);
  });
  const retiringIds = new Set(retirements.map((entry) => entry.recordId));
  const byRecord = new Map(
    snapshot.entries.map((entry) => [entry.recordId, entry]),
  );
  const replacements = [];
  for (const entry of incoming.drafts.entries) {
    if (
      snapshot.entries.some(
        (current) =>
          current.sessionId === entry.sessionId &&
          current.recordId !== entry.recordId,
      )
    )
      throw new Error(
        "Yedekteki çalışma notunun oturum kimliği başka bir işe ait.",
      );
    const current = byRecord.get(entry.recordId);
    if (
      current?.status !== "finished" &&
      !retiringIds.has(entry.recordId) &&
      current?.draftNote?.trim()
    ) {
      if (current.draftNote !== entry.draftNote) {
        const error = new Error(
          "Bu işin çalışma notu yedekten farklı. Mevcut not korunuyor; içeri aktarmadan önce notları uzlaştır.",
        );
        error.name = "WorkDraftConflictError";
        throw error;
      }
      continue;
    }
    replacements.push(entry);
  }
  const added = replacements.filter((entry) => !byRecord.has(entry.recordId));
  if (snapshot.entries.length + added.length > MAX_ENTRIES)
    throw new Error(
      "Çalışma notları birleştirilemiyor: en fazla 50 iş tutulabilir.",
    );
  if (replacements.length || clearSelection || retirements.length) {
    const at = typeof now === "function" ? now() : NaN;
    if (!Number.isSafeInteger(at) || at < 0)
      throw new Error("Çalışma notunun tarihi geçersiz.");
    for (const entry of retirements) {
      entry.status = "finished";
      entry.startedAt = null;
      entry.ownerId = null;
      entry.updatedAt = at;
      delete entry.draftNote;
      if (snapshot.currentId === entry.recordId) snapshot.currentId = null;
    }
    for (const entry of replacements) {
      const restored = {
        recordId: entry.recordId,
        sessionId: entry.sessionId,
        status: "paused",
        elapsedMs: 0,
        startedAt: null,
        ownerId: null,
        updatedAt: at,
        trackTime: false,
        draftNote: entry.draftNote,
      };
      const index = snapshot.entries.findIndex(
        (current) => current.recordId === entry.recordId,
      );
      if (index === -1) snapshot.entries.push(restored);
      else snapshot.entries[index] = restored;
    }
    if (clearSelection && snapshot.currentId !== null) {
      const selected = snapshot.entries.find(
        (entry) => entry.recordId === snapshot.currentId,
      );
      selected.status = "paused";
      selected.startedAt = null;
      selected.ownerId = null;
      selected.updatedAt = at;
      snapshot.currentId = null;
    }
  }
  return {
    snapshot: canonicalSnapshot(snapshot),
    ignoredCount: incoming.ignoredCount,
  };
}
