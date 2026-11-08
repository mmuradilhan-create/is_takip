import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

test("pointer-opened goal rows return to their normal background while keyboard focus remains visible after closing details", async ({
  page,
}) => {
  const records = [
    createRecord({
      id: "focus-polish-year",
      type: "yearly",
      title: "Kapanınca seçili görünmeyecek hedef",
      periodKey: "2026",
      status: "in_progress",
      targetValue: 100,
      currentValue: 5,
      metric: "Rapor",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  await page.setViewportSize({ width: 1600, height: 1000 });
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
  await page.locator('#nav [data-view="yearly"]').click();
  const before = await saved(page);
  const row = page.locator(
    '.full-table [data-record-row][data-id="focus-polish-year"]',
  );
  const title = row.locator('.task-name[data-action="goal-details"]');
  const panel = page.locator("#goal-detail-panel");
  const background = () =>
    row.evaluate((element) => getComputedStyle(element).backgroundColor);
  const decoration = () =>
    title.evaluate((element) => getComputedStyle(element).textDecorationLine);
  const moveAway = async () => {
    const heading = await page.locator("#page-title").boundingBox();
    await page.mouse.move(heading.x + 3, heading.y + 3);
  };

  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value;
    }, theme);
    await moveAway();
    const normalBackground = await background();

    await title.click();
    await expect(panel).toHaveAttribute("data-goal-id", "focus-polish-year");
    await panel.getByRole("button", { name: "Kapat", exact: true }).click();
    await expect(panel).not.toBeVisible();
    // Resting the mouse over the original title must not make the row look
    // selected after closing; the title itself keeps its ordinary hover cue.
    await title.hover();
    await expect.poll(background).toBe(normalBackground);

    await moveAway();
    await expect.poll(background).toBe(normalBackground);
    await expect.poll(decoration).toBe("none");

    await title.click();
    await expect(panel).toBeVisible();
    const heading = await page.locator("#page-title").boundingBox();
    await page.mouse.click(heading.x + 3, heading.y + 3);
    await expect(panel).not.toBeVisible();
    await expect.poll(background).toBe(normalBackground);
    await expect.poll(decoration).toBe("none");

    // A real keyboard gesture establishes keyboard modality before focusing
    // the title, so returning from the panel retains an identifiable target.
    await page.keyboard.press("Tab");
    await title.focus();
    await expect(title).toBeFocused();
    await expect.poll(decoration).toContain("underline");
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(title).toBeFocused();
    await expect.poll(decoration).toContain("underline");
    expect(await saved(page)).toBe(before);

    await page.locator("#page-title").click();
    await moveAway();
  }
  expect(await saved(page)).toBe(before);
});

test("calendar agenda focus does not frame the whole scrolling area while individual entries and dates retain keyboard cues", async ({
  page,
}) => {
  const records = Array.from({ length: 8 }, (_, index) =>
    createRecord({
      id: `agenda-focus-${index}`,
      title: `Takvimdeki gerçek iş ${index + 1}`,
      type: "daily",
      status: "planned",
      workContext: "ad_hoc",
      dueDate: "2026-11-08",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
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
  const before = await saved(page);
  const calendar = page.locator(".dashboard-calendar");
  const agenda = calendar.locator(".calendar-agenda-entries");
  const firstEntry = agenda.locator(".calendar-entry").first();
  const date = calendar.locator(
    '[data-calendar-action="select-day"][data-calendar-date="2026-11-08"]',
  );
  const assertNoFrame = async () => {
    await expect(agenda).toBeFocused();
    await expect(agenda).toHaveCSS("outline-style", "none");
    await expect(agenda).toHaveCSS("outline-offset", "0px");
    await expect(agenda).toHaveCSS("box-shadow", "none");
  };
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value;
    }, theme);
    await agenda.locator("h4").first().click();
    await agenda.focus();
    await assertNoFrame();

    await page.keyboard.press("Tab");
    await agenda.focus();
    expect(
      await agenda.evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await assertNoFrame();
    await page.keyboard.press("Tab");
    await expect(firstEntry).toBeFocused();
    await expect(firstEntry).toHaveCSS("text-decoration-line", "underline");
    await date.focus();
    await expect(date).toBeFocused();
    await expect(date).toHaveCSS("text-decoration-line", "underline");
    expect(await saved(page)).toBe(before);
  }
});
