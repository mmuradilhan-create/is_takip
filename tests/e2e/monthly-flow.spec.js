import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { completeGoalTransfer } from "./goal-transfer-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-10-10T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const monthlyGoal = (id, input = {}) =>
  make({ id, type: "monthly", title: `Aylık hedef ${id}`, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const backlog = (page) => page.locator(".monthly-backlog");
const backlogIds = (page) =>
  backlog(page)
    .locator("[data-monthly-backlog-id]")
    .evaluateAll((items) => items.map((item) => item.dataset.monthlyBacklogId));
const carry = (page, id) =>
  backlog(page).locator(`[data-action="carry-monthly"][data-id="${id}"]`);
const scope = (page, value) =>
  page.locator(`[data-action="list-scope"][data-scope="${value}"]`).click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(page, records, now = NOW) {
  await page.clock.install({
    // Start a second early so pausing at now never has to rewind.
    time: new Date(new Date(now).getTime() - 1000),
  });
  await page.clock.pauseAt(now);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("monthly-flow-seeded")) return;
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
      sessionStorage.setItem("monthly-flow-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
}

async function monthly(page, current = true) {
  await page.locator('#nav [data-view="monthly"]').click();
  if (current) await page.locator('[data-action="period-current"]').click();
}

async function openBacklog(page) {
  await expect(backlog(page)).toBeVisible();
  if (!(await backlog(page).evaluate((element) => element.open)))
    await backlog(page).locator("summary").click();
}

function preservedFields(record) {
  const { periodKey, updatedAt, sourceFields, ...rest } = record;
  return rest;
}

function linkedFixture() {
  return [
    make({
      id: "year-parent",
      type: "yearly",
      title: "Senelik üst hedef",
      periodKey: "2026",
    }),
    monthlyGoal("month-current", {
      title: "Bu ayın hedefi",
      periodKey: "2026-11",
      dueDate: "2026-11-07",
    }),
    monthlyGoal("month-old", {
      title: "İPEK aylık incelemesini tamamla",
      periodKey: "2026-10",
      dueDate: "2026-10-31",
      status: "in_progress",
      priority: "high",
      targetValue: 10,
      currentValue: 4,
      metric: "İnceleme",
      goalParentId: "year-parent",
      description: "Gerçek aylık not korunmalı.",
      nextAction: "Kalan altı maddeyi incele.",
      carryForward: true,
      sourceFields: {
        "Özgün dönem": "2026-10",
        "Korunacak alan": { value: "Kaynak" },
      },
    }),
    monthlyGoal("month-other", {
      title: "Diğer eski hedef",
      periodKey: "2026-09",
      priority: "low",
      dueDate: "2026-09-30",
    }),
    monthlyGoal("month-future", {
      periodKey: "2026-12",
      dueDate: "2026-10-31",
    }),
    monthlyGoal("month-unknown"),
    ...["completed", "cancelled", "transferred"].map((status) =>
      monthlyGoal(`month-${status}`, { periodKey: "2026-10", status }),
    ),
    make({
      id: "bound-week",
      type: "weekly",
      title: "Aylık hedefe bağlı haftalık iş",
      periodKey: "2026-W44",
      goalParentId: "month-old",
      targetValue: 5,
      currentValue: 2,
      metric: "Rapor",
      dueDate: "2026-11-01",
    }),
    make({
      id: "bound-day",
      title: "Haftalık hedefin günlük işi",
      parentId: "bound-week",
      dueDate: "2026-10-30",
      nextAction: "Kontrolü bitir.",
    }),
  ];
}

test("a selected month surfaces older open goals through the existing filters and moving preserves progress, hierarchy and exact undo after reload", async ({
  page,
}) => {
  const original = linkedFixture();
  await seed(page, original);
  const before = await saved(page);
  await monthly(page);
  await expect(page.locator("#planning-period-label")).toHaveText("Kasım 2026");
  await expect(row(page, "month-current")).toBeVisible();
  await expect(row(page, "month-old")).toHaveCount(0);
  expect(await backlog(page).evaluate((element) => element.open)).toBe(false);
  await openBacklog(page);
  expect(await backlogIds(page)).toEqual(["month-old", "month-other"]);

  await page.locator("#status-filter").selectOption("in_progress");
  expect(await backlogIds(page)).toEqual(["month-old"]);
  await page.locator("#status-filter").selectOption("all");
  await page.locator("#priority-filter").selectOption("low");
  expect(await backlogIds(page)).toEqual(["month-other"]);
  await page.locator("#priority-filter").selectOption("high");
  await page.locator("#global-search").fill("ipek");
  expect(await backlogIds(page)).toEqual(["month-old"]);
  await page.locator("#period-filter").selectOption("today");
  await expect(backlog(page)).toHaveCount(0);
  await page.locator("#period-filter").selectOption("overdue");
  await openBacklog(page);
  expect(await backlogIds(page)).toEqual(["month-old"]);
  await scope(page, "completed");
  await expect(backlog(page)).toHaveCount(0);
  await scope(page, "open");
  await page.locator("#global-search").fill("");
  await page.locator("#priority-filter").selectOption("all");
  await page.locator("#period-filter").selectOption("all");
  await openBacklog(page);
  expect(await saved(page)).toBe(before);

  await expect(carry(page, "month-old")).toHaveAttribute(
    "data-month",
    "2026-11",
  );
  await carry(page, "month-old").click();
  await completeGoalTransfer(page);
  await expect(row(page, "month-old")).toBeVisible();
  await expect(
    row(page, "month-old").locator('[role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "40");
  const after = await store(page);
  const old = original.find((record) => record.id === "month-old");
  const moved = after.records.find((record) => record.id === old.id);
  expect(after.records).toHaveLength(original.length);
  expect(after.records.filter((record) => record.id === old.id)).toHaveLength(
    1,
  );
  expect(moved.periodKey).toBe("2026-11");
  expect(preservedFields(moved)).toEqual(preservedFields(old));
  expect(moved.sourceFields).toMatchObject(old.sourceFields);
  expect(moved.sourceFields.__monthlyMoves).toHaveLength(1);
  expect(moved.sourceFields.__monthlyMoves[0]).toEqual({
    from: "2026-10",
    to: "2026-11",
    movedAt: NOW.toISOString(),
    previousPeriodKey: "2026-10",
  });
  expect(after.records.filter((record) => record.id !== old.id)).toEqual(
    original.filter((record) => record.id !== old.id),
  );
  expect(after.odak.history).toHaveLength(1);
  const movedSaved = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(movedSaved);
  await monthly(page);
  await page.locator("#period-filter").selectOption("week");
  await expect(row(page, "month-old")).toHaveCount(0);
  await expect(row(page, "month-current")).toBeVisible();
  expect(await saved(page)).toBe(movedSaved);
  await undo(page);
  expect(await saved(page)).toBe(before);
  expect((await store(page)).records).toEqual(original);
});

test("all-month rows move only eligible older goals across New Year while a selected month remains the explicit destination", async ({
  page,
}) => {
  const original = [
    monthlyGoal("december", {
      periodKey: "2026-12",
      dueDate: "2026-12-31",
      status: "waiting",
    }),
    monthlyGoal("november", { periodKey: "2026-11", dueDate: "2026-11-30" }),
    monthlyGoal("january", { periodKey: "2027-01" }),
    monthlyGoal("future", { periodKey: "2027-02", dueDate: "2026-12-01" }),
    monthlyGoal("unknown"),
    ...["completed", "cancelled", "transferred"].map((status) =>
      monthlyGoal(status, { periodKey: "2026-12", status }),
    ),
  ];
  await seed(page, original, new Date("2027-01-07T12:00:00.000Z"));
  const before = await saved(page);
  await monthly(page, false);
  await scope(page, "all");
  await expect(page.locator("#planning-period-label")).toHaveText("Tüm aylar");
  const rowCarries = page.locator(
    '.full-table .row-end-actions [data-action="carry-monthly"]',
  );
  expect(
    (
      await rowCarries.evaluateAll((items) =>
        items.map((item) => item.dataset.id),
      )
    ).sort(),
  ).toEqual(["december", "november"]);
  await expect(
    row(page, "december").locator('[data-action="carry-monthly"]'),
  ).toHaveAttribute("data-month", "2027-01");
  await row(page, "december").locator('[data-action="carry-monthly"]').click();
  await completeGoalTransfer(page);
  let changed = (await store(page)).records;
  expect(changed.find((record) => record.id === "december").periodKey).toBe(
    "2027-01",
  );
  expect(changed.find((record) => record.id === "december").dueDate).toBe(
    "2026-12-31",
  );
  await undo(page);
  expect(await saved(page)).toBe(before);

  await scope(page, "open");
  await page.locator('[data-action="period-current"]').click();
  await page.locator('[data-action="period-prev"]').click();
  await expect(page.locator("#planning-period-label")).toHaveText(
    "Aralık 2026",
  );
  await openBacklog(page);
  expect(await backlogIds(page)).toEqual(["november"]);
  await expect(carry(page, "november")).toHaveAttribute(
    "data-month",
    "2026-12",
  );
  await carry(page, "november").click();
  await completeGoalTransfer(page);
  await expect(row(page, "november")).toBeVisible();
  changed = (await store(page)).records;
  expect(changed.find((record) => record.id === "november").periodKey).toBe(
    "2026-12",
  );
  expect(changed.filter((record) => record.id !== "november")).toEqual(
    original.filter((record) => record.id !== "november"),
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("remaining-goal prompts search weekly and monthly plans together and carry a monthly goal directly without a weekly copy", async ({
  page,
}) => {
  const original = [
    monthlyGoal("prompt-month", {
      title: "İPEK aylık incelemesi",
      periodKey: "2026-10",
      dueDate: "2026-10-31",
      targetValue: 10,
      currentValue: 4,
    }),
    monthlyGoal("prompt-other-month", {
      title: "Diğer aylık hedef",
      periodKey: "2026-09",
    }),
    monthlyGoal("prompt-current-month", {
      title: "İPEK mevcut aylık hedef",
      periodKey: "2026-11",
    }),
    monthlyGoal("prompt-future-month", {
      title: "İPEK gelecek aylık hedef",
      periodKey: "2026-12",
      dueDate: "2026-10-31",
    }),
    make({
      id: "prompt-week",
      type: "weekly",
      title: "İPEK haftalık incelemesi",
      periodKey: "2026-W44",
      targetValue: 5,
      currentValue: 2,
    }),
    make({
      id: "prompt-year",
      type: "yearly",
      title: "İPEK eski yıllık hedef",
      periodKey: "2025",
    }),
  ];
  await seed(page, original);
  const before = await saved(page);
  const prompt = page.locator('.planning-prompt[data-prompt="previous"]');
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("3");
  await page.locator("#global-search").fill("ipek");
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("2");
  await prompt.click();
  const dialog = page.locator("#planning-prompts-dialog");
  const month = dialog.locator('[data-prompt-record="prompt-month"]');
  const week = dialog.locator('[data-prompt-record="prompt-week"]');
  await expect(dialog.locator("[data-prompt-record]")).toHaveCount(2);
  await expect(month).toContainText("Aylık hedef");
  await expect(month).toContainText("2026-10");
  await expect(month.locator('[data-action="carry-weekly"]')).toHaveCount(0);
  await expect(month.locator('[data-action="carry-monthly"]')).toHaveAttribute(
    "data-month",
    "2026-11",
  );
  await expect(week.locator('[data-action="carry-monthly"]')).toHaveCount(0);
  await expect(week.locator('[data-action="carry-weekly"]')).toHaveAttribute(
    "data-week",
    "2026-W45",
  );
  await month.locator('[data-action="planning-prompt-record"]').click();
  await expect(page.locator("#goal-detail-panel .goal-panel-title")).toHaveText(
    "İPEK aylık incelemesi",
  );
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  await prompt.click();
  await month.locator('[data-action="carry-monthly"]').click();
  await completeGoalTransfer(page);
  const after = await store(page);
  expect(after.records).toHaveLength(original.length);
  expect(
    after.records.find((record) => record.id === "prompt-month").periodKey,
  ).toBe("2026-11");
  expect(after.records.filter((record) => record.type === "weekly")).toEqual(
    original.filter((record) => record.type === "weekly"),
  );
  expect(
    after.records.filter((record) => record.id !== "prompt-month"),
  ).toEqual(original.filter((record) => record.id !== "prompt-month"));
  expect(after.odak.history).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("1");
  await undo(page);
  expect(await saved(page)).toBe(before);
});
