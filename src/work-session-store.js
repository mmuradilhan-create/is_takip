export const WORK_SESSION_KEY = "is-takip-v1-work-session";

const MAX_ENTRIES = 50;
const MAX_RAW_LENGTH = 500000;
const MAX_DRAFT_LENGTH = 10000;
const STATES = new Set(["running", "paused", "finished"]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const empty = () => ({ version: 1, currentId: null, entries: [] });
const validId = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
const validTime = (value) => Number.isSafeInteger(value) && value >= 0;
const validDraft = (value) =>
  typeof value === "string" && value.length <= MAX_DRAFT_LENGTH;

const newSessionId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Old v1 context has no identifier. All windows derive the same ID until the
// next context write persists it; loading an old context never rewrites it.
function legacySessionId(entry) {
  const source = JSON.stringify([
    entry.recordId,
    entry.elapsedMs,
    entry.startedAt,
    entry.updatedAt,
  ]);
  let hash = 2166136261;
  let other = 5381;
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    other = Math.imul(other, 33) ^ source.charCodeAt(index);
  }
  return `legacy-${(hash >>> 0).toString(36)}-${(other >>> 0).toString(36)}`;
}

function parse(raw) {
  if (raw === null) return empty();
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH)
    throw new Error("Geçersiz çalışma oturumu.");
  const decoded = JSON.parse(raw);
  if (
    !decoded ||
    decoded.version !== 1 ||
    !Array.isArray(decoded.entries) ||
    decoded.entries.length > 1000 ||
    (decoded.currentId !== null && !validId(decoded.currentId))
  )
    throw new Error("Geçersiz çalışma oturumu.");
  const ids = new Set();
  const entries = decoded.entries.map((entry) => {
    if (
      !entry ||
      !validId(entry.recordId) ||
      (entry.sessionId !== undefined && !validId(entry.sessionId)) ||
      ids.has(entry.recordId) ||
      !STATES.has(entry.status) ||
      !validTime(entry.elapsedMs) ||
      !validTime(entry.updatedAt) ||
      (Object.hasOwn(entry, "draftNote") && !validDraft(entry.draftNote)) ||
      (Object.hasOwn(entry, "trackTime") &&
        typeof entry.trackTime !== "boolean") ||
      (entry.status === "running"
        ? !validTime(entry.startedAt) || !validId(entry.ownerId)
        : entry.startedAt !== null || entry.ownerId !== null)
    )
      throw new Error("Geçersiz çalışma oturumu.");
    ids.add(entry.recordId);
    return {
      recordId: entry.recordId,
      sessionId: entry.sessionId ?? legacySessionId(entry),
      status: entry.status,
      elapsedMs: entry.elapsedMs,
      startedAt: entry.startedAt,
      ownerId: entry.ownerId,
      updatedAt: entry.updatedAt,
      ...(Object.hasOwn(entry, "draftNote")
        ? { draftNote: entry.draftNote }
        : {}),
      ...(Object.hasOwn(entry, "trackTime")
        ? { trackTime: entry.trackTime }
        : {}),
    };
  });
  const running = entries.filter((entry) => entry.status === "running");
  const selected = entries.find(
    (entry) => entry.recordId === decoded.currentId,
  );
  if (
    running.length > 1 ||
    (running.length && running[0].recordId !== decoded.currentId) ||
    (decoded.currentId !== null &&
      (!selected || selected.status === "finished"))
  )
    throw new Error("Geçersiz çalışma oturumu.");
  return { version: 1, currentId: decoded.currentId, entries };
}

/** Read and validate session context without creating an owner or writing storage. */
export function readWorkSessionSnapshot(raw) {
  return parse(raw);
}

function elapsedAt(entry, at) {
  if (!entry) return 0;
  const added =
    entry.status === "running" &&
    entry.trackTime !== false &&
    Number.isFinite(at)
      ? Math.max(0, at - entry.startedAt)
      : 0;
  return Math.min(Number.MAX_SAFE_INTEGER, entry.elapsedMs + added);
}

function pauseEntry(entry, at) {
  entry.elapsedMs = elapsedAt(entry, at);
  entry.status = "paused";
  entry.startedAt = null;
  entry.ownerId = null;
  entry.updatedAt = at;
}

/** Session context is deliberately separate from records and their undo history. */
export function createWorkSessionStore({
  storage,
  key = WORK_SESSION_KEY,
  now = Date.now,
  onChange = () => {},
  onError = () => {},
  ownerId = globalThis.crypto?.randomUUID?.() ||
    `work-${Math.random().toString(36).slice(2)}`,
} = {}) {
  if (!validId(ownerId) || !validId(key) || typeof now !== "function")
    throw new TypeError(
      "Geçerli bir çalışma oturumu yapılandırması gereklidir.",
    );
  if (!storage) {
    try {
      storage = globalThis.localStorage;
    } catch {
      /* Report unavailable storage below. */
    }
  }
  let current = empty();
  let lastRaw;
  let readOnly = false;
  let lastErrorToken;

  function notify() {
    try {
      onChange(clone(current));
    } catch {
      /* UI errors must not undo a committed session. */
    }
  }
  function report(message, token, force = false) {
    readOnly = true;
    if (!force && token === lastErrorToken) return;
    lastErrorToken = token;
    try {
      onError(message);
    } catch {
      /* The original data stays protected. */
    }
  }
  function readRaw() {
    if (
      typeof storage?.getItem !== "function" ||
      typeof storage?.setItem !== "function"
    )
      throw new Error("Tarayıcı depolamasına erişilemiyor.");
    return storage.getItem(key);
  }
  function adopt(raw, notifyChange) {
    if (raw === lastRaw && !readOnly) return false;
    const next = parse(raw);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    lastRaw = raw;
    readOnly = false;
    lastErrorToken = undefined;
    if (changed && notifyChange) notify();
    return changed;
  }
  try {
    adopt(readRaw(), false);
  } catch (error) {
    report(
      "Çalışma oturumu okunamadı. Mevcut oturum bilgisi korunuyor.",
      `${error.name}:${error.message}`,
    );
  }

  function clock() {
    const value = now();
    if (!validTime(value)) throw new Error("Sistem saati okunamadı.");
    return value;
  }
  function commit(change) {
    try {
      adopt(readRaw(), true);
      const next = clone(current);
      if (!change(next, clock())) return true;
      if (next.entries.length > MAX_ENTRIES) {
        const retained = new Set(
          next.entries
            .filter(
              (entry) =>
                entry.recordId === next.currentId ||
                (entry.status !== "finished" && entry.draftNote?.length),
            )
            .map((entry) => entry.recordId),
        );
        if (retained.size > MAX_ENTRIES) {
          const error = new Error(
            "Çalışma notları dolu. Yeni bir işe başlamadan önce bekleyen notlardan birini bitir veya sil.",
          );
          error.name = "WorkSessionCapacityError";
          throw error;
        }
        const ordered = [...next.entries].sort(
          (a, b) =>
            Number(b.recordId === next.currentId) -
              Number(a.recordId === next.currentId) ||
            b.updatedAt - a.updatedAt ||
            a.recordId.localeCompare(b.recordId),
        );
        for (const entry of ordered) {
          if (retained.size >= MAX_ENTRIES) break;
          retained.add(entry.recordId);
        }
        next.entries = next.entries.filter((entry) =>
          retained.has(entry.recordId),
        );
      }
      const encoded = JSON.stringify(next);
      if (encoded.length > MAX_RAW_LENGTH) {
        const error = new Error(
          "Çalışma notları için ayrılan alan dolu. Mevcut notlarını bitirip yeniden deneyebilirsin.",
        );
        error.name = "WorkSessionCapacityError";
        throw error;
      }
      // The only persistent mutation in this module is one write to its own key.
      storage.setItem(key, encoded);
      current = next;
      lastRaw = encoded;
      readOnly = false;
      lastErrorToken = undefined;
      notify();
      return true;
    } catch (error) {
      if (
        ["WorkDraftConflictError", "WorkSessionCapacityError"].includes(
          error.name,
        )
      ) {
        try {
          onError(error.message);
        } catch {
          /* Keep the committed context usable. */
        }
        return false;
      }
      report(
        "Çalışma oturumu kaydedilemedi. Tarayıcı depolamasını kontrol et.",
        `${error.name}:${error.message}`,
        true,
      );
      return false;
    }
  }

  function start(recordId, options = {}) {
    if (
      !validId(recordId) ||
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      (Object.hasOwn(options, "trackTime") &&
        typeof options.trackTime !== "boolean")
    ) {
      try {
        onError("Çalışmaya başlamak için geçerli bir kayıt seç.");
      } catch {
        /* No mutation. */
      }
      return false;
    }
    return commit((next, at) => {
      const old = next.entries.find(
        (entry) => entry.recordId === next.currentId,
      );
      let entry = next.entries.find((item) => item.recordId === recordId);
      const fresh = !entry || entry.status === "finished";
      const hasMode = Object.hasOwn(options, "trackTime");
      const mode = hasMode
        ? options.trackTime
        : fresh
          ? undefined
          : entry.trackTime;
      if (
        old?.recordId === recordId &&
        old.status === "running" &&
        entry.trackTime === mode
      )
        return false;
      if (old?.status === "running") pauseEntry(old, at);
      if (!entry) {
        entry = {
          recordId,
          sessionId: newSessionId(),
          status: "paused",
          elapsedMs: 0,
          startedAt: null,
          ownerId: null,
          updatedAt: at,
        };
        next.entries.push(entry);
      }
      if (entry.status === "finished") {
        entry.elapsedMs = 0;
        entry.sessionId = newSessionId();
        delete entry.draftNote;
      }
      if (mode === undefined) delete entry.trackTime;
      else entry.trackTime = mode;
      entry.status = "running";
      entry.startedAt = at;
      entry.ownerId = ownerId;
      entry.updatedAt = at;
      next.currentId = recordId;
      return true;
    });
  }
  function saveDraft(recordId, sessionId, text, expectedDraft) {
    if (
      !validId(recordId) ||
      !validId(sessionId) ||
      !validDraft(text) ||
      !validDraft(expectedDraft)
    ) {
      try {
        onError(
          "Çalışma notu geçerli bir oturuma ait olmalı ve en fazla 10000 karakter içermelidir.",
        );
      } catch {
        /* No mutation. */
      }
      return false;
    }
    let accepted = false;
    const saved = commit((next, at) => {
      const entry = next.entries.find((item) => item.recordId === recordId);
      if (
        !entry ||
        entry.sessionId !== sessionId ||
        entry.status === "finished"
      )
        return false;
      const previous = entry.draftNote ?? "";
      if (previous !== expectedDraft) {
        const error = new Error(
          "Çalışma notu başka bir pencerede değişti. Yazdıkların korunuyor; güncel notu kontrol et.",
        );
        error.name = "WorkDraftConflictError";
        throw error;
      }
      accepted = true;
      if (previous === text) return false;
      entry.draftNote = text;
      entry.updatedAt = at;
      return true;
    });
    return saved && accepted;
  }
  function pause(expectedId, expectedSessionId) {
    return commit((next, at) => {
      if (expectedId !== undefined && next.currentId !== expectedId)
        return false;
      const entry = next.entries.find(
        (item) => item.recordId === next.currentId,
      );
      if (
        expectedSessionId !== undefined &&
        entry?.sessionId !== expectedSessionId
      )
        return false;
      if (!entry || entry.status !== "running") return false;
      pauseEntry(entry, at);
      return true;
    });
  }
  function finish(expectedId, expectedSessionId, options = {}) {
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      (Object.hasOwn(options, "expectedDraft") &&
        (!validId(expectedId) ||
          !validId(expectedSessionId) ||
          !validDraft(options.expectedDraft)))
    )
      return false;
    const guarded = Object.hasOwn(options, "expectedDraft");
    let accepted = false;
    const saved = commit((next, at) => {
      if (
        expectedSessionId === undefined &&
        expectedId !== undefined &&
        next.currentId !== expectedId
      )
        return false;
      const entry = next.entries.find(
        (item) =>
          item.recordId ===
          (expectedSessionId === undefined ? next.currentId : expectedId),
      );
      if (
        expectedSessionId !== undefined &&
        entry?.sessionId !== expectedSessionId
      )
        return false;
      if (!entry || entry.status === "finished") return false;
      if (guarded && (entry.draftNote ?? "") !== options.expectedDraft) {
        const error = new Error(
          "Çalışma notu başka bir pencerede değişti. Yeni not korunuyor; güncel notu kontrol et.",
        );
        error.name = "WorkDraftConflictError";
        throw error;
      }
      accepted = true;
      pauseEntry(entry, at);
      entry.status = "finished";
      delete entry.draftNote;
      if (next.currentId === entry.recordId) next.currentId = null;
      return true;
    });
    return saved && (!guarded || accepted);
  }
  function forkDraft(recordId, sessionId, expectedDraft) {
    if (
      !validId(recordId) ||
      !validId(sessionId) ||
      !validDraft(expectedDraft) ||
      !expectedDraft.trim()
    )
      return false;
    let accepted = false;
    const saved = commit((next, at) => {
      const entry = next.entries.find((item) => item.recordId === recordId);
      if (
        !entry ||
        entry.sessionId !== sessionId ||
        entry.status === "finished"
      )
        return false;
      if ((entry.draftNote ?? "") !== expectedDraft) {
        const error = new Error(
          "Çalışma notu başka bir pencerede değişti. Yeni not korunuyor; güncel notu kontrol et.",
        );
        error.name = "WorkDraftConflictError";
        throw error;
      }
      entry.sessionId = newSessionId();
      entry.status = "paused";
      entry.elapsedMs = 0;
      entry.startedAt = null;
      entry.ownerId = null;
      entry.updatedAt = at;
      entry.trackTime = false;
      // Keep the exact saved draft and any other task's selected session.
      accepted = true;
      return true;
    });
    return saved && accepted;
  }
  function discard(expectedId, expectedSessionId, expectedPaused) {
    if (
      !validId(expectedId) ||
      !validId(expectedSessionId) ||
      !validTime(expectedPaused?.elapsedMs) ||
      !validTime(expectedPaused?.updatedAt)
    )
      return false;
    let discarded = false;
    const saved = commit((next) => {
      const entry = next.entries.find((item) => item.recordId === expectedId);
      if (
        next.currentId !== expectedId ||
        entry?.sessionId !== expectedSessionId ||
        entry.status !== "paused" ||
        entry.elapsedMs !== expectedPaused.elapsedMs ||
        entry.updatedAt !== expectedPaused.updatedAt
      )
        return false;
      next.entries = next.entries.filter((item) => item !== entry);
      next.currentId = null;
      discarded = true;
      return true;
    });
    return saved && discarded;
  }
  function synchronize(raw) {
    try {
      return adopt(raw === undefined ? readRaw() : raw, true);
    } catch (error) {
      report(
        "Çalışma oturumu okunamadı. Mevcut oturum bilgisi korunuyor.",
        `${error.name}:${error.message}`,
      );
      return false;
    }
  }
  function reconcile(validOpenIds) {
    const valid = new Set(validOpenIds);
    return commit((next, at) => {
      if (next.currentId === null || valid.has(next.currentId)) return false;
      const entry = next.entries.find(
        (item) => item.recordId === next.currentId,
      );
      if (entry) pauseEntry(entry, at);
      next.currentId = null;
      return true;
    });
  }
  function stopOwner() {
    return commit((next, at) => {
      const entry = next.entries.find(
        (item) => item.recordId === next.currentId,
      );
      if (!entry || entry.status !== "running" || entry.ownerId !== ownerId)
        return false;
      pauseEntry(entry, at);
      return true;
    });
  }

  return {
    get snapshot() {
      return clone(current);
    },
    get current() {
      return clone(
        current.entries.find((entry) => entry.recordId === current.currentId) ||
          null,
      );
    },
    get readOnly() {
      return readOnly;
    },
    get(recordId) {
      return clone(
        current.entries.find((entry) => entry.recordId === recordId) || null,
      );
    },
    elapsed(recordId = current.currentId, at = now()) {
      return elapsedAt(
        current.entries.find((entry) => entry.recordId === recordId),
        at,
      );
    },
    start,
    saveDraft,
    pause,
    finish,
    forkDraft,
    discard,
    synchronize,
    reconcile,
    stopOwner,
  };
}
