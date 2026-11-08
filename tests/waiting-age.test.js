import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import { buildWorkbook, parseExcelFile } from "../src/excel.js";
import {
  stampWaitingClosures,
  waitingAge,
  waitingAgePresentation,
} from "../src/waiting-age.js";

const KEY = "waiting-age-workspace";
const CLOSURE = "__waitingClosure";
const NOW = "2026-11-08T12:00:00.000Z";
const DAY = "2026-11-08";
const STAMP = "2026-10-01T09:00:00.000Z";
const record = (input = {}) =>
  createRecord({
    id: "waiting-age-primary",
    type: "waiting",
    title: "Dış yanıt beklenen konu",
    status: "waiting_response",
    sourceDate: "2026-10-29",
    createdAt: STAMP,
    updatedAt: STAMP,
    sourceFields: {
      "Kaç Gün Bekledi": 37,
      __formulas: {
        "Kaç Gün Bekledi": { formula: "TODAY()-A2", result: 37 },
      },
      nested: { original: [1, "korunacak bilgi"] },
    },
    ...input,
  });
const close = (before, options = { closedAt: NOW, closedDate: DAY }) =>
  stampWaitingClosures(
    [before],
    [{ ...before, status: "completed" }],
    options,
  )[0];
const proof = (input = {}) => ({
  version: 1,
  closedDate: DAY,
  closedAt: NOW,
  ...input,
});

test("an actual closing edit records its end once without mutating source fields or guessing from last updates", () => {
  const before = record({ lastFollowUpDate: "2026-11-06" });
  const raw = JSON.stringify(before);
  const closed = close(before);
  assert.deepEqual(closed.sourceFields[CLOSURE], proof());
  assert.equal(waitingAge(closed, "2028-01-01"), 10);
  assert.equal(waitingAge(closed, "2026-11-08"), 10);
  assert.equal(closed.updatedAt, before.updatedAt);
  assert.deepEqual(
    { ...closed.sourceFields, [CLOSURE]: undefined },
    { ...before.sourceFields, [CLOSURE]: undefined },
  );
  assert.equal(JSON.stringify(before), raw);
  assert.equal(waitingAge(record({ status: "completed" }), DAY), null);
  const view = waitingAgePresentation(closed, "2028-01-01");
  assert.equal(view.kind, "closure");
  assert.equal(view.text, "10 gün");
  assert.equal(view.description, "10 gün bekledi");
  assert.match(view.title, /Kapanış:/);
  assert.doesNotMatch(view.ariaLabel, /Excel|gündür bekliyor/);
  assert.equal(waitingAge(close(record({ sourceDate: DAY }))), 0);
  assert.equal(
    waitingAge(
      close(record({ sourceDate: "2024-02-28" }), {
        closedAt: "2024-03-01T12:00:00.000Z",
        closedDate: "2024-03-01",
      }),
    ),
    2,
  );
});

test("reopening resumes the live age and a later closing replaces the end while ordinary closed edits preserve it", () => {
  const closed = close(record());
  const reopened = { ...closed, status: "follow_up" };
  const reopening = stampWaitingClosures([closed], [reopened]);
  assert.equal(reopening[0], reopened);
  assert.equal(waitingAge(reopened, "2026-11-10"), 12);
  assert.equal(waitingAgePresentation(reopened, "2026-11-10").kind, "live");
  const reclosed = close(reopened, {
    closedAt: "2026-11-12T09:00:00.000Z",
    closedDate: "2026-11-12",
  });
  assert.equal(waitingAge(reclosed, "2029-01-01"), 14);
  assert.equal(reclosed.sourceFields[CLOSURE].closedDate, "2026-11-12");
  const edited = {
    ...reclosed,
    description: "Düzeltilen not",
    sourceDate: "2026-10-30",
  };
  const next = [edited];
  assert.equal(stampWaitingClosures([reclosed], next), next);
  assert.equal(edited.sourceFields[CLOSURE], reclosed.sourceFields[CLOSURE]);
  assert.equal(waitingAge(edited), 13);
  assert.equal(waitingAge({ ...edited, sourceDate: "2026-11-13" }), null);
});

test("new closed records, restored history, unchanged records and type changes gain no synthetic closure", () => {
  const historical = record({ status: "completed" });
  const original = JSON.stringify(historical);
  for (const [previous, next] of [
    [[], [historical]],
    [[historical], [historical]],
    [[historical], [{ ...historical, description: "Yeni not" }]],
    [[record({ type: "daily" })], [historical]],
    [[record()], [{ ...historical, type: "daily" }]],
  ])
    assert.equal(stampWaitingClosures(previous, next), next);
  const duplicates = [record(), record()];
  const incoming = [historical];
  assert.equal(stampWaitingClosures(duplicates, incoming), incoming);
  assert.equal(JSON.stringify(historical), original);
  assert.equal(Object.hasOwn(historical.sourceFields, CLOSURE), false);
  const open = record();
  const next = [{ ...open, status: "completed" }];
  assert.throws(
    () => stampWaitingClosures([open], next, { closedAt: "bad" }),
    /kapanış zamanı/,
  );
  assert.throws(
    () =>
      stampWaitingClosures([open], next, {
        closedAt: NOW,
        closedDate: "2026-02-30",
      }),
    /kapanış tarihi/,
  );
  assert.equal(Object.hasOwn(next[0].sourceFields, CLOSURE), false);
});

test("a present but invalid close marker or invalid start cannot fall back to a stale imported count", () => {
  const invalid = [
    null,
    false,
    [],
    {},
    proof({ version: 2 }),
    proof({ closedDate: "2026-02-30" }),
    proof({ closedAt: "2026-11-08T25:00:00Z" }),
    proof({ closedAt: "2026-02-30T12:00:00Z" }),
  ];
  for (const marker of invalid) {
    const item = record({
      status: "completed",
      sourceFields: { "Kaç Gün Bekledi": 37, [CLOSURE]: marker },
    });
    const raw = JSON.stringify(item);
    assert.equal(waitingAgePresentation(item, DAY).kind, "unknown");
    assert.equal(waitingAgePresentation(item, DAY).days, null);
    assert.equal(JSON.stringify(item), raw);
  }
  for (const sourceDate of ["", "2026-02-30", "2026-11-09"]) {
    const item = {
      ...record({ status: "completed" }),
      sourceDate,
      sourceFields: { "Kaç Gün Bekledi": 37, [CLOSURE]: proof() },
    };
    assert.equal(waitingAgePresentation(item, DAY).kind, "unknown");
    assert.equal(waitingAge(item, DAY), null);
  }
});

test("legacy integer counts remain qualified Excel snapshots rather than invented closed totals", () => {
  for (const count of [0, 37]) {
    const item = record({
      status: "completed",
      sourceFields: { "Kaç Gün Bekledi": count },
    });
    const raw = JSON.stringify(item);
    const shown = waitingAgePresentation(item, DAY);
    assert.equal(shown.kind, "imported");
    assert.equal(shown.text, `${count} gün`);
    assert.match(
      shown.title,
      /Excel’den aktarılan süre; kapanış tarihi bilinmiyor/,
    );
    assert.match(shown.ariaLabel, /kapanış tarihi bilinmiyor/);
    assert.doesNotMatch(shown.description, /gündür bekliyor|gün bekledi/);
    assert.equal(waitingAge(item, DAY), null);
    assert.equal(JSON.stringify(item), raw);
  }
  for (const count of [
    null,
    true,
    "",
    "37",
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    {},
    [],
  ]) {
    const item = {
      ...record({ status: "completed" }),
      sourceFields: { "Kaç Gün Bekledi": count },
    };
    assert.equal(waitingAgePresentation(item, DAY).kind, "unknown");
  }
  assert.equal(
    waitingAgePresentation(record({ status: "completed", sourceDate: "" }), DAY)
      .kind,
    "unknown",
  );
  assert.equal(waitingAgePresentation(record(), DAY).kind, "live");
  assert.equal(waitingAgePresentation(record(), DAY).days, 10);
  assert.equal(
    waitingAgePresentation(record({ type: "daily", status: "completed" }), DAY)
      .kind,
    "unknown",
  );
});

test("the closing calendar day comes from the same instant in local time across midnight and DST", () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const [zone, instant, day] of [
      ["Europe/Istanbul", "2026-11-07T22:30:00.000Z", "2026-11-08"],
      ["America/New_York", "2026-11-08T02:30:00.000Z", "2026-11-07"],
      ["Europe/Berlin", "2026-03-28T23:30:00.000Z", "2026-03-29"],
      ["Europe/Berlin", "2026-10-25T00:30:00.000Z", "2026-10-25"],
    ]) {
      process.env.TZ = zone;
      const result = close(record(), { closedAt: instant }).sourceFields[
        CLOSURE
      ];
      assert.equal(result.closedAt, instant);
      assert.equal(result.closedDate, day);
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
  assert.equal(process.env.TZ, previousTimezone);
});

test("closure is one atomic store edit whose failure and exact Undo preserve every original byte", () => {
  const original = [record()];
  const values = new Map([
    [
      KEY,
      JSON.stringify({
        version: 1,
        records: original,
        odak: {
          version: 1,
          preferences: { density: "comfortable" },
          history: [],
        },
      }),
    ],
  ]);
  let fail = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) {
        const error = new Error("full");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, value);
    },
  };
  const store = createWorkspaceStore({ storage, key: KEY });
  const initial = storage.getItem(KEY);
  const changed = stampWaitingClosures(
    original,
    [{ ...original[0], status: "completed" }],
    { closedAt: NOW, closedDate: DAY },
  );
  fail = true;
  assert.throws(() => store.saveRecords(changed, "Konuyu kapat"), /full/);
  assert.equal(storage.getItem(KEY), initial);
  assert.deepEqual(store.records, original);
  assert.equal(store.canUndo, false);
  fail = false;
  assert.equal(store.saveRecords(changed, "Konuyu kapat"), true);
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.deepEqual(reopened.records, changed);
  assert.equal(waitingAge(reopened.records[0], "2028-01-01"), 10);
  assert.deepEqual(
    validateStore(JSON.parse(JSON.stringify({ version: 1, records: changed })))
      .records,
    changed,
  );
  assert.equal(reopened.undo(), "Konuyu kapat");
  assert.equal(storage.getItem(KEY), initial);
  assert.deepEqual(reopened.records, original);
});

test("Excel export and import preserve both closure proof and the qualified original snapshot", async () => {
  const item = close(record());
  const legacy = record({ id: "legacy-one", status: "completed" });
  const original = JSON.stringify([item, legacy]);
  const bytes = await buildWorkbook([item, legacy]).xlsx.writeBuffer();
  const imported = await parseExcelFile(bytes);
  assert.equal(imported.warnings.length, 0);
  assert.deepEqual(imported.records, [item, legacy]);
  assert.equal(
    waitingAgePresentation(imported.records[0], "2028-01-01").kind,
    "closure",
  );
  assert.equal(
    waitingAgePresentation(imported.records[1], "2028-01-01").kind,
    "imported",
  );
  assert.equal(JSON.stringify([item, legacy]), original);
});
