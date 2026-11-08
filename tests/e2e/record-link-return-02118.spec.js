import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

async function seed(page) {
  const records = [
    make({
      id: "return-month",
      type: "monthly",
      title: "Aylık doğrulama kapsamı",
      periodKey: "2026-11",
    }),
    make({
      id: "return-week",
      type: "weekly",
      title: "Haftalık doğrulama kapsamını tamamla",
      periodKey: "2026-W45",
      goalParentId: "return-month",
      targetValue: 10,
      currentValue: 3,
    }),
    make({
      id: "return-meeting",
      type: "meeting",
      title: "Kaynak toplantı kararı",
      decision: "Doğrulama kararı korunmalı.",
    }),
    make({
      id: "return-waiting",
      type: "waiting",
      title: "Beklenen teknik yanıt",
      status: "waiting_response",
      expectedFrom: "Teknik ekip",
      nextFollowUpDate: "2026-11-11",
    }),
    make({
      id: "return-daily-meeting",
      title: "Toplantı kararının günlük işi",
      parentId: "return-week",
      workContext: "",
      sourceFields: {
        __followupSource: { recordId: "return-meeting", type: "meeting" },
      },
    }),
    make({
      id: "return-daily-waiting",
      title: "Teknik yanıtı değerlendirme işi",
      parentId: "return-week",
      workContext: "",
      sourceFields: {
        __followupSource: { recordId: "return-waiting", type: "waiting" },
      },
    }),
  ];
  const original = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact" },
      history: [],
    },
  });
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, original }) => {
      localStorage.setItem(key, original);
    },
    { key: KEY, original },
  );
  await page.goto("/");
  expect(await saved(page)).toBe(original);
  return original;
}

test("closing goal and source previews keeps restored connection focus without reopening its bubble until a new hover or keyboard navigation", async ({
  page,
}) => {
  const original = await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  const bubble = page.locator("#record-link-tooltip");
  const cases = [
    {
      row: "return-daily-meeting",
      control: '.record-parent-link[data-id="return-week"]',
      panel: "#goal-detail-panel",
      idAttribute: "data-goal-id",
      id: "return-week",
      caption: "Haftalık hedef: Haftalık doğrulama kapsamını tamamla",
    },
    {
      row: "return-daily-meeting",
      control: '.record-source-link[data-id="return-meeting"]',
      panel: "#meeting-record-panel",
      idAttribute: "data-record-id",
      id: "return-meeting",
      caption: "Toplantı: Kaynak toplantı kararı",
    },
    {
      row: "return-daily-waiting",
      control: '.record-source-link[data-id="return-waiting"]',
      panel: "#waiting-record-panel",
      idAttribute: "data-record-id",
      id: "return-waiting",
      caption: "Bekleyen konu: Beklenen teknik yanıt",
    },
  ];
  for (const item of cases) {
    const control = page
      .locator(`.full-table [data-record-row][data-id="${item.row}"]`)
      .locator(item.control);
    const panel = page.locator(item.panel);
    for (const dismissal of ["header", "escape", "outside"]) {
      await page.mouse.move(10, 10);
      await control.hover();
      await expect(bubble).toBeVisible({ timeout: 400 });
      await expect(bubble).toHaveText(item.caption);
      await control.click();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute(item.idAttribute, item.id);
      await expect(bubble).not.toBeVisible();
      if (dismissal === "header")
        await panel
          .getByRole("button", { name: "Pencereyi kapat", exact: true })
          .click();
      else if (dismissal === "escape") await page.keyboard.press("Escape");
      else await page.locator("#page-title").click();
      await expect(panel).not.toBeVisible();
      if (dismissal === "outside")
        expect(
          await panel.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(false);
      else await expect(control).toBeFocused();
      await expect(bubble).not.toBeVisible();
      await expect(control).not.toHaveAttribute(
        "aria-describedby",
        /record-link-tooltip/,
      );
      expect(await saved(page)).toBe(original);

      // A real keyboard move back to the icon must still reveal its name.
      await control.locator("xpath=preceding-sibling::*[1]").focus();
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      await expect(bubble).toBeVisible();
      await expect(bubble).toHaveText(item.caption);
      await page.keyboard.press("Escape");
      await expect(bubble).not.toBeVisible();
      await expect(control).toBeFocused();

      // Moving away and entering again is fresh hover intent after dismissal.
      await page.mouse.move(10, 10);
      await control.hover();
      await expect(bubble).toBeVisible({ timeout: 400 });
      await expect(bubble).toHaveText(item.caption);
      await page.mouse.move(10, 10);
      await page.locator("#global-search").focus();
      await expect(bubble).not.toBeVisible();
      expect(await saved(page)).toBe(original);
    }
  }
});

test("revealing a covered connection icon under a stationary pointer does not undo its activation dismissal", async ({
  page,
}) => {
  const original = await seed(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const control = page.locator(
    '.dashboard-goal-row[data-id="return-week"] .record-parent-link[data-id="return-month"]',
  );
  const bubble = page.locator("#record-link-tooltip");
  const panel = page.locator("#goal-detail-panel");
  await control.hover();
  await expect(bubble).toBeVisible({ timeout: 400 });
  await control.click();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-goal-id", "return-month");
  const iconBounds = await control.boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(iconBounds.x + iconBounds.width / 2).toBeGreaterThan(panelBounds.x);
  expect(iconBounds.y + iconBounds.height / 2).toBeGreaterThan(panelBounds.y);
  expect(iconBounds.y + iconBounds.height / 2).toBeLessThan(
    panelBounds.y + panelBounds.height,
  );
  // Escape does not move the pointer away from the icon covered by the panel.
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(control).toBeFocused();
  await expect(bubble).not.toBeVisible();
  await page.mouse.move(10, 10);
  await control.hover();
  await expect(bubble).toBeVisible({ timeout: 400 });
  await expect(bubble).toHaveText("Aylık hedef: Aylık doğrulama kapsamı");
  expect(await saved(page)).toBe(original);
});
