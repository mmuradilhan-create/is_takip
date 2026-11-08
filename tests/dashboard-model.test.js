import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import {
  openDaily,
  selectFocus,
  selectCurrentWork,
  dashboardAgendaSummary,
  dashboardDailyStats,
  selectOverview,
} from "../src/dashboard-model.js";

const today = "2026-11-06";
const older = "2026-11-01T09:00:00.000Z";
const newer = "2026-11-05T09:00:00.000Z";

function record(id, values = {}) {
  return createRecord({
    id,
    title: `İş ${id}`,
    createdAt: older,
    updatedAt: older,
    ...values,
  });
}

const ids = (records) => records.map((item) => item.id);

test("daily work excludes goals, other panels and every closed status", () => {
  const records = [
    record("daily"),
    record("partial", { status: "partially_completed" }),
    record("waiting", { status: "waiting_response" }),
    ...["weekly", "monthly", "yearly", "meeting", "waiting"].map((type) =>
      record(type, { type }),
    ),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { status }),
    ),
  ];
  assert.deepEqual(ids(openDaily(records)), ["daily", "partial", "waiting"]);
  assert.deepEqual(ids(selectFocus(records)), ["daily", "partial", "waiting"]);
});

test("today means the exact date and overdue is a separate daily selection", () => {
  const records = [
    record("overdue", { dueDate: "2026-11-05" }),
    record("today", { dueDate: today }),
    record("future", { dueDate: "2026-11-07" }),
    record("no-date"),
    record("done-today", { dueDate: today, status: "completed" }),
    record("meeting-today", { dueDate: today, type: "meeting" }),
  ];
  assert.deepEqual(ids(selectFocus(records, { filter: "today", today })), [
    "today",
  ]);
  assert.deepEqual(ids(selectFocus(records, { filter: "overdue", today })), [
    "overdue",
  ]);
  assert.equal(selectFocus(records).length, 4);
});

test("priority sorting resolves dates, missing dates, updates and ids predictably", () => {
  const records = [
    record("low", { priority: "low", dueDate: "2026-01-01" }),
    record("normal", { dueDate: "2026-01-01" }),
    record("high-no-date", { priority: "high", updatedAt: newer }),
    record("high-later", { priority: "high", dueDate: "2026-11-07" }),
    record("high-old", { priority: "high", dueDate: today }),
    record("high-z", { priority: "high", dueDate: today, updatedAt: newer }),
    record("high-a", { priority: "high", dueDate: today, updatedAt: newer }),
    record("urgent", { priority: "urgent" }),
  ];
  assert.deepEqual(ids(selectFocus(records)), [
    "urgent",
    "high-a",
    "high-z",
    "high-old",
    "high-later",
    "high-no-date",
    "normal",
    "low",
  ]);
});

test("due sorting puts all dated work first and priority breaks equal dates", () => {
  const records = [
    record("urgent-no-date", { priority: "urgent" }),
    record("later", { dueDate: "2026-11-07", priority: "urgent" }),
    record("today-normal", { dueDate: today }),
    record("today-high", { dueDate: today, priority: "high" }),
    record("earlier-low", { dueDate: "2026-11-05", priority: "low" }),
    record("normal-no-date"),
  ];
  assert.deepEqual(ids(selectFocus(records, { sort: "due" })), [
    "earlier-low",
    "today-high",
    "today-normal",
    "later",
    "urgent-no-date",
    "normal-no-date",
  ]);
});

test("updated sorting puts recent edits first, then date and priority", () => {
  const records = [
    record("old-urgent", { priority: "urgent", dueDate: "2026-01-01" }),
    record("new-no-date", { updatedAt: newer }),
    record("new-later", { updatedAt: newer, dueDate: "2026-11-07" }),
    record("new-normal", { updatedAt: newer, dueDate: today }),
    record("new-high", { updatedAt: newer, dueDate: today, priority: "high" }),
  ];
  assert.deepEqual(ids(selectFocus(records, { sort: "updated" })), [
    "new-high",
    "new-normal",
    "new-later",
    "new-no-date",
    "old-urgent",
  ]);
});

test("current work uses running, overdue, today, future and undated groups with stable priority and date ties", () => {
  const records = [
    record("undated-urgent", { priority: "urgent" }),
    record("future-urgent-later", {
      priority: "urgent",
      dueDate: "2026-11-09",
    }),
    record("today-low", { priority: "low", dueDate: today }),
    record("overdue-low-earlier", { priority: "low", dueDate: "2026-01-01" }),
    record("running", { priority: "low" }),
    record("future-urgent-earlier", {
      priority: "urgent",
      dueDate: "2026-11-07",
    }),
    record("today-high", { priority: "high", dueDate: today }),
    record("overdue-high-later", { priority: "high", dueDate: "2026-11-05" }),
    record("overdue-high-earlier", { priority: "high", dueDate: "2026-11-01" }),
    record("future-low", { priority: "low", dueDate: "2026-11-07" }),
    record("undated-low", { priority: "low" }),
    record("tie-z", { dueDate: today, title: "Aynı başlık", updatedAt: newer }),
    record("tie-a", { dueDate: today, title: "Aynı başlık", updatedAt: older }),
  ];
  assert.deepEqual(
    ids(selectCurrentWork(records, { today, runningRecordId: "running" })),
    [
      "running",
      "overdue-high-earlier",
      "overdue-high-later",
      "overdue-low-earlier",
      "today-high",
      "tie-a",
      "tie-z",
      "today-low",
      "future-urgent-earlier",
      "future-urgent-later",
      "future-low",
      "undated-urgent",
      "undated-low",
    ],
  );
  // Widget priority ordering is a separate selector and remains unchanged.
  assert.equal(selectFocus(records)[0].id, "future-urgent-earlier");
});

test("running work never bypasses the dashboard's date, query, type or open-record filters", () => {
  const records = [
    record("running-overdue", {
      dueDate: "2026-11-05",
      title: "İŞLEM bekliyor",
    }),
    record("today", { dueDate: today, title: "İŞLEM bugün" }),
    record("future", { dueDate: "2026-11-07", title: "Başka iş" }),
    record("done", { status: "completed", dueDate: today }),
    record("goal", { type: "weekly", dueDate: today }),
  ];
  assert.deepEqual(
    ids(
      selectCurrentWork(records, {
        today,
        filter: "today",
        runningRecordId: "running-overdue",
      }),
    ),
    ["today"],
  );
  assert.deepEqual(
    ids(
      selectCurrentWork(records, {
        today,
        filter: "overdue",
        runningRecordId: "today",
      }),
    ),
    ["running-overdue"],
  );
  assert.deepEqual(
    ids(
      selectCurrentWork(records, {
        today,
        query: " işlem ",
        runningRecordId: "future",
      }),
    ),
    ["running-overdue", "today"],
  );
  for (const runningRecordId of ["done", "goal", "missing"])
    assert.deepEqual(
      ids(selectCurrentWork(records, { today, runningRecordId })),
      ["running-overdue", "today", "future"],
    );
});

test("current work preserves saved records and treats an in-progress status alone as ordinary work", () => {
  const records = [
    record("in-progress", { status: "in_progress", priority: "urgent" }),
    record("overdue", { priority: "low", dueDate: "2026-11-05" }),
    record("today", { dueDate: today }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const selected = selectCurrentWork(records, { today });
  assert.deepEqual(ids(selected), ["overdue", "today", "in-progress"]);
  assert.notEqual(selected, records);
  assert.equal(selected[0], records[1]);
  assert.deepEqual(records, before);
});

test("search handles Turkish case in titles, descriptions, owners and next actions", () => {
  const records = [
    record("title", { title: "İŞLEM KONTROLÜ" }),
    record("description", { description: "IŞIK ölçümü" }),
    record("owner", { owner: "İPEK" }),
    record("next", { nextAction: "ÇİZİMİ gönder" }),
  ];
  assert.deepEqual(ids(selectFocus(records, { query: " işlem " })), ["title"]);
  assert.deepEqual(ids(selectFocus(records, { query: "ışık" })), [
    "description",
  ]);
  assert.deepEqual(ids(selectFocus(records, { query: "ipek" })), ["owner"]);
  assert.deepEqual(ids(selectFocus(records, { query: "çizimi" })), ["next"]);
});

test("selectors preserve source order, timestamps and record contents", () => {
  const records = [
    record("low", { priority: "low" }),
    record("high", { priority: "high", updatedAt: newer }),
    record("meeting", { type: "meeting" }),
    record("waiting", { type: "waiting" }),
  ];
  const snapshot = structuredClone(records);
  for (const item of records) Object.freeze(item);
  Object.freeze(records);
  const selected = selectFocus(records);
  assert.notEqual(selected, records);
  assert.equal(selected[0], records[1]);
  openDaily(records);
  dashboardDailyStats(records, today);
  selectOverview(records, "meeting");
  selectOverview(records, "waiting");
  assert.deepEqual(records, snapshot);
});

test("dashboard counters include daily records only without goal or meeting totals", () => {
  const records = [
    record("today", { dueDate: today }),
    record("overdue", { dueDate: "2026-11-01" }),
    record("future", { dueDate: "2026-11-07" }),
    record("done", { status: "completed", dueDate: today }),
    record("cancelled", { status: "cancelled", dueDate: today }),
    record("transferred", { status: "transferred", dueDate: "2026-11-01" }),
    record("weekly", { type: "weekly", dueDate: today }),
    record("monthly", { type: "monthly", status: "completed" }),
    record("yearly", { type: "yearly", dueDate: "2026-01-01" }),
    record("meeting", { type: "meeting", dueDate: "2026-01-01" }),
    record("waiting", { type: "waiting", dueDate: today }),
  ];
  assert.deepEqual(dashboardDailyStats(records, today), {
    total: 6,
    active: 3,
    completed: 1,
    overdue: 1,
    completionRate: 17,
    todayDue: 1,
  });
  assert.deepEqual(dashboardDailyStats([], today), {
    total: 0,
    active: 0,
    completed: 0,
    overdue: 0,
    completionRate: 0,
    todayDue: 0,
  });
});

test("agenda weekly counts include this week's open goals and eligible earlier work without archived snapshots or later weeks", () => {
  const records = [
    record("current", { type: "weekly", periodKey: "2026-W45" }),
    record("current-by-date", { type: "weekly", dueDate: today }),
    record("earlier", { type: "weekly", periodKey: "2026-W44" }),
    record("earlier-by-date", { type: "weekly", dueDate: "2026-10-30" }),
    record("later", { type: "weekly", periodKey: "2026-W46", dueDate: today }),
    record("unknown", { type: "weekly", periodKey: "Bilgi yok" }),
    record("no-week", { type: "weekly" }),
    record("other-type", { type: "monthly", periodKey: "2026-W45" }),
    ...["completed", "cancelled", "transferred"].flatMap((status) => [
      record(`current-${status}`, {
        type: "weekly",
        periodKey: "2026-W45",
        status,
      }),
      record(`earlier-${status}`, {
        type: "weekly",
        periodKey: "2026-W44",
        status,
      }),
    ]),
  ];
  assert.deepEqual(dashboardAgendaSummary(records, today), {
    weekly: { current: 2, previous: 2, total: 4 },
    waiting: { today: 0, overdue: 0, unscheduled: 0, total: 0 },
    waitingJobs: { total: 0 },
    review: { total: 0 },
  });
});

test("agenda follow-ups separate due today, overdue and unscheduled subjects while future or closed work and delivery dates do not inflate totals", () => {
  const records = [
    record("due-today", { type: "waiting", nextFollowUpDate: today }),
    record("overdue", { type: "waiting", nextFollowUpDate: "2026-11-05" }),
    record("no-plan", { type: "waiting", dueDate: "2026-01-01" }),
    record("empty-plan", { type: "waiting", nextFollowUpDate: "" }),
    record("future", {
      type: "waiting",
      nextFollowUpDate: "2026-11-07",
      dueDate: "2026-01-01",
    }),
    record("meeting", { type: "meeting", nextFollowUpDate: today }),
    ...["completed", "cancelled", "transferred"].flatMap((status) => [
      record(`closed-plan-${status}`, {
        type: "waiting",
        nextFollowUpDate: "2026-01-01",
        status,
      }),
      record(`closed-unscheduled-${status}`, { type: "waiting", status }),
    ]),
  ];
  assert.deepEqual(dashboardAgendaSummary(records, today).waiting, {
    today: 1,
    overdue: 1,
    unscheduled: 2,
    total: 4,
  });
});

test("waiting-job agenda uses the single saved waiting status, while review reminders exclude closed and currently running work", () => {
  const records = [
    record("waiting", { status: "waiting" }),
    record("legacy-flag-only", { blocked: true }),
    record("stale", { updatedAt: new Date(2026, 9, 30, 23).toISOString() }),
    record("recent-boundary", {
      updatedAt: new Date(2026, 9, 31, 0).toISOString(),
    }),
    record("running-stale", { updatedAt: "2026-10-20T09:00:00.000Z" }),
    record("waiting-topic", { type: "waiting", status: "waiting_response" }),
    record("waiting-weekly", {
      type: "weekly",
      status: "waiting",
      periodKey: "2026-W45",
    }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(`closed-${status}`, {
        status,
        blocked: true,
        updatedAt: "2026-10-01T09:00:00.000Z",
      }),
    ),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const summary = dashboardAgendaSummary(records, today, {
    runningRecordId: "running-stale",
  });
  assert.equal(summary.waitingJobs.total, 1);
  assert.equal(summary.review.total, 1);
  assert.equal(Object.hasOwn(summary, "blocked"), false);
  assert.deepEqual(records, before);
  assert.deepEqual(dashboardAgendaSummary([], today), {
    weekly: { current: 0, previous: 0, total: 0 },
    waiting: { today: 0, overdue: 0, unscheduled: 0, total: 0 },
    waitingJobs: { total: 0 },
    review: { total: 0 },
  });
});

test("meeting previews sort by due date, then priority, then latest edit", () => {
  const records = [
    record("no-date", { type: "meeting", priority: "urgent" }),
    record("later", { type: "meeting", dueDate: "2026-11-07" }),
    record("normal", { type: "meeting", dueDate: today }),
    record("high-old", { type: "meeting", dueDate: today, priority: "high" }),
    record("high-new", {
      type: "meeting",
      dueDate: today,
      priority: "high",
      updatedAt: newer,
    }),
    record("daily", { dueDate: "2026-01-01" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { type: "meeting", dueDate: "2026-01-01", status }),
    ),
  ];
  assert.deepEqual(
    ids(selectOverview(records, "meeting", { limit: Infinity })),
    ["high-new", "high-old", "normal", "later", "no-date"],
  );
  assert.deepEqual(ids(selectOverview(records, "meeting")), [
    "high-new",
    "high-old",
    "normal",
  ]);
});

test("waiting previews use actual last follow-up dates with missing dates last", () => {
  const records = [
    record("no-date-z", {
      type: "waiting",
      title: "Zaman",
      dueDate: "2020-01-01",
      updatedAt: newer,
    }),
    record("recent", { type: "waiting", lastFollowUpDate: today }),
    record("old-z", {
      type: "waiting",
      title: "Zarf",
      lastFollowUpDate: "2026-10-01",
    }),
    record("old-a", {
      type: "waiting",
      title: "Ara",
      lastFollowUpDate: "2026-10-01",
    }),
    record("no-date-a", {
      type: "waiting",
      title: "Ara",
      sourceDate: "2019-01-01",
    }),
    record("done", {
      type: "waiting",
      status: "completed",
      lastFollowUpDate: "2020-01-01",
    }),
    record("cancelled", { type: "waiting", status: "cancelled" }),
    record("transferred", { type: "waiting", status: "transferred" }),
  ];
  const before = structuredClone(records);
  assert.deepEqual(
    ids(selectOverview(records, "waiting", { limit: Infinity })),
    ["old-a", "old-z", "recent", "no-date-a", "no-date-z"],
  );
  assert.deepEqual(records, before);
  assert.equal(records[0].lastFollowUpDate, "");
  assert.equal(records[4].lastFollowUpDate, "");
});

test("overview search is applied before the preview limit and ignores unsupported types", () => {
  const records = [
    record("1", { type: "meeting" }),
    record("2", { type: "meeting" }),
    record("3", { type: "meeting" }),
    record("4", { type: "meeting", nextAction: "İPEK ile görüş" }),
    record("waiting", { type: "waiting", owner: "İPEK" }),
  ];
  assert.deepEqual(ids(selectOverview(records, "meeting", { query: "ipek" })), [
    "4",
  ]);
  assert.deepEqual(ids(selectOverview(records, "waiting", { query: "ipek" })), [
    "waiting",
  ]);
  assert.deepEqual(selectOverview(records, "weekly"), []);
  assert.deepEqual(selectOverview(records, "daily"), []);
});
