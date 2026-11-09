import { validateStore } from "./model.js";
import { normalizePreferences, validPreferences } from "./preferences.js";
import { normalizeNotes, notesFromBackup } from "./workspace-notes.js";
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
  initialRecords = [],
  initialPreferences = { density: "comfortable" },
  initialNotes,
  readOnly = false,
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

  function parsePersistent(raw) {
    const decoded =
      raw === null ? { version: 1, records: [] } : JSON.parse(raw);
    const records = validateStore(decoded).records;
    const metadata = decoded.odak;
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
    return { snapshot, history, primaryPreferences, legacyRaw };
  }

  function adopt(parsed, raw) {
    current = parsed.snapshot;
    entries = parsed.history;
    lastRaw = raw;
    lastLegacyRaw = parsed.legacyRaw;
    hasPrimaryPreferences = parsed.primaryPreferences;
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

  function persist(snapshot, history) {
    let retained = [...history];
    let serialized;
    while (true) {
      serialized = JSON.stringify({
        version: 1,
        records: snapshot.records,
        odak: {
          version: 1,
          preferences: snapshot.preferences,
          ...(Object.hasOwn(snapshot, "notes")
            ? { notes: snapshot.notes }
            : {}),
          history: retained,
        },
      });
      try {
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
    try {
      const mirrored = JSON.stringify(snapshot.preferences);
      storage.setItem(preferencesKey, mirrored);
      lastLegacyRaw = mirrored;
    } catch {
      // The preference remains durable in the successful primary write.
    }
  }

  function commit(snapshot, label) {
    assertWritable();
    assertCurrent();
    const entry = makeHistoryEntry(current, snapshot, label);
    if (!entry) return true;
    persist(snapshot, pushHistory(entries, entry));
    return true;
  }

  return {
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
      );
    },
    undo() {
      assertWritable();
      assertCurrent();
      const entry = entries.at(-1);
      if (!entry) return null;
      const restored = undoEntry(current, entry);
      persist(restored, entries.slice(0, -1));
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
