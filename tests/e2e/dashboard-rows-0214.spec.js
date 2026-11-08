import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  attentionRows,
  nextAttention,
  previousAttention,
} from "./attention-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const record = (input) =>
  createRecord({
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...input,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const savedRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const calendar = (page) =>
  page.locator(".dashboard-top-row .dashboard-calendar");
const attention = (page) =>
  page.locator(".dashboard-bottom-row > .attention-panel");
const weekly = (page) =>
  page.locator(".dashboard-bottom-row > .weekly-dashboard-panel");
const dashboard = (page) =>
  page.locator('#nav [data-view="dashboard"]').click();

async function cardColumns(page) {
  const columns = Number(
    await page
      .locator(".dashboard-workspace")
      .getAttribute("data-card-columns"),
  );
  expect(columns).toBeGreaterThanOrEqual(1);
  expect(columns).toBeLessThanOrEqual(3);
  expect(
    await attention(page)
      .locator(".attention-list")
      .evaluate(
        (list) => getComputedStyle(list).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(columns);
  return columns;
}

function fixture({ emptyAttention = false } = {}) {
  return [
    ...Array.from({ length: 12 }, (_, index) =>
      record({
        id: `rows-daily-${index}`,
        title: `Günün ${String(index + 1).padStart(2, "0")} tasarım dosyasını ve son doğrulama çizimini incele`,
        dueDate: "2026-11-07",
        priority: index === 0 ? "high" : "normal",
      }),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      record({
        id: `rows-weekly-${index}`,
        type: "weekly",
        title: `Bu haftanın ${index + 1}. ölçüm hedefi`,
        periodKey: "2026-W45",
        metric: "Kontrol",
        targetValue: 10,
        currentValue: index + 2,
        nextAction: "Doğrulama çizimlerini gözden geçir.",
      }),
    ),
    record({
      id: "rows-future-week",
      type: "weekly",
      title: "Gelecek haftanın ayrı hedefi",
      periodKey: "2026-W46",
      metric: "Rapor",
      targetValue: 3,
    }),
    ...(emptyAttention
      ? []
      : Array.from({ length: 4 }, (_, index) =>
          record({
            id: `rows-waiting-${index}`,
            type: "waiting",
            title: `Tedarik ${index + 1} yanıtını ve malzeme doğrulamasını bekle`,
            status: "waiting_response",
            expectedFrom: "Tedarik birimi",
            sourceDate: "2026-10-28",
            nextFollowUpDate: index === 0 ? "2026-11-06" : "2026-11-07",
            description: "Kullanıcının gerçek notu korunmalı.",
          }),
        )),
    record({
      id: "rows-future-waiting",
      type: "waiting",
      title: "İleride planlanmış takip",
      nextFollowUpDate: "2026-11-20",
      expectedFrom: "Kalite birimi",
      latestUpdate: "Tarih belirlendi.",
    }),
  ];
}

async function seed(page, { emptyAttention = false, inputRecords } = {}) {
  const records = inputRecords || fixture({ emptyAttention });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("dashboard-rows-0214-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("dashboard-rows-0214-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  await expect(
    page.locator(".dashboard-workspace.dashboard-rows"),
  ).toBeVisible();
  return records;
}

async function desktopGeometry(page) {
  const bounds = await page.evaluate(() => {
    const box = (selector) =>
      document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      focus: box(".dashboard-top-row .focus-panel"),
      calendar: box(".dashboard-top-row .dashboard-calendar"),
      attention: box(".dashboard-bottom-row > .attention-panel"),
      weekly: box(".dashboard-bottom-row > .weekly-dashboard-panel"),
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      width: innerWidth,
      height: innerHeight,
      scroll: scrollY,
    };
  });
  expect(Math.abs(bounds.focus.y - bounds.calendar.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bounds.focus.height - bounds.calendar.height),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.attention.y - bounds.weekly.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bounds.attention.height - bounds.weekly.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bounds.attention.width - bounds.weekly.width),
  ).toBeLessThanOrEqual(1);
  expect(bounds.attention.y).toBeGreaterThanOrEqual(bounds.focus.bottom);
  expect(bounds.weekly.bottom).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.documentHeight).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.scroll).toBe(0);
}

test("desktop dashboard has equal-height top panels and two equal lower panels even with a planning prompt", async ({
  page,
}) => {
  await seed(page);
  const original = await saved(page);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1100, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".planning-prompts")).toBeVisible();
    await desktopGeometry(page);
    const visibleCards = Math.min(await cardColumns(page), 4);
    await expect(attentionRows(page)).toHaveCount(visibleCards);
    const cards = attentionRows(page);
    await expect(cards.locator(".quick-complete")).toHaveCount(0);
    await expect(cards.locator(".status-trigger")).toHaveCount(visibleCards);
    await expect(cards.locator('[data-action="waiting-followup"]')).toHaveCount(
      visibleCards,
    );
    const goals = weekly(page).locator(".dashboard-goal-row");
    await expect(goals).toHaveCount(2);
    for (const goal of await goals.all()) {
      await expect(goal.locator(".dashboard-goal-actions button")).toHaveCount(
        2,
      );
      await expect(
        goal.locator(".dashboard-goal-meta-controls .status-trigger"),
      ).toHaveCount(1);
      await expect(
        goal.locator('.dashboard-goal-meta-controls [data-action="edit-date"]'),
      ).toHaveCount(1);
      await expect(goal.locator("strong.dashboard-goal-title")).toBeVisible();
      await expect(goal.locator(".dashboard-goal-title")).not.toHaveAttribute(
        "data-action",
      );
      for (const [action, text] of [
        ["goal-progress-open", "İlerleme"],
        ["goal-children-open", "Bağlı işler 0"],
      ]) {
        const button = goal.locator(`[data-action="${action}"]`);
        await expect(button).toHaveText(text);
        await expect(button).toBeInViewport({ ratio: 1 });
      }
    }
  }
  expect(await saved(page)).toBe(original);
});

test("lower panel links open the exact waiting list and displayed week while progress and follow-up navigation remain read-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await seed(page);
  const original = await saved(page);
  await attention(page)
    .locator('[data-action="open-list"][data-view="waiting"]')
    .click();
  await expect(page.locator("#page-title")).toHaveText("Bekleyen konular");
  await expect(page.locator(".waiting-table tbody > tr")).toHaveCount(5);
  expect(await saved(page)).toBe(original);

  await dashboard(page);
  const weekLink = weekly(page).locator(
    '.panel-header [data-action="dashboard-weekly"]',
  );
  await expect(weekLink).toHaveAttribute("data-week", "2026-W45");
  await weekLink.click();
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  await expect(
    page.locator('.full-table tbody > tr[data-id="rows-weekly-0"]'),
  ).toBeVisible();
  await expect(
    page.locator('.full-table tbody > tr[data-id="rows-future-week"]'),
  ).toHaveCount(0);
  expect(await saved(page)).toBe(original);

  await dashboard(page);
  await weekly(page)
    .locator('.dashboard-goal-row[data-goal-id="rows-weekly-0"]')
    .locator('[data-action="goal-progress-open"]')
    .click();
  const goal = page.locator("#goal-detail-panel");
  await expect(goal.locator(".goal-panel-title")).toHaveText(
    "Bu haftanın 1. ölçüm hedefi",
  );
  await expect(goal.locator('[data-goal-section="progress"]')).toBeVisible();
  await goal.locator('.modal-header [data-action="goal-panel-close"]').click();
  expect(await saved(page)).toBe(original);

  const card = attention(page).locator(
    '.followup-row[data-id="rows-waiting-0"]',
  );
  await card.locator('[data-action="waiting-followup"]').click();
  const dialog = page.locator("#waiting-followup-dialog");
  await dialog
    .locator('[name="followUpNote"]')
    .fill("Kaydedilmeyecek yerel taslak");
  await dialog
    .locator('.modal-footer [data-action="waiting-followup-close"]')
    .click();
  expect(await saved(page)).toBe(original);
});

test("empty follow-ups retain a useful list link and mobile page flow keeps the fixed calendar and all panel controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page, { emptyAttention: true });
  const original = await saved(page);
  await expect(attention(page).locator(".followup-empty")).toHaveText(
    "Yaklaşan takip yok.",
  );
  await expect(attentionRows(page)).toHaveCount(0);
  await calendar(page).scrollIntoViewIfNeeded();
  const fixed = async () => {
    const boxes = {};
    for (const selector of [
      ".calendar-navigation",
      ".calendar-month-grid",
      ".calendar-selected-header",
      '[data-calendar-action="new-record"]',
    ]) {
      const control = calendar(page).locator(selector);
      await expect(control).toBeInViewport({ ratio: 1 });
      boxes[selector] = await control.boundingBox();
    }
    return boxes;
  };
  const before = await fixed();
  const entries = calendar(page).locator(".calendar-agenda-entries");
  await expect(entries.locator(".calendar-entry")).toHaveCount(12);
  await entries.locator(".calendar-entry").last().scrollIntoViewIfNeeded();
  await expect(entries.locator(".calendar-entry").last()).toBeInViewport({
    ratio: 1,
  });
  expect(
    await entries.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(await fixed()).toEqual(before);

  const add = calendar(page).locator('[data-calendar-action="new-record"]');
  await add.click();
  await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
    "07.11.2026",
  );
  await page
    .locator('#editor .modal-footer [data-action="creation-close"]')
    .click();
  const goalTitle = weekly(page).locator(".dashboard-goal-title").first();
  await goalTitle.scrollIntoViewIfNeeded();
  await expect(goalTitle).toBeInViewport();
  const link = attention(page).locator(
    '[data-action="open-list"][data-view="waiting"]',
  );
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await link.click();
  await expect(page.locator(".waiting-table tbody > tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(await saved(page)).toBe(original);
});

test("responsive follow-up pages remain keyboard accessible and one saved follow-up can be undone exactly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const originalRecords = await seed(page);
  const original = await saved(page);
  const columns = await cardColumns(page);
  await expect(attentionRows(page)).toHaveCount(Math.min(columns, 4));
  const first = await attentionRows(page).evaluateAll((cards) =>
    cards.map((card) => card.dataset.id),
  );
  await nextAttention(page).focus();
  await page.keyboard.press("Enter");
  await expect(attentionRows(page)).toHaveCount(4 - columns);
  const second = await attentionRows(page).evaluateAll((cards) =>
    cards.map((card) => card.dataset.id),
  );
  expect(new Set([...first, ...second]).size).toBe(4);
  await expect(nextAttention(page)).toBeDisabled();
  await previousAttention(page).click();
  expect(await saved(page)).toBe(original);

  await attention(page)
    .locator(
      '.followup-row[data-id="rows-waiting-0"] [data-action="waiting-followup"]',
    )
    .click();
  const dialog = page.locator("#waiting-followup-dialog");
  await dialog.locator('[name="followUpNote"]').fill("Yanıt tekrar istendi.");
  await dialog.locator('[name="nextFollowUpDate"]').fill("14.11.2026");
  await dialog
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    attention(page).locator('.followup-row[data-id="rows-waiting-0"]'),
  ).toHaveCount(0);
  const after = await savedRecords(page);
  const changed = after.find((record) => record.id === "rows-waiting-0");
  expect(changed.status).toBe("waiting_response");
  expect(changed.latestUpdate).toBe("Yanıt tekrar istendi.");
  expect(changed.followUpLog).toHaveLength(1);
  expect(changed.followUpLog[0]).toMatchObject({
    date: "2026-11-07",
    note: "Yanıt tekrar istendi.",
    nextFollowUpDate: "2026-11-14",
  });
  expect(after.filter((record) => record.id !== changed.id)).toEqual(
    originalRecords.filter((record) => record.id !== changed.id),
  );
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await savedRecords(page)).toEqual(originalRecords);
  await expect(attentionRows(page)).toHaveCount(Math.min(columns, 4));
  await desktopGeometry(page);
  await page.setViewportSize({ width: 390, height: 700 });
  expect(await cardColumns(page)).toBe(1);
  await expect(attentionRows(page)).toHaveCount(1);
  await attentionRows(page).first().scrollIntoViewIfNeeded();
  await expect(
    attentionRows(page).first().locator('[data-action="waiting-followup"]'),
  ).toBeInViewport();
  expect(await savedRecords(page)).toEqual(originalRecords);
});

test("one upcoming goal and one waiting card show their full content without a repeated week note or clipped follow-up badge", async ({
  page,
}) => {
  const records = [
    record({
      id: "single-upcoming",
      type: "weekly",
      title: "Yaklaşan ölçüm hedefi",
      periodKey: "2026-W46",
      metric: "Kontrol",
      targetValue: 10,
      currentValue: 2,
      nextAction: "Son doğrulama çizimlerini gözden geçir.",
    }),
    record({
      id: "single-linked-work",
      title: "Ölçüm çizimini hazırla",
      parentId: "single-upcoming",
      dueDate: "2026-11-07",
    }),
    record({
      id: "single-waiting",
      type: "waiting",
      title: "Tedarik yanıtını bekle",
      status: "waiting_response",
      sourceDate: "2026-10-28",
      expectedFrom: "Tedarik ekibi",
      latestUpdate: "Teklif yanıtı bekleniyor.",
      nextFollowUpDate: "2026-11-08",
    }),
  ];
  await seed(page, { inputRecords: records });
  const original = await saved(page);
  const contained = async (child, parent) => {
    const inside = await child.boundingBox();
    const outside = await parent.boundingBox();
    expect(inside.x).toBeGreaterThanOrEqual(outside.x - 1);
    expect(inside.y).toBeGreaterThanOrEqual(outside.y - 1);
    expect(inside.x + inside.width).toBeLessThanOrEqual(
      outside.x + outside.width + 1,
    );
    expect(inside.y + inside.height).toBeLessThanOrEqual(
      outside.y + outside.height + 1,
    );
    await expect(child).toBeInViewport({ ratio: 1 });
  };

  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1100, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(weekly(page).locator("h2")).toHaveText(
      /^Yaklaşan haftanın hedefleri\s*1$/,
    );
    await expect(weekly(page).locator(".dashboard-panel-count")).toHaveText(
      "1",
    );
    await expect(weekly(page).locator(".dashboard-week-label")).toContainText(
      "Gelecek hafta · 9 – 15 Kasım 2026",
    );
    await expect(weekly(page).locator(".dashboard-week-note")).toHaveCount(0);
    const list = weekly(page).locator(".dashboard-goals");
    const goal = list.locator(
      '.dashboard-goal-row[data-goal-id="single-upcoming"]',
    );
    await expect(list.locator(".dashboard-goal-row")).toHaveCount(1);
    await contained(goal, list);
    const childCount = goal.locator(".dashboard-goal-count");
    await expect(childCount).toHaveText("1");
    await contained(childCount, goal);
    await contained(childCount, list);
    for (const [name, text] of [
      ["goal-progress-open", "İlerleme"],
      ["goal-children-open", "Bağlı işler 1"],
    ]) {
      const action = goal.locator(`[data-action="${name}"]`);
      await expect(action).toHaveText(text);
      await contained(action, goal);
      await contained(action, list);
    }

    const cards = attention(page).locator(".attention-list");
    const card = cards.locator('.followup-row[data-id="single-waiting"]');
    await expect(attentionRows(page)).toHaveCount(1);
    await contained(card, cards);
    const badge = card.locator(
      ".attention-date > .waiting-next-date.deadline-tag",
    );
    await expect(badge).toHaveAttribute("data-followup-state", "soon");
    await expect(badge).toHaveText("8 Kas");
    await expect(badge.locator("svg")).toHaveCount(1);
    await expect(badge).toHaveAttribute("data-action", "edit-next-followup");
    expect(await badge.evaluate((element) => element.tagName)).toBe("BUTTON");
    await contained(badge, card);
    const parts = await badge.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const icon = element.querySelector("svg").getBoundingClientRect();
      const label = element.querySelector(".deadline-label");
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        box: box.toJSON(),
        icon: icon.toJSON(),
        text: text.toJSON(),
        border: parseFloat(style.borderTopWidth),
        borderStyle: style.borderTopStyle,
      };
    });
    expect(parts.border).toBeGreaterThan(0);
    expect(parts.borderStyle).not.toBe("none");
    for (const part of [parts.icon, parts.text]) {
      expect(part.x).toBeGreaterThanOrEqual(parts.box.x);
      expect(part.y).toBeGreaterThanOrEqual(parts.box.y);
      expect(part.right).toBeLessThanOrEqual(parts.box.right);
      expect(part.bottom).toBeLessThanOrEqual(parts.box.bottom);
    }
    await expect(card.locator(".quick-complete")).toHaveCount(0);
    await expect(card.locator(".status-trigger")).toHaveCount(1);
    await desktopGeometry(page);
    expect(await saved(page)).toBe(original);
  }
});
