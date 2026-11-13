import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-05T09:00:00.000Z";
const TODAY = "2026-11-13";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const records = [
  make({ id: "job-today", title: "Bugünkü iş", dueDate: TODAY }),
  make({ id: "job-soon", title: "Yakın iş", dueDate: "2026-11-15" }),
  make({ id: "job-late", title: "Geciken iş", dueDate: "2026-11-10" }),
  make({
    id: "goal-today",
    type: "weekly",
    title: "Bugünkü hedef",
    periodKey: "2026-W46",
    dueDate: TODAY,
  }),
  make({
    id: "topic-today",
    type: "waiting",
    title: "Bugünkü takip",
    status: "follow_up",
    expectedFrom: "Tedarikçi",
    sourceDate: "2026-11-01",
    nextFollowUpDate: TODAY,
  }),
  make({
    id: "topic-soon",
    type: "waiting",
    title: "Yakın takip",
    status: "follow_up",
    expectedFrom: "Tedarikçi",
    sourceDate: "2026-11-01",
    nextFollowUpDate: "2026-11-15",
  }),
];
const FILLED = "rgb(243, 197, 107)";
const LIGHT = "rgb(255, 241, 215)";

async function open(page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T09:00:00.000Z`));
  await page.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({ version: 1, records }),
  );
  await page.setViewportSize({ width: 1536, height: 860 });
  await page.goto("/");
}

const look = (locator) =>
  locator.evaluate((element) => ({
    text: element.textContent.trim(),
    background: getComputedStyle(element).backgroundColor,
    icon:
      element.querySelector("svg")?.dataset.deadlineIcon ||
      element.querySelector("svg")?.dataset.followupIcon ||
      "",
  }));

test("a date that falls today is a filled amber box with a target everywhere, and still shows the date", async ({
  page,
}) => {
  await open(page);
  // Overview: current work and both card panels.
  expect(
    await look(page.locator('.focus-row[data-id="job-today"] .deadline-tag')),
  ).toEqual({ text: "13 Kas", background: FILLED, icon: "today" });
  expect(
    await look(page.locator('.focus-row[data-id="job-soon"] .deadline-tag')),
  ).toEqual({ text: "15 Kas", background: LIGHT, icon: "clock" });
  expect(
    (
      await look(
        page.locator(
          '.dashboard-goal-row[data-goal-id="goal-today"] [data-action="edit-date"]',
        ),
      )
    ).background,
  ).toBe(FILLED);
  expect(
    (
      await look(
        page.locator(
          '.followup-row[data-id="topic-today"] [data-action="edit-next-followup"]',
        ),
      )
    ).background,
  ).toBe(FILLED);
  // Lists: daily jobs, weekly goals and waiting topics.
  await page.locator('#nav [data-view="daily"]').click();
  expect(
    await look(page.locator('tr[data-id="job-today"] .deadline-tag')),
  ).toEqual({ text: "13 Kas", background: FILLED, icon: "today" });
  await expect(
    page.locator('tr[data-id="job-today"] .deadline-tag'),
  ).toHaveAttribute("title", /Bugün teslim/);
  expect(
    (await look(page.locator('tr[data-id="job-late"] .deadline-tag'))).icon,
  ).toBe("warning");
  await page.locator('#nav [data-view="weekly"]').click();
  expect(
    await look(page.locator('tr[data-id="goal-today"] .deadline-tag')),
  ).toEqual({ text: "13 Kas", background: FILLED, icon: "today" });
  await page.locator('#nav [data-view="waiting"]').click();
  expect(
    await look(
      page.locator(
        'tr[data-id="topic-today"] [data-action="edit-next-followup"]',
      ),
    ),
  ).toEqual({ text: "13 Kas", background: FILLED, icon: "today" });
  expect(
    await look(
      page.locator(
        'tr[data-id="topic-soon"] [data-action="edit-next-followup"]',
      ),
    ),
  ).toEqual({ text: "15 Kas", background: LIGHT, icon: "soon" });
  // Dark theme keeps the same distinction.
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  expect(
    (
      await look(
        page.locator(
          'tr[data-id="topic-today"] [data-action="edit-next-followup"]',
        ),
      )
    ).background,
  ).toBe("rgb(122, 90, 31)");
});

test("the widget marks today's work with the same filled amber", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(`${TODAY}T09:00:00.000Z`));
  await page.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({ version: 1, records }),
  );
  await page.setViewportSize({ width: 380, height: 520 });
  await page.goto("/#widget");
  const due = page.locator('.wb-row[data-id="job-today"] .wb-row-due');
  await expect(due).toHaveText("Bugün");
  await expect(due).toHaveCSS("background-color", FILLED);
});
