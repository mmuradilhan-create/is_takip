import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { showAgenda } from "./widget-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const TODAY = "2026-11-07";
const TOMORROW = "2026-11-08";
const record = (id, type, date, extra = {}) =>
  createRecord({
    id,
    type,
    title: `${type} · ${id}`,
    dueDate: date,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const day = (page, value) => page.locator(`[data-widget-day="${value}"]`);
const entry = (page, id) =>
  page.locator(`#widget-tasks .widget-task[data-id="${id}"]`);
const entryIds = (page) =>
  page
    .locator("#widget-tasks .widget-task")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id).sort());

test.use({ screen: { width: 1920, height: 1080 } });

async function seed(
  page,
  items,
  { theme = "light", now = NOW, advanceClock = false } = {},
) {
  const raw = JSON.stringify({
    version: 1,
    records: items,
    odak: {
      version: 1,
      preferences: { density: "compact", theme },
      history: [],
    },
  });
  if (advanceClock) {
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
  } else {
    // Hold the calendar date while keeping discovery and activation timers live.
    await page.clock.setFixedTime(now);
  }
  await page.addInitScript(
    ({ key, raw }) => {
      if (!sessionStorage.getItem("widget-agenda-021-seeded")) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem("widget-agenda-021-seeded", "1");
      }
      window.widgetPrimaryWrites = 0;
      window.widgetReadFailure = false;
      for (const method of ["setItem", "removeItem", "clear"]) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          if (
            this === window.localStorage &&
            (method === "clear" ||
              args[0] === key ||
              args[0] === `${key}-preferences`)
          )
            window.widgetPrimaryWrites++;
          return original.apply(this, args);
        };
      }
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (...args) {
        if (
          window.widgetReadFailure &&
          this === window.localStorage &&
          args[0] === key
        )
          throw new Error("Synthetic unavailable storage");
        return originalGet.apply(this, args);
      };
    },
    { key: KEY, raw },
  );
  return raw;
}

async function openWidget(page) {
  await page.goto("/#widget");
  await showAgenda(page);
  await expect(page.locator("#widget-open-main")).toBeVisible();
}

test("today and tomorrow show actual dated events across types without routed duplicates or storage writes", async ({
  page,
}) => {
  const items = [
    record("daily", "daily", TODAY),
    record("weekly", "weekly", TODAY, { periodKey: "2026-W46" }),
    record("monthly", "monthly", TODAY, { periodKey: "2026-12" }),
    record("meeting", "meeting", TODAY),
    record("waiting", "waiting", TOMORROW, { nextFollowUpDate: TODAY }),
    record("routed-meeting", "meeting", TODAY),
    record("routed-daily", "daily", TODAY, {
      sourceFields: { __followupSource: { recordId: "routed-meeting" } },
    }),
    record("routed-waiting", "waiting", "2026-11-06", {
      nextFollowUpDate: TODAY,
      sourceFields: { __followupSource: { recordId: "routed-meeting" } },
    }),
    record("contact-waiting", "waiting", null, { nextFollowUpDate: TODAY }),
    record("contact-work", "daily", TOMORROW, {
      sourceFields: { __followupSource: { recordId: "contact-waiting" } },
    }),
    record("tomorrow", "daily", TOMORROW),
    record("tomorrow-waiting", "waiting", TODAY, {
      nextFollowUpDate: TOMORROW,
    }),
    record("yearly", "yearly", TODAY, { periodKey: "2026" }),
    record("period-only", "weekly", null, { periodKey: "2026-W45" }),
    record("undated", "daily", null),
    record("waiting-due-only", "waiting", TODAY),
    record("late", "daily", "2026-11-06"),
    record("later", "daily", "2026-11-09"),
    ...["completed", "cancelled", "transferred"].map((status) =>
      record(`closed-${status}`, "daily", TODAY, { status }),
    ),
  ];
  const before = await seed(page, items);
  await openWidget(page);
  const todayIds = [
    "daily",
    "weekly",
    "monthly",
    "waiting",
    "routed-daily",
    "routed-waiting",
    "contact-waiting",
  ].sort();
  await expect.poll(() => entryIds(page)).toEqual(todayIds);
  await expect(page.locator("#widget-today-count")).toHaveText("7");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("3");
  await expect(page.locator("#widget-overdue-count")).toHaveText("1");
  await expect(page.locator("#widget-task-count")).toHaveText("7 kayıt");
  await expect(entry(page, "meeting")).toHaveCount(0);
  await expect(entry(page, "routed-meeting")).toHaveCount(0);
  await expect(entry(page, "waiting")).toHaveAttribute(
    "data-entry-kind",
    "followup",
  );
  await expect(entry(page, "waiting").locator(".widget-event-kind")).toHaveText(
    "Takip",
  );
  await expect(entry(page, "weekly").locator(".widget-event-kind")).toHaveText(
    "Teslim",
  );
  await expect(page.locator("#widget-date")).toHaveAttribute("datetime", TODAY);
  await expect(day(page, "today")).toHaveAttribute("aria-pressed", "true");
  await day(page, "today").focus();
  await page.keyboard.press("Tab");
  await expect(day(page, "tomorrow")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(day(page, "tomorrow")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => entryIds(page))
    .toEqual(["contact-work", "tomorrow", "tomorrow-waiting"]);
  await expect(page.locator("#widget-task-count")).toHaveText("3 kayıt");
  await page.keyboard.press("Space");
  await expect(day(page, "tomorrow")).toHaveAttribute("aria-pressed", "true");
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate(() => window.widgetPrimaryWrites)).toBe(0);
  await page.reload();
  await expect(day(page, "today")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => entryIds(page)).toEqual(todayIds);
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate(() => window.widgetPrimaryWrites)).toBe(0);
});

test("every agenda type opens its saved main record and tomorrow survives live completion and exact Undo", async ({
  page: main,
  context,
}) => {
  const items = [
    ...["daily", "weekly", "monthly", "meeting"].map((type) =>
      record(`open-${type}`, type, TODAY),
    ),
    record("open-waiting", "waiting", null, { nextFollowUpDate: TODAY }),
    record("tomorrow-daily", "daily", TOMORROW),
    record("tomorrow-followup", "waiting", null, {
      nextFollowUpDate: TOMORROW,
    }),
  ];
  const before = await seed(main, items);
  await main.goto("/#desktop");
  const widget = await context.newPage();
  await widget.clock.setFixedTime(NOW);
  await openWidget(widget);
  await expect(entry(widget, "open-meeting")).toHaveCount(0);
  for (const item of items.filter(
    (item) => item.id.startsWith("open-") && item.type !== "meeting",
  )) {
    await entry(widget, item.id).locator(".widget-task-open").click();
    await expect(main.locator("#editor")).toBeVisible();
    await expect(main.locator('#record-form [name="title"]')).toHaveValue(
      item.title,
    );
    await expect(main.locator('#record-form [name="type"]')).toHaveValue(
      item.type,
    );
    await main.locator('#editor [data-action="close"]').first().click();
    expect(widget.isClosed()).toBe(false);
    expect(context.pages()).toHaveLength(2);
  }
  expect(await saved(main)).toBe(before);
  await day(widget, "tomorrow").click();
  await entry(widget, "tomorrow-daily").locator(".widget-task-open").click();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    "daily · tomorrow-daily",
  );
  await main.locator('#record-form [name="status"]').selectOption("completed");
  await main.locator('#record-form button[type="submit"]').click();
  await expect(main.locator("#editor")).not.toBeVisible();
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("1");
  await expect(entry(widget, "tomorrow-daily")).toHaveCount(0);
  await expect(day(widget, "tomorrow")).toHaveAttribute("aria-pressed", "true");
  await expect(entry(widget, "tomorrow-followup")).toBeVisible();
  await main.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("2");
  await expect(entry(widget, "tomorrow-daily")).toBeVisible();
  await expect(day(widget, "tomorrow")).toHaveAttribute("aria-pressed", "true");
  expect(await saved(main)).toBe(before);
  expect(widget.isClosed()).toBe(false);
  await expect(widget).toHaveURL(/#widget$/);
});

test("tomorrow remains a relative calendar day over midnight before a daylight-saving clock change", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Berlin",
    viewport: { width: 380, height: 420 },
    screen: { width: 1920, height: 1080 },
  });
  try {
    const page = await context.newPage();
    const before = await seed(
      page,
      [
        record("saturday", "daily", "2026-10-24"),
        record("dst-sunday", "daily", "2026-10-25"),
        record("monday", "daily", "2026-10-26"),
      ],
      { now: new Date("2026-10-24T21:59:40.000Z"), advanceClock: true },
    );
    await openWidget(page);
    await day(page, "tomorrow").click();
    await expect.poll(() => entryIds(page)).toEqual(["dst-sunday"]);
    await expect(page.locator("#widget-date")).toHaveAttribute(
      "datetime",
      "2026-10-25",
    );
    await page.clock.runFor(40_000);
    await expect(day(page, "tomorrow")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => entryIds(page)).toEqual(["monday"]);
    await expect(page.locator("#widget-date")).toHaveAttribute(
      "datetime",
      "2026-10-26",
    );
    await expect(page.locator("#widget-today-count")).toHaveText("1");
    await day(page, "today").click();
    await expect.poll(() => entryIds(page)).toEqual(["dst-sunday"]);
    expect(await saved(page)).toBe(before);
    expect(await page.evaluate(() => window.widgetPrimaryWrites)).toBe(0);
  } finally {
    await context.close();
  }
});

test("a long agenda scrolls only its entries with accessible pinned controls in both themes at 380 by 420", async ({
  browser,
  baseURL,
}) => {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      baseURL,
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      viewport: { width: 380, height: 420 },
      screen: { width: 1920, height: 1080 },
    });
    try {
      const page = await context.newPage();
      const items = Array.from({ length: 30 }, (_, index) =>
        record(`long-${String(index).padStart(2, "0")}`, "daily", TODAY, {
          title: `${index + 1}. <img src=x onerror="window.widgetInjected=1"> ${"Uzun çalışma başlığı ve ayırt edici açıklama ".repeat(7)}`,
        }),
      );
      const before = await seed(page, items, { theme });
      await openWidget(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("#widget-tasks .widget-task")).toHaveCount(30);
      await expect(page.locator("#widget-today-count")).toHaveText("30");
      await expect(page.locator("#widget-task-count")).toHaveText("30 kayıt");
      await expect(page.locator("#widget-tasks img")).toHaveCount(0);
      expect(await page.evaluate(() => window.widgetInjected)).toBeUndefined();
      const geometry = () =>
        page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          width: innerWidth,
          height: innerHeight,
          listScroll: document.getElementById("widget-tasks").scrollTop,
          controls: [
            ".widget-header",
            "#widget-date",
            "[data-widget-day=today]",
            "[data-widget-day=tomorrow]",
            "[data-widget-day=overdue]",
            "#widget-pin",
            "#widget-open-main",
          ].map((selector) => {
            const rect = document
              .querySelector(selector)
              .getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
            };
          }),
        }));
      const initial = await geometry();
      await page.locator("#widget-tasks").evaluate((list) => {
        list.scrollTop = list.scrollHeight;
      });
      const scrolled = await geometry();
      expect(scrolled.width).toBe(380);
      expect(scrolled.height).toBe(420);
      expect(scrolled.documentWidth).toBeLessThanOrEqual(scrolled.width);
      expect(scrolled.documentHeight).toBeLessThanOrEqual(scrolled.height);
      expect(scrolled.listScroll).toBeGreaterThan(0);
      expect(scrolled.controls).toEqual(initial.controls);
      for (const rect of scrolled.controls) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.bottom).toBeLessThanOrEqual(420);
        expect(rect.x + rect.width).toBeLessThanOrEqual(380);
      }
      const last = page.locator(".widget-task-open").last();
      const lastId = await last.getAttribute("data-record-id");
      await last.focus();
      await page.evaluate(() =>
        window.dispatchEvent(new Event("odak:refresh")),
      );
      await expect(
        entry(page, lastId).locator(".widget-task-open"),
      ).toBeFocused();
      await expect(page.locator("#widget-open-main")).toBeVisible();
      expect(await saved(page)).toBe(before);
      expect(await page.evaluate(() => window.widgetPrimaryWrites)).toBe(0);
    } finally {
      await context.close();
    }
  }
});

test("unavailable storage clears stale agenda counts and recovers the selected day without changing saved data", async ({
  page,
}) => {
  const before = await seed(page, [
    record("read-today", "daily", TODAY),
    record("read-tomorrow", "waiting", null, { nextFollowUpDate: TOMORROW }),
  ]);
  await openWidget(page);
  await day(page, "tomorrow").click();
  await expect(entry(page, "read-tomorrow")).toBeVisible();
  await page.evaluate(() => {
    window.widgetReadFailure = true;
    window.dispatchEvent(new Event("odak:refresh"));
  });
  await expect(page.locator("#widget-status")).toContainText(
    "Kayıtlar okunamadı",
  );
  await expect(page.locator("#widget-today-count")).toHaveText("—");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("—");
  await expect(page.locator("#widget-overdue-count")).toHaveText("—");
  await expect(page.locator("#widget-tasks .widget-task")).toHaveCount(0);
  await expect(page.locator("#widget-open-main")).toBeEnabled();
  await page.evaluate(() => {
    window.widgetReadFailure = false;
    window.dispatchEvent(new Event("odak:refresh"));
  });
  await expect(page.locator("#widget-status")).toBeEmpty();
  await expect(day(page, "tomorrow")).toHaveAttribute("aria-pressed", "true");
  await expect(entry(page, "read-tomorrow")).toBeVisible();
  await expect(page.locator("#widget-task-count")).toHaveText("1 kayıt");
  await expect(page.locator("#widget-today-count")).toHaveText("1");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("1");
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate(() => window.widgetPrimaryWrites)).toBe(0);
});
