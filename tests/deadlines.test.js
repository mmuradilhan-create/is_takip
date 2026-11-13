import test from "node:test";
import assert from "node:assert/strict";
import { deadlineTone, isDueSoon } from "../src/deadlines.js";

const record = (dueDate, patch = {}) => ({
  id: "deadline-daily",
  type: "daily",
  status: "planned",
  dueDate,
  ...patch,
});

test("due-soon includes today and exactly three days ahead, excluding overdue and day four", () => {
  const today = "2026-11-07";
  for (const due of ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"])
    assert.equal(isDueSoon(record(due), today), true, due);
  for (const due of ["2026-11-06", "2026-11-11", "2027-11-07"])
    assert.equal(isDueSoon(record(due), today), false, due);
});

test("the horizon follows real calendar days through month, year and leap-day boundaries", () => {
  for (const [today, lastDay, fourthDay] of [
    ["2026-01-30", "2026-02-02", "2026-02-03"],
    ["2026-12-30", "2027-01-02", "2027-01-03"],
    ["2024-02-27", "2024-03-01", "2024-03-02"],
    ["2026-02-27", "2026-03-02", "2026-03-03"],
    ["2026-03-28", "2026-03-31", "2026-04-01"],
    ["2026-10-24", "2026-10-27", "2026-10-28"],
  ]) {
    assert.equal(isDueSoon(record(lastDay), today), true, `${today} + 3`);
    assert.equal(isDueSoon(record(fourthDay), today), false, `${today} + 4`);
  }
});

test("active daily work and goals have a due-soon cue, including valid legacy open statuses", () => {
  const today = "2026-11-07";
  for (const status of [
    "planned",
    "in_progress",
    "waiting",
    "partially_completed",
    "follow_up",
    "waiting_response",
  ])
    assert.equal(isDueSoon(record(today, { status }), today), true, status);
  for (const status of ["completed", "cancelled", "transferred"])
    assert.equal(isDueSoon(record(today, { status }), today), false, status);
  // Goals share the daily rule; meetings and waiting topics have their own.
  for (const type of ["weekly", "monthly", "yearly"])
    assert.equal(isDueSoon(record(today, { type }), today), true, type);
  for (const type of ["meeting", "waiting"])
    assert.equal(isDueSoon(record(today, { type }), today), false, type);
});

test("missing and malformed dates do not become upcoming work and the input remains unchanged", () => {
  const today = "2026-11-07";
  for (const due of [
    undefined,
    null,
    "",
    "2026-02-29",
    "2026-13-01",
    "2026-11-31",
    "07.11.2026",
    "2026-11-7",
  ])
    assert.equal(isDueSoon(record(due), today), false, String(due));
  assert.equal(isDueSoon(null, today), false);
  assert.equal(isDueSoon(record(today), "2026-02-30"), false);
  const item = record("2026-11-10", { nextAction: "Korunacak adım" });
  const before = JSON.stringify(item);
  assert.equal(isDueSoon(item, today), true);
  assert.equal(JSON.stringify(item), before);
});

test("deadline tone gives existing overdue rules precedence and keeps closed and distant work neutral", () => {
  const today = "2026-11-07";
  assert.equal(deadlineTone(record("2026-11-06"), today), "overdue");
  assert.equal(deadlineTone(record("2026-11-07"), today), "due-soon");
  assert.equal(deadlineTone(record("2026-11-10"), today), "due-soon");
  assert.equal(deadlineTone(record("2026-11-11"), today), "");
  assert.equal(deadlineTone(record(""), today), "");
  assert.equal(deadlineTone(null, today), "");
  for (const status of ["completed", "cancelled", "transferred"])
    assert.equal(deadlineTone(record("2026-11-06", { status }), today), "");
  for (const type of ["weekly", "monthly", "yearly", "meeting", "waiting"]) {
    assert.equal(
      deadlineTone(record("2026-11-06", { type }), today),
      "overdue",
    );
    assert.equal(
      deadlineTone(record(today, { type }), today),
      ["weekly", "monthly", "yearly"].includes(type) ? "due-soon" : "",
    );
  }
});
