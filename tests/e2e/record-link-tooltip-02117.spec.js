import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

test("connection bubbles reveal full escaped names quickly on hover and focus, preserve ARIA descriptions and dismiss without changing records", async ({
  page,
}) => {
  const attack = '<img src=x onerror="window.connectionBubbleInjected=1">';
  const parentTitle = `Tam adı korunacak haftalık hedef ${attack} ${"teknik kapsam ".repeat(12)}`;
  const sourceTitle = `Gerçek toplantı kaynağı ${attack} ${"karar ayrıntısı ".repeat(12)}`;
  const records = [
    make({
      id: "bubble-parent",
      type: "weekly",
      title: parentTitle,
      periodKey: "2026-W45",
    }),
    make({
      id: "bubble-source",
      type: "meeting",
      title: sourceTitle,
      decision: "Kaynak karar korunur.",
    }),
    make({
      id: "bubble-child",
      title: "Bağlantıları olan kısa günlük iş",
      parentId: "bubble-parent",
      workContext: "",
      sourceFields: {
        __followupSource: { recordId: "bubble-source", type: "meeting" },
      },
    }),
    ...Array.from({ length: 24 }, (_, index) =>
      make({ id: `bubble-extra-${index}`, title: `Diğer günlük iş ${index}` }),
    ),
  ];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
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
    },
    { key: KEY, records },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  const before = await saved(page);
  const row = page.locator('tr[data-id="bubble-child"]');
  const parent = row.locator(".record-parent-link");
  const source = row.locator(".record-source-link");
  const bubble = page.locator("#record-link-tooltip");
  for (const control of [parent, source])
    await expect(control).not.toHaveAttribute("title");

  await parent.hover();
  await expect(bubble).toBeVisible({ timeout: 400 });
  await expect(bubble).toHaveAttribute("role", "tooltip");
  await expect(bubble).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(bubble).toHaveCSS("border-top-width", "1px");
  await expect(bubble).toHaveCSS("font-size", "12px");
  await expect(bubble).toHaveText(`Haftalık hedef: ${parentTitle}`);
  await expect(parent).toHaveAttribute(
    "aria-describedby",
    "record-link-tooltip",
  );
  await expect(bubble.locator("img")).toHaveCount(0);
  expect(await saved(page)).toBe(before);
  await page.mouse.move(10, 10);
  await expect(bubble).not.toBeVisible();
  await expect(parent).not.toHaveAttribute("aria-describedby");

  await source.evaluate((control) => {
    control.setAttribute("aria-describedby", "existing-connection-help");
    const help = document.createElement("span");
    help.id = "existing-connection-help";
    help.hidden = true;
    help.textContent = "Önceden var olan erişilebilir açıklama";
    control.after(help);
  });
  await source.focus();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText(`Toplantı: ${sourceTitle}`);
  await expect(source).toHaveAttribute(
    "aria-describedby",
    "existing-connection-help record-link-tooltip",
  );
  await page.keyboard.press("Escape");
  await expect(bubble).not.toBeVisible();
  await expect(source).toHaveAttribute(
    "aria-describedby",
    "existing-connection-help",
  );
  await expect(page.locator("#meeting-record-panel")).not.toBeVisible();
  await expect(source).toBeFocused();
  expect(await saved(page)).toBe(before);

  await parent.focus();
  await expect(bubble).toHaveText(`Haftalık hedef: ${parentTitle}`);
  await page.keyboard.press("Enter");
  await expect(bubble).not.toBeVisible();
  await expect(page.locator("#goal-detail-panel")).toHaveAttribute(
    "data-goal-id",
    "bubble-parent",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#goal-detail-panel")).not.toBeVisible();
  expect(await saved(page)).toBe(before);

  await page.setViewportSize({ width: 640, height: 600 });
  await page.locator("#page-title").click();
  await source.hover();
  await expect(bubble).toBeVisible({ timeout: 400 });
  const bounds = await bubble.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(633);
  expect(bounds.y).toBeGreaterThanOrEqual(7);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(593);
  expect(
    await page.evaluate(() => window.connectionBubbleInjected),
  ).toBeUndefined();
  await page.evaluate(() => window.scrollTo(0, 180));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect(bubble).not.toBeVisible();
  await expect(source).toHaveAttribute(
    "aria-describedby",
    "existing-connection-help",
  );
  expect(await saved(page)).toBe(before);
});
