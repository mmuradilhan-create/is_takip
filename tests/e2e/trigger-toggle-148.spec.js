import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T08:00:00.000Z";
const records = [
  createRecord({
    id: "goal",
    type: "weekly",
    title: "Haftalık hedef",
    periodKey: "2026-W46",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "daily",
    title: "Günlük iş",
    parentId: "goal",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "wait",
    type: "waiting",
    title: "Bekleyen konu",
    status: "waiting_response",
    expectedFrom: "Tedarikçi",
    sourceDate: "2026-10-01",
    description: "Bekleme notu",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
];

async function seed(page) {
  // Wide enough that the centred note window leaves the icon uncovered.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
}
const press = async (page, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

test("pressing the icon that opened a panel or window again closes it", async ({
  page,
}) => {
  await seed(page);
  const stored = () => page.evaluate((key) => localStorage.getItem(key), KEY);
  const before = await stored();

  await page.locator('#nav [data-view="daily"]').click();
  const goalIcon = page.locator('tr[data-id="daily"] .record-parent-link');
  const goalPanel = page.locator("#goal-detail-panel");
  const look = () =>
    goalIcon.evaluate((item) => {
      const style = getComputedStyle(item);
      return [
        style.backgroundColor,
        style.color,
        getComputedStyle(item.querySelector("svg")).strokeWidth,
      ];
    });
  const plain = await look();
  await press(page, goalIcon);
  await expect(goalPanel).toBeVisible();
  await press(page, goalIcon);
  await expect(goalPanel).toBeHidden();
  // Once the pointer leaves, the icon does not stay darker.
  await page.mouse.move(5, 880);
  await expect.poll(look).toEqual(plain);
  await press(page, goalIcon);
  await expect(goalPanel).toBeVisible();
  // Enter on the focused icon closes it as well.
  await goalIcon.focus();
  await page.keyboard.press("Enter");
  await expect(goalPanel).toBeHidden();

  const bell = page.locator("#reminder-button");
  const reminders = page.locator("#reminder-panel");
  await press(page, bell);
  await expect(reminders).toBeVisible();
  await press(page, bell);
  await expect(reminders).toBeHidden();

  await page.locator('#nav [data-view="waiting"]').click();
  const noteIcon = page.locator('tr[data-id="wait"] .record-note-trigger');
  const editor = page.locator("#record-note-editor");
  await press(page, noteIcon);
  await expect(editor).toBeVisible();
  await press(page, noteIcon);
  await expect(editor).toBeHidden();

  // An edited note still asks before closing.
  await press(page, noteIcon);
  await editor.locator("textarea").fill("Değişen not");
  await press(page, noteIcon);
  const confirm = page.locator(".app-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  await expect(editor).toBeVisible();
  await expect(editor.locator("textarea")).toHaveValue("Değişen not");
  await press(page, noteIcon);
  await confirm.getByRole("button", { name: "Kaydetmeden kapat" }).click();
  await expect(editor).toBeHidden();
  expect(await stored()).toBe(before);
});
