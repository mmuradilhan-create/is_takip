import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { readAttentionCards } from "./attention-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = NOW.toISOString();
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const calendar = (page) => page.locator("#dashboard-calendar-dialog");
const headerCalendar = (page) =>
  page.getByRole("button", { name: "Takvimi aç", exact: true });
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

function fixture() {
  const long =
    "uzun açıklamalı kayıt başlığı ve tasarım dosyalarının gözden geçirilmesi";
  return [
    ...Array.from({ length: 18 }, (_, index) =>
      record({
        id: `viewport-daily-${index}`,
        title: `Günlük iş ${String(index + 1).padStart(2, "0")} ${long}`,
        dueDate: "2026-11-07",
        priority: index === 0 ? "high" : "normal",
        status: index === 1 ? "waiting" : "planned",
        updatedAt: index === 2 ? "2026-10-30T09:00:00.000Z" : STAMP,
      }),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      record({
        id: `viewport-goal-${index}`,
        type: "weekly",
        title: `Yaklaşan haftanın ${String(index + 1).padStart(2, "0")} hedefi ${long}`,
        periodKey: "2026-W46",
        dueDate: "2026-11-12",
        targetValue: 10,
        currentValue: index,
        metric: "Rapor",
        nextAction:
          "Dosyaları incele ve sonraki somut tasarım adımını belirle.",
      }),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      record({
        id: `viewport-attention-${index}`,
        type: "waiting",
        title: `Takip kartı ${index + 1} ${long}`,
        nextFollowUpDate: "2026-11-08",
        sourceDate: "2026-11-01",
        expectedFrom: "Tedarik ekibi",
      }),
    ),
    record({
      id: "viewport-monthly",
      type: "monthly",
      title: `Aylık hedef ${long}`,
      periodKey: "2026-11",
    }),
    record({
      id: "viewport-yearly",
      type: "yearly",
      title: `Senelik hedef ${long}`,
      periodKey: "2026",
    }),
  ];
}

async function seed(page, { width, height, theme = "light" }) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  const original = JSON.stringify({
    version: 1,
    records: fixture(),
    odak: {
      version: 1,
      preferences: { density: "compact", theme },
      history: [],
    },
  });
  await page.addInitScript(
    ({ key, original }) => {
      if (sessionStorage.getItem("viewport-test-seeded")) return;
      localStorage.setItem(key, original);
      sessionStorage.setItem("viewport-test-seeded", "true");
    },
    { key: KEY, original },
  );
  await page.goto("/");
  await expect(page.locator(".dashboard-main-column")).toBeVisible();
  expect(await saved(page)).toBe(original);
  return original;
}

async function fitsViewport(page) {
  const metrics = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    width: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    scrollTop: scrollY,
  }));
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollTop).toBe(0);
}

for (const viewport of [
  { width: 1920, height: 1080, theme: "dark" },
  { width: 1536, height: 864, theme: "light" },
  { width: 1280, height: 720, theme: "dark" },
]) {
  test(`dashboard panels stay in ${viewport.width} by ${viewport.height} and expose all work through their own scroll areas`, async ({
    page,
  }, testInfo) => {
    const original = await seed(page, viewport);
    await fitsViewport(page);
    const content = await page.locator("#content").boundingBox();
    const focus = await page.locator(".focus-panel").boundingBox();
    const attention = await page.locator(".attention-panel").boundingBox();
    const compactCalendar = await page
      .locator(".dashboard-calendar")
      .boundingBox();
    const weekly = await page.locator(".weekly-dashboard-panel").boundingBox();
    const left = await page.locator(".dashboard-main-column").boundingBox();
    const right = await page.locator(".dashboard-followups").boundingBox();
    expect(attention.x).toBeCloseTo(focus.x, 0);
    expect(attention.width).toBeCloseTo(weekly.width, 0);
    expect(attention.y).toBeCloseTo(weekly.y, 0);
    expect(attention.height).toBeCloseTo(weekly.height, 0);
    expect(focus.y).toBeCloseTo(compactCalendar.y, 0);
    expect(focus.height).toBeCloseTo(compactCalendar.height, 0);
    expect(attention.y).toBeGreaterThanOrEqual(focus.y + focus.height - 1);
    expect(right.x).toBeGreaterThanOrEqual(focus.x + focus.width);
    expect(weekly.x).toBeGreaterThanOrEqual(attention.x + attention.width);
    for (const box of [left, right, attention, weekly]) {
      expect(box.y).toBeGreaterThanOrEqual(content.y);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    const goals = page.locator(".dashboard-goals");
    await expect(goals.locator(".dashboard-goal-row")).toHaveCount(5);
    for (const index of [1, 4]) {
      const title = goals.locator(
        `[data-goal-id="viewport-goal-${index}"] .dashboard-goal-title`,
      );
      await title.scrollIntoViewIfNeeded();
      await expect(title).toBeInViewport({ ratio: 1 });
      await title.click();
      await expect(page.locator("#goal-detail-panel")).toBeVisible();
      await expect(
        page.locator("#goal-detail-panel .goal-panel-title"),
      ).toContainText(
        `Yaklaşan haftanın ${String(index + 1).padStart(2, "0")} hedefi`,
      );
      await page.keyboard.press("Escape");
      expect(await saved(page)).toBe(original);
      await fitsViewport(page);
    }
    expect(await goals.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator(".focus-more")).toHaveCount(0);
    await expect(page.locator(".focus-list > .focus-row")).toHaveCount(18);
    const focusScroll = await page.locator(".focus-list").evaluate((list) => ({
      client: list.clientHeight,
      total: list.scrollHeight,
    }));
    expect(focusScroll.total).toBeGreaterThan(focusScroll.client);
    const lastTask = page.locator(
      '.focus-row[data-id="viewport-daily-17"] .focus-title',
    );
    await lastTask.scrollIntoViewIfNeeded();
    await lastTask.click();
    await expect(page.locator('#record-form [name="title"]')).toHaveValue(
      fixture().find((item) => item.id === "viewport-daily-17").title,
    );
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    const attentionList = page.locator(".attention-list");
    const listSize = await attentionList.evaluate((list) => ({
      client: list.clientWidth,
      total: list.scrollWidth,
    }));
    expect(listSize.total).toBeLessThanOrEqual(listSize.client + 1);
    await expect(page.locator(".attention-list > [data-id]")).toHaveCount(2);
    expect((await readAttentionCards(page)).map((card) => card.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => `viewport-attention-${index}`),
    );
    await fitsViewport(page);
    expect(await saved(page)).toBe(original);
    await page.screenshot({
      path: testInfo.outputPath(
        `dashboard-viewport-${viewport.width}-${viewport.theme}.png`,
      ),
    });
    await page.locator('#nav [data-view="daily"]').click();
    await expect(
      page.locator(".main.is-dashboard, #content.dashboard-content"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    ).toBe(true);
    expect(await saved(page)).toBe(original);
  });
}

test("the header calendar works from dashboards and lists without navigation, restores keyboard focus, and keeps the 1024px fallback reachable", async ({
  page,
}) => {
  const original = await seed(page, { width: 1536, height: 864 });
  await headerCalendar(page).focus();
  await page.keyboard.press("Enter");
  await expect(calendar(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(headerCalendar(page)).toBeFocused();
  await headerCalendar(page).click();
  await calendar(page)
    .locator('.calendar-cell-date[data-calendar-date="2026-11-10"]')
    .click();
  await calendar(page)
    .getByRole("combobox", { name: "Eklenecek kayıt türü" })
    .selectOption("waiting");
  await calendar(page).locator('[data-calendar-action="new-record"]').click();
  await expect(calendar(page)).not.toBeVisible();
  await expect(
    page.locator('#record-form [name="nextFollowUpDate"]'),
  ).toHaveValue("10.11.2026");
  await expect(page.locator('#record-form [name="sourceDate"]')).toHaveValue(
    "07.11.2026",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  await page.locator('#nav [data-view="daily"]').click();
  await page.getByRole("searchbox").fill("Günlük iş");
  await page.locator("#priority-filter").selectOption("high");
  await page.locator("#list-sort").selectOption("due-desc");
  await headerCalendar(page).click();
  await expect(
    calendar(page).locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-11-10");
  await page.keyboard.press("Escape");
  await expect(headerCalendar(page)).toBeFocused();
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  await expect(page.getByRole("searchbox")).toHaveValue("Günlük iş");
  await expect(page.locator("#priority-filter")).toHaveValue("high");
  await expect(page.locator("#list-sort")).toHaveValue("due-desc");
  await headerCalendar(page).click();
  await calendar(page)
    .locator('.calendar-cell-date[data-calendar-date="2026-11-11"]')
    .click();
  await calendar(page)
    .getByRole("combobox", { name: "Eklenecek kayıt türü" })
    .selectOption("daily");
  await calendar(page).locator('[data-calendar-action="new-record"]').click();
  await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
    "11.11.2026",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await saved(page)).toBe(original);
  await page.getByRole("searchbox").fill("");
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ]) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await expect(
      page.locator(".main.is-dashboard, #content.dashboard-content"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#nav [data-view="dashboard"]').click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const lastGoal = page.locator(
    '.dashboard-goal-row[data-goal-id="viewport-goal-4"] .dashboard-goal-title',
  );
  await lastGoal.scrollIntoViewIfNeeded();
  await lastGoal.click();
  await expect(
    page.locator("#goal-detail-panel .goal-panel-title"),
  ).toContainText("Yaklaşan haftanın 05 hedefi");
  await page.keyboard.press("Escape");
  await headerCalendar(page).click();
  await expect(calendar(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(headerCalendar(page)).toBeFocused();
  expect(await saved(page)).toBe(original);
});
