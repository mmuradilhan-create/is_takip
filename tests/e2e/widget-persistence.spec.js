import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { showAgenda } from "./widget-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const WORK_AREA = { width: 1920, height: 1040, left: 0, top: 0 };

// Keep the emulated monitor independent of the popup's compact viewport.
test.use({ screen: { width: 1920, height: 1080 } });

function fixtureRecords() {
  return [
    createRecord({
      id: "widget-persistent-urgent",
      title: "Öncelikli günlük iş",
      status: "in_progress",
      priority: "urgent",
      dueDate: "2026-11-07",
    }),
    createRecord({
      id: "widget-persistent-next",
      title: "Takip edilecek günlük iş",
      priority: "high",
      dueDate: "2026-11-07",
    }),
    createRecord({
      id: "widget-persistent-third",
      type: "waiting",
      title: "Bugünün dış yanıt takibi",
      priority: "normal",
      nextFollowUpDate: "2026-11-07",
      sourceDate: "2026-11-01",
    }),
    createRecord({
      id: "widget-persistent-tomorrow",
      title: "Yarının günlük teslimi",
      dueDate: "2026-11-08",
    }),
  ];
}

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, records }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ version: 1, records }));
      }
    },
    { key: KEY, records: fixtureRecords() },
  );
});

async function openWidget(main) {
  const opening = main.waitForEvent("popup");
  await main.getByRole("button", { name: "Widget aç", exact: true }).click();
  const widget = await opening;
  await expect(widget.locator("#widget-open-main")).toBeVisible();
  await showAgenda(widget);
  return widget;
}

async function expectCompactWindow(widget) {
  await expect
    .poll(() =>
      widget.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    )
    .toEqual({ width: 380, height: 420 });
  const geometry = await widget.evaluate(() => ({
    viewportHeight: innerHeight,
    contentHeight: document
      .querySelector(".widget-shell")
      .getBoundingClientRect().height,
    buttonBottom: document
      .getElementById("widget-open-main")
      .getBoundingClientRect().bottom,
  }));
  expect(geometry.contentHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight);
}

test("the desktop toolbar opens a separate small widget and preserves the main window", async ({
  page: main,
  context,
}) => {
  await main.goto("/#desktop");
  await main.locator('#nav [data-view="waiting"]').click();
  await main.locator("#global-search").fill("Korunacak arama");
  const originalUrl = main.url();
  const originalViewport = await main.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const before = await main.evaluate((key) => localStorage.getItem(key), KEY);
  const widget = await openWidget(main);

  await expect(main).toHaveURL(originalUrl);
  await expect(main.locator("#page-title")).toHaveText("Bekleyen konular");
  await expect(main.locator("#global-search")).toHaveValue("Korunacak arama");
  expect(main.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(2);
  await expectCompactWindow(widget);

  await main.getByRole("button", { name: "Widget aç", exact: true }).click();
  expect(context.pages()).toHaveLength(2);
  expect(widget.isClosed()).toBe(false);
  await expectCompactWindow(widget);

  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  await expect(widget.locator("#widget-open-main")).toBeEnabled();
  await expect(main.locator("#page-title")).toHaveText("Bekleyen konular");
  await expect(main.locator("#global-search")).toHaveValue("Korunacak arama");
  expect(context.pages()).toHaveLength(2);
  expect(widget.isClosed()).toBe(false);
  await expectCompactWindow(widget);
  expect(await main.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
  expect(
    await main.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  ).toEqual(originalViewport);
});

test("a widget survives main closure and opens a separate main without becoming it", async ({
  page: main,
  context,
}) => {
  await main.goto("/#desktop");
  const widget = await openWidget(main);
  const widgetUrl = widget.url();
  await main.close();
  expect(widget.isClosed()).toBe(false);
  await expect(widget.locator("#widget-today-count")).toHaveText("3");
  await widget.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key));
    store.records[0].status = "completed";
    localStorage.setItem(key, JSON.stringify(store));
  }, KEY);
  await expect(widget.locator("#widget-today-count")).toHaveText("2");
  const before = await widget.evaluate((key) => localStorage.getItem(key), KEY);

  const workArea = await widget.evaluate((area) => {
    // Headless Chrome reports the resized popup as its own screen. Model a
    // desktop monitor with a taskbar separately from the 380×420 widget.
    for (const [property, value] of Object.entries({
      availWidth: area.width,
      availHeight: area.height,
      availLeft: area.left,
      availTop: area.top,
    }))
      Object.defineProperty(screen, property, { configurable: true, value });
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
  }, WORK_AREA);
  expect(workArea).toEqual(WORK_AREA);

  const openingMain = widget.waitForEvent("popup");
  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  const reopened = await openingMain;
  await expect(reopened.locator("#page-title")).toHaveText("Genel bakış");
  await expect(reopened).toHaveURL(/#desktop$/);
  expect(reopened.isClosed()).toBe(false);
  expect(widget.isClosed()).toBe(false);
  await expect(widget).toHaveURL(widgetUrl);
  await expectCompactWindow(widget);
  expect(context.pages()).toHaveLength(2);
  const requests = await widget.evaluate(() => window.mainWindowRequests);
  expect(requests).toHaveLength(1);
  const requested = new URLSearchParams(requests[0].replaceAll(",", "&"));
  // The main window asks for the recommended 1440x900, centered in the area.
  expect(
    Object.fromEntries(
      ["width", "height", "left", "top"].map((key) => [
        key,
        Number(requested.get(key)),
      ]),
    ),
  ).toEqual({ width: 1440, height: 900, left: 232, top: 30 });
  await expect
    .poll(async () => {
      const size = await reopened.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      return size.width > 380 && size.height > 420;
    })
    .toBe(true);
  const mainViewport = await reopened.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  // Chrome may reserve window borders when clamping to the monitor work area.
  expect(mainViewport.width).toBeLessThanOrEqual(workArea.width);
  expect(mainViewport.height).toBeLessThanOrEqual(workArea.height);

  await widget.getByRole("button", { name: "ODAK’ı aç", exact: true }).click();
  await expect(widget.locator("#widget-open-main")).toBeEnabled();
  expect(context.pages()).toHaveLength(2);
  expect(await widget.evaluate(() => window.mainWindowRequests)).toHaveLength(
    1,
  );
  expect(
    await reopened.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  ).toEqual(mainViewport);
  await expectCompactWindow(widget);
  expect(await widget.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
});

test("a widget task opens its record in a separate main and leaves the small widget running", async ({
  page: source,
  context,
}) => {
  await source.goto("/#desktop");
  const widget = await openWidget(source);
  await source.close();
  const openingMain = widget.waitForEvent("popup");
  await widget.locator('[data-record-id="widget-persistent-urgent"]').click();
  const main = await openingMain;
  await expect(main).toHaveURL(/#desktop\?record=widget-persistent-urgent$/);
  await expect(main.locator("#editor")).toBeVisible();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    "Öncelikli günlük iş",
  );
  await expect(widget).toHaveURL(/#widget$/);
  expect(widget.isClosed()).toBe(false);
  expect(context.pages()).toHaveLength(2);
  await expectCompactWindow(widget);

  await main.locator('#editor [data-action="close"]').first().click();
  await widget.locator('[data-record-id="widget-persistent-next"]').click();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    "Takip edilecek günlük iş",
  );
  expect(context.pages()).toHaveLength(2);
  expect(widget.isClosed()).toBe(false);
  await expectCompactWindow(widget);
});

async function sizingContext(browser, baseURL) {
  const context = await browser.newContext({
    baseURL,
    viewport: null,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  await context.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await context.clock.pauseAt(NOW);
  await context.addInitScript(
    ({ key, records }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify({ version: 1, records }));
      window.widgetResizeRequests = [];
      window.widgetFocusCalls = 0;
      const resize = window.resizeTo.bind(window);
      window.manualWindowResize = (width, height) => resize(width, height);
      window.resizeTo = (width, height) => {
        window.widgetResizeRequests.push({ width, height });
        resize(width, height);
      };
      const focus = window.focus.bind(window);
      window.focus = () => {
        window.widgetFocusCalls++;
        focus();
      };
    },
    { key: KEY, records: fixtureRecords() },
  );
  return context;
}

async function clockedPopup(owner, context, activate) {
  let popup;
  let advanced = 0;
  const observe = (next) => {
    popup = next;
  };
  owner.on("popup", observe);
  try {
    await activate();
    await expect
      .poll(
        async () => {
          if (!popup && advanced < 2000) {
            await context.clock.runFor(200);
            advanced += 200;
          }
          return Boolean(popup);
        },
        { timeout: 5000, intervals: [0, 25, 50, 100] },
      )
      .toBe(true);
    return popup;
  } finally {
    owner.off("popup", observe);
  }
}

async function openClockedWidget(main, context) {
  const widget = await clockedPopup(main, context, () =>
    main.getByRole("button", { name: "Widget aç", exact: true }).click(),
  );
  await expect(widget.locator("#widget-open-main")).toBeVisible();
  // No click here: the first user interaction ends the one-time sizing.
  return widget;
}

async function manualWindowSize(widget) {
  await widget.evaluate(() => window.manualWindowResize(640, 560));
  await expect
    .poll(() => widget.evaluate(() => innerWidth > 380 && innerHeight > 420))
    .toBe(true);
  return widget.evaluate(() => ({ width: innerWidth, height: innerHeight }));
}

async function expectReusedSize(main, widget, context, manual) {
  const previousFocus = await widget.evaluate(() => window.widgetFocusCalls);
  await main.getByRole("button", { name: "Widget aç", exact: true }).click();
  await context.clock.runFor(300);
  await expect
    .poll(() => widget.evaluate(() => window.widgetFocusCalls))
    .toBeGreaterThan(previousFocus);
  expect(context.pages()).toHaveLength(2);
  expect(
    await widget.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  ).toEqual(manual);
}

test("plain HTML sizes a widget once and preserves an early manual resize through focus and main reload", async ({
  browser,
  baseURL,
}) => {
  const context = await sizingContext(browser, baseURL);
  try {
    const main = await context.newPage();
    await main.goto("/#desktop");
    await expect(main.locator("#page-title")).toHaveText("Genel bakış");
    const mainViewport = await main.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const before = await main.evaluate((key) => localStorage.getItem(key), KEY);
    const opening = main.waitForEvent("popup");
    // Start with a deliberately different browser frame so the single fallback
    // attempt is observable independently of the native Windows helper.
    await main.evaluate(() => {
      window.open(
        "/#widget",
        "plain-widget-sizing-test",
        "popup=yes,width=900,height=700,resizable=yes,scrollbars=yes",
      );
    });
    const widget = await opening;
    await expect(widget.locator("#widget-open-main")).toBeVisible();
    await expect(widget).toHaveURL(/#widget$/);
    expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    await context.clock.runFor(199);
    expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    await context.clock.runFor(1);
    await expectCompactWindow(widget);
    expect(
      await widget.evaluate(() => window.widgetResizeRequests),
    ).toHaveLength(1);

    await context.clock.runFor(450);
    const manual = await manualWindowSize(widget);
    await context.clock.runFor(3000);
    expect(
      await widget.evaluate(() => window.widgetResizeRequests),
    ).toHaveLength(1);
    expect(
      await widget.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    ).toEqual(manual);
    await expectReusedSize(main, widget, context, manual);
    await main.reload();
    await expect(main.locator("#page-title")).toHaveText("Genel bakış");
    await expectReusedSize(main, widget, context, manual);
    expect(
      await widget.evaluate(() => window.widgetResizeRequests),
    ).toHaveLength(1);
    expect(await main.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      before,
    );
    expect(
      await main.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    ).toEqual(mainViewport);

    await widget.close();
    const fresh = await openClockedWidget(main, context);
    await context.clock.runFor(250);
    await expect(fresh).toHaveURL(/#widget$/);
    await expectCompactWindow(fresh);
    expect(context.pages()).toHaveLength(2);
    expect(await fresh.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      before,
    );
  } finally {
    await context.close();
  }
});

test("native sizing stays the only owner while widget and record routes retain the marker and reuse manual geometry", async ({
  browser,
  baseURL,
}) => {
  const context = await sizingContext(browser, baseURL);
  try {
    const main = await context.newPage();
    await main.goto("/#desktop?windowSizing=native&windowPin=native");
    await expect(main.locator("#page-title")).toHaveText("Genel bakış");
    const before = await main.evaluate((key) => localStorage.getItem(key), KEY);
    const widget = await openClockedWidget(main, context);
    await expect(widget).toHaveURL(
      /#widget\?windowSizing=native&windowPin=native$/,
    );
    await expect(widget.locator("#widget-pin")).toBeEnabled();
    await widget.locator("#widget-pin").click();
    await expect(widget).toHaveTitle("ODAK · Özet · Üstte");
    await context.clock.runFor(650);
    expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    const manual = await manualWindowSize(widget);
    await context.clock.runFor(3000);
    await expectReusedSize(main, widget, context, manual);
    await main.reload();
    await expect(main.locator("#page-title")).toHaveText("Genel bakış");
    await expectReusedSize(main, widget, context, manual);
    expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    expect(await main.evaluate(() => window.widgetResizeRequests)).toEqual([]);

    await main.close();
    await showAgenda(widget);
    const reopened = await clockedPopup(widget, context, () =>
      widget.locator('[data-record-id="widget-persistent-urgent"]').click(),
    );
    await expect(reopened).toHaveURL(
      /#desktop\?record=widget-persistent-urgent&windowSizing=native&windowPin=native$/,
    );
    await expect(reopened.locator('#record-form [name="title"]')).toHaveValue(
      "Öncelikli günlük iş",
    );
    await reopened.locator('#editor [data-action="close"]').first().click();
    await expectReusedSize(reopened, widget, context, manual);
    expect(await widget.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    expect(
      await reopened.evaluate((key) => localStorage.getItem(key), KEY),
    ).toBe(before);

    await widget.close();
    const fresh = await openClockedWidget(reopened, context);
    await expect(fresh).toHaveURL(
      /#widget\?windowSizing=native&windowPin=native$/,
    );
    await context.clock.runFor(3000);
    expect(await fresh.evaluate(() => window.widgetResizeRequests)).toEqual([]);
    expect(await reopened.evaluate(() => window.widgetResizeRequests)).toEqual(
      [],
    );
    expect(context.pages()).toHaveLength(2);
    expect(await fresh.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      before,
    );
  } finally {
    await context.close();
  }
});

test("new widgets retain the CSS content target at common desktop display scale factors", async ({
  browser,
  baseURL,
}) => {
  for (const scale of [1, 1.25, 1.5, 2]) {
    const scaled = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
      screen: { width: 1920, height: 1080 },
      deviceScaleFactor: scale,
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
    });
    try {
      await scaled.clock.setFixedTime(NOW);
      await scaled.addInitScript(
        ({ key, records }) => {
          if (localStorage.getItem(key) === null)
            localStorage.setItem(key, JSON.stringify({ version: 1, records }));
        },
        { key: KEY, records: fixtureRecords() },
      );
      const main = await scaled.newPage();
      await main.goto("/#desktop");
      const mainViewport = await main.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      const before = await main.evaluate(
        (key) => localStorage.getItem(key),
        KEY,
      );
      const widget = await openWidget(main);
      await expectCompactWindow(widget);
      expect(await widget.evaluate(() => devicePixelRatio)).toBe(scale);
      expect(
        await main.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      ).toEqual(mainViewport);
      expect(
        await widget.evaluate((key) => localStorage.getItem(key), KEY),
      ).toBe(before);
    } finally {
      await scaled.close();
    }
  }
});
