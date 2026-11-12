import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-05T09:00:00.000Z";
const records = Array.from({ length: 6 }, (_, index) =>
  createRecord({
    id: `job-${index}`,
    title: `Tedarikçi teklif karşılaştırması ve maliyet analizi ${index + 1}`,
    priority: index % 2 ? "high" : "normal",
    dueDate: index % 2 ? "2026-11-12" : "",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
);

async function seed(page) {
  await page.clock.setFixedTime(new Date("2026-11-11T09:00:00.000Z"));
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records }) },
  );
}

const pageWidth = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth);

const overflow = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test("narrow desktop windows never scroll sideways: the menu becomes an icon rail", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  const daily = page.locator('#nav [data-view="daily"]');
  await expect(daily.locator(".nav-text")).toBeVisible();
  expect(Math.round((await sidebar.boundingBox()).width)).toBe(238);

  for (const width of [1199, 1000, 900, 800, 761]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox()).width))
      .toBe(64);
    // The name stays for screen readers and as the tooltip.
    await expect(daily).toHaveAccessibleName(/Günlük işler/);
    await expect(daily).toHaveAttribute("title", "Günlük işler");
    expect(
      await daily
        .locator(".nav-text")
        .evaluate((item) => item.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    for (const view of ["dashboard", "daily", "waiting"]) {
      await page.locator(`#nav [data-view="${view}"]`).click();
      await expect
        .poll(() => overflow(page), `${view} at ${width}`)
        .toBeLessThanOrEqual(0);
    }
  }
  // Phones keep their own drawer.
  await page.setViewportSize({ width: 700, height: 700 });
  await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible();
  await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
});

test("the overview keeps the calendar beside current work at every desktop width without sideways scrolling", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const focus = page.locator(".dashboard-top-row .dashboard-main-column");
  const calendar = page.locator(".dashboard-top-row .dashboard-followups");
  await expect(focus.locator(".focus-row").first()).toBeVisible();
  for (const width of [1440, 1260, 1200, 1150, 1000, 900, 860, 800, 761]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(async () => (await calendar.boundingBox()).y)
      .toBe((await focus.boundingBox()).y);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Titles keep readable room beside the status and date boxes.
    expect(
      await focus
        .locator(".focus-row")
        .first()
        .evaluate(
          (row) =>
            row
              .querySelector(".focus-title")
              .parentElement.getBoundingClientRect().width,
        ),
      `title room at ${width}`,
    ).toBeGreaterThan(80);
  }
});

test("a small widget never scrolls sideways; below 320px tall it scrolls down", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 240, height: 260 });
  await page.goto("/#widget");
  const shell = page.locator(".widget-shell");
  await expect(shell).toHaveAttribute("data-view", "work");
  const size = () =>
    page.evaluate(() => {
      const box = document
        .querySelector(".widget-shell")
        .getBoundingClientRect();
      const body = getComputedStyle(document.body);
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        overflowX: body.overflowX,
        overflowY: body.overflowY,
        sideways: document.body.scrollWidth > innerWidth,
      };
    });
  expect(await size()).toEqual({
    width: 240,
    height: 320,
    overflowX: "hidden",
    overflowY: "auto",
    sideways: false,
  });
  // The header drops its words instead of pushing the pin out of view.
  await expect(page.locator(".widget-live")).toBeHidden();
  await expect(page.locator("#widget-pin")).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 380, height: 420 });
  await expect.poll(size).toEqual({
    width: 380,
    height: 420,
    overflowX: "hidden",
    overflowY: "hidden",
    sideways: false,
  });
});

test("on wide screens the chevron collapses the menu to the rail and back, and the choice is kept", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1536, height: 800 });
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  const chevron = page.locator(".sidebar-collapse");
  const width = async () => Math.round((await sidebar.boundingBox()).width);
  await expect(chevron).toHaveAccessibleName("Menüyü daralt");
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  expect(await width()).toBe(238);
  await chevron.click();
  await expect.poll(width).toBe(64);
  await expect(chevron).toHaveAccessibleName("Menüyü genişlet");
  await expect(chevron).toBeFocused();
  const daily = page.locator('#nav [data-view="daily"]');
  await expect(daily).toHaveAttribute("title", "Günlük işler");
  await daily.click();
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Kept across reloads; a narrow window keeps its automatic rail.
  await page.reload();
  await expect.poll(width).toBe(64);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(chevron).toBeHidden();
  await expect.poll(width).toBe(64);
  await page.setViewportSize({ width: 1536, height: 800 });
  await chevron.click();
  await expect.poll(width).toBe(238);
  await page.reload();
  await expect.poll(width).toBe(238);
  // No Undo entry: it is a view choice, not a change to the records.
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});
