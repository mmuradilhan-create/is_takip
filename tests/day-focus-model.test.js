import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const record = (input = {}) =>
  createRecord({
    id: "daily",
    title: "Günlük iş",
    createdAt: STAMP,
    updatedAt: STAMP,
    sourceFields: { retained: { value: [1, 2] } },
    ...input,
  });

test("focus dates are optional calendar values and historical records retain their exact canonical shape", () => {
  const legacy = record();
  assert.equal(Object.hasOwn(legacy, "focusDate"), false);
  assert.equal(
    JSON.stringify(validateStore({ version: 1, records: [legacy] }).records[0]),
    JSON.stringify(legacy),
  );
  for (const focusDate of [null, "", "   "])
    assert.equal(record({ focusDate }).focusDate, null);
  for (const focusDate of ["0001-01-01", "2024-02-29", "9999-12-31"])
    assert.equal(record({ focusDate }).focusDate, focusDate);
  assert.equal(record({ focusDate: " 2026-11-07 " }).focusDate, "2026-11-07");
  for (const focusDate of [
    undefined,
    42,
    false,
    {},
    [],
    "0000-01-01",
    "2026-02-29",
    "1900-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-01",
    "2026-11-07T00:00:00Z",
  ])
    assert.throws(() => record({ focusDate }), /Odak tarihi/);
});

test("old focus dates survive closing or changing record types without rewriting any activity or source data", () => {
  const original = record({
    focusDate: "2026-10-01",
    nextAction: "Özgün adım",
  });
  const snapshot = structuredClone(original);
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ]) {
    const changed = createRecord({ ...original, type, status: "completed" });
    assert.equal(changed.focusDate, "2026-10-01");
    assert.equal(changed.createdAt, STAMP);
    assert.equal(changed.updatedAt, STAMP);
    assert.deepEqual(changed.sourceFields, original.sourceFields);
    assert.equal(changed.nextAction, original.nextAction);
    assert.deepEqual(
      validateStore({ version: 1, records: [changed] }).records,
      [changed],
    );
  }
  assert.deepEqual(original, snapshot);
});

test("focus selection and removal survive native backups and reload Undo restores the exact absent field", () => {
  const legacy = record();
  const key = "focus-model-test";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: [legacy] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let store = createWorkspaceStore({ storage, key });
  const selected = createRecord({
    ...legacy,
    focusDate: "2026-11-07",
    updatedAt: "2026-11-07T09:00:00Z",
  });
  store.saveRecords([selected], "Odak seçimi");
  const backup = JSON.parse(
    JSON.stringify({ version: 1, records: store.records }),
  );
  assert.deepEqual(validateStore(backup).records, [selected]);
  store.saveRecords(
    [
      createRecord({
        ...selected,
        focusDate: null,
        updatedAt: "2026-11-07T10:00:00Z",
      }),
    ],
    "Odağı kaldır",
  );
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.records[0].focusDate, null);
  assert.equal(store.undo(), "Odağı kaldır");
  assert.deepEqual(store.records, [selected]);
  assert.equal(store.undo(), "Odak seçimi");
  assert.deepEqual(store.records, [legacy]);
  assert.equal(Object.hasOwn(store.records[0], "focusDate"), false);
});
