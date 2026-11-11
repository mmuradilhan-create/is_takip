import test from "node:test";
import assert from "node:assert/strict";
import { upcomingWork } from "../src/widget-work.js";

const record = (id, values = {}) => ({
  id,
  type: "daily",
  title: id,
  status: "planned",
  priority: "normal",
  dueDate: "",
  focusDate: null,
  ...values,
});

test("next work puts today's focus, running statuses and due work first", () => {
  const today = "2026-11-11";
  const records = [
    record("later", { dueDate: "2026-11-20" }),
    record("none-high", { priority: "high" }),
    record("none-low", { priority: "low" }),
    record("overdue", { dueDate: "2026-11-05" }),
    record("today", { dueDate: today }),
    record("progress", { status: "in_progress" }),
    record("focus", { focusDate: today }),
  ];
  assert.deepEqual(
    upcomingWork(records, new Set(), today).map((item) => item.id),
    ["focus", "progress", "overdue", "today", "later", "none-high", "none-low"],
  );
});

test("next work skips closed, non-daily and already started records", () => {
  const records = [
    record("open"),
    record("busy"),
    record("done", { status: "completed" }),
    record("cancelled", { status: "cancelled" }),
    record("moved", { status: "transferred" }),
    record("goal", { type: "weekly" }),
  ];
  assert.deepEqual(
    upcomingWork(records, new Set(["busy"]), "2026-11-11").map(
      (item) => item.id,
    ),
    ["open"],
  );
});

test("next work stays a short list", () => {
  const records = Array.from({ length: 50 }, (_, index) =>
    record(`job-${String(index).padStart(2, "0")}`),
  );
  assert.equal(upcomingWork(records, new Set(), "2026-11-11").length, 30);
});
