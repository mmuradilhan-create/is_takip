import { readWorkspaceDomainRaw } from "./work-session-support.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { readAttentionCards } from "./attention-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE_REASON =
  '<img src=x onerror="window.dashboardInjected=1"> Tasarım yanıtı bekleniyor.';
const UNSAFE_NEXT =
  '<svg onload="window.dashboardInjected=1"> Sonraki adımı görüş.';

function fixture() {
  const record = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    record({
      id: "current-week",
      type: "weekly",
      title: "Bu haftanın açık hedefi",
      periodKey: "2026-W45",
    }),
    record({
      id: "prior-week",
      type: "weekly",
      title: "Önceki haftadan açık hedef",
      periodKey: "2026-W44",
    }),
    record({
      id: "future-week",
      type: "weekly",
      title: "Gelecek haftanın hedefi",
      periodKey: "2026-W46",
    }),
    record({
      id: "done-week",
      type: "weekly",
      title: "Tamamlanmış haftalık hedef",
      periodKey: "2026-W45",
      status: "completed",
    }),
    record({
      id: "archive-week",
      type: "weekly",
      title: "Eski aktarım arşivi",
      periodKey: "2026-W43",
      status: "transferred",
    }),
    record({
      id: "late-urgent",
      title: "Acil geciken iş",
      dueDate: "2026-11-06",
      priority: "urgent",
    }),
    record({
      id: "late-low",
      title: "Düşük öncelikli geciken iş",
      dueDate: "2026-11-05",
      priority: "low",
    }),
    record({ id: "today", title: "Bugünkü iş", dueDate: "2026-11-07" }),
    record({
      id: "daily-waiting",
      title: "Tasarım yanıtını bekleyen iş",
      dueDate: "2026-11-08",
      priority: "high",
      status: "waiting",
      waitingReason: UNSAFE_REASON,
      nextAction: UNSAFE_NEXT,
      description: "Bu uzun genel not engel penceresine taşınmamalı.",
    }),
    record({
      id: "working",
      title: "Üzerinde çalışılacak sonraki iş",
      dueDate: "2026-11-20",
      priority: "low",
      status: "in_progress",
    }),
    record({ id: "undated", title: "Tarihsiz acil iş", priority: "urgent" }),
    record({
      id: "done-daily",
      title: "Bitmiş ve eski beklemesi olan iş",
      status: "completed",
      waitingReason: "Geçmişte bekleyen yanıt.",
      dueDate: "2026-11-04",
    }),
    record({
      id: "waiting-overdue",
      type: "waiting",
      title: "Takibi geciken konu",
      sourceDate: "2026-10-28",
      lastFollowUpDate: "2026-11-01",
      nextFollowUpDate: "2026-11-06",
    }),
    record({
      id: "waiting-today",
      type: "waiting",
      title: "Bugün takip edilecek konu",
      sourceDate: "2026-10-01",
      nextFollowUpDate: "2026-11-07",
    }),
    record({
      id: "waiting-none",
      type: "waiting",
      title: "Başlangıcı ve takip planı bilinmeyen konu",
    }),
    record({
      id: "waiting-future",
      type: "waiting",
      title: "Geleceğe planlı konu",
      sourceDate: "2026-10-02",
      nextFollowUpDate: "2026-11-10",
    }),
    record({
      id: "waiting-closed",
      type: "waiting",
      title: "Kapanmış eski konu",
      sourceDate: "2026-09-01",
      nextFollowUpDate: "2026-11-01",
      status: "completed",
    }),
  ];
}

async function seed(page) {
  const records = fixture();
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("dashboard-refresh-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("dashboard-refresh-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  return records;
}

const saved = (page) => readWorkspaceDomainRaw(page);
const focus = (page, id) => page.locator(`.focus-row[data-id="${id}"]`);
const focusIds = (page) =>
  page
    .locator(".focus-list > .focus-row")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id));
const dashboard = (page) =>
  page.locator('#nav [data-view="dashboard"]').click();

test("optional planning prompts replace repeated cards while weekly, attention and daily views remain read-only", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await expect(page.locator(".stats.agenda-stats")).toHaveCount(0);
  const prompts = page.locator(".planning-prompts .planning-prompt");
  await expect(prompts).toHaveCount(3);
  await expect(prompts.locator(".planning-prompt-count")).toHaveText([
    "1",
    "4",
    "1",
  ]);
  await expect(
    page.locator('.planning-prompt[data-prompt="waiting"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.planning-prompt[data-prompt="review"]'),
  ).toHaveCount(0);

  const promptDialog = page.locator("#planning-prompts-dialog");
  await page.locator('.planning-prompt[data-prompt="goals"]').click();
  await expect(promptDialog.locator(".field-help")).toContainText("İstersen");
  await expect(promptDialog.locator("[data-prompt-record]")).toHaveCount(1);
  await promptDialog
    .locator(
      '[data-prompt-record="current-week"] [data-action="planning-prompt-record"]',
    )
    .click();
  await expect(page.locator("#goal-detail-panel .goal-panel-title")).toHaveText(
    "Bu haftanın açık hedefi",
  );
  await page
    .locator('#goal-detail-panel [data-action="goal-panel-close"]')
    .last()
    .click();
  await page.locator('.planning-prompt[data-prompt="previous"]').click();
  await expect(promptDialog.locator("[data-prompt-record]")).toHaveCount(1);
  await expect(
    promptDialog.locator('[data-prompt-record="prior-week"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);

  await page
    .locator('.weekly-dashboard-panel [data-action="dashboard-weekly"]')
    .click();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  await page.locator(".weekly-backlog > summary").click();
  await expect(page.locator(".weekly-backlog")).toHaveAttribute("open", "");
  await expect(
    page.locator('.weekly-backlog [data-weekly-backlog-id="prior-week"]'),
  ).toBeVisible();
  await expect(
    page.locator('.full-table tr[data-id="current-week"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.full-table tr[data-id="future-week"], .full-table tr[data-id="done-week"], .full-table tr[data-id="archive-week"]',
    ),
  ).toHaveCount(0);
  await dashboard(page);
  const columns = Number(
    await page
      .locator(".dashboard-workspace")
      .getAttribute("data-card-columns"),
  );
  expect(columns).toBeGreaterThanOrEqual(1);
  expect(columns).toBeLessThanOrEqual(3);
  expect(
    await page
      .locator(".attention-list")
      .evaluate(
        (list) => getComputedStyle(list).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(columns);
  await expect(page.locator(".attention-list > li")).toHaveCount(
    Math.min(columns, 3),
  );
  expect(
    (await readAttentionCards(page)).map((card) => card.id).sort(),
  ).toEqual(["waiting-future", "waiting-overdue", "waiting-today"]);
  await page
    .locator('.attention-list [data-id="waiting-overdue"] .followup-title')
    .click();
  const preview = page.locator("#waiting-record-panel");
  await expect(preview).toHaveAttribute("data-record-id", "waiting-overdue");
  await preview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Takibi geciken konu",
  );
  await page.locator('#editor [data-action="close"]').last().click();
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="waiting"]').click();
  await page.locator("#period-filter").selectOption("followup");
  expect(
    (
      await page
        .locator(".waiting-table tbody > tr")
        .evaluateAll((rows) => rows.map((row) => row.dataset.id))
    ).sort(),
  ).toEqual(["waiting-none", "waiting-overdue", "waiting-today"]);
  await dashboard(page);
  await page.locator(".focus-panel .open-list").click();
  await page.locator("#status-filter").selectOption("waiting");
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  await expect(page.locator(".full-table tbody > tr")).toHaveCount(1);
  await expect(
    page.locator('.full-table tr[data-id="daily-waiting"]'),
  ).toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("fixed current-work order pins and highlights only the actual running session, then returns after pause and finish", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  const order = [
    "late-urgent",
    "late-low",
    "today",
    "daily-waiting",
    "working",
    "undated",
  ];
  await expect(page.locator("#focus-sort")).toHaveCount(0);
  expect(await focusIds(page)).toEqual(order);
  await expect(page.locator(".focus-row.is-working")).toHaveCount(0);
  const idleBar = await focus(page, "working").evaluate(
    (row) => getComputedStyle(row).boxShadow,
  );
  await focus(page, "working").locator(".work-start").click();
  await expect
    .poll(() => focusIds(page))
    .toEqual(["working", ...order.filter((id) => id !== "working")]);
  await expect(focus(page, "working")).toHaveClass(/is-working/);
  await expect(focus(page, "working")).toHaveAttribute(
    "data-work-state",
    "running",
  );
  await expect(page.locator(".focus-row.is-working")).toHaveCount(1);
  // The running row is marked by its green left bar, not a background.
  await page.mouse.move(1, 1);
  expect(
    await focus(page, "working").evaluate(
      (row) => getComputedStyle(row).boxShadow,
    ),
  ).not.toBe(idleBar);
  expect(
    await focus(page, "working").evaluate(
      (row) => getComputedStyle(row).backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.clock.runFor(1000);
  await page.locator('#nav [data-view="daily"]').click();
  await dashboard(page);
  await expect(focus(page, "working")).toHaveClass(/is-working/);
  expect((await focusIds(page))[0]).toBe("working");
  await page.locator('[data-action="work-pause"]').click();
  await expect(page.locator(".focus-row.is-working")).toHaveCount(0);
  await expect.poll(() => focusIds(page)).toEqual(order);
  await focus(page, "working").locator(".work-start").click();
  await expect(focus(page, "working")).toHaveClass(/is-working/);
  await page.locator('[data-action="work-finish"]').click();
  await expect(page.locator(".focus-row.is-working")).toHaveCount(0);
  await page.locator('[data-action="work-finish-cancel"]').first().click();
  expect(await saved(page)).toBe(before);
});

test("waiting context is reached from its status with escaped details and preserves an external status change", async ({
  page,
  context,
}) => {
  await seed(page);
  const before = await saved(page);
  const trigger = focus(page, "daily-waiting").locator(".status-trigger");
  const dialog = page.locator("#waiting-details-dialog");
  await expect(
    page.locator(".blocked-badge, #blocker-details-popover"),
  ).toHaveCount(0);
  await trigger.click();
  await page.locator('#status-menu [data-action="waiting-details"]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[name="waitingReason"]')).toHaveValue(
    UNSAFE_REASON,
  );
  await expect(dialog.locator('[name="nextAction"]')).toHaveCount(0);
  await expect(dialog).not.toContainText(UNSAFE_NEXT);
  await expect(dialog).not.toContainText("Bu uzun genel not");
  await expect(dialog.locator("img, svg[onload]")).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await page.evaluate(() => window.dashboardInjected)).toBeUndefined();
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.locator('#status-menu [data-action="waiting-details"]').click();
  await dialog
    .locator('[name="waitingReason"]')
    .fill("Bu taslak dış değişiklikte kaybolmamalı.");
  const other = await context.newPage();
  await other.goto("/");
  const incoming = JSON.parse(before);
  incoming.records = incoming.records.map((record) =>
    record.id === "daily-waiting"
      ? { ...record, status: "in_progress", updatedAt: NOW.toISOString() }
      : record,
  );
  const external = JSON.stringify(incoming);
  await other.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: KEY,
    value: external,
  });
  await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
  await expect(dialog.locator('[name="waitingReason"]')).toHaveValue(
    "Bu taslak dış değişiklikte kaybolmamalı.",
  );
  await expect(
    focus(page, "daily-waiting").locator(".status-trigger"),
  ).toContainText("Devam");
  expect(await saved(page)).toBe(external);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await other.close();
});

test("current-work filters sit beside the heading and waiting age remains short without invented dates", async ({
  page,
}, testInfo) => {
  await seed(page);
  const before = await saved(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const focusPanel = page.locator(".focus-panel");
    await expect(focusPanel).toBeVisible();
    let geometry;
    await expect
      .poll(async () => {
        geometry = await focusPanel.evaluate((panel) => {
          const heading = panel.querySelector("h2");
          const filters = panel.querySelector(".focus-filters");
          if (!panel.isConnected || !heading || !filters) return null;
          return {
            heading: heading.getBoundingClientRect().toJSON(),
            filters: filters.getBoundingClientRect().toJSON(),
          };
        });
        return Boolean(
          geometry?.heading.width &&
          geometry.heading.height &&
          geometry.filters.width &&
          geometry.filters.height,
        );
      })
      .toBe(true);
    const { heading, filters } = geometry;
    expect(filters.x).toBeGreaterThan(heading.x + heading.width);
    expect(
      Math.abs(filters.y + filters.height / 2 - heading.y - heading.height / 2),
    ).toBeLessThanOrEqual(8);
    await expect(page.locator("#focus-sort")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-refresh-${viewport.width}.png`),
      fullPage: false,
    });
  }
  await page.locator('#nav [data-view="waiting"]').click();
  await expect(
    page.locator('.waiting-table tr[data-id="waiting-overdue"] .waiting-age'),
  ).toHaveText("10 gün");
  await expect(
    page.locator('.waiting-table tr[data-id="waiting-none"] .waiting-age'),
  ).toHaveText("Başlangıç ekle");
  expect(await page.locator(".waiting-age").allTextContents()).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/gündür|bekliyor/)]),
  );
  expect(await saved(page)).toBe(before);
});
