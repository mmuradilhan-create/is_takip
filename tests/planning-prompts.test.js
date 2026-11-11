import assert from "node:assert/strict";
import test from "node:test";
import { createRecord } from "../src/model.js";
import { selectPlanningPrompts, waitingGaps } from "../src/planning-prompts.js";

const today = "2026-11-07";
const stamp = "2026-11-07T10:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: stamp,
    updatedAt: stamp,
    ...input,
  });
const goal = (id, input = {}) =>
  record(id, { type: "weekly", periodKey: "2026-W45", ...input });
const ids = (records) => records.map((item) => item.id);

test("only current open goals without a positive numeric target or eligible daily steps receive a planning suggestion", () => {
  const records = [
    goal("unplanned"),
    goal("metric", { targetValue: 5, currentValue: 0 }),
    goal("metric-no-current", { targetValue: 1 }),
    goal("zero-target", { targetValue: 0 }),
    goal("description-only", { metric: "Yayın" }),
    goal("open-child"),
    goal("completed-child"),
    goal("excluded-children"),
    goal("wrong-type-child"),
    goal("prior", { periodKey: "2026-W44" }),
    goal("future", { periodKey: "2026-W46", dueDate: today }),
    record("unknown-period", { type: "weekly" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      goal(status, { status }),
    ),
    record("step-open", { parentId: "open-child" }),
    record("step-done", { parentId: "completed-child", status: "completed" }),
    record("step-cancelled", {
      parentId: "excluded-children",
      status: "cancelled",
    }),
    record("step-transferred", {
      parentId: "excluded-children",
      status: "transferred",
    }),
    record("meeting-child", { type: "meeting", parentId: "wrong-type-child" }),
    record("orphan", { parentId: "missing-goal" }),
  ];
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today }).unplannedGoals).sort(),
    [
      "description-only",
      "excluded-children",
      "unplanned",
      "wrong-type-child",
      "zero-target",
    ],
  );
});

test("waiting suggestions retain daily legacy reasons and include external waiting topics missing their contact context", () => {
  const records = [
    record("both-empty", { status: "waiting" }),
    record("reason-empty", {
      status: "waiting",
      nextAction: "Yanıtı kontrol et",
    }),
    record("step-empty", { status: "waiting", waitingReason: "Malzeme eksik" }),
    record("spaces", {
      status: "waiting",
      waitingReason: "  ",
      nextAction: " ",
    }),
    record("clear", {
      status: "waiting",
      waitingReason: "Malzeme eksik",
      nextAction: "Satın almaya sor",
    }),
    record("legacy-clear", {
      status: "waiting",
      blockReason: "Malzeme eksik",
      nextAction: "Satın almaya sor",
    }),
    record("not-waiting", { status: "in_progress" }),
    record("external-waiting", { type: "waiting", status: "waiting" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(status, { status }),
    ),
  ];
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today }).waitingDetails),
    ["both-empty", "reason-empty", "spaces", "external-waiting"],
  );
});

test("review suggestions use seven calendar days, exclude running work, and do not aggregate overlapping waiting suggestions", () => {
  const records = [
    record("eight-days", { updatedAt: "2026-10-30T12:00:00.000Z" }),
    record("seven-days", {
      updatedAt: "2026-10-31T12:00:00.000Z",
      status: "waiting",
    }),
    record("six-days", { updatedAt: "2026-11-01T12:00:00.000Z" }),
    record("running", { updatedAt: "2026-10-01T12:00:00.000Z" }),
    record("closed", {
      updatedAt: "2026-10-01T12:00:00.000Z",
      status: "completed",
    }),
    goal("weekly-old", { updatedAt: "2026-10-01T12:00:00.000Z" }),
  ];
  const result = selectPlanningPrompts(records, {
    today,
    runningRecordId: "running",
  });
  assert.deepEqual(ids(result.reviewRecords), ["eight-days", "seven-days"]);
  assert.deepEqual(ids(result.waitingDetails), ["seven-days"]);
  assert.equal(result.reviewRecords[1], result.waitingDetails[0]);
  assert.equal(Object.hasOwn(result, "total"), false);
});

test("prior goals use canonical older weeks without mixing current, future, archived or unknown goals", () => {
  const records = [
    goal("current"),
    goal("prior", { periodKey: "2026-W44" }),
    goal("older-by-date", { periodKey: "", dueDate: "2026-10-22" }),
    goal("future", { periodKey: "2026-W46", dueDate: "2026-10-22" }),
    goal("archived", { periodKey: "2026-W44", status: "transferred" }),
    goal("completed", { periodKey: "2026-W44", status: "completed" }),
    record("unknown", { type: "weekly" }),
  ];
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today }).previousGoals),
    ["prior", "older-by-date"],
  );
});

test("Turkish search filters every suggestion before counts without hiding a matching goal's existing nonmatching child", () => {
  const records = [
    goal("found-goal", { title: "İPEK hedefi" }),
    goal("found-planned-goal", { owner: "İPEK" }),
    record("child-outside-query", { parentId: "found-planned-goal" }),
    goal("other-goal"),
    goal("found-prior", { periodKey: "2026-W44", projectCode: "İPEK" }),
    goal("other-prior", { periodKey: "2026-W44" }),
    record("found-waiting", {
      status: "waiting",
      title: "İPEK yanıtı beklenen iş",
    }),
    record("other-waiting", { status: "waiting" }),
    record("found-review", {
      nextAction: "İPEK ile görüş",
      updatedAt: "2026-10-01T12:00:00.000Z",
    }),
    record("other-review", { updatedAt: "2026-10-01T12:00:00.000Z" }),
  ];
  const result = selectPlanningPrompts(records, { today, query: " ipek " });
  assert.deepEqual(ids(result.unplannedGoals), ["found-goal"]);
  assert.deepEqual(ids(result.waitingDetails), ["found-waiting"]);
  assert.deepEqual(ids(result.reviewRecords), ["found-review"]);
  assert.deepEqual(ids(result.previousGoals), ["found-prior"]);
  assert.ok(
    Object.values(
      selectPlanningPrompts(records, { today, query: "yok" }),
    ).every((items) => items.length === 0),
  );
});

test("remaining-goal suggestions append older open monthly goals without mixing current, future, closed, unknown or yearly plans", () => {
  const monthly = (id, input = {}) =>
    record(id, { type: "monthly", periodKey: "2026-10", ...input });
  const olderMonth = monthly("older-month", { title: "İPEK aylık hedefi" });
  const records = [
    olderMonth,
    goal("older-week", {
      periodKey: "2026-W44",
      title: "İPEK haftalık hedefi",
    }),
    monthly("older-by-date", { periodKey: "", dueDate: "2026-09-30" }),
    monthly("current-month", { periodKey: "2026-11", dueDate: "2026-10-01" }),
    monthly("future-month", { periodKey: "2026-12", dueDate: "2026-10-01" }),
    monthly("unknown-month", { periodKey: "" }),
    record("older-year", {
      type: "yearly",
      periodKey: "2025",
      dueDate: "2025-12-31",
    }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      monthly(`month-${status}`, { status }),
    ),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectPlanningPrompts(records, { today });
  assert.deepEqual(ids(result.previousGoals), [
    "older-week",
    "older-month",
    "older-by-date",
  ]);
  assert.equal(result.previousGoals[1], olderMonth);
  assert.deepEqual(
    ids(
      selectPlanningPrompts(records, { today, query: " ipek " }).previousGoals,
    ),
    ["older-week", "older-month"],
  );
  assert.deepEqual(records, before);
});

test("all suggestions retain original records and leave frozen saved records and ordering untouched", () => {
  const records = [
    goal("current"),
    goal("prior", { periodKey: "2026-W44" }),
    record("waiting", {
      status: "waiting",
      updatedAt: "2026-10-01T12:00:00.000Z",
    }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = selectPlanningPrompts(records, { today });
  assert.equal(result.unplannedGoals[0], records[0]);
  assert.equal(result.previousGoals[0], records[1]);
  assert.equal(result.waitingDetails[0], records[2]);
  assert.equal(result.reviewRecords[0], records[2]);
  assert.deepEqual(records, before);
  assert.deepEqual(selectPlanningPrompts([], { today }), {
    unplannedGoals: [],
    waitingDetails: [],
    reviewRecords: [],
    previousGoals: [],
  });
});

test("waiting topics need a contact and a next follow-up date; a latest update only after two quiet weeks", () => {
  const topic = (id, input = {}) =>
    record(id, {
      type: "waiting",
      status: "waiting_response",
      expectedFrom: "Tedarikçi",
      nextFollowUpDate: "2026-11-10",
      sourceDate: "2026-11-05",
      ...input,
    });
  const followUpLog = [
    { id: "f1", date: "2026-10-20", note: "", createdAt: stamp },
  ];
  const records = [
    topic("complete", { latestUpdate: "Teklif istendi" }),
    topic("new-without-update"),
    topic("no-contact", { expectedFrom: " " }),
    topic("no-date", { nextFollowUpDate: "" }),
    topic("quiet-two-weeks", { sourceDate: "2026-10-24" }),
    topic("quiet-but-followed", { sourceDate: "2026-10-01", followUpLog }),
    topic("thirteen-days", { sourceDate: "2026-10-25" }),
    topic("closed-no-date", { status: "completed", nextFollowUpDate: "" }),
  ];
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today }).waitingDetails),
    ["no-contact", "no-date", "quiet-two-weeks"],
  );
  assert.deepEqual(waitingGaps(records[4], today), ["latestUpdate"]);
  assert.deepEqual(
    waitingGaps(
      topic("everything", {
        expectedFrom: "",
        nextFollowUpDate: "",
        sourceDate: "2026-10-01",
      }),
      today,
    ),
    ["expectedFrom", "nextFollowUpDate", "latestUpdate"],
  );
  assert.deepEqual(
    waitingGaps(record("daily-waiting", { status: "waiting" }), today),
    ["waitingReason"],
  );
});

test("review suggestions skip jobs with a recent work note or pause and keep untouched ones", () => {
  const old = "2026-10-20T10:00:00.000Z";
  const records = [
    record("untouched", { updatedAt: old }),
    record("noted-yesterday", { updatedAt: old }),
    record("noted-long-ago", { updatedAt: old }),
  ];
  const activity = new Map([
    ["noted-yesterday", Date.parse("2026-11-06T15:00:00.000Z")],
    ["noted-long-ago", Date.parse("2026-10-25T15:00:00.000Z")],
  ]);
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today, activity }).reviewRecords),
    ["noted-long-ago", "untouched"].sort(),
  );
  assert.deepEqual(
    ids(selectPlanningPrompts(records, { today }).reviewRecords).sort(),
    ["noted-long-ago", "noted-yesterday", "untouched"],
  );
});
