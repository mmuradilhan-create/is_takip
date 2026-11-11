import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

test("open, running and paused works in the sidebar card each open their own work journal", async ({
  page,
}) => {
  const records = [
    make({
      id: "journaled",
      title: "Geçmişi olan iş",
      workLog: [
        {
          id: "old-session",
          date: "2026-11-06",
          endedAt: "2026-11-06T12:00:00.000Z",
          durationMs: 0,
          note: "Önceki sonuç",
        },
      ],
    }),
    make({ id: "second", title: "İkinci iş" }),
    make({ id: "third", title: "Üçüncü iş" }),
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem("seeded", "1");
    },
    { key: KEY, value: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  for (const id of ["second", "third", "journaled"])
    await page.locator(`tr[data-id="${id}"] .work-start`).click();
  const card = page.locator("#sidebar-work-journal");
  const heading = card.locator(".work-session-heading .work-journal-trigger");
  await expect(heading).toHaveAttribute("data-id", "journaled");
  await expect(heading).toHaveClass(/has-entries/);
  const paused = card.locator(".work-paused-row .work-journal-trigger");
  await expect(paused).toHaveCount(2);
  expect(
    (
      await paused.evaluateAll((items) => items.map((item) => item.dataset.id))
    ).sort(),
  ).toEqual(["second", "third"]);
  for (const control of await paused.all())
    await expect(control).not.toHaveClass(/has-entries/);
  // The journal sits between the title and the resume control.
  expect(
    await card
      .locator('.work-paused-row[data-record-id="third"] button')
      .evaluateAll((items) => items.map((item) => item.dataset.action)),
  ).toEqual(["work-paused-open", "work-journal", "work-paused-resume"]);

  await heading.click();
  const dialog = page.locator("#work-journal-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Geçmişi olan iş");
  await expect(dialog).toContainText("Önceki sonuç");
  await dialog.locator(".close-modal").click();
  await expect(dialog).toBeHidden();

  // Reading a paused work keeps the running one reachable from its summary.
  await card
    .locator('.work-paused-row[data-record-id="second"] .work-paused-title')
    .click();
  const running = card.locator(
    "#work-running-summary:not([hidden]) .work-journal-trigger",
  );
  await expect(running).toHaveAttribute("data-id", "journaled");
  await expect(
    card.locator('#work-running-summary [data-action="work-running-open"]'),
  ).toHaveText("Çalışmaya dön");
  await expect(heading).toHaveAttribute("data-id", "second");
  await card
    .locator('.work-paused-row[data-record-id="third"] .work-journal-trigger')
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Üçüncü iş");
  await expect(card.locator("#work-session-note")).toBeVisible();
});
