import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const NOTE =
  '<img src=x onerror="window.compactNoteInjected=1">\nİkinci gerçek not satırı.';
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const popup = (page) => page.locator("#record-note-popover");
const body = (page) => popup(page).locator(".record-note-body");
const row = (page, id) => page.locator(`[data-record-row][data-id="${id}"]`);
const trigger = (page, id = "compact-note-daily") =>
  row(page, id).locator('[data-action="record-note"]');
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const styles = (element) =>
  element.evaluate((node) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(
      [
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",
        "borderRadius",
        "backgroundColor",
        "color",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "boxShadow",
      ].map((key) => [key, style[key]]),
    );
  });

async function view(page, type) {
  const menu = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await menu.isVisible()) &&
    (await menu.getAttribute("aria-expanded")) !== "true"
  )
    await menu.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

async function seed(page, description = NOTE, { fakeClock = false } = {}) {
  if (fakeClock) {
    await page.clock.install({
      // Start a second early so pausing at NOW never has to rewind.
      time: new Date(new Date(NOW).getTime() - 1000),
    });
    await page.clock.pauseAt(NOW);
    await page.clock.setFixedTime(NOW);
  } else await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("compact-note-preview-seeded")) return;
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
      sessionStorage.setItem("compact-note-preview-seeded", "1");
    },
    {
      key: KEY,
      records: [
        make({
          id: "compact-note-week",
          type: "weekly",
          title: "Bağlı haftalık kapsam",
          periodKey: "2026-W46",
        }),
        make({
          id: "compact-note-daily",
          title: "Sade not önizlemesi",
          parentId: "compact-note-week",
          workContext: "",
          description,
        }),
        make({
          id: "compact-note-waiting",
          type: "waiting",
          title: "Geçmişi bulunan beklenen konu",
          description: "Geçmişten ayrı genel not.",
          nextFollowUpDate: "2026-11-10",
          followUpLog: [
            {
              id: "compact-note-contact",
              date: "2026-11-07",
              note: "Gerçek görüşme sonucu.",
            },
          ],
        }),
      ],
    },
  );
  await page.goto("/");
  await view(page, "daily");
  return saved(page);
}

test("note previews match compact connection bubbles without headings or inner frames while click editing and structured history stay separate", async ({
  page,
}) => {
  const before = await seed(page, NOTE, { fakeClock: true });
  const note = trigger(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const parent = row(page, "compact-note-daily").locator(
      ".record-parent-link",
    );
    await parent.hover();
    await page.clock.runFor(100);
    const connection = page.locator("#record-link-tooltip");
    await expect(connection).toBeVisible({ timeout: 400 });
    const connectionStyle = await styles(connection);
    await page.keyboard.press("Escape");
    await page.mouse.move(10, 10);
    await note.hover();
    await page.clock.runFor(100);
    await expect(popup(page)).toBeVisible({ timeout: 400 });
    await expect(popup(page)).toHaveAttribute("data-preview-kind", "note");
    await expect(popup(page).locator(".record-note-heading")).toBeHidden();
    await expect(popup(page).locator(".record-note-close")).toBeHidden();
    expect(await styles(popup(page))).toEqual(connectionStyle);
    await expect(body(page)).toHaveText(NOTE);
    await expect(body(page)).toHaveCSS("white-space", "pre-wrap");
    await expect(body(page)).toHaveCSS("border-top-width", "0px");
    await expect(body(page)).toHaveCSS("padding", "0px");
    await expect(body(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const outer = await popup(page).boundingBox();
    const inner = await body(page).boundingBox();
    expect(Math.abs(outer.height - inner.height - 18)).toBeLessThanOrEqual(1);
    await expect(
      popup(page).locator("img,script,input,textarea,select"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.compactNoteInjected),
    ).toBeUndefined();
    expect(await saved(page)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(popup(page)).not.toBeVisible();
    await page.mouse.move(10, 10);
    await row(page, "compact-note-daily").locator(".task-name").focus();
    await note.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.clock.runFor(100);
    await expect(popup(page)).toBeVisible({ timeout: 400 });
    await page.keyboard.press("Tab");
    await expect(
      row(page, "compact-note-daily").locator(".status-trigger"),
    ).toBeFocused();
    await page.clock.runFor(150);
    await expect(popup(page)).not.toBeVisible();
    await note.click();
    await expect(page.locator("#record-note-editor")).toBeVisible();
    await expect(
      page.locator('#record-note-editor [name="description"]'),
    ).toHaveValue(NOTE);
    await expect(page.locator("#editor")).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#record-note-editor")).not.toBeVisible();
    await expect(note).toBeFocused();
    await page.clock.runFor(250);
    await expect(popup(page)).not.toBeVisible();
    await row(page, "compact-note-daily").locator(".task-name").focus();
    await note.focus();
    await page.clock.runFor(250);
    await expect(popup(page)).not.toBeVisible();
    await page.mouse.move(10, 10);
    await note.hover();
    await page.clock.runFor(100);
    await expect(note).toBeFocused();
    await expect(popup(page)).toBeVisible();
    await page.mouse.move(10, 10);
    await page.clock.runFor(150);
    await expect(note).toBeFocused();
    await expect(popup(page)).not.toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(note).toBeFocused();
    await page.clock.runFor(250);
    await expect(popup(page)).toBeVisible();
    await expect(body(page)).toHaveText(NOTE);
    await page.keyboard.press("Escape");
    await page.clock.runFor(250);
    await expect(popup(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  }
  await view(page, "waiting");
  const history = row(page, "compact-note-waiting").locator(
    '[data-action="waiting-history"]',
  );
  await page.mouse.move(10, 10);
  await history.focus();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  await expect(popup(page)).toHaveAttribute("data-preview-kind", "history");
  await expect(popup(page).locator(".record-note-heading")).toBeVisible();
  await expect(popup(page).locator(".record-note-heading strong")).toHaveText(
    "Takip geçmişi · 1",
  );
  await expect(popup(page).locator(".record-note-close")).toBeVisible();
  await expect(
    popup(page).locator('[data-followup-id="compact-note-contact"]'),
  ).toContainText("Gerçek görüşme sonucu.");
  await page.keyboard.press("Tab");
  await expect(popup(page).locator(".record-note-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(history).toBeFocused();
  expect(await saved(page)).toBe(before);
});

test("a long compact note stays inside a short viewport and keyboard users can scroll its complete escaped text before returning to the trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  const description = `${NOTE}\n${Array.from({ length: 100 }, (_, index) => `${index + 1}. Korunacak uzun not satırı ve ayrıntısı.`).join("\n")}`;
  const before = await seed(page, description);
  const note = trigger(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.mouse.move(1, 1);
    await note.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(popup(page)).toBeVisible({ timeout: 400 });
    const bounds = await popup(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(412);
    await expect(body(page)).toHaveText(description);
    expect(
      await body(page).evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await expect(popup(page).locator(".record-note-heading")).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(body(page)).toBeFocused();
    await expect(body(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(body(page)).toHaveCSS("outline-style", "none");
    await expect(body(page)).toHaveCSS("box-shadow", "none");
    await expect(popup(page)).toHaveCSS(
      "border-top-color",
      await note.evaluate(
        (element) => getComputedStyle(element).borderTopColor,
      ),
    );
    await body(page).press("PageDown");
    await expect
      .poll(() => body(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await body(page).press("End");
    await expect
      .poll(() =>
        body(page).evaluate(
          (element) =>
            element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThanOrEqual(1);
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).locator("img,script")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.compactNoteInjected),
    ).toBeUndefined();
    await page.keyboard.press("Escape");
    await expect(popup(page)).not.toBeVisible();
    await expect(note).toBeFocused();
    await expect(page.locator("#record-note-editor")).not.toBeVisible();
    expect(await saved(page)).toBe(before);
    await row(page, "compact-note-daily").locator(".task-name").focus();
  }
});
