import test from "node:test";
import assert from "node:assert/strict";
import {
  listReviewRecords,
  migrateBlockedToWaiting,
  normalizeWaitingReason,
  waitingStateMigrationInfo,
} from "../src/waiting-state.js";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const stamp = "2026-10-31T09:00:00.000Z";
const today = "2026-11-07";

function record(input = {}) {
  return createRecord({
    id: "one",
    title: "Yanıtı değerlendir",
    createdAt: stamp,
    updatedAt: stamp,
    sourceFields: { Kaynak: "Özgün değer", nested: { keep: [1, 2] } },
    ...input,
  });
}

const ids = (records) => records.map((item) => item.id);

test("waiting reason is optional, validated, and preserved without silently migrating legacy records", () => {
  const legacy = record({
    blocked: true,
    status: "in_progress",
    blockReason: "Tasarım yanıtı",
  });
  assert.equal(Object.hasOwn(legacy, "waitingReason"), false);
  assert.deepEqual(validateStore({ version: 1, records: [legacy] }).records, [
    legacy,
  ]);
  assert.equal(legacy.status, "in_progress");
  assert.equal(legacy.blocked, true);
  assert.equal(
    normalizeWaitingReason("  Malzeme bekleniyor.\n  "),
    "Malzeme bekleniyor.",
  );
  assert.equal(normalizeWaitingReason(""), "");
  for (const value of [null, undefined, 42, {}, [], "x".repeat(1001)])
    assert.throws(() => normalizeWaitingReason(value));

  const current = record({ waitingReason: "  ArGe yanıtı bekleniyor.  " });
  assert.equal(current.waitingReason, "ArGe yanıtı bekleniyor.");
  const retyped = createRecord({ ...current, type: "meeting" });
  assert.equal(retyped.waitingReason, current.waitingReason);
  assert.deepEqual(
    validateStore(
      JSON.parse(JSON.stringify({ version: 1, records: [current] })),
    ).records,
    [current],
  );
});

test("explicit migration folds active daily blockers into waiting while preserving closed work, sources and timestamps", () => {
  const records = [
    record({
      id: "active",
      status: "in_progress",
      blocked: true,
      blockReason: "  Teknik yanıt bekleniyor.  ",
      description: "Gerçek kullanıcı notu.",
      nextAction: "Yanıt gelince üç maddeyi değerlendir.",
      category: "Teknik",
      workLog: [
        {
          id: "session",
          date: "2026-10-31",
          endedAt: stamp,
          durationMs: 5000,
          note: "İlk kontrol yapıldı.",
          nextAction: "Yanıtı bekle.",
        },
      ],
    }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record({ id: status, status, blocked: true, blockReason: "Eski neden" }),
    ),
    record({
      id: "unflagged-reason",
      status: "planned",
      blocked: false,
      blockReason: "Önceki bekleme notu",
    }),
    record({ id: "normal", status: "waiting", waitingReason: "Mevcut neden" }),
    record({
      id: "other-type",
      type: "meeting",
      blocked: true,
      blockReason: "Korunur",
    }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const migrated = migrateBlockedToWaiting(records);

  assert.notEqual(migrated, records);
  assert.equal(migrated[0].status, "waiting");
  assert.equal(migrated[0].blocked, false);
  assert.equal(migrated[0].waitingReason, "Teknik yanıt bekleniyor.");
  assert.equal(migrated[0].blockReason, records[0].blockReason);
  for (let index = 1; index <= 3; index++) {
    assert.equal(migrated[index].status, records[index].status);
    assert.equal(migrated[index].blocked, false);
    assert.equal(migrated[index].waitingReason, "Eski neden");
  }
  assert.equal(migrated[4].status, "planned");
  assert.equal(migrated[4].waitingReason, "Önceki bekleme notu");
  assert.equal(migrated[5], records[5]);
  assert.equal(migrated[6], records[6]);

  for (let index = 0; index < 5; index++) {
    const original = records[index];
    const current = migrated[index];
    assert.equal(current.id, original.id);
    assert.equal(current.createdAt, original.createdAt);
    assert.equal(current.updatedAt, original.updatedAt);
    assert.equal(current.sourceFields.Kaynak, original.sourceFields.Kaynak);
    assert.equal(current.sourceFields.nested, original.sourceFields.nested);
    assert.deepEqual(current.sourceFields.__waitingStateMigration, {
      version: 1,
      originalStatus: original.status,
      originalBlocked: original.blocked,
      originalBlockReason: original.blockReason,
    });
    const restored = {
      ...current,
      status: original.status,
      blocked: original.blocked,
      sourceFields: original.sourceFields,
    };
    delete restored.waitingReason;
    assert.deepEqual(restored, original);
  }
  assert.deepEqual(waitingStateMigrationInfo(records), {
    recordsChanged: 5,
    statusesChanged: 1,
    reasonsPreserved: 5,
  });
  assert.deepEqual(records, before);
  assert.equal(migrateBlockedToWaiting(migrated), migrated);
  assert.equal(migrateBlockedToWaiting([records[5]])[0], records[5]);
  assert.throws(() => migrateBlockedToWaiting(null));
});

test("conflicting waiting and legacy reasons are retained, including earlier migration metadata and later intentional edits", () => {
  const earlierMetadata = { custom: ["Özgün bilgi", 3] };
  const original = record({
    status: "partially_completed",
    blocked: true,
    blockReason: "Önceki engel nedeni",
    waitingReason: "Yeni ve bilinçli bekleme nedeni",
    sourceFields: { keep: true, __waitingStateMigration: earlierMetadata },
  });
  const before = structuredClone(original);
  const [migrated] = migrateBlockedToWaiting([original]);
  assert.equal(migrated.status, "waiting");
  assert.equal(migrated.waitingReason, original.waitingReason);
  assert.equal(migrated.blockReason, original.blockReason);
  assert.deepEqual(migrated.sourceFields.__waitingStateMigration, {
    version: 1,
    originalStatus: original.status,
    originalBlocked: true,
    originalBlockReason: original.blockReason,
    originalWaitingReason: original.waitingReason,
    previous: earlierMetadata,
  });
  assert.deepEqual(original, before);

  const intentionallyEdited = [
    { ...migrated, status: "planned", waitingReason: "" },
  ];
  assert.equal(
    migrateBlockedToWaiting(intentionallyEdited),
    intentionallyEdited,
  );
  assert.equal(intentionallyEdited[0].waitingReason, "");
  const emptyCurrent = record({
    id: "empty",
    blocked: true,
    blockReason: "Eski not",
    waitingReason: "",
  });
  assert.equal(
    migrateBlockedToWaiting([emptyCurrent])[0].waitingReason,
    "Eski not",
  );
});

test("migration is one durable undo action and a failed write cannot partly migrate saved data", () => {
  const key = "waiting-state-test";
  const original = [
    record({
      blocked: true,
      blockReason: "Onay bekleniyor",
      status: "in_progress",
    }),
  ];
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: original })],
  ]);
  let fail = false;
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem(name, value) {
      if (fail && name === key) throw new Error("Storage is full");
      values.set(name, String(value));
    },
  };
  const store = createWorkspaceStore({ storage, key });
  const beforeRaw = storage.getItem(key);
  const changed = migrateBlockedToWaiting(store.records);
  fail = true;
  assert.throws(() => store.saveRecords(changed, "Bekleme düzeni"), /full/);
  assert.equal(storage.getItem(key), beforeRaw);
  assert.deepEqual(store.records, original);
  assert.equal(store.canUndo, false);
  fail = false;
  assert.equal(store.saveRecords(changed, "Bekleme düzeni"), true);
  const saved = JSON.parse(storage.getItem(key));
  assert.deepEqual(validateStore(saved).records, changed);
  assert.equal(saved.odak.history.length, 1);
  const reopened = createWorkspaceStore({ storage, key });
  assert.deepEqual(reopened.records, changed);
  assert.equal(reopened.undo(), "Bekleme düzeni");
  assert.deepEqual(reopened.records, original);
  assert.deepEqual(JSON.parse(storage.getItem(key)).records, original);
  assert.deepEqual(
    validateStore({ version: 1, records: original }).records,
    original,
  );
});

test("review selects untouched open daily records after seven calendar days without changing data or guessing timestamps", () => {
  const missing = record({ id: "missing", createdAt: "2025-01-01T00:00:00Z" });
  delete missing.updatedAt;
  const records = [
    record({ id: "boundary-z", updatedAt: "2026-10-31T23:59:59.999Z" }),
    record({
      id: "old",
      updatedAt: "2026-10-01T18:00:00Z",
      dueDate: "2027-01-01",
    }),
    record({
      id: "boundary-a",
      updatedAt: "2026-10-31T23:59:59.999Z",
      dueDate: "",
    }),
    record({
      id: "recent",
      updatedAt: "2026-11-01T00:00:00Z",
      createdAt: "2025-01-01T00:00:00Z",
    }),
    record({ id: "running", updatedAt: "2026-09-01T12:00:00Z" }),
    record({ id: "future", updatedAt: "2026-11-08T00:00:00Z" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record({ id: status, status, updatedAt: "2026-09-01T00:00:00Z" }),
    ),
    record({ id: "goal", type: "weekly", updatedAt: "2026-09-01T00:00:00Z" }),
    { ...record({ id: "invalid" }), updatedAt: "not-a-date" },
    {
      ...record({ id: "normalized-overflow" }),
      updatedAt: "2026-02-30T12:00:00Z",
    },
    missing,
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const selected = listReviewRecords(records, today, {
    runningRecordId: "running",
  });
  assert.deepEqual(ids(selected), ["old", "boundary-a", "boundary-z"]);
  assert.equal(selected[0], records[1]);
  assert.deepEqual(records, before);
  assert.deepEqual(ids(listReviewRecords(records, today)), [
    "running",
    "old",
    "boundary-a",
    "boundary-z",
  ]);
});

test(
  "review age follows local calendar days through daylight-saving changes and restores the test timezone",
  { concurrency: false },
  () => {
    const previous = process.env.TZ;
    try {
      // This synchronous test yields no event-loop turn while the timezone is
      // changed, and restores it before any other test or timer can execute.
      process.env.TZ = "America/New_York";
      assert.equal(new Date("2026-03-09T03:30:00.000Z").getDate(), 8);
      const row = (id, updatedAt) => ({
        id,
        type: "daily",
        status: "planned",
        title: id,
        updatedAt,
      });
      const spring = [
        row("boundary", "2026-03-09T03:30:00.000Z"),
        row("recent", "2026-03-09T04:00:00.000Z"),
      ];
      const fall = [
        row("boundary", "2026-11-02T04:30:00.000Z"),
        row("recent", "2026-11-02T05:00:00.000Z"),
      ];
      assert.deepEqual(ids(listReviewRecords(spring, "2026-03-15")), [
        "boundary",
      ]);
      assert.deepEqual(ids(listReviewRecords(fall, "2026-11-08")), [
        "boundary",
      ]);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
    assert.equal(process.env.TZ, previous);
  },
);
