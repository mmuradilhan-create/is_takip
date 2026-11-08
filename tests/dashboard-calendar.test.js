import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, goalProgress } from "../src/model.js";
import {
  calendarEntries,
  buildCalendarMonth,
  buildCalendarWeek,
} from "../src/calendar-model.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const ids = (entries) => entries.map((entry) => entry.record.id);

test("calendar channels use only saved deadlines or waiting follow-up dates without inventing dates from goal periods", () => {
  const records = [
    record("daily", { dueDate: "2026-11-09" }),
    record("weekly", {
      type: "weekly",
      periodKey: "2026-W46",
      dueDate: "2026-11-08",
    }),
    record("monthly", {
      type: "monthly",
      periodKey: "2026-12",
      dueDate: "2026-11-07",
    }),
    record("yearly", {
      type: "yearly",
      periodKey: "2027",
      dueDate: "2026-11-10",
    }),
    record("meeting", { type: "meeting", dueDate: "2026-11-11" }),
    record("waiting", {
      type: "waiting",
      dueDate: "2026-01-01",
      nextFollowUpDate: "2026-11-12",
    }),
    ...["weekly", "monthly", "yearly"].map((type) =>
      record(`period-only-${type}`, {
        type,
        periodKey: { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[
          type
        ],
      }),
    ),
    record("waiting-due-only", { type: "waiting", dueDate: "2026-11-07" }),
    record("focus-only", { focusDate: "2026-11-07" }),
  ];
  const result = calendarEntries(records);
  assert.deepEqual(ids(result), ["monthly", "weekly", "daily", "waiting"]);
  assert.deepEqual(
    result.map(({ date, kind }) => [date, kind]),
    [
      ["2026-11-07", "due"],
      ["2026-11-08", "due"],
      ["2026-11-09", "due"],
      ["2026-11-12", "followup"],
    ],
  );
});

test("legacy annual dates stay in saved records while calendar entries include only their dated monthly and daily work", () => {
  const annual = record("legacy-annual", {
    type: "yearly",
    title: "Senelik ölçüm hedefi",
    periodKey: "2026",
    dueDate: "2026-11-08",
    targetValue: 20,
    currentValue: 7,
    metric: "Rapor",
    sourceFields: { original: { value: "Tarih ve ilerleme korunur" } },
  });
  const monthly = record("dated-monthly", {
    type: "monthly",
    periodKey: "2026-11",
    goalParentId: annual.id,
    dueDate: "2026-11-09",
  });
  const daily = record("dated-daily", { dueDate: "2026-11-08" });
  const records = [annual, monthly, daily];
  const before = JSON.stringify(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const entries = calendarEntries(records);
  assert.deepEqual(ids(entries), [daily.id, monthly.id]);
  assert.equal(entries[0].record, daily);
  assert.equal(entries[1].record, monthly);
  assert.deepEqual(calendarEntries(records, { query: annual.title }), []);
  assert.equal(annual.dueDate, "2026-11-08");
  assert.equal(annual.periodKey, "2026");
  assert.equal(goalProgress(annual, records).percent, 35);
  assert.equal(JSON.stringify(records), before);
});

test("meeting dates stay historical context while only daily delivery and waiting reminders enter the calendar", () => {
  const source = record("meeting-history", {
    type: "meeting",
    sourceDate: "2026-11-02",
    dueDate: "2026-11-03",
    priority: "urgent",
    nextAction: "Toplantıdaki özgün adım korunur.",
    decision: "Test planı yapılacak.",
  });
  const waiting = record("waiting-history", {
    type: "waiting",
    dueDate: "2026-11-04",
    nextFollowUpDate: "2026-11-09",
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  });
  const daily = record("meeting-work", {
    dueDate: "2026-11-13",
    priority: "high",
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  });
  const rows = [source, waiting, daily];
  const before = JSON.stringify(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  assert.deepEqual(calendarEntries([source]), []);
  assert.deepEqual(
    calendarEntries(rows).map(({ record, date, kind }) => [
      record.id,
      date,
      kind,
    ]),
    [
      [waiting.id, "2026-11-09", "followup"],
      [daily.id, "2026-11-13", "due"],
    ],
  );
  assert.deepEqual(calendarEntries(rows, { query: source.title }), []);
  assert.equal(JSON.stringify(rows), before);
});

test("closed work and malformed date keys on plain historical objects stay out of the calendar", () => {
  const records = [
    ...["daily", "weekly", "monthly", "yearly", "meeting", "waiting"].flatMap(
      (type) =>
        ["completed", "cancelled", "transferred"].map((status) =>
          record(`${type}-${status}`, {
            type,
            status,
            dueDate: "2026-11-07",
            nextFollowUpDate: "2026-11-07",
          }),
        ),
    ),
    ...[
      "2026-02-30",
      "2026-2-01",
      "2026-11-07T00:00:00Z",
      "0000-01-01",
      "10000-01-01",
      "",
      null,
      undefined,
      20261107,
    ].flatMap((date, index) => [
      { ...record(`invalid-due-${index}`), dueDate: date },
      {
        ...record(`invalid-followup-${index}`, { type: "waiting" }),
        nextFollowUpDate: date,
      },
    ]),
  ];
  assert.deepEqual(calendarEntries(records), []);
});

test("meeting routes appear at their own destinations while external waiting topics remain independent of daily contact work", () => {
  const meeting = record("meeting", { type: "meeting", dueDate: "2026-11-07" });
  const waiting = record("waiting", {
    type: "waiting",
    dueDate: "2026-11-01",
    nextFollowUpDate: "2026-11-08",
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  const daily = record("daily", {
    title: "Aynı başlık",
    dueDate: "2026-11-09",
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  const contact = record("contact", {
    title: "Aynı başlık",
    dueDate: "2026-11-09",
    sourceFields: {
      __followupSource: { recordId: waiting.id, type: "waiting" },
    },
  });
  const invalid = record("invalid-meeting", {
    type: "meeting",
    dueDate: "2026-11-06",
  });
  const records = [
    meeting,
    waiting,
    daily,
    contact,
    invalid,
    ...["duplicate-a", "duplicate-b"].map((id) =>
      record(id, {
        sourceFields: {
          __followupSource: { recordId: invalid.id, type: "meeting" },
        },
      }),
    ),
  ];
  const result = calendarEntries(records);
  assert.deepEqual(ids(result), ["waiting", "contact", "daily"]);
  assert.equal(result[0].record, waiting);
  const closedDaily = { ...daily, status: "completed" };
  assert.deepEqual(ids(calendarEntries([meeting, closedDaily])), []);
});

test("calendar search is Turkish-aware and equal dates keep channel, priority, title and identifier ordering without writes", () => {
  const date = "2026-11-07";
  const records = [
    record("waiting", {
      type: "waiting",
      nextFollowUpDate: date,
      priority: "urgent",
      expectedFrom: "İPEK",
    }),
    record("tie-z", { title: "İPEK incelemesi", dueDate: date }),
    record("tie-a", { title: "İPEK incelemesi", dueDate: date }),
    record("urgent", {
      title: "Öncelikli kontrol",
      dueDate: date,
      priority: "urgent",
      projectCode: "İPEK",
    }),
    record("other", { dueDate: date }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = calendarEntries(records, { query: " ipek " });
  assert.deepEqual(ids(result), ["urgent", "tie-a", "tie-z", "waiting"]);
  assert.equal(result[1].record, records[2]);
  assert.deepEqual(calendarEntries(records, { query: "bulunmuyor" }), []);
  assert.deepEqual(records, before);
});

test("month grids start on Monday, include adjacent dates and use four to six full calendar weeks", () => {
  const february = buildCalendarMonth("2021-02-14");
  assert.equal(february.period.key, "2021-02");
  assert.equal(february.days.length, 28);
  assert.equal(february.days[0], "2021-02-01");
  assert.equal(february.days.at(-1), "2021-02-28");
  const leap = buildCalendarMonth("2024-02-29");
  assert.equal(leap.days.length, 35);
  assert.equal(leap.days[0], "2024-01-29");
  assert.equal(leap.days.at(-1), "2024-03-03");
  assert.ok(leap.days.includes("2024-02-29"));
  const six = buildCalendarMonth("2026-03-15");
  assert.equal(six.days.length, 42);
  assert.equal(six.days[0], "2026-02-23");
  assert.equal(six.days.at(-1), "2026-04-05");
});

test("weeks cross month and year boundaries by calendar date and grids guard the supported year range", () => {
  const week = buildCalendarWeek("2027-01-01");
  assert.equal(week.period.key, "2026-W53");
  assert.deepEqual(week.days, [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.deepEqual(buildCalendarWeek("2024-03-31").days, [
    "2024-03-25",
    "2024-03-26",
    "2024-03-27",
    "2024-03-28",
    "2024-03-29",
    "2024-03-30",
    "2024-03-31",
  ]);
  const first = buildCalendarMonth("0001-01-01");
  assert.equal(first.days[0], "0001-01-01");
  assert.ok(
    first.days.every(
      (date) => date === null || /^0001-\d{2}-\d{2}$/.test(date),
    ),
  );
  const last = buildCalendarMonth("9999-12-31");
  assert.equal(last.days.at(-1), null);
  assert.ok(last.days.includes("9999-12-31"));
  assert.deepEqual(buildCalendarWeek("9999-12-31").days.slice(-3), [
    "9999-12-31",
    null,
    null,
  ]);
  for (const date of [
    "",
    null,
    "2026-02-30",
    "2026-2-07",
    "0000-12-31",
    "10000-01-01",
    "2026-11-07T00:00:00Z",
  ]) {
    assert.throws(() => buildCalendarMonth(date));
    assert.throws(() => buildCalendarWeek(date));
  }
});
