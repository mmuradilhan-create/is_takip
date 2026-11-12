import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T08:00:00.000Z";
const weekly = (id, input) =>
  createRecord({
    id,
    type: "weekly",
    periodKey: "2026-W46",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const records = [
  weekly("measured", {
    title: "Rapor hedefi",
    targetValue: 7,
    currentValue: 0,
  }),
  weekly("linked", { title: "Bağlı işlerle ölçülen" }),
  createRecord({
    id: "step",
    title: "Bağlı iş",
    parentId: "linked",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  weekly("closed", {
    title: "Tamamlanmış ölçüm",
    targetValue: 3,
    currentValue: 3,
    status: "completed",
  }),
];
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

test("only a measured open goal gets − and + inside its progress box, each press one undo step", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-11T09:00:00.000Z"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="weekly"]').click();
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  const row = (id) => page.locator(`tr[data-id="${id}"]`);
  const steps = (id) => row(id).locator(".progress-step");
  await expect(steps("measured")).toHaveCount(2);
  await expect(steps("linked")).toHaveCount(0);
  await expect(steps("closed")).toHaveCount(0);

  const minus = row("measured").getByRole("button", {
    name: "Rapor hedefi: İlerlemeyi 1 azalt",
  });
  const plus = row("measured").getByRole("button", {
    name: "Rapor hedefi: İlerlemeyi 1 artır",
  });
  // Hidden until the row is pointed at, and − cannot go below zero.
  await expect(plus).toHaveCSS("opacity", "0");
  await row("measured").hover();
  await expect(plus).toHaveCSS("opacity", "1");
  await expect(minus).toBeDisabled();
  // They sit inside the box's own edges, so the column keeps its width.
  const chip = await row("measured").locator(".progress-chip").boundingBox();
  for (const step of [minus, plus]) {
    const edge = await step.boundingBox();
    expect(edge.x).toBeGreaterThanOrEqual(chip.x);
    expect(edge.x + edge.width).toBeLessThanOrEqual(chip.x + chip.width);
  }

  await plus.click();
  await plus.click();
  const summary = row("measured").locator(".goal-progress-summary");
  await expect(summary).toHaveText("2 / 7");
  await expect(row("measured").locator(".progress-chip")).toHaveAttribute(
    "aria-valuenow",
    "29",
  );
  await expect(plus).toBeFocused();
  // The press changes only the count; the row does not open the goal.
  await expect(page.locator("#goal-detail-panel")).toBeHidden();
  let saved = await stored(page);
  expect(
    saved.records.find((item) => item.id === "measured").currentValue,
  ).toBe(2);
  expect(saved.odak.history.map((entry) => entry.label)).toEqual([
    "Hedef ilerlemesi",
    "Hedef ilerlemesi",
  ]);
  await minus.click();
  await expect(summary).toHaveText("1 / 7");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(summary).toHaveText("2 / 7");
  saved = await stored(page);
  expect(
    saved.records.find((item) => item.id === "measured").currentValue,
  ).toBe(2);
});
