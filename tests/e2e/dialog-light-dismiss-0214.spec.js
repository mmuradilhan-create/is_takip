import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const editor = (page) => page.locator("#editor");
const panel = (page) => page.locator("#goal-detail-panel");

async function seed(page) {
  const make = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  const records = [
    make({
      id: "dismiss-week",
      type: "weekly",
      title: "Taslağı korunacak ölçümlü hedef",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    make({
      id: "dismiss-day",
      title: "Takvimden açılan gerçek günlük iş",
      parentId: "dismiss-week",
      status: "in_progress",
      dueDate: "2026-11-12",
      description: "Gerçek kişisel not.",
      sourceFields: { original: { value: "Ham kayıt korunmalı" } },
    }),
    make({
      id: "dismiss-waiting",
      type: "waiting",
      title: "Gerçek beklenen yanıt",
      expectedFrom: "Dış ekip",
      latestUpdate: "Yanıt istendi.",
      nextFollowUpDate: "2026-11-13",
    }),
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("dialog-light-dismiss-0214-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("dialog-light-dismiss-0214-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return saved(page);
}

async function backdropPoint(page, dialog) {
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  const x = bounds.x >= 24 ? bounds.x - 16 : bounds.x + bounds.width + 16;
  const y = Math.min(viewport.height - 10, bounds.y + 70);
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(viewport.width);
  return { x, y };
}

async function clickPoint(page, point) {
  await page.mouse.click(point.x, point.y);
}

async function clickStaticHeading(page) {
  const heading = await page.locator("#page-title").boundingBox();
  await page.mouse.click(heading.x + 4, heading.y + 4);
}

test("native editor padding, input and an inside-to-backdrop drag keep drafts open while a fresh backdrop click cancels without writing", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  await row(page, "dismiss-day").locator(".task-name").click();
  await expect(editor(page)).toBeVisible();
  const title = editor(page).locator('[name="title"]');
  await title.fill("Kaydedilmeyen mevcut kayıt taslağı");
  const header = await editor(page).locator(".modal-header").boundingBox();
  await page.mouse.click(header.x + 5, header.y + 5);
  await expect(editor(page)).toBeVisible();
  await title.click();
  await expect(title).toBeFocused();
  const outside = await backdropPoint(page, editor(page));
  const input = await title.boundingBox();
  await page.mouse.move(input.x + 25, input.y + input.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 8 });
  await page.mouse.up();
  await expect(editor(page)).toBeVisible();
  await expect(title).toHaveValue("Kaydedilmeyen mevcut kayıt taslağı");
  expect(await saved(page)).toBe(before);
  await clickPoint(page, outside);
  await expect(editor(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  expect(await saved(page)).toBe(before);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await editor(page).locator('[name="title"]').fill("Kaydedilmeyen yeni kayıt");
  await clickPoint(page, await backdropPoint(page, editor(page)));
  await expect(editor(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("a nonmodal goal dismisses outside without activating navigation and retains its unsaved measurement while a status popover dismisses first", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
  const current = panel(page).locator("#goal-progress-current");
  await current.fill("7");
  await page.locator('#nav [data-view="daily"]').click();
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  expect(await saved(page)).toBe(before);
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(current).toHaveValue("7");
  await panel(page)
    .locator('.goal-child-row[data-id="dismiss-day"] .status-trigger')
    .click();
  const status = page.locator("#status-menu");
  await expect(status).toBeVisible();
  await clickStaticHeading(page);
  await expect(status).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(current).toHaveValue("7");
  expect(await saved(page)).toBe(before);
  await clickStaticHeading(page);
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(current).toHaveValue("7");
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  expect(await saved(page)).toBe(before);
});

test("a date popover closes before its editor and backdrop cancellation returns only to the still-open selected calendar", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('[data-action="open-calendar"]').click();
  const calendar = page.locator("#dashboard-calendar-dialog");
  await expect(calendar).toBeVisible();
  await calendar
    .locator('.calendar-cell-date[data-calendar-date="2026-11-12"]')
    .click();
  await calendar
    .locator('.calendar-day-agenda [data-calendar-record-id="dismiss-day"]')
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('[name="id"]')).toHaveValue("dismiss-day");
  await expect(calendar).toBeVisible();
  await editor(page)
    .locator('[name="title"]')
    .fill("Takvimden açılan kaydedilmemiş taslak");
  await editor(page)
    .locator('[name="dueDate"]')
    .locator("..")
    .locator(".date-picker-toggle")
    .click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  const outside = await backdropPoint(page, editor(page));
  await clickPoint(page, outside);
  await expect(picker).not.toBeVisible();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('[name="title"]')).toHaveValue(
    "Takvimden açılan kaydedilmemiş taslak",
  );
  await expect(calendar).toBeVisible();
  expect(await saved(page)).toBe(before);
  await clickPoint(page, outside);
  await expect(editor(page)).not.toBeVisible();
  await expect(calendar).toBeVisible();
  await expect(
    calendar.locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-11-12");
  await expect(
    calendar.locator('.calendar-cell-date[data-calendar-date="2026-11-12"]'),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await saved(page)).toBe(before);
  await clickPoint(page, await backdropPoint(page, calendar));
  await expect(calendar).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});
