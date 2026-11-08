import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_CONTEXTS,
  isDailyInboxGoal,
  migrateDailyInbox,
  normalizeDailyWorkContext,
} from "../src/daily-context.js";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const timestamp = "2026-11-07T09:00:00.000Z";

function record(input = {}) {
  return createRecord({
    id: "one",
    title: "Kontrol işi",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  });
}

function legacyRecords() {
  const goal = record({
    id: "inbox",
    type: "weekly",
    title: "Günlük Pop-Up İşler",
    status: "in_progress",
    periodKey: "2026-W45",
    metric: "Tamamlanan iş",
    currentValue: 6,
    targetValue: 10,
    sourceFields: { "Özgün alan": "İçe aktarılan değer" },
  });
  const daily = record({
    id: "daily",
    parentId: goal.id,
    category: "Teknik inceleme",
    workType: "Rutin",
    description: "Notlar korunur.",
    nextAction: "Yanıtı incele.",
    workLog: [
      {
        id: "session",
        date: "2026-11-07",
        endedAt: timestamp,
        durationMs: 60000,
        note: "Bir madde tamamlandı.",
        nextAction: "Yanıtı incele.",
      },
    ],
    sourceFields: { Kategori: "Teknik inceleme", nested: { value: [1, 2] } },
  });
  const realGoal = record({
    id: "real-goal",
    type: "weekly",
    title: "Raporu yayımla",
  });
  const plannedDaily = record({ id: "planned-daily", parentId: realGoal.id });
  const unlinkedDaily = record({ id: "unlinked" });
  return [goal, daily, realGoal, plannedDaily, unlinkedDaily];
}

test("only the named weekly inbox and exact Turkish spelling variants match", () => {
  for (const title of [
    "Günlük Pop-Up İşler",
    "  GÜNLÜK POP UP İŞLER  ",
    "gunluk pop-up isler",
    "Günlük Pop–Up İşleri",
    "Günlük Pop Up İş",
  ])
    assert.equal(isDailyInboxGoal({ type: "weekly", title }), true, title);
  for (const title of [
    "Günlük işler",
    "Haftalık Pop-Up İşler",
    "Günlük Pop-Up İşler raporu",
    "Günlük Pop-Up İşler 2026",
    "Pop-Up İşler",
  ])
    assert.equal(isDailyInboxGoal({ type: "weekly", title }), false, title);
  assert.equal(
    isDailyInboxGoal({ type: "monthly", title: "Günlük Pop-Up İşler" }),
    false,
  );
  assert.equal(isDailyInboxGoal(null), false);
});

test("migration unlinks inbox daily work and retires the placeholder without losing any source data", () => {
  const original = legacyRecords();
  const before = structuredClone(original);
  const migrated = migrateDailyInbox(original);
  const [goal, daily] = migrated;
  assert.notEqual(migrated, original);
  assert.deepEqual(original, before);
  assert.equal(goal.status, "transferred");
  assert.equal(goal.metric, before[0].metric);
  assert.equal(goal.currentValue, 6);
  assert.equal(goal.targetValue, 10);
  assert.equal(goal.periodKey, "2026-W45");
  assert.equal(goal.sourceFields["Özgün alan"], "İçe aktarılan değer");
  assert.deepEqual(goal.sourceFields.__dailyInboxMigration, {
    version: 1,
    kind: "goal",
    originalStatus: "in_progress",
    originalPeriodKey: "2026-W45",
    originalMetric: "Tamamlanan iş",
    originalCurrentValue: 6,
    originalTargetValue: 10,
  });
  assert.equal(daily.parentId, "");
  assert.equal(daily.workContext, "ad_hoc");
  assert.equal(daily.category, before[1].category);
  assert.deepEqual(daily.workLog, before[1].workLog);
  assert.equal(daily.createdAt, before[1].createdAt);
  assert.equal(daily.updatedAt, before[1].updatedAt);
  assert.deepEqual(daily.sourceFields.nested, before[1].sourceFields.nested);
  assert.deepEqual(daily.sourceFields.__dailyInboxMigration, {
    version: 1,
    kind: "daily",
    originalParentId: "inbox",
    originalPeriodKey: "2026-W45",
    originalRecordPeriodKey: "",
  });
  for (const index of [2, 3, 4]) assert.equal(migrated[index], original[index]);
  assert.equal(migrateDailyInbox(migrated), migrated);
  const canonical = validateStore({ version: 1, records: migrated }).records;
  assert.equal(canonical[1].parentId, null);
  assert.equal(migrateDailyInbox(canonical), canonical);
});

test("migration handles multiple matching placeholders and all linked statuses without treating other types as daily work", () => {
  const first = record({
    id: "first",
    type: "weekly",
    title: "Günlük Pop-Up İşler",
    status: "completed",
  });
  const second = record({
    id: "second",
    type: "weekly",
    title: "Günlük Pop Up İşleri",
    status: "waiting",
  });
  const linked = ["completed", "cancelled", "transferred", "waiting"].map(
    (status, i) =>
      record({
        id: `daily-${i}`,
        parentId: i % 2 ? first.id : second.id,
        status,
      }),
  );
  const other = {
    ...record({ id: "other", type: "meeting" }),
    parentId: first.id,
  };
  const migrated = migrateDailyInbox([first, second, ...linked, other]);
  assert.equal(migrated.filter((r) => r.workContext === "ad_hoc").length, 4);
  assert.deepEqual(
    migrated.slice(2, 6).map((r) => r.status),
    linked.map((r) => r.status),
  );
  assert.equal(migrated.at(-1), other);
  assert.equal(
    migrated[0].sourceFields.__dailyInboxMigration.originalStatus,
    "completed",
  );
  assert.equal(
    migrated[1].sourceFields.__dailyInboxMigration.originalStatus,
    "waiting",
  );
});

test("migration is a no-op without a matching goal and preserves prior metadata and intentional later goal edits", () => {
  const unrelated = [record()];
  assert.equal(migrateDailyInbox(unrelated), unrelated);
  const records = legacyRecords();
  records[0].sourceFields.__dailyInboxMigration = { note: "Önceki bilgi" };
  const migrated = migrateDailyInbox(records);
  assert.deepEqual(migrated[0].sourceFields.__dailyInboxMigration.previous, {
    note: "Önceki bilgi",
  });
  const intentionallyReopened = [
    { ...migrated[0], status: "planned" },
    ...migrated.slice(1),
  ];
  assert.equal(migrateDailyInbox(intentionallyReopened), intentionallyReopened);
  assert.throws(() => migrateDailyInbox(null), /liste/);
});

test("daily context is optional for legacy canonical records and only the supported explicit values are accepted", () => {
  const original = record();
  assert.equal(Object.hasOwn(original, "workContext"), false);
  assert.deepEqual(createRecord(original), original);
  assert.deepEqual(validateStore({ version: 1, records: [original] }).records, [
    original,
  ]);
  assert.equal(DAILY_CONTEXTS.ad_hoc.label, "Anlık iş");
  assert.equal(normalizeDailyWorkContext(""), "");
  assert.equal(record({ workContext: "ad_hoc" }).workContext, "ad_hoc");
  assert.equal(record({ workContext: "" }).workContext, "");
  for (const workContext of [undefined, null, "unknown", "planned", false, {}])
    assert.throws(() => record({ workContext }), /bağlamı/);
  assert.throws(
    () => record({ workContext: "ad_hoc", parentId: "weekly" }),
    /haftalık hedefe/,
  );
  const typed = record({ workContext: "ad_hoc" });
  assert.equal(
    createRecord({ ...typed, type: "meeting" }).workContext,
    "ad_hoc",
  );
});

test("migration and context round-trip through JSON backup and undo exactly as a single transaction", () => {
  const key = "context-workspace";
  const original = legacyRecords();
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: original })],
  ]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, String(value)),
  };
  const store = createWorkspaceStore({ storage, key });
  store.saveRecords(migrateDailyInbox(store.records), "Anlık iş düzeni");
  assert.equal(store.history.length, 1);
  const backup = validateStore(
    JSON.parse(JSON.stringify({ version: 1, records: store.records })),
  );
  assert.deepEqual(backup.records, store.records);
  const reopened = createWorkspaceStore({ storage, key });
  assert.equal(reopened.records[1].workContext, "ad_hoc");
  assert.equal(reopened.undo(), "Anlık iş düzeni");
  assert.deepEqual(reopened.records, original);
  assert.equal(Object.hasOwn(reopened.records[1], "workContext"), false);
  assert.equal(
    Object.hasOwn(reopened.records[0].sourceFields, "__dailyInboxMigration"),
    false,
  );
});
