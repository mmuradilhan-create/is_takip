import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { makeHistoryEntry } from "../src/workspace-history.js";
import {
  HistoryConflictError,
  describeHistoryEntry,
  revertHistoryEntry,
} from "../src/history-revert.js";

const STAMP = "2026-11-01T08:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const workspace = (records, notes) => ({
  records,
  preferences: { density: "compact" },
  ...(notes ? { notes } : {}),
});
const note = (id, text) => ({ id, text, createdAt: STAMP, updatedAt: STAMP });

test("one earlier action is undone alone while later actions on other records stay", () => {
  const start = workspace([record("a"), record("b")]);
  const first = workspace([record("a", { status: "completed" }), record("b")]);
  const second = workspace([
    record("a", { status: "completed" }),
    record("b", { priority: "urgent" }),
  ]);
  const entry = makeHistoryEntry(start, first, "Durum güncelleme");
  makeHistoryEntry(first, second, "Öncelik");
  const result = revertHistoryEntry(second, entry);
  assert.equal(result.records[0].status, "planned");
  assert.equal(result.records[1].priority, "urgent");
  assert.deepEqual(result.preferences, start.preferences);
  assert.equal(describeHistoryEntry(entry), "İş a");
});

test("a later change to the same record blocks undoing the earlier one", () => {
  const start = workspace([record("a")]);
  const first = workspace([record("a", { status: "completed" })]);
  const second = workspace([
    record("a", { status: "completed", priority: "high" }),
  ]);
  const entry = makeHistoryEntry(start, first, "Durum güncelleme");
  assert.throws(
    () => revertHistoryEntry(second, entry),
    (error) =>
      error instanceof HistoryConflictError &&
      /“İş a”.*yeniden değişti/.test(error.message),
  );
});

test("a deleted record returns beside its old neighbours and a created one is removed", () => {
  const start = workspace([record("a"), record("b"), record("c")]);
  const deleted = workspace([record("a"), record("c")]);
  const deleteEntry = makeHistoryEntry(start, deleted, "Silme");
  const later = workspace([record("x"), record("a"), record("c")]);
  assert.deepEqual(
    revertHistoryEntry(later, deleteEntry).records.map((item) => item.id),
    ["x", "a", "b", "c"],
  );
  const createEntry = makeHistoryEntry(deleted, later, "Yeni kayıt");
  assert.deepEqual(
    revertHistoryEntry(later, createEntry).records.map((item) => item.id),
    ["a", "c"],
  );
});

test("note changes are undone per note and settings only when unchanged since", () => {
  const start = workspace(
    [record("a")],
    [note("n1", "Bir"), note("n2", "İki")],
  );
  const edited = workspace(
    [record("a")],
    [note("n1", "Bir düzeltildi"), note("n2", "İki")],
  );
  const entry = makeHistoryEntry(start, edited, "Not düzenleme");
  const later = workspace(
    [record("a")],
    [note("n1", "Bir düzeltildi"), note("n2", "İki sonra")],
  );
  assert.deepEqual(
    revertHistoryEntry(later, entry).notes.map((item) => item.text),
    ["Bir", "İki sonra"],
  );
  assert.equal(describeHistoryEntry(entry), "Bir düzeltildi");
  const themed = {
    ...start,
    preferences: { density: "compact", theme: "dark" },
  };
  const themeEntry = makeHistoryEntry(start, themed, "Görünüm");
  assert.deepEqual(
    revertHistoryEntry(themed, themeEntry).preferences,
    start.preferences,
  );
  assert.throws(
    () =>
      revertHistoryEntry(
        { ...themed, preferences: { density: "compact", theme: "light" } },
        themeEntry,
      ),
    HistoryConflictError,
  );
});
