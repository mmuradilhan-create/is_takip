import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const context = (page, id) =>
  row(page, id).locator(".task-meta-line .task-sub");
const link = (page, rowId, action, id) =>
  (action === "edit" ? row(page, rowId) : context(page, rowId)).locator(
    `.record-context-link[data-action="${action}"][data-id="${id}"]`,
  );
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const closeEditor = (page) =>
  page.locator('#editor [data-action="close"]').last().click();

function fixture() {
  return [
    make({
      id: "context-year",
      type: "yearly",
      title: "Senelik kalite hedefi",
      periodKey: "2026",
      targetValue: 10,
      currentValue: 3,
      metric: "Rapor",
    }),
    make({
      id: "context-month",
      type: "monthly",
      title: "Aylık kalite hedefi",
      periodKey: "2026-11",
      goalParentId: "context-year",
    }),
    make({
      id: "context-week",
      type: "weekly",
      title: "Haftalık teknik teslim",
      periodKey: "2026-W45",
      goalParentId: "context-month",
    }),
    make({
      id: "context-meeting",
      type: "meeting",
      title: "ÖRNEK arayüzünü güncelle",
      decision: "Kaynak toplantı kararı korunmalı.",
    }),
    make({
      id: "context-waiting",
      type: "waiting",
      title: "Dış ekibin teknik yanıtı",
      expectedFrom: "Üretim",
      latestUpdate: "Yanıt bekleniyor.",
      nextFollowUpDate: "2026-11-12",
    }),
    make({
      id: "context-from-meeting",
      title: "ÖRNEK arayüzünü güncelle",
      parentId: "context-week",
      projectCode: "GK-42",
      workType: "Tasarım",
      dueDate: "2026-11-10",
      sourceFields: {
        __followupSource: { recordId: "context-meeting", type: "meeting" },
      },
    }),
    make({
      id: "context-from-waiting",
      title: "Dış ekibe teknik hatırlatma gönder",
      parentId: "context-week",
      projectCode: "GK-43",
      workType: "Takip",
      sourceFields: {
        __followupSource: { recordId: "context-waiting", type: "waiting" },
      },
    }),
    make({
      id: "context-plain-daily",
      title: "Bağımsız sade günlük iş",
      dueDate: "2026-11-10",
      description: "Notlar satır altına dolgu olmamalı.",
      nextAction: "Bu adım da dolgu olmamalı.",
    }),
    make({
      id: "context-plain-meeting",
      type: "meeting",
      title: "Bağımsız sade toplantı aksiyonu",
      decision: "Karar metni dolgu olmamalı.",
    }),
    make({
      id: "context-owned-meeting",
      type: "meeting",
      title: "Sorumlusu ve katılımcısı bilinen aksiyon",
      owner: "Aslı Kaya",
      participants: "Tasarım ve üretim ekibi",
      decision: "Paylaşılan gerçek toplantı kararı.",
      sourceDate: "2026-11-05",
    }),
  ];
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("record-context-0212-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: items,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("record-context-0212-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

test("daily context keeps the parent visible and its real source in a compact title icon with keyboard-accessible read-only destinations", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await view(page, "daily");
  for (const [id, sourceId] of [
    ["context-from-meeting", "context-meeting"],
    ["context-from-waiting", "context-waiting"],
  ]) {
    const item = items.find((item) => item.id === id);
    await expect(context(page, id)).not.toContainText(item.projectCode);
    await expect(context(page, id)).not.toContainText(item.workType);
    await expect(link(page, id, "goal-details", "context-week")).toContainText(
      "Haftalık teknik teslim",
    );
    const source = link(page, id, "edit", sourceId);
    const sourceRecord = items.find((item) => item.id === sourceId);
    await expect(source).toBeVisible();
    await expect(source).toHaveClass(/record-source-link/);
    await expect(source).toHaveText("");
    await expect(source.locator("svg")).toHaveCount(1);
    await expect(source).toHaveAttribute(
      "title",
      `${sourceRecord.type === "meeting" ? "Toplantı" : "Bekleyen konu"}: ${sourceRecord.title}`,
    );
    await expect(
      context(page, id).locator('[data-context-kind="source"]'),
    ).toHaveCount(0);
    await expect(context(page, id)).not.toContainText("Toplantıdan gelen iş");
    await expect(source.locator("xpath=..")).toHaveClass(
      "record-title-content",
    );
    await link(page, id, "goal-details", "context-week").focus();
    await page.keyboard.press("Enter");
    const panel = page.locator("#goal-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".goal-panel-title")).toHaveText(
      "Haftalık teknik teslim",
    );
    await expect(panel).toHaveAttribute("data-goal-id", "context-week");
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(page.locator("#page-title")).toHaveText("Günlük işler");
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await link(page, id, "edit", sourceId).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#editor")).toBeVisible();
    await expect(page.locator('#record-form [name="id"]')).toHaveValue(
      sourceId,
    );
    await expect(page.locator('#record-form [name="title"]')).toHaveValue(
      items.find((item) => item.id === sourceId).title,
    );
    await expect(page.locator("#page-title")).toHaveText("Günlük işler");
    await closeEditor(page);
    expect(await saved(page)).toBe(before);
  }
  await page.reload();
  expect(await saved(page)).toBe(before);
});

test("weekly and monthly context names the actual upper goal and shows a human period only outside a selected period", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  for (const [type, id, parentId, parentTitle, period] of [
    [
      "weekly",
      "context-week",
      "context-month",
      "Aylık kalite hedefi",
      "2 – 8 Kasım 2026",
    ],
    [
      "monthly",
      "context-month",
      "context-year",
      "Senelik kalite hedefi",
      "Kasım 2026",
    ],
  ]) {
    await view(page, type);
    await page.locator('[data-action="period-all"]').click();
    await expect(context(page, id)).toContainText(period);
    await expect(context(page, id)).not.toContainText("2026-W45");
    await expect(link(page, id, "goal-details", parentId)).toContainText(
      parentTitle,
    );
    await link(page, id, "goal-details", parentId).click();
    await expect(
      page.locator("#goal-detail-panel .goal-panel-title"),
    ).toHaveText(parentTitle);
    await expect(page.locator("#goal-next-step-form")).toHaveAttribute(
      "data-id",
      parentId,
    );
    await page.keyboard.press("Escape");
    await page.locator('[data-action="period-current"]').click();
    await expect(page.locator("#planning-period-label")).toHaveText(period);
    await expect(context(page, id)).not.toContainText(period);
    await expect(link(page, id, "goal-details", parentId)).toContainText(
      parentTitle,
    );
    await page.locator('[data-action="period-all"]').click();
    await expect(context(page, id)).toContainText(period);
    expect(await saved(page)).toBe(before);
  }
});

test("selected yearly goals and plain daily records have no filler while meeting decisions and dates are primary and people stay in optional details", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await view(page, "yearly");
  await page.locator('[data-action="period-all"]').click();
  await expect(context(page, "context-year")).toHaveText("2026");
  await page.locator('[data-action="period-current"]').click();
  await expect(page.locator("#planning-period-label")).toHaveText("2026");
  await expect(
    row(page, "context-year").locator(".task-meta-line, .task-sub"),
  ).toHaveCount(0);
  await view(page, "daily");
  await expect(
    row(page, "context-plain-daily").locator(".task-meta-line, .task-sub"),
  ).toHaveCount(0);
  await view(page, "meeting");
  await expect(
    row(page, "context-plain-meeting").locator(".task-meta-line, .task-sub"),
  ).toHaveCount(0);
  await expect(
    row(page, "context-owned-meeting").locator(".meeting-decision"),
  ).toHaveText("Paylaşılan gerçek toplantı kararı.");
  await expect(
    row(page, "context-owned-meeting").locator(".meeting-date"),
  ).toContainText("5 Kas");
  await expect(row(page, "context-owned-meeting")).not.toContainText(
    "Aslı Kaya",
  );
  await expect(row(page, "context-owned-meeting")).not.toContainText(
    "Tasarım ve üretim ekibi",
  );
  await row(page, "context-owned-meeting").locator(".task-name").click();
  await openCreationExtras(page);
  await expect(page.locator('#record-form [name="owner"]')).toHaveValue(
    "Aslı Kaya",
  );
  await expect(page.locator('#record-form [name="participants"]')).toHaveValue(
    "Tasarım ve üretim ekibi",
  );
  await expect(page.locator('#record-form [name="sourceDate"]')).toHaveValue(
    "05.11.2026",
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
});

test("context escapes long captions and removes Turkish-equivalent duplicates without merging distinct accents or dotted I", async ({
  page,
}) => {
  const attack = '<img src=x onerror="window.recordContextInjected=1">';
  const longTitle = `${attack} ${"Uzun kaynak başlığı ".repeat(20)}`;
  const items = [
    make({ id: "long-source", type: "meeting", title: longTitle }),
    make({
      id: "long-goal",
      type: "weekly",
      title: `Uzun hedef ${"teknik kapsam ".repeat(25)}`,
      periodKey: "2026-W45",
    }),
    make({
      id: "long-child",
      title: `Gerçek günlük başlık ${"ayrıntı ".repeat(35)}`,
      parentId: "long-goal",
      projectCode: `${attack} ${"A".repeat(55)}`,
      workType: "Uzun ve korunacak gerçek iş türü",
      sourceFields: {
        __followupSource: { recordId: "long-source", type: "meeting" },
      },
    }),
    make({
      id: "nfkc-duplicate",
      title: "Normalize edilen seçimler",
      projectCode: "ＴＥＳＴ",
      workType: "test",
    }),
    make({
      id: "title-duplicate",
      title: "İnceleme",
      projectCode: "İNCELEME",
      workType: "inceleme",
    }),
    make({
      id: "accent-distinct",
      title: "Ayrı seçimler",
      projectCode: "Ölçüm",
      workType: "Olcum",
    }),
    make({
      id: "dotless-same",
      title: "Aynı Türkçe seçimler",
      projectCode: "I-42",
      workType: "ı-42",
    }),
    make({
      id: "dotted-distinct",
      title: "Ayrı Türkçe seçimler",
      projectCode: "I-42",
      workType: "İ-42",
    }),
  ];
  await page.setViewportSize({ width: 1280, height: 720 });
  await seed(page, items);
  const before = await saved(page);
  await view(page, "daily");
  await expect(link(page, "long-child", "edit", "long-source")).toContainText(
    longTitle,
  );
  await expect(
    link(page, "long-child", "goal-details", "long-goal"),
  ).toContainText(items[1].title);
  await expect(context(page, "long-child")).toContainText(items[2].projectCode);
  await expect(
    context(page, "nfkc-duplicate").locator(".record-context-part"),
  ).toHaveCount(1);
  await expect(
    row(page, "title-duplicate").locator(".task-meta-line, .task-sub"),
  ).toHaveCount(0);
  await expect(context(page, "accent-distinct")).toContainText("Ölçüm");
  await expect(context(page, "accent-distinct")).toContainText("Olcum");
  await expect(
    context(page, "dotless-same").locator(".record-context-part"),
  ).toHaveCount(1);
  await expect(context(page, "dotted-distinct")).toContainText("I-42");
  await expect(context(page, "dotted-distinct")).toContainText("İ-42");
  await expect(page.locator(".task-meta-line img")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.recordContextInjected),
  ).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await link(page, "long-child", "edit", "long-source").click();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    longTitle.trim(),
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
});
