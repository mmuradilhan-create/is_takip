import test from "node:test";
import assert from "node:assert/strict";
import {
  monthlyPeriodFromKey,
  previousMonthlyGoals,
  moveMonthlyGoal,
} from "../src/monthly-flow.js";
import { makePlanningPeriod } from "../src/planning-periods.js";
import { createRecord, goalProgress, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-10-15T09:00:00.000Z";
const MOVED_AT = "2026-11-07T10:00:00.000Z";
const TARGET = makePlanningPeriod("monthly", "2026-11-07");
const record = (id, input = {}) =>
  createRecord({
    id,
    type: "monthly",
    title: id,
    periodKey: "2026-10",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });

class MemoryStorage {
  constructor(key, records) {
    this.values = new Map([[key, JSON.stringify({ version: 1, records })]]);
    this.fail = false;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.fail) {
      const error = new Error("Storage is full");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
}

test("canonical monthly periods retain leap years and all supported positive years", () => {
  assert.deepEqual(monthlyPeriodFromKey(" 2026-11 "), TARGET);
  assert.equal(monthlyPeriodFromKey("2024-02").end, "2024-02-29");
  assert.equal(monthlyPeriodFromKey("1900-02").end, "1900-02-28");
  assert.equal(monthlyPeriodFromKey("2000-02").end, "2000-02-29");
  assert.equal(monthlyPeriodFromKey("0001-01").start, "0001-01-01");
  assert.equal(monthlyPeriodFromKey("9999-12").end, "9999-12-31");
  for (const key of [
    "0000-01",
    "10000-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "2026-11-01",
    "2026-W45",
    "",
    null,
    undefined,
    202611,
    {},
  ])
    assert.equal(monthlyPeriodFromKey(key), null);

  const goal = record("year-boundary", { periodKey: "2026-12" });
  const target = { type: "monthly", key: "2027-01", start: "1900-01-01" };
  const before = structuredClone(target);
  assert.deepEqual(previousMonthlyGoals([goal], target), [goal]);
  assert.equal(
    moveMonthlyGoal([goal], goal.id, target, MOVED_AT)[0].periodKey,
    "2027-01",
  );
  assert.deepEqual(target, before);
});

test("previous monthly goals include only older open monthly work and retain source identities", () => {
  const rows = [
    ...["planned", "in_progress", "waiting", "partially_completed"].map(
      (status, index) => record(`open-${index}`, { status }),
    ),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { status }),
    ),
    record("weekly", { type: "weekly", periodKey: "2026-W40" }),
    record("yearly", { type: "yearly", periodKey: "2025" }),
    record("daily", { type: "daily" }),
    record("same", { periodKey: TARGET.key }),
    record("future", { periodKey: "2026-12" }),
    record("unknown", { periodKey: "", dueDate: "" }),
    { ...record("missing", { periodKey: "" }), dueDate: undefined },
    null,
  ];
  const before = structuredClone(rows);
  const previous = previousMonthlyGoals(rows, TARGET);
  assert.deepEqual(
    previous.map((goal) => goal.id),
    ["open-0", "open-1", "open-2", "open-3"],
  );
  for (const goal of previous)
    assert.equal(
      goal,
      rows.find((row) => row?.id === goal.id),
    );
  assert.deepEqual(rows, before);
  for (const target of [
    null,
    {},
    { type: "weekly", key: "2026-W45" },
    { type: "monthly", key: "2026-13" },
  ])
    assert.deepEqual(previousMonthlyGoals(rows, target), []);
  assert.throws(() => previousMonthlyGoals(null, TARGET), /liste/);
});

test("valid explicit months override deadlines and invalid months fall back only to valid calendar dates", () => {
  const rows = [
    record("explicit-old", { periodKey: "2026-09", dueDate: "2027-01-01" }),
    record("explicit-future", { periodKey: "2026-12", dueDate: "2026-01-01" }),
    record("invalid-month", { periodKey: "2026-13", dueDate: "2026-10-31" }),
    record("empty-month", { periodKey: "", dueDate: "2026-10-01" }),
    { ...record("invalid-date", { periodKey: "" }), dueDate: "2026-02-30" },
    { ...record("non-leap-date", { periodKey: "" }), dueDate: "1900-02-29" },
  ];
  assert.deepEqual(
    previousMonthlyGoals(rows, TARGET).map((goal) => goal.id),
    ["empty-month", "invalid-month", "explicit-old"],
  );
  const moved = moveMonthlyGoal(rows, "empty-month", TARGET, MOVED_AT);
  assert.equal(moved[3].dueDate, rows[3].dueDate);
  assert.deepEqual(moved[3].sourceFields.__monthlyMoves, [
    {
      from: "2026-10",
      to: "2026-11",
      movedAt: MOVED_AT,
      previousPeriodKey: "",
    },
  ]);
});

test("monthly backlog sorts by recent month before priority, due date, Turkish title and identifier", () => {
  const rows = [
    record("older-urgent", { periodKey: "2026-09", priority: "urgent" }),
    record("normal-b", { title: "Beta", dueDate: "2026-10-05" }),
    record("normal-a-2", { title: "Alfa", dueDate: "2026-10-05" }),
    record("normal-a-1", { title: "Alfa", dueDate: "2026-10-05" }),
    record("normal-earlier", { dueDate: "2026-10-01" }),
    record("normal-undated"),
    record("urgent", { priority: "urgent" }),
    record("high", { priority: "high" }),
    record("low", { priority: "low" }),
  ];
  const before = rows.slice();
  assert.deepEqual(
    previousMonthlyGoals(rows, TARGET).map((goal) => goal.id),
    [
      "urgent",
      "high",
      "normal-earlier",
      "normal-a-1",
      "normal-a-2",
      "normal-b",
      "normal-undated",
      "low",
      "older-urgent",
    ],
  );
  assert.deepEqual(rows, before);
});

function hierarchyFixture() {
  return [
    record("year", { type: "yearly", periodKey: "2026" }),
    record("month", {
      goalParentId: "year",
      status: "in_progress",
      dueDate: "2026-10-20",
      targetValue: 8,
      currentValue: 2,
      metric: "Rapor",
      nextAction: "İncelemeyi tamamla",
      description: "Kendi notum",
      carryForward: true,
      sourceFields: {
        Ay: "2026-10",
        nested: { retained: [1, 2] },
        __monthlyMoves: [{ legacy: "retained" }],
      },
    }),
    record("week", {
      type: "weekly",
      periodKey: "2026-W43",
      goalParentId: "month",
    }),
    record("daily", { type: "daily", parentId: "week", status: "completed" }),
    record("other-month", { periodKey: "2026-09" }),
  ];
}

test("moving changes only one period, update timestamp and appended metadata while preserving metrics and all links", () => {
  const rows = hierarchyFixture();
  const before = structuredClone(rows);
  const metric = goalProgress(rows[1], rows);
  const rollup = goalProgress({ ...rows[1], targetValue: null }, rows);
  const moved = moveMonthlyGoal(rows, "month", TARGET, new Date(MOVED_AT));
  assert.notEqual(moved, rows);
  assert.equal(moved.length, rows.length);
  assert.notEqual(moved[1], rows[1]);
  for (let index = 0; index < rows.length; index++)
    if (index !== 1) assert.equal(moved[index], rows[index]);
  assert.deepEqual(
    {
      ...moved[1],
      periodKey: rows[1].periodKey,
      updatedAt: rows[1].updatedAt,
      sourceFields: rows[1].sourceFields,
    },
    rows[1],
  );
  assert.equal(moved[1].goalParentId, "year");
  assert.equal(moved[2].goalParentId, "month");
  assert.equal(moved[3].parentId, "week");
  assert.equal(moved[1].sourceFields.nested, rows[1].sourceFields.nested);
  assert.deepEqual(moved[1].sourceFields.__monthlyMoves, [
    { legacy: "retained" },
    {
      from: "2026-10",
      to: "2026-11",
      movedAt: MOVED_AT,
      previousPeriodKey: "2026-10",
    },
  ]);
  assert.deepEqual(goalProgress(moved[1], moved), metric);
  assert.deepEqual(
    goalProgress({ ...moved[1], targetValue: null }, moved),
    rollup,
  );
  assert.equal(moveMonthlyGoal(moved, "month", TARGET, "unused"), moved);
  assert.equal(
    previousMonthlyGoals(moved, TARGET).some((goal) => goal.id === "month"),
    false,
  );
  assert.deepEqual(
    validateStore({ version: 1, records: moved }).records,
    moved,
  );
  assert.deepEqual(rows, before);
});

test("invalid sources, destination periods, timestamps and malformed history fail without mutation", () => {
  const rows = [
    record("goal"),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { status }),
    ),
    record("weekly", { type: "weekly" }),
    record("future", { periodKey: "2026-12" }),
    record("unknown", { periodKey: "", dueDate: "" }),
    record("metadata", {
      sourceFields: { __monthlyMoves: "preserve original" },
    }),
  ];
  const before = structuredClone(rows);
  for (const id of [
    "completed",
    "cancelled",
    "transferred",
    "weekly",
    "future",
    "unknown",
    "metadata",
    "missing",
  ])
    assert.throws(() => moveMonthlyGoal(rows, id, TARGET, MOVED_AT));
  for (const target of [
    null,
    {},
    { type: "weekly", key: "2026-W45" },
    { type: "monthly", key: "2026-13" },
    makePlanningPeriod("monthly", "2026-09-01"),
  ])
    assert.throws(() => moveMonthlyGoal(rows, "goal", target, MOVED_AT));
  for (const now of [
    "",
    "invalid",
    "2026-02-30T10:00:00Z",
    "1900-02-29T10:00:00Z",
    "2026-11-07T24:00:00Z",
    "2026-11-07T10:60:00Z",
    "2026-11-07T10:00:60Z",
    new Date(NaN),
    null,
  ])
    assert.throws(
      () => moveMonthlyGoal(rows, "goal", TARGET, now),
      /zamanı geçersiz/,
    );
  assert.throws(() => moveMonthlyGoal(null, "goal", TARGET, MOVED_AT), /liste/);
  assert.equal(
    moveMonthlyGoal(rows, "goal", TARGET, "2026-11-07T13:00:00+03:00")[0]
      .updatedAt,
    MOVED_AT,
  );
  assert.deepEqual(rows, before);
});

test("successive monthly moves survive native JSON and reloaded Undo restores exact snapshots and original hierarchy", () => {
  const original = hierarchyFixture();
  const key = "monthly-flow-undo";
  const storage = new MemoryStorage(key, original);
  const initialRaw = storage.getItem(key);
  let store = createWorkspaceStore({ storage, key });
  assert.equal(storage.getItem(key), initialRaw);
  store.saveRecords(
    moveMonthlyGoal(store.records, "month", TARGET, MOVED_AT),
    "Bu aya taşı",
  );
  const first = store.records;
  const next = makePlanningPeriod("monthly", "2026-12-01");
  store.saveRecords(
    moveMonthlyGoal(store.records, "month", next, "2026-12-01T09:00:00Z"),
    "Bu aya taşı",
  );
  assert.equal(store.records.length, original.length);
  assert.deepEqual(store.records[1].sourceFields.__monthlyMoves[2], {
    from: "2026-11",
    to: "2026-12",
    movedAt: "2026-12-01T09:00:00.000Z",
    previousPeriodKey: "2026-11",
  });
  const backup = JSON.parse(
    JSON.stringify({ version: 1, records: store.records }),
  );
  assert.deepEqual(validateStore(backup).records, store.records);
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.history.length, 2);
  assert.equal(store.undo(), "Bu aya taşı");
  assert.deepEqual(store.records, first);
  assert.equal(store.undo(), "Bu aya taşı");
  assert.deepEqual(store.records, original);
});

test("failed persistence preserves both the old month and its undo history without mutating the proposed move", () => {
  const original = hierarchyFixture();
  const key = "monthly-flow-failure";
  const storage = new MemoryStorage(key, original);
  const store = createWorkspaceStore({ storage, key });
  const beforeRaw = storage.getItem(key);
  const proposed = moveMonthlyGoal(store.records, "month", TARGET, MOVED_AT);
  const beforeProposed = structuredClone(proposed);
  storage.fail = true;
  assert.throws(() => store.saveRecords(proposed, "Bu aya taşı"));
  assert.equal(storage.getItem(key), beforeRaw);
  assert.deepEqual(store.records, original);
  assert.equal(store.canUndo, false);
  assert.deepEqual(proposed, beforeProposed);
});
