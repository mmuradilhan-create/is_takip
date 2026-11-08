import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, goalProgress } from "../src/model.js";
import {
  selectDashboardGoals,
  selectDashboardWeek,
  selectAttention,
} from "../src/dashboard-planning.js";

const today = "2026-11-07";
const stamp = "2026-11-01T10:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: stamp,
    updatedAt: stamp,
    ...input,
  });
const ids = (items) => items.map((item) => item.id);

test("weekly preview separates this week's open goals from previous, future, closed and unknown periods", () => {
  const current = record("current", { type: "weekly", periodKey: "2026-W45" });
  const records = [
    current,
    record("by-date", { type: "weekly", dueDate: today }),
    record("prior", { type: "weekly", periodKey: "2026-W44" }),
    record("future", { type: "weekly", periodKey: "2026-W46", dueDate: today }),
    record("unknown", { type: "weekly" }),
    record("daily", { dueDate: today }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { type: "weekly", periodKey: "2026-W45", status }),
    ),
    record("old-archive", {
      type: "weekly",
      periodKey: "2026-W43",
      status: "transferred",
    }),
  ];
  const result = selectDashboardGoals(records, { today });
  assert.deepEqual(ids(result.records), ["by-date", "current"]);
  assert.equal(result.total, 2);
  assert.equal(result.previous, 1);
  assert.equal(result.records[1], current);
});

test("weekly search is Turkish-aware and applied before preview limits and the previous-week count", () => {
  const records = [
    record("weekly-a", {
      type: "weekly",
      periodKey: "2026-W45",
      nextAction: "İPEK ile görüş",
    }),
    record("weekly-b", {
      type: "weekly",
      periodKey: "2026-W45",
      projectCode: "İPEK-1",
    }),
    record("weekly-c", {
      type: "weekly",
      periodKey: "2026-W45",
      description: "İPEK değerlendirmesi",
    }),
    record("weekly-d", {
      type: "weekly",
      periodKey: "2026-W45",
      title: "İPEK toplantısı",
    }),
    record("prior-match", {
      type: "weekly",
      periodKey: "2026-W44",
      owner: "İPEK",
    }),
    record("prior-other", { type: "weekly", periodKey: "2026-W44" }),
  ];
  const result = selectDashboardGoals(records, {
    today,
    query: " ipek ",
    limit: 2,
  });
  assert.equal(result.records.length, 2);
  assert.equal(result.total, 4);
  assert.equal(result.previous, 1);
  assert.equal(selectDashboardGoals(records, { today, query: "yok" }).total, 0);
});

test("weekly preview records retain numeric progress separately from linked daily completion", () => {
  const goal = record("goal", {
    type: "weekly",
    periodKey: "2026-W45",
    targetValue: 10,
    currentValue: 4,
    metric: "Rapor",
  });
  const records = [
    goal,
    record("done", { parentId: goal.id, status: "completed" }),
    record("open", { parentId: goal.id }),
  ];
  const preview = selectDashboardGoals(records, { today });
  assert.equal(preview.records[0], goal);
  assert.deepEqual(goalProgress(preview.records[0], records), {
    total: 10,
    completed: 4,
    percent: 40,
    basis: "metric",
  });
});

test("the weekly dashboard keeps matching current goals ahead of upcoming work and retains the current-only selector API", () => {
  const current = record("current", { type: "weekly", periodKey: "2026-W45" });
  const records = [
    record("next", {
      type: "weekly",
      periodKey: "2026-W46",
      priority: "urgent",
    }),
    record("prior", { type: "weekly", periodKey: "2026-W44" }),
    current,
  ];
  const selected = selectDashboardWeek(records, { today });
  assert.deepEqual(ids(selected.records), ["current"]);
  assert.equal(selected.records[0], current);
  assert.equal(selected.period.key, "2026-W45");
  assert.equal(selected.isUpcoming, false);
  assert.equal(selected.previous, 1);
  assert.equal(selectDashboardWeek(records, { today, limit: 0 }).total, 1);
  assert.equal(
    selectDashboardWeek(records, { today, limit: 0 }).isUpcoming,
    false,
  );
  const withoutCurrent = records.filter((item) => item !== current);
  assert.equal(selectDashboardGoals(withoutCurrent, { today }).total, 0);
  assert.deepEqual(
    ids(selectDashboardWeek(withoutCurrent, { today }).records),
    ["next"],
  );
});

test("upcoming weekly preview chooses the nearest canonical open week, respects explicit periods and keeps normal goal ordering and limits", () => {
  const records = [
    record("later-explicit", {
      type: "weekly",
      periodKey: "2026-W47",
      dueDate: "2026-11-09",
    }),
    record("earlier-explicit", {
      type: "weekly",
      periodKey: "2026-W44",
      dueDate: "2026-11-10",
    }),
    record("near-normal", {
      type: "weekly",
      periodKey: "2026-W46",
      dueDate: "2026-11-11",
    }),
    record("near-high", {
      type: "weekly",
      periodKey: "2026-W46",
      priority: "high",
    }),
    record("near-fallback", {
      type: "weekly",
      periodKey: "2026-W99",
      dueDate: "2026-11-10",
      priority: "urgent",
    }),
    record("unknown", { type: "weekly" }),
    record("daily", { dueDate: "2026-11-09" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { type: "weekly", periodKey: "2026-W45", status }),
    ),
  ];
  const result = selectDashboardWeek(records, { today, limit: 2 });
  assert.deepEqual(ids(result.records), ["near-fallback", "near-high"]);
  assert.equal(result.total, 3);
  assert.equal(result.period.key, "2026-W46");
  assert.equal(result.period.start, "2026-11-09");
  assert.equal(result.isUpcoming, true);
  assert.equal(result.previous, 1);
  assert.deepEqual(
    ids(selectDashboardWeek(records, { today, limit: Infinity }).records),
    ["near-fallback", "near-high", "near-normal"],
  );
});

test("weekly fallback applies Turkish search before choosing a week and before preview totals", () => {
  const records = [
    record("current-other", {
      type: "weekly",
      periodKey: "2026-W45",
      title: "Başka iş",
    }),
    record("near-other", { type: "weekly", periodKey: "2026-W46" }),
    record("found-owner", {
      type: "weekly",
      periodKey: "2026-W47",
      owner: "İPEK",
    }),
    record("found-project", {
      type: "weekly",
      periodKey: "2026-W47",
      projectCode: "İPEK-1",
    }),
    record("found-later", {
      type: "weekly",
      periodKey: "2026-W48",
      nextAction: "İPEK ile görüş",
    }),
    record("found-prior", {
      type: "weekly",
      periodKey: "2026-W44",
      title: "İPEK önceki hedef",
    }),
    record("closed-near-match", {
      type: "weekly",
      periodKey: "2026-W46",
      title: "İPEK kapanmış",
      status: "completed",
    }),
  ];
  const result = selectDashboardWeek(records, {
    today,
    query: " ipek ",
    limit: 1,
  });
  assert.equal(result.period.key, "2026-W47");
  assert.equal(result.total, 2);
  assert.equal(result.records.length, 1);
  assert.equal(result.previous, 1);
  assert.equal(result.isUpcoming, true);
  const empty = selectDashboardWeek(records, { today, query: "yok" });
  assert.equal(empty.period.key, "2026-W45");
  assert.equal(empty.isUpcoming, false);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.records, []);
});

test("nearest weekly preview crosses the ISO year boundary without moving, rewriting or cloning saved goals", () => {
  const records = [
    record("january", {
      type: "weekly",
      periodKey: "2027-W01",
      dueDate: "2026-12-31",
      targetValue: 10,
      currentValue: 4,
    }),
    record("later-january", { type: "weekly", periodKey: "2027-W02" }),
    record("archived", {
      type: "weekly",
      periodKey: "2026-W53",
      status: "transferred",
    }),
    record("unknown", { type: "weekly" }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectDashboardWeek(records, { today: "2026-12-30" });
  assert.deepEqual(ids(result.records), ["january"]);
  assert.equal(result.records[0], records[0]);
  assert.equal(result.period.key, "2027-W01");
  assert.equal(result.period.start, "2027-01-04");
  assert.equal(result.isUpcoming, true);
  assert.deepEqual(records, before);
});

test("attention includes only dated open waiting reminders through three days ahead and omits legacy meeting deadlines", () => {
  const records = [
    record("meeting-old", { type: "meeting", dueDate: "2026-11-01" }),
    record("meeting-today", { type: "meeting", dueDate: today }),
    record("meeting-three", { type: "meeting", dueDate: "2026-11-10" }),
    record("meeting-four", { type: "meeting", dueDate: "2026-11-11" }),
    record("meeting-unplanned", { type: "meeting" }),
    record("waiting-old", { type: "waiting", nextFollowUpDate: "2026-11-01" }),
    record("waiting-today", { type: "waiting", nextFollowUpDate: today }),
    record("waiting-tomorrow", {
      type: "waiting",
      nextFollowUpDate: "2026-11-08",
      dueDate: "2026-01-01",
    }),
    record("waiting-three", {
      type: "waiting",
      nextFollowUpDate: "2026-11-10",
    }),
    record("waiting-four", {
      type: "waiting",
      nextFollowUpDate: "2026-11-11",
    }),
    record("waiting-unplanned", { type: "waiting" }),
    {
      ...record("meeting-invalid", { type: "meeting" }),
      dueDate: "2026-02-30",
    },
    {
      ...record("waiting-invalid", { type: "waiting" }),
      nextFollowUpDate: "2026-11-31",
    },
    record("daily", { dueDate: today }),
    ...["meeting", "waiting"].flatMap((type) =>
      ["completed", "cancelled", "transferred"].map((status) =>
        record(`${type}-${status}`, { type, status }),
      ),
    ),
  ];
  const result = selectAttention(records, { today, limit: Infinity });
  assert.deepEqual(ids(result.records), [
    "waiting-old",
    "waiting-today",
    "waiting-tomorrow",
    "waiting-three",
  ]);
  assert.equal(result.total, 4);
  assert.equal(selectAttention(records, { today }).records.length, 4);
});

test("routed meetings are omitted while waiting topics keep attention even when daily contact work exists", () => {
  const meeting = record("meeting", { type: "meeting", dueDate: today });
  const meetingToWaiting = record("meeting-to-waiting", {
    type: "meeting",
    dueDate: today,
  });
  const waiting = record("waiting", {
    type: "waiting",
    nextFollowUpDate: today,
  });
  const waitingWithClosedWork = record("waiting-closed-work", {
    type: "waiting",
    nextFollowUpDate: today,
  });
  const closedMeetingWork = record("meeting-closed-work", {
    type: "meeting",
    dueDate: today,
  });
  const ambiguous = record("ambiguous", { type: "meeting", dueDate: today });
  const records = [
    meeting,
    meetingToWaiting,
    waiting,
    waitingWithClosedWork,
    closedMeetingWork,
    ambiguous,
    record("meeting-work", {
      sourceFields: {
        __followupSource: { recordId: meeting.id, type: "meeting" },
      },
    }),
    record("waiting-target", {
      type: "waiting",
      nextFollowUpDate: today,
      sourceFields: {
        __followupSource: { recordId: meetingToWaiting.id, type: "meeting" },
      },
    }),
    record("waiting-work", {
      sourceFields: {
        __followupSource: { recordId: waiting.id, type: "waiting" },
      },
    }),
    record("waiting-done", {
      status: "completed",
      sourceFields: {
        __followupSource: {
          recordId: waitingWithClosedWork.id,
          type: "waiting",
        },
      },
    }),
    record("meeting-done", {
      status: "completed",
      sourceFields: {
        __followupSource: { recordId: closedMeetingWork.id, type: "meeting" },
      },
    }),
    ...["ambiguous-work-a", "ambiguous-work-b"].map((id) =>
      record(id, {
        sourceFields: {
          __followupSource: { recordId: ambiguous.id, type: "meeting" },
        },
      }),
    ),
  ];
  assert.deepEqual(
    ids(selectAttention(records, { today, limit: Infinity }).records),
    ["waiting", "waiting-closed-work", "waiting-target"],
  );
});

test("a meeting routed to both work and an external response stays out of attention while its waiting target remains independently eligible", () => {
  const meeting = record("dual-meeting", { type: "meeting", dueDate: today });
  const waiting = record("dual-waiting", {
    type: "waiting",
    status: "waiting_response",
    nextFollowUpDate: today,
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  const records = [
    meeting,
    record("dual-daily", {
      status: "in_progress",
      sourceFields: {
        __followupSource: { recordId: meeting.id, type: "meeting" },
      },
    }),
    waiting,
    record("waiting-contact", {
      status: "in_progress",
      sourceFields: {
        __followupSource: { recordId: waiting.id, type: "waiting" },
      },
    }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const selected = selectAttention(records, { today, limit: Infinity });
  assert.deepEqual(ids(selected.records), [waiting.id]);
  assert.equal(selected.records[0], waiting);
  assert.equal(selected.total, 1);
  assert.deepEqual(records, before);
  const contactCompleted = records.map((item) =>
    item.id === "waiting-contact" ? { ...item, status: "completed" } : item,
  );
  assert.deepEqual(
    ids(selectAttention(contactCompleted, { today, limit: Infinity }).records),
    [waiting.id],
  );
  const allDailyWorkCompleted = contactCompleted.map((item) =>
    item.id === "dual-daily" ? { ...item, status: "completed" } : item,
  );
  assert.deepEqual(
    ids(
      selectAttention(allDailyWorkCompleted, { today, limit: Infinity })
        .records,
    ),
    [waiting.id],
  );
  assert.equal(waiting.status, "waiting_response");
});

test("attention's three-day window uses inclusive waiting calendar dates across month and year boundaries", () => {
  for (const [date, included, excluded] of [
    ["2026-12-30", "2027-01-02", "2027-01-03"],
    ["2028-02-27", "2028-03-01", "2028-03-02"],
  ]) {
    const records = [
      record("included", { type: "waiting", nextFollowUpDate: included }),
      record("excluded", { type: "waiting", nextFollowUpDate: excluded }),
      record("legacy-meeting", { type: "meeting", dueDate: included }),
    ];
    assert.deepEqual(ids(selectAttention(records, { today: date }).records), [
      "included",
    ]);
  }
});

test("attention keeps overdue/today/near groups, calendar order and same-day priority stable without changing saved rows", () => {
  const records = [
    record("near-urgent", {
      type: "waiting",
      nextFollowUpDate: "2026-11-10",
      priority: "urgent",
    }),
    record("today-normal", { type: "waiting", nextFollowUpDate: today }),
    record("oldest-low", {
      type: "waiting",
      nextFollowUpDate: "2026-11-01",
      priority: "low",
    }),
    record("old-high", {
      type: "waiting",
      nextFollowUpDate: "2026-11-06",
      priority: "high",
    }),
    record("old-normal", { type: "waiting", nextFollowUpDate: "2026-11-06" }),
    record("near-normal", { type: "waiting", nextFollowUpDate: "2026-11-08" }),
    record("today-urgent", {
      type: "waiting",
      nextFollowUpDate: today,
      priority: "urgent",
    }),
    record("undated-urgent", { type: "waiting", priority: "urgent" }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectAttention(records, { today, limit: Infinity });
  assert.deepEqual(ids(result.records), [
    "oldest-low",
    "old-high",
    "old-normal",
    "today-urgent",
    "today-normal",
    "near-normal",
    "near-urgent",
  ]);
  assert.equal(result.total, 7);
  assert.equal(result.records[0], records[2]);
  assert.deepEqual(
    selectAttention(records, { today, limit: 2 }).records,
    result.records.slice(0, 2),
  );
  assert.equal(selectAttention(records, { today, limit: 0 }).total, 7);
  assert.throws(
    () => selectAttention(records, { today: "2026-02-30" }),
    /tarih/,
  );
  assert.deepEqual(records, before);
});

test("attention search precedes limiting and both selectors preserve source arrays and saved record identities", () => {
  const records = [
    record("first", { type: "meeting", dueDate: today }),
    record("found", {
      type: "waiting",
      latestUpdate: "İŞLEM yanıtı bekleniyor",
      nextFollowUpDate: today,
    }),
    record("goal", { type: "weekly", periodKey: "2026-W45" }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectAttention(records, { today, query: "işlem", limit: 1 });
  assert.deepEqual(ids(result.records), ["found"]);
  assert.equal(result.total, 1);
  assert.equal(result.records[0], records[1]);
  assert.deepEqual(selectAttention(records, { today, limit: 0 }).records, []);
  assert.equal(selectDashboardGoals(records, { today }).records[0], records[2]);
  assert.deepEqual(records, before);
});
