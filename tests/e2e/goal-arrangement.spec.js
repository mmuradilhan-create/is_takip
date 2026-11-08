import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T09:00:00.000Z";
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];

function fixture() {
  return TYPES.map((type) =>
    createRecord({
      id: `arrange-${type}`,
      type,
      title: `Düzenlenecek ${type}`,
      priority: "normal",
      status: "in_progress",
      dueDate: "2026-11-07",
      periodKey:
        { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] || "",
      parentId: type === "daily" ? "arrange-weekly" : "",
      targetValue: ["weekly", "monthly", "yearly"].includes(type) ? 10 : null,
      currentValue: ["weekly", "monthly", "yearly"].includes(type) ? 4 : null,
      metric: ["weekly", "monthly", "yearly"].includes(type) ? "Rapor" : "",
      nextAction: `Özgün ${type} adımı`,
      description: "Hedef ve kaynak bilgileri korunmalı.",
      sourceFields: { "Özgün alan": { value: "Korunacak değer" } },
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: new Date("2026-11-07T12:00:00Z") });
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("goal-arrangement-seeded")) return;
      localStorage.setItem(key, JSON.stringify({ version: 1, records }));
      sessionStorage.setItem("goal-arrangement-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, type) =>
  page.locator(`.full-table > tbody > tr[data-id="arrange-${type}"]`);
const panel = (page) => page.locator("#goal-detail-panel");
const openList = (page, type) =>
  page.locator(`#nav [data-view="${type}"]`).click();

test("completion is left of the title and work start is at the far right of both daily views", async ({
  page,
}) => {
  const records = await seed(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openList(page, "daily");
    const daily = row(page, "daily");
    const complete = await daily
      .locator(".task-title-cell > .quick-complete")
      .boundingBox();
    const title = await daily.locator(".task-name").boundingBox();
    const status = await daily.locator(".status-trigger").boundingBox();
    const due = await daily.locator(".inline-date").boundingBox();
    const start = await daily
      .locator("td.row-action-col .work-start")
      .boundingBox();
    expect(complete.x + complete.width).toBeLessThanOrEqual(title.x);
    expect(start.x).toBeGreaterThan(status.x + status.width);
    expect(start.x).toBeGreaterThan(due.x + due.width);
    await expect(
      daily.locator(".status-cell-controls .quick-complete"),
    ).toHaveCount(0);
    await openList(page, "dashboard");
    const focus = page.locator('.focus-row[data-id="arrange-daily"]');
    const focusComplete = await focus
      .locator(":scope > .quick-complete")
      .boundingBox();
    const focusTitle = await focus.locator(".focus-title").boundingBox();
    const focusStart = await focus.locator(".work-start").boundingBox();
    const focusStatus = await focus.locator(".status-trigger").boundingBox();
    expect(focusComplete.x + focusComplete.width).toBeLessThanOrEqual(
      focusTitle.x,
    );
    expect(focusStart.x).toBeGreaterThan(focusStatus.x + focusStatus.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(await readRecords(page)).toEqual(records);
});

test("quick status menus omit terminal completion and closed records can still be reopened", async ({
  page,
}) => {
  const records = await seed(page);
  for (const type of TYPES) {
    await openList(page, type);
    const item = row(page, type);
    await item.locator(".status-trigger").click();
    await expect(
      page.locator('#status-menu [data-status="completed"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('#status-menu [data-status="in_progress"]'),
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await item.locator(".task-title-cell > .quick-complete").click();
    await selectListStatus(page, "completed");
    await expect(
      item.locator(".task-title-cell > .completion-mark.is-completed"),
    ).toBeVisible();
    await expect(item.locator(".quick-complete")).toHaveCount(0);
    await item.locator(".status-trigger").click();
    await page.locator('#status-menu [data-status="planned"]').click();
    expect((await readRecords(page)).find((r) => r.type === type).status).toBe(
      "planned",
    );
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    expect(await readRecords(page)).toEqual(records);
  }
});

test("weekly add-step action opens a linked daily draft without changing the goal or growing its row", async ({
  page,
}) => {
  const records = await seed(page);
  await openList(page, "weekly");
  const weekly = row(page, "weekly");
  const beforeHeight = (await weekly.boundingBox()).height;
  const before = await readSaved(page);
  await expect(weekly.locator(".weekly-work-time, .linked-toggle")).toHaveCount(
    0,
  );
  await expect(weekly.locator(".metric-cell")).toContainText("%40");
  await weekly.locator('.goal-add-step[data-action="new-linked"]').click();
  const form = page.locator("#record-form");
  await expect(form.locator('select[name="type"]')).toHaveValue("daily");
  await expect(form.locator('[name="parentId"]')).toHaveValue("arrange-weekly");
  await form.locator('[name="title"]').fill("İlk yeni günlük adım");
  await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readSaved(page)).toBe(before);
  expect((await weekly.boundingBox()).height).toBe(beforeHeight);
  await weekly.locator(".goal-details-trigger").click();
  await expect(panel(page).locator(".goal-child-row")).toHaveCount(1);
  const child = panel(page).locator('.goal-child-row[data-id="arrange-daily"]');
  const complete = await child.locator(".quick-complete").boundingBox();
  const title = await child.locator(".goal-child-title").boundingBox();
  const start = await child
    .locator(".goal-child-action .work-start")
    .boundingBox();
  expect(complete.x + complete.width).toBeLessThanOrEqual(title.x);
  expect(start.x).toBeGreaterThan(title.x);
  expect((await weekly.boundingBox()).height).toBe(beforeHeight);
  await panel(page)
    .getByRole("button", { name: "Yeni adım ekle", exact: true })
    .click();
  await expect(panel(page)).not.toBeVisible();
  await expect(form.locator('[name="parentId"]')).toHaveValue("arrange-weekly");
  await form.locator('[name="title"]').fill("Kaydedilen günlük adım");
  await form.getByRole("button", { name: "Kaydı ekle", exact: true }).click();
  const added = await readRecords(page);
  expect(added).toHaveLength(records.length + 1);
  expect(added.find((r) => r.id === "arrange-weekly")).toEqual(
    records.find((r) => r.id === "arrange-weekly"),
  );
  expect(added.find((r) => r.title === "Kaydedilen günlük adım").parentId).toBe(
    "arrange-weekly",
  );
  await weekly.locator(".goal-details-trigger").click();
  await expect(panel(page).locator(".goal-child-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".goal-child-row")).toHaveCount(1);
  expect(await readRecords(page)).toEqual(records);
});

test("monthly and yearly plans share details and child actions while preserving next-step drafts across refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const records = await seed(page);
  for (const type of ["monthly", "yearly"]) {
    await openList(page, type);
    const goal = row(page, type);
    const saved = await readSaved(page);
    await expect(
      goal.locator(".task-meta-line .goal-details-trigger"),
    ).toHaveCount(0);
    const details = goal.locator(".row-end-actions .goal-details-trigger");
    await expect(details).toHaveText("");
    await expect(details.locator("svg")).toHaveCount(1);
    await goal.locator('.goal-add-step[data-action="new-linked"]').click();
    const form = page.locator("#record-form");
    await expect(form.locator('select[name="type"]')).toHaveValue(
      type === "monthly" ? "weekly" : "monthly",
    );
    await expect(form.locator('[name="goalParentId"]')).toHaveValue(
      `arrange-${type}`,
    );
    expect(await readSaved(page)).toBe(saved);
    await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
    expect(await readSaved(page)).toBe(saved);
    await details.click();
    const field = panel(page).locator(
      '#goal-next-step-form [name="nextAction"]',
    );
    const save = panel(page).getByRole("button", {
      name: "Adımı kaydet",
      exact: true,
    });
    await field.click();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(`Özgün ${type} adımı`);
    await expect(save).toBeDisabled();
    await expect(
      panel(page).locator(".goal-child-row, .work-start"),
    ).toHaveCount(0);
    await expect(panel(page).locator(".goal-new-step")).toHaveCount(1);
    await expect(panel(page).locator(".goal-panel-progress")).toHaveAttribute(
      "data-progress-basis",
      "metric",
    );
    await expect(panel(page).locator(".goal-panel-metric")).toContainText(
      "4 / 10 Rapor",
    );
    await field.fill(`Yeni ${type} adımı`);
    await goal.locator(".status-trigger").click();
    await page.locator('#status-menu [data-status="waiting"]').click();
    await expect(panel(page)).toBeVisible();
    await expect(field).toHaveValue(`Yeni ${type} adımı`);
    await page.keyboard.press("Escape");
    await expect(panel(page)).not.toBeVisible();
    await details.click();
    await expect(field).toHaveValue(`Yeni ${type} adımı`);
    await save.click();
    await expect(save).toBeDisabled();
    const changed = (await readRecords(page)).find((r) => r.type === type);
    const original = records.find((r) => r.type === type);
    expect({
      ...changed,
      status: original.status,
      nextAction: original.nextAction,
      updatedAt: original.updatedAt,
    }).toEqual(original);
    expect(changed.nextAction).toBe(`Yeni ${type} adımı`);
    expect((await readRecords(page)).length).toBe(records.length);
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    await expect(field).toHaveValue(`Özgün ${type} adımı`);
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    expect(await readRecords(page)).toEqual(records);
    await expect(panel(page)).toBeVisible();
  }
});

test("weekly parent choices start with active goals, optionally show completed goals and keep an existing closed link", async ({
  page,
}) => {
  const goals = ["planned", "completed", "cancelled", "transferred"].map(
    (status) =>
      createRecord({
        id: `parent-${status}`,
        type: "weekly",
        title: `Haftalık ${status}`,
        status,
        periodKey: "2026-W45",
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
  );
  const linked = createRecord({
    id: "existing-closed-link",
    title: "Tamamlanmış hedefe bağlı günlük iş",
    parentId: "parent-completed",
    sourceFields: { "Özgün bağlantı": "Korunmalı" },
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  const records = [...goals, linked];
  await seed(page, records);
  await openList(page, "daily");
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  const form = page.locator("#record-form");
  const parent = form.locator('[name="parentId"]');
  const choices = () =>
    parent
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
  expect(await choices()).toEqual(["", "parent-planned"]);
  await form
    .locator('[data-action="creation-toggle-completed-parents"]')
    .click();
  expect(await choices()).toEqual(["", "parent-planned", "parent-completed"]);
  await parent.selectOption("parent-completed");
  await form
    .locator('[data-action="creation-toggle-completed-parents"]')
    .click();
  await expect(parent).toHaveValue("parent-completed");
  expect(await choices()).toContain("parent-completed");
  expect(await choices()).not.toContain("parent-cancelled");
  expect(await choices()).not.toContain("parent-transferred");
  await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  await page.getByRole("button", { name: linked.title, exact: true }).click();
  await expect(parent).toHaveValue("parent-completed");
  expect(await choices()).toEqual(["", "parent-planned", "parent-completed"]);
  await openCreationExtras(page);
  await form
    .locator('[name="description"]')
    .fill("Bağlantıyı koruyan düzenleme");
  await form
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect(
    (await readRecords(page)).find((record) => record.id === linked.id)
      .parentId,
  ).toBe("parent-completed");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
});

test("a status popover remains usable after a goal next-step reset rerenders its panel", async ({
  page,
}) => {
  const records = await seed(page);
  await openList(page, "weekly");
  await row(page, "weekly").locator(".goal-details-trigger").click();
  const child = panel(page).locator('.goal-child-row[data-id="arrange-daily"]');
  await child.locator(".status-trigger").click();
  await expect(page.locator("#status-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#status-menu")).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  const field = panel(page).locator('#goal-next-step-form [name="nextAction"]');
  await field.fill("Kaydedilmeyecek taslak");
  await panel(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(field).toHaveValue("Özgün weekly adımı");
  await child.locator(".status-trigger").click();
  await expect(page.locator("#status-menu")).toBeVisible();
  await page.locator('#status-menu [data-status="waiting"]').click();
  await expect(child.locator(".status-trigger")).toHaveText("Beklemede");
  const details = page.locator("#waiting-details-dialog");
  await expect(details).toBeVisible();
  const committed = await readSaved(page);
  await details
    .locator('[name="waitingReason"]')
    .fill("Kaydedilmeyecek bekleme nedeni");
  await details
    .locator('[name="nextAction"]')
    .fill("Kaydedilmeyecek sonraki adım");
  await details.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(details).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(field).toHaveValue("Özgün weekly adımı");
  await expect(child.locator(".status-trigger")).toHaveText("Beklemede");
  expect(await readSaved(page)).toBe(committed);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(child.locator(".status-trigger")).toHaveText("Devam ediyor");
  expect(await readRecords(page)).toEqual(records);
});
