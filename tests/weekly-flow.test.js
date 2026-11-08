import test from "node:test";
import assert from "node:assert/strict";
import {
  isArchivedWeekly,
  moveWeeklyGoal,
  previousWeeklyGoals,
  weeklyPeriodFromKey,
} from "../src/weekly-flow.js";
import { makePlanningPeriod } from "../src/planning-periods.js";
import {
  createRecord,
  getWeeklyProgress,
  goalProgress,
  statusLabel,
  statusesForType,
  validateStore,
} from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const stamp = "2026-11-07T09:00:00.000Z";
const movedAt = "2026-11-09T10:00:00.000Z";
const selected = makePlanningPeriod("weekly", "2026-11-09");

function record(input = {}) {
  return createRecord({
    id: "goal",
    type: "weekly",
    title: "İncelemeyi bitir",
    periodKey: "2026-W45",
    createdAt: stamp,
    updatedAt: stamp,
    ...input,
  });
}

test("legacy transferred weekly goals are labeled as archives without changing their saved status", () => {
  const archived = record({ status: "transferred", carryForward: true });
  const before = structuredClone(archived);
  assert.equal(statusLabel("weekly", archived.status), "Arşivlendi");
  assert.equal(statusLabel("daily", archived.status), "Aktarıldı");
  assert.equal(statusesForType("weekly").transferred, undefined);
  assert.equal(
    statusesForType("weekly", [archived.status]).transferred.label,
    "Arşivlendi",
  );
  assert.deepEqual(archived, before);
  assert.equal(archived.status, "transferred");
});

test("weekly keys validate real ISO weeks and retain New Year boundaries", () => {
  assert.deepEqual(weeklyPeriodFromKey(" 2026-W53 "), {
    type: "weekly",
    key: "2026-W53",
    start: "2026-12-28",
    end: "2027-01-03",
    label: "28 Aralık 2026 – 3 Ocak 2027",
  });
  for (const key of [
    "2025-W53",
    "2026-W00",
    "2026-W54",
    "2026-W1",
    "0000-W01",
    "10000-W01",
    "2026-11",
    "",
    undefined,
    null,
    {},
  ])
    assert.equal(weeklyPeriodFromKey(key), null);

  const prior = record({ periodKey: "2026-W53" });
  const next = { type: "weekly", key: "2027-W01", start: "1900-01-01" };
  const before = structuredClone(next);
  assert.deepEqual(previousWeeklyGoals([prior], next), [prior]);
  const moved = moveWeeklyGoal([prior], prior.id, next, movedAt);
  assert.equal(moved[0].periodKey, "2027-W01");
  assert.deepEqual(moved[0].sourceFields.__weeklyMoves[0], {
    from: "2026-W53",
    to: "2027-W01",
    movedAt,
    previousPeriodKey: "2026-W53",
  });
  assert.deepEqual(next, before);
});

test("previous goals include only open weekly work strictly before the selected week", () => {
  const records = [
    ...["planned", "in_progress", "waiting", "partially_completed"].map(
      (status, index) => record({ id: `open-${index}`, status }),
    ),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record({ id: status, status }),
    ),
    record({ id: "daily", type: "daily" }),
    record({ id: "monthly", type: "monthly", periodKey: "2026-10" }),
    record({ id: "same", periodKey: "2026-W46" }),
    record({ id: "future", periodKey: "2026-W47" }),
    record({ id: "unknown", periodKey: "", dueDate: "" }),
    { ...record({ id: "missing-date", periodKey: "" }), dueDate: undefined },
    record({ id: "invalid-week", periodKey: "2025-W53", dueDate: "" }),
  ];
  const before = structuredClone(records);
  const goals = previousWeeklyGoals(records, selected);
  assert.deepEqual(
    goals.map((goal) => goal.id),
    ["open-0", "open-1", "open-2", "open-3"],
  );
  for (const goal of goals)
    assert.equal(
      goal,
      records.find((r) => r.id === goal.id),
    );
  assert.deepEqual(records, before);
  for (const period of [
    null,
    {},
    { type: "monthly", key: "2026-11" },
    { type: "weekly", key: "2025-W53" },
  ])
    assert.deepEqual(previousWeeklyGoals(records, period), []);
  assert.throws(() => previousWeeklyGoals(null, selected), /liste/);
  assert.equal(
    isArchivedWeekly(records.find((r) => r.id === "transferred")),
    true,
  );
  assert.equal(isArchivedWeekly(record({ status: "completed" })), false);
  assert.equal(
    isArchivedWeekly(record({ type: "daily", status: "transferred" })),
    false,
  );
  assert.equal(isArchivedWeekly(null), false);
});

test("a valid planning week overrides deadlines while invalid or missing weeks use valid deadlines", () => {
  const records = [
    record({
      id: "explicit-old",
      periodKey: "2026-W44",
      dueDate: "2027-05-01",
    }),
    record({
      id: "explicit-future",
      periodKey: "2026-W47",
      dueDate: "2026-10-01",
    }),
    record({
      id: "fallback-invalid",
      periodKey: "2025-W53",
      dueDate: "2026-11-07",
    }),
    record({ id: "fallback-empty", periodKey: "", dueDate: "2026-11-06" }),
    { ...record({ id: "invalid-date", periodKey: "" }), dueDate: "2026-02-30" },
  ];
  assert.deepEqual(
    previousWeeklyGoals(records, selected).map((goal) => goal.id),
    ["fallback-empty", "fallback-invalid", "explicit-old"],
  );
  const moved = moveWeeklyGoal(records, "fallback-empty", selected, movedAt);
  assert.equal(moved[3].dueDate, "2026-11-06");
  assert.equal(moved[3].sourceFields.__weeklyMoves[0].from, "2026-W45");
  assert.equal(moved[3].sourceFields.__weeklyMoves[0].previousPeriodKey, "");
});

test("previous work is ordered by recent week then priority and deadline without changing source order", () => {
  const records = [
    record({ id: "older-urgent", periodKey: "2026-W44", priority: "urgent" }),
    record({ id: "low", priority: "low" }),
    record({ id: "normal-later", dueDate: "2026-11-06" }),
    record({ id: "normal-earlier", dueDate: "2026-11-04" }),
    record({ id: "urgent", priority: "urgent" }),
    record({ id: "high", priority: "high" }),
  ];
  const before = records.slice();
  assert.deepEqual(
    previousWeeklyGoals(records, selected).map((goal) => goal.id),
    ["urgent", "high", "normal-earlier", "normal-later", "low", "older-urgent"],
  );
  assert.deepEqual(records, before);
});

test("moving keeps one goal identity, child links, source values, deadlines and progress intact", () => {
  const goal = record({
    status: "in_progress",
    dueDate: "2026-11-06",
    metric: "Yayın",
    targetValue: 7,
    currentValue: 2,
    carryForward: true,
    description: "Kendi notum.",
    category: "Özgün kategori",
    projectCode: "PRJ-42",
    workType: "İnceleme",
    blocked: true,
    blockReason: "Yanıt bekleniyor.",
    sourceFields: {
      Hafta: "2026-W45",
      Durum: "Devam ediyor",
      nested: { retained: [1, 2] },
      __weeklyMoves: [{ legacy: "retained" }],
    },
    workLog: [
      {
        id: "session",
        date: "2026-11-07",
        endedAt: stamp,
        durationMs: 1000,
        note: "İncelendi.",
        nextAction: "Yanıtı bekle.",
      },
    ],
  });
  const records = [
    goal,
    record({ id: "step-open", type: "daily", parentId: goal.id }),
    record({
      id: "step-done",
      type: "daily",
      parentId: goal.id,
      status: "completed",
    }),
    record({ id: "other", periodKey: "2026-W44" }),
  ];
  const before = structuredClone(records);
  const progress = getWeeklyProgress(goal.id, records);
  const metric = goalProgress(goal, records);
  const moved = moveWeeklyGoal(records, goal.id, selected, new Date(movedAt));
  assert.notEqual(moved, records);
  assert.equal(moved.length, records.length);
  assert.deepEqual(
    moved.map((r) => r.id),
    records.map((r) => r.id),
  );
  assert.notEqual(moved[0], records[0]);
  for (let index = 1; index < records.length; index++)
    assert.equal(moved[index], records[index]);
  assert.deepEqual(
    {
      ...moved[0],
      periodKey: goal.periodKey,
      updatedAt: goal.updatedAt,
      sourceFields: goal.sourceFields,
    },
    goal,
  );
  assert.equal(moved[0].workLog, goal.workLog);
  assert.equal(moved[0].sourceFields.nested, goal.sourceFields.nested);
  assert.deepEqual(moved[0].sourceFields.__weeklyMoves, [
    { legacy: "retained" },
    {
      from: "2026-W45",
      to: "2026-W46",
      movedAt,
      previousPeriodKey: "2026-W45",
    },
  ]);
  assert.deepEqual(getWeeklyProgress(goal.id, moved), progress);
  assert.deepEqual(goalProgress(moved[0], moved), metric);
  assert.deepEqual(records, before);
  assert.equal(moveWeeklyGoal(moved, goal.id, selected, "not-used"), moved);
  assert.equal(
    previousWeeklyGoals(moved, selected).some((r) => r.id === goal.id),
    false,
  );
});

test("moving refuses closed, missing, unknown and later work or invalid metadata without mutation", () => {
  const records = [
    record(),
    record({ id: "completed", status: "completed" }),
    record({ id: "cancelled", status: "cancelled" }),
    record({ id: "archived", status: "transferred" }),
    record({ id: "daily", type: "daily" }),
    record({ id: "future", periodKey: "2026-W47" }),
    record({ id: "unknown", periodKey: "", dueDate: "" }),
    record({
      id: "metadata",
      sourceFields: { __weeklyMoves: "original value" },
    }),
  ];
  const before = structuredClone(records);
  for (const id of [
    "completed",
    "cancelled",
    "archived",
    "daily",
    "missing",
    "future",
    "unknown",
    "metadata",
  ])
    assert.throws(() => moveWeeklyGoal(records, id, selected, movedAt));
  for (const period of [
    null,
    { type: "monthly", key: "2026-11" },
    { type: "weekly", key: "2025-W53" },
  ])
    assert.throws(
      () => moveWeeklyGoal(records, "goal", period, movedAt),
      /geçerli bir hafta/,
    );
  for (const timestamp of [
    "",
    "invalid",
    "2026-02-30T10:00:00Z",
    "2026-11-09T24:00:00Z",
    "2026-11-09T10:60:00Z",
    "2026-11-09T10:00:60Z",
    new Date(NaN),
    null,
  ])
    assert.throws(
      () => moveWeeklyGoal(records, "goal", selected, timestamp),
      /zamanı geçersiz/,
    );
  assert.throws(() => moveWeeklyGoal(null, "goal", selected, movedAt), /liste/);
  assert.deepEqual(records, before);
  assert.equal(
    moveWeeklyGoal(records, "goal", selected, "2026-11-09T13:00:00+03:00")[0]
      .updatedAt,
    movedAt,
  );
});

test("movement history appends across weeks and survives a native backup and exact undo after reload", () => {
  const original = [
    record({
      sourceFields: { Hafta: "2026-W45", Devreden: "Evet" },
      carryForward: true,
    }),
    record({
      id: "step",
      type: "daily",
      parentId: "goal",
      status: "completed",
    }),
    record({
      id: "archive",
      status: "transferred",
      sourceFields: { Hafta: "2026-W44" },
    }),
  ];
  const key = "weekly-flow-test";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: original })],
  ]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  let store = createWorkspaceStore({ storage, key });
  store.saveRecords(
    moveWeeklyGoal(store.records, "goal", selected, movedAt),
    "Bu haftaya taşı",
  );
  const firstMove = structuredClone(store.records);
  const next = makePlanningPeriod("weekly", "2026-11-16");
  store.saveRecords(
    moveWeeklyGoal(store.records, "goal", next, "2026-11-16T09:00:00Z"),
    "Bu haftaya taşı",
  );
  assert.equal(store.records.length, original.length);
  assert.equal(store.records[0].sourceFields.__weeklyMoves.length, 2);
  assert.deepEqual(store.records[0].sourceFields.__weeklyMoves[1], {
    from: "2026-W46",
    to: "2026-W47",
    movedAt: "2026-11-16T09:00:00.000Z",
    previousPeriodKey: "2026-W46",
  });
  const backup = JSON.parse(
    JSON.stringify({ version: 1, records: store.records }),
  );
  assert.deepEqual(validateStore(backup).records, store.records);
  assert.equal(store.records[1].parentId, "goal");
  assert.deepEqual(store.records[2], original[2]);
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.history.length, 2);
  assert.equal(store.undo(), "Bu haftaya taşı");
  assert.deepEqual(store.records, firstMove);
  assert.equal(store.undo(), "Bu haftaya taşı");
  assert.deepEqual(store.records, original);
  assert.equal(
    Object.hasOwn(store.records[0].sourceFields, "__weeklyMoves"),
    false,
  );
});
