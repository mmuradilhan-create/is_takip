import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import { addChoice, removeChoice } from "../src/choice-catalogs.js";
import {
  createWorkSessionStore,
  readWorkSessionSnapshot,
} from "../src/work-session-store.js";

const KEY = "test-workspace";
const PREFS = `${KEY}-preferences`;
const timestamp = "2026-11-06T09:00:00.000Z";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = [];
    this.beforeGet = null;
    this.beforeSet = null;
  }
  getItem(key) {
    this.beforeGet?.(key);
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.beforeSet?.(key, String(value));
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value) });
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function quota() {
  const error = new Error("Storage is full");
  error.name = "QuotaExceededError";
  return error;
}
function record(input = {}) {
  return createRecord({
    id: "daily-one",
    title: "Günlük kontrol",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceFields: { Kategori: "Kontrol", nested: { values: [1, "özel"] } },
    ...input,
  });
}
function linkedRecords() {
  const weekly = record({
    id: "weekly-one",
    type: "weekly",
    title: "Haftalık hedef",
  });
  const daily = record({ parentId: weekly.id, nextAction: "Sonraki adım" });
  return [weekly, daily];
}
function setup(records = [record()], preferences) {
  const values = { [KEY]: JSON.stringify({ version: 1, records }) };
  if (preferences) values[PREFS] = JSON.stringify(preferences);
  const storage = new MemoryStorage(values);
  const store = createWorkspaceStore({ storage, key: KEY });
  return { storage, store };
}
function stored(storage) {
  return JSON.parse(storage.getItem(KEY));
}

function sessions(store, ownerId = "owner") {
  return createWorkSessionStore({
    storage: store.sessionStorage,
    key: `${KEY}-work-session`,
    ownerId,
    now: () => 1000,
  });
}

function draft(recordId, text = "Taslak", sessionId = `session-${recordId}`) {
  return { recordId, sessionId, draftNote: text, status: "running" };
}

test("legacy data opens without writes and the first change atomically stores records, preferences and history", () => {
  const original = linkedRecords();
  const { storage, store } = setup(original, {
    density: "compact",
    appName: "Eski ad",
  });
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(store.records, original);
  assert.deepEqual(store.preferences, { density: "compact" });
  const edited = original.map((item) =>
    item.id === "daily-one" ? { ...item, description: "Yeni not" } : item,
  );
  assert.equal(store.saveRecords(edited, "Kayıt düzenleme"), true);
  const primaryWrites = storage.writes.filter((item) => item.key === KEY);
  assert.equal(primaryWrites.length, 1);
  const envelope = JSON.parse(primaryWrites[0].value);
  assert.deepEqual(envelope.records, edited);
  assert.deepEqual(envelope.odak.preferences, { density: "compact" });
  assert.equal(envelope.odak.version, 1);
  assert.equal(envelope.odak.history.length, 1);
  assert.equal(store.undoLabel, "Kayıt düzenleme");
  assert.equal(store.canUndo, true);
  assert.deepEqual(validateStore(envelope), { version: 1, records: edited });
  assert.deepEqual(JSON.parse(storage.getItem(PREFS)), { density: "compact" });
});

test("a failed primary write leaves stored records, in-memory state and undo history untouched", () => {
  const { storage, store } = setup();
  const beforeRaw = storage.getItem(KEY);
  const beforeRecords = store.records;
  storage.beforeSet = (key) => {
    if (key === KEY) throw quota();
  };
  assert.throws(
    () =>
      store.saveRecords(
        [{ ...beforeRecords[0], status: "completed" }],
        "Tamamlama",
      ),
    /full/,
  );
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.deepEqual(store.records, beforeRecords);
  assert.deepEqual(store.history, []);
  assert.equal(store.canUndo, false);
  assert.equal(storage.writes.length, 0);
});

test("primary preferences remain durable and undoable when the compatibility mirror cannot be written", () => {
  const { storage, store } = setup();
  storage.beforeSet = (key) => {
    if (key === PREFS) throw quota();
  };
  assert.equal(store.savePreferences({ density: "compact" }), true);
  assert.deepEqual(store.preferences, { density: "compact" });
  assert.deepEqual(stored(storage).odak.preferences, { density: "compact" });
  storage.beforeGet = (key) => {
    if (key === PREFS) throw new Error("No mirror access");
  };
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.deepEqual(reopened.preferences, { density: "compact" });
  assert.equal(reopened.canUndo, true);
  assert.equal(reopened.undo(), "Görünüm değişikliği");
  assert.deepEqual(reopened.preferences, { density: "comfortable" });
  assert.deepEqual(stored(storage).odak.preferences, {
    density: "comfortable",
  });
});

test("mixed record and appearance history survives reload and exactly restores reset, deletion, preferences and edits", () => {
  const original = linkedRecords();
  const { storage, store } = setup(original);
  const edited = original.map((item) =>
    item.id === "daily-one"
      ? {
          ...item,
          status: "completed",
          description: "Güncel ayrıntı",
          updatedAt: "2026-11-06T10:00:00.000Z",
        }
      : item,
  );
  store.saveRecords(edited, "Düzenleme");
  store.savePreferences({ density: "compact" }, "Görünüm");
  const unlinked = [{ ...edited[1], parentId: null }];
  store.saveRecords(unlinked, "Haftalık hedef silme");
  store.saveRecords([], "Sıfırlama");
  assert.deepEqual(stored(storage).records, []);
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.deepEqual(reopened.records, []);
  assert.equal(reopened.history.length, 4);
  assert.equal(reopened.undo(), "Sıfırlama");
  assert.deepEqual(reopened.records, unlinked);
  assert.equal(reopened.undo(), "Haftalık hedef silme");
  assert.deepEqual(reopened.records, edited);
  assert.equal(reopened.records[1].parentId, "weekly-one");
  assert.deepEqual(reopened.preferences, { density: "compact" });
  assert.equal(reopened.undo(), "Görünüm");
  assert.deepEqual(reopened.preferences, { density: "comfortable" });
  assert.deepEqual(reopened.records, edited);
  assert.equal(reopened.undo(), "Düzenleme");
  assert.deepEqual(reopened.records, original);
  assert.equal(reopened.undo(), null);
  assert.equal(reopened.canUndo, false);
  assert.equal(stored(storage).odak.history.length, 0);
});

test("an external record change invalidates copied stale history and undo cannot erase the new record", () => {
  const { storage, store } = setup();
  store.saveRecords(
    [{ ...store.records[0], status: "completed" }],
    "Tamamlama",
  );
  const external = record({
    id: "external-one",
    title: "Diğer pencerede eklendi",
  });
  const changed = stored(storage);
  changed.records.push(external);
  storage.setItem(KEY, JSON.stringify(changed));
  const externalRaw = storage.getItem(KEY);
  assert.throws(
    () => store.undo(),
    (error) => error.name === "WorkspaceConflictError",
  );
  assert.equal(storage.getItem(KEY), externalRaw);
  assert.deepEqual(store.records, changed.records);
  assert.equal(store.canUndo, false);
  assert.deepEqual(store.history, []);
  const another = record({ id: "next-one", title: "Yeni işlem" });
  store.saveRecords([...store.records, another], "Ekleme");
  assert.equal(store.undo(), "Ekleme");
  assert.deepEqual(store.records, changed.records);
  assert.ok(store.records.some((item) => item.id === external.id));
});

test("a stale attempted save adopts the external snapshot without overwriting it", () => {
  const { storage, store } = setup();
  const candidate = [
    { ...store.records[0], title: "Eski penceredeki düzenleme" },
  ];
  const external = record({ id: "external-two", title: "Yeni dış kayıt" });
  const changed = { version: 1, records: [external] };
  storage.setItem(KEY, JSON.stringify(changed));
  const before = storage.getItem(KEY);
  assert.throws(() => store.saveRecords(candidate), /başka bir pencerede/);
  assert.equal(storage.getItem(KEY), before);
  assert.deepEqual(store.records, [external]);
});

test("legacy preference changes are detected, while primary preferences override an outdated mirror", () => {
  const { storage, store } = setup();
  storage.setItem(PREFS, JSON.stringify({ density: "compact" }));
  assert.throws(
    () => store.saveRecords([{ ...store.records[0], status: "completed" }]),
    /başka bir pencerede/,
  );
  assert.deepEqual(store.preferences, { density: "compact" });
  assert.equal(store.records[0].status, "planned");
  store.saveRecords([{ ...store.records[0], status: "completed" }]);
  storage.setItem(PREFS, JSON.stringify({ density: "comfortable" }));
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.deepEqual(reopened.preferences, { density: "compact" });
  assert.equal(reopened.records[0].status, "completed");
});

test("synchronize adopts another window's valid undo chain, rejects malformed data atomically, and handles removal", () => {
  const original = [record()];
  const { storage, store } = setup(original, { density: "compact" });
  const second = createWorkspaceStore({ storage, key: KEY });
  store.saveRecords(
    [{ ...original[0], description: "Paylaşılan değişiklik" }],
    "Düzenleme",
  );
  second.synchronize(storage.getItem(KEY));
  assert.deepEqual(second.records, store.records);
  assert.equal(second.canUndo, true);
  const before = second.records;
  assert.throws(() => second.synchronize("{bozuk"));
  assert.deepEqual(second.records, before);
  assert.equal(second.canUndo, true);
  assert.equal(second.undo(), "Düzenleme");
  assert.deepEqual(second.records, original);
  assert.throws(() => store.undo(), /başka bir pencerede/);
  assert.deepEqual(store.records, original);
  storage.removeItem(KEY);
  second.synchronize(null);
  assert.deepEqual(second.records, []);
  assert.equal(second.canUndo, false);
  assert.deepEqual(second.preferences, { density: "compact" });
});

test("quota retry removes only older undo entries and keeps the latest transaction undoable", () => {
  const { storage, store } = setup();
  const initial = store.records;
  store.saveRecords([{ ...initial[0], title: "İlk düzenleme" }], "İlk işlem");
  const first = store.records;
  storage.beforeSet = (key, value) => {
    if (key === KEY && JSON.parse(value).odak.history.length > 1) throw quota();
  };
  store.saveRecords(
    [{ ...first[0], title: "İkinci düzenleme" }],
    "İkinci işlem",
  );
  assert.equal(store.history.length, 1);
  assert.equal(store.undoLabel, "İkinci işlem");
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.equal(reopened.canUndo, true);
  assert.equal(reopened.undo(), "İkinci işlem");
  assert.deepEqual(reopened.records, first);
  assert.equal(reopened.canUndo, false);
  assert.notDeepEqual(reopened.records, initial);
});

test("bad optional history never prevents valid records from opening or making a fresh undoable change", () => {
  const original = [record()];
  const storage = new MemoryStorage({
    [KEY]: JSON.stringify({
      version: 1,
      records: original,
      odak: {
        version: 1,
        preferences: { density: "compact" },
        history: [{ broken: true }],
      },
    }),
  });
  const store = createWorkspaceStore({ storage, key: KEY });
  assert.equal(store.readOnly, false);
  assert.deepEqual(store.records, original);
  assert.deepEqual(store.preferences, { density: "compact" });
  assert.equal(store.canUndo, false);
  assert.equal(storage.writes.length, 0);
  store.saveRecords(
    [{ ...original[0], owner: "Deniz" }],
    "Sorumlu değişikliği",
  );
  assert.equal(store.undo(), "Sorumlu değişikliği");
  assert.deepEqual(store.records, original);
});

test("corrupt or unavailable primary storage falls back read-only and never destroys the original value", () => {
  const fallback = [record()];
  const storage = new MemoryStorage({ [KEY]: "{bozuk" });
  const store = createWorkspaceStore({
    storage,
    key: KEY,
    initialRecords: fallback,
    initialPreferences: { density: "compact" },
  });
  assert.deepEqual(store.records, fallback);
  assert.equal(store.readOnly, true);
  assert.throws(() => store.saveRecords([]), /okunamadığı/);
  assert.equal(storage.getItem(KEY), "{bozuk");
  assert.equal(storage.writes.length, 0);
  storage.setItem(KEY, JSON.stringify({ version: 1, records: fallback }));
  store.synchronize(storage.getItem(KEY));
  assert.equal(store.readOnly, false);
  assert.equal(store.saveRecords([], "Temizleme"), true);
  const unreadable = new MemoryStorage();
  unreadable.beforeGet = () => {
    throw new Error("Denied");
  };
  const unavailable = createWorkspaceStore({
    storage: unreadable,
    key: KEY,
    initialRecords: fallback,
  });
  assert.deepEqual(unavailable.records, fallback);
  assert.equal(unavailable.readOnly, true);
  assert.throws(() => unavailable.undo(), /okunamadığı/);
  assert.equal(unreadable.writes.length, 0);
});

test("absence does not seed fallback records, explicitly read-only stores never write, and no-ops make no history", () => {
  const fallback = [record()];
  const emptyStorage = new MemoryStorage();
  const empty = createWorkspaceStore({
    storage: emptyStorage,
    key: KEY,
    initialRecords: fallback,
  });
  assert.deepEqual(empty.records, []);
  assert.equal(emptyStorage.writes.length, 0);
  const locked = createWorkspaceStore({
    storage: emptyStorage,
    key: KEY,
    initialRecords: fallback,
    readOnly: true,
  });
  assert.deepEqual(locked.records, fallback);
  assert.throws(
    () => locked.savePreferences({ density: "compact" }),
    /okunamadığı/,
  );
  locked.synchronize(JSON.stringify({ version: 1, records: [] }));
  assert.equal(locked.canUndo, false);
  assert.throws(() => locked.saveRecords(fallback), /okunamadığı/);
  assert.equal(emptyStorage.writes.length, 0);
  const { storage, store } = setup();
  assert.equal(store.saveRecords(store.records), true);
  assert.equal(store.savePreferences(store.preferences), true);
  assert.equal(store.undo(), null);
  assert.equal(storage.writes.length, 0);
  assert.equal(store.canUndo, false);
});

test("primary session adapter reads legacy context without migration and live drafts preserve domain data, unknown metadata and Undo", () => {
  const original = record({
    workLog: [
      {
        id: "old-log",
        date: "2026-11-01",
        endedAt: timestamp,
        durationMs: 12345,
        note: "Eski sonuç",
      },
    ],
  });
  const legacy = {
    version: 1,
    currentId: original.id,
    entries: [
      {
        recordId: original.id,
        sessionId: "legacy-note",
        status: "paused",
        elapsedMs: 98765,
        startedAt: null,
        ownerId: null,
        updatedAt: 400,
        draftNote: "  Eski taslak\n",
        trackTime: false,
      },
    ],
  };
  const legacyRaw = JSON.stringify(legacy);
  const storage = new MemoryStorage({
    [KEY]: JSON.stringify({
      version: 1,
      records: [original],
      extra: { preserved: true },
      odak: {
        version: 1,
        preferences: { density: "compact" },
        history: [],
        future: { literal: "özel" },
      },
    }),
    [`${KEY}-work-session`]: legacyRaw,
  });
  const store = createWorkspaceStore({ storage, key: KEY });
  const session = sessions(store);
  assert.equal(storage.writes.length, 0);
  assert.equal(store.readWorkSessionRaw(), legacyRaw);
  assert.equal(session.current.draftNote, "  Eski taslak\n");
  assert.equal(
    session.saveDraft(
      original.id,
      "legacy-note",
      "Yeni not",
      "  Eski taslak\n",
    ),
    true,
  );
  const envelope = stored(storage);
  assert.deepEqual(envelope.records, [original]);
  assert.deepEqual(envelope.odak.preferences, { density: "compact" });
  assert.deepEqual(envelope.odak.history, []);
  assert.deepEqual(envelope.odak.future, { literal: "özel" });
  assert.deepEqual(envelope.extra, { preserved: true });
  assert.equal(envelope.odak.workSessions.entries[0].elapsedMs, 98765);
  assert.equal(envelope.odak.workSessions.entries[0].draftNote, "Yeni not");
  assert.equal(storage.getItem(`${KEY}-work-session`), legacyRaw);
  assert.equal(store.canUndo, false);
  assert.deepEqual(
    storage.writes.map((write) => write.key),
    [KEY],
  );
});

test("primary session input retains record Undo and primary authority ignores a malformed legacy key", () => {
  const { storage, store } = setup();
  const original = store.records;
  store.saveRecords(
    [{ ...original[0], description: "Düzenlenen açıklama" }],
    "Düzenleme",
  );
  const beforeHistory = store.history;
  const session = sessions(store);
  session.start(original[0].id, { trackTime: false });
  const id = session.current.sessionId;
  session.saveDraft(original[0].id, id, "Çalışırken yazılan not", "");
  storage.values.set(`${KEY}-work-session`, "broken legacy context");
  assert.equal(
    JSON.parse(store.readWorkSessionRaw()).entries[0].draftNote,
    "Çalışırken yazılan not",
  );
  assert.deepEqual(store.history, beforeHistory);
  assert.equal(store.undo(), "Düzenleme");
  assert.deepEqual(store.records, original);
  assert.equal(
    readWorkSessionSnapshot(store.readWorkSessionRaw()).entries[0].draftNote,
    "Çalışırken yazılan not",
  );
});

test("session writes cannot overwrite a record edit that arrives between reading and writing the shared primary key", () => {
  const { storage, store } = setup();
  const session = sessions(store);
  session.start("daily-one", { trackTime: false });
  const previous = store.sessionStorage.getItem(`${KEY}-work-session`);
  const next = JSON.parse(previous);
  next.entries[0].draftNote = "Kaydedilmek istenen taslak";
  let reads = 0;
  let peerRaw;
  storage.beforeGet = (key) => {
    if (key !== KEY || ++reads !== 2) return;
    const peer = JSON.parse(storage.values.get(KEY));
    peer.records[0].description = "Tam arada gelen gerçek kayıt değişikliği";
    peerRaw = JSON.stringify(peer);
    storage.values.set(KEY, peerRaw);
  };
  assert.throws(
    () =>
      store.sessionStorage.setItem(`${KEY}-work-session`, JSON.stringify(next)),
    { name: "WorkDraftConflictError" },
  );
  storage.beforeGet = null;
  assert.equal(storage.getItem(KEY), peerRaw);
  assert.equal(
    readWorkSessionSnapshot(store.readWorkSessionRaw()).entries[0].draftNote,
    undefined,
  );
  assert.equal(
    stored(storage).records[0].description,
    "Tam arada gelen gerçek kayıt değişikliği",
  );
});

test("session adapter CAS refuses stale writes and an absent primary uses the current seeded workspace instead of empty records", () => {
  const { storage, store } = setup([record(), record({ id: "second" })], {
    density: "compact",
  });
  store.saveNotes([
    {
      id: "note",
      text: "Bağımsız not",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  const expectedRecords = store.records;
  const expectedNotes = store.notes;
  const expectedHistory = store.history;
  storage.removeItem(KEY);
  const session = sessions(store);
  assert.equal(session.start("daily-one", { trackTime: false }), true);
  assert.deepEqual(stored(storage).records, expectedRecords);
  assert.deepEqual(stored(storage).odak.notes, expectedNotes);
  assert.deepEqual(stored(storage).odak.history, expectedHistory);
  assert.deepEqual(stored(storage).odak.preferences, { density: "compact" });
  const stale = store.sessionStorage.getItem(`${KEY}-work-session`);
  const other = createWorkspaceStore({ storage, key: KEY });
  const peer = sessions(other, "peer");
  peer.saveDraft(
    "daily-one",
    peer.current.sessionId,
    "Diğer pencerenin notu",
    "",
  );
  const peerRaw = storage.getItem(KEY);
  assert.throws(
    () => store.sessionStorage.setItem(`${KEY}-work-session`, stale),
    { name: "WorkDraftConflictError" },
  );
  assert.equal(storage.getItem(KEY), peerRaw);
  assert.equal(storage.getItem(`${KEY}-work-session`), null);
});

test("records, independent notes, preferences and imported paused drafts restore in one primary transaction and one reloadable Undo", () => {
  const beforeRecords = [record(), record({ id: "local" })];
  const { storage, store } = setup(beforeRecords);
  store.saveNotes([
    {
      id: "before-note",
      text: "Önceki bağımsız not",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  const session = sessions(store);
  session.start("local", { trackTime: false });
  session.saveDraft(
    "local",
    session.current.sessionId,
    "Yerel not korunacak",
    "",
  );
  const before = stored(storage);
  const beforeSessions = readWorkSessionSnapshot(store.readWorkSessionRaw());
  const expectedRaw = store.readWorkSessionRaw();
  const restoredRecords = [
    record({ title: "Yedekteki iş" }),
    record({ id: "incoming" }),
    beforeRecords[1],
  ];
  const count = storage.writes.filter((write) => write.key === KEY).length;
  assert.equal(
    store.saveWorkspace(
      {
        records: restoredRecords,
        preferences: { density: "compact" },
        notes: [
          {
            id: "after-note",
            text: "Yedekteki not",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        workDrafts: {
          version: 1,
          entries: [draft("incoming", "  Çok satırlı\nYeni taslak  ")],
        },
        expectedWorkSessionRaw: expectedRaw,
      },
      "Taslaklı yedek",
    ),
    true,
  );
  assert.equal(
    storage.writes.filter((write) => write.key === KEY).length,
    count + 1,
  );
  assert.equal(store.history.length, before.odak.history.length + 1);
  const after = readWorkSessionSnapshot(store.readWorkSessionRaw());
  const imported = after.entries.find((entry) => entry.recordId === "incoming");
  assert.equal(imported.status, "paused");
  assert.equal(imported.draftNote, "  Çok satırlı\nYeni taslak  ");
  assert.equal(imported.trackTime, false);
  assert.equal(imported.elapsedMs, 0);
  assert.equal(imported.ownerId, null);
  assert.equal(imported.startedAt, null);
  assert.deepEqual(
    after.entries.find((entry) => entry.recordId === "local"),
    beforeSessions.entries[0],
  );
  const reloaded = createWorkspaceStore({ storage, key: KEY });
  assert.equal(reloaded.undo(), "Taslaklı yedek");
  assert.deepEqual(stored(storage), before);
});

test("conflicting drafts, stale restore consent and quota failures preserve both storage keys and support an exact retry", () => {
  const { storage, store } = setup([record(), record({ id: "incoming" })]);
  const session = sessions(store);
  session.start("daily-one", { trackTime: false });
  const id = session.current.sessionId;
  session.saveDraft("daily-one", id, "Güncel yerel not", "");
  const before = storage.getItem(KEY);
  const backup = {
    records: store.records,
    workDrafts: {
      version: 1,
      entries: [draft("daily-one", "Farklı yedek notu")],
    },
  };
  assert.throws(() => store.saveWorkspace(backup), {
    name: "WorkDraftConflictError",
  });
  assert.equal(storage.getItem(KEY), before);
  const staleExpected = store.readWorkSessionRaw();
  const peer = sessions(createWorkspaceStore({ storage, key: KEY }), "peer");
  peer.saveDraft(
    "daily-one",
    id,
    "Onay sırasında değişen not",
    "Güncel yerel not",
  );
  const peerRaw = storage.getItem(KEY);
  const incoming = {
    records: store.records,
    workDrafts: { version: 1, entries: [draft("incoming")] },
    expectedWorkSessionRaw: staleExpected,
  };
  assert.throws(() => store.saveWorkspace(incoming), {
    name: "WorkDraftConflictError",
  });
  assert.equal(storage.getItem(KEY), peerRaw);
  incoming.expectedWorkSessionRaw = store.readWorkSessionRaw();
  storage.beforeSet = (key) => {
    if (key === KEY) throw quota();
  };
  assert.throws(() => store.saveWorkspace(incoming));
  assert.equal(storage.getItem(KEY), peerRaw);
  assert.equal(storage.getItem(`${KEY}-work-session`), null);
  assert.equal(store.history.length, 0);
  storage.beforeSet = null;
  assert.equal(store.saveWorkspace(incoming, "Yeniden denenen yedek"), true);
  assert.equal(store.history.length, 1);
});

test("post-restore draft edits block combined Undo without erasing text, while legacy record-only restores leave sessions unchanged", () => {
  const { storage, store } = setup();
  store.saveWorkspace(
    {
      records: store.records,
      workDrafts: { version: 1, entries: [draft("daily-one")] },
    },
    "Yalnız taslak",
  );
  assert.equal(store.history.length, 1);
  const session = sessions(store);
  session.saveDraft(
    "daily-one",
    "session-daily-one",
    "Yükleme sonrası değişiklik",
    "Taslak",
  );
  const reloaded = createWorkspaceStore({ storage, key: KEY });
  assert.equal(reloaded.canUndo, true);
  const before = storage.getItem(KEY);
  assert.throws(() => reloaded.undo(), { name: "WorkDraftConflictError" });
  assert.equal(storage.getItem(KEY), before);
  const contextRaw = reloaded.readWorkSessionRaw();
  reloaded.saveWorkspace(
    { records: [record({ title: "Eski yedekteki kayıt" })] },
    "Eski yedek",
  );
  assert.equal(reloaded.readWorkSessionRaw(), contextRaw);
  assert.equal(reloaded.undo(), "Eski yedek");
  assert.equal(reloaded.readWorkSessionRaw(), contextRaw);
  assert.equal(reloaded.history.length, 1);
});

test("present-draft restore normalizes a removed current job atomically so refresh is a no-op and one Undo restores its context", () => {
  const { storage, store } = setup([record(), record({ id: "remaining" })]);
  const session = sessions(store);
  session.start("daily-one", { trackTime: false });
  session.saveDraft(
    "daily-one",
    session.current.sessionId,
    "Kaldırılan işin notu korunur",
    "",
  );
  const before = stored(storage);
  const oldEntry = session.current;
  const expectedRaw = store.readWorkSessionRaw();
  store.saveWorkspace(
    {
      records: [record({ id: "remaining" })],
      workDrafts: { version: 1, entries: [] },
      expectedWorkSessionRaw: expectedRaw,
    },
    "Etkin işi kaldıran yedek",
  );
  const after = readWorkSessionSnapshot(store.readWorkSessionRaw());
  assert.equal(after.currentId, null);
  assert.equal(after.entries[0].status, "paused");
  assert.equal(after.entries[0].sessionId, oldEntry.sessionId);
  assert.equal(after.entries[0].elapsedMs, oldEntry.elapsedMs);
  assert.equal(after.entries[0].draftNote, oldEntry.draftNote);
  assert.equal(after.entries[0].ownerId, null);
  assert.equal(after.entries[0].startedAt, null);
  const committedRaw = storage.getItem(KEY);
  session.reconcile(["remaining"]);
  assert.equal(storage.getItem(KEY), committedRaw);
  assert.equal(
    createWorkspaceStore({ storage, key: KEY }).undo(),
    "Etkin işi kaldıran yedek",
  );
  assert.deepEqual(stored(storage), {
    ...before,
    odak: {
      ...before.odak,
      preferences: { density: "comfortable" },
      history: [],
    },
  });
});

test("present restore settles semantically saved local contexts in its single Undo transaction and preserves different recovery text", () => {
  const matching = record({
    id: "matching",
    workLog: [
      {
        id: "matching-session",
        date: "2026-11-01",
        endedAt: timestamp,
        durationMs: 12345,
        note: "Önceden kaydedilen sonuç",
      },
    ],
  });
  const recovery = record({
    id: "recovery",
    workLog: [
      {
        id: "recovery-session",
        date: "2026-11-01",
        endedAt: timestamp,
        durationMs: 76543,
        note: "Eski sonuç",
      },
    ],
  });
  const initial = {
    version: 1,
    currentId: "matching",
    entries: [
      {
        recordId: "matching",
        sessionId: "matching-session",
        status: "running",
        elapsedMs: 12345,
        startedAt: 500,
        ownerId: "legacy-owner",
        updatedAt: 500,
      },
      {
        recordId: "recovery",
        sessionId: "recovery-session",
        status: "paused",
        elapsedMs: 76543,
        startedAt: null,
        ownerId: null,
        updatedAt: 500,
        draftNote: "  Sonuçtan daha yeni\nTaslak  ",
        trackTime: false,
      },
    ],
  };
  const storage = new MemoryStorage({
    [KEY]: JSON.stringify({
      version: 1,
      records: [matching, recovery],
      odak: {
        version: 1,
        preferences: { density: "comfortable" },
        history: [],
        workSessions: initial,
      },
    }),
  });
  const store = createWorkspaceStore({ storage, key: KEY });
  const before = stored(storage);
  store.saveWorkspace(
    { records: store.records, workDrafts: { version: 1, entries: [] } },
    "Tamamlanmış bağlamı düzenleyen yedek",
  );
  const after = readWorkSessionSnapshot(store.readWorkSessionRaw());
  assert.equal(after.currentId, null);
  assert.equal(after.entries[0].status, "finished");
  assert.equal(after.entries[0].sessionId, "matching-session");
  assert.equal(after.entries[0].elapsedMs, 12345);
  assert.equal(Object.hasOwn(after.entries[0], "draftNote"), false);
  assert.equal(Object.hasOwn(after.entries[0], "trackTime"), false);
  assert.deepEqual(after.entries[1], initial.entries[1]);
  const raw = storage.getItem(KEY);
  sessions(store).reconcile(["matching", "recovery"]);
  assert.equal(storage.getItem(KEY), raw);
  assert.equal(
    createWorkspaceStore({ storage, key: KEY }).undo(),
    "Tamamlanmış bağlamı düzenleyen yedek",
  );
  assert.deepEqual(stored(storage), before);
});

test("controller getters cannot mutate its live records, preferences, or persisted undo patches", () => {
  const { storage, store } = setup();
  const original = store.records;
  const escaped = store.records;
  escaped[0].title = "Dışarıdan değişti";
  escaped[0].sourceFields.nested.values.push("yanlış");
  const appearance = store.preferences;
  appearance.density = "compact";
  assert.deepEqual(store.records, original);
  assert.deepEqual(store.preferences, { density: "comfortable" });
  store.saveRecords(
    [{ ...original[0], title: "Gerçek düzenleme" }],
    "Düzenleme",
  );
  const history = store.history;
  history[0].changes[0].before.title = "Geçmiş bozuldu";
  assert.equal(store.undo(), "Düzenleme");
  assert.deepEqual(store.records, original);
  assert.deepEqual(stored(storage).records, original);
  assert.throws(
    () => store.savePreferences({ density: "unknown" }),
    /geçersiz/,
  );
});

test("failed undo persistence keeps the current records and usable history until a later successful retry", () => {
  const { storage, store } = setup();
  const initial = store.records;
  store.saveRecords([{ ...initial[0], status: "completed" }], "Tamamlama");
  const current = store.records;
  const primary = storage.getItem(KEY);
  storage.beforeSet = (key) => {
    if (key === KEY) throw quota();
  };
  assert.throws(() => store.undo(), /full/);
  assert.deepEqual(store.records, current);
  assert.equal(store.undoLabel, "Tamamlama");
  assert.equal(store.canUndo, true);
  assert.equal(storage.getItem(KEY), primary);
  storage.beforeSet = null;
  assert.equal(store.undo(), "Tamamlama");
  assert.deepEqual(store.records, initial);
});

test("records and choice catalogs restore in one primary write and one reloadable Undo transaction", () => {
  const original = linkedRecords();
  const { storage, store } = setup(original);
  const choiceLists = removeChoice(
    "workType",
    "Test",
    original,
    addChoice("projectCode", "PRJ-42", original),
  );
  const restored = [record({ id: "restored-one", projectCode: "PRJ-42" })];
  store.saveWorkspace(
    { records: restored, preferences: { ...store.preferences, choiceLists } },
    "Yedeği geri yükleme",
  );
  assert.equal(storage.writes.filter((write) => write.key === KEY).length, 1);
  assert.deepEqual(store.records, restored);
  assert.deepEqual(store.preferences.choiceLists, choiceLists);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].beforePreferences.choiceLists, undefined);
  assert.deepEqual(store.history[0].afterPreferences.choiceLists, choiceLists);
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.equal(reopened.undo(), "Yedeği geri yükleme");
  assert.deepEqual(reopened.records, original);
  assert.deepEqual(reopened.preferences, { density: "comfortable" });
  assert.equal(
    Object.hasOwn(stored(storage).odak.preferences, "choiceLists"),
    false,
  );
});

test("record-only restores and record edits retain catalog overrides while every nested getter stays detached", () => {
  const { storage, store } = setup();
  const choiceLists = addChoice("projectCode", "PRJ-42", store.records);
  store.savePreferences({ ...store.preferences, choiceLists }, "Proje listesi");
  const preferences = store.preferences;
  preferences.choiceLists.projectCode.added.push("Dışarıdan değişiklik");
  preferences.choiceLists.workType.hidden.push("Test");
  assert.deepEqual(store.preferences.choiceLists, choiceLists);
  const restored = [record({ id: "old-backup-record" })];
  store.saveWorkspace({ records: restored }, "Eski kayıt yedeği");
  assert.deepEqual(store.preferences.choiceLists, choiceLists);
  store.saveRecords([{ ...restored[0], title: "Düzenlenen başlık" }]);
  assert.deepEqual(store.preferences.choiceLists, choiceLists);
  const history = store.history;
  history
    .at(-1)
    .beforePreferences.choiceLists.projectCode.added.push("Geçmiş sızıntısı");
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.equal(reopened.undo(), "Kayıt değişikliği");
  assert.equal(reopened.undo(), "Eski kayıt yedeği");
  assert.deepEqual(reopened.preferences.choiceLists, choiceLists);
  assert.equal(reopened.undo(), "Proje listesi");
  assert.deepEqual(reopened.preferences, { density: "comfortable" });
});

test("failed combined restores and invalid catalog preferences leave records, catalogs and Undo untouched", () => {
  const { storage, store } = setup();
  const choiceLists = addChoice("projectCode", "PRJ-42", store.records);
  const before = storage.getItem(KEY);
  storage.beforeSet = (key) => {
    if (key === KEY) throw quota();
  };
  assert.throws(
    () =>
      store.saveWorkspace({
        records: [],
        preferences: { density: "compact", choiceLists },
      }),
    /full/,
  );
  assert.equal(storage.getItem(KEY), before);
  assert.deepEqual(store.preferences, { density: "comfortable" });
  assert.equal(store.history.length, 0);
  storage.beforeSet = null;
  const bad = {
    density: "comfortable",
    choiceLists: {
      ...choiceLists,
      projectCode: { added: ["A", "a"], hidden: [] },
    },
  };
  assert.throws(
    () => store.saveWorkspace({ records: [], preferences: bad }),
    /geçersiz/,
  );
  assert.throws(() => store.savePreferences(bad), /geçersiz/);
  assert.equal(storage.getItem(KEY), before);
  assert.equal(storage.writes.length, 0);
});

test("catalog changes synchronize with Undo and stale combined restores cannot overwrite another window's lists", () => {
  const { storage, store } = setup();
  const other = createWorkspaceStore({ storage, key: KEY });
  const choiceLists = addChoice("projectCode", "PRJ-42", store.records);
  store.savePreferences(
    { ...store.preferences, choiceLists },
    "Seçenek ekleme",
  );
  const before = storage.getItem(KEY);
  assert.throws(
    () =>
      other.saveWorkspace({ records: [], preferences: { density: "compact" } }),
    /başka bir pencerede/,
  );
  assert.equal(storage.getItem(KEY), before);
  assert.deepEqual(other.preferences.choiceLists, choiceLists);
  assert.equal(other.records.length, 1);
  assert.equal(other.undo(), "Seçenek ekleme");
  store.synchronize(storage.getItem(KEY));
  assert.deepEqual(store.preferences, { density: "comfortable" });
  assert.equal(store.canUndo, false);
});
