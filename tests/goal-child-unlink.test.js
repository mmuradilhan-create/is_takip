import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, goalProgress } from "../src/model.js";
import { unlinkGoalChild } from "../src/goal-child-unlink.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-09T10:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
function fixture() {
  return [
    make({ id: "year", type: "yearly", title: "Yıl", periodKey: "2026" }),
    make({
      id: "month",
      type: "monthly",
      title: "Ay",
      goalParentId: "year",
      periodKey: "2026-11",
    }),
    make({
      id: "week",
      type: "weekly",
      title: "Hafta",
      goalParentId: "month",
      periodKey: "2026-W46",
      status: "in_progress",
    }),
    make({
      id: "job",
      title: "Günlük çıktı",
      parentId: "week",
      workContext: "",
      status: "in_progress",
      dueDate: "2026-11-10",
      sourceDate: "2026-11-01",
      priority: "high",
      description: "Not korunur.",
      nextAction: "Eski adım",
      waitingReason: "Eski bekleme bilgisi",
      owner: "Kişisel sahip",
      focusDate: "2026-11-09",
      sourceFields: {
        __followupSource: { recordId: "meeting", type: "meeting" },
        retained: { values: [1, 2, "üç"] },
      },
      workLog: [
        {
          id: "saved-session",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 35_789,
          note: "Gerçek çalışma",
          nextAction: "Oturum adımı",
        },
      ],
    }),
    make({
      id: "meeting",
      type: "meeting",
      title: "Kaynak karar",
      decision: "Karar korunur.",
    }),
    make({
      id: "other-week",
      type: "weekly",
      title: "Başka hedef",
      periodKey: "2026-W46",
    }),
    make({ id: "unrelated", title: "İlişkisiz iş", workContext: "ad_hoc" }),
  ];
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("unlinking daily work changes only its parent, context and timestamp while every other field stays intact", () => {
  const rows = freeze(fixture());
  const before = structuredClone(rows);
  const changed = unlinkGoalChild(rows, "week", "job", { updatedAt: NOW });
  assert.deepEqual(changed[3], {
    ...rows[3],
    parentId: null,
    workContext: "ad_hoc",
    updatedAt: NOW,
  });
  assert.equal(changed[3].sourceFields, rows[3].sourceFields);
  assert.equal(changed[3].workLog, rows[3].workLog);
  for (const index of [0, 1, 2, 4, 5, 6])
    assert.equal(changed[index], rows[index]);
  assert.deepEqual(rows, before);
});

test("unlinking weekly and monthly subgoals preserves their type, context, metrics and own children", () => {
  for (const [parentId, childId] of [
    ["month", "week"],
    ["year", "month"],
  ]) {
    const rows = fixture();
    const index = rows.findIndex((record) => record.id === childId);
    rows[index] = make({
      ...rows[index],
      targetValue: 7,
      currentValue: 2,
      metric: "Rapor",
      status: "completed",
    });
    const before = structuredClone(rows);
    const changed = unlinkGoalChild(rows, parentId, childId, {
      updatedAt: NOW,
    });
    assert.deepEqual(changed[index], {
      ...rows[index],
      goalParentId: null,
      updatedAt: NOW,
    });
    assert.equal(changed[3], rows[3]);
    assert.deepEqual(rows, before);
  }
});

test("detaching historical work never reopens it or changes the parent's manually chosen status", () => {
  for (const status of ["completed", "cancelled", "transferred"]) {
    const rows = fixture();
    rows[2] = make({ ...rows[2], status: "completed" });
    rows[3] = make({ ...rows[3], status });
    const changed = unlinkGoalChild(rows, "week", "job", { updatedAt: NOW });
    assert.equal(changed[3].status, status);
    assert.equal(changed[2], rows[2]);
    assert.equal(goalProgress(changed[2], changed).percent, 100);
  }
});

test("derived progress changes with the relationship while saved parent and child statuses do not", () => {
  const rows = fixture();
  rows[3] = make({ ...rows[3], status: "completed" });
  rows.push(make({ id: "open-job", title: "Açık adım", parentId: "week" }));
  assert.equal(goalProgress(rows[2], rows).percent, 50);
  const changed = unlinkGoalChild(rows, "week", "job", { updatedAt: NOW });
  assert.equal(goalProgress(changed[2], changed).percent, 0);
  assert.equal(changed[2].status, "in_progress");
  assert.equal(changed[3].status, "completed");
});

test("latest unrelated edits are retained and an already detached relationship is a reference-preserving no-op", () => {
  const rows = fixture();
  rows[3] = make({
    ...rows[3],
    title: "Başka pencerede güncel başlık",
    description: "Güncel not",
    priority: "urgent",
  });
  const changed = unlinkGoalChild(rows, "week", "job", { updatedAt: NOW });
  assert.equal(changed[3].title, rows[3].title);
  assert.equal(changed[3].description, rows[3].description);
  assert.equal(changed[3].priority, "urgent");
  assert.equal(
    unlinkGoalChild(changed, "week", "job", { updatedAt: NOW }),
    changed,
  );
  const goals = unlinkGoalChild(rows, "month", "week", { updatedAt: NOW });
  assert.equal(
    unlinkGoalChild(goals, "month", "week", { updatedAt: NOW }),
    goals,
  );
});

test("stale or reparented relationships fail without detaching work from its new parent", () => {
  const rows = fixture();
  rows[3] = make({
    ...rows[3],
    parentId: "other-week",
    description: "Yeni bağlantıda korunur",
  });
  const before = structuredClone(rows);
  assert.throws(
    () => unlinkGoalChild(rows, "week", "job", { updatedAt: NOW }),
    /bağlantısı değişti/,
  );
  rows[3] = make({ ...rows[3], parentId: "", workContext: "" });
  assert.throws(
    () => unlinkGoalChild(rows, "week", "job", { updatedAt: NOW }),
    /bağlantısı değişti/,
  );
  assert.deepEqual({ ...rows[3], parentId: before[3].parentId }, before[3]);
});

test("invalid hierarchy, missing or ambiguous IDs and invalid timestamps reject before changing records", () => {
  const rows = freeze(fixture());
  const before = structuredClone(rows);
  for (const [parentId, childId] of [
    ["month", "job"],
    ["job", "week"],
    ["week", "week"],
    ["missing", "job"],
    ["week", "missing"],
    ["week", "meeting"],
  ])
    assert.throws(() =>
      unlinkGoalChild(rows, parentId, childId, { updatedAt: NOW }),
    );
  assert.throws(() =>
    unlinkGoalChild([...rows, rows[3]], "week", "job", { updatedAt: NOW }),
  );
  for (const updatedAt of [
    undefined,
    "",
    "invalid",
    "2026-02-30T10:00:00.000Z",
    "2026-11-09",
  ])
    assert.throws(
      () => unlinkGoalChild(rows, "week", "job", { updatedAt }),
      /geçerli bir zaman/,
    );
  assert.deepEqual(rows, before);
});

test("unlink persists as one atomic transaction, failed writes preserve it and reload Undo restores exact original bytes", () => {
  const rows = fixture();
  const key = "goal-unlink-native";
  const originalRaw = JSON.stringify({
    version: 1,
    records: rows,
    odak: { version: 1, preferences: { density: "comfortable" }, history: [] },
  });
  const values = new Map([[key, originalRaw]]);
  let fail = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) {
        const error = new Error("Full");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, value);
    },
  };
  let store = createWorkspaceStore({ storage, key });
  const changed = unlinkGoalChild(store.records, "week", "job", {
    updatedAt: NOW,
  });
  fail = true;
  assert.throws(() =>
    store.saveRecords(changed, "Hedef bağlantısını kaldırma"),
  );
  assert.equal(values.get(key), originalRaw);
  assert.deepEqual(store.records, rows);
  assert.equal(store.history.length, 0);
  fail = false;
  store.saveRecords(changed, "Hedef bağlantısını kaldırma");
  assert.equal(store.history.length, 1);
  assert.deepEqual(store.records, changed);
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.undo(), "Hedef bağlantısını kaldırma");
  assert.equal(values.get(key), originalRaw);
  assert.deepEqual(store.records, rows);
});
