import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { selectOverview } from "../src/dashboard-model.js";
import { makeHistoryEntry, undoEntry } from "../src/workspace-history.js";
import {
  appendFollowUp,
  followUpPresentation,
  normalizeFollowUpLog,
  waitingAge,
} from "../src/waiting-followup.js";

const NOW = "2026-11-07T12:00:00.000Z";
const STAMP = "2026-07-01T09:00:00.000Z";
const TODAY = "2026-11-07";
const options = { today: TODAY, updatedAt: NOW };
const waiting = (input = {}) =>
  createRecord({
    id: "waiting-primary",
    type: "waiting",
    title: "Yanıtı beklenen konu",
    sourceDate: "2026-07-17",
    lastFollowUpDate: "2026-10-30",
    expectedFrom: "Tasarım ekibi",
    description: "Kullanıcının gerçek notu.",
    status: "waiting_response",
    createdAt: STAMP,
    updatedAt: STAMP,
    sourceFields: { "Korunacak alan": "Özgün bilgi" },
    ...input,
  });
const entry = (input = {}) => ({
  id: "follow-up-first",
  date: TODAY,
  note: "Tasarım ekibine yeniden soruldu.",
  nextFollowUpDate: "2026-11-10",
  ...input,
});

test("waiting age counts calendar days without inventing a start or closing date", () => {
  assert.equal(waitingAge(waiting(), TODAY), 113);
  assert.equal(waitingAge(waiting({ sourceDate: TODAY }), TODAY), 0);
  assert.equal(waitingAge(waiting({ sourceDate: "" }), TODAY), null);
  assert.equal(waitingAge(waiting({ sourceDate: "2026-11-08" }), TODAY), null);
  assert.equal(waitingAge(waiting(), "2026-02-30"), null);
  assert.equal(waitingAge(waiting({ type: "daily" }), TODAY), null);
  for (const status of ["completed", "cancelled", "transferred"])
    assert.equal(waitingAge(waiting({ status }), TODAY), null);
  assert.equal(
    waitingAge(waiting({ sourceDate: "2024-03-30" }), "2024-04-01"),
    2,
  );
  assert.equal(
    waitingAge(waiting({ sourceDate: "2024-02-28" }), "2024-03-01"),
    2,
  );
});

test("next follow-up presentation has explicit missing, late, near and closed states", () => {
  for (const [next, state, tone, icon] of [
    ["", "missing", "", "minus"],
    ["2026-11-06", "overdue", "overdue", "warning"],
    [TODAY, "today", "due-soon", "clock"],
    ["2026-11-10", "soon", "due-soon", "clock"],
    ["2026-11-11", "scheduled", "", "calendar"],
  ]) {
    const shown = followUpPresentation(
      waiting({ nextFollowUpDate: next }),
      TODAY,
    );
    assert.equal(shown.state, state);
    assert.equal(shown.tone, tone);
    assert.equal(shown.icon, icon);
    assert.equal(shown.date, next);
    assert.equal(shown.daysSinceLastFollowUp, 8);
  }
  assert.equal(followUpPresentation(waiting(), TODAY).label, "Takip planla");
  const closed = followUpPresentation(
    waiting({ status: "completed", nextFollowUpDate: "2026-11-01" }),
    TODAY,
  );
  assert.equal(closed.state, "closed");
  assert.equal(closed.tone, "");
  assert.equal(
    followUpPresentation(waiting({ status: "completed" }), TODAY).label,
    "Takip yok",
  );
});

test("one follow-up records history, latest result and next reminder atomically", () => {
  const original = waiting({
    latestUpdate: "Önceki bilgi.",
    nextFollowUpDate: "2026-11-06",
  });
  const snapshot = JSON.stringify(original);
  const next = appendFollowUp(original, entry(), options);
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(next.followUpLog, [
    { ...entry(), previousUpdate: original.latestUpdate },
  ]);
  assert.equal(next.lastFollowUpDate, TODAY);
  assert.equal(next.nextFollowUpDate, "2026-11-10");
  assert.equal(next.latestUpdate, entry().note);
  assert.equal(next.updatedAt, NOW);
  assert.equal(next.status, original.status);
  assert.equal(next.description, original.description);
  assert.equal(next.sourceDate, original.sourceDate);
  assert.deepEqual(next.sourceFields, original.sourceFields);
  assert.equal(appendFollowUp(next, entry(), options), next);
  assert.throws(
    () => appendFollowUp(next, entry({ note: "Değişen sonuç" }), options),
    /farklı içerikle/,
  );
  assert.equal(next.followUpLog.length, 1);
});

test("backdated or blank follow-up notes preserve the current latest result and can explicitly clear reminders", () => {
  const original = waiting({
    latestUpdate: "Geçerli son gelişme.",
    nextFollowUpDate: "2026-11-09",
  });
  const past = appendFollowUp(
    original,
    entry({
      date: "2026-10-29",
      note: "Eski görüşmenin kaydı.",
      nextFollowUpDate: "",
    }),
    options,
  );
  assert.equal(past.lastFollowUpDate, original.lastFollowUpDate);
  assert.equal(past.latestUpdate, original.latestUpdate);
  assert.equal(past.nextFollowUpDate, "");
  assert.equal(past.followUpLog[0].note, "Eski görüşmenin kaydı.");
  const blank = appendFollowUp(
    past,
    entry({ id: "follow-up-second", note: "  " }),
    options,
  );
  assert.equal(blank.lastFollowUpDate, TODAY);
  assert.equal(blank.latestUpdate, original.latestUpdate);
  assert.equal(blank.followUpLog[1].note, "");
});

test("malformed follow-up input is rejected before mutation while backups do not depend on today's date", () => {
  const original = waiting();
  const snapshot = JSON.stringify(original);
  for (const patch of [
    { id: "" },
    { date: "2026-02-30" },
    { date: "2026-11-08" },
    { nextFollowUpDate: "2026-11-31" },
    { note: { unexpected: true } },
    { note: "x".repeat(10001) },
  ])
    assert.throws(() => appendFollowUp(original, entry(patch), options));
  for (const status of ["completed", "cancelled", "transferred"])
    assert.throws(
      () => appendFollowUp(waiting({ status }), entry(), options),
      /açık bekleyen/,
    );
  assert.throws(() =>
    appendFollowUp(waiting({ type: "daily" }), entry(), options),
  );
  assert.throws(() =>
    appendFollowUp(original, entry(), {
      ...options,
      updatedAt: "2026-02-30T12:00:00Z",
    }),
  );
  assert.equal(JSON.stringify(original), snapshot);
  assert.throws(() => normalizeFollowUpLog({}), /liste/);
  assert.throws(() => normalizeFollowUpLog([entry(), entry()]), /Tekrarlanan/);
  assert.deepEqual(normalizeFollowUpLog([entry({ date: "2099-01-01" })]), [
    entry({ date: "2099-01-01" }),
  ]);
});

test("optional fields preserve legacy canonical records, backup round trips and exact atomic undo", () => {
  const original = waiting();
  for (const key of ["nextFollowUpDate", "latestUpdate", "followUpLog"])
    assert.equal(Object.hasOwn(original, key), false);
  assert.deepEqual(validateStore({ version: 1, records: [original] }).records, [
    original,
  ]);
  const next = createRecord(appendFollowUp(original, entry(), options));
  const backup = JSON.parse(JSON.stringify({ version: 1, records: [next] }));
  assert.deepEqual(validateStore(backup), backup);
  const before = {
    records: [original],
    preferences: { density: "comfortable" },
  };
  const after = { ...before, records: [next] };
  const history = makeHistoryEntry(before, after, "Takip kaydı");
  assert.deepEqual(undoEntry(after, history), before);
  const retyped = createRecord({ ...next, type: "meeting" });
  for (const key of ["nextFollowUpDate", "latestUpdate", "followUpLog"])
    assert.deepEqual(retyped[key], next[key]);
  assert.throws(
    () => createRecord({ ...original, nextFollowUpDate: "2026-02-30" }),
    /tarih/,
  );
  assert.throws(
    () => createRecord({ ...original, latestUpdate: 42 }),
    /Son gelişme/,
  );
  assert.throws(
    () => createRecord({ ...original, followUpLog: [entry(), entry()] }),
    /Tekrarlanan/,
  );
});

test("waiting overview prioritizes next reminders and searches current follow-up context", () => {
  const original = [
    waiting({ id: "no-plan", lastFollowUpDate: "2026-07-01" }),
    waiting({ id: "later", nextFollowUpDate: "2026-11-10" }),
    waiting({
      id: "overdue",
      nextFollowUpDate: "2026-11-06",
      latestUpdate: "Firma geri dönecek.",
    }),
    waiting({
      id: "closed",
      status: "completed",
      nextFollowUpDate: "2026-01-01",
    }),
    waiting({ id: "no-plan-newer", lastFollowUpDate: "2026-08-01" }),
  ];
  const snapshot = JSON.stringify(original);
  assert.deepEqual(
    selectOverview(original, "waiting", { limit: Infinity }).map((x) => x.id),
    ["overdue", "later", "no-plan", "no-plan-newer"],
  );
  assert.deepEqual(
    selectOverview(original, "waiting", { query: "Firma geri" }).map(
      (x) => x.id,
    ),
    ["overdue"],
  );
  assert.equal(
    selectOverview(original, "waiting", {
      query: "Tasarım ekibi",
      limit: Infinity,
    }).length,
    4,
  );
  assert.equal(JSON.stringify(original), snapshot);
});
