import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import {
  workspaceSignature,
  makeHistoryEntry,
  pushHistory,
  undoEntry,
  readHistory,
} from "../src/workspace-history.js";

const originalTime = "2026-11-06T09:00:00.000Z";
const editedTime = "2026-11-06T10:00:00.000Z";
const copy = (value) => JSON.parse(JSON.stringify(value));
function record(id, overrides = {}) {
  return createRecord({
    id,
    title: `Örnek ${id}`,
    description: "Birinci satır\nİkinci satır",
    createdAt: originalTime,
    updatedAt: originalTime,
    sourceDate: "2026-11-06",
    nextAction: "Kontrol et",
    sourceFields: { Sütun: "Özgün bilgi", __formulas: { Hücre: "=A1+1" } },
    ...overrides,
  });
}
function state(records = [], density = "comfortable") {
  return { records, preferences: { density } };
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function validSteps() {
  const weekly = record("weekly", {
    type: "weekly",
    targetValue: 4,
    currentValue: 2,
    metric: "Rapor",
    periodKey: "2026-W45",
  });
  const daily = record("daily", {
    parentId: weekly.id,
    priority: "high",
    dueDate: "2026-11-07",
  });
  const first = state([weekly, daily]);
  const edited = state([
    weekly,
    { ...daily, title: "Güncellenen iş", updatedAt: editedTime },
  ]);
  const done = state([weekly, { ...edited.records[1], status: "completed" }]);
  const compact = state(done.records, "compact");
  const unlinked = state(
    [{ ...compact.records[1], parentId: null }],
    "compact",
  );
  const reset = state([], "compact");
  const restored = state(
    [
      record("waiting", {
        type: "waiting",
        expectedFrom: "Örnek ekip",
        lastFollowUpDate: "2026-11-05",
      }),
    ],
    "compact",
  );
  return [first, edited, done, compact, unlinked, reset, restored];
}

test("record additions, edits, completion, unlinking deletion, reset and restore undo exactly", () => {
  const states = validSteps();
  let history = [];
  for (let index = 1; index < states.length; index++) {
    history = pushHistory(
      history,
      makeHistoryEntry(states[index - 1], states[index], `İşlem ${index}`),
    );
  }
  let current = copy(states.at(-1));
  for (let index = states.length - 2; index >= 0; index--) {
    current = undoEntry(current, history.pop());
    assert.deepEqual(current, states[index]);
    validateStore({ version: 1, records: current.records });
  }
  assert.equal(current.records[1].parentId, "weekly");
  assert.equal(current.records[1].createdAt, originalTime);
  assert.equal(current.records[1].updatedAt, originalTime);
  assert.deepEqual(
    current.records[1].sourceFields,
    states[0].records[1].sourceFields,
  );

  const empty = state();
  const addition = makeHistoryEntry(empty, states[0], "Yeni kayıt");
  assert.deepEqual(undoEntry(states[0], addition), empty);
});

test("history records only changed records and makes detached JSON-safe snapshots", () => {
  const weekly = record("weekly", { type: "weekly" });
  const daily = record("daily", { parentId: weekly.id });
  const before = state([weekly, daily]);
  const after = state([
    weekly,
    { ...daily, priority: "urgent", updatedAt: editedTime },
  ]);
  const frozenBefore = freeze(copy(before));
  const frozenAfter = freeze(copy(after));
  const entry = makeHistoryEntry(
    frozenBefore,
    frozenAfter,
    "Öncelik güncelleme",
  );
  assert.equal(entry.changes.length, 1);
  assert.equal(entry.changes[0].id, daily.id);
  assert.deepEqual(entry.beforeOrder, [weekly.id, daily.id]);
  assert.deepEqual(entry.afterOrder, [weekly.id, daily.id]);
  entry.changes[0].before.sourceFields.Sütun = "Yalnızca geçmiş kopyası";
  assert.equal(frozenBefore.records[1].sourceFields.Sütun, "Özgün bilgi");
  assert.equal(frozenAfter.records[1].sourceFields.Sütun, "Özgün bilgi");
  assert.doesNotThrow(() => JSON.stringify(entry));
});

test("preference-only and record-order changes remain undoable without record patches", () => {
  const first = record("one");
  const second = record("two");
  const original = state([first, second]);
  const changed = state([first, second], "compact");
  const densityEntry = makeHistoryEntry(original, changed, "Liste görünümü");
  assert.deepEqual(densityEntry.changes, []);
  assert.deepEqual(undoEntry(changed, densityEntry), original);

  const reordered = state([second, first]);
  const orderEntry = makeHistoryEntry(original, reordered, "Sıra");
  assert.deepEqual(orderEntry.changes, []);
  assert.deepEqual(undoEntry(reordered, orderEntry), original);
});

test("unchanged snapshots create no step and signatures ignore object-key ordering", () => {
  const original = state([record("one")]);
  const reorderedKeys = {
    preferences: { density: "comfortable" },
    records: copy(original.records),
  };
  reorderedKeys.records[0].sourceFields = {
    __formulas: { Hücre: "=A1+1" },
    Sütun: "Özgün bilgi",
  };
  assert.equal(workspaceSignature(original), workspaceSignature(reorderedKeys));
  assert.equal(makeHistoryEntry(original, reorderedKeys, "Aynı"), null);
  const earlier = [{ marker: 1 }];
  const result = pushHistory(earlier, null);
  assert.deepEqual(result, earlier);
  assert.notEqual(result, earlier);
  assert.notEqual(
    workspaceSignature(original),
    workspaceSignature(state([record("one")], "compact")),
  );
});

test("serialized histories reload and undo every retained step without changing source history", () => {
  const states = validSteps();
  const entries = states
    .slice(1)
    .map((after, index) =>
      makeHistoryEntry(states[index], after, `İşlem ${index}`),
    );
  const raw = freeze(JSON.parse(JSON.stringify(entries)));
  const loaded = readHistory(raw, states.at(-1));
  assert.deepEqual(loaded, entries);
  assert.notEqual(loaded[0], raw[0]);
  let cursor = states.at(-1);
  for (const entry of [...loaded].reverse()) cursor = undoEntry(cursor, entry);
  assert.deepEqual(cursor, states[0]);
  assert.deepEqual(raw, entries);
});

test("external record, order and preference changes prevent stale undo", () => {
  const before = state([record("one"), record("two")]);
  const after = state([
    before.records[0],
    { ...before.records[1], status: "completed" },
  ]);
  const entry = makeHistoryEntry(before, after, "Tamamla");
  const changedElsewhere = state([
    { ...after.records[0], owner: "Başka pencere" },
    after.records[1],
  ]);
  const reorderedElsewhere = state([...after.records].reverse());
  const densityElsewhere = state(after.records, "compact");
  for (const current of [
    changedElsewhere,
    reorderedElsewhere,
    densityElsewhere,
  ]) {
    const untouched = copy(current);
    assert.throws(
      () => undoEntry(current, entry),
      /başka bir işlemde veya pencerede değişti/,
    );
    assert.deepEqual(current, untouched);
    assert.deepEqual(readHistory([entry], current), []);
  }
});

test("malformed entry structures, forged patch snapshots and broken chains are discarded", () => {
  const before = state([record("one")]);
  const after = state([{ ...before.records[0], priority: "urgent" }]);
  const later = state([{ ...after.records[0], status: "completed" }]);
  const entry = makeHistoryEntry(before, after, "Öncelik");
  const next = makeHistoryEntry(after, later, "Tamamla");
  const invalidEntries = [
    { ...entry, version: 2 },
    { ...entry, beforeOrder: ["one", "one"] },
    { ...entry, afterOrder: [] },
    { ...entry, changes: [] },
    { ...entry, beforePreferences: { density: "other" } },
    { ...entry, beforeSignature: entry.afterSignature },
    { ...entry, changes: [{ ...entry.changes[0], id: "different" }] },
    {
      ...entry,
      changes: [
        {
          ...entry.changes[0],
          after: { ...after.records[0], owner: "Forged" },
        },
      ],
    },
    {
      ...entry,
      changes: [
        {
          ...entry.changes[0],
          before: { ...before.records[0], dueDate: "2026-02-30" },
        },
      ],
    },
    {
      ...entry,
      changes: [
        {
          ...entry.changes[0],
          before: { ...before.records[0], status: "unknown" },
        },
      ],
    },
    { ...entry, changes: [{ ...entry.changes[0], before: null }] },
  ];
  for (const malformed of invalidEntries) {
    assert.deepEqual(readHistory([malformed], after), []);
    assert.throws(() => undoEntry(after, malformed));
  }
  assert.deepEqual(readHistory([next, entry], later), []);
  assert.deepEqual(
    readHistory(
      [entry, { ...next, beforeSignature: entry.beforeSignature }],
      later,
    ),
    [],
  );
  for (const value of [undefined, null, {}, "bad", [null], [undefined]]) {
    assert.deepEqual(readHistory(value, later), []);
  }
});

test("a tampered deleted-parent patch cannot restore a dangling daily link", () => {
  const weekly = record("weekly", { type: "weekly" });
  const daily = record("daily", { parentId: "weekly" });
  const before = state([weekly, daily]);
  const after = state([{ ...daily, parentId: null }]);
  const entry = makeHistoryEntry(before, after, "Haftalık hedefi sil");
  const malformed = copy(entry);
  malformed.changes = malformed.changes.filter(
    (change) => change.id !== "weekly",
  );
  assert.throws(() => undoEntry(after, malformed));
  assert.deepEqual(readHistory([malformed], after), []);
  assert.deepEqual(undoEntry(after, entry), before);
});

test("count and byte budgets trim oldest entries immutably while always keeping latest", () => {
  const states = [state()];
  for (let index = 0; index < 5; index++)
    states.push(state([record("one", { title: `İş ${index}` })]));
  const entries = states
    .slice(1)
    .map((after, index) =>
      makeHistoryEntry(states[index], after, `Adım ${index}`),
    );
  const earlier = freeze(entries.slice(0, 4));
  const limited = pushHistory(earlier, entries[4], { maxEntries: 2 });
  assert.deepEqual(limited, entries.slice(-2));
  assert.equal(earlier.length, 4);
  assert.deepEqual(pushHistory(earlier, entries[4], { maxBytes: 0 }), [
    entries[4],
  ]);
  const huge = makeHistoryEntry(
    state(),
    state([record("large", { description: "İçerik ".repeat(1000) })]),
    "Büyük işlem",
  );
  assert.deepEqual(pushHistory(entries, huge, { maxBytes: 100 }), [huge]);
  assert.deepEqual(undoEntry(states[5], limited[1]), states[4]);
  assert.throws(
    () => pushHistory([], entries[0], { maxEntries: 0 }),
    /sınırları/,
  );
  assert.throws(
    () => pushHistory([], entries[0], { maxBytes: -1 }),
    /sınırları/,
  );
});

test("readHistory caps a long valid chain and rejects unsupported snapshot fields", () => {
  const states = [state()];
  let entries = [];
  for (let index = 0; index < 35; index++) {
    const next = state([record("one", { title: `Adım ${index}` })]);
    entries.push(makeHistoryEntry(states.at(-1), next, `İşlem ${index}`));
    states.push(next);
  }
  const result = readHistory(entries, states.at(-1));
  assert.equal(result.length, 30);
  assert.deepEqual(result, entries.slice(-30));
  const badRecord = { ...record("one"), createdAt: "not-a-date" };
  assert.throws(
    () => makeHistoryEntry(state(), state([badRecord]), "Geçersiz"),
    /doğrulanamadı/,
  );
  assert.throws(
    () =>
      workspaceSignature({
        records: [],
        preferences: { density: "comfortable", other: true },
      }),
    /görünüm tercihi/,
  );
  assert.throws(
    () =>
      workspaceSignature(state([{ ...record("one"), unsupported: undefined }])),
    /JSON/,
  );
});

test("labels are safe bounded text and Unicode data remains exact through undo", () => {
  const before = state([
    record("one", {
      title: "İş, ıhlamur ve Çığ",
      sourceFields: { Özgün: "👁️\nTürkçe", İlerleme: 0.5 },
    }),
  ]);
  const after = state([{ ...before.records[0], title: "Değişti" }]);
  const entry = makeHistoryEntry(
    before,
    after,
    `  Başlık\n${"x".repeat(150)}\u0000 `,
  );
  assert.equal(entry.label.length, 120);
  assert.equal(/[\u0000-\u001f]/.test(entry.label), false);
  assert.deepEqual(undoEntry(after, JSON.parse(JSON.stringify(entry))), before);
});
