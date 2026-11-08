import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);

async function seedDailyContext(page, records) {
  const time = new Date("2026-11-07T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("daily-context-test-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-daily-context-migration`);
      sessionStorage.setItem("daily-context-test-seeded", "true");
    },
    { key: KEY, records },
  );
  await page.goto("/");
}

test("the legacy daily inbox becomes ad hoc work with preserved history and one undo that survives reload", async ({
  page,
}) => {
  const stamp = "2026-10-01T09:00:00.000Z";
  const legacyGoal = createRecord({
    id: "legacy-daily-inbox",
    type: "weekly",
    title: "Günlük Pop-Up İşler",
    status: "in_progress",
    periodKey: "2026-W40",
    currentValue: 17,
    targetValue: 40,
    metric: "İş",
    category: "Özgün kategori",
    description: "Eski hedef açıklaması",
    sourceFields: { "Özgün alan": { value: "Korunmalı" } },
    createdAt: stamp,
    updatedAt: stamp,
  });
  const legacyDaily = createRecord({
    id: "legacy-ad-hoc",
    title: "Gelen tasarım sorusunu incele",
    parentId: legacyGoal.id,
    status: "partially_completed",
    priority: "high",
    dueDate: "2026-11-07",
    periodKey: "2026-11",
    category: "Teknik inceleme",
    nextAction: "Yanıtı paylaş",
    description: "Günlük açıklaması",
    sourceFields: { "Özgün alan": "Günlük bilgi" },
    workLog: [
      {
        id: "legacy-journal",
        date: "2026-11-06",
        endedAt: "2026-11-06T14:00:00.000Z",
        durationMs: 60_000,
        note: "İlk kontrol yapıldı",
        nextAction: "Yanıtı paylaş",
      },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  });
  const actualGoal = createRecord({
    id: "real-weekly",
    type: "weekly",
    title: "Pop-up tasarımını tamamla",
    periodKey: "2026-W45",
    currentValue: 3,
    targetValue: 5,
    createdAt: stamp,
    updatedAt: stamp,
  });
  const plannedDaily = createRecord({
    id: "planned-context",
    title: "Hedefe bağlı planlı iş",
    parentId: actualGoal.id,
    createdAt: stamp,
    updatedAt: stamp,
  });
  const records = [legacyGoal, legacyDaily, actualGoal, plannedDaily];
  await seedDailyContext(page, records);
  const migrated = await readRecords(page);
  const archived = migrated.find((record) => record.id === legacyGoal.id);
  const adHoc = migrated.find((record) => record.id === legacyDaily.id);
  expect(archived.status).toBe("transferred");
  expect(archived.sourceFields.__dailyInboxMigration).toMatchObject({
    version: 1,
    kind: "goal",
    originalStatus: legacyGoal.status,
    originalPeriodKey: legacyGoal.periodKey,
    originalMetric: legacyGoal.metric,
    originalCurrentValue: legacyGoal.currentValue,
    originalTargetValue: legacyGoal.targetValue,
  });
  expect({
    ...archived,
    status: legacyGoal.status,
    sourceFields: legacyGoal.sourceFields,
  }).toEqual(legacyGoal);
  expect(adHoc.parentId).toBeNull();
  expect(adHoc.workContext).toBe("ad_hoc");
  expect(adHoc.sourceFields.__dailyInboxMigration).toMatchObject({
    version: 1,
    kind: "daily",
    originalParentId: legacyGoal.id,
    originalPeriodKey: legacyGoal.periodKey,
    originalRecordPeriodKey: legacyDaily.periodKey,
  });
  const { workContext, ...remaining } = adHoc;
  expect({
    ...remaining,
    parentId: legacyDaily.parentId,
    sourceFields: legacyDaily.sourceFields,
  }).toEqual(legacyDaily);
  expect(migrated.find((record) => record.id === actualGoal.id)).toEqual(
    actualGoal,
  );
  expect(migrated.find((record) => record.id === plannedDaily.id)).toEqual(
    plannedDaily,
  );
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(row(page, legacyGoal.id)).toHaveCount(0);
  await expect(row(page, actualGoal.id)).toBeVisible();
  await page.locator('#nav [data-view="daily"]').click();
  await page.locator("#work-context-filter").selectOption("ad_hoc");
  await expect(row(page, legacyDaily.id)).toBeVisible();
  await expect(row(page, plannedDaily.id)).toHaveCount(0);
  await page.locator("#work-context-filter").selectOption("planned");
  await expect(row(page, plannedDaily.id)).toBeVisible();
  await expect(row(page, legacyDaily.id)).toHaveCount(0);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await expect(
    page.locator(
      `#record-form [name="parentId"] option[value="${legacyGoal.id}"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `#record-form [name="parentId"] option[value="${actualGoal.id}"]`,
    ),
  ).toHaveCount(1);
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  expect(await readRecords(page)).toEqual(migrated);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
  await page.locator('#nav [data-view="daily"]').click();
  await expect(
    page.locator('.daily-context-banner [data-action="migrate-daily-inbox"]'),
  ).toBeVisible();
  await page
    .locator('.daily-context-banner [data-action="migrate-daily-inbox"]')
    .click();
  expect(await readRecords(page)).toEqual(migrated);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
});

test("daily context editing clears a weekly parent for ad hoc work and can link planned work again without losing the journal", async ({
  page,
}) => {
  const goal = createRecord({
    id: "context-weekly",
    type: "weekly",
    title: "Planlı hedef",
    periodKey: "2026-W45",
  });
  const daily = createRecord({
    id: "context-daily",
    title: "Bağlamı değişecek günlük iş",
    parentId: goal.id,
    workContext: "",
    category: "Dokümantasyon",
    nextAction: "Sonraki adımı koru",
    description: "Açıklamayı koru",
    sourceFields: { "Özgün alan": "Değer" },
    workLog: [
      {
        id: "context-log",
        date: "2026-11-06",
        endedAt: "2026-11-06T14:00:00.000Z",
        durationMs: 120_000,
        note: "Geçmiş çalışma",
        nextAction: "Sonraki adımı koru",
      },
    ],
  });
  const records = [goal, daily];
  await seedDailyContext(page, records);
  await page.locator('#nav [data-view="daily"]').click();
  await row(page, daily.id).locator(".task-name").click();
  await openCreationExtras(page);
  const form = page.locator("#record-form");
  await form.locator('[name="workContext"]').selectOption("ad_hoc");
  await expect(form.locator('[name="parentId"]')).toHaveValue("");
  await expect(form.locator('[name="parentId"]')).toBeEnabled();
  await expect(form.locator('[name="parentId"]')).toBeVisible();
  await form
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const changed = (await readRecords(page)).find(
    (record) => record.id === daily.id,
  );
  expect(changed.workContext).toBe("ad_hoc");
  expect(changed.parentId).toBeNull();
  expect({
    ...changed,
    workContext: daily.workContext,
    parentId: daily.parentId,
    updatedAt: daily.updatedAt,
  }).toEqual(daily);
  await row(page, daily.id).locator(".task-name").click();
  await openCreationExtras(page);
  await form.locator('[name="workContext"]').selectOption("");
  await expect(form.locator('[name="parentId"]')).toBeEnabled();
  await form.locator('[name="parentId"]').selectOption(goal.id);
  await form
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const linkedAgain = (await readRecords(page)).find(
    (record) => record.id === daily.id,
  );
  expect(linkedAgain.workContext).toBe("");
  expect(linkedAgain.parentId).toBe(goal.id);
  expect(linkedAgain.workLog).toEqual(daily.workLog);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(
    (await readRecords(page)).find((record) => record.id === daily.id),
  ).toEqual(changed);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
});

test("migration does not change records until its once-only marker can be saved, and recovery remains undoable after reload", async ({
  page,
}) => {
  const goal = createRecord({
    id: "marker-inbox",
    type: "weekly",
    title: "Günlük Pop-Up İşler",
    periodKey: "2026-W45",
  });
  const daily = createRecord({
    id: "marker-daily",
    title: "İşaretçi hatasında korunacak iş",
    parentId: goal.id,
    nextAction: "Takibe devam et",
  });
  const records = [goal, daily];
  const marker = `${KEY}-daily-context-migration`;
  await page.addInitScript((marker) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === marker && !sessionStorage.getItem("context-marker-writable"))
        throw new DOMException("İşaretçi yazılamadı", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, marker);
  await seedDailyContext(page, records);
  expect(await readRecords(page)).toEqual(records);
  await page.locator('#nav [data-view="daily"]').click();
  const migration = page.locator(
    '.daily-context-banner [data-action="migrate-daily-inbox"]',
  );
  await expect(migration).toBeVisible();
  await migration.click();
  await expect(page.locator("#toast")).toContainText(
    "Anlık iş düzeni kaydedilemedi",
  );
  expect(await readRecords(page)).toEqual(records);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    sessionStorage.setItem("context-marker-writable", "1"),
  );
  await migration.click();
  const migrated = await readRecords(page);
  expect(migrated.find((record) => record.id === daily.id)).toMatchObject({
    parentId: null,
    workContext: "ad_hoc",
  });
  expect(migrated.find((record) => record.id === goal.id).status).toBe(
    "transferred",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), marker)).toBe(
    "1",
  );
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
});
