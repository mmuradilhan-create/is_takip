import test from "node:test";
import assert from "node:assert/strict";
import { sortListRecords, paginateRecords } from "../src/list-view.js";

const record = (id, patch = {}) => ({
  id,
  title: `Örnek ${id}`,
  dueDate: "",
  createdAt: "2026-11-01T09:00:00.000Z",
  sourceFields: { "Özgün bilgi": "Korunur" },
  ...patch,
});
const ids = (records) => records.map((item) => item.id);

test("delivery sorting supports both directions while keeping missing dates last", () => {
  const original = [
    record("missing-first"),
    record("far", { dueDate: "2026-12-01" }),
    record("overdue", { dueDate: "2026-10-01" }),
    record("today", { dueDate: "2026-11-07" }),
    record("missing-second", { dueDate: undefined }),
  ];
  assert.deepEqual(ids(sortListRecords(original, "due-asc")), [
    "overdue",
    "today",
    "far",
    "missing-first",
    "missing-second",
  ]);
  assert.deepEqual(ids(sortListRecords(original, "due-desc")), [
    "far",
    "today",
    "overdue",
    "missing-first",
    "missing-second",
  ]);
});

test("creation sorting defaults to newest records and resolves exact ties by stable id", () => {
  const original = [
    record("old", { createdAt: "2026-06-01T09:00:00.000Z" }),
    record("new-b", { createdAt: "2026-11-07T11:00:00.000Z" }),
    record("new-a", { createdAt: "2026-11-07T11:00:00.000Z" }),
    record("missing", { createdAt: "" }),
    record("middle", { createdAt: "2026-10-31T20:30:00.000Z" }),
  ];
  const newest = ["new-a", "new-b", "middle", "old", "missing"];
  assert.deepEqual(ids(sortListRecords(original)), newest);
  assert.deepEqual(ids(sortListRecords(original, "unknown")), newest);
  assert.deepEqual(ids(sortListRecords(original, "created-asc")), [
    "old",
    "middle",
    "new-a",
    "new-b",
    "missing",
  ]);
});

test("waiting follow-up ordering uses its reminder date without changing creation sorting", () => {
  const original = [
    record("planned-later", {
      dueDate: "2026-01-01",
      nextFollowUpDate: "2026-11-10",
      createdAt: "2026-11-06T09:00:00.000Z",
    }),
    record("planned-near", {
      dueDate: "2026-12-01",
      nextFollowUpDate: "2026-11-07",
      createdAt: "2026-11-07T09:00:00.000Z",
    }),
    record("not-planned", { dueDate: "2026-11-08" }),
  ];
  const options = { dateField: "nextFollowUpDate" };
  assert.deepEqual(ids(sortListRecords(original, "due-asc", options)), [
    "planned-near",
    "planned-later",
    "not-planned",
  ]);
  assert.deepEqual(ids(sortListRecords(original, "due-desc", options)), [
    "planned-later",
    "planned-near",
    "not-planned",
  ]);
  assert.deepEqual(ids(sortListRecords(original, "created-desc", options)), [
    "planned-near",
    "planned-later",
    "not-planned",
  ]);
});

test("sorting preserves every saved object and does not mutate frozen source order", () => {
  const original = Object.freeze([
    Object.freeze(record("b", { dueDate: "2026-11-07" })),
    Object.freeze(record("a", { dueDate: "2026-11-07" })),
  ]);
  const saved = JSON.stringify(original);
  const sorted = sortListRecords(original, "due-desc");
  assert.notEqual(sorted, original);
  assert.deepEqual(ids(sorted), ["a", "b"]);
  assert.equal(sorted[0], original[1]);
  assert.equal(sorted[1], original[0]);
  assert.equal(JSON.stringify(original), saved);
});

test("52 and 101 records paginate into fifty-row pages with correct visible ranges", () => {
  for (const total of [52, 101]) {
    const original = Array.from({ length: total }, (_, index) =>
      record(`row-${index}`),
    );
    const count = Math.ceil(total / 50);
    const first = paginateRecords(original, 1);
    assert.equal(first.records.length, 50);
    assert.deepEqual(
      { ...first, records: [] },
      { records: [], total, page: 1, pageCount: count, start: 1, end: 50 },
    );
    const last = paginateRecords(original, count);
    assert.equal(last.records.length, total - (count - 1) * 50);
    assert.equal(last.start, (count - 1) * 50 + 1);
    assert.equal(last.end, total);
    assert.equal(last.records[0], original[last.start - 1]);
    const flattened = Array.from(
      { length: count },
      (_, index) => paginateRecords(original, index + 1).records,
    ).flat();
    assert.deepEqual(flattened, original);
  }
});

test("filtering and deletion clamp stale pages without returning an empty false page", () => {
  const original = Array.from({ length: 101 }, (_, index) =>
    record(`row-${index}`),
  );
  assert.equal(paginateRecords(original, 999).page, 3);
  const afterDelete = paginateRecords(original.slice(0, 100), 3);
  assert.equal(afterDelete.page, 2);
  assert.equal(afterDelete.records.length, 50);
  assert.equal(afterDelete.start, 51);
  assert.equal(afterDelete.end, 100);
  const afterFilter = paginateRecords(original.slice(0, 2), 3);
  assert.equal(afterFilter.page, 1);
  assert.equal(afterFilter.records.length, 2);
  assert.deepEqual(paginateRecords([], 3), {
    records: [],
    total: 0,
    page: 1,
    pageCount: 1,
    start: 0,
    end: 0,
  });
});

test("page inputs normalize safely and no page can exceed the fifty-row limit", () => {
  const original = Object.freeze(
    Array.from({ length: 101 }, (_, index) =>
      Object.freeze(record(`row-${index}`)),
    ),
  );
  const saved = JSON.stringify(original);
  for (const invalid of [
    undefined,
    null,
    NaN,
    Infinity,
    -1,
    0,
    "no page",
    {},
    Symbol("page"),
  ])
    assert.equal(paginateRecords(original, invalid).page, 1);
  assert.equal(paginateRecords(original, "2").page, 2);
  assert.equal(paginateRecords(original, 2.8).page, 2);
  assert.equal(paginateRecords(original, 1, 1000).records.length, 50);
  assert.equal(paginateRecords(original, 2, 3).records.length, 3);
  assert.equal(paginateRecords(original, 2, 3).records[0], original[3]);
  assert.equal(paginateRecords(original, 1, 0).records.length, 50);
  assert.equal(JSON.stringify(original), saved);
  assert.throws(() => sortListRecords(null), /liste/);
  assert.throws(() => paginateRecords(null), /liste/);
});
