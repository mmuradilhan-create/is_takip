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

test("same-named daily, weekly and monthly records keep their full actual parent names in connection bubbles", async ({
  page,
}) => {
  const title = "Ortak üretim ve doğrulama kapsamı";
  const records = [
    make({
      id: "same-name-year",
      type: "yearly",
      title,
      periodKey: "2026",
    }),
    make({
      id: "same-name-month",
      type: "monthly",
      title,
      periodKey: "2026-11",
      goalParentId: "same-name-year",
    }),
    make({
      id: "same-name-week",
      type: "weekly",
      title,
      periodKey: "2026-W45",
      goalParentId: "same-name-month",
    }),
    make({
      id: "same-name-day",
      title,
      parentId: "same-name-week",
      workContext: "",
    }),
  ];
  const initialRaw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact" },
      history: [],
    },
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, initialRaw }) => {
      if (sessionStorage.getItem("same-name-connections-seeded")) return;
      localStorage.setItem(key, initialRaw);
      sessionStorage.setItem("same-name-connections-seeded", "1");
    },
    { key: KEY, initialRaw },
  );
  await page.goto("/");
  expect(await saved(page)).toBe(initialRaw);
  const bubble = page.locator("#record-link-tooltip");
  const panel = page.locator("#goal-detail-panel");
  for (const [view, childId, parentId, role] of [
    ["daily", "same-name-day", "same-name-week", "Haftalık hedef"],
    ["weekly", "same-name-week", "same-name-month", "Aylık hedef"],
    ["monthly", "same-name-month", "same-name-year", "Senelik hedef"],
  ]) {
    await page.locator(`#nav [data-view="${view}"]`).click();
    if (view !== "daily")
      await page.locator('[data-action="period-all"]').click();
    const row = page.locator(
      `.full-table [data-record-row][data-id="${childId}"]`,
    );
    const parent = row.locator(".record-parent-link");
    const caption = `${role}: ${title}`;
    await expect(parent).toHaveAttribute("data-id", parentId);
    await expect(parent).toHaveAttribute("data-action", "goal-details");
    await expect(parent).toHaveAttribute("data-record-link-tooltip", caption);
    await expect(parent).toHaveAttribute(
      "aria-label",
      `${caption}: üst hedefi aç`,
    );
    await expect(parent).not.toHaveAttribute("title");
    await expect(parent).toHaveText("");
    await expect(parent.locator("svg")).toHaveCount(1);
    await parent.hover();
    await expect(bubble).toBeVisible({ timeout: 400 });
    await expect(bubble).toHaveText(caption);
    await parent.focus();
    await page.keyboard.press("Enter");
    await expect(bubble).not.toBeVisible();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-goal-id", parentId);
    await expect(panel.locator(".goal-panel-title")).toHaveText(title);
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(await saved(page)).toBe(initialRaw);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await page.mouse.move(10, 10);
    expect(await saved(page)).toBe(initialRaw);
  }
  await page.reload();
  expect(await saved(page)).toBe(initialRaw);
});
