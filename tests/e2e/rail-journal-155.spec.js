import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T08:00:00.000Z";

test("on the icon rail the work card opens from one button, closes on Escape and opens itself when work starts", async ({
  page,
}) => {
  const records = [
    createRecord({
      id: "paused",
      title: "Duraklatılan iş",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "next",
      title: "Sıradaki iş",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  const at = Date.parse("2026-11-11T08:00:00.000Z");
  const odak = {
    version: 1,
    workSessions: {
      version: 1,
      currentId: "paused",
      entries: [
        {
          recordId: "paused",
          sessionId: "paused-session",
          status: "paused",
          elapsedMs: 0,
          startedAt: null,
          ownerId: null,
          updatedAt: at,
          draftNote: "Yarım not",
          trackTime: false,
        },
      ],
    },
  };
  await page.clock.setFixedTime(new Date("2026-11-11T09:00:00.000Z"));
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records, odak }) },
  );
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  const toggle = page.getByRole("button", {
    name: "Çalışma notu",
    exact: true,
  });
  const card = page.locator("#sidebar-work-journal");
  await expect(toggle).toBeVisible();
  await expect(card).toBeHidden();
  await expect(sidebar).toHaveAttribute("data-rail-phase", "paused");

  await toggle.click();
  await expect(card).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const box = await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(64);
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(toggle).toBeFocused();

  // A press elsewhere closes it too.
  await toggle.click();
  await expect(card).toBeVisible();
  await page.locator("#page-title").click();
  await expect(card).toBeHidden();

  // Starting work brings the card into view.
  await page.locator('.focus-row[data-id="next"] .work-start').click();
  await expect(card).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-rail-phase", "running");

  // A wide window shows the full menu and its card as before.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).toBeHidden();
  await expect(card).toBeVisible();
});
