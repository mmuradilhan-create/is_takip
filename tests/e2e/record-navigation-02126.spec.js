import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-02T09:00:00.000Z";
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const activeView = (page) => page.locator('#nav [aria-current="page"]');
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  return TYPES.map((type) =>
    createRecord({
      id: `navigation-${type}`,
      type,
      title: `Eski ${type} kaydı`,
      status: type === "waiting" ? "waiting_response" : "in_progress",
      priority: "high",
      periodKey:
        { weekly: "2026-W46", monthly: "2026-11", yearly: "2026" }[type] || "",
      dueDate: "2026-11-09",
      sourceDate: "2026-11-02",
      nextFollowUpDate: type === "waiting" ? "2026-11-09" : "",
      expectedFrom: type === "waiting" ? "Tasarım" : "",
      description: `Korunacak gerçek ${type} notu.`,
      sourceFields: { original: { code: `HAM-${type}`, value: "1,250" } },
      workLog: [
        {
          id: `navigation-${type}-log`,
          date: "2026-11-02",
          endedAt: STAMP,
          durationMs: 61_234,
          note: "Özgün sonuç.",
          nextAction: "Özgün tarihsel adım.",
        },
      ],
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
}

async function seed(page) {
  const records = fixture();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (!sessionStorage.getItem("record-navigation-02126-seeded")) {
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
        sessionStorage.setItem("record-navigation-02126-seeded", "1");
      }
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key && window.navigationQuota)
          throw new DOMException("Kota doldu", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return { records, raw: await saved(page) };
}

async function view(page, type) {
  const toggle = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
  await expect(activeView(page)).toHaveAttribute("data-view", type);
}

async function launch(page, inline = false) {
  await page.locator(inline ? ".add-inline" : ".topbar .new-record").click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator(".creation-advanced")).toHaveJSProperty(
    "open",
    false,
  );
}

async function saveCreation(page) {
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function chooseFuturePeriod(page, type) {
  if (!["weekly", "monthly", "yearly"].includes(type)) return "";
  await field(page, "periodYear").selectOption("2027");
  if (type === "weekly") await field(page, "periodWeek").selectOption("12");
  if (type === "monthly") await field(page, "periodMonth").selectOption("04");
  const key = { weekly: "2027-W12", monthly: "2027-04", yearly: "2027" }[type];
  await expect(field(page, "periodKey")).toHaveValue(key);
  return key;
}

async function filterSource(page, type) {
  await page
    .locator("#status-filter")
    .selectOption(type === "waiting" ? "waiting_response" : "in_progress");
  if (type === "daily") {
    await page.locator("#priority-filter").selectOption("high");
    await page.locator("#work-context-filter").selectOption("planned");
  }
  await page.locator("#period-filter").selectOption("today");
  await page.locator("#global-search").fill("Eski");
  await expect(row(page, `navigation-${type}`)).toBeVisible();
}

async function expectSourceFilters(page) {
  await expect(activeView(page)).toHaveAttribute("data-view", "daily");
  await expect(page.locator("#global-search")).toHaveValue("Eski");
  await expect(page.locator("#status-filter")).toHaveValue("in_progress");
  await expect(page.locator("#priority-filter")).toHaveValue("high");
  await expect(page.locator("#work-context-filter")).toHaveValue("planned");
  await expect(page.locator("#period-filter")).toHaveValue("today");
}

test("each existing editor starts with collapsed extras while expansion and entered notes survive type changes only within that form", async ({
  page,
}) => {
  const { raw } = await seed(page);
  for (const type of TYPES) {
    await view(page, type);
    const edit = row(page, `navigation-${type}`).locator(
      ["weekly", "monthly", "yearly"].includes(type)
        ? ".goal-edit-trigger"
        : ["meeting", "waiting"].includes(type)
          ? ".record-edit-trigger"
          : ".task-name",
    );
    await edit.click();
    const extras = form(page).locator("[data-record-editor-extras]");
    await expect(extras).toHaveJSProperty("open", false);
    await expect(field(page, "description")).not.toBeVisible();
    await extras.locator(":scope > summary").click();
    await field(page, "description").fill(`Kaydedilmeyen ${type} notu.`);
    const alternative = type === "daily" ? "weekly" : "daily";
    await field(page, "type").selectOption(alternative);
    await expect(extras).toHaveJSProperty("open", true);
    await expect(field(page, "description")).toHaveValue(
      `Kaydedilmeyen ${type} notu.`,
    );
    await field(page, "type").selectOption(type);
    await expect(extras).toHaveJSProperty("open", true);
    await expect(field(page, "description")).toHaveValue(
      `Kaydedilmeyen ${type} notu.`,
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('#editor [data-action="close"]').last().click();
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(await saved(page)).toBe(raw);
    await edit.click();
    await expect(extras).toHaveJSProperty("open", false);
    await page.locator('#editor [data-action="close"]').last().click();
    expect(await saved(page)).toBe(raw);
  }
});

test("successful global creation opens its chosen list and goal period while removing the previous list search and local filters", async ({
  page,
}) => {
  const { records, raw } = await seed(page);
  for (const [index, type] of TYPES.entries()) {
    const source = type === "daily" ? "waiting" : "daily";
    await view(page, source);
    await filterSource(page, source);
    await launch(page, index % 2 === 1);
    await field(page, "type").selectOption(type);
    const periodKey = await chooseFuturePeriod(page, type);
    await field(page, "title").fill(`Başka listeye yeni ${type}`);
    await expect(activeView(page)).toHaveAttribute("data-view", source);
    expect(await saved(page)).toBe(raw);
    await saveCreation(page);
    await expect(activeView(page)).toHaveAttribute("data-view", type);
    await expect(page.locator("#global-search")).toHaveValue("");
    await expect(page.locator("#status-filter")).toHaveValue("all");
    await expect(
      page.locator('.list-scope-tabs [aria-pressed="true"]'),
    ).toHaveAttribute("data-scope", "open");
    for (const id of [
      "priority-filter",
      "work-context-filter",
      "period-filter",
    ])
      if (await page.locator(`#${id}`).count())
        await expect(page.locator(`#${id}`)).toHaveValue("all");
    const after = await stored(page);
    const created = after.records.find(
      (item) => !records.some((original) => original.id === item.id),
    );
    expect(created).toMatchObject({
      type,
      title: `Başka listeye yeni ${type}`,
    });
    expect(after.records.filter((item) => item.id !== created.id)).toEqual(
      records,
    );
    expect(after.odak.history).toHaveLength(1);
    await expect(row(page, created.id)).toBeVisible();
    if (periodKey) {
      expect(created.periodKey).toBe(periodKey);
      await expect(page.locator("#planning-period-label")).toContainText(
        "2027",
      );
      await expect(page.locator('[data-action="period-all"]')).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    await undo(page);
    expect(await saved(page)).toBe(raw);
  }
});

test("same-list global creation preserves the current search, filters, scope and selected goal period", async ({
  page,
}) => {
  const { records, raw } = await seed(page);
  await view(page, "daily");
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await filterSource(page, "daily");
  await expectSourceFilters(page);
  await page.locator("#list-sort").selectOption("created-asc");
  for (const inline of [false, true]) {
    await launch(page, inline);
    await field(page, "title").fill(`Filtre dışında günlük ${inline}`);
    await saveCreation(page);
    await expectSourceFilters(page);
    await expect(
      page.locator('.list-scope-tabs [aria-pressed="true"]'),
    ).toHaveAttribute("data-scope", "all");
    await expect(page.locator("#list-sort")).toHaveValue("created-asc");
    const after = await stored(page);
    const created = after.records.find(
      (item) => !records.some((original) => original.id === item.id),
    );
    expect(created).toMatchObject({ type: "daily", status: "planned" });
    await expect(row(page, created.id)).toHaveCount(0);
    expect(after.records.filter((item) => item.id !== created.id)).toEqual(
      records,
    );
    expect(after.odak.history).toHaveLength(1);
    await undo(page);
    expect(await saved(page)).toBe(raw);
  }
  await page.locator("#global-search").fill("");
  await view(page, "monthly");
  await page.locator('[data-action="period-current"]').click();
  await expect(page.locator("#planning-period-label")).toHaveText("Kasım 2026");
  await launch(page);
  await chooseFuturePeriod(page, "monthly");
  await field(page, "title").fill("Farklı dönemli aynı liste hedefi");
  await saveCreation(page);
  await expect(activeView(page)).toHaveAttribute("data-view", "monthly");
  await expect(page.locator("#planning-period-label")).toHaveText("Kasım 2026");
  const after = await stored(page);
  const created = after.records.find(
    (item) => !records.some((original) => original.id === item.id),
  );
  expect(created.periodKey).toBe("2027-04");
  await expect(row(page, created.id)).toHaveCount(0);
  await undo(page);
  expect(await saved(page)).toBe(raw);
});

test("cancelled and failed global drafts keep their source list until a successful retry navigates exactly once", async ({
  page,
}) => {
  const { records, raw } = await seed(page);
  await view(page, "daily");
  await filterSource(page, "daily");
  await launch(page);
  await field(page, "type").selectOption("waiting");
  await field(page, "title").fill("Kaydedilmeyen bekleyen konu");
  page.once("dialog", (dialog) => dialog.dismiss());
  await form(page).getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(form(page)).toBeVisible();
  await expect(activeView(page)).toHaveAttribute("data-view", "daily");
  expect(await saved(page)).toBe(raw);
  page.once("dialog", (dialog) => dialog.accept());
  await form(page).getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expectSourceFilters(page);
  expect(await saved(page)).toBe(raw);
  await launch(page, true);
  await field(page, "type").selectOption("weekly");
  await chooseFuturePeriod(page, "weekly");
  await field(page, "title").fill("Kotadan sonra yeni haftalık hedef");
  await page.evaluate(() => (window.navigationQuota = true));
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(form(page).locator("#form-error")).toContainText(
    "kaydedilemedi",
  );
  await expect(form(page)).toBeVisible();
  await expect(activeView(page)).toHaveAttribute("data-view", "daily");
  await expect(field(page, "type")).toHaveValue("weekly");
  await expect(field(page, "title")).toHaveValue(
    "Kotadan sonra yeni haftalık hedef",
  );
  await expect(field(page, "periodKey")).toHaveValue("2027-W12");
  expect(await saved(page)).toBe(raw);
  await page.evaluate(() => (window.navigationQuota = false));
  await saveCreation(page);
  await expect(activeView(page)).toHaveAttribute("data-view", "weekly");
  await expect(page.locator("#global-search")).toHaveValue("");
  const after = await stored(page);
  const created = after.records.filter(
    (item) => !records.some((original) => original.id === item.id),
  );
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    type: "weekly",
    title: "Kotadan sonra yeni haftalık hedef",
    periodKey: "2027-W12",
  });
  expect(after.records.filter((item) => item.id !== created[0].id)).toEqual(
    records,
  );
  expect(after.odak.history).toHaveLength(1);
  await expect(row(page, created[0].id)).toBeVisible();
  await undo(page);
  expect(await saved(page)).toBe(raw);
});
