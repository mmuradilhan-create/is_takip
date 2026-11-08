import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  validateStore,
  goalProgress,
  getWeeklyProgress,
} from "../src/model.js";
import {
  parentGoalType,
  goalChildren,
  linkedGoalProgress,
} from "../src/goal-hierarchy.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const record = (id, type, input = {}) =>
  createRecord({
    id,
    type,
    title: id,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const checked = (records) => validateStore({ version: 1, records }).records;

class MemoryStorage {
  constructor(key, records) {
    this.values = new Map([[key, JSON.stringify({ version: 1, records })]]);
    this.writes = [];
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
    this.writes.push(key);
  }
}

test("goal parent fields are explicit and strict while legacy records keep their exact optional shape", () => {
  assert.equal(parentGoalType("daily"), "weekly");
  assert.equal(parentGoalType("weekly"), "monthly");
  assert.equal(parentGoalType("monthly"), "yearly");
  for (const type of ["yearly", "meeting", "waiting", "unknown"])
    assert.equal(parentGoalType(type), null);

  const sourceFields = { "Özgün bilgi": { values: [1, "korunur"] } };
  const legacy = record("legacy", "weekly", { sourceFields });
  const before = JSON.stringify(legacy);
  assert.equal(Object.hasOwn(legacy, "goalParentId"), false);
  assert.equal(JSON.stringify(checked([legacy])[0]), before);
  assert.equal(Object.hasOwn(checked([legacy])[0], "goalParentId"), false);
  for (const goalParentId of [null, "", "   "])
    assert.equal(
      record("detached", "weekly", { goalParentId }).goalParentId,
      null,
    );
  for (const goalParentId of [undefined, 42, false, [], {}])
    assert.throws(() => record("bad", "weekly", { goalParentId }));
  for (const type of ["daily", "yearly", "meeting", "waiting"])
    assert.throws(() => record("bad", type, { goalParentId: "parent" }));
  assert.throws(() => record("self", "weekly", { goalParentId: "self" }));
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(sourceFields, { "Özgün bilgi": { values: [1, "korunur"] } });
});

test("backups accept only the immediate goal parent type and preserve the existing daily weekly relationship", () => {
  const yearly = record("year", "yearly");
  const monthly = record("month", "monthly", { goalParentId: yearly.id });
  const weekly = record("week", "weekly", { goalParentId: monthly.id });
  const daily = record("day", "daily", { parentId: weekly.id });
  const rows = [daily, weekly, monthly, yearly];
  assert.deepEqual(checked(rows), rows);
  assert.equal(checked(rows)[0].parentId, weekly.id);
  assert.throws(() => checked([weekly, yearly]));
  assert.throws(() =>
    checked([{ ...weekly, goalParentId: yearly.id }, yearly]),
  );
  assert.throws(() =>
    checked([{ ...monthly, goalParentId: weekly.id }, weekly]),
  );
  assert.throws(() => checked([{ ...monthly, goalParentId: monthly.id }]));
  assert.throws(() => checked([daily, monthly, yearly]));
  assert.throws(() =>
    checked([{ ...weekly, goalParentId: 42 }, monthly, yearly]),
  );
});

test("child selectors return only valid immediate links in input order without mutating or filtering closed rows", () => {
  const yearly = record("year", "yearly");
  const monthly = record("month", "monthly", { goalParentId: yearly.id });
  const weekly = record("week", "weekly", { goalParentId: monthly.id });
  const cancelled = record("cancelled", "weekly", {
    goalParentId: monthly.id,
    status: "cancelled",
  });
  const daily = record("day", "daily", { parentId: weekly.id });
  const invalidDailyGoal = {
    ...daily,
    id: "bad-goal",
    goalParentId: monthly.id,
  };
  const invalidDailyContext = {
    ...daily,
    id: "bad-context",
    workContext: "ad_hoc",
  };
  const invalidGoalType = {
    ...monthly,
    id: "bad-type",
    goalParentId: monthly.id,
  };
  const invalidSelf = { ...weekly, goalParentId: weekly.id };
  const rows = [
    cancelled,
    daily,
    monthly,
    weekly,
    yearly,
    invalidDailyGoal,
    invalidDailyContext,
    invalidGoalType,
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(goalChildren(monthly, rows), [cancelled, weekly]);
  assert.deepEqual(goalChildren(yearly, rows), [monthly]);
  assert.deepEqual(goalChildren(weekly, rows), [daily, invalidDailyGoal]);
  assert.deepEqual(goalChildren(daily, rows), []);
  assert.deepEqual(goalChildren(weekly, [invalidSelf]), []);
  assert.equal(goalChildren(monthly, rows)[0], cancelled);
  assert.equal(JSON.stringify(rows), before);
});

test("weekly progress retains daily completion semantics and a positive metric dominates even with an empty current value", () => {
  const weekly = record("week", "weekly");
  const done = record("done", "daily", {
    parentId: weekly.id,
    status: "completed",
  });
  const open = record("open", "daily", { parentId: weekly.id });
  const excluded = ["cancelled", "transferred"].map((status) =>
    record(status, "daily", { parentId: weekly.id, status }),
  );
  const rows = [done, ...excluded, open];
  const expected = { total: 2, completed: 1, percent: 50 };
  assert.deepEqual(getWeeklyProgress(weekly.id, rows), expected);
  assert.deepEqual(linkedGoalProgress(weekly, rows), {
    ...expected,
    basis: "linked",
  });
  assert.deepEqual(goalProgress(weekly, rows), {
    ...expected,
    basis: "linked",
  });
  assert.deepEqual(
    goalProgress({ ...weekly, targetValue: 10, currentValue: null }, rows),
    { total: 10, completed: 0, percent: 0, basis: "metric" },
  );
  assert.equal(
    goalProgress({ ...weekly, targetValue: 10, currentValue: 25 }, rows)
      .percent,
    100,
  );
  assert.equal(
    goalProgress({ ...weekly, targetValue: 10, currentValue: -5 }, rows)
      .percent,
    0,
  );
  for (const targetValue of [null, 0, -1])
    assert.equal(
      goalProgress({ ...weekly, targetValue, currentValue: 10 }, rows).basis,
      "linked",
    );
  assert.deepEqual(
    goalProgress(
      { ...weekly, status: "completed", targetValue: 10, currentValue: null },
      rows,
    ),
    { total: 1, completed: 1, percent: 100, basis: "status" },
  );
});

test("monthly and yearly progress averages immediate goal percentages recursively without changing any statuses", () => {
  const yearly = record("year", "yearly");
  const monthly = record("month", "monthly", { goalParentId: yearly.id });
  const emptyMonth = record("empty-month", "monthly", {
    goalParentId: yearly.id,
  });
  const first = record("first-week", "weekly", {
    goalParentId: monthly.id,
    status: "in_progress",
  });
  const second = record("second-week", "weekly", { goalParentId: monthly.id });
  const excluded = ["cancelled", "transferred"].map((status) =>
    record(status, "weekly", {
      goalParentId: monthly.id,
      status,
      targetValue: 1,
      currentValue: 1,
    }),
  );
  const daily = [
    record("one-done", "daily", { parentId: first.id, status: "completed" }),
    ...Array.from({ length: 10 }, (_, index) =>
      record(`many-${index}`, "daily", {
        parentId: second.id,
        status: index < 2 ? "completed" : "planned",
      }),
    ),
  ];
  const rows = [
    yearly,
    monthly,
    emptyMonth,
    first,
    second,
    ...excluded,
    ...daily,
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(goalProgress(monthly, rows), {
    total: 2,
    completed: 0,
    percent: 60,
    basis: "rollup",
  });
  assert.deepEqual(
    linkedGoalProgress(monthly, rows),
    goalProgress(monthly, rows),
  );
  assert.deepEqual(goalProgress(yearly, rows), {
    total: 2,
    completed: 0,
    percent: 30,
    basis: "rollup",
  });
  const completedFirst = rows.map((row) =>
    row.id === first.id ? { ...row, status: "completed" } : row,
  );
  assert.equal(goalProgress(monthly, completedFirst).completed, 1);
  assert.equal(goalProgress(monthly, completedFirst).percent, 60);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(first.status, "in_progress");
  assert.equal(monthly.status, "planned");
  assert.equal(yearly.status, "planned");
});

test("higher goal metrics override child rollup and goals without eligible children keep their own status baseline", () => {
  const yearly = record("year", "yearly", { targetValue: 20, currentValue: 5 });
  const monthly = record("month", "monthly", {
    goalParentId: yearly.id,
    status: "completed",
  });
  assert.deepEqual(goalProgress(yearly, [monthly]), {
    total: 20,
    completed: 5,
    percent: 25,
    basis: "metric",
  });
  assert.equal(
    goalProgress({ ...yearly, currentValue: null }, [monthly]).percent,
    0,
  );
  for (const type of ["weekly", "monthly", "yearly"]) {
    const goal = record(type, type);
    assert.equal(linkedGoalProgress(goal, []), null);
    assert.deepEqual(goalProgress(goal, []), {
      total: 1,
      completed: 0,
      percent: 0,
      basis: "status",
    });
  }
  const emptyMonth = record("empty", "monthly");
  const closedChildren = ["cancelled", "transferred"].map((status) =>
    record(status, "weekly", { goalParentId: emptyMonth.id, status }),
  );
  assert.equal(linkedGoalProgress(emptyMonth, closedChildren), null);
  assert.equal(goalProgress(emptyMonth, closedChildren).basis, "status");
});

test("adding goal links preserves source data and timestamps and survives native backup reload and exact undo", () => {
  const key = "goal-hierarchy-test";
  const sourceFields = {
    "Özgün kaynak": { numbers: [1, 2], note: "Değişmez" },
  };
  const yearly = record("year", "yearly", { sourceFields });
  const monthly = record("month", "monthly", { sourceFields });
  const weekly = record("week", "weekly", { sourceFields });
  const daily = record("day", "daily", { parentId: weekly.id });
  const legacy = [yearly, monthly, weekly, daily];
  const legacySignature = JSON.stringify(legacy);
  const storage = new MemoryStorage(key, legacy);
  const originalRaw = storage.getItem(key);
  const store = createWorkspaceStore({ storage, key });
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.getItem(key), originalRaw);
  assert.equal(JSON.stringify(store.records), legacySignature);
  const linked = legacy.map((row) =>
    row.id === monthly.id
      ? { ...row, goalParentId: yearly.id }
      : row.id === weekly.id
        ? { ...row, goalParentId: monthly.id }
        : row,
  );
  store.saveRecords(linked, "Hedef bağlantıları");
  assert.deepEqual(store.records, linked);
  const backup = JSON.stringify(
    validateStore(JSON.parse(storage.getItem(key))),
  );
  assert.deepEqual(JSON.parse(backup).records, linked);
  const reloaded = createWorkspaceStore({ storage, key });
  assert.deepEqual(reloaded.records, linked);
  assert.equal(reloaded.canUndo, true);
  assert.equal(reloaded.undo(), "Hedef bağlantıları");
  assert.equal(JSON.stringify(reloaded.records), legacySignature);
  assert.equal(Object.hasOwn(reloaded.records[1], "goalParentId"), false);
  assert.equal(Object.hasOwn(reloaded.records[2], "goalParentId"), false);
  assert.equal(reloaded.records[3].parentId, weekly.id);
  assert.equal(JSON.stringify(legacy), legacySignature);
  assert.deepEqual(sourceFields, {
    "Özgün kaynak": { numbers: [1, 2], note: "Değişmez" },
  });
});

test("removing a parent requires explicit child detachment and undo restores both hierarchy levels atomically", () => {
  const key = "goal-detach-test";
  const yearly = record("year", "yearly");
  const monthly = record("month", "monthly", { goalParentId: yearly.id });
  const weekly = record("week", "weekly", { goalParentId: monthly.id });
  const daily = record("day", "daily", { parentId: weekly.id });
  const original = [yearly, monthly, weekly, daily];
  const storage = new MemoryStorage(key, original);
  const store = createWorkspaceStore({ storage, key });
  const raw = storage.getItem(key);
  assert.throws(() => store.saveRecords([yearly, weekly, daily], "Geçersiz silme"));
  assert.equal(storage.getItem(key), raw);
  assert.deepEqual(store.records, original);
  const detached = [yearly, { ...weekly, goalParentId: null }, daily];
  store.saveRecords(detached, "Aylık hedef silme");
  assert.deepEqual(store.records, detached);
  assert.equal(store.records[2].parentId, weekly.id);
  const reloaded = createWorkspaceStore({ storage, key });
  assert.equal(reloaded.undo(), "Aylık hedef silme");
  assert.deepEqual(reloaded.records, original);
});
