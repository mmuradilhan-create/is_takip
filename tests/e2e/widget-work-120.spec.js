import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const sessions = async (page) => (await stored(page)).odak?.workSessions;

function records() {
  return [
    make({
      id: "later",
      title: "Sonraki hafta teslimi",
      dueDate: "2026-11-20",
    }),
    make({
      id: "today",
      title: "Bugün teslim edilecek iş",
      dueDate: "2026-11-08",
    }),
    make({ id: "running", title: "Devam eden iş", status: "in_progress" }),
    make({ id: "done", title: "Bitmiş iş", status: "completed" }),
    make({
      id: "goal",
      type: "weekly",
      title: "Haftalık hedef",
      periodKey: "2026-W45",
    }),
  ];
}

async function seed(context) {
  const raw = JSON.stringify({ version: 1, records: records() });
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw },
  );
  return raw;
}

async function openWidget(context) {
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.goto("/#widget");
  await expect(widget.locator(".widget-shell")).toHaveAttribute(
    "data-view",
    "work",
  );
  return widget;
}

const upcoming = (page) =>
  page
    .locator("#wb-upcoming-list .wb-row")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id));

test("the widget opens on work, starts next work, saves its note and finishes it into the journal with one undo step", async ({
  context,
}) => {
  const raw = await seed(context);
  const widget = await openWidget(context);
  await expect(widget.locator(".wb-idle")).toContainText(
    "Şu an çalışılan iş yok",
  );
  expect(await upcoming(widget)).toEqual(["running", "today", "later"]);
  await expect(widget.locator(".wb-row-due")).toHaveText(["Bugün", "20 Kas"]);
  // Opening and reading the widget never writes the workspace.
  expect(JSON.stringify(await stored(widget))).toBe(raw);

  await widget.locator('.wb-row[data-id="today"] [data-wb="start"]').click();
  await expect(widget.locator("#widget-workbench")).toHaveAttribute(
    "data-mode",
    "working",
  );
  await expect(widget.locator(".wb-phase")).toHaveText("Çalışıyor");
  await expect(widget.locator(".wb-title")).toHaveText(
    "Bugün teslim edilecek iş",
  );
  await expect(widget.locator("#widget-work-note")).toBeFocused();
  await expect(widget.locator(".wb-upcoming")).toBeHidden();
  await expect(
    widget.locator('.wb-heading-journal [data-wb="journal"]'),
  ).toHaveAttribute("data-id", "today");
  const note = widget.locator("#widget-work-note");
  await note.pressSequentially("İlk satır");
  await note.press("Enter");
  await note.press("Shift+Enter");
  await note.pressSequentially("İkinci satır");
  await expect
    .poll(async () => (await sessions(widget))?.entries?.[0]?.draftNote)
    .toBe("İlk satır\nİkinci satır");
  expect((await sessions(widget)).entries[0]).toMatchObject({
    recordId: "today",
    status: "running",
    trackTime: false,
  });

  await widget.keyboard.press("Control+p");
  await expect(widget.locator(".wb-phase")).toHaveText("Duraklatıldı");
  await expect(widget.locator('[data-wb="toggle"]')).toHaveText("Devam et");
  // 1.2.1: a paused work folds to a compact summary without its note field.
  await expect(widget.locator("#widget-workbench")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(note).toBeHidden();
  await expect(widget.locator('[data-wb="finish"]')).toBeVisible();
  // A paused work leaves room to pick another one.
  expect(await upcoming(widget)).toEqual(["running", "later"]);
  await widget.locator('[data-wb="toggle"]').click();
  await expect(widget.locator(".wb-phase")).toHaveText("Çalışıyor");
  await expect(note).toBeVisible();
  await expect(note).toBeFocused();

  await widget.keyboard.press("Control+Enter");
  await expect(widget.locator(".wb-phase")).toHaveText("Sonuç kaydı");
  await expect(widget.locator(".wb-note-label")).toHaveText(
    "Sonuç (isteğe bağlı)",
  );
  await expect(note).toHaveValue("İlk satır\nİkinci satır");
  await widget.locator('[data-wb="finish-cancel"]').click();
  await expect(widget.locator(".wb-phase")).toHaveText("Duraklatıldı");
  await widget.locator('[data-wb="finish"]').click();
  await note.fill("Teslim tamamlandı");
  await widget.locator('[data-wb="finish-save"]').click();
  await expect(widget.locator("#widget-workbench")).toHaveAttribute(
    "data-mode",
    "idle",
  );
  await expect(widget.locator("#widget-status")).toHaveText(
    "Sonuç çalışma geçmişine kaydedildi.",
  );
  await expect(widget.locator("#widget-status")).toHaveAttribute(
    "data-tone",
    "info",
  );
  const after = await stored(widget);
  const record = after.records.find((item) => item.id === "today");
  expect(record.status).toBe("planned");
  expect(record.workLog).toHaveLength(1);
  expect(record.workLog[0]).toMatchObject({
    date: "2026-11-08",
    note: "Teslim tamamlandı",
  });
  expect(after.odak.workSessions.currentId).toBeNull();
  expect(after.odak.history.map((entry) => entry.label)).toEqual([
    "İş günlüğü kaydı",
  ]);

  // The work journal is one click away in the widget too.
  const journal = widget.locator(
    '.wb-row[data-id="today"] [data-wb="journal"]',
  );
  await expect(journal).toHaveClass(/has-entries/);
  await expect(
    widget.locator('.wb-row[data-id="later"] [data-wb="journal"]'),
  ).not.toHaveClass(/has-entries/);
  await journal.click();
  const panel = widget.locator(".wb-journal");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".wb-journal-title")).toHaveText(
    "Bugün teslim edilecek iş",
  );
  await expect(panel.locator(".wb-journal-entry")).toHaveCount(1);
  await expect(panel.locator(".wb-journal-entry time")).toHaveText(
    "8 Kasım 2026",
  );
  await expect(panel.locator(".wb-journal-entry p")).toHaveText(
    "Teslim tamamlandı",
  );
  await expect(widget.locator(".wb-upcoming")).toBeHidden();
  await widget.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(widget.locator(".wb-upcoming")).toBeVisible();
  await widget.locator('.wb-row[data-id="later"] [data-wb="journal"]').click();
  await expect(panel.locator(".wb-journal-none")).toContainText(
    "Bu iş için kayıtlı çalışma yok.",
  );
  await panel.locator('[data-wb="journal-close"]').click();
  await expect(
    widget.locator('.wb-row[data-id="later"] [data-wb="journal"]'),
  ).toBeFocused();

  // The main window shows the saved entry and undoes it as one step.
  const main = await context.newPage();
  await main.goto("/");
  await main.locator('#nav [data-view="daily"]').click();
  await expect(
    main.locator('tr[data-id="today"] .work-journal-trigger'),
  ).toHaveClass(/has-entries/);
  await main
    .getByRole("button", { name: /Geri al/ })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await stored(main)).records.find((item) => item.id === "today").workLog
          ?.length ?? 0,
    )
    .toBe(0);
});

test("main window and widget share one note and never silently overwrite each other", async ({
  context,
}) => {
  await seed(context);
  const main = await context.newPage();
  await main.setViewportSize({ width: 1440, height: 900 });
  await main.goto("/");
  const widget = await openWidget(context);
  await main.locator('#nav [data-view="daily"]').click();
  await main.locator('tr[data-id="running"] .work-start').click();
  await main.locator("#work-session-note").fill("Ana pencereden not");
  await main.locator("#work-session-note").blur();
  await expect(widget.locator("#widget-work-note")).toHaveValue(
    "Ana pencereden not",
  );
  await expect(widget.locator(".wb-title")).toHaveText("Devam eden iş");

  await widget
    .locator("#widget-work-note")
    .fill("Ana pencereden not\nWidget'tan ekleme");
  await expect(main.locator("#work-session-note")).toHaveValue(
    "Ana pencereden not\nWidget'tan ekleme",
  );
  await widget.locator('[data-wb="toggle"]').click();
  await expect(main.locator(".sidebar-journal-phase")).toHaveText(
    "Duraklatıldı",
  );
  await widget.locator('[data-wb="toggle"]').click();
  await expect(main.locator(".sidebar-journal-phase")).toHaveText("Çalışıyor");

  // The main window saves while the widget holds a different local draft.
  await widget.locator("#widget-work-note").fill("Widget yerel taslak");
  await main.locator("#work-session-note").fill("Ana pencere kaydetti");
  await main.locator("#work-session-note").blur();
  await expect(widget.locator(".wb-conflict")).toBeVisible();
  await expect(widget.locator(".wb-error")).toHaveText(
    "Çalışma notu başka bir pencerede değişti. Yazdıkların korunuyor.",
  );
  await expect(widget.locator("#widget-work-note")).toHaveValue(
    "Widget yerel taslak",
  );
  expect((await sessions(main)).entries[0].draftNote).toBe(
    "Ana pencere kaydetti",
  );
  await widget.locator('[data-wb="use-current"]').click();
  await expect(widget.locator("#widget-work-note")).toHaveValue(
    "Ana pencere kaydetti",
  );
  await expect(widget.locator(".wb-conflict")).toBeHidden();
});

test("paused work resumes from the widget, the agenda stays one click away, and the work view fits 380 by 420", async ({
  context,
}) => {
  await seed(context);
  const widget = await openWidget(context);
  await widget.locator('.wb-row[data-id="later"] [data-wb="start"]').click();
  // A running work keeps the room for its note; pausing shows the next work.
  await expect(widget.locator(".wb-upcoming")).toBeHidden();
  // Leaving the note saves it; the same press must still pause the work.
  await widget.locator("#widget-work-note").fill("Kısa not");
  await widget.locator('[data-wb="toggle"]').click();
  await expect(widget.locator(".wb-phase")).toHaveText("Duraklatıldı");
  expect(
    (await sessions(widget)).entries.find(
      (entry) => entry.recordId === "later",
    ),
  ).toMatchObject({ status: "paused", draftNote: "Kısa not" });
  await widget.locator('.wb-row[data-id="today"] [data-wb="start"]').click();
  await expect(widget.locator(".wb-title")).toHaveText(
    "Bugün teslim edilecek iş",
  );
  const paused = widget.locator("#wb-paused-list .wb-row");
  await expect(paused).toHaveCount(1);
  await expect(paused).toHaveAttribute("data-id", "later");
  for (const control of [
    "#widget-work-note",
    '[data-wb="toggle"]',
    '[data-wb="finish"]',
    '#wb-paused-list [data-wb="resume"]',
    "#widget-open-main",
  ])
    await expect(widget.locator(control)).toBeInViewport({ ratio: 1 });
  expect(
    await widget.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);

  await paused.locator('[data-wb="resume"]').click();
  await expect(widget.locator(".wb-title")).toHaveText("Sonraki hafta teslimi");
  await expect(paused).toHaveAttribute("data-id", "today");
  const entries = (await sessions(widget)).entries;
  expect(
    Object.fromEntries(entries.map((entry) => [entry.recordId, entry.status])),
  ).toEqual({ later: "running", today: "paused" });

  const toggle = widget.locator("#widget-view-toggle");
  await toggle.click();
  await expect(widget.locator(".widget-shell")).toHaveAttribute(
    "data-view",
    "agenda",
  );
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(widget.locator(".widget-day-tabs")).toBeVisible();
  await expect(widget.locator("#widget-workbench")).toBeHidden();
  await toggle.click();
  await expect(widget.locator("#widget-workbench")).toBeVisible();
  await expect(widget.locator(".wb-title")).toHaveText("Sonraki hafta teslimi");
});

test("the mouse wheel scrolls next work wherever the pointer rests, including in a small paused widget", async ({
  context,
}) => {
  const many = Array.from({ length: 14 }, (_, index) =>
    make({ id: `job-${index}`, title: `Sıradaki iş numarası ${index + 1}` }),
  );
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records: many }) },
  );
  const widget = await openWidget(context);
  const list = widget.locator("#wb-upcoming-list");
  async function wheel(target) {
    const point = await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, innerHeight);
      return { x: rect.left + rect.width / 3, y: (top + bottom) / 2 };
    });
    await widget.mouse.move(point.x, point.y);
    await widget.mouse.wheel(0, 120);
  }
  await expect(list).toHaveCSS("overscroll-behavior-y", "auto");
  await wheel(list);
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBe(120);
  // A periodic refresh keeps the same rows and their scroll position.
  await widget.evaluate(() => window.dispatchEvent(new Event("odak:refresh")));
  await wheel(list);
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBe(240);
  for (const id of ["job-13", "job-12", "job-11", "job-10"]) {
    await widget.locator(`.wb-row[data-id="${id}"] [data-wb="start"]`).click();
    await widget.locator('[data-wb="toggle"]').click();
  }
  await widget.setViewportSize({ width: 340, height: 300 });
  const bench = widget.locator("#widget-workbench");
  expect(
    await bench.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await wheel(widget.locator(".wb-active"));
  await expect
    .poll(() => bench.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  // Nothing in the paused work view overlaps at this size.
  expect(
    await widget.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll(
          ".wb-heading, .wb-controls, .wb-paused, .wb-upcoming",
        ),
      ]
        .filter((element) => element.offsetParent)
        .map((element) => element.getBoundingClientRect());
      return boxes
        .slice(1)
        .every((box, index) => box.top >= boxes[index].bottom - 0.5);
    }),
  ).toBe(true);
});
