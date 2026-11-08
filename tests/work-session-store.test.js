import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkSessionStore,
  WORK_SESSION_KEY,
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
