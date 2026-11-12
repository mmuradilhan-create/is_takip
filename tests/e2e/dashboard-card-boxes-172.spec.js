import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-05T09:00:00.000Z";
const records = [
  createRecord({
    id: "wait-long",
    type: "waiting",
    title: "00358163, 00358162, 00357789 VE 00357778 sipariş durumu",
    status: "follow_up",
    expectedFrom: "Satın alma",
    sourceDate: "2026-07-16",
    nextFollowUpDate: "2026-11-09",
    lastFollowUpDate: "2026-08-03",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "wait-new",
    type: "waiting",
    title: "Denem",
    status: "planned",
    expectedFrom: "X",
    sourceDate: "2026-11-11",
    nextFollowUpDate: "2026-11-12",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "goal-plain",
    type: "weekly",
    title: "deneme",
    periodKey: "2026-W46",
    dueDate: "2026-11-12",
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
  createRecord({
    id: "goal-measured",
    type: "weekly",
    title: "Rapor hedefi",
    periodKey: "2026-W46",
    dueDate: "2026-11-15",
    targetValue: 7,
    currentValue: 2,
    createdAt: STAMP,
    updatedAt: STAMP,
  }),
];

async function open(page, viewport) {
  await page.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records }) },
  );
  await page.setViewportSize(viewport);
  await page.goto("/");
}

const rows = (card, selectors) =>
  card.evaluate(
    (element, selectors) =>
      selectors.map((selector) =>
        [...element.querySelector(selector).children].map((child) => {
          const box = child.getBoundingClientRect();
          const card = element.getBoundingClientRect();
          return {
            top: Math.round(box.top - card.top),
            bottom: Math.round(card.bottom - box.bottom),
            height: Math.round(box.height),
            width: Math.round(box.width),
          };
        }),
      ),
    selectors,
  );

const WAITING = [".followup-meta", ".dashboard-card-facts"];
const GOAL = [".dashboard-goal-meta-controls", ".dashboard-card-facts"];

for (const viewport of [
  { width: 1536, height: 800 },
  { width: 1280, height: 720 },
]) {
  test(`follow-up and goal cards show the list's four boxes, two per row, at ${viewport.width}px`, async ({
    page,
  }) => {
    await open(page, viewport);
    const waiting = page.locator('.followup-row[data-id="wait-long"]');
    const goal = page.locator(
      '.dashboard-goal-row[data-goal-id="goal-measured"]',
    );
    const plain = page.locator(
      '.dashboard-goal-row[data-goal-id="goal-plain"]',
    );
    await expect(waiting).toBeVisible();
    await expect(goal).toBeVisible();

    // Waiting: Durum · Sonraki takip / Son takip · Bekleme.
    await expect(
      waiting.locator(".followup-meta > .status-trigger"),
    ).toHaveText("Takipte");
    await expect(
      waiting.locator('.followup-meta [data-action="edit-next-followup"]'),
    ).toHaveText("9 Kas");
    await expect(
      waiting.locator(".dashboard-card-facts > *").first(),
    ).toHaveAttribute("data-action", "waiting-followup");
    await expect(waiting.locator(".waiting-last-date")).toHaveText("3 Ağu");
    await expect(
      waiting.locator(".dashboard-card-facts > *").last(),
    ).toHaveAttribute("data-action", "edit-waiting-start");
    await expect(waiting.locator(".waiting-age")).toHaveText("119 gün");
    // Goal: Durum · Teslim tarihi / Öncelik · İlerleme.
    await expect(
      goal.locator(".dashboard-goal-meta-controls > .status-trigger"),
    ).toHaveText("Yapılacak");
    await expect(
      goal.locator('.dashboard-goal-meta-controls [data-action="edit-date"]'),
    ).toHaveText("15 Kas");
    await expect(goal.locator(".dashboard-card-facts > *")).toHaveText([
      "Normal",
      "2 / 7",
    ]);
    await expect(
      goal.locator(
        '.dashboard-card-facts > [data-action="goal-progress-open"]',
      ),
    ).toHaveAttribute("title", /^%29 · /);
    await expect(
      plain.locator(
        '.dashboard-card-facts > [data-action="goal-progress-open"]',
      ),
    ).toHaveText("Ölçüm yok");
    // No separate button row: linked jobs are in the details.
    await expect(
      page.locator(
        '.dashboard-bottom-row :is([data-action="goal-children-open"], [data-action="waiting-children-open"])',
      ),
    ).toHaveCount(0);

    // Same rows, same two equal columns, same heights, in both cards.
    const waitingRows = await rows(waiting, WAITING);
    const goalRows = await rows(goal, GOAL);
    expect(goalRows).toEqual(waitingRows);
    for (const row of waitingRows) {
      expect(row).toHaveLength(2);
      expect(row[0].top).toBe(row[1].top);
      expect(row[0].height).toBe(30);
      expect(Math.abs(row[0].width - row[1].width)).toBeLessThanOrEqual(1);
    }
    // Across the two panels the rows sit on the same lines.
    const lines = async (card, selectors) =>
      Promise.all(
        selectors.map(async (selector) =>
          Math.round((await card.locator(selector).boundingBox()).y),
        ),
      );
    expect(await lines(goal, GOAL)).toEqual(await lines(waiting, WAITING));

    // Nothing in a box is cut off.
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".dashboard-bottom-row :is(.followup-meta, .dashboard-goal-meta-controls, .dashboard-card-facts) :is(.deadline-tag, .inline-priority, .waiting-start-date, .progress-chip, .waiting-last-date, .goal-progress-summary)",
        ),
      ]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent),
    );
    expect(clipped).toEqual([]);
  });
}

test("each card box takes the colours of the same box in its list", async ({
  page,
}) => {
  await open(page, { width: 1536, height: 800 });
  const look = (locator) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        style.backgroundColor,
        style.borderTopColor,
        style.color,
        style.borderRadius,
      ].join(" | ");
    });
  const waiting = page.locator('.followup-row[data-id="wait-long"]');
  const goal = page.locator(
    '.dashboard-goal-row[data-goal-id="goal-measured"]',
  );
  const card = {
    status: await look(waiting.locator(".status-trigger")),
    next: await look(waiting.locator('[data-action="edit-next-followup"]')),
    last: await look(waiting.locator('[data-action="waiting-followup"]')),
    age: await look(waiting.locator('[data-action="edit-waiting-start"]')),
    priority: await look(goal.locator('[data-action="edit-priority"]')),
    date: await look(goal.locator('[data-action="edit-date"]')),
    progress: await look(goal.locator('[data-action="goal-progress-open"]')),
  };
  await page.locator('#nav [data-view="waiting"]').click();
  const row = page.locator('.waiting-table tr[data-id="wait-long"]');
  expect({
    status: await look(row.locator(".status-trigger")),
    next: await look(row.locator('[data-action="edit-next-followup"]')),
    last: await look(row.locator('[data-action="waiting-followup"]')),
    age: await look(row.locator('[data-action="edit-waiting-start"]')),
  }).toEqual({
    status: card.status,
    next: card.next,
    last: card.last,
    age: card.age,
  });
  await page.locator('#nav [data-view="weekly"]').click();
  const goalRow = page.locator('.full-table tr[data-id="goal-measured"]');
  expect({
    priority: await look(goalRow.locator('[data-action="edit-priority"]')),
    date: await look(goalRow.locator('[data-action="edit-date"]')),
    progress: await look(goalRow.locator(".progress-chip")),
  }).toEqual({
    priority: card.priority,
    date: card.date,
    progress: card.progress,
  });
});
