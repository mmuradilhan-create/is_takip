import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const SESSION = "is-takip-v1-work-session";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const day = (page, value) => page.locator(`[data-widget-day="${value}"]`);
const strip = (page) => page.locator("#widget-session");
const time = (page) => page.locator("#widget-session-time");
const make = (id, type = "daily", fields = {}) =>
  createRecord({
    id,
    type,
    title: `Gerçek kayıt ${id}`,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...fields,
  });
const current = (status = "running", fields = {}) =>
  JSON.stringify({
    version: 1,
    currentId: status === "finished" ? null : fields.recordId || "active",
    entries: [
      {
        recordId: "active",
        sessionId: "external-session",
        status,
        elapsedMs: 60_000,
        startedAt: status === "running" ? NOW.getTime() : null,
        ownerId: status === "running" ? "external-owner" : null,
        updatedAt: NOW.getTime(),
        ...fields,
      },
    ],
  });
const read = (page, key = KEY) =>
  page.evaluate((key) => localStorage.getItem(key), key);
const ids = (page) =>
  page
    .locator("#widget-tasks > .widget-task")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.id));

async function seed(
  context,
  records,
  { theme = "light", session = null } = {},
) {
  const raw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { theme, density: "compact" },
      history: [],
    },
  });
  await context.clock.install({ time: NOW });
  await context.clock.pauseAt(NOW);
  await context.addInitScript(
    ({ key, sessionKey, raw, session }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw);
        if (session !== null) localStorage.setItem(sessionKey, session);
      }
      window.widgetObservedWrites = 0;
      window.widgetSessionDenied = false;
      window.widgetResizeCalls = 0;
      const resize = window.resizeTo.bind(window);
      window.resizeTo = (...args) => {
        window.widgetResizeCalls++;
        resize(...args);
      };
      for (const method of ["setItem", "removeItem", "clear"]) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          if (
            this === window.localStorage &&
            (method === "clear" ||
              [key, sessionKey, `${key}-preferences`].includes(args[0]))
          )
            window.widgetObservedWrites++;
          return original.apply(this, args);
        };
      }
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function (...args) {
        if (
          this === window.localStorage &&
          args[0] === sessionKey &&
          window.widgetSessionDenied
        )
          throw new Error("Session storage unavailable");
        return get.apply(this, args);
      };
    },
    { key: KEY, sessionKey: SESSION, raw, session },
  );
  return raw;
}
async function peer(context) {
  const page = await context.newPage();
  await page.route("**/widget-observer.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Read-only test peer</title>",
    }),
  );
  await page.goto("/widget-observer.html");
  return page;
}
async function write(page, key, value) {
  await page.evaluate(
    ({ key, value }) =>
      value === null
        ? localStorage.removeItem(key)
        : localStorage.setItem(key, value),
    { key, value },
  );
}
async function open(page, hash = "widget") {
  await page.goto(`/#${hash}`);
  await expect(page.locator("#widget-open-main")).toBeVisible();
}
async function unchanged(page, raw) {
  expect(await read(page)).toBe(raw);
  expect(await page.evaluate(() => window.widgetObservedWrites)).toBe(0);
}

test("overdue is a distinct oldest-first view with actual saved dates and live changes leave today and tomorrow intact", async ({
  page,
  context,
}) => {
  const records = [
    make("ancient", "daily", { dueDate: "2025-12-15" }),
    make("oldest", "daily", { dueDate: "2026-11-01" }),
    make("waiting", "waiting", {
      dueDate: "2026-11-07",
      nextFollowUpDate: "2026-11-02",
    }),
    make("weekly", "weekly", { dueDate: "2026-11-03", periodKey: "2026-W45" }),
    make("today", "daily", { dueDate: "2026-11-07" }),
    make("tomorrow", "daily", { dueDate: "2026-11-08" }),
    make("closed", "daily", { dueDate: "2026-11-01", status: "completed" }),
    make("yearly", "yearly", { dueDate: "2026-11-01", periodKey: "2026" }),
    make("meeting", "meeting", { dueDate: "2026-11-01" }),
    make("waiting-date-only", "waiting", { dueDate: "2026-11-01" }),
  ];
  const raw = await seed(context, records);
  await open(page);
  await expect(page.locator("[data-widget-day]")).toHaveCount(3);
  await expect(page.locator("#widget-today-count")).toHaveText("1");
  await expect(page.locator("#widget-tomorrow-count")).toHaveText("1");
  await expect(page.locator("#widget-overdue-count")).toHaveText("4");
  await day(page, "tomorrow").focus();
  await page.keyboard.press("Tab");
  await expect(day(page, "overdue")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => ids(page))
    .toEqual(["ancient", "oldest", "waiting", "weekly"]);
  await expect(page.locator("#widget-date")).toHaveText("Gecikenler");
  await expect(page.locator("#widget-date")).not.toHaveAttribute("datetime");
  expect(
    await page
      .locator(".widget-entry-date")
      .evaluateAll((nodes) =>
        nodes.map((node) => [node.dateTime, node.textContent]),
      ),
  ).toEqual([
    ["2025-12-15", "15 Ara 2025"],
    ["2026-11-01", "1 Kas"],
    ["2026-11-02", "2 Kas"],
    ["2026-11-03", "3 Kas"],
  ]);
  await unchanged(page, raw);
  const other = await peer(context);
  const updated = JSON.stringify({
    ...JSON.parse(raw),
    records: records.map((record) =>
      record.id === "oldest" ? { ...record, status: "completed" } : record,
    ),
  });
  await write(other, KEY, updated);
  await expect.poll(() => ids(page)).toEqual(["ancient", "waiting", "weekly"]);
  await expect(day(page, "overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#widget-overdue-count")).toHaveText("3");
  await day(page, "today").click();
  await expect.poll(() => ids(page)).toEqual(["today"]);
  await day(page, "tomorrow").click();
  await expect.poll(() => ids(page)).toEqual(["tomorrow"]);
  await unchanged(page, updated);
});

test("pin capability is explicit and pinning changes only the title while selection, focus, flags and size remain intact", async ({
  page,
  context,
}) => {
  const raw = await seed(context, [
    make("old", "daily", { dueDate: "2026-11-01" }),
  ]);
  for (const [hash, tooltip] of [
    ["widget", "Üstte tut Windows paketiyle kullanılabilir."],
    [
      "widget?windowSizing=native",
      "Üstte tut için ODAK pencerelerini kapatıp güncel Windows paketini yeniden aç.",
    ],
    ["widget?windowPin=native", "Üstte tut Windows paketiyle kullanılabilir."],
  ]) {
    await open(page, hash);
    // Capability flags are read on document startup, not on a hash-only change.
    await page.reload();
    await expect(page.locator("#widget-pin")).toBeDisabled();
    await expect(page.locator("#widget-pin")).toHaveAttribute("title", tooltip);
  }
  await open(page, "widget?windowSizing=native&windowPin=native");
  await page.reload();
  const pin = page.locator("#widget-pin");
  await day(page, "overdue").click();
  const size = await page.evaluate(() => [innerWidth, innerHeight]);
  await expect(pin).toBeEnabled();
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(pin).toHaveAttribute("title", "Üstte tutmayı kapat");
  await expect(page).toHaveTitle("ODAK · Özet · Üstte");
  await page.keyboard.press("Escape");
  await expect(pin).toBeFocused();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await context.clock.runFor(3000);
  await expect(day(page, "overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(
    /#widget\?windowSizing=native&windowPin=native$/,
  );
  expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual(size);
  expect(await page.evaluate(() => window.widgetResizeCalls)).toBe(0);
  await pin.click();
  await expect(page).toHaveTitle("ODAK · Özet");
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await unchanged(page, raw);
});

test("the session strip follows timed and untimed work without showing a clock or owning another window's context", async ({
  page,
  context,
}) => {
  const records = [
    make("active", "daily", {
      dueDate: "2026-11-07",
      title: "Korunacak canlı çalışma",
    }),
  ];
  const session = current();
  const raw = await seed(context, records, { session });
  await open(page);
  const other = await peer(context);
  await expect(strip(page)).toHaveAttribute("data-phase", "running");
  await expect(page.locator("#widget-session-phase")).toHaveText("Çalışıyor");
  await expect(strip(page).locator("button,input,textarea,select")).toHaveCount(
    0,
  );
  await expect(page.locator("#widget-session-title")).toHaveText(
    records[0].title,
  );
  await expect(page.locator("#widget-session-title")).toHaveAttribute(
    "title",
    records[0].title,
  );
  await expect(time(page)).toBeHidden();
  await expect(time(page)).toHaveAttribute("aria-hidden", "true");
  await expect(strip(page).getByRole("timer")).toHaveCount(0);
  await context.clock.runFor(1000);
  await expect(time(page)).toBeHidden();
  expect(await read(other, SESSION)).toBe(session);
  const paused = current("paused", { elapsedMs: 90_000 });
  await write(other, SESSION, paused);
  await expect(strip(page)).toHaveAttribute("data-phase", "paused");
  await expect(page.locator("#widget-session-phase")).toHaveText(
    "Duraklatıldı",
  );
  await expect(time(page)).toBeHidden();
  await context.clock.runFor(5000);
  await expect(time(page)).toBeHidden();
  expect(await read(other, SESSION)).toBe(paused);
  const untimed = current("running", {
    trackTime: false,
    elapsedMs: 0,
    draftNote: "Yalnız çalışma notunda kalacak özel taslak",
  });
  await write(other, SESSION, untimed);
  await expect(strip(page)).toHaveAttribute("data-phase", "running");
  await expect(time(page)).toBeHidden();
  await expect(strip(page)).not.toContainText("özel taslak");
  await context.clock.runFor(2000);
  expect(await read(other, SESSION)).toBe(untimed);
  await write(
    other,
    KEY,
    JSON.stringify({
      ...JSON.parse(raw),
      records: [{ ...records[0], status: "completed" }],
    }),
  );
  await expect(strip(page)).not.toBeVisible();
  await write(other, KEY, raw);
  await write(other, SESSION, current("paused", { recordId: "missing" }));
  await expect(strip(page)).not.toBeVisible();
  await write(other, SESSION, current("finished"));
  await expect(strip(page)).not.toBeVisible();
  await write(other, SESSION, null);
  await expect(strip(page)).not.toBeVisible();
  await unchanged(page, raw);
});

test("malformed or denied optional session storage never hides agenda work or rewrites stored context", async ({
  page,
  context,
}) => {
  const session = current();
  const raw = await seed(
    context,
    [make("active", "daily", { dueDate: "2026-11-07" })],
    { session },
  );
  await open(page);
  const other = await peer(context);
  await expect(strip(page)).toBeVisible();
  await write(other, SESSION, "broken-session-json");
  await expect(strip(page)).not.toBeVisible();
  expect(await read(other, SESSION)).toBe("broken-session-json");
  await expect(page.locator("#widget-today-count")).toHaveText("1");
  await expect(page.locator("#widget-status")).toBeEmpty();
  await write(other, SESSION, session);
  await expect(strip(page)).toBeVisible();
  await page.evaluate(() => {
    window.widgetSessionDenied = true;
    window.dispatchEvent(new Event("odak:refresh"));
  });
  await expect(strip(page)).not.toBeVisible();
  await context.clock.runFor(2000);
  await expect(page.locator("#widget-tasks > .widget-task")).toHaveCount(1);
  await expect(page.locator("#widget-status")).toBeEmpty();
  expect(await read(other, SESSION)).toBe(session);
  await page.evaluate(() => {
    window.widgetSessionDenied = false;
    window.dispatchEvent(new Event("odak:refresh"));
  });
  await expect(strip(page)).toBeVisible();
  await unchanged(page, raw);
});

test("three tabs and untimed work fit 380 by 420 in both themes while refresh preserves agenda scroll and keyboard focus", async ({
  browser,
  baseURL,
}) => {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 380, height: 420 },
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
    });
    try {
      const records = [
        make("active", "daily", { dueDate: "2026-11-07" }),
        ...Array.from({ length: 25 }, (_, i) =>
          make(`late-${i}`, "daily", {
            dueDate: "2026-11-01",
            title: `${i}. ${"Uzun çalışma konusu ".repeat(9)}`,
          }),
        ),
      ];
      const session = current("running", { trackTime: false, elapsedMs: 0 });
      const raw = await seed(context, records, { theme, session });
      const page = await context.newPage();
      await open(page, "widget?windowSizing=native&windowPin=native");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await day(page, "overdue").click();
      await expect(strip(page)).toBeVisible();
      for (const selector of [
        ".widget-header",
        "#widget-pin",
        "[data-widget-day=today]",
        "[data-widget-day=tomorrow]",
        "[data-widget-day=overdue]",
        "#widget-session",
        "#widget-open-main",
      ])
        await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      const list = page.locator("#widget-tasks");
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const last = page.locator("#widget-tasks .widget-task-open").last();
      await last.focus();
      const scroll = await list.evaluate((element) => element.scrollTop);
      expect(scroll).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await expect(last).toBeFocused();
      await context.clock.runFor(1000);
      await expect(time(page)).toBeHidden();
      await expect(time(page)).toHaveAttribute("aria-hidden", "true");
      await expect(strip(page).getByRole("timer")).toHaveCount(0);
      await expect(last).toBeFocused();
      expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(
        scroll,
        0,
      );
      await expect(day(page, "overdue")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      expect(await read(page, SESSION)).toBe(session);
      await unchanged(page, raw);
    } finally {
      await context.close();
    }
  }
});
