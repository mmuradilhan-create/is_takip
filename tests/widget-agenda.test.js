import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { widgetAgenda } from "../src/widget-agenda-model.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const today = new Date(2026, 10, 7, 23, 30);
const record = (id, input = {}) =>
  createRecord({ id, title: id, createdAt: STAMP, updatedAt: STAMP, ...input });
const ids = (agenda) => agenda.entries.map(({ record }) => record.id);
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test("today and tomorrow select real calendar channels in their existing priority order without changing saved records or the supplied date", () => {
  const source = record("routed-meeting", {
    type: "meeting",
    dueDate: "2026-11-07",
  });
  const records = freeze([
    record("waiting-today", {
      type: "waiting",
      dueDate: "2026-11-08",
      nextFollowUpDate: "2026-11-07",
      priority: "urgent",
    }),
    record("weekly-today", { type: "weekly", dueDate: "2026-11-07" }),
    record("meeting-today", {
      type: "meeting",
      dueDate: "2026-11-07",
      priority: "high",
    }),
    record("daily-today", { dueDate: "2026-11-07", priority: "urgent" }),
    record("monthly-tomorrow", { type: "monthly", dueDate: "2026-11-08" }),
    record("waiting-tomorrow", {
      type: "waiting",
      dueDate: "2026-11-07",
      nextFollowUpDate: "2026-11-08",
    }),
    record("daily-tomorrow", { dueDate: "2026-11-08", priority: "high" }),
    source,
    record("routed-target", {
      dueDate: "2026-11-08",
      priority: "low",
      sourceFields: {
        __followupSource: { recordId: source.id, type: "meeting" },
      },
    }),
    record("yearly-date", {
      type: "yearly",
      dueDate: "2026-11-07",
      periodKey: "2026",
    }),
    record("period-only", { type: "weekly", periodKey: "2026-W45" }),
    record("focus-only", { focusDate: "2026-11-07" }),
    record("waiting-due-only", { type: "waiting", dueDate: "2026-11-07" }),
    record("closed", { dueDate: "2026-11-07", status: "completed" }),
    record("overdue", { dueDate: "2026-11-06", priority: "urgent" }),
  ]);
  const before = JSON.stringify(records);
  const dateBefore = today.getTime();
  const current = widgetAgenda(records, today);
  assert.deepEqual(ids(current), [
    "daily-today",
    "weekly-today",
    "waiting-today",
  ]);
  assert.deepEqual(
    current.entries.map(({ kind }) => kind),
    ["due", "due", "followup"],
  );
  assert.equal(current.today, "2026-11-07");
  assert.equal(current.tomorrow, "2026-11-08");
  assert.equal(current.selectedDate, current.today);
  assert.equal(current.todayCount, 3);
  assert.equal(current.tomorrowCount, 4);
  const next = widgetAgenda(records, today, { dayOffset: 1 });
  assert.deepEqual(ids(next), [
    "daily-tomorrow",
    "monthly-tomorrow",
    "routed-target",
    "waiting-tomorrow",
  ]);
  assert.equal(next.selectedDate, next.tomorrow);
  assert.equal(next.todayCount, current.todayCount);
  assert.equal(next.tomorrowCount, current.tomorrowCount);
  for (const entry of [...current.entries, ...next.entries])
    assert.equal(
      entry.record,
      records.find((record) => record.id === entry.record.id),
    );
  assert.equal(today.getTime(), dateBefore);
  assert.equal(JSON.stringify(records), before);
});

test("a busy day retains every entry so a scrolling widget can reach beyond the old three-item summary", () => {
  const records = freeze(
    Array.from({ length: 37 }, (_, index) =>
      record(`day-${String(index).padStart(2, "0")}`, {
        dueDate: "2026-11-08",
      }),
    ),
  );
  const current = widgetAgenda(records, today);
  const next = widgetAgenda(records, today, { dayOffset: 1 });
  assert.equal(current.todayCount, 0);
  assert.equal(current.tomorrowCount, 37);
  assert.deepEqual(current.entries, []);
  assert.equal(next.entries.length, 37);
  assert.equal(next.entries.at(-1).record, records.at(-1));
});

test("relative days cross month, leap-day and year boundaries using the input's local calendar date", () => {
  for (const [date, expectedToday, expectedTomorrow] of [
    [new Date(2026, 3, 30, 23, 59), "2026-04-30", "2026-05-01"],
    [new Date(2024, 1, 28, 23, 59), "2024-02-28", "2024-02-29"],
    [new Date(2024, 1, 29, 23, 59), "2024-02-29", "2024-03-01"],
    [new Date(2026, 1, 28, 23, 59), "2026-02-28", "2026-03-01"],
    [new Date(2026, 11, 31, 23, 59), "2026-12-31", "2027-01-01"],
  ]) {
    const before = date.getTime();
    const agenda = widgetAgenda([], date, { dayOffset: 1 });
    assert.equal(agenda.today, expectedToday);
    assert.equal(agenda.tomorrow, expectedTomorrow);
    assert.equal(agenda.selectedDate, expectedTomorrow);
    assert.equal(date.getTime(), before);
  }
});

test("local day selection stays correct across DST transitions and when UTC belongs to a different calendar day", () => {
  const cases = [
    [
      "America/New_York",
      [
        [2026, 2, 7, 23, 30],
        [2026, 10, 1, 0, 30],
      ],
      [
        ["2026-03-07", "2026-03-08"],
        ["2026-11-01", "2026-11-02"],
      ],
    ],
    [
      "Pacific/Auckland",
      [[2026, 11, 31, 0, 30]],
      [["2026-12-31", "2027-01-01"]],
    ],
  ];
  const originalTimezone = process.env.TZ;
  try {
    // This test stays synchronous and restores TZ before another test can run.
    for (const [timezone, inputs, expected] of cases) {
      process.env.TZ = timezone;
      const result = inputs.map((parts) => {
        const date = new Date(...parts);
        const before = date.getTime();
        const agenda = widgetAgenda([], date, { dayOffset: 1 });
        return [
          agenda.today,
          agenda.tomorrow,
          agenda.selectedDate,
          date.getTime() === before,
        ];
      });
      assert.deepEqual(
        result,
        expected.map(([current, next]) => [current, next, next, true]),
        timezone,
      );
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("only numeric tomorrow offset selects the next day and unsupported offsets safely use today", () => {
  const records = freeze([
    record("current", { dueDate: "2026-11-07" }),
    record("next", { dueDate: "2026-11-08" }),
  ]);
  for (const dayOffset of [
    undefined,
    null,
    false,
    true,
    -1,
    0,
    2,
    1.5,
    NaN,
    Infinity,
    "1",
    {},
    [],
  ]) {
    const agenda = widgetAgenda(records, today, freeze({ dayOffset }));
    assert.equal(agenda.dayOffset, 0);
    assert.equal(agenda.selectedDate, "2026-11-07");
    assert.deepEqual(ids(agenda), ["current"]);
    assert.equal(agenda.todayCount, 1);
    assert.equal(agenda.tomorrowCount, 1);
  }
  assert.equal(widgetAgenda(records, today, { dayOffset: 1 }).dayOffset, 1);
});

test("invalid clock dates and record containers fail explicitly without creating a synthetic day", () => {
  for (const date of [new Date(NaN), null, "2026-11-07", 0, {}])
    assert.throws(() => widgetAgenda([], date), /geçerli bir tarih/);
  for (const records of [null, {}, undefined])
    assert.throws(() => widgetAgenda(records, today), /kayıt listesi/);
});
