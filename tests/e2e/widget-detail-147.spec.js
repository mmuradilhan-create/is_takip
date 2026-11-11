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
