import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, goalProgress } from "../src/model.js";
import { updateGoalProgress } from "../src/goal-progress-update.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-08T12:00:00.000Z";
const goal = (type = "weekly", values = {}) =>
  createRecord({
    id: type,
    type,
    title: `${type} ölçüm hedefi`,
    periodKey: { weekly: "2026-W46", monthly: "2026-11", yearly: "2026" }[type],
    status: "in_progress",
    targetValue: 10,
    currentValue: 2,
    metric: "Rapor",
    createdAt: STAMP,
    updatedAt: STAMP,
    sourceFields: { original: { value: [1, 2] } },
    ...values,
  });
const snapshot = (record) => ({
  targetValue: record.targetValue,
  metric: record.metric,
  status: record.status,
});
const update = (record, value, options = {}) =>
  updateGoalProgress(record, value, {
    expectedCurrent: record.currentValue,
    expectedSnapshot: snapshot(record),
    updatedAt: NOW,
    ...options,
  });

test("all three measured goal types change only their own current count and timestamp without completing or capping the stored value", () => {
  for (const type of ["weekly", "monthly", "yearly"]) {
    const original = goal(type, {
      currentValue: 2.5,
      nextAction: "Bağımsız sonraki adım",
      description: "Özgün not",
    });
    Object.freeze(original);
    const changed = update(original, "12,5");
    assert.equal(changed.currentValue, 12.5);
    assert.equal(changed.updatedAt, NOW);
    assert.equal(changed.status, "in_progress");
    assert.equal(goalProgress(changed, [changed]).percent, 100);
    assert.deepEqual(
      {
        ...changed,
        currentValue: original.currentValue,
        updatedAt: original.updatedAt,
      },
      original,
    );
    assert.equal(changed.sourceFields, original.sourceFields);
    const atTarget = update(original, original.targetValue);
    assert.equal(atTarget.currentValue, 10);
    assert.equal(atTarget.status, "in_progress");
  }
});

test("null count is a distinct baseline, and stale count or measurement configuration is rejected before a no-op or write", () => {
  const original = goal("weekly", { currentValue: null });
  assert.equal(update(original, 1).currentValue, 1);
  assert.equal(update(original, 0).currentValue, 0);
  assert.throws(
    () => update(original, 1, { expectedCurrent: 0 }),
    /başka bir işlemde değişti/,
  );
  const measured = goal();
  for (const changed of [
    { currentValue: 3 },
    { targetValue: 20 },
    { metric: "Parça" },
    { status: "waiting" },
  ]) {
    const current = { ...measured, ...changed };
    assert.throws(
      () =>
        updateGoalProgress(current, current.currentValue, {
          expectedCurrent: measured.currentValue,
          expectedSnapshot: snapshot(measured),
          updatedAt: NOW,
        }),
      /değişti/,
    );
  }
  assert.throws(() => update(measured, 3, { expectedSnapshot: {} }), /değişti/);
});

test("a derived or closed goal cannot acquire invented measurements through a progress action", () => {
  for (const type of ["weekly", "monthly", "yearly"]) {
    for (const targetValue of [null, 0])
      assert.throws(
        () => update(goal(type, { targetValue }), 1),
        /bağlı kayıtlarından/,
      );
    for (const status of ["completed", "cancelled", "transferred"])
      assert.throws(() => update(goal(type, { status }), 1), /yeniden aç/);
  }
  assert.throws(
    () => update({ ...goal(), type: "daily" }, 1),
    /hedef bulunamıyor/,
  );
  assert.throws(() => updateGoalProgress(null, 1), /hedef bulunamıyor/);
});

test("invalid values and timestamps leave the record intact, while an unchanged current value keeps its exact identity", () => {
  const original = goal();
  const before = structuredClone(original);
  for (const value of [
    -1,
    NaN,
    Infinity,
    -Infinity,
    "1e309",
    "",
    " ",
    null,
    undefined,
    {},
    [],
  ])
    assert.throws(() => update(original, value), /sayı yaz/);
  for (const updatedAt of [
    "bad",
    "2026-02-30T12:00:00Z",
    "2026-11-08T24:00:00Z",
    null,
    new Date(NaN),
  ])
    assert.throws(() => update(original, 3, { updatedAt }), /zamanı geçersiz/);
  assert.equal(update(original, 2, { updatedAt: "unused" }), original);
  assert.deepEqual(original, before);
});

test("a measured weekly update refreshes derived ancestors without changing their stored metric, period, links or status", () => {
  const year = goal("yearly", {
    targetValue: null,
    currentValue: null,
    metric: "",
  });
  const month = goal("monthly", {
    goalParentId: year.id,
    targetValue: null,
    currentValue: null,
    metric: "",
  });
  const week = goal("weekly", { goalParentId: month.id });
  const original = [year, month, week];
  const before = structuredClone(original);
  const changed = update(week, 8);
  const records = [year, month, changed];
  assert.equal(goalProgress(month, records).percent, 80);
  assert.equal(goalProgress(year, records).percent, 80);
  assert.equal(records[0], original[0]);
  assert.equal(records[1], original[1]);
  assert.deepEqual(original, before);
});
