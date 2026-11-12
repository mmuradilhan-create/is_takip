import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  emptyStore,
  validateStore,
  dashboardStats,
  getWeeklyProgress,
  goalProgress,
  isOverdue,
  localDate,
} from "../src/model.js";

test("records enforce valid title and dates while supplying defaults", () => {
  assert.throws(() => createRecord({ title: "  " }), /başlığı/);
  assert.throws(() => createRecord({ title: "İş", type: "other" }), /türü/);
  assert.throws(
    () => createRecord({ title: "İş", dueDate: "2026-02-30" }),
    /tarih/,
  );
  const record = createRecord({ title: "  Yeni iş ", status: "unknown" });
  assert.equal(record.title, "Yeni iş");
  assert.equal(record.status, "planned");
  assert.equal(record.type, "daily");
  assert.equal(record.priority, "normal");
  assert.ok(record.id);
});

test("store validation preserves relationships and rejects invalid backups", () => {
  const weekly = createRecord({ type: "weekly", title: "Haftalık plan" });
  const daily = createRecord({ title: "Günlük iş", parentId: weekly.id });
  const store = validateStore({ version: 1, records: [weekly, daily] });
  assert.equal(store.records[1].parentId, weekly.id);
  assert.equal(store.records[0].id, weekly.id);
  assert.throws(
    () => validateStore({ version: 1, records: [daily] }),
    /bulunamadı/,
  );
  assert.throws(
    () => validateStore({ version: 1, records: [daily, daily] }),
    /Tekrarlanan/,
  );
  assert.throws(() => validateStore({ version: 2, records: [] }), /sürüm/);
  assert.deepEqual(validateStore(emptyStore()), emptyStore());
});

test("dashboard and weekly progress count actual linked records and overdue active work", () => {
  const weekly = createRecord({ type: "weekly", title: "Plan" });
  const daily = createRecord({
    title: "İş",
    parentId: weekly.id,
    dueDate: "2026-11-05",
  });
  const done = createRecord({
    title: "Bitti",
    parentId: weekly.id,
    status: "completed",
    dueDate: "2026-11-01",
  });
  const cancelled = createRecord({
    title: "İptal",
    status: "cancelled",
    dueDate: "2026-11-01",
  });
  const records = [weekly, daily, done, cancelled];
  assert.deepEqual(dashboardStats(records, "2026-11-06"), {
    total: 4,
    active: 2,
    completed: 1,
    overdue: 1,
    completionRate: 25,
  });
  assert.deepEqual(getWeeklyProgress(weekly.id, records), {
    total: 2,
    completed: 1,
    percent: 50,
  });
  assert.deepEqual(getWeeklyProgress("missing", records), {
    total: 0,
    completed: 0,
    percent: 0,
  });
  assert.equal(isOverdue(daily, "2026-11-05"), false);
  assert.equal(isOverdue(done, "2026-11-06"), false);
  assert.equal(localDate(new Date(2026, 0, 2)), "2026-01-02");
});

test("timestamps normalize to sortable strings even for arbitrary imported cells", () => {
  const record = createRecord({
    title: "İş",
    createdAt: new Date("2026-11-06T12:00:00Z"),
    updatedAt: 46332,
  });
  assert.equal(record.createdAt, "2026-11-06T12:00:00.000Z");
  assert.equal(typeof record.updatedAt, "string");
  assert.doesNotThrow(() => record.createdAt.localeCompare(record.updatedAt));
});

test("measured goal progress takes precedence over linked work while completion forces 100%", () => {
  const goal = createRecord({
    type: "weekly",
    title: "Ölçülebilir hedef",
    targetValue: "52",
    currentValue: "42",
  });
  const child = createRecord({
    title: "Günlük adım",
    parentId: goal.id,
    status: "completed",
  });
  assert.deepEqual(goalProgress(goal, [goal, child]), {
    total: 52,
    completed: 42,
    percent: 81,
    basis: "metric",
  });
  assert.equal(getWeeklyProgress(goal.id, [goal, child]).percent, 100);
  assert.equal(
    goalProgress(
      { ...goal, status: "completed", currentValue: 7, targetValue: 10 },
      [],
    ).percent,
    100,
  );
  assert.equal(
    goalProgress({ ...goal, currentValue: null, targetValue: null }, [child])
      .basis,
    "linked",
  );
  assert.equal(
    goalProgress({ ...goal, currentValue: null, targetValue: null }, []).basis,
    "status",
  );
});

test("transferred and cancelled work is excluded from active and overdue totals", () => {
  const records = [
    "transferred",
    "cancelled",
    "follow_up",
    "waiting_response",
    "partially_completed",
  ].map((status) =>
    createRecord({ title: status, status, dueDate: "2026-01-01" }),
  );
  const stats = dashboardStats(records, "2026-11-06");
  assert.equal(stats.active, 3);
  assert.equal(stats.overdue, 3);
  assert.throws(
    () => createRecord({ title: "İş", sourceDate: "2026-02-30" }),
    /geçerli bir tarih/,
  );
  assert.throws(
    () => createRecord({ title: "İş", targetValue: "sayı değil" }),
    /geçerli bir sayı/,
  );
});

test("a cancel reason is kept trimmed, limited to 1000 characters and absent by default", () => {
  const base = { title: "İptal edilecek iş", status: "cancelled" };
  assert.equal(Object.hasOwn(createRecord(base), "cancelReason"), false);
  assert.equal(
    createRecord({ ...base, cancelReason: "  Müşteri vazgeçti  " })
      .cancelReason,
    "Müşteri vazgeçti",
  );
  assert.throws(
    () => createRecord({ ...base, cancelReason: "x".repeat(1001) }),
    /İptal nedeni en fazla 1000 karakter/,
  );
});
