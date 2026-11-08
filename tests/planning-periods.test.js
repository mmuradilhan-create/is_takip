import test from "node:test";
import assert from "node:assert/strict";
import {
  makePlanningPeriod,
  shiftPlanningPeriod,
  matchesPlanningPeriod,
} from "../src/planning-periods.js";

test("weekly periods use Monday to Sunday and the ISO week year across New Year", () => {
  assert.deepEqual(makePlanningPeriod("weekly", "2026-11-07"), {
    type: "weekly",
    key: "2026-W45",
    start: "2026-11-02",
    end: "2026-11-08",
    label: "2 – 8 Kasım 2026",
  });
  assert.deepEqual(makePlanningPeriod("weekly", "2027-01-01"), {
    type: "weekly",
    key: "2026-W53",
    start: "2026-12-28",
    end: "2027-01-03",
    label: "28 Aralık 2026 – 3 Ocak 2027",
  });
  assert.equal(makePlanningPeriod("weekly", "2024-12-30").key, "2025-W01");
  assert.equal(
    makePlanningPeriod("weekly", "2026-11-30").label,
    "30 Kasım – 6 Aralık 2026",
  );
});

test("month and year periods have real calendar boundaries and Turkish labels", () => {
  assert.deepEqual(makePlanningPeriod("monthly", "2024-02-29"), {
    type: "monthly",
    key: "2024-02",
    start: "2024-02-01",
    end: "2024-02-29",
    label: "Şubat 2024",
  });
  assert.equal(makePlanningPeriod("monthly", "2026-02-28").end, "2026-02-28");
  assert.deepEqual(makePlanningPeriod("yearly", "2026-11-07"), {
    type: "yearly",
    key: "2026",
    start: "2026-01-01",
    end: "2026-12-31",
    label: "2026",
  });
  assert.equal(
    makePlanningPeriod("monthly", new Date(2026, 10, 7, 23, 59)).key,
    "2026-11",
  );
});

test("period navigation moves whole weeks, months and years without mutating input", () => {
  const week = makePlanningPeriod("weekly", "2027-01-01");
  const month = makePlanningPeriod("monthly", "2026-01-31");
  const year = makePlanningPeriod("yearly", "2024-02-29");
  const before = JSON.stringify([week, month, year]);
  assert.equal(shiftPlanningPeriod(week, 1).key, "2027-W01");
  assert.equal(shiftPlanningPeriod(week, -1).key, "2026-W52");
  assert.equal(shiftPlanningPeriod(month, 1).end, "2026-02-28");
  assert.equal(shiftPlanningPeriod(month, -1).key, "2025-12");
  assert.equal(shiftPlanningPeriod(month, 13).key, "2027-02");
  assert.equal(shiftPlanningPeriod(year, 1).end, "2025-12-31");
  assert.deepEqual(shiftPlanningPeriod(year, 0), year);
  assert.notEqual(shiftPlanningPeriod(year, 0), year);
  assert.equal(JSON.stringify([week, month, year]), before);
});

test("an explicit period is authoritative even when the delivery date is elsewhere", () => {
  const selected = makePlanningPeriod("weekly", "2026-11-07");
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "2026-W45", dueDate: "2027-03-01" },
      selected,
    ),
    true,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "2026-W44", dueDate: "2026-11-07" },
      selected,
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "monthly", periodKey: "2026-10", dueDate: "2026-11-07" },
      makePlanningPeriod("monthly", "2026-11-07"),
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "yearly", periodKey: "2025", dueDate: "2026-11-07" },
      makePlanningPeriod("yearly", "2026-11-07"),
    ),
    false,
  );
});

test("missing or invalid period keys fall back to valid due dates and all periods retain undated work", () => {
  const selected = makePlanningPeriod("weekly", "2026-11-07");
  for (const periodKey of [
    "",
    undefined,
    "not-a-period",
    "2026-W54",
    "2025-W53",
    "2026-11",
  ]) {
    assert.equal(
      matchesPlanningPeriod(
        { type: "weekly", periodKey, dueDate: "2026-11-07" },
        selected,
      ),
      true,
    );
  }
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "2026-W53", dueDate: "2026-11-07" },
      selected,
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: " 2026-W45 ", dueDate: "" },
      selected,
    ),
    true,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "", dueDate: "2026-02-30" },
      selected,
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "", dueDate: "" },
      selected,
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "monthly", periodKey: "2026-11", dueDate: "2026-11-07" },
      selected,
    ),
    false,
  );
  assert.equal(
    matchesPlanningPeriod(
      { type: "weekly", periodKey: "unrecognized", dueDate: "" },
      null,
    ),
    true,
  );
});

test("filtering does not modify records or period metadata and rejects malformed selection", () => {
  const record = {
    type: "monthly",
    periodKey: "2026-11",
    dueDate: "",
    sourceFields: { Dönem: "2026-11" },
  };
  const period = makePlanningPeriod("monthly", "2026-11-07");
  const before = JSON.stringify([record, period]);
  assert.equal(matchesPlanningPeriod(record, period), true);
  assert.equal(
    matchesPlanningPeriod(record, { type: "monthly", key: "2026-13" }),
    false,
  );
  assert.equal(JSON.stringify([record, period]), before);
  assert.throws(() => makePlanningPeriod("daily", "2026-11-07"), /liste/);
  assert.throws(() => makePlanningPeriod("weekly", "2026-02-30"), /tarihi/);
  assert.throws(() => shiftPlanningPeriod(period, 0.5), /adım/);
  assert.throws(
    () => shiftPlanningPeriod({ type: "weekly", key: "2025-W53" }, 1),
    /dönem/,
  );
});
