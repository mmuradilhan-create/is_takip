import test from "node:test";
import assert from "node:assert/strict";
import { proposeGoalLinks, applyGoalLinks } from "../src/goal-link-review.js";
import { createRecord, validateStore, goalProgress } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const TODAY = "2026-11-07";
const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-07T10:00:00.000Z";
const record = (id, type, input = {}) =>
  createRecord({
    id,
    type,
    title: id,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const goal = (id, input = {}) =>
  record(id, "weekly", {
    title: "BİRİM Test Planı",
    periodKey: "2026-W46",
    ...input,
  });
const change = (recordId, fromParentId, toParentId) => ({
  recordId,
  fromParentId,
  toParentId,
});
function fixture() {
  return [
    goal("old", { status: "transferred", periodKey: "2026-W37" }),
    goal("new", { targetValue: 10, currentValue: 2, metric: "Rapor" }),
    record("first", "daily", {
      title: "Farklı başlıklı bir günlük adım",
      parentId: "old",
      dueDate: "2026-11-10",
      priority: "high",
      focusDate: TODAY,
      sourceFields: { retained: { value: [1, 2] } },
      workLog: [
        {
          id: "session",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 1000,
          note: "Gerçek çalışma",
          nextAction: "Sonraki adım",
        },
      ],
    }),
    record("second", "daily", {
      title: "İkinci planlı adım",
      parentId: "old",
      status: "waiting",
      waitingReason: "Yanıt bekleniyor",
    }),
  ];
}

test("review uses the former goal's exact normalized Turkish title and returns original references without edits", () => {
  const rows = fixture();
  rows[0].title = "  BİRİM   TEST\tPLANI  ";
  rows[1].title = "birim test planı";
  const before = structuredClone(rows);
  const review = proposeGoalLinks(rows, { today: TODAY });
  assert.equal(review.length, 2);
  for (const entry of review) {
    assert.equal(entry.previousGoal, rows[0]);
    assert.equal(entry.suggestedGoal, rows[1]);
    assert.deepEqual(entry.candidates, [rows[1]]);
    assert.equal(
      entry.record,
      rows.find((r) => r.id === entry.record.id),
    );
  }
  assert.deepEqual(rows, before);
  assert.deepEqual(
    proposeGoalLinks(rows, { today: TODAY, query: "İKİNCİ" }).map(
      (e) => e.record.id,
    ),
    ["second"],
  );
  assert.deepEqual(
    proposeGoalLinks(rows, { today: TODAY, query: "olmayan" }),
    [],
  );
});

test("two current or future exact matches remain ambiguous and similar or unknown-period goals are never guessed", () => {
  const rows = fixture();
  const later = goal("later", { periodKey: "2027-W20" });
  const similar = goal("similar", { title: "BİRİM Test Planı revizyonu" });
  const previous = goal("previous", { periodKey: "2026-W44" });
  const unknown = goal("unknown", { periodKey: "", dueDate: "" });
  const review = proposeGoalLinks(
    [...rows, later, similar, previous, unknown],
    { today: TODAY },
  );
  assert.equal(review[0].suggestedGoal, null);
  assert.deepEqual(review[0].candidates, [rows[1], later]);
  const noMatch = proposeGoalLinks(
    [rows[0], rows[2], similar, previous, unknown],
    { today: TODAY },
  );
  assert.equal(noMatch.length, 1);
  assert.equal(noMatch[0].suggestedGoal, null);
  assert.deepEqual(noMatch[0].candidates, []);
});

test("candidate periods use valid explicit weeks first and valid deadline fallback across year boundaries", () => {
  const rows = fixture();
  const target = goal("future-explicit", {
    periodKey: "2027-W01",
    dueDate: "2026-01-01",
  });
  const fallback = goal("date-fallback", {
    periodKey: "2025-W53",
    dueDate: "2026-11-07",
  });
  const past = goal("past-explicit", {
    periodKey: "2026-W44",
    dueDate: "2027-01-01",
  });
  const invalid = {
    ...goal("invalid-date", { periodKey: "" }),
    dueDate: "2026-02-30",
  };
  const review = proposeGoalLinks(
    [rows[0], rows[2], target, fallback, past, invalid],
    { today: TODAY },
  );
  assert.deepEqual(review[0].candidates, [target, fallback]);
  assert.equal(review[0].suggestedGoal, null);
  assert.equal(
    proposeGoalLinks([rows[0], rows[2], target], { today: "2026-12-31" })[0]
      .suggestedGoal,
    target,
  );
});

test("only active linked daily work with a closed or missing weekly parent needs review", () => {
  const rows = fixture();
  const extras = [
    record("done", "daily", { parentId: "old", status: "completed" }),
    record("cancelled", "daily", { parentId: "old", status: "cancelled" }),
    record("transferred", "daily", { parentId: "old", status: "transferred" }),
    { ...record("adhoc", "daily", { workContext: "ad_hoc" }), parentId: "old" },
    record("unbound", "daily"),
    record("current-parent", "daily", { parentId: "new" }),
    record("missing-parent", "daily", { parentId: "missing" }),
    record("non-daily", "meeting"),
  ];
  const review = proposeGoalLinks([...rows, ...extras], { today: TODAY });
  assert.deepEqual(
    review.map((e) => e.record.id),
    ["first", "second", "missing-parent"],
  );
  assert.equal(review[2].previousGoal, null);
  assert.equal(review[2].suggestedGoal, null);
  for (const status of ["completed", "cancelled", "transferred"]) {
    const former = { ...rows[0], status };
    assert.equal(
      proposeGoalLinks([former, rows[1], rows[2]], { today: TODAY }).length,
      1,
    );
  }
  assert.throws(() => proposeGoalLinks(null, { today: TODAY }), /liste/);
  assert.throws(() => proposeGoalLinks(rows, { today: "2026-02-30" }));
});

test("explicit batch relinking changes only parent and activity timestamp while measured progress and stored contexts stay intact", () => {
  const rows = fixture();
  const before = structuredClone(rows);
  const progress = goalProgress(rows[1], rows);
  const changed = applyGoalLinks(
    rows,
    [change("first", "old", "new"), change("second", "old", "new")],
    { now: new Date(NOW) },
  );
  assert.notEqual(changed, rows);
  assert.equal(changed[0], rows[0]);
  assert.equal(changed[1], rows[1]);
  for (let i = 2; i < rows.length; i++) {
    assert.equal(changed[i].parentId, "new");
    assert.equal(changed[i].updatedAt, NOW);
    assert.deepEqual(
      {
        ...changed[i],
        parentId: rows[i].parentId,
        updatedAt: rows[i].updatedAt,
      },
      rows[i],
    );
    assert.equal(changed[i].sourceFields, rows[i].sourceFields);
    assert.equal(changed[i].workLog, rows[i].workLog);
  }
  assert.deepEqual(goalProgress(changed[1], changed), progress);
  assert.deepEqual(
    validateStore({ version: 1, records: changed }).records,
    changed,
  );
  assert.deepEqual(rows, before);
  assert.equal(applyGoalLinks(rows, [], { now: "unused" }), rows);
  assert.equal(
    applyGoalLinks(changed, [change("first", "new", "new")], { now: "unused" }),
    changed,
  );
});

test("a stale or invalid member rejects the complete batch before any mutation", () => {
  const rows = fixture();
  const before = structuredClone(rows);
  const valid = change("first", "old", "new");
  for (const invalid of [
    change("second", "stale", "new"),
    change("missing", "old", "new"),
    change("second", "old", "old"),
    change("second", "old", "first"),
    change("second", "old", "missing"),
    change("new", null, "old"),
    { recordId: "second", toParentId: "new" },
    change("second", undefined, "new"),
    change("second", "old", null),
  ])
    assert.throws(() => applyGoalLinks(rows, [valid, invalid], { now: NOW }));
  assert.throws(
    () => applyGoalLinks(rows, [valid, valid], { now: NOW }),
    /birden fazla/,
  );
  assert.throws(
    () => applyGoalLinks([...rows, rows[0]], [valid], { now: NOW }),
    /Tekrarlanan/,
  );
  for (const now of [
    "invalid",
    "2026-02-30T10:00:00Z",
    "2026-11-07T24:00:00Z",
    new Date(NaN),
    null,
  ])
    assert.throws(
      () => applyGoalLinks(rows, [valid], { now }),
      /zamanı geçersiz/,
    );
  for (const status of ["completed", "cancelled", "transferred"])
    assert.throws(() =>
      applyGoalLinks(
        rows.map((r) => (r.id === "first" ? { ...r, status } : r)),
        [valid],
        { now: NOW },
      ),
    );
  assert.throws(() =>
    applyGoalLinks(
      rows.map((r) => (r.id === "first" ? { ...r, workContext: "ad_hoc" } : r)),
      [valid],
      { now: NOW },
    ),
  );
  assert.throws(() => applyGoalLinks(null, [valid], { now: NOW }), /liste/);
  assert.throws(() => applyGoalLinks(rows, null, { now: NOW }), /liste/);
  assert.deepEqual(rows, before);
});

test("manual explicit selections may target any open weekly goal without fuzzy automatic suggestions", () => {
  const rows = fixture();
  const older = goal("manual", {
    title: "Başka açık hedef",
    periodKey: "2026-W40",
  });
  const changed = applyGoalLinks(
    [...rows, older],
    [change("first", "old", "manual")],
    { now: "2026-11-07T13:00:00+03:00" },
  );
  assert.equal(changed[2].parentId, "manual");
  assert.equal(changed[2].updatedAt, NOW);
});

test("relinking is one durable native transaction and reload Undo restores both original links exactly", () => {
  const rows = fixture();
  const key = "goal-review-undo";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: rows })],
  ]);
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
  const originalRaw = values.get(key);
  assert.equal(proposeGoalLinks(store.records, { today: TODAY }).length, 2);
  assert.equal(values.get(key), originalRaw);
  const changed = applyGoalLinks(
    store.records,
    [change("first", "old", "new"), change("second", "old", "new")],
    { now: NOW },
  );
  fail = true;
  assert.throws(() =>
    store.saveRecords(changed, "Hedef bağlantılarını güncelle"),
  );
  assert.equal(values.get(key), originalRaw);
  assert.deepEqual(store.records, rows);
  assert.equal(store.canUndo, false);
  fail = false;
  store.saveRecords(changed, "Hedef bağlantılarını güncelle");
  const backup = JSON.parse(
    JSON.stringify({ version: 1, records: store.records }),
  );
  assert.deepEqual(validateStore(backup).records, changed);
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.history.length, 1);
  assert.equal(store.undo(), "Hedef bağlantılarını güncelle");
  assert.deepEqual(store.records, rows);
});
