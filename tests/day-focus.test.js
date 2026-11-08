import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { selectDayFocus, toggleDayFocus } from "../src/day-focus.js";

const TODAY = "2026-11-07";
const STAMP = "2026-11-01T09:00:00.000Z";
const EDITED_AT = "2026-11-07T10:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const focused = (id, input = {}) => record(id, { focusDate: TODAY, ...input });
const ids = (items) => items.map((item) => item.id);

test("today's focus includes only active daily selections and retains the fixed current-work order", () => {
  const running = focused("running", {
    dueDate: "2026-11-20",
    priority: "low",
  });
  const records = [
    focused("today", { dueDate: TODAY, priority: "urgent" }),
    focused("overdue", { dueDate: "2026-11-06", priority: "low" }),
    running,
    record("not-selected", { dueDate: TODAY }),
    focused("yesterday", { focusDate: "2026-11-06" }),
    focused("tomorrow", { focusDate: "2026-11-08" }),
    ...["weekly", "monthly", "yearly", "meeting", "waiting"].map((type) =>
      focused(type, { type }),
    ),
    ...["completed", "cancelled", "transferred"].map((status) =>
      focused(status, { status }),
    ),
  ];
  const result = selectDayFocus(records, {
    today: TODAY,
    runningRecordId: "running",
  });
  assert.deepEqual(ids(result), ["running", "overdue", "today"]);
  assert.equal(result[0], running);
  assert.deepEqual(ids(selectDayFocus(records, { today: TODAY })), [
    "overdue",
    "today",
    "running",
  ]);
  const future = [
    focused("undated", { priority: "urgent" }),
    focused("future-low", { dueDate: "2026-11-08", priority: "low" }),
    focused("future-high", { dueDate: "2026-11-10", priority: "high" }),
  ];
  assert.deepEqual(ids(selectDayFocus(future, { today: TODAY })), [
    "future-high",
    "future-low",
    "undated",
  ]);
});

test("Turkish search narrows focus without injecting a hidden running record or consuming fewer global slots", () => {
  const records = [
    focused("found", { title: "İPEK için raporu incele" }),
    focused("other"),
    focused("running"),
    record("fourth", { title: "İPEK için yeni iş" }),
  ];
  assert.deepEqual(
    ids(
      selectDayFocus(records, {
        today: TODAY,
        query: " ipek ",
        runningRecordId: "running",
      }),
    ),
    ["found"],
  );
  const before = structuredClone(records);
  assert.throws(
    () => toggleDayFocus(records, "fourth", { today: TODAY, now: EDITED_AT }),
    /3|üç/i,
  );
  assert.deepEqual(records, before);
  const removed = toggleDayFocus(records, "other", {
    today: TODAY,
    now: EDITED_AT,
  });
  assert.equal(removed[1].focusDate, null);
  const added = toggleDayFocus(removed, "fourth", {
    today: TODAY,
    now: EDITED_AT,
  });
  assert.equal(added[3].focusDate, TODAY);
  assert.equal(selectDayFocus(added, { today: TODAY }).length, 3);
});

test("closed selections keep their history while freeing slots and selections from prior days never reset automatically", () => {
  const records = [
    focused("first"),
    focused("second"),
    ...["completed", "cancelled", "transferred"].map((status) =>
      focused(status, { status }),
    ),
    focused("past", { focusDate: "2026-11-06" }),
    record("next"),
  ];
  const before = structuredClone(records);
  const added = toggleDayFocus(records, "next", {
    today: TODAY,
    now: EDITED_AT,
  });
  assert.deepEqual(ids(selectDayFocus(added, { today: TODAY })).sort(), [
    "first",
    "next",
    "second",
  ]);
  for (let index = 0; index < records.length - 1; index++)
    assert.equal(added[index], records[index]);
  assert.deepEqual(selectDayFocus(added, { today: "2026-11-08" }), []);
  assert.equal(added[5].focusDate, "2026-11-06");
  assert.deepEqual(records, before);
  const nextDay = toggleDayFocus(added, "past", {
    today: "2026-11-08",
    now: "2026-11-08T09:00:00.000Z",
  });
  assert.equal(nextDay[5].focusDate, "2026-11-08");
  assert.equal(nextDay[0].focusDate, TODAY);
  assert.equal(nextDay[2].focusDate, TODAY);
  assert.deepEqual(ids(selectDayFocus(nextDay, { today: "2026-11-08" })), [
    "past",
  ]);
});

test("selection and removal replace only focusDate and the saved update timestamp while preserving task content and record references", () => {
  const target = record("target", {
    status: "waiting",
    priority: "high",
    dueDate: "2026-11-10",
    parentId: "weekly-goal",
    goalParentId: null,
    waitingReason: "Tasarım yanıtı bekleniyor.",
    nextAction: "Sorumlu kişiyle görüş.",
    description: "Gerçek iş notu korunmalı.",
    sourceFields: { "Özgün değer": { value: "Korunacak veri" } },
    workLog: [
      {
        id: "log",
        date: "2026-11-01",
        endedAt: "2026-11-01T09:00:00.000Z",
        durationMs: 60_000,
        note: "İnceleme yapıldı.",
        nextAction: "Yanıtı bekle.",
      },
    ],
  });
  const sibling = record("sibling");
  const records = [target, sibling];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  assert.equal(Object.hasOwn(target, "focusDate"), false);
  const added = toggleDayFocus(records, target.id, {
    today: TODAY,
    now: new Date(EDITED_AT),
  });
  assert.notEqual(added, records);
  assert.notEqual(added[0], target);
  assert.equal(added[1], sibling);
  assert.equal(added[0].focusDate, TODAY);
  assert.equal(added[0].updatedAt, EDITED_AT);
  const { focusDate, ...savedFields } = added[0];
  assert.deepEqual({ ...savedFields, updatedAt: target.updatedAt }, target);
  const removed = toggleDayFocus(added, target.id, {
    today: TODAY,
    now: "2026-11-07T13:00:00+03:00",
  });
  assert.equal(removed[0].focusDate, null);
  assert.equal(removed[0].updatedAt, EDITED_AT);
  const { focusDate: cleared, ...restoredFields } = removed[0];
  assert.deepEqual({ ...restoredFields, updatedAt: target.updatedAt }, target);
  assert.deepEqual(records, before);
});

test("invalid targets, dates and update timestamps fail without changing a saved focus plan", () => {
  const records = [
    record("daily"),
    record("weekly", { type: "weekly" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      focused(status, { status }),
    ),
  ];
  const before = structuredClone(records);
  for (const id of [
    "missing",
    "weekly",
    "completed",
    "cancelled",
    "transferred",
  ])
    assert.throws(() =>
      toggleDayFocus(records, id, { today: TODAY, now: EDITED_AT }),
    );
  for (const today of [
    "",
    "2026-2-01",
    "2026-02-30",
    "0000-01-01",
    "2026-11-07T00:00:00Z",
    null,
  ]) {
    assert.throws(() => selectDayFocus(records, { today }));
    assert.throws(() =>
      toggleDayFocus(records, "daily", { today, now: EDITED_AT }),
    );
  }
  for (const now of [
    "invalid",
    "2026-02-30T09:00:00.000Z",
    "2026-11-07T25:00:00.000Z",
    "2026-11-07",
    new Date(NaN),
    null,
  ])
    assert.throws(() =>
      toggleDayFocus(records, "daily", { today: TODAY, now }),
    );
  assert.deepEqual(records, before);
});

test("reading a frozen focus plan preserves source ordering and saved record identities", () => {
  const records = [
    focused("z", { title: "Zor iş" }),
    focused("a", { title: "Araştırma" }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectDayFocus(records, { today: TODAY });
  assert.deepEqual(ids(result), ["a", "z"]);
  assert.equal(result[0], records[1]);
  assert.equal(result[1], records[0]);
  assert.deepEqual(records, before);
});
