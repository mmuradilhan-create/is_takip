import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import {
  appendFollowUp,
  normalizeFollowUpLog,
  updateFollowUp,
} from "../src/waiting-followup.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const TODAY = "2026-11-08";
const STAMP = "2026-11-07T09:00:00.000Z";
const UPDATED = "2026-11-08T12:00:00.000Z";
const OPTIONS = { today: TODAY, updatedAt: UPDATED };

const entry = (input = {}) => ({
  id: "first",
  date: "2026-11-02",
  note: "İlk görüşmenin sonucu.",
  nextFollowUpDate: "2026-11-07",
  ...input,
});

function fixture(input = {}) {
  return createRecord({
    id: "waiting-edit",
    type: "waiting",
    title: "Takip geçmişini düzelt",
    status: "waiting_response",
    sourceDate: "2026-10-01",
    lastFollowUpDate: "2026-11-07",
    nextFollowUpDate: "2026-11-10",
    latestUpdate: "Son görüşmenin sonucu.",
    nextAction: "Konunun güncel sonraki adımı.",
    description: "Gerçek notlar korunmalı.",
    expectedFrom: "Tasarım ekibi",
    createdAt: STAMP,
    updatedAt: STAMP,
    sourceFields: { Not: "Özgün bilgi", nested: { keep: [1, 2] } },
    followUpLog: [
      entry(),
      entry({
        id: "latest",
        date: "2026-11-07",
        note: "Son görüşmenin sonucu.",
        nextFollowUpDate: "2026-11-10",
      }),
    ],
    ...input,
  });
}

test("previous update is optional, strict, and survives canonical backup and record retyping", () => {
  const original = entry();
  assert.deepEqual(normalizeFollowUpLog([original]), [original]);
  assert.equal(
    Object.hasOwn(normalizeFollowUpLog([original])[0], "previousUpdate"),
    false,
  );
  const preserved = {
    ...original,
    previousUpdate: "  Eski fakat önemli gelişme.\n  ",
  };
  const normalized = normalizeFollowUpLog([preserved])[0];
  assert.equal(normalized.previousUpdate, "Eski fakat önemli gelişme.");
  assert.equal(
    Object.hasOwn(
      normalizeFollowUpLog([{ ...original, previousUpdate: "" }])[0],
      "previousUpdate",
    ),
    true,
  );
  for (const previousUpdate of [
    undefined,
    null,
    42,
    false,
    {},
    [],
    "x".repeat(10001),
  ])
    assert.throws(() =>
      normalizeFollowUpLog([{ ...original, previousUpdate }]),
    );

  const record = fixture({ followUpLog: [normalized] });
  const backup = JSON.parse(JSON.stringify({ version: 1, records: [record] }));
  assert.deepEqual(validateStore(backup), backup);
  const retyped = createRecord({ ...record, type: "meeting" });
  assert.deepEqual(retyped.followUpLog, record.followUpLog);
});

test("recording a new result preserves an unrepresented previous development and retry does not duplicate generated history", () => {
  const original = fixture({
    latestUpdate: "Geçmişte kaybolmaması gereken özel gelişme.",
    followUpLog: [],
  });
  const snapshot = structuredClone(original);
  const input = entry({
    id: "new-follow-up",
    date: TODAY,
    note: "<img src=x> Yeni takip sonucu.",
    nextFollowUpDate: "2026-11-11",
  });
  const result = appendFollowUp(original, input, OPTIONS);
  assert.equal(result.followUpLog.length, 1);
  assert.deepEqual(result.followUpLog[0], {
    ...input,
    previousUpdate: original.latestUpdate,
  });
  assert.equal(result.latestUpdate, input.note);
  assert.equal(appendFollowUp(result, input, OPTIONS), result);
  assert.throws(() =>
    appendFollowUp(result, { ...input, note: "Başka sonuç" }, OPTIONS),
  );
  assert.deepEqual(original, snapshot);
  for (const patch of [
    { note: "  " },
    { note: original.latestUpdate },
    { date: "2026-11-06", note: "Son gelişmeyi değiştirmeyen eski görüşme." },
  ]) {
    const next = appendFollowUp(original, { ...input, ...patch }, OPTIONS);
    assert.equal(Object.hasOwn(next.followUpLog[0], "previousUpdate"), false);
    assert.equal(next.latestUpdate, original.latestUpdate);
  }
  assert.throws(() =>
    appendFollowUp(
      original,
      { ...input, previousUpdate: "Başka ve korunması gereken eski gelişme." },
      OPTIONS,
    ),
  );
  assert.deepEqual(original, snapshot);

  for (const followUpLog of [
    [entry({ note: original.latestUpdate })],
    [entry({ previousUpdate: original.latestUpdate })],
  ]) {
    const represented = fixture({
      latestUpdate: original.latestUpdate,
      followUpLog,
    });
    const next = appendFollowUp(represented, input, OPTIONS);
    assert.equal(
      Object.hasOwn(next.followUpLog.at(-1), "previousUpdate"),
      false,
    );
    assert.deepEqual(next.followUpLog.at(-1), input);
  }
});

test("editing rejects malformed or stale history before mutation and cannot change entry identity", () => {
  const original = fixture();
  const snapshot = structuredClone(original);
  for (const patch of [
    null,
    [],
    { id: "another" },
    { unexpected: "unknown" },
    { date: "2026-02-30" },
    { date: "2026-11-09" },
    { note: { wrong: true } },
    { note: "x".repeat(10001) },
    { nextFollowUpDate: "2026-11-31" },
    { previousUpdate: 12 },
    { previousUpdate: "x".repeat(10001) },
  ])
    assert.throws(() => updateFollowUp(original, "first", patch, OPTIONS));
  assert.throws(() =>
    updateFollowUp(original, "missing", { note: "Yeni" }, OPTIONS),
  );
  assert.throws(() =>
    updateFollowUp(
      { ...original, type: "daily" },
      "first",
      { note: "Yeni" },
      OPTIONS,
    ),
  );
  assert.throws(() =>
    updateFollowUp(
      original,
      "first",
      { note: "Yeni" },
      { ...OPTIONS, updatedAt: "not-a-date" },
    ),
  );
  assert.throws(() =>
    updateFollowUp(
      original,
      "first",
      { note: "Yeni" },
      {
        ...OPTIONS,
        expectedEntry: { ...original.followUpLog[0], note: "Stale" },
      },
    ),
  );
  assert.throws(() =>
    updateFollowUp(
      original,
      "first",
      { note: "Yeni" },
      { ...OPTIONS, expectedEntry: null },
    ),
  );
  assert.deepEqual(original, snapshot);
  assert.equal(updateFollowUp(original, "first", {}, OPTIONS), original);
  assert.equal(
    updateFollowUp(
      original,
      "first",
      { note: `  ${original.followUpLog[0].note}  ` },
      OPTIONS,
    ),
    original,
  );
});

test("closed waiting topics allow corrections to real saved entries while unrelated data and historical plans remain intact", () => {
  for (const status of ["completed", "cancelled", "transferred"]) {
    const original = fixture({ status });
    const snapshot = structuredClone(original);
    const result = updateFollowUp(
      original,
      "first",
      {
        note: "İlk görüşmenin düzeltilmiş sonucu.",
        nextFollowUpDate: "2020-01-01",
        previousUpdate: "Önceki gelişme saklandı.",
      },
      { ...OPTIONS, expectedEntry: original.followUpLog[0] },
    );
    assert.equal(result.status, status);
    assert.equal(result.followUpLog[0].id, "first");
    assert.equal(
      result.followUpLog[0].note,
      "İlk görüşmenin düzeltilmiş sonucu.",
    );
    assert.equal(result.followUpLog[0].nextFollowUpDate, "2020-01-01");
    assert.equal(
      result.followUpLog[0].previousUpdate,
      "Önceki gelişme saklandı.",
    );
    assert.deepEqual(result.followUpLog[1], original.followUpLog[1]);
    for (const key of [
      "id",
      "title",
      "sourceDate",
      "createdAt",
      "sourceFields",
      "nextAction",
      "description",
      "expectedFrom",
    ])
      assert.deepEqual(result[key], original[key]);
    assert.equal(result.updatedAt, UPDATED);
    assert.deepEqual(original, snapshot);
  }
});

test("chronological corrections update only managed current values, including promoting an older entry or moving the latest earlier", () => {
  const original = fixture();
  const before = structuredClone(original);
  const older = updateFollowUp(
    original,
    "first",
    { note: "Eski görüşmenin düzeltilmiş sonucu." },
    OPTIONS,
  );
  assert.equal(older.latestUpdate, original.latestUpdate);
  assert.equal(older.lastFollowUpDate, original.lastFollowUpDate);
  assert.equal(older.nextFollowUpDate, original.nextFollowUpDate);

  const promoted = updateFollowUp(
    original,
    "first",
    {
      date: TODAY,
      note: "Düzeltilen tarih artık son görüşme.",
      nextFollowUpDate: "2026-11-06",
    },
    OPTIONS,
  );
  assert.deepEqual(
    promoted.followUpLog.map((item) => item.id),
    ["first", "latest"],
  );
  assert.equal(promoted.lastFollowUpDate, TODAY);
  assert.equal(promoted.latestUpdate, "Düzeltilen tarih artık son görüşme.");
  assert.equal(promoted.nextFollowUpDate, "2026-11-06");
  assert.deepEqual(promoted.followUpLog[1], original.followUpLog[1]);

  const movedEarlier = updateFollowUp(
    original,
    "latest",
    { date: "2026-11-01" },
    OPTIONS,
  );
  assert.equal(movedEarlier.lastFollowUpDate, original.followUpLog[0].date);
  assert.equal(movedEarlier.latestUpdate, original.followUpLog[0].note);
  assert.equal(
    movedEarlier.nextFollowUpDate,
    original.followUpLog[0].nextFollowUpDate,
  );
  assert.deepEqual(original, before);
});

test("clearing a result replays real previous developments and preserves independent manual overrides", () => {
  const original = fixture();
  const cleared = updateFollowUp(original, "latest", { note: "  " }, OPTIONS);
  assert.equal(cleared.latestUpdate, original.followUpLog[0].note);
  assert.equal(cleared.lastFollowUpDate, original.lastFollowUpDate);
  assert.equal(cleared.nextFollowUpDate, original.nextFollowUpDate);

  const manualPrevious = fixture({
    followUpLog: [
      entry(),
      entry({
        id: "latest",
        date: "2026-11-07",
        note: "Son görüşmenin sonucu.",
        nextFollowUpDate: "2026-11-10",
        previousUpdate: "Arada yazılmış özel gelişme.",
      }),
    ],
  });
  const restoredManual = updateFollowUp(
    manualPrevious,
    "latest",
    { note: "" },
    OPTIONS,
  );
  assert.equal(restoredManual.latestUpdate, "Arada yazılmış özel gelişme.");
  assert.equal(
    restoredManual.followUpLog[1].previousUpdate,
    "Arada yazılmış özel gelişme.",
  );

  const single = fixture({
    lastFollowUpDate: "2026-11-02",
    nextFollowUpDate: "2026-11-07",
    latestUpdate: "İlk görüşmenin sonucu.",
    followUpLog: [entry({ previousUpdate: "Takipten önceki özgün gelişme." })],
  });
  assert.equal(
    updateFollowUp(single, "first", { note: "" }, OPTIONS).latestUpdate,
    "Takipten önceki özgün gelişme.",
  );

  const patch = {
    date: TODAY,
    note: "Yeni düzeltilmiş sonuç.",
    nextFollowUpDate: "2026-11-12",
  };
  for (const [key, value] of [
    ["lastFollowUpDate", "2026-11-06"],
    ["nextFollowUpDate", "2026-12-01"],
    ["latestUpdate", "Kullanıcının ayrıca yazdığı güncel gelişme."],
  ]) {
    const manual = fixture({ [key]: value });
    const result = updateFollowUp(manual, "first", patch, OPTIONS);
    assert.equal(result[key], value);
    for (const [managedKey, newValue] of [
      ["lastFollowUpDate", TODAY],
      ["nextFollowUpDate", "2026-11-12"],
      ["latestUpdate", patch.note],
    ])
      if (managedKey !== key) assert.equal(result[managedKey], newValue);
  }
});

test("same-day order, full expected snapshots and absent optional live fields stay unambiguous", () => {
  const original = fixture({
    followUpLog: [
      entry({ date: "2026-11-07" }),
      entry({
        id: "latest",
        date: "2026-11-07",
        note: "Son görüşmenin sonucu.",
        nextFollowUpDate: "2026-11-10",
        previousUpdate: "Ara bilgi.",
      }),
    ],
  });
  const older = updateFollowUp(
    original,
    "first",
    { note: "Aynı günün önceki görüşmesi." },
    OPTIONS,
  );
  assert.equal(older.latestUpdate, original.latestUpdate);
  const cleared = updateFollowUp(older, "latest", { note: "" }, OPTIONS);
  assert.equal(cleared.latestUpdate, "Ara bilgi.");
  assert.throws(() =>
    updateFollowUp(
      original,
      "latest",
      { note: "Yeni" },
      {
        ...OPTIONS,
        expectedEntry: {
          ...original.followUpLog[1],
          previousUpdate: "Başka eski bilgi.",
        },
      },
    ),
  );
  const normalizedExpected = {
    ...original.followUpLog[1],
    note: `  ${original.followUpLog[1].note}  `,
    previousUpdate: "  Ara bilgi.  ",
  };
  assert.equal(
    updateFollowUp(
      original,
      "latest",
      { note: original.followUpLog[1].note },
      { ...OPTIONS, expectedEntry: normalizedExpected },
    ),
    original,
  );

  const legacy = createRecord({
    id: "legacy-optional-live",
    type: "waiting",
    title: "Eski takip geçmişi",
    followUpLog: [entry()],
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  const corrected = updateFollowUp(
    legacy,
    "first",
    { note: "Düzeltilen geçmiş." },
    OPTIONS,
  );
  assert.equal(Object.hasOwn(corrected, "latestUpdate"), false);
  assert.equal(Object.hasOwn(corrected, "nextFollowUpDate"), false);
  assert.equal(corrected.lastFollowUpDate, "");
});

test("a correction is one durable undo action, backup preserves previous text, and a failed write is safely retryable", () => {
  const original = fixture();
  const key = "waiting-follow-up-edit";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: [original] })],
  ]);
  let failWrite = false;
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem(name, value) {
      if (failWrite && name === key) throw new Error("Storage is full");
      values.set(name, String(value));
    },
  };
  const store = createWorkspaceStore({ storage, key });
  const patch = {
    note: "Düzeltilmiş gerçek takip.",
    previousUpdate: "Korunan eski gelişme.",
  };
  const changed = updateFollowUp(store.records[0], "first", patch, {
    ...OPTIONS,
    expectedEntry: original.followUpLog[0],
  });
  const beforeRaw = storage.getItem(key);
  failWrite = true;
  assert.throws(() => store.saveRecords([changed], "Takip düzeltme"), /full/);
  assert.equal(storage.getItem(key), beforeRaw);
  assert.deepEqual(store.records, [original]);
  assert.equal(store.canUndo, false);
  failWrite = false;
  assert.equal(store.saveRecords([changed], "Takip düzeltme"), true);
  const saved = JSON.parse(storage.getItem(key));
  assert.equal(saved.odak.history.length, 1);
  assert.deepEqual(validateStore(JSON.parse(JSON.stringify(saved))).records, [
    changed,
  ]);
  const reopened = createWorkspaceStore({ storage, key });
  const unchanged = updateFollowUp(reopened.records[0], "first", patch, {
    ...OPTIONS,
    expectedEntry: reopened.records[0].followUpLog[0],
  });
  assert.equal(unchanged.followUpLog.length, original.followUpLog.length);
  assert.deepEqual(unchanged, changed);
  assert.equal(reopened.undo(), "Takip düzeltme");
  assert.deepEqual(reopened.records, [original]);
  assert.deepEqual(JSON.parse(storage.getItem(key)).records, [original]);
});
