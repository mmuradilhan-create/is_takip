import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-11T09:00:00.000Z");
const STAMP = "2026-11-01T08:00:00.000Z";
const records = [
  createRecord({
    id: "late",
    title: "CİRİT VIR dokümanlarını incele",
    dueDate: "2026-11-09",
    priority: "urgent",
    description: "Revizyon B ile karşılaştır.\nÖzellikle bölüm 3.",
    workLog: [
      {
        id: "log-1",
        date: "2026-11-10",
        note: "Bölüm 1-2 bitti",
        startedAt: STAMP,
        endedAt: STAMP,
        durationMs: 0,
        createdAt: STAMP,
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "paused",
    title: "Kabuk gk kb rev ver",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
];
const odak = {
  version: 1,
  workSessions: {
    version: 1,
    currentId: null,
    entries: [
      {
        recordId: "paused",
        sessionId: "paused-session",
        status: "paused",
        elapsedMs: 0,
        startedAt: null,
        ownerId: null,
        updatedAt: Date.parse(STAMP),
        draftNote: "Revizyon notu yarım",
        trackTime: false,
      },
    ],
  },
};

async function openWidget(context) {
  await context.clock.setFixedTime(NOW);
  const raw = JSON.stringify({ version: 1, records, odak });
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw },
  );
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.goto("/#widget");
  return widget;
}

test("the title of the work in progress opens its details in the widget too", async ({
  context,
}) => {
  const widget = await openWidget(context);
  await widget.locator('[data-wb="resume"][data-id="paused"]').click();
  const title = widget.locator(".wb-active .wb-title");
  const detail = widget.locator("#wb-active-detail");
  await expect(title).toHaveText("Kabuk gk kb rev ver");
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await expect(detail).toBeHidden();
  await title.click();
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await expect(detail.locator(".wb-detail-facts")).toHaveText(
    /Teslim: Tarih yok\s*Normal/,
  );
  // The working note stays in its own box rather than repeating here.
  await expect(detail.locator(".wb-detail-note")).toHaveCount(0);
  await expect(widget.locator("#widget-work-note")).toHaveValue(
    "Revizyon notu yarım",
  );
  await expect(
    detail.getByRole("button", { name: "ODAK’ta düzenle" }),
  ).toBeVisible();
  await title.click();
  await expect(detail).toBeHidden();
  await expect(title).toHaveAttribute("aria-expanded", "false");
});

test("a widget work title opens its details in place and only the edit button goes to ODAK", async ({
  context,
}) => {
  await context.clock.setFixedTime(NOW);
  const raw = JSON.stringify({ version: 1, records, odak });
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw },
  );
  const main = await context.newPage();
  await main.goto("/#desktop");
  await expect(main.locator("#page-title")).toHaveText("Genel bakış");
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.goto("/#widget");
  const before = await widget.evaluate((key) => localStorage.getItem(key), KEY);

  const title = (id) => widget.locator(`.wb-row-title[data-id="${id}"]`);
  const detail = (id) => widget.locator(`#wb-detail-${id}`);
  await expect(title("late")).toHaveAttribute("aria-expanded", "false");
  await title("late").click();
  await expect(title("late")).toHaveAttribute("aria-expanded", "true");
  await expect(detail("late").locator(".wb-detail-facts")).toHaveText(
    /Teslim: 9 Kas \(gecikti\)\s*Acil/,
  );
  await expect(detail("late").locator(".wb-detail-text")).toHaveText(
    "Revizyon B ile karşılaştır.\nÖzellikle bölüm 3.",
  );
  await expect(detail("late").locator(".wb-detail-note")).toHaveText(
    "Son çalışma 10 Kas: Bölüm 1-2 bitti",
  );
  // Clicking the title does not open or change the main window.
  await expect(main.locator("#editor")).toBeHidden();

  // One row is open at a time; a paused row shows its working note.
  await title("paused").click();
  await expect(detail("late")).toHaveCount(0);
  await expect(detail("paused").locator(".wb-detail-note")).toHaveText(
    "Çalışma notu: Revizyon notu yarım",
  );
  await expect(detail("paused").locator(".wb-detail-facts")).toHaveText(
    /Teslim: Tarih yok\s*Normal/,
  );
  await title("paused").click();
  await expect(detail("paused")).toHaveCount(0);
  await expect(title("paused")).toHaveAttribute("aria-expanded", "false");
  expect(await widget.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );

  await title("late").click();
  await detail("late").getByRole("button", { name: "ODAK’ta düzenle" }).click();
  await expect(main.locator("#editor")).toBeVisible();
  await expect(main.locator('#record-form [name="title"]')).toHaveValue(
    "CİRİT VIR dokümanlarını incele",
  );
});

test("the open work detail stays above the note and buttons, running or paused", async ({
  context,
}) => {
  const widget = await openWidget(context);
  const below = (upper, lower) =>
    widget.evaluate(
      ([upper, lower]) =>
        document.querySelector(upper).getBoundingClientRect().bottom <=
        document.querySelector(lower).getBoundingClientRect().top + 0.5,
      [upper, lower],
    );
  const inside = (inner, outer) =>
    widget.evaluate(
      ([inner, outer]) => {
        const a = document.querySelector(inner).getBoundingClientRect();
        const b = document.querySelector(outer).getBoundingClientRect();
        return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
      },
      [inner, outer],
    );
  await widget.locator('[data-wb="start"][data-id="late"]').click();
  await widget.locator(".wb-active .wb-title").click();
  const detail = widget.locator("#wb-active-detail");
  await expect(detail.locator(".wb-detail-edit")).toBeVisible();
  // Running: description, last work and the edit button all sit in the box.
  expect(
    await inside("#wb-active-detail .wb-detail-edit", "#wb-active-detail"),
  ).toBe(true);
  expect(await below("#wb-active-detail", ".wb-note-field")).toBe(true);
  // Paused: the controls move up, still under the detail.
  await widget.locator('[data-wb="toggle"]').click();
  await expect(widget.locator(".wb-note-field")).toBeHidden();
  await expect(detail).toBeVisible();
  expect(
    await inside("#wb-active-detail .wb-detail-edit", "#wb-active-detail"),
  ).toBe(true);
  expect(await below("#wb-active-detail", ".wb-controls")).toBe(true);
});
