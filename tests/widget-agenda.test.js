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

test("overdue uses only past open delivery and follow-up entries in calendar order and never mutates frozen work", () => {
  const records = freeze([
    record("waiting-past", {
      type: "waiting",
      nextFollowUpDate: "2026-11-06",
      dueDate: "2026-11-08",
      priority: "urgent",
    }),
    record("daily-past-normal", {
      dueDate: "2026-11-06",
      priority: "normal",
    }),
    record("daily-past-urgent", {
      dueDate: "2026-11-06",
      priority: "urgent",
    }),
    record("weekly-past", { type: "weekly", dueDate: "2026-11-05" }),
    record("monthly-oldest", { type: "monthly", dueDate: "2026-10-30" }),
    record("today", { dueDate: "2026-11-07" }),
    record("tomorrow", { dueDate: "2026-11-08" }),
    record("future", { dueDate: "2026-12-01" }),
    record("waiting-today", {
      type: "waiting",
      dueDate: "2026-10-01",
      nextFollowUpDate: "2026-11-07",
    }),
    record("waiting-tomorrow", {
      type: "waiting",
      nextFollowUpDate: "2026-11-08",
    }),
    record("meeting-legacy-date", {
      type: "meeting",
      dueDate: "2026-10-01",
    }),
    record("yearly-legacy-date", {
      type: "yearly",
      dueDate: "2026-10-01",
      periodKey: "2026",
    }),
    record("weekly-period-only", {
      type: "weekly",
      periodKey: "2026-W44",
    }),
    record("monthly-period-only", { type: "monthly", periodKey: "2026-10" }),
    record("dateless"),
    record("focus-only", { focusDate: "2026-11-06" }),
    record("waiting-due-only", { type: "waiting", dueDate: "2026-11-06" }),
    ...["completed", "cancelled", "transferred"].flatMap((status) => [
      record(`closed-delivery-${status}`, { dueDate: "2026-10-01", status }),
      record(`closed-followup-${status}`, {
        type: "waiting",
        nextFollowUpDate: "2026-10-01",
        status,
      }),
    ]),
    record("closed-source-copy", {
      dueDate: "2026-10-01",
      status: "completed",
      sourceFields: {
        __followupSource: { recordId: "meeting-legacy-date", type: "meeting" },
      },
    }),
  ]);
  const before = JSON.stringify(records);
  const dateBefore = today.getTime();
  const agenda = widgetAgenda(records, today, freeze({ view: "overdue" }));
  assert.deepEqual(ids(agenda), [
    "monthly-oldest",
    "weekly-past",
    "daily-past-urgent",
    "daily-past-normal",
    "waiting-past",
  ]);
  assert.equal(agenda.view, "overdue");
  assert.equal(agenda.dayOffset, 0);
  assert.equal(agenda.selectedDate, "2026-11-07");
  assert.equal(agenda.overdueCount, 5);
  assert.equal(agenda.todayCount, 2);
  assert.equal(agenda.tomorrowCount, 2);
  assert.equal(
    agenda.entries.filter(({ record }) => record.id === "waiting-past").length,
    1,
  );
  assert.equal(agenda.entries.at(-1).kind, "followup");
  assert.equal(agenda.entries.at(-1).date, "2026-11-06");
  for (const entry of agenda.entries)
    assert.equal(
      entry.record,
      records.find((record) => record.id === entry.record.id),
    );
  for (const view of ["today", "tomorrow", "overdue"])
    assert.equal(widgetAgenda(records, today, { view }).overdueCount, 5);
  assert.equal(today.getTime(), dateBefore);
  assert.equal(JSON.stringify(records), before);
});

test("explicit views select their channel while unsupported views retain the numeric day-offset API", () => {
  const records = freeze([
    record("past", { dueDate: "2026-11-06" }),
    record("current", { dueDate: "2026-11-07" }),
    record("next", { dueDate: "2026-11-08" }),
  ]);
  for (const [view, dayOffset, expectedId, expectedOffset] of [
    ["today", 1, "current", 0],
    ["tomorrow", 0, "next", 1],
    ["overdue", 1, "past", 0],
    ["unsupported", 1, "next", 1],
    [undefined, 1, "next", 1],
    [null, 0, "current", 0],
    [true, "1", "current", 0],
  ]) {
    const agenda = widgetAgenda(records, today, freeze({ view, dayOffset }));
    assert.deepEqual(ids(agenda), [expectedId]);
    assert.equal(agenda.dayOffset, expectedOffset);
    assert.equal(
      agenda.view,
      expectedId === "past" ? "overdue" : expectedOffset ? "tomorrow" : "today",
    );
    assert.equal(
      agenda.selectedDate,
      expectedOffset ? "2026-11-08" : "2026-11-07",
    );
    assert.equal(agenda.overdueCount, 1);
  }
  const empty = widgetAgenda([], today, { view: "overdue" });
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.overdueCount, 0);
});

test("overdue comparisons cross month, leap-day and year boundaries without fabricating period deadlines", () => {
  for (const [date, previous, current, next] of [
    [new Date(2026, 4, 1, 0, 1), "2026-04-30", "2026-05-01", "2026-05-02"],
    [new Date(2024, 2, 1, 0, 1), "2024-02-29", "2024-03-01", "2024-03-02"],
    [new Date(2027, 0, 1, 0, 1), "2026-12-31", "2027-01-01", "2027-01-02"],
  ]) {
    const before = date.getTime();
    const records = freeze([
      record("past", { dueDate: previous }),
      record("current", { dueDate: current }),
      record("next", { dueDate: next }),
      record("period-only", {
        type: "monthly",
        periodKey: previous.slice(0, 7),
      }),
    ]);
    const agenda = widgetAgenda(records, date, { view: "overdue" });
    assert.deepEqual(ids(agenda), ["past"]);
    assert.equal(agenda.today, current);
    assert.equal(agenda.tomorrow, next);
    assert.equal(agenda.selectedDate, current);
    assert.equal(agenda.overdueCount, 1);
    assert.equal(date.getTime(), before);
  }
});

test("overdue is relative to the local day at DST boundaries and when UTC is on yesterday", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const [timezone, parts, previous, current, next] of [
      [
        "America/New_York",
        [2026, 2, 8, 0, 30],
        "2026-03-07",
        "2026-03-08",
        "2026-03-09",
      ],
      [
        "America/New_York",
        [2026, 10, 1, 0, 30],
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
      ],
      [
        "Pacific/Auckland",
        [2027, 0, 1, 0, 30],
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
      ],
    ]) {
      process.env.TZ = timezone;
      const date = new Date(...parts);
      const records = freeze([
        record("past", { dueDate: previous }),
        record("past-followup", {
          type: "waiting",
          nextFollowUpDate: previous,
        }),
        record("current", { dueDate: current }),
        record("next", { dueDate: next }),
      ]);
      const agenda = widgetAgenda(records, date, { view: "overdue" });
      assert.deepEqual(ids(agenda), ["past", "past-followup"], timezone);
      assert.equal(agenda.selectedDate, current, timezone);
      assert.equal(agenda.todayCount, 1, timezone);
      assert.equal(agenda.tomorrowCount, 1, timezone);
      assert.equal(agenda.overdueCount, 2, timezone);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
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
