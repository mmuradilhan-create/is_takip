import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-05T09:00:00.000Z";
const records = [
  createRecord({
    id: "job",
    title: "CİRİT VIR dokümanlarını incele",
    dueDate: "2026-11-18",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "focus",
    title: "Odaktaki iş",
    dueDate: "2026-11-20",
    focusDate: "2026-11-13",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
];

async function seed(context) {
  await context.clock.setFixedTime(new Date("2026-11-13T09:00:00.000Z"));
  await context.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({ version: 1, records }),
  );
}

test("the pinned widget folds to one line with the work in progress and opens again, the helper sizing it", async ({
  context,
}) => {
  await seed(context);
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.addInitScript(() => {
    window.widgetResizeRequests = [];
    window.resizeTo = (width, height) =>
      window.widgetResizeRequests.push({ width, height });
  });
  await widget.goto("/#widget?windowSizing=native&windowPin=native");
  await widget.locator('[data-wb="start"][data-id="job"]').click();
  await widget.locator("#widget-pin").click();
  const fold = widget.locator("#widget-strip");
  await expect(fold).toHaveAccessibleName("Şeride küçült");
  await fold.click();
  await expect(widget).toHaveTitle("ODAK · Özet · Üstte · İnce");
  const line = widget.locator("#widget-strip-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveText("CİRİT VIR dokümanlarını incele");
  await expect(line).toHaveAttribute("data-phase", "running");
  await expect(widget.locator("#widget-workbench")).toBeHidden();
  await expect(widget.locator(".widget-header h1")).toBeHidden();
  expect(
    await widget.evaluate(
      () =>
        document.querySelector(".widget-shell").getBoundingClientRect().height,
    ),
  ).toBeLessThanOrEqual(44);
  await expect(fold).toHaveAccessibleName("Widget'ı büyüt");
  await expect(fold).toHaveAttribute("aria-pressed", "true");
  // The Windows helper owns the size; the page asks for nothing itself.
  expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual([]);
  // A click on the line opens it again; pinning is kept.
  await line.click();
  await expect(widget).toHaveTitle("ODAK · Özet · Üstte");
  await expect(widget.locator("#widget-workbench")).toBeVisible();
  await expect(fold).toHaveAccessibleName("Şeride küçült");
});

test("in a browser window the folded widget resizes itself and restores its size", async ({
  context,
}) => {
  await seed(context);
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.addInitScript(() => {
    window.widgetResizeRequests = [];
    window.resizeTo = (width, height) =>
      window.widgetResizeRequests.push({ width, height });
  });
  await widget.goto("/#widget");
  await widget.waitForTimeout(800);
  await widget.evaluate(() => (window.widgetResizeRequests = []));
  const size = await widget.evaluate(() => ({
    width: window.outerWidth,
    height: window.outerHeight,
    frame: window.outerHeight - window.innerHeight,
  }));
  await widget.locator("#widget-strip").click();
  await expect(widget).toHaveTitle("ODAK · Özet · İnce");
  await widget.locator("#widget-strip").click();
  expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual([
    { width: size.width, height: size.frame + 44 },
    { width: size.width, height: size.height },
  ]);
});

test("ODAK'ı aç from the widget asks an open native main window to come forward for a moment", async ({
  context,
}) => {
  await seed(context);
  const main = await context.newPage();
  await main.goto("/#desktop?windowSizing=native&windowPin=native");
  await expect(main).toHaveTitle("Genel bakış · Odak");
  const widget = await context.newPage();
  await widget.goto("/#widget?windowSizing=native&windowPin=native");
  await widget.locator("#widget-open-main").click();
  await expect(main).toHaveTitle("Genel bakış · Odak · Öne");
  await expect(main).toHaveTitle("Genel bakış · Odak", { timeout: 4000 });
  expect(context.pages()).toHaveLength(2);
});

test("work rows show running and paused as a left bar and keep no state background; the star alone marks focus", async ({
  context,
}) => {
  await seed(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page
    .locator('.focus-row[data-id="job"] [data-action="work-start"]')
    .click();
  await page.mouse.move(5, 790);
  const look = (selector) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.boxShadow];
    });
  expect(await look('.focus-row[data-id="job"]')).toEqual([
    "rgba(0, 0, 0, 0)",
    "rgb(47, 138, 87) 3px 0px 0px 0px inset",
  ]);
  expect(await look('.focus-row[data-id="focus"]')).toEqual([
    "rgba(0, 0, 0, 0)",
    "none",
  ]);
  await page
    .locator('.focus-row[data-id="job"] [data-action="work-start"]')
    .click();
  await page.mouse.move(5, 790);
  await expect(page.locator('.focus-row[data-id="job"]')).toHaveAttribute(
    "data-work-bar",
    "paused",
  );
  expect((await look('.focus-row[data-id="job"]'))[1]).toBe(
    "rgb(201, 154, 61) 3px 0px 0px 0px inset",
  );
  await page.locator('#nav [data-view="daily"]').click();
  await page.mouse.move(5, 790);
  expect((await look('tr[data-id="job"] > td:first-child'))[1]).toBe(
    "rgb(201, 154, 61) 3px 0px 0px 0px inset",
  );
  expect(await look('tr[data-id="focus"] > td:first-child')).toEqual([
    "rgba(0, 0, 0, 0)",
    "none",
  ]);
});

test("the folded strip starts the next work, pauses and resumes it, counts late work and opens for a due reminder", async ({
  context,
}) => {
  await context.clock.setFixedTime(new Date("2026-11-13T09:00:00.000Z"));
  await context.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({
      version: 1,
      records: [
        createRecord({
          id: "late",
          title: "Gecikmiş iş",
          dueDate: "2026-11-10",
          createdAt: STAMP,
          updatedAt: STAMP,
        }),
      ],
      odak: {
        version: 1,
        notes: [
          {
            id: "n",
            text: "Tedarikçiyi ara",
            remindAt: "2026-11-13T08:00",
            createdAt: STAMP,
            updatedAt: STAMP,
          },
        ],
      },
    }),
  );
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.goto("/#widget?windowSizing=native&windowPin=native");
  await widget.locator("#widget-strip").click();
  const line = widget.locator("#widget-strip-line");
  const action = widget.locator("#widget-strip-action");
  await expect(line.locator(".widget-strip-text")).toHaveText(
    "Sıradaki: Gecikmiş iş",
  );
  await expect(widget.locator("#widget-strip-meta")).toHaveText("1 geciken");
  await expect(action).toHaveAccessibleName("Gecikmiş iş: çalışmaya başla");
  await action.click();
  await expect(line).toHaveAttribute("data-phase", "running");
  await expect(line.locator(".widget-strip-text")).toHaveText("Gecikmiş iş");
  await expect(action).toHaveAttribute("title", "Duraklat");
  await action.click();
  await expect(line).toHaveAttribute("data-phase", "paused");
  await expect(action).toHaveAttribute("title", "Devam et");
  await action.click();
  await expect(line).toHaveAttribute("data-phase", "running");
  // Still folded throughout; the due reminder's bell opens the widget.
  await expect(widget).toHaveTitle(/İnce/);
  const bell = widget.locator("#widget-reminder-button");
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(widget).not.toHaveTitle(/İnce/);
  await expect(widget.locator("#widget-reminders")).toBeVisible();
  await expect(widget.locator("#reminder-panel")).toBeHidden();
});
