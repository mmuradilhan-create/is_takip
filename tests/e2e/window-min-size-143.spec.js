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

test("a narrow main window keeps a 960px page and scrolls sideways instead of squeezing", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 860, height: 700 });
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  await expect(page.locator(".task-name").first()).toBeVisible();
  expect(await pageWidth(page)).toBe(960);
  expect(
    await page
      .locator(".task-name")
      .first()
      .evaluate((item) => item.getBoundingClientRect().width),
  ).toBeGreaterThan(120);

  // The menu moves away with the page; the top bar still stays on top.
  await page.evaluate(() => window.scrollTo(100, 300));
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((item) => Math.round(item.getBoundingClientRect().left)),
    )
    .toBe(-100);
  expect(
    await page
      .locator(".topbar")
      .evaluate((item) => Math.round(item.getBoundingClientRect().top)),
  ).toBe(0);

  // Wide and phone-sized windows keep their own layouts.
  await page.evaluate(() => window.scrollTo(0, 0));
  const overflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect.poll(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 700, height: 700 });
  await expect.poll(overflow).toBeLessThanOrEqual(0);
  // Short windows keep their compact layout without sideways scrolling.
  await page.setViewportSize({ width: 850, height: 480 });
  await expect.poll(overflow).toBeLessThanOrEqual(0);
});

test("the overview never puts the calendar under current work on a desktop; narrow windows keep a 1200px overview", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const focus = page.locator(".dashboard-top-row .dashboard-main-column");
  const calendar = page.locator(".dashboard-top-row .dashboard-followups");
  await expect(focus.locator(".focus-row").first()).toBeVisible();
  for (const width of [1440, 1260, 1200, 1150, 1000, 860]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(async () => (await calendar.boundingBox()).y)
      .toBe((await focus.boundingBox()).y);
    if (width < 1200) expect(await pageWidth(page)).toBe(1200);
    else expect(await pageWidth(page)).toBeLessThanOrEqual(width);
    // Titles keep their room beside the status, priority and date boxes.
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
    ).toBeGreaterThan(150);
  }
});

test("the widget stops at 300 x 320 and scrolls in a smaller window", async ({
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
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        overflow: getComputedStyle(document.body).overflow,
      };
    });
  expect(await size()).toEqual({ width: 300, height: 320, overflow: "auto" });
  await page.setViewportSize({ width: 380, height: 420 });
  await expect
    .poll(size)
    .toEqual({ width: 380, height: 420, overflow: "hidden" });
});
