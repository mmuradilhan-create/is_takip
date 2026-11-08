import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { completeGoalTransfer } from "./goal-transfer-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-10-20T09:00:00.000Z";

function fixture() {
  const record = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    record({
      id: "flow-current",
      type: "weekly",
      title: "Bu haftanın planını uygula",
      periodKey: "2026-W45",
      dueDate: "2026-11-08",
    }),
    record({
      id: "flow-old",
      type: "weekly",
      title: "Önceki haftanın incelemesini tamamla",
      periodKey: "2026-W44",
      dueDate: "2026-11-01",
      status: "in_progress",
      priority: "high",
      targetValue: 10,
      currentValue: 4,
      metric: "İnceleme",
      category: "Korunacak kategori",
      nextAction: "Altı maddeyi daha incele.",
      variance: "Yanıt beklenen maddeler var.",
      description: "Gerçek haftalık çalışma notu korunmalı.",
      carryForward: true,
      sourceFields: {
        "Özgün dönem": "2026-W44",
        "Korunacak alan": { value: "Özgün kaynak" },
      },
    }),
    record({
      id: "flow-year-boundary",
      type: "weekly",
      title: "Yıl sınırından kalan açık hedef",
      periodKey: "2025-W52",
      status: "waiting",
      dueDate: "2025-12-28",
    }),
    record({
      id: "flow-future",
      type: "weekly",
      title: "Gelecek haftanın planını hazırla",
      periodKey: "2026-W46",
    }),
    record({
      id: "flow-completed",
      type: "weekly",
      title: "Tamamlanmış eski hedef",
      periodKey: "2026-W44",
      status: "completed",
    }),
    record({
      id: "flow-cancelled",
      type: "weekly",
      title: "İptal edilmiş eski hedef",
      periodKey: "2026-W44",
      status: "cancelled",
    }),
    record({
      id: "flow-archived",
      type: "weekly",
      title: "Eski aktarılan hedefin arşiv kaydı",
      periodKey: "2026-W44",
      status: "transferred",
      carryForward: true,
      currentValue: 2,
      targetValue: 5,
      sourceFields: { Durum: "Aktarıldı", "Özgün dönem": "2026-W44" },
    }),
    record({
      id: "flow-child",
      title: "Eski hedefin bağlı günlük adımı",
      parentId: "flow-old",
      status: "in_progress",
      dueDate: "2026-11-02",
      nextAction: "Sonucu haftalık hedefle paylaş.",
      sourceFields: { "Korunacak günlük alan": "Bağlantı değişmemeli" },
      workLog: [
        {
          id: "flow-log",
          date: "2026-11-01",
          endedAt: "2026-11-01T12:00:00.000Z",
          durationMs: 90_000,
          note: "İlk dört madde incelendi.",
          nextAction: "Altı madde kaldı.",
        },
      ],
    }),
    record({
      id: "flow-archived-child",
      title: "Arşiv hedefe bağlı mevcut günlük kayıt",
      parentId: "flow-archived",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("weekly-flow-seeded")) return;
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
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("weekly-flow-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const rows = (page) =>
  page
    .locator(".full-table > tbody > tr[data-record-row]")
    .evaluateAll((items) => items.map((item) => item.dataset.id));
const carry = (page, id) =>
  page.locator(`.weekly-backlog [data-action="carry-weekly"][data-id="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function weekly(page) {
  await page.locator('#nav [data-view="weekly"]').click();
  await page.locator('[data-action="period-current"]').click();
}

async function openBacklog(page) {
  const backlog = page.locator(".weekly-backlog");
  await expect(backlog).toBeVisible();
  if (!(await backlog.evaluate((element) => element.open)))
    await backlog.locator("summary").click();
  return backlog;
}

function unchangedGoalFields(record) {
  const { periodKey, updatedAt, sourceFields, ...rest } = record;
  return rest;
}

test("an unfinished prior weekly goal moves as the same record with progress and linked work, and undo restores it", async ({
  page,
  context,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await weekly(page);
  expect(await rows(page)).toEqual(["flow-current"]);
  const backlog = page.locator(".weekly-backlog");
  await expect(backlog.locator("summary")).toContainText("Önceki haftalardan");
  expect(await backlog.evaluate((element) => element.open)).toBe(false);
  await expect(carry(page, "flow-old")).not.toBeVisible();
  await openBacklog(page);
  expect(
    await backlog
      .locator('[data-action="carry-weekly"]')
      .evaluateAll((items) => items.map((item) => item.dataset.id).sort()),
  ).toEqual(["flow-old", "flow-year-boundary"]);
  expect(await saved(page)).toBe(before);

  await carry(page, "flow-old").click();
  const transfer = page.locator("#goal-transfer-dialog");
  await expect(transfer).toBeVisible();
  await expect(transfer.locator('[name="targetPeriod"]')).toHaveValue(
    "2026-W45",
  );
  await transfer.locator('[name="targetPeriod"]').selectOption("2026-W46");
  await transfer
    .locator('[name="transferReason"]')
    .fill("Kaydedilmeyen taşıma nedeni.");
  expect(await saved(page)).toBe(before);
  await transfer.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(transfer).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await carry(page, "flow-old").click();
  await transfer.locator('[name="targetPeriod"]').selectOption("2026-W46");
  await transfer
    .locator('[name="transferReason"]')
    .fill("Başka penceredeki dönem değişirken korunacak neden.");
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await other.locator('#nav [data-view="weekly"]').click();
  await other.locator('[data-action="period-all"]').click();
  await row(other, "flow-old")
    .locator('.goal-edit-trigger[data-action="edit"]')
    .click();
  await expect(
    other.locator('#record-form [name="editorPeriodYear"]'),
  ).toHaveValue("2026");
  await other
    .locator('#record-form [name="editorPeriodWeek"]')
    .selectOption("43");
  await other
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const external = await saved(other);
  await expect(transfer.locator("#goal-transfer-error")).toContainText(
    "Hedef değişti",
  );
  await expect(
    transfer.getByRole("button", { name: "Taşı", exact: true }),
  ).toBeDisabled();
  await expect(transfer.locator('[name="targetPeriod"]')).toHaveValue(
    "2026-W46",
  );
  await expect(transfer.locator('[name="transferReason"]')).toHaveValue(
    "Başka penceredeki dönem değişirken korunacak neden.",
  );
  expect(await saved(page)).toBe(external);
  await transfer.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await undo(other);
  await expect.poll(() => saved(page)).toBe(before);
  await other.close();
  await carry(page, "flow-old").click();
  await expect(transfer.locator('[name="targetPeriod"]')).toHaveValue(
    "2026-W45",
  );
  const reason =
    '<img src=x onerror="window.transferInjected=1"> Dış ekip yanıtı bekleniyor.\nKalan altı madde bu hafta incelenecek.';
  const reasonField = transfer.locator('[name="transferReason"]');
  await reasonField.fill(reason.split("\n")[0]);
  await reasonField.press("Shift+Enter");
  await page.keyboard.insertText(reason.split("\n")[1]);
  await expect(reasonField).toHaveValue(reason);
  expect(await saved(page)).toBe(before);
  await reasonField.press("Enter");
  await expect(transfer).not.toBeVisible();
  await expect(row(page, "flow-old")).toBeVisible();
  await expect(
    row(page, "flow-old").locator('[role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "40");
  const movedRecords = await records(page);
  const old = original.find((record) => record.id === "flow-old");
  const moved = movedRecords.find((record) => record.id === old.id);
  expect(movedRecords).toHaveLength(original.length);
  expect(movedRecords.filter((record) => record.id === old.id)).toHaveLength(1);
  expect(moved.periodKey).toBe("2026-W45");
  expect(unchangedGoalFields(moved)).toEqual(unchangedGoalFields(old));
  expect(moved.sourceFields).toMatchObject(old.sourceFields);
  expect(moved.sourceFields.__weeklyMoves).toHaveLength(1);
  expect(moved.sourceFields.__weeklyMoves[0].reason).toBe(reason);
  expect(movedRecords.filter((record) => record.id !== old.id)).toEqual(
    original.filter((record) => record.id !== old.id),
  );
  expect(moved.status).toBe("in_progress");
  await openBacklog(page);
  await expect(carry(page, "flow-old")).toHaveCount(0);

  await row(page, old.id).locator('[data-action="goal-details"]').click();
  await expect(
    page.locator('#goal-detail-panel .goal-child-row[data-id="flow-child"]'),
  ).toBeVisible();
  const transferReasons = page.locator(
    '#goal-detail-panel .goal-panel-transfer-reasons[data-goal-section="transfers"]',
  );
  await expect(
    transferReasons.locator(
      'li[data-transfer-type="weekly"] .goal-transfer-reason',
    ),
  ).toHaveText(reason);
  await expect(
    transferReasons.locator("input, textarea, select, img"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.transferInjected)).toBeUndefined();
  await page.keyboard.press("Escape");
  const movedSaved = await saved(page);
  await row(page, old.id)
    .locator('.goal-edit-trigger[data-action="edit"]')
    .click();
  await expect(page.locator('#record-form [name="carryForward"]')).toHaveCount(
    0,
  );
  await page
    .locator('#record-form [name="title"]')
    .fill(`${old.title} — düzenlendi`);
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const edited = (await records(page)).find((record) => record.id === old.id);
  expect(edited.carryForward).toBe(true);
  expect(edited.periodKey).toBe("2026-W45");
  expect(edited.sourceFields).toEqual(moved.sourceFields);
  await undo(page);
  expect(await saved(page)).toBe(movedSaved);
  const after = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(after);
  await weekly(page);
  await expect(row(page, old.id)).toBeVisible();
  await undo(page);
  expect(await saved(page)).toBe(before);
  expect(await records(page)).toEqual(original);
  await expect(row(page, old.id)).toHaveCount(0);
  await openBacklog(page);
  await expect(carry(page, old.id)).toBeVisible();
});

test("archived weekly imports stay out of working lists and remain visible in all records or their explicit status filter without changing data", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await weekly(page);
  await page.locator('[data-action="period-all"]').click();
  await expect(row(page, "flow-archived")).toHaveCount(0);
  await selectListStatus(page, "all");
  expect(await rows(page)).toEqual(
    expect.arrayContaining([
      "flow-completed",
      "flow-cancelled",
      "flow-old",
      "flow-archived",
    ]),
  );
  await expect(row(page, "flow-archived")).toBeVisible();
  await expect(page.locator('#status-filter option[value="all"]')).toHaveText(
    "Tüm durumlar",
  );
  await expect(
    page.locator('#status-filter option[value="transferred"]'),
  ).toHaveText("Arşivlenenler");
  await page.locator("#status-filter").selectOption("transferred");
  expect(await rows(page)).toEqual(["flow-archived"]);
  await expect(
    row(page, "flow-archived").locator(".status-trigger"),
  ).toHaveText("Arşivlendi");
  await expect(page.locator(".weekly-backlog")).toHaveCount(0);
  await row(page, "flow-archived")
    .locator('.goal-edit-trigger[data-action="edit"]')
    .click();
  await expect(page.locator('#record-form [name="status"]')).toHaveValue(
    "transferred",
  );
  await expect(page.locator('#record-form [name="carryForward"]')).toHaveCount(
    0,
  );
  await page.locator('#editor [data-action="close"]').last().click();

  await page.locator('#nav [data-view="daily"]').click();
  await row(page, "flow-archived-child").locator(".task-name").click();
  await expect(page.locator('#record-form [name="parentId"]')).toHaveValue(
    "flow-archived",
  );
  await expect(
    page.locator('#record-form [name="parentId"] option:checked'),
  ).toContainText("Arşivlendi");
  await page.locator('#editor [data-action="close"]').last().click();
  expect(await saved(page)).toBe(before);
  expect(await records(page)).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("an empty selected week can bring an older goal across the year boundary into that selected period", async ({
  page,
}) => {
  const original = await seed(
    page,
    fixture().filter((record) => record.id !== "flow-current"),
  );
  const before = await saved(page);
  await weekly(page);
  await expect(page.locator(".full-table")).toHaveCount(0);
  await openBacklog(page);
  await expect(carry(page, "flow-year-boundary")).toBeVisible();
  expect(await saved(page)).toBe(before);

  await page.locator('[data-action="period-prev"]').click();
  await expect(row(page, "flow-old")).toBeVisible();
  await openBacklog(page);
  await carry(page, "flow-year-boundary").click();
  await completeGoalTransfer(page);
  await expect(row(page, "flow-year-boundary")).toBeVisible();
  const after = await records(page);
  const old = original.find((record) => record.id === "flow-year-boundary");
  const moved = after.find((record) => record.id === old.id);
  expect(moved.periodKey).toBe("2026-W44");
  expect(unchangedGoalFields(moved)).toEqual(unchangedGoalFields(old));
  expect(after).toHaveLength(original.length);
  expect(after.filter((record) => record.id !== old.id)).toEqual(
    original.filter((record) => record.id !== old.id),
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
  expect(await records(page)).toEqual(original);
});

test("moving a weekly goal changes its planning week while delivery-week filtering still uses its preserved deadline", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await weekly(page);
  await openBacklog(page);
  await carry(page, "flow-old").click();
  await completeGoalTransfer(page);
  await expect(row(page, "flow-old")).toBeVisible();
  await expect(row(page, "flow-old").locator(".deadline-label")).toHaveText(
    "1 Kas",
  );
  const moved = (await records(page)).find(
    (record) => record.id === "flow-old",
  );
  expect(moved.periodKey).toBe("2026-W45");
  expect(moved.dueDate).toBe("2026-11-01");
  const afterMove = await saved(page);

  await page.locator("#period-filter").selectOption("week");
  await expect(row(page, "flow-old")).toHaveCount(0);
  await expect(row(page, "flow-current")).toBeVisible();
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  expect(await saved(page)).toBe(afterMove);
  await page.locator("#period-filter").selectOption("all");
  await expect(row(page, "flow-old")).toBeVisible();
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  expect(await saved(page)).toBe(afterMove);

  await undo(page);
  expect(await saved(page)).toBe(before);
  expect(await records(page)).toEqual(original);
});
