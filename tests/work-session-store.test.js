import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkSessionStore,
  WORK_SESSION_KEY,
  readWorkSessionSnapshot,
  readPrimaryWorkSessionRaw,
} from "../src/work-session-store.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = [];
    this.failRead = false;
    this.failWrite = false;
  }
  getItem(key) {
    if (this.failRead) throw new Error("Unavailable storage");
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.failWrite) throw new Error("Storage quota exceeded");
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value) });
  }
}
function setup(options = {}) {
  const storage =
    options.storage ||
    new MemoryStorage({
      "is-takip-v1":
        '{"version":1,"records":[{"id":"preserved-task"}],"odak":{"history":["preserved"]}}',
      "is-takip-v1-preferences": '{"density":"compact"}',
    });
  const time = options.time || { value: 1000 };
  const changes = [];
  const errors = [];
  const store = createWorkSessionStore({
    storage,
    now: () => time.value,
    ownerId: options.ownerId || "owner-a",
    onChange: (value) => changes.push(value),
    onError: (error) => errors.push(error),
  });
  return { store, storage, time, changes, errors };
}

test("primary session reader validates authority, ignores obsolete fallback and never migrates while reading", () => {
  const legacy = JSON.stringify({ version: 1, currentId: null, entries: [] });
  const primarySession = {
    version: 1,
    currentId: "daily",
    entries: [
      {
        recordId: "daily",
        sessionId: "session",
        status: "paused",
        elapsedMs: 12345,
        startedAt: null,
        ownerId: null,
        updatedAt: 1000,
        draftNote: "  Satır\nİkinci  ",
        trackTime: false,
      },
    ],
  };
  const primary = JSON.stringify({
    version: 1,
    records: [],
    odak: { version: 1, workSessions: primarySession },
  });
  assert.equal(readPrimaryWorkSessionRaw(null, legacy), legacy);
  assert.equal(
    readPrimaryWorkSessionRaw(
      JSON.stringify({ version: 1, records: [] }),
      legacy,
    ),
    legacy,
  );
  assert.deepEqual(
    JSON.parse(readPrimaryWorkSessionRaw(primary, "malformed legacy")),
    primarySession,
  );
  assert.equal(readPrimaryWorkSessionRaw(null, null), null);
  for (const invalid of [
    "broken",
    JSON.stringify({ version: 2, records: [] }),
    JSON.stringify({
      version: 1,
      records: [],
      odak: {
        version: 1,
        workSessions: { version: 1, currentId: "missing", entries: [] },
      },
    }),
    JSON.stringify({
      version: 1,
      records: [],
      odak: { version: 2, workSessions: primarySession },
    }),
  ])
    assert.throws(() => readPrimaryWorkSessionRaw(invalid, legacy));
  assert.throws(() =>
    readPrimaryWorkSessionRaw(
      JSON.stringify({ version: 1, records: [] }),
      "broken legacy",
    ),
  );
});

test("session initialization and elapsed ticking do not write task data, preferences, history or session storage", () => {
  const { store, storage, time, changes } = setup();
  const taskData = storage.getItem("is-takip-v1");
  const preferences = storage.getItem("is-takip-v1-preferences");
  assert.deepEqual(store.snapshot, {
    version: 1,
    currentId: null,
    entries: [],
  });
  assert.equal(store.current, null);
  assert.equal(store.get("missing"), null);
  assert.equal(store.elapsed(), 0);
  assert.equal(storage.writes.length, 0);
  assert.equal(changes.length, 0);
  assert.equal(store.start("record-1"), true);
  const raw = storage.getItem(WORK_SESSION_KEY);
  time.value += 75000;
  assert.equal(store.elapsed(), 75000);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.getItem("is-takip-v1"), taskData);
  assert.equal(storage.getItem("is-takip-v1-preferences"), preferences);
  assert.ok(storage.writes.every((write) => write.key === WORK_SESSION_KEY));
});

test("pause, resume, finish and a fresh session calculate actual elapsed time without timer drift", () => {
  const { store, storage, time } = setup();
  store.start("task");
  time.value += 60550;
  store.pause();
  assert.equal(store.current.status, "paused");
  assert.equal(store.current.startedAt, null);
  assert.equal(store.elapsed(), 60550);
  time.value += 180000;
  assert.equal(store.elapsed(), 60550);
  const pausedWrites = storage.writes.length;
  store.pause();
  assert.equal(storage.writes.length, pausedWrites);
  store.start("task");
  time.value += 20900;
  assert.equal(store.elapsed(), 81450);
  store.finish();
  assert.equal(store.current, null);
  assert.equal(store.get("task").status, "finished");
  assert.equal(store.elapsed("task"), 81450);
  store.start("task");
  assert.equal(store.elapsed(), 0);
  assert.equal(store.current.status, "running");
});

test("a session ID survives switching, pausing and reloading, and changes only for a new finished session", () => {
  const { store, storage, time } = setup();
  store.start("task");
  const firstId = store.current.sessionId;
  assert.ok(typeof firstId === "string" && firstId.length > 0);
  time.value += 1000;
  store.start("other");
  assert.equal(store.get("task").sessionId, firstId);
  assert.notEqual(store.current.sessionId, firstId);
  store.start("task");
  store.pause();
  const { store: reloaded } = setup({ storage, time, ownerId: "reloaded" });
  assert.equal(reloaded.current.sessionId, firstId);
  reloaded.start("task");
  assert.equal(reloaded.current.sessionId, firstId);
  reloaded.finish("task", firstId);
  reloaded.start("task");
  assert.notEqual(reloaded.current.sessionId, firstId);
  const restartedId = reloaded.current.sessionId;
  store.finish("task", firstId);
  store.pause("task", firstId);
  assert.equal(store.current.status, "running");
  assert.equal(store.current.sessionId, restartedId);
});

test("legacy v1 sessions receive the same stable ID in all windows without an initial write", () => {
  const raw = JSON.stringify({
    version: 1,
    currentId: "legacy",
    entries: [
      {
        recordId: "legacy",
        status: "running",
        elapsedMs: 3000,
        startedAt: 1000,
        ownerId: "old-owner",
        updatedAt: 1000,
      },
    ],
  });
  const storage = new MemoryStorage({ [WORK_SESSION_KEY]: raw });
  const time = { value: 5000 };
  const { store: first } = setup({ storage, time });
  const { store: second } = setup({ storage, time, ownerId: "owner-b" });
  const id = first.current.sessionId;
  assert.match(id, /^legacy-/);
  assert.equal(second.current.sessionId, id);
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  first.pause("legacy", id);
  second.synchronize();
  assert.equal(second.current.sessionId, id);
  assert.equal(second.elapsed(), 7000);
  assert.equal(
    JSON.parse(storage.getItem(WORK_SESSION_KEY)).entries[0].sessionId,
    id,
  );
});

test("finishing a journaled session can settle its paused context without stopping another task", () => {
  const { store: first, storage, time } = setup();
  first.start("journaled");
  const id = first.current.sessionId;
  time.value += 4000;
  first.pause("journaled", id);
  const { store: second } = setup({ storage, time, ownerId: "other-window" });
  second.start("other");
  assert.equal(first.finish("journaled", id), true);
  assert.equal(first.get("journaled").status, "finished");
  assert.equal(first.elapsed("journaled"), 4000);
  assert.equal(first.current.recordId, "other");
  assert.equal(first.current.status, "running");
});

test("switching tasks pauses the old task, keeps its elapsed time and permits only one running task", () => {
  const { store, storage, time } = setup();
  store.start("first");
  time.value += 12000;
  store.start("second");
  assert.equal(store.get("first").status, "paused");
  assert.equal(store.elapsed("first"), 12000);
  time.value += 4000;
  assert.equal(store.elapsed("second"), 4000);
  store.start("first");
  assert.equal(store.elapsed("second"), 4000);
  time.value += 3000;
  assert.equal(store.elapsed("first"), 15000);
  assert.equal(
    store.snapshot.entries.filter((entry) => entry.status === "running").length,
    1,
  );
  const count = storage.writes.length;
  store.start("first");
  assert.equal(storage.writes.length, count, "repeated start is a no-op");
});

test("the owning window pauses on pagehide, reload stays paused and stale owners cannot pause a new owner", () => {
  const { store: first, storage, time } = setup();
  first.start("task");
  time.value += 5000;
  first.stopOwner();
  assert.equal(first.current.status, "paused");
  const writes = storage.writes.length;
  const { store: reloaded } = setup({ storage, time, ownerId: "owner-new" });
  assert.equal(storage.writes.length, writes);
  time.value += 50000;
  assert.equal(reloaded.elapsed(), 5000);
  reloaded.start("task");
  time.value += 2000;
  first.stopOwner();
  assert.equal(first.current.status, "running");
  assert.equal(first.current.ownerId, "owner-new");
  assert.equal(first.elapsed(), 7000);
  reloaded.stopOwner();
  assert.equal(reloaded.current.status, "paused");
  assert.equal(reloaded.elapsed(), 7000);
});

test("actions adopt the latest shared state and expected record guards protect a newly selected task", () => {
  const { store: first, storage, time } = setup();
  const { store: second, changes } = setup({
    storage,
    time,
    ownerId: "owner-b",
  });
  first.start("first");
  time.value += 2000;
  second.start("second");
  assert.equal(second.elapsed("first"), 2000);
  first.pause("first");
  first.finish("first");
  assert.equal(first.current.recordId, "second");
  assert.equal(first.current.status, "running");
  time.value += 3000;
  second.pause("second");
  first.synchronize();
  assert.equal(first.elapsed(), 3000);
  assert.equal(first.current.status, "paused");
  const notifications = changes.length;
  assert.equal(second.synchronize(), false);
  assert.equal(changes.length, notifications);
  storage.values.delete(WORK_SESSION_KEY);
  assert.equal(first.synchronize(), true);
  assert.equal(first.current, null);
});

test("failed writes preserve the last committed session and an existing running timer", () => {
  const { store, storage, time, errors } = setup();
  store.start("first");
  const before = store.snapshot;
  const saved = storage.getItem(WORK_SESSION_KEY);
  time.value += 10000;
  storage.failWrite = true;
  assert.equal(store.start("second"), false);
  assert.deepEqual(store.snapshot, before);
  assert.equal(storage.getItem(WORK_SESSION_KEY), saved);
  assert.equal(store.elapsed(), 10000);
  assert.equal(store.readOnly, true);
  assert.equal(errors.length, 1);
  storage.failWrite = false;
  assert.equal(store.pause(), true);
  assert.equal(store.current.status, "paused");
  assert.equal(store.elapsed(), 10000);
  assert.equal(store.readOnly, false);
});

test("malformed or inaccessible saved state is preserved, reports once during polling, and can recover", () => {
  const storage = new MemoryStorage({ [WORK_SESSION_KEY]: "broken-json" });
  const { store, errors } = setup({ storage });
  assert.equal(store.readOnly, true);
  assert.equal(errors.length, 1);
  store.synchronize();
  store.synchronize();
  assert.equal(errors.length, 1);
  assert.equal(store.start("task"), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), "broken-json");
  assert.equal(storage.writes.length, 0);
  storage.values.delete(WORK_SESSION_KEY);
  store.synchronize();
  assert.equal(store.readOnly, false);
  assert.equal(store.start("task"), true);
  storage.failRead = true;
  const current = store.snapshot;
  assert.equal(store.pause(), false);
  assert.deepEqual(store.snapshot, current);
  storage.failRead = false;
  assert.equal(store.synchronize(), false);
  assert.equal(store.readOnly, false);
});

test("invalid session invariants never overwrite stored data", () => {
  const { store } = setup();
  store.start("task");
  const valid = store.snapshot;
  const invalid = [
    { ...valid, version: 2 },
    { ...valid, currentId: null },
    { ...valid, currentId: "missing" },
    { ...valid, entries: [...valid.entries, { ...valid.entries[0] }] },
    { ...valid, entries: [{ ...valid.entries[0], elapsedMs: -1 }] },
    { ...valid, entries: [{ ...valid.entries[0], elapsedMs: Infinity }] },
    { ...valid, entries: [{ ...valid.entries[0], startedAt: null }] },
    { ...valid, entries: [{ ...valid.entries[0], ownerId: null }] },
    { ...valid, entries: [{ ...valid.entries[0], sessionId: "" }] },
    { ...valid, entries: [{ ...valid.entries[0], sessionId: null }] },
    { ...valid, entries: [{ ...valid.entries[0], status: "finished" }] },
  ];
  for (const value of invalid) {
    const raw = JSON.stringify(value);
    const storage = new MemoryStorage({ [WORK_SESSION_KEY]: raw });
    const broken = setup({ storage }).store;
    assert.equal(broken.readOnly, true);
    assert.equal(broken.start("replacement"), false);
    assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
    assert.equal(storage.writes.length, 0);
  }
});

test("reconciliation stops missing or closed records without deleting paused context, and clock reversal stays nonnegative", () => {
  const { store, time } = setup();
  store.start("task");
  time.value += 3000;
  store.reconcile(["task"]);
  assert.equal(store.current.status, "running");
  store.reconcile(new Set(["other"]));
  assert.equal(store.current, null);
  assert.equal(store.get("task").status, "paused");
  assert.equal(store.elapsed("task"), 3000);
  store.start("task");
  time.value -= 1000;
  assert.equal(store.elapsed(), 3000);
  assert.equal(store.pause(), true);
  assert.equal(store.current.status, "paused");
  assert.equal(store.elapsed(), 3000);
});

test("session getters and callbacks are detached and retained context is bounded", () => {
  const { store, time, changes } = setup();
  store.start("first");
  const snapshot = store.snapshot;
  snapshot.entries[0].elapsedMs = 900000;
  snapshot.currentId = "tampered";
  const selected = store.current;
  selected.recordId = "changed";
  const retrieved = store.get("first");
  retrieved.status = "finished";
  changes[0].entries[0].startedAt = 0;
  assert.equal(store.current.recordId, "first");
  assert.equal(store.elapsed(), 0);
  for (let index = 0; index < 60; index++) {
    time.value += 1000;
    store.start(`task-${index}`);
  }
  assert.equal(store.snapshot.entries.length, 50);
  assert.equal(store.current.recordId, "task-59");
  assert.equal(
    store.snapshot.entries.filter((entry) => entry.status === "running").length,
    1,
  );
});

test("discard removes only the exact paused current session and leaves records, history and other session contexts intact", () => {
  const { store, storage, time } = setup();
  const primary = storage.getItem("is-takip-v1");
  const preferences = storage.getItem("is-takip-v1-preferences");
  store.start("other-paused");
  time.value += 2_789;
  store.pause();
  const other = store.current;
  store.start("saved-context");
  time.value += 4_321;
  store.finish();
  const finished = store.get("saved-context");
  store.start("discarded");
  time.value += 35_789;
  store.pause();
  const pending = store.current;
  assert.equal(store.discard("discarded", pending.sessionId, pending), true);
  assert.equal(store.current, null);
  assert.equal(store.get("discarded"), null);
  assert.deepEqual(store.snapshot.entries, [other, finished]);
  assert.equal(storage.getItem("is-takip-v1"), primary);
  assert.equal(storage.getItem("is-takip-v1-preferences"), preferences);
  assert.ok(storage.writes.every((write) => write.key === WORK_SESSION_KEY));
  const reloaded = setup({ storage, time }).store;
  assert.equal(reloaded.current, null);
  assert.equal(reloaded.get("discarded"), null);
  reloaded.start("discarded");
  assert.equal(reloaded.elapsed(), 0);
  assert.notEqual(reloaded.current.sessionId, pending.sessionId);
});

test("discard rejects running, changed, switched and newly restarted sessions without deleting the latest context", () => {
  const { store, storage, time } = setup();
  store.start("task");
  const running = store.current;
  const runningRaw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.discard("task", running.sessionId, running), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), runningRaw);
  time.value += 3_000;
  store.pause();
  const pending = store.current;
  const peer = setup({ storage, time, ownerId: "peer" }).store;
  peer.start("task");
  time.value += 1_000;
  peer.pause();
  let raw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.discard("task", pending.sessionId, pending), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  const changed = peer.current;
  peer.start("other");
  raw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.discard("task", changed.sessionId, changed), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(store.current.recordId, "other");
  peer.start("task");
  peer.finish();
  peer.start("task");
  peer.pause();
  assert.notEqual(peer.current.sessionId, pending.sessionId);
  raw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.discard("task", pending.sessionId, pending), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.deepEqual(store.current, peer.current);
});

test("failed discard preserves the paused session and supports an exact retry", () => {
  const { store, storage, time, errors } = setup();
  store.start("task");
  time.value += 10_567;
  store.pause();
  const pending = store.current;
  const raw = storage.getItem(WORK_SESSION_KEY);
  storage.failWrite = true;
  assert.equal(store.discard("task", pending.sessionId, pending), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.deepEqual(store.current, pending);
  assert.equal(errors.length, 1);
  storage.failWrite = false;
  assert.equal(store.discard("task", pending.sessionId, pending), true);
  assert.equal(store.current, null);
  assert.equal(store.get("task"), null);
  const discardedRaw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.discard("task", pending.sessionId, pending), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), discardedRaw);
});

test("note-only sessions persist literal drafts without touching records, preferences or Undo and unchanged text is a no-op", () => {
  const { store, storage, time } = setup();
  const records = storage.getItem("is-takip-v1");
  const preferences = storage.getItem("is-takip-v1-preferences");
  assert.equal(store.start("note-task", { trackTime: false }), true);
  const initial = store.current;
  assert.equal(initial.status, "running");
  assert.equal(initial.trackTime, false);
  assert.equal(initial.elapsedMs, 0);
  assert.equal(initial.startedAt, time.value);
  assert.equal(initial.ownerId, "owner-a");
  assert.equal(Object.hasOwn(initial, "draftNote"), false);
  const blankRaw = storage.getItem(WORK_SESSION_KEY);
  const count = storage.writes.length;
  assert.equal(
    store.saveDraft(initial.recordId, initial.sessionId, "", ""),
    true,
  );
  assert.equal(storage.getItem(WORK_SESSION_KEY), blankRaw);
  assert.equal(storage.writes.length, count);
  time.value += 60000;
  const text = "  <script>özel & düz metin</script>\nİkinci satır.  ";
  assert.equal(
    store.saveDraft(initial.recordId, initial.sessionId, text, ""),
    true,
  );
  assert.equal(store.current.draftNote, text);
  assert.equal(store.current.ownerId, initial.ownerId);
  assert.equal(store.elapsed(), 0);
  const typedRaw = storage.getItem(WORK_SESSION_KEY);
  const typedCount = storage.writes.length;
  time.value += 60000;
  assert.equal(
    store.saveDraft(initial.recordId, initial.sessionId, text, text),
    true,
  );
  assert.equal(storage.getItem(WORK_SESSION_KEY), typedRaw);
  assert.equal(storage.writes.length, typedCount);
  assert.equal(storage.getItem("is-takip-v1"), records);
  assert.equal(storage.getItem("is-takip-v1-preferences"), preferences);
  assert.ok(storage.writes.every((write) => write.key === WORK_SESSION_KEY));
  assert.equal(
    store.saveDraft(initial.recordId, initial.sessionId, "", text),
    true,
  );
  assert.equal(store.current.draftNote, "");
});

test("drafts survive pause, resume, task switching, pagehide, reconciliation and reload until their exact session is finished", () => {
  const { store, storage, time } = setup();
  store.start("first", { trackTime: false });
  const firstId = store.current.sessionId;
  store.saveDraft("first", firstId, "İlk işin taslağı", "");
  time.value += 50000;
  store.pause("first", firstId);
  assert.equal(store.current.draftNote, "İlk işin taslağı");
  assert.equal(store.current.elapsedMs, 0);
  assert.equal(store.current.startedAt, null);
  store.start("first");
  assert.equal(store.current.trackTime, false);
  assert.equal(store.current.sessionId, firstId);
  store.start("second", { trackTime: false });
  const secondId = store.current.sessionId;
  store.saveDraft("second", secondId, "İkinci işin taslağı", "");
  assert.equal(store.get("first").status, "paused");
  assert.equal(store.get("first").draftNote, "İlk işin taslağı");
  assert.equal(
    store.saveDraft(
      "first",
      firstId,
      "Duraklatılan iş güncellendi",
      "İlk işin taslağı",
    ),
    true,
  );
  assert.equal(store.current.recordId, "second");
  store.stopOwner();
  const raw = storage.getItem(WORK_SESSION_KEY);
  const writes = storage.writes.length;
  const { store: reloaded } = setup({ storage, time, ownerId: "reloaded" });
  assert.equal(storage.writes.length, writes);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(reloaded.current.status, "paused");
  assert.equal(reloaded.current.draftNote, "İkinci işin taslağı");
  reloaded.start("first", { trackTime: false });
  assert.equal(reloaded.current.draftNote, "Duraklatılan iş güncellendi");
  reloaded.reconcile([]);
  assert.equal(reloaded.current, null);
  assert.equal(reloaded.get("first").draftNote, "Duraklatılan iş güncellendi");
  assert.equal(reloaded.get("first").status, "paused");
  reloaded.start("second");
  reloaded.finish("first", firstId);
  assert.equal(Object.hasOwn(reloaded.get("first"), "draftNote"), false);
  assert.equal(reloaded.get("first").status, "finished");
  assert.equal(reloaded.current.sessionId, secondId);
  assert.equal(reloaded.current.draftNote, "İkinci işin taslağı");
});

test("opting out of timing freezes legacy milliseconds exactly while new sessions keep the default timed API compatible", () => {
  const { store, time } = setup();
  store.start("legacy");
  const id = store.current.sessionId;
  time.value += 35789;
  assert.equal(store.elapsed(), 35789);
  store.start("legacy", { trackTime: false });
  assert.equal(store.current.sessionId, id);
  assert.equal(store.current.elapsedMs, 35789);
  assert.equal(store.current.trackTime, false);
  time.value += 999999;
  assert.equal(store.elapsed(), 35789);
  store.pause();
  assert.equal(store.current.elapsedMs, 35789);
  store.start("legacy");
  time.value += 40000;
  assert.equal(store.elapsed(), 35789);
  store.saveDraft("legacy", id, "Ölçülen geçmiş süre korunur", "");
  store.finish("legacy", id);
  assert.equal(store.get("legacy").elapsedMs, 35789);
  assert.equal(Object.hasOwn(store.get("legacy"), "draftNote"), false);
  store.start("legacy", { trackTime: false });
  assert.notEqual(store.current.sessionId, id);
  assert.equal(store.elapsed(), 0);
  assert.equal(Object.hasOwn(store.current, "draftNote"), false);
  store.finish();
  store.start("legacy");
  assert.equal(Object.hasOwn(store.current, "trackTime"), false);
  time.value += 2500;
  assert.equal(store.elapsed(), 2500);
});

test("draft compare-and-set adopts a peer's saved text without overwriting it and an explicit fresh retry remains possible", () => {
  const first = setup();
  first.store.start("task", { trackTime: false });
  const id = first.store.current.sessionId;
  first.store.saveDraft("task", id, "İlk ortak taslak", "");
  const second = setup({
    storage: first.storage,
    time: first.time,
    ownerId: "peer",
  });
  first.time.value += 1000;
  first.store.saveDraft(
    "task",
    id,
    "İlk penceredeki yeni metin",
    "İlk ortak taslak",
  );
  const raw = first.storage.getItem(WORK_SESSION_KEY);
  const writes = first.storage.writes.length;
  assert.equal(
    second.store.saveDraft(
      "task",
      id,
      "Eski pencerenin metni",
      "İlk ortak taslak",
    ),
    false,
  );
  assert.equal(first.storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(first.storage.writes.length, writes);
  assert.equal(second.store.current.draftNote, "İlk penceredeki yeni metin");
  assert.equal(second.store.current.ownerId, "owner-a");
  assert.equal(second.store.readOnly, false);
  assert.match(second.errors.at(-1), /başka bir pencerede değişti/);
  assert.equal(
    second.store.saveDraft(
      "task",
      id,
      "Açıkça yeniden seçilen metin",
      "İlk penceredeki yeni metin",
    ),
    true,
  );
  first.store.synchronize();
  assert.equal(first.store.current.draftNote, "Açıkça yeniden seçilen metin");
});

test("draft writes reject stale identities, finished contexts, invalid text and options while leaving all saved bytes intact", () => {
  const { store, storage } = setup();
  store.start("task", { trackTime: false });
  const firstId = store.current.sessionId;
  const raw = storage.getItem(WORK_SESSION_KEY);
  const writes = storage.writes.length;
  for (const [recordId, sessionId, note, expected] of [
    ["missing", firstId, "Not", ""],
    ["task", "stale-session", "Not", ""],
    ["", firstId, "Not", ""],
    ["task", firstId, null, ""],
    ["task", firstId, "Not", undefined],
    ["task", firstId, "x".repeat(10001), ""],
  ])
    assert.equal(store.saveDraft(recordId, sessionId, note, expected), false);
  for (const options of [null, [], { trackTime: "false" }, { trackTime: 0 }])
    assert.equal(store.start("other", options), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(storage.writes.length, writes);
  store.finish("task", firstId);
  const finishedRaw = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.saveDraft("task", firstId, "Bitmiş işe yazma", ""), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), finishedRaw);
  store.start("task", { trackTime: false });
  const latest = storage.getItem(WORK_SESSION_KEY);
  assert.equal(store.saveDraft("task", firstId, "Eski oturum", ""), false);
  store.finish("task", firstId);
  assert.equal(storage.getItem(WORK_SESSION_KEY), latest);
});

test("quota failure preserves committed drafts and exact finish retries clear only the journaled session", () => {
  const { store, storage, time } = setup();
  store.start("first", { trackTime: false });
  const firstId = store.current.sessionId;
  store.saveDraft("first", firstId, "Kalıcı taslak", "");
  const raw = storage.getItem(WORK_SESSION_KEY);
  storage.failWrite = true;
  assert.equal(
    store.saveDraft("first", firstId, "Kaydedilemeyen metin", "Kalıcı taslak"),
    false,
  );
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(store.current.draftNote, "Kalıcı taslak");
  assert.equal(store.readOnly, true);
  storage.failWrite = false;
  assert.equal(
    store.saveDraft("first", firstId, "Yeniden denenen metin", "Kalıcı taslak"),
    true,
  );
  assert.equal(store.readOnly, false);
  time.value += 50000;
  store.pause();
  store.start("second", { trackTime: false });
  const secondId = store.current.sessionId;
  store.saveDraft("second", secondId, "Başka işin notu", "");
  const beforeFinish = storage.getItem(WORK_SESSION_KEY);
  storage.failWrite = true;
  assert.equal(store.finish("first", firstId), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), beforeFinish);
  assert.equal(store.get("first").draftNote, "Yeniden denenen metin");
  storage.failWrite = false;
  assert.equal(store.finish("first", firstId), true);
  assert.equal(Object.hasOwn(store.get("first"), "draftNote"), false);
  assert.equal(store.current.draftNote, "Başka işin notu");
  assert.equal(store.current.sessionId, secondId);
});

test("guarded finish refuses a peer draft written after the result save and retries without clearing another session", () => {
  const first = setup();
  const { store, storage, time } = first;
  store.start("journaled", { trackTime: false });
  const id = store.current.sessionId;
  const result = "  Kaydedilen sonuç\n";
  store.saveDraft("journaled", id, result, "");
  store.pause("journaled", id);
  const peer = setup({ storage, time, ownerId: "peer" }).store;
  peer.saveDraft("journaled", id, "Sonuçtan sonra yazılan yeni not", result);
  peer.start("other", { trackTime: false });
  const other = peer.current;
  const primary = storage.getItem("is-takip-v1");
  const raw = storage.getItem(WORK_SESSION_KEY);
  const writes = storage.writes.length;
  assert.equal(store.finish("journaled", id, { expectedDraft: result }), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(storage.writes.length, writes);
  assert.equal(
    store.get("journaled").draftNote,
    "Sonuçtan sonra yazılan yeni not",
  );
  assert.equal(store.readOnly, false);
  assert.match(first.errors.at(-1), /başka bir pencerede değişti/);
  assert.equal(
    store.finish("journaled", "stale-session", {
      expectedDraft: "Sonuçtan sonra yazılan yeni not",
    }),
    false,
  );
  assert.equal(store.finish("journaled", id, { expectedDraft: null }), false);
  storage.failWrite = true;
  assert.equal(
    store.finish("journaled", id, {
      expectedDraft: "Sonuçtan sonra yazılan yeni not",
    }),
    false,
  );
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  storage.failWrite = false;
  assert.equal(
    store.finish("journaled", id, {
      expectedDraft: "Sonuçtan sonra yazılan yeni not",
    }),
    true,
  );
  assert.equal(store.get("journaled").status, "finished");
  assert.equal(Object.hasOwn(store.get("journaled"), "draftNote"), false);
  assert.deepEqual(store.current, other);
  assert.equal(storage.getItem("is-takip-v1"), primary);
  assert.equal(store.finish("journaled", id, { expectedDraft: result }), false);
  assert.equal(store.finish("journaled", id), true);
});

test("draft recovery forks one exact unfinished note atomically and leaves old history and another running task intact", () => {
  const { store, storage, time } = setup();
  store.start("journaled");
  const oldId = store.current.sessionId;
  time.value += 12345;
  store.pause("journaled", oldId);
  const text = "  Daha yeni çalışma notu\nİkinci satır  ";
  store.saveDraft("journaled", oldId, text, "");
  store.start("other", { trackTime: false });
  const other = store.current;
  const oldLogBytes = JSON.stringify({
    version: 1,
    records: [
      {
        id: "journaled",
        workLog: [{ id: oldId, durationMs: 12345, note: "Önceki sonuç" }],
      },
    ],
  });
  storage.setItem("is-takip-v1", oldLogBytes);
  const raw = storage.getItem(WORK_SESSION_KEY);
  const writes = storage.writes.length;
  for (const [recordId, sessionId, expected] of [
    ["missing", oldId, text],
    ["journaled", "stale-session", text],
    ["journaled", oldId, "Önceki metin"],
    ["journaled", oldId, ""],
    ["journaled", oldId, null],
  ])
    assert.equal(store.forkDraft(recordId, sessionId, expected), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(storage.writes.length, writes);
  storage.failWrite = true;
  assert.equal(store.forkDraft("journaled", oldId, text), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(store.get("journaled").sessionId, oldId);
  storage.failWrite = false;
  time.value += 1;
  assert.equal(store.forkDraft("journaled", oldId, text), true);
  assert.equal(storage.writes.length, writes + 1);
  const forked = store.get("journaled");
  assert.notEqual(forked.sessionId, oldId);
  assert.deepEqual(forked, {
    recordId: "journaled",
    sessionId: forked.sessionId,
    status: "paused",
    elapsedMs: 0,
    startedAt: null,
    ownerId: null,
    updatedAt: time.value,
    draftNote: text,
    trackTime: false,
  });
  assert.deepEqual(store.current, other);
  assert.equal(storage.getItem("is-takip-v1"), oldLogBytes);
  assert.equal(store.forkDraft("journaled", oldId, text), false);
  store.finish("journaled", oldId);
  assert.deepEqual(store.get("journaled"), forked);
  const reloaded = setup({ storage, time }).store;
  assert.deepEqual(reloaded.get("journaled"), forked);
  assert.deepEqual(reloaded.current, other);
});

test("optional note fields validate strictly, legacy snapshots keep their old shape and all returned data remains detached", () => {
  const { store, storage, time, changes } = setup();
  store.start("legacy");
  const legacy = storage.getItem(WORK_SESSION_KEY);
  const legacyEntry = readWorkSessionSnapshot(legacy).entries[0];
  assert.equal(Object.hasOwn(legacyEntry, "draftNote"), false);
  assert.equal(Object.hasOwn(legacyEntry, "trackTime"), false);
  const valid = JSON.parse(legacy);
  for (const patch of [
    { draftNote: null },
    { draftNote: false },
    { draftNote: {} },
    { draftNote: "a".repeat(10001) },
    { trackTime: "false" },
    { trackTime: 0 },
    { trackTime: null },
  ]) {
    const raw = JSON.stringify({
      ...valid,
      entries: [{ ...valid.entries[0], ...patch }],
    });
    const brokenStorage = new MemoryStorage({ [WORK_SESSION_KEY]: raw });
    const broken = setup({ storage: brokenStorage }).store;
    assert.equal(broken.readOnly, true);
    assert.equal(broken.start("replacement", { trackTime: false }), false);
    assert.equal(brokenStorage.getItem(WORK_SESSION_KEY), raw);
    assert.equal(brokenStorage.writes.length, 0);
  }
  store.start("legacy", { trackTime: false });
  store.saveDraft("legacy", store.current.sessionId, "x".repeat(10000), "");
  const snapshot = store.snapshot;
  snapshot.entries[0].draftNote = "Tampered";
  snapshot.entries[0].trackTime = true;
  changes.at(-1).entries[0].draftNote = "Callback mutation";
  assert.equal(store.current.draftNote.length, 10000);
  assert.equal(store.current.trackTime, false);
  const raw = storage.getItem(WORK_SESSION_KEY);
  const before = storage.writes.length;
  const reloaded = setup({ storage, time }).store;
  assert.equal(reloaded.current.draftNote.length, 10000);
  assert.equal(storage.getItem(WORK_SESSION_KEY), raw);
  assert.equal(storage.writes.length, before);
});

test("capacity never prunes unfinished nonempty drafts and rejects a new session until a protected note is explicitly finished", () => {
  const { store, storage, time, errors } = setup();
  const sessions = new Map();
  for (let index = 0; index < 50; index++) {
    const id = `note-${index}`;
    assert.equal(store.start(id, { trackTime: false }), true);
    sessions.set(id, store.current.sessionId);
    assert.equal(
      store.saveDraft(id, store.current.sessionId, `Taslak ${index}`, ""),
      true,
    );
    time.value += 1000;
  }
  const before = storage.getItem(WORK_SESSION_KEY);
  const current = store.current;
  assert.equal(store.start("too-many", { trackTime: false }), false);
  assert.equal(storage.getItem(WORK_SESSION_KEY), before);
  assert.deepEqual(store.current, current);
  assert.equal(store.snapshot.entries.length, 50);
  assert.equal(store.readOnly, false);
  assert.match(errors.at(-1), /notları dolu/);
  assert.equal(store.finish("note-0", sessions.get("note-0")), true);
  assert.equal(store.start("new-note", { trackTime: false }), true);
  assert.equal(store.get("note-0"), null);
  for (let index = 1; index < 50; index++)
    assert.equal(store.get(`note-${index}`).draftNote, `Taslak ${index}`);
  assert.equal(store.current.recordId, "new-note");
});

test("blank context pruning preserves an old unfinished note and JSON size limits reject writes before a saved context becomes unreadable", () => {
  const { store, storage, time } = setup();
  store.start("old-note", { trackTime: false });
  store.saveDraft(
    "old-note",
    store.current.sessionId,
    "Eski ama kaydedilmemiş çalışma notu",
    "",
  );
  for (let index = 0; index < 60; index++) {
    time.value += 1000;
    assert.equal(store.start(`blank-${index}`, { trackTime: false }), true);
  }
  assert.equal(store.snapshot.entries.length, 50);
  assert.equal(
    store.get("old-note").draftNote,
    "Eski ama kaydedilmemiş çalışma notu",
  );
  assert.equal(store.get("blank-0"), null);
  const large = setup();
  let rejected = false;
  for (let index = 0; index < 10; index++) {
    const id = `large-${index}`;
    large.store.start(id, { trackTime: false });
    const before = large.storage.getItem(WORK_SESSION_KEY);
    const result = large.store.saveDraft(
      id,
      large.store.current.sessionId,
      "\u0000".repeat(10000),
      "",
    );
    if (!result) {
      rejected = true;
      assert.equal(large.storage.getItem(WORK_SESSION_KEY), before);
      assert.equal(Object.hasOwn(large.store.current, "draftNote"), false);
      assert.ok(before.length <= 500000);
      assert.doesNotThrow(() => readWorkSessionSnapshot(before));
      break;
    }
  }
  assert.equal(rejected, true);
  assert.equal(large.store.readOnly, false);
  assert.equal(
    storage.getItem("is-takip-v1-preferences"),
    '{"density":"compact"}',
  );
});
