import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-01T08:00:00.000Z";

test("the work card's note box shows the text cursor, like every other typing field", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  const records = [
    createRecord({
      id: "job",
      title: "Dokümanları incele",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  await page.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({ version: 1, records }),
  );
  await page.goto("/");
  await page
    .locator('.focus-row[data-id="job"] [data-action="work-start"]')
    .click();
  const note = page.locator("#work-session-note");
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS("cursor", "text");
  // The card's own surface keeps the arrow.
  await expect(page.locator("#sidebar-work-journal")).toHaveCSS(
    "cursor",
    "default",
  );
  const wrong = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'textarea, input:is([type="text"], [type="search"], [type="number"], :not([type]))',
      ),
    ]
      .filter((field) => field.getClientRects().length && !field.disabled)
      .filter((field) => getComputedStyle(field).cursor !== "text")
      .map((field) => field.id || field.name || field.className),
  );
  expect(wrong).toEqual([]);
});
