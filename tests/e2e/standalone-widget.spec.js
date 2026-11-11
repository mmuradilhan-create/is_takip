import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { showAgenda } from "./widget-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(NOW);
});

function records() {
  return [
    createRecord({
      id: "urgent-task",
      title: '<img src=x onerror="window.unexpected=1"> Öncelikli iş',
      status: "in_progress",
      priority: "urgent",
      dueDate: "2026-11-07",
    }),
    createRecord({
      id: "late-task",
      type: "waiting",
      title: "Malzeme yanıtını takip et",
      priority: "high",
      nextFollowUpDate: "2026-11-07",
      sourceDate: "2026-11-01",
    }),
    createRecord({
      id: "next-task",
      title: "Sonraki günlük iş",
      priority: "normal",
      dueDate: "2026-11-08",
    }),
    createRecord({
      id: "finished-task",
      title: "Tamamlanan günlük iş",
      status: "completed",
    }),
    createRecord({
      id: "weekly-goal",
      type: "weekly",
      title: "Haftalık hedef",
      dueDate: "2026-11-07",
    }),
    createRecord({
      id: "untimed-task",
      title: "Takvim tarihi olmayan iş gündeme eklenmez",
      priority: "urgent",
    }),
    createRecord({
      id: "overdue-task",
      title: "Önceki günün işi bugünün tarihli gündemine karışmaz",
      dueDate: "2026-11-06",
      priority: "urgent",
    }),
    createRecord({
      id: "legacy-meeting-context",
      type: "meeting",
      title: "Toplantının eski teslim tarihi gündeme eklenmez",
      dueDate: "2026-11-07",
      priority: "urgent",
      decision: "Bağlı işin kendi teslim tarihi kullanılacak.",
    }),
  ];
}

async function seed(page, saved) {
  await page.addInitScript(
    ({ key, saved }) => {
      if (!sessionStorage.getItem("standalone-test-seeded")) {
        localStorage.setItem(key, saved);
        sessionStorage.setItem("standalone-test-seeded", "true");
      }
      window.widgetStorageWrites = 0;
      for (const method of ["setItem", "removeItem", "clear"]) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          if (
            this === window.localStorage &&
            (method === "clear" ||
              args[0] === key ||
              args[0] === `${key}-preferences`)
          )
            window.widgetStorageWrites++;
          return original.apply(this, args);
        };
      }
    },
    { key: KEY, saved },
  );
}

async function fixturePage(page, embeddedRecords) {
  const original = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8",
  );
  const embedded = JSON.stringify({
    version: 1,
    records: embeddedRecords,
  }).replace(/</g, "\\u003c");
  await page.route("**/standalone-test.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: original.replace(
        "</body>",
        `<script id="initial-data" type="application/json">${embedded}</script></body>`,
      ),
    }),
  );
  await page.goto("/standalone-test.html#widget");
  await showAgenda(page);
}

test("standalone agenda renders today's dated work and follow-ups without touching saved records or history", async ({
  page,
  context,
}) => {
  const saved = JSON.stringify({
    version: 1,
    records: records(),
    odak: { version: 1, preferences: { density: "compact" }, history: [] },
  });
  await seed(page, saved);
  await page.goto("/#widget");
  await showAgenda(page);
  await expect(page).toHaveTitle("ODAK · Özet");
  await expect(page.locator("#widget-today-count")).toHaveText("3");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("1");
  await expect(page.locator("#widget-overdue-count")).toHaveText("1");
  await expect(page.locator("#widget-date")).toHaveAttribute(
    "datetime",
    "2026-11-07",
  );
  await expect(page.locator("#widget-task-count")).toHaveText("3 kayıt");
  await expect(
    page.locator("#widget-open-count, #widget-today, #widget-overdue"),
  ).toHaveCount(0);
  await expect(page.locator("#widget-tasks .widget-task")).toHaveCount(3);
  await expect(
    page.locator('.widget-task[data-id="legacy-meeting-context"]'),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".widget-task")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id)),
  ).toEqual(["urgent-task", "weekly-goal", "late-task"]);
  await expect(page.locator(".widget-task-open").first()).toHaveText(
    records()[0].title,
  );
  await expect(page.locator("#widget-tasks img")).toHaveCount(0);
  expect(await page.evaluate(() => window.unexpected)).toBeUndefined();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    saved,
  );
  expect(await page.evaluate(() => window.widgetStorageWrites)).toBe(0);
  const mainScreen = await page.evaluate(() => {
    window.mainWindowRequests = [];
    const open = window.open;
    window.open = function (...args) {
      window.mainWindowRequests.push(args[2]);
      return Reflect.apply(open, this, args);
    };
    return {
      width: screen.availWidth,
      height: screen.availHeight,
      left: screen.availLeft || 0,
      top: screen.availTop || 0,
    };
  });
  const opening = page.waitForEvent("popup");
  await page.locator('[data-record-id="urgent-task"]').click();
  const main = await opening;
  await expect(main).toHaveURL(/#desktop\?record=urgent-task$/);
  await expect(main.locator("#editor")).toBeVisible();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    records()[0].title,
  );
  await expect(page).toHaveURL(/#widget$/);
  expect(page.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(2);
  const requested = await page.evaluate(() => window.mainWindowRequests);
  expect(requested).toHaveLength(1);
  const features = new URLSearchParams(requested[0].replaceAll(",", "&"));
  for (const [key, value] of Object.entries(mainScreen))
    expect(Number(features.get(key))).toBe(value);
});

test("standalone summary follows another window, keeps running alone, and polls same-window storage changes", async ({
  context,
}) => {
  const source = await context.newPage();
  const widget = await context.newPage();
  const saved = { version: 1, records: records() };
  await source.goto("/#widget");
  await showAgenda(source);
  await source.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: KEY, saved },
  );
  await widget.goto("/#widget");
  await showAgenda(widget);
  await expect(widget.locator("#widget-today-count")).toHaveText("3");
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("1");
  await widget.locator('[data-widget-day="tomorrow"]').click();
  await expect(widget.locator('[data-widget-day="tomorrow"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(widget.locator("#widget-date")).toHaveAttribute(
    "datetime",
    "2026-11-08",
  );
  await expect(widget.locator("#widget-tasks .widget-task")).toHaveCount(1);
  await expect(widget.locator("#widget-tasks .widget-task")).toHaveAttribute(
    "data-id",
    "next-task",
  );
  await widget.locator('[data-widget-day="today"]').click();
  expect(await widget.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    JSON.stringify(saved),
  );
  saved.records[0].status = "completed";
  await source.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: KEY, saved },
  );
  await expect(widget.locator("#widget-today-count")).toHaveText("2");
  await source.close();
  await expect(widget.locator("#widget-today-count")).toHaveText("2");
  await widget.evaluate(
    (key) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, records: [] })),
    KEY,
  );
  await expect(widget.locator("#widget-today-count")).toHaveText("0");
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("0");
  await expect(widget.locator("#widget-status")).toBeEmpty();
  const opening = widget.waitForEvent("popup");
  await widget.getByRole("button", { name: "ODAK’ı aç" }).click();
  const main = await opening;
  await expect(main).toHaveURL(/#desktop$/);
  await expect(main.locator("#page-title")).toHaveText("Genel bakış");
  await expect(widget).toHaveURL(/#widget$/);
  expect(widget.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(2);
});

test("standalone uses embedded records only for missing storage and respects an explicitly empty workspace", async ({
  page,
}) => {
  await fixturePage(page, records());
  await expect(page.locator("#widget-today-count")).toHaveText("3");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), KEY),
  ).toBeNull();
  const empty = JSON.stringify({ version: 1, records: [] });
  await page.evaluate(({ key, empty }) => localStorage.setItem(key, empty), {
    key: KEY,
    empty,
  });
  await page.reload();
  await expect(page.locator("#widget-today-count")).toHaveText("0");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    empty,
  );
});

test("standalone reports invalid or inaccessible storage without overwriting it or displaying fallback jobs", async ({
  page,
}) => {
  await seed(page, "broken-json");
  await fixturePage(page, records());
  await expect(page.locator("#widget-status")).toContainText(
    "Kayıtlar okunamadı",
  );
  await expect(page.locator("#widget-today-count")).toHaveText("—");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("—");
  await expect(page.locator("#widget-overdue-count")).toHaveText("—");
  await expect(page.locator(".widget-task")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "broken-json",
  );
  expect(await page.evaluate(() => window.widgetStorageWrites)).toBe(0);
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Unavailable storage");
      },
    }),
  );
  await page.reload();
  await expect(page.locator("#widget-status")).toContainText(
    "Kayıtlar okunamadı",
  );
  await expect(page.locator("#widget-today-count")).toHaveText("—");
});

async function observeActivation(page) {
  await page.addInitScript(() => {
    window.odakFocusCalls = 0;
    const focus = window.focus.bind(window);
    window.focus = () => {
      window.odakFocusCalls++;
      focus();
    };
  });
}

test("opening an existing main window preserves its view, search and unsaved form without replacing the widget", async ({
  context,
}) => {
  const main = await context.newPage();
  const widget = await context.newPage();
  const saved = JSON.stringify({ version: 1, records: records() });
  await seed(main, saved);
  await observeActivation(main);
  await main.goto("/#desktop");
  await main.locator('#nav [data-view="waiting"]').click();
  await main.locator("#global-search").fill("Korunacak arama");
  await main.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await main
    .locator('#record-form [name="title"]')
    .fill("Kaydedilmemiş taslak");
  const before = await main.evaluate((key) => localStorage.getItem(key), KEY);
  await widget.goto("/#widget");
  await showAgenda(widget);

  for (let attempt = 1; attempt <= 2; attempt++) {
    await widget
      .getByRole("button", { name: "ODAK’ı aç", exact: true })
      .click();
    await expect
      .poll(() => main.evaluate(() => window.odakFocusCalls))
      .toBeGreaterThanOrEqual(attempt);
    await expect(widget).toHaveURL(/#widget$/);
    await expect(widget.locator("#widget-open-main")).toBeVisible();
    await expect(main.locator("#page-title")).toHaveText("Bekleyen konular");
    await expect(main.locator("#global-search")).toHaveValue("Korunacak arama");
    await expect(main.locator("#editor")).toBeVisible();
    await expect(main.locator('#record-form [name="title"]')).toHaveValue(
      "Kaydedilmemiş taslak",
    );
    expect(context.pages()).toHaveLength(2);
    expect(await main.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      before,
    );
  }
});

test("widget tasks reuse the existing main and open a separate main after main closure", async ({
  context,
}) => {
  const main = await context.newPage();
  const widget = await context.newPage();
  const items = records();
  const saved = JSON.stringify({ version: 1, records: items });
  await seed(main, saved);
  await main.goto("/#desktop");
  await expect(main.locator("#page-title")).toHaveText("Genel bakış");
  await widget.goto("/#widget");
  await showAgenda(widget);
  await widget.locator('[data-record-id="urgent-task"]').click();
  await expect(main.locator("#editor")).toBeVisible();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    items[0].title,
  );
  await expect(widget).toHaveURL(/#widget$/);
  expect(context.pages()).toHaveLength(2);
  expect(await widget.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    saved,
  );

  await main.close();
  const opening = widget.waitForEvent("popup");
  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  const reopened = await opening;
  await expect(reopened).toHaveURL(/#desktop$/);
  await expect(reopened.locator("#page-title")).toHaveText("Genel bakış");
  await expect(widget).toHaveURL(/#widget$/);
  expect(widget.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(2);
  expect(await widget.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    saved,
  );
});

test("existing main activation also works through storage when BroadcastChannel is unavailable", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  const main = await context.newPage();
  const widget = await context.newPage();
  await seed(main, JSON.stringify({ version: 1, records: records() }));
  await observeActivation(main);
  await main.goto("/#desktop");
  await expect(main.locator("#page-title")).toHaveText("Genel bakış");
  await widget.goto("/#widget");
  await showAgenda(widget);
  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  await expect
    .poll(() => main.evaluate(() => window.odakFocusCalls))
    .toBeGreaterThanOrEqual(1);
  await expect(widget).toHaveURL(/#widget$/);
  expect(context.pages()).toHaveLength(2);
  await widget.locator('[data-record-id="late-task"]').click();
  await expect(main.locator("#editor")).toBeVisible();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    records()[1].title,
  );
  await expect(widget).toHaveURL(/#widget$/);
});

test("a different HTML file is not treated as this widget's main window", async ({
  context,
}) => {
  const main = await context.newPage();
  const widget = await context.newPage();
  await seed(main, JSON.stringify({ version: 1, records: records() }));
  const html = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8",
  );
  await main.route("**/other-workspace.html", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await main.goto("/other-workspace.html#desktop");
  await expect(main.locator("#page-title")).toHaveText("Genel bakış");
  await widget.goto("/#widget");
  await showAgenda(widget);
  const opening = widget.waitForEvent("popup");
  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  const correctMain = await opening;
  await expect(correctMain).toHaveURL(/\/#desktop$/);
  await expect(correctMain.locator("#page-title")).toHaveText("Genel bakış");
  await expect(widget).toHaveURL(/#widget$/);
  await expect(main).toHaveURL(/\/other-workspace\.html#desktop$/);
  expect(context.pages()).toHaveLength(3);
});

test("the compact widget fits three two-line tasks and its open button in 380 by 420 content pixels", async ({
  page,
}, testInfo) => {
  const items = records();
  for (const record of items.filter((item) =>
    ["urgent-task", "late-task", "weekly-goal"].includes(item.id),
  )) {
    record.title =
      "Projenin doğrulama raporunu tamamla ve ilgili ekiplerle son değerlendirme notlarını paylaş";
  }
  await page.setViewportSize({ width: 380, height: 420 });
  await seed(page, JSON.stringify({ version: 1, records: items }));
  await page.goto("/#widget");
  await showAgenda(page);
  await expect(page.locator("#widget-tasks .widget-task")).toHaveCount(3);
  await expect(page.locator("#widget-open-main")).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    contentHeight: document
      .querySelector(".widget-shell")
      .getBoundingClientRect().height,
    buttonBottom: document
      .querySelector("#widget-open-main")
      .getBoundingClientRect().bottom,
  }));
  expect(geometry.contentHeight).toBeLessThanOrEqual(420);
  await testInfo.attach("widget-geometry", {
    body: JSON.stringify(geometry),
    contentType: "application/json",
  });
  console.log("Compact widget geometry:", JSON.stringify(geometry));
  await page.screenshot({
    path: testInfo.outputPath("compact-widget-380x420.png"),
  });
});
