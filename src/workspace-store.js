import { validateStore } from "./model.js";
import { normalizePreferences, validPreferences } from "./preferences.js";
import { normalizeNotes, notesFromBackup } from "./workspace-notes.js";
import {
  readPrimaryWorkSessionRaw,
  readWorkSessionSnapshot,
} from "./work-session-store.js";
import { mergeWorkDrafts, normalizeWorkDrafts } from "./work-draft-backup.js";
import {
  workspaceSignature,
  makeHistoryEntry,
  pushHistory,
  undoEntry,
  readHistory,
} from "./workspace-history.js";

const conflictMessage =
  "Çalışma alanı başka bir pencerede değişti. Güncel kayıtlar yüklendi; işlemi yeniden deneyebilirsin.";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalRecords(records) {
  return validateStore({ version: 1, records }).records;
}

function quotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

/**
 * A single primary storage write commits records, appearance, and undo history.
 * The old preference key is only a compatibility mirror, never the authority
 * once the primary envelope contains preferences.
 */
export function createWorkspaceStore({
  storage,
  key,
  preferencesKey = `${key}-preferences`,
  workSessionKey = `${key}-work-session`,
  initialRecords = [],
  initialPreferences = { density: "comfortable" },
  initialNotes,
  readOnly = false,
  now = Date.now,
}) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof key !== "string" ||
    !key
  ) {
    throw new Error("Çalışma alanı depolaması geçersiz.");
  }

  let current;
  let entries = [];
  let blocked = Boolean(readOnly);
  let lastRaw;
  let lastLegacyRaw;
  let hasPrimaryPreferences = false;
  let lastEnvelope = null;

  function draftConflict(message) {
    const error = new Error(message);
    error.name = "WorkDraftConflictError";
    return error;
  }

  // The once-a-second widget check reads the same stored text again and again;
  // it is parsed only when it changed.
  let sessionMemo = null;
  function effectiveSessionRaw(primaryRaw) {
    if (sessionMemo && sessionMemo.primaryRaw === primaryRaw)
      return sessionMemo.value;
    const decoded = primaryRaw === null ? null : JSON.parse(primaryRaw);
    const primarySessions =
      decoded?.odak && Object.hasOwn(decoded.odak, "workSessions");
    const value = readPrimaryWorkSessionRaw(
      primaryRaw,
      primarySessions ? null : storage.getItem(workSessionKey),
    );
    // A legacy separate key can change on its own, so only primary is kept.
    sessionMemo = primarySessions ? { primaryRaw, value } : null;
    return value;
  }

  function readWorkSessionRaw() {
    return effectiveSessionRaw(storage.getItem(key));
  }

  function legacyPreferences() {
    const raw = storage.getItem(preferencesKey);
    let value;
    try {
      value = raw ? JSON.parse(raw) : initialPreferences;
    } catch {
      value = initialPreferences;
    }
    return { preferences: normalizePreferences(value), raw };
  }

  // Records saved unchanged (a work-note save rewrites only the notes) are
  // not checked field by field again.
  let checkedRecords = null;
  function validRecords(decoded) {
    const text =
      decoded && decoded.version === 1 && Array.isArray(decoded.records)
        ? JSON.stringify(decoded.records)
        : null;
    if (text !== null && checkedRecords?.text === text)
      return checkedRecords.records;
    const records = validateStore(decoded).records;
    checkedRecords = { text, records };
    return records;
  }

  function parsePersistent(raw) {
    const decoded =
      raw === null ? { version: 1, records: [] } : JSON.parse(raw);
    const records = validRecords(decoded);
    const metadata = decoded.odak;
    if (metadata && Object.hasOwn(metadata, "workSessions"))
      readPrimaryWorkSessionRaw(raw, null);
    const primaryPreferences =
      metadata?.version === 1 && validPreferences(metadata.preferences);
    let preferences;
    let legacyRaw;
    if (primaryPreferences) {
      preferences = normalizePreferences(metadata.preferences);
    } else {
      const legacy = legacyPreferences();
      preferences = legacy.preferences;
      legacyRaw = legacy.raw;
    }
    const savedNotes = notesFromBackup(decoded);
    const snapshot = {
      records,
      preferences,
      ...(savedNotes.present ? { notes: savedNotes.notes } : {}),
    };
    const history =
      metadata?.version === 1 ? readHistory(metadata.history, snapshot) : [];
    return {
      snapshot,
      history,
      primaryPreferences,
      legacyRaw,
      envelope: decoded,
    };
  }

  function adopt(parsed, raw) {
    current = parsed.snapshot;
    entries = parsed.history;
    lastRaw = raw;
    lastLegacyRaw = parsed.legacyRaw;
    hasPrimaryPreferences = parsed.primaryPreferences;
    lastEnvelope = parsed.envelope;
  }

  try {
    if (readOnly) throw new Error("Salt okunur çalışma alanı.");
    const raw = storage.getItem(key);
    adopt(parsePersistent(raw), raw);
  } catch {
    // A corrupt/unavailable store is never replaced with an empty one.
    current = {
      records: canonicalRecords(initialRecords),
      preferences: normalizePreferences(initialPreferences),
      ...(initialNotes === undefined
        ? {}
        : { notes: normalizeNotes(initialNotes) }),
    };
    entries = [];
    blocked = true;
  }

  function assertWritable() {
    if (blocked || readOnly) {
      throw new Error(
        "Kayıtlı çalışma alanı okunamadığı için değişiklik kaydedilemiyor.",
      );
    }
  }

  function assertCurrent() {
    const raw = storage.getItem(key);
    // Most local actions see exactly the primary value this controller wrote.
    // Avoid validating a full undo chain again on every click.
    if (raw === lastRaw) {
      if (hasPrimaryPreferences) return;
      if (storage.getItem(preferencesKey) === lastLegacyRaw) return;
    }
    const latest = parsePersistent(raw);
    const changed =
      workspaceSignature(latest.snapshot) !== workspaceSignature(current);
    adopt(latest, raw);
    if (changed) {
      const error = new Error(conflictMessage);
      error.name = "WorkspaceConflictError";
      throw error;
    }
  }

  function persist(snapshot, history, session = null) {
    let retained = [...history];
    let serialized;
    while (true) {
      const metadata = {
        ...(lastEnvelope?.odak && typeof lastEnvelope.odak === "object"
          ? lastEnvelope.odak
          : {}),
        version: 1,
        preferences: snapshot.preferences,
        history: retained,
      };
      if (Object.hasOwn(snapshot, "notes")) metadata.notes = snapshot.notes;
      else delete metadata.notes;
      if (session && session.write !== false)
        metadata.workSessions = session.snapshot;
      const envelope = {
        ...(lastEnvelope || {}),
        version: 1,
        records: snapshot.records,
        odak: metadata,
      };
      // Native top-level notes become authoritative primary metadata here.
      delete envelope.notes;
      serialized = JSON.stringify(envelope);
      try {
        const primaryRaw = storage.getItem(key);
        if (primaryRaw !== lastRaw) {
          adopt(parsePersistent(primaryRaw), primaryRaw);
          const error = new Error(conflictMessage);
          error.name = "WorkspaceConflictError";
          throw error;
        }
        if (session && effectiveSessionRaw(primaryRaw) !== session.expectedRaw)
          throw draftConflict(
            "Çalışma notları başka bir pencerede değişti. Yedek yüklenmedi; güncel notları kontrol et.",
          );
        storage.setItem(key, serialized);
        break;
      } catch (error) {
        if (!quotaError(error) || retained.length <= 1) throw error;
        retained = retained.slice(1);
      }
    }
    // No in-memory change happens before the primary write succeeds.
    current = snapshot;
    entries = retained;
    lastRaw = serialized;
    lastLegacyRaw = undefined;
    hasPrimaryPreferences = true;
    lastEnvelope = JSON.parse(serialized);
    try {
      const mirrored = JSON.stringify(snapshot.preferences);
      storage.setItem(preferencesKey, mirrored);
      lastLegacyRaw = mirrored;
    } catch {
      // The preference remains durable in the successful primary write.
    }
  }

  function commit(snapshot, label, draftRestore = null) {
    assertWritable();
    assertCurrent();
    let session = null;
    let sessionChange;
    if (draftRestore) {
      const beforeRaw = readWorkSessionRaw();
      if (draftRestore.hasExpected && beforeRaw !== draftRestore.expectedRaw)
        throw draftConflict(
          "Çalışma notları başka bir pencerede değişti. Yedek yüklenmedi; güncel notları kontrol et.",
        );
      const before = readWorkSessionSnapshot(beforeRaw);
      const merged = mergeWorkDrafts(
        before,
        draftRestore.drafts,
        snapshot.records,
        { now },
      ).snapshot;
      session = { snapshot: merged, expectedRaw: beforeRaw, write: false };
      if (JSON.stringify(before) !== JSON.stringify(merged)) {
        session.write = true;
        sessionChange = { version: 1, before, after: merged };
      }
    }
    const entry = makeHistoryEntry(current, snapshot, label, {
      sessionChange,
    });
    if (!entry) return true;
    persist(snapshot, pushHistory(entries, entry), session);
    return true;
  }

  function writeWorkSession(raw, expectedRaw) {
    assertWritable();
    if (typeof raw !== "string") throw new Error("Çalışma notları geçersiz.");
    const next = readWorkSessionSnapshot(raw);
    const primaryRaw = storage.getItem(key);
    if (effectiveSessionRaw(primaryRaw) !== expectedRaw)
      throw draftConflict(
        "Çalışma notu başka bir pencerede değişti. Güncel not korunuyor.",
      );
    let envelope;
    if (primaryRaw === null) {
      // The embedded first workspace may never have had a primary write.
      envelope = {
        version: 1,
        records: clone(current.records),
        odak: {
          version: 1,
          preferences: clone(current.preferences),
          ...(Object.hasOwn(current, "notes")
            ? { notes: clone(current.notes) }
            : {}),
          history: clone(entries),
        },
      };
    } else {
      envelope = JSON.parse(primaryRaw);
      validRecords(envelope);
    }
    envelope.odak = {
      ...(envelope.odak && typeof envelope.odak === "object"
        ? envelope.odak
        : {}),
      version: 1,
      workSessions: next,
    };
    const serialized = JSON.stringify(envelope);
    // Compare the context again immediately before the only durable write.
    const latestRaw = storage.getItem(key);
    if (
      latestRaw !== primaryRaw ||
      effectiveSessionRaw(latestRaw) !== expectedRaw
    )
      throw draftConflict(
        "Çalışma notu başka bir pencerede değişti. Güncel not korunuyor.",
      );
    storage.setItem(key, serialized);
    // Leave domain adoption to its normal CAS check: a session write must not
    // silently acknowledge records changed in another window.
    return true;
  }

  let expectedSessionRaw;
  const sessionStorage = {
    getItem(requestedKey) {
      if (requestedKey !== workSessionKey)
        throw new Error("Çalışma notu depolama anahtarı geçersiz.");
      expectedSessionRaw = readWorkSessionRaw();
      return expectedSessionRaw;
    },
    setItem(requestedKey, raw) {
      if (requestedKey !== workSessionKey)
        throw new Error("Çalışma notu depolama anahtarı geçersiz.");
      writeWorkSession(raw, expectedSessionRaw);
      expectedSessionRaw = JSON.stringify(readWorkSessionSnapshot(raw));
    },
  };

  return {
    sessionStorage,
    readWorkSessionRaw,
    get records() {
      return clone(current.records);
    },
    get preferences() {
      return clone(current.preferences);
    },
    get notes() {
      return clone(current.notes || []);
    },
    get hasNotes() {
      return Object.hasOwn(current, "notes");
    },
    get history() {
      return clone(entries);
    },
    get canUndo() {
      return !blocked && !readOnly && entries.length > 0;
    },
    get undoLabel() {
      return !blocked && !readOnly ? (entries.at(-1)?.label ?? null) : null;
    },
    get readOnly() {
      return blocked || readOnly;
    },
    saveRecords(records, label = "Kayıt değişikliği") {
      return commit(
        {
          records: canonicalRecords(records),
          preferences: clone(current.preferences),
          ...(Object.hasOwn(current, "notes")
            ? { notes: clone(current.notes) }
            : {}),
        },
        label,
      );
    },
    savePreferences(value, label = "Görünüm değişikliği") {
      if (!validPreferences(value))
        throw new Error("Görünüm tercihi geçersiz.");
      return commit(
        {
          records: clone(current.records),
          preferences: normalizePreferences(value),
          ...(Object.hasOwn(current, "notes")
            ? { notes: clone(current.notes) }
            : {}),
        },
        label,
      );
    },
    saveNotes(value, label = "Not değişikliği") {
      const notes = normalizeNotes(value);
      return commit(
        {
          records: clone(current.records),
          preferences: clone(current.preferences),
          ...(notes.length || Object.hasOwn(current, "notes") ? { notes } : {}),
        },
        label,
      );
    },
    saveWorkspace(value, label = "Çalışma alanını geri yükleme") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Geri yüklenecek çalışma alanı geçersiz.");
      const hasPreferences = Object.hasOwn(value, "preferences");
      if (hasPreferences && !validPreferences(value.preferences))
        throw new Error("Görünüm tercihi geçersiz.");
      const hasDrafts = Object.hasOwn(value, "workDrafts");
      const hasExpected = Object.hasOwn(value, "expectedWorkSessionRaw");
      if (
        hasExpected &&
        value.expectedWorkSessionRaw !== null &&
        typeof value.expectedWorkSessionRaw !== "string"
      )
        throw new Error("Çalışma notlarının denetim bilgisi geçersiz.");
      return commit(
        {
          records: canonicalRecords(value.records),
          preferences: hasPreferences
            ? normalizePreferences(value.preferences)
            : clone(current.preferences),
          ...(Object.hasOwn(value, "notes")
            ? { notes: normalizeNotes(value.notes) }
            : Object.hasOwn(current, "notes")
              ? { notes: clone(current.notes) }
              : {}),
        },
        label,
        hasDrafts
          ? {
              drafts: normalizeWorkDrafts(value.workDrafts),
              hasExpected,
              expectedRaw: value.expectedWorkSessionRaw,
            }
          : null,
      );
    },
    undo() {
      assertWritable();
      assertCurrent();
      const entry = entries.at(-1);
      if (!entry) return null;
      const sessionRaw = entry.sessionChange ? readWorkSessionRaw() : null;
      const restored = undoEntry(
        entry.sessionChange
          ? { ...current, workSessions: readWorkSessionSnapshot(sessionRaw) }
          : current,
        entry,
      );
      persist(
        restored,
        entries.slice(0, -1),
        entry.sessionChange
          ? { snapshot: restored.workSessions, expectedRaw: sessionRaw }
          : null,
      );
      return entry.label;
    },
    synchronize(rawValue) {
      if (rawValue !== null && typeof rawValue !== "string") {
        throw new Error("Çalışma alanı depolama değeri geçersiz.");
      }
      const parsed = parsePersistent(rawValue);
      adopt(parsed, rawValue);
      if (!readOnly) blocked = false;
      return true;
    },
  };
}
