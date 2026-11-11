import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const log = (date) => [
  {
    id: `log-${date}`,
    date,
    note: "Arandı",
    createdAt: `${date}T09:00:00.000Z`,
  },
];

async function seed(page, records) {
  const original = JSON.stringify({ version: 1, records });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, original }) => localStorage.setItem(key, original),
    { key: KEY, original },
  );
  await page.goto("/");
  return original;
}

const row = (page, id) => page.locator(`.waiting-table tr[data-id="${id}"]`);

test("waiting rows keep edit and plus in the action column and put the follow-up control beside the last follow-up date", async ({
  page,
}) => {
  const original = await seed(page, [
    make({
      id: "followed",
      type: "waiting",
      title: "Takibi olan konu",
      status: "waiting_response",
      lastFollowUpDate: "2026-11-03",
      followUpLog: log("2026-11-03"),
    }),
    make({
      id: "fresh",
      type: "waiting",
      title: "Hiç takip edilmemiş konu",
      status: "waiting_response",
    }),
    make({
      id: "closed",
      type: "waiting",
      title: "Kapanmış konu",
      status: "completed",
      lastFollowUpDate: "2026-10-20",
      followUpLog: log("2026-10-20"),
    }),
  ]);
  await page.locator('#nav [data-view="waiting"]').click();
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  for (const id of ["followed", "fresh", "closed"]) {
    expect(
      await row(page, id)
        .locator(".row-end-actions > *")
        .evaluateAll((items) => items.map((item) => item.dataset.action)),
    ).toEqual(["edit", "waiting-create-daily"]);
    await expect(
      row(page, id).locator(".row-end-actions .waiting-followup-trigger"),
    ).toHaveCount(0);
  }
  const cell = (id) => row(page, id).locator("td.waiting-last-col");
  await expect(cell("followed").locator(".waiting-last-date")).toHaveText(
    "3 Kas",
  );
  await expect(cell("fresh").locator(".waiting-last-date")).toHaveText(
    "Takip yok",
  );
  for (const [id, label] of [
    ["followed", "Takibi olan konu: takip ettim"],
    ["fresh", "Hiç takip edilmemiş konu: takip ettim"],
    ["closed", "Kapanmış konu: takip geçmişi"],
  ]) {
    const control = cell(id).locator(".waiting-followup-trigger");
    await expect(control).toHaveAttribute("aria-label", label);
    const geometry = await cell(id).evaluate((td) => {
      const date = td
        .querySelector(".waiting-last-date")
        .getBoundingClientRect();
      const button = td
        .querySelector(".waiting-followup-trigger")
        .getBoundingClientRect();
      return {
        gap: button.left - date.right,
        size: [button.width, button.height],
        middle: Math.abs(
          button.top + button.height / 2 - (date.top + date.height / 2),
        ),
        inside: button.right <= td.getBoundingClientRect().right + 0.5,
      };
    });
    expect(geometry.gap).toBeGreaterThanOrEqual(4);
    expect(geometry.size).toEqual([30, 30]);
    expect(geometry.middle).toBeLessThanOrEqual(2);
    expect(geometry.inside).toBe(true);
  }
  // 1.1.2: one fixed control format, like the daily and goal lists.
  const lefts = await page
    .locator(".waiting-last-cell > .waiting-followup-trigger")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().left),
    );
  expect(new Set(lefts.map(Math.round)).size).toBe(1);
  const controls = await page
    .locator(
      ".waiting-table tbody td > .status-trigger, .waiting-table tbody td.waiting-next-col > .deadline-tag",
    )
    .evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }),
    );
  expect(controls).toHaveLength(6);
  expect(new Set(controls)).toEqual(new Set(["112x30"]));
  await expect(
    cell("closed").locator(".waiting-followup-trigger svg path"),
  ).toHaveAttribute("d", "M3 11a9 9 0 1 1 2.7 6.4M3 4v7h7M12 7v5l3 2");
  await cell("followed").locator(".waiting-followup-trigger").click();
  await expect(page.locator("#waiting-followup-dialog")).toBeVisible();
  expect(await saved(page)).toBe(original);
});

test("a short note preview closes as soon as the pointer leaves, like connection bubbles", async ({
  page,
}) => {
  await seed(page, [
    make({ id: "goal", type: "weekly", title: "Mekanizma komplesi yayını" }),
    make({
      id: "noted",
      title: "Notlu iş",
      description: "Model ve TR değişikliği firmaya aktarıldı",
    }),
    make({ id: "linked", title: "Hedefe bağlı iş", parentId: "goal" }),
  ]);
  await page.locator('#nav [data-view="daily"]').click();
  async function closeTime(selector, bubble) {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(bubble)).toBeVisible();
    const start = await page.evaluate(() => performance.now());
    await page.mouse.move(box.x - 250, box.y + 250);
    await expect(page.locator(bubble)).toBeHidden();
    return (await page.evaluate(() => performance.now())) - start;
  }
  const note = await closeTime(
    'tr[data-id="noted"] .record-note-trigger',
    "#record-note-popover",
  );
  const goal = await closeTime(
    'tr[data-id="linked"] .record-parent-link',
    "#record-link-tooltip",
  );
  // Both close without the old 100 ms grace; allow polling slack.
  expect(note).toBeLessThan(90);
  expect(goal).toBeLessThan(90);
});
