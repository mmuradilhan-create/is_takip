import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, goalProgress, validateStore } from "../src/model.js";
import {
  appendWorkLog,
  makeWorkLogEntry,
  normalizeWorkLog,
  totalWorkMs,
  weeklyGoalWorkMs,
  weekWorkSummary,
} from "../src/work-journal.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const timestamp = "2026-11-06T09:00:00.000Z";
const key = "journal-workspace";

function entry(input = {}) {
  return makeWorkLogEntry({
    id: "session-one",
    date: "2026-11-06",
    endedAt: timestamp,
    durationMs: 60000,
    note: "Üç madde incelendi.",
    nextAction: "Tasarım yanıtını kontrol et.",
    ...input,
  });
}

function record(input = {}) {
  return createRecord({
    id: "daily-one",
    title: "VIR dokümanlarını incele",
    nextAction: "İlk üç maddeyi incele.",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  });
}

class MemoryStorage {
  constructor(records) {
    this.values = new Map([[key, JSON.stringify({ version: 1, records })]]);
    this.failWrite = false;
  }
  getItem(name) {
    return this.values.get(name) ?? null;
  }
  setItem(name, value) {
    if (this.failWrite && name === key) throw new Error("Storage is full");
    this.values.set(name, String(value));
  }
}

test("journal entries preserve local dates and plain text while normalizing an explicit ISO timestamp", () => {
  const note = '  <script>alert("özel")</script>\nÜç madde & iki yanıt.  ';
  const result = entry({
    date: "2026-11-07",
    endedAt: "2026-11-07T00:15:20+03:00",
    durationMs: 0,
    note,
  });
  assert.equal(result.date, "2026-11-07");
  assert.equal(result.endedAt, "2026-11-06T21:15:20.000Z");
  assert.equal(result.durationMs, 0);
  assert.equal(result.note, note);
  assert.equal(entry({ note: undefined, nextAction: undefined }).note, "");
  assert.equal(
    entry({ note: undefined, nextAction: undefined }).nextAction,
    "",
  );
});

test("journal validation rejects malformed dates, durations, timestamps, identifiers and oversized text", () => {
  for (const durationMs of [
    -1,
    1.5,
    Infinity,
    NaN,
    "100",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => entry({ durationMs }), /süresi/);
  for (const date of ["2026-02-30", "2026-11-31", "06.11.2026", "", null])
    assert.throws(() => entry({ date }), /tarihi/);
  for (const endedAt of [
    "2026-02-30T09:00:00Z",
    "2026-11-06T24:00:00Z",
    "2026-11-06T09:00:60Z",
    "2026-11-06T09:00:00",
    "2026-11-06",
    "invalid",
  ])
    assert.throws(() => entry({ endedAt }), /ISO/);
  for (const id of ["", "   ", 4, null])
    assert.throws(() => entry({ id }), /kimliği/);
  assert.throws(() => makeWorkLogEntry(null), /nesne/);
  assert.throws(() => entry({ note: "a".repeat(10001) }), /10000/);
  assert.throws(() => entry({ nextAction: {} }), /Sonraki adım/);
  assert.equal(entry({ note: "a".repeat(10000) }).note.length, 10000);
  assert.equal(entry({ date: "2028-02-29" }).date, "2028-02-29");
});

test("append updates the journal and next step together without mutating the original or duplicating a session", () => {
  const original = record();
  const log = entry();
  const result = appendWorkLog(original, log, {
    nextAction: log.nextAction,
    updatedAt: "2026-11-06T10:00:00Z",
  });
  assert.equal(Object.hasOwn(original, "workLog"), false);
  assert.equal(original.nextAction, "İlk üç maddeyi incele.");
  assert.deepEqual(result.workLog, [log]);
  assert.equal(result.nextAction, log.nextAction);
  assert.equal(result.updatedAt, "2026-11-06T10:00:00.000Z");
  assert.equal(result.status, original.status);
  const repeated = appendWorkLog(result, entry({ note: "İkinci deneme" }), {
    nextAction: "Yanlışlıkla üzerine yazma",
  });
  assert.equal(repeated, result);
  assert.equal(repeated.workLog.length, 1);
  assert.equal(repeated.workLog[0].note, log.note);
  assert.equal(repeated.nextAction, log.nextAction);
  assert.equal(appendWorkLog(original, log).nextAction, original.nextAction);
});

test("legacy record canonical form is unchanged and an explicit journal is independently validated and cloned", () => {
  const original = record();
  assert.equal(Object.hasOwn(original, "workLog"), false);
  assert.deepEqual(createRecord(original), original);
  assert.deepEqual(validateStore({ version: 1, records: [original] }).records, [
    original,
  ]);
  const log = entry();
  const source = [log];
  const withLog = record({ workLog: source });
  source[0].note = "Sonradan değişti";
  assert.equal(withLog.workLog[0].note, "Üç madde incelendi.");
  assert.deepEqual(record({ workLog: [] }).workLog, []);
  for (const workLog of [undefined, null, {}, "", [entry(), entry()]])
    assert.throws(() => record({ workLog }), /günlüğü/);
  assert.throws(
    () => normalizeWorkLog([entry({ id: " x " }), entry({ id: "x" })]),
    /Tekrarlanan/,
  );
});

test("native version 1 JSON backups retain the journal, text and next action after a record changes type", () => {
  const original = record({
    workLog: [entry({ note: '<b>İki "özel" madde</b> & yanıt' })],
  });
  const changedType = createRecord({ ...original, type: "meeting" });
  const backup = JSON.stringify({ version: 1, records: [changedType] });
  const restored = validateStore(JSON.parse(backup));
  assert.deepEqual(restored.records, [changedType]);
  assert.deepEqual(restored.records[0].workLog, original.workLog);
  assert.equal(totalWorkMs(restored.records[0]), 60000);
});

test("weekly time counts actual daily work across statuses independently of measured progress", () => {
  const goal = record({
    id: "goal-one",
    type: "weekly",
    targetValue: 8,
    currentValue: 3,
    workLog: [entry({ durationMs: 999 })],
  });
  const children = ["planned", "completed", "cancelled", "transferred"].map(
    (status, i) =>
      record({
        id: `child-${i}`,
        parentId: goal.id,
        status,
        workLog: [entry({ id: `session-${i}`, durationMs: (i + 1) * 60000 })],
      }),
  );
  const unrelated = record({
    id: "unrelated",
    workLog: [entry({ durationMs: 555 })],
  });
  const meeting = record({
    id: "meeting",
    type: "meeting",
    parentId: goal.id,
    workLog: [entry({ durationMs: 555 })],
  });
  const records = [goal, ...children, unrelated, meeting];
  assert.equal(weeklyGoalWorkMs(goal.id, records), 600000);
  assert.equal(weeklyGoalWorkMs("missing", records), 0);
  assert.equal(totalWorkMs(record()), 0);
  assert.deepEqual(goalProgress(goal, records), {
    total: 8,
    completed: 3,
    percent: 38,
    basis: "metric",
  });
});

test("weekly summary uses inclusive local journal dates, includes results and counts only daily actual sessions", () => {
  const first = record({
    id: "first",
    workLog: [
      entry({ id: "before", date: "2026-11-01", durationMs: 1000 }),
      entry({
        id: "monday",
        date: "2026-11-02",
        endedAt: "2026-11-01T22:00:00Z",
        durationMs: 60000,
      }),
      entry({ id: "sunday", date: "2026-11-08", durationMs: 120000 }),
      entry({ id: "after", date: "2026-11-09", durationMs: 1000 }),
    ],
  });
  const second = record({
    id: "second",
    status: "cancelled",
    workLog: [entry({ id: "zero", date: "2026-11-02", durationMs: 0 })],
  });
  const meeting = record({
    id: "meeting",
    type: "meeting",
    workLog: [entry({ durationMs: 100000 })],
  });
  const summary = weekWorkSummary([first, second, meeting], {
    start: "2026-11-02",
    end: "2026-11-08",
  });
  assert.equal(summary.totalMs, 180000);
  assert.equal(summary.sessionCount, 3);
  assert.equal(summary.recordCount, 2);
  assert.deepEqual(summary.byDay, [
    { date: "2026-11-02", totalMs: 60000, sessionCount: 2 },
    { date: "2026-11-08", totalMs: 120000, sessionCount: 1 },
  ]);
  assert.deepEqual(
    summary.byRecord.map(({ recordId, totalMs, sessionCount }) => ({
      recordId,
      totalMs,
      sessionCount,
    })),
    [
      { recordId: "first", totalMs: 180000, sessionCount: 2 },
      { recordId: "second", totalMs: 0, sessionCount: 1 },
    ],
  );
  assert.equal(summary.byRecord[0].entries[0].id, "monday");
  assert.equal(summary.byRecord[0].entries[0].note, "Üç madde incelendi.");
  summary.byRecord[0].entries[0].note = "Özet düzenlemesi";
  assert.equal(first.workLog[1].note, "Üç madde incelendi.");
  assert.throws(
    () => weekWorkSummary([], { start: "2026-11-08", end: "2026-11-02" }),
    /aralığı/,
  );
  assert.throws(
    () => weekWorkSummary([], { start: "2026-02-30", end: "2026-11-02" }),
    /aralığı/,
  );
});

test("duration totals remain safe integers even for an unusually large imported journal", () => {
  const huge = record({
    workLog: [
      entry({ durationMs: Number.MAX_SAFE_INTEGER }),
      entry({ id: "second" }),
    ],
  });
  assert.equal(totalWorkMs(huge), Number.MAX_SAFE_INTEGER);
  assert.equal(
    weekWorkSummary([huge], { start: "2026-11-02", end: "2026-11-08" }).totalMs,
    Number.MAX_SAFE_INTEGER,
  );
});

test("journal plus next step is one durable undo transaction and older canonical history survives reload", () => {
  const original = record();
  const storage = new MemoryStorage([original]);
  const store = createWorkspaceStore({ storage, key });
  const beforeJournal = { ...original, priority: "high" };
  store.saveRecords([beforeJournal], "Öncelik değişikliği");
  const log = entry();
  const logged = appendWorkLog(beforeJournal, log, {
    nextAction: log.nextAction,
  });
  store.saveRecords([logged], "Çalışma oturumu");
  assert.equal(store.history.length, 2);
  store.saveRecords([appendWorkLog(logged, log)], "Yinelenen oturum");
  assert.equal(store.history.length, 2);
  const restoredBackup = validateStore(
    JSON.parse(JSON.stringify({ version: 1, records: store.records })),
  );
  assert.deepEqual(restoredBackup.records, [logged]);
  const reopened = createWorkspaceStore({ storage, key });
  assert.deepEqual(reopened.records, [logged]);
  assert.equal(reopened.undo(), "Çalışma oturumu");
  assert.deepEqual(reopened.records, [beforeJournal]);
  assert.equal(Object.hasOwn(reopened.records[0], "workLog"), false);
  assert.equal(reopened.records[0].nextAction, original.nextAction);
  assert.equal(reopened.undo(), "Öncelik değişikliği");
  assert.deepEqual(reopened.records, [original]);
});

test("failed journal persistence leaves both next step and history untouched", () => {
  const original = record();
  const storage = new MemoryStorage([original]);
  const store = createWorkspaceStore({ storage, key });
  const raw = storage.getItem(key);
  const logged = appendWorkLog(original, entry(), { nextAction: "Yeni adım" });
  storage.failWrite = true;
  assert.throws(() => store.saveRecords([logged], "Çalışma oturumu"), /full/);
  assert.equal(storage.getItem(key), raw);
  assert.deepEqual(store.records, [original]);
  assert.equal(store.canUndo, false);
  const reopened = createWorkspaceStore({ storage, key });
  assert.deepEqual(reopened.records, [original]);
});
