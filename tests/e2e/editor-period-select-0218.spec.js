import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-06T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await raw(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const make = (values) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...values });

function fixture() {
  return [
    make({
      id: "period-week",
      type: "weekly",
      title: "Yılın son haftası için doğrulama",
      periodKey: "2026-W53",
      dueDate: "2026-12-31",
      priority: "high",
      metric: "Rapor",
      targetValue: 10,
      currentValue: 2,
      description: "Özgün haftalık not.",
      sourceFields: { original: { value: "Kaynak dönem bilgisi korunmalı" } },
    }),
    make({
      id: "period-month",
      type: "monthly",
      title: "Aylık doğrulama dosyası",
      periodKey: "2026-11",
      dueDate: "2026-11-30",
      description: "Özgün aylık not.",
    }),
    make({
      id: "period-year",
      type: "yearly",
      title: "Uzun dönem doğrulama hedefi",
      periodKey: "2048",
      dueDate: "2048-12-31",
      description: "Özgün senelik not.",
    }),
    make({
      id: "period-legacy",
      type: "monthly",
      title: "Eski dönem metni bulunan hedef",
      periodKey: 'İthal dönem <img src=x onerror="window.periodInjected=1">',
      description: "Özgün aktarım notu.",
      sourceFields: { original: "Ham dönem kaybolmamalı" },
    }),
    make({
      id: "period-empty",
      type: "weekly",
      title: "Dönemi henüz seçilmemiş hedef",
      periodKey: "",
      description: "Boş dönem korunmalı.",
    }),
    make({
      id: "period-daily",
      title: "Başka türe geçiş taslağı",
      workContext: "ad_hoc",
      periodKey: "Özgün eski alan",
      description: "Günlük kişisel not.",
    }),
  ];
}

async function seed(page) {
  const items = fixture();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("editor-period-0218-seeded")) return;
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
      sessionStorage.setItem("editor-period-0218-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function view(page, type) {
  await page.locator(`#nav [data-view="${type}"]`).click();
  if (["weekly", "monthly", "yearly"].includes(type))
    await page.locator('[data-action="period-all"]').click();
}

async function open(page, type, id) {
  await view(page, type);
  await row(page, id).locator(".task-name").click();
  if (["weekly", "monthly", "yearly"].includes(type)) {
    const panel = page.locator("#goal-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-goal-id", id);
    await panel
      .getByRole("button", { name: "Hedefi düzenle", exact: true })
      .click();
  }
  await expect(form(page)).toBeVisible();
  await expect(field(page, "id")).toHaveValue(id);
  await expect(field(page, "type")).toHaveValue(type);
}

async function save(page) {
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function cancel(page) {
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

test("existing week, month and year edits show friendly selectors while unrelated note edits preserve every period, source field and old date through exact Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await raw(page);
  for (const [type, id, year, second, value] of [
    ["weekly", "period-week", "2026", "editorPeriodWeek", "53"],
    ["monthly", "period-month", "2026", "editorPeriodMonth", "11"],
    ["yearly", "period-year", "2048", null, null],
  ]) {
    const original = items.find((item) => item.id === id);
    await open(page, type, id);
    await expect(field(page, "periodKey")).toHaveAttribute("type", "hidden");
    await expect(field(page, "periodKey")).toHaveValue(original.periodKey);
    await expect(field(page, "editorPeriodYear")).toHaveValue(year);
    await expect(
      form(page).locator(
        "[data-record-editor-basic] [data-editor-period-field]",
      ),
    ).toBeVisible();
    if (second) await expect(field(page, second)).toHaveValue(value);
    if (type === "weekly")
      await expect(
        field(page, second).locator('option[value="53"]'),
      ).toContainText(/Aralık.*Ocak/);
    if (type === "monthly")
      await expect(
        field(page, second).locator('option[value="11"]'),
      ).toHaveText("Kasım");
    expect(await raw(page)).toBe(before);
    await openCreationExtras(page);
    await field(page, "description").fill(
      `${original.description} Düzenlenen not.`,
    );
    await save(page);
    expect((await stored(page)).records.find((item) => item.id === id)).toEqual(
      {
        ...original,
        description: `${original.description} Düzenlenen not.`,
        updatedAt: NOW.toISOString(),
      },
    );
    await undo(page);
    expect(await raw(page)).toBe(before);
  }
});

test("an explicit year or period selection updates only the selected goal period, clamps unavailable ISO week 53 and remains one reversible edit", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await raw(page);
  await open(page, "weekly", "period-week");
  await field(page, "editorPeriodYear").selectOption("2027");
  await expect(field(page, "editorPeriodWeek")).toHaveValue("52");
  await expect(
    field(page, "editorPeriodWeek").locator('option[value="53"]'),
  ).toHaveCount(0);
  await expect(field(page, "periodKey")).toHaveValue("2027-W52");
  await field(page, "editorPeriodWeek").selectOption("46");
  await expect(field(page, "periodKey")).toHaveValue("2027-W46");
  await save(page);
  expect(
    (await stored(page)).records.find((item) => item.id === "period-week"),
  ).toEqual({
    ...items.find((item) => item.id === "period-week"),
    periodKey: "2027-W46",
    updatedAt: NOW.toISOString(),
  });
  await page.reload();
  await undo(page);
  expect(await raw(page)).toBe(before);
  await open(page, "monthly", "period-month");
  await field(page, "editorPeriodYear").selectOption("2027");
  await field(page, "editorPeriodMonth").selectOption("02");
  await expect(field(page, "periodKey")).toHaveValue("2027-02");
  await save(page);
  expect(
    (await stored(page)).records.find((item) => item.id === "period-month"),
  ).toEqual({
    ...items.find((item) => item.id === "period-month"),
    periodKey: "2027-02",
    updatedAt: NOW.toISOString(),
  });
  await undo(page);
  expect(await raw(page)).toBe(before);
});

test("empty and legacy period text stays exact until an explicit selection, including basic type switches and cancellation", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await raw(page);
  const legacy = items.find((item) => item.id === "period-legacy");
  await open(page, "monthly", legacy.id);
  await expect(field(page, "editorPeriodYear")).toHaveValue("");
  await expect(field(page, "editorPeriodMonth")).toBeDisabled();
  await expect(field(page, "periodKey")).toHaveValue(legacy.periodKey);
  await expect(
    form(page).locator(".record-editor-period-legacy"),
  ).toContainText(legacy.periodKey);
  await expect(
    form(page).locator(".record-editor-period-field img"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.periodInjected)).toBeUndefined();
  await openCreationExtras(page);
  await form(page).locator('select[name="type"]').selectOption("daily");
  await expect(field(page, "periodKey")).toHaveValue(legacy.periodKey);
  await expect(field(page, "periodKey")).toBeDisabled();
  await openCreationExtras(page);
  await form(page).locator('select[name="type"]').selectOption("monthly");
  await expect(field(page, "periodKey")).toHaveValue(legacy.periodKey);
  await expect(field(page, "editorPeriodYear")).toHaveValue("");
  await field(page, "title").fill("Eski dönem metni başlığı düzeltildi");
  await save(page);
  expect(
    (await stored(page)).records.find((item) => item.id === legacy.id),
  ).toEqual({
    ...legacy,
    title: "Eski dönem metni başlığı düzeltildi",
    updatedAt: NOW.toISOString(),
  });
  await undo(page);
  expect(await raw(page)).toBe(before);
  await open(page, "weekly", "period-empty");
  await expect(field(page, "periodKey")).toHaveValue("");
  await expect(field(page, "editorPeriodYear")).toHaveValue("");
  await expect(field(page, "editorPeriodWeek")).toBeDisabled();
  await cancel(page);
  expect(await raw(page)).toBe(before);
  await open(page, "daily", "period-daily");
  await openCreationExtras(page);
  await form(page).locator('select[name="type"]').selectOption("weekly");
  await expect(field(page, "periodKey")).toHaveValue("Özgün eski alan");
  await expect(field(page, "editorPeriodYear")).toHaveValue("");
  await openCreationExtras(page);
  await form(page).locator('select[name="type"]').selectOption("daily");
  await cancel(page);
  expect(await raw(page)).toBe(before);
});
