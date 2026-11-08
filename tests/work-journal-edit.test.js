import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import {
  updateWorkLogEntry,
  removeWorkLogEntry,
  weekWorkSummary,
  totalWorkMs,
} from "../src/work-journal.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-11-07T12:00:00.000Z";
const UPDATED = "2026-11-08T09:00:00.000Z";
const entry = (id, date, durationMs) => ({
  id,
  date,
  durationMs,
  endedAt: STAMP,
  note: "Özgün sonuç",
  nextAction: "Oturumdaki eski adım",
});
const fixture = () =>
  createRecord({
    id: "journal-edit-record",
    title: "Çalışma geçmişini düzelt",
    type: "daily",
    status: "in_progress",
    nextAction: "İşin güncel adımı",
    sourceFields: { Kaynak: "Korunacak" },
    createdAt: STAMP,
    updatedAt: STAMP,
    workLog: [
      entry("one", "2026-11-07", 65_000),
      entry("two", "2026-11-06", 30_000),
    ],
  });

test("editing a saved session preserves its identity, finish timestamp, other history and current task fields", () => {
  const original = fixture();
  const copy = structuredClone(original);
  const patch = {
    date: "2026-10-31",
    durationMs: 3_661_000,
    note: "<img src=x> Düzeltilmiş sonuç",
    nextAction: "Geçmişteki düzeltilmiş adım",
  };
  const result = updateWorkLogEntry(original, "one", patch, {
    updatedAt: UPDATED,
  });
  assert.deepEqual(original, copy);
  assert.deepEqual(result.workLog[0], { ...original.workLog[0], ...patch });
  assert.deepEqual(result.workLog[1], original.workLog[1]);
  assert.deepEqual(
    { ...result, workLog: original.workLog, updatedAt: original.updatedAt },
    original,
  );
  assert.equal(totalWorkMs(result), 3_691_000);
  const current = weekWorkSummary([result], {
    start: "2026-11-02",
    end: "2026-11-08",
  });
  assert.equal(current.sessionCount, 1);
  assert.equal(current.totalMs, 30_000);
  assert.equal(
    weekWorkSummary([result], { start: "2026-10-26", end: "2026-11-01" })
      .totalMs,
    3_661_000,
  );
  assert.deepEqual(
    validateStore(JSON.parse(JSON.stringify({ version: 1, records: [result] })))
      .records,
    [result],
  );
});

test("invalid edits never mutate saved data or allow changing session identifiers and finish times", () => {
  const original = fixture();
  const copy = structuredClone(original);
  for (const patch of [
    null,
    [],
    { id: "another" },
    { endedAt: UPDATED },
    { durationMs: -1 },
    { durationMs: 1.5 },
    { date: "2026-02-30" },
    { note: "x".repeat(10001) },
  ])
    assert.throws(() => updateWorkLogEntry(original, "one", patch));
  assert.throws(
    () => updateWorkLogEntry(original, "missing", { note: "Yeni" }),
    /bulunamadı/,
  );
  assert.throws(
    () => updateWorkLogEntry({ ...original, type: "meeting" }, "one", {}),
    /günlük/,
  );
  assert.deepEqual(original, copy);
  assert.equal(
    updateWorkLogEntry(original, "one", { note: original.workLog[0].note }),
    original,
  );
});

test("deleting one session preserves the task and unrelated logs, with idempotent retry and no legacy property added", () => {
  const original = fixture();
  const result = removeWorkLogEntry(original, "one", { updatedAt: UPDATED });
  assert.deepEqual(result.workLog, [original.workLog[1]]);
  assert.deepEqual(
    { ...result, updatedAt: original.updatedAt, workLog: original.workLog },
    original,
  );
  assert.equal(removeWorkLogEntry(result, "one"), result);
  const empty = removeWorkLogEntry(result, "two", { updatedAt: UPDATED });
  assert.deepEqual(empty.workLog, []);
  const legacy = createRecord({ id: "legacy-journal", title: "Eski iş" });
  assert.equal(removeWorkLogEntry(legacy, "one"), legacy);
  assert.equal(Object.hasOwn(legacy, "workLog"), false);
});

test("edit and delete are independent atomic undo actions and failed persistence keeps original sessions", () => {
  const original = fixture();
  const values = new Map([
    [
      "journal-edit-workspace",
      JSON.stringify({ version: 1, records: [original] }),
    ],
  ]);
  let failWrite = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite && key === "journal-edit-workspace")
        throw new Error("Storage is full");
      values.set(key, String(value));
    },
  };
  let store = createWorkspaceStore({
    storage,
    key: "journal-edit-workspace",
    initialRecords: [original],
  });
  const edited = updateWorkLogEntry(
    original,
    "one",
    { durationMs: 120_000, note: "Düzeltilmiş" },
    { updatedAt: UPDATED },
  );
  store.saveRecords([edited], "Oturum düzenleme");
  const removed = removeWorkLogEntry(edited, "two", { updatedAt: UPDATED });
  store.saveRecords([removed], "Oturum silme");
  store = createWorkspaceStore({
    storage,
    key: "journal-edit-workspace",
    initialRecords: [],
  });
  assert.equal(store.undo(), "Oturum silme");
  assert.deepEqual(store.records, [edited]);
  assert.equal(store.undo(), "Oturum düzenleme");
  assert.deepEqual(store.records, [original]);
  failWrite = true;
  assert.throws(
    () => store.saveRecords([edited], "Oturum düzenleme"),
    /Storage is full/,
  );
  assert.deepEqual(store.records, [original]);
});
