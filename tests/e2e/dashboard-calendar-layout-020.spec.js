import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  attentionRows,
  firstAttentionPage,
  nextAttention,
  previousAttention,
  readAttentionCards,
} from "./attention-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = NOW.toISOString();
const compact = (page) => page.locator(".dashboard-calendar");
const expanded = (page) => page.locator("#dashboard-calendar-dialog");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

async function cardColumns(page) {
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
  return columns;
}

function fixture() {
  return [
    ...Array.from({ length: 12 }, (_, index) =>
      record({
        id: `calendar-020-day-${index}`,
        title: `Günün ${String(index + 1).padStart(2, "0")} tasarım dosyasını ve doğrulama çizimlerinin son revizyonunu incele`,
        dueDate: "2026-11-07",
      }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      record({
        id: `calendar-020-previous-${index}`,
        title: `Önceki günün ${String(index + 1).padStart(2, "0")} tasarım dosyasını ve doğrulama çizimlerinin son revizyonunu incele`,
        dueDate: "2026-11-06",
      }),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      record({
        id: `calendar-020-goal-${index}`,
        type: "weekly",
        title: `Haftanın ${index + 1}. doğrulama hedefi`,
        periodKey: "2026-W45",
        dueDate: "2026-11-08",
        nextAction: "Doğrulama dosyasını gözden geçir.",
        metric: "Kontrol",
        currentValue: index,
        targetValue: 10,
      }),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      record({
        id: `calendar-020-attention-${index}`,
        title: `Takip ${String(index + 1).padStart(2, "0")} — tasarım ekibinin değerlendirmesi`,
        type: "waiting",
        sourceDate: "2026-11-01",
        nextFollowUpDate: "2026-11-08",
        expectedFrom: "Tasarım ekibi",
      }),
    ),
  ];
}

async function seed(
  page,
  {
    width = 1920,
    height = 1080,
    theme = "light",
    inputRecords = fixture(),
  } = {},
) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  const original = JSON.stringify({
    version: 1,
    records: inputRecords,
    odak: {
      version: 1,
      preferences: { density: "compact", theme },
      history: [],
    },
  });
  await page.addInitScript(
    ({ key, original }) => {
      if (sessionStorage.getItem("calendar-layout-020-seeded")) return;
      localStorage.setItem(key, original);
      sessionStorage.setItem("calendar-layout-020-seeded", "true");
    },
    { key: KEY, original },
  );
  await page.goto("/");
  await expect(compact(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  expect(await saved(page)).toBe(original);
  return original;
}

async function fitsViewport(page) {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    windowScroll: scrollY,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.windowScroll).toBe(0);
}

async function panelBottomsAlign(page) {
  await expect
    .poll(() =>
      page.locator(".dashboard-workspace").evaluate((workspace) => {
        const elements = [
          ".dashboard-top-row .focus-panel",
          ".dashboard-top-row .dashboard-calendar",
          ".dashboard-bottom-row > .attention-panel",
          ".dashboard-bottom-row > .weekly-dashboard-panel",
        ].map((selector) => workspace.querySelector(selector));
        if (!workspace.isConnected || elements.some((element) => !element))
          return Infinity;
        const [focus, calendar, attention, weekly] = elements.map((element) =>
          element.getBoundingClientRect(),
        );
        if ([focus, calendar, attention, weekly].some((box) => !box.height))
          return Infinity;
        return Math.max(
          Math.abs(focus.y - calendar.y),
          Math.abs(focus.height - calendar.height),
          Math.abs(attention.y - weekly.y),
          Math.abs(attention.width - weekly.width),
          Math.abs(attention.height - weekly.height),
          Math.abs(attention.bottom - weekly.bottom),
        );
      }),
    )
    .toBeLessThanOrEqual(1);
}

async function fixedCalendarBoxes(page) {
  const result = {};
  for (const selector of [
    ".calendar-navigation",
    ".calendar-month-grid",
    ".calendar-selected-header",
    ".calendar-new-type",
    '[data-calendar-action="new-record"]',
  ]) {
    const control = compact(page).locator(selector);
    await expect(control).toBeInViewport({ ratio: 1 });
    result[selector] = await control.boundingBox();
  }
  return result;
}

async function fixedExpandedCalendarBoxes(page) {
  const result = {};
  for (const selector of [
    ".calendar-dialog-header",
    ".calendar-navigation",
    ".calendar-grid-scroll",
    ".calendar-selected-header",
    ".calendar-new-type",
    '[data-calendar-action="new-record"]',
  ]) {
    const control = expanded(page).locator(selector);
    await expect(control).toBeInViewport({ ratio: 1 });
    result[selector] = await control.boundingBox();
  }
  return result;
}

async function monthGridFits(page) {
  const area = expanded(page).locator(".calendar-grid-scroll");
  const dates = area.locator(".calendar-expanded-grid .calendar-cell-date");
  await expect(dates).toHaveCount(42);
  const metrics = await area.evaluate((element) => ({
    client: element.clientHeight,
    total: element.scrollHeight,
    scroll: element.scrollTop,
  }));
  expect(metrics.total).toBeLessThanOrEqual(metrics.client + 1);
  expect(metrics.scroll).toBe(0);
  const areaBox = await area.boundingBox();
  const dateBoxes = await dates.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    }),
  );
  for (const box of dateBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(areaBox.x - 1);
    expect(box.top).toBeGreaterThanOrEqual(areaBox.y - 1);
    expect(box.right).toBeLessThanOrEqual(areaBox.x + areaBox.width + 1);
    expect(box.bottom).toBeLessThanOrEqual(areaBox.y + areaBox.height + 1);
  }
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
  { width: 1100, height: 640 },
]) {
  for (const theme of ["light", "dark"]) {
    test(`calendar fixes its grid and add controls while twelve day entries scroll at ${viewport.width}x${viewport.height} ${theme}`, async ({
      page,
    }, testInfo) => {
      const original = await seed(page, { ...viewport, theme });
      await fitsViewport(page);
      await expect(page.locator(".focus-more")).toHaveCount(0);
      await expect(page.locator(".focus-list > .focus-row")).toHaveCount(22);
      expect(
        await page
          .locator(".focus-list > .focus-row")
          .evaluateAll((rows) => rows.map((row) => row.dataset.id)),
      ).toEqual([
        ...Array.from(
          { length: 10 },
          (_, index) => `calendar-020-previous-${index}`,
        ),
        ...Array.from(
          { length: 12 },
          (_, index) => `calendar-020-day-${index}`,
        ),
      ]);
      const lastJob = page.locator(
        '.focus-row[data-id="calendar-020-day-11"] .focus-title',
      );
      await lastJob.scrollIntoViewIfNeeded();
      await expect(lastJob).toBeInViewport({ ratio: 1 });
      await lastJob.click();
      await expect(page.locator('#record-form [name="title"]')).toHaveValue(
        fixture().find((item) => item.id === "calendar-020-day-11").title,
      );
      await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
      await panelBottomsAlign(page);
      await expect(
        compact(page).locator(".calendar-selected-label time"),
      ).toHaveAttribute("datetime", "2026-11-07");
      const entries = compact(page).locator(".calendar-agenda-entries");
      await expect(entries.locator(".calendar-entry")).toHaveCount(12);
      const before = await fixedCalendarBoxes(page);
      const size = await entries.evaluate((list) => ({
        client: list.clientHeight,
        total: list.scrollHeight,
      }));
      expect(size.total).toBeGreaterThan(size.client);
      const last = entries.locator(".calendar-entry").last();
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1 });
      expect(await entries.evaluate((list) => list.scrollTop)).toBeGreaterThan(
        0,
      );
      const savedAgendaScroll = await entries.evaluate(
        (list) => list.scrollTop,
      );
      expect(await compact(page).evaluate((panel) => panel.scrollTop)).toBe(0);
      expect(await fixedCalendarBoxes(page)).toEqual(before);
      await expect(
        compact(page).locator('[data-calendar-action="new-record"]'),
      ).toHaveText("Ekle");
      const goals = page.locator(".dashboard-goals");
      await expect(goals.locator(".dashboard-goal-row")).toHaveCount(5);
      const lastGoal = goals.locator(".dashboard-goal-title").last();
      await lastGoal.scrollIntoViewIfNeeded();
      await expect(lastGoal).toBeInViewport({ ratio: 1 });
      await lastGoal.click();
      await expect(
        page.locator("#goal-detail-panel .goal-panel-title"),
      ).toHaveText("Haftanın 5. doğrulama hedefi");
      await page.keyboard.press("Escape");
      await expect(attentionRows(page)).toHaveCount(
        Math.min(await cardColumns(page), 8),
      );
      expect((await readAttentionCards(page)).map((card) => card.id)).toEqual(
        Array.from(
          { length: 8 },
          (_, index) => `calendar-020-attention-${index}`,
        ),
      );
      expect(await entries.evaluate((list) => list.scrollTop)).toBe(
        savedAgendaScroll,
      );
      expect(
        await page
          .locator(".attention-list")
          .evaluate((list) => list.scrollWidth <= list.clientWidth + 1),
      ).toBe(true);
      await fitsViewport(page);
      await panelBottomsAlign(page);
      expect(await saved(page)).toBe(original);
      await page.screenshot({
        path: testInfo.outputPath(
          `calendar-layout-${viewport.width}-${theme}.png`,
        ),
      });
      const expandButton = compact(page).locator(".calendar-expand");
      await expandButton.focus();
      await page.keyboard.press("Enter");
      await expect(expanded(page)).toBeVisible();
      await monthGridFits(page);
      const more = expanded(page).locator(
        '.calendar-cell-more[data-calendar-date="2026-11-07"]',
      );
      await expect(more).toHaveText("+10 kayıt");
      await expect(more).toBeInViewport({ ratio: 1 });
      await expect(
        expanded(page).locator(
          '.calendar-expanded-cell:has(.calendar-cell-date[data-calendar-date="2026-11-07"]) .calendar-cell-entry',
        ),
      ).toHaveCount(2);
      const previousMore = expanded(page).locator(
        '.calendar-cell-more[data-calendar-date="2026-11-06"]',
      );
      await expect(previousMore).toHaveText("+8 kayıt");
      await expect(previousMore).toBeInViewport({ ratio: 1 });
      await expect(
        expanded(page).locator(
          '.calendar-expanded-cell:has(.calendar-cell-date[data-calendar-date="2026-11-06"]) .calendar-cell-entry',
        ),
      ).toHaveCount(2);
      await previousMore.click();
      await expect(
        expanded(page).locator(".calendar-agenda-entries .calendar-entry"),
      ).toHaveCount(10);
      await expanded(page)
        .locator('.calendar-cell-date[data-calendar-date="2026-11-08"]')
        .click();
      await more.click();
      await expect(
        expanded(page).locator(".calendar-selected-label time"),
      ).toHaveAttribute("datetime", "2026-11-07");
      const expandedEntries = expanded(page).locator(
        ".calendar-agenda-entries",
      );
      await expect(expandedEntries.locator(".calendar-entry")).toHaveCount(12);
      const expandedBefore = await fixedExpandedCalendarBoxes(page);
      const lastExpanded = expandedEntries.locator(".calendar-entry").last();
      await lastExpanded.scrollIntoViewIfNeeded();
      await expect(lastExpanded).toBeInViewport({ ratio: 1 });
      const expandedSize = await expandedEntries.evaluate((list) => ({
        client: list.clientHeight,
        total: list.scrollHeight,
        scroll: list.scrollTop,
      }));
      expect(expandedSize.total).toBeGreaterThan(expandedSize.client);
      expect(expandedSize.scroll).toBeGreaterThan(0);
      await monthGridFits(page);
      expect(await fixedExpandedCalendarBoxes(page)).toEqual(expandedBefore);
      expect(
        await expanded(page)
          .locator(".calendar-dialog-body")
          .evaluate((body) => body.scrollTop),
      ).toBe(0);
      expect(await saved(page)).toBe(original);
      await page.screenshot({
        path: testInfo.outputPath(
          `calendar-expanded-layout-${viewport.width}-${theme}.png`,
        ),
      });
      await page.keyboard.press("Escape");
      await expect(expanded(page)).not.toBeVisible();
      await expect(expandButton).toBeFocused();
      await fitsViewport(page);
      expect(await saved(page)).toBe(original);
    });
  }
}

test("actual dashboard panel bottoms align when current-work filters shorten or empty the list", async ({
  page,
}) => {
  const small = fixture().filter((item) =>
    [
      "calendar-020-day-0",
      "calendar-020-day-1",
      "calendar-020-day-2",
      "calendar-020-goal-0",
      "calendar-020-goal-1",
      "calendar-020-attention-0",
      "calendar-020-attention-1",
    ].includes(item.id),
  );
  const original = await seed(page, { inputRecords: small });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1100, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.focus-filters [data-filter="open"]').click();
    await expect(page.locator(".focus-list > .focus-row")).toHaveCount(3);
    await expect(page.locator(".focus-more")).toHaveCount(0);
    await panelBottomsAlign(page);
    await fitsViewport(page);
    await page.locator('.focus-filters [data-filter="focus"]').click();
    await expect(page.locator(".focus-list > .focus-row")).toHaveCount(0);
    await expect(page.locator(".focus-empty")).toBeVisible();
    await panelBottomsAlign(page);
    await fitsViewport(page);
    expect(await saved(page)).toBe(original);
  }
});

test("attention paging is keyboard accessible, resets on search, and clamps after deleting the final page with exact undo", async ({
  page,
}) => {
  const original = await seed(page);
  const caption = page.locator(".attention-page-label");
  let columns = await cardColumns(page);
  let pageCount = Math.ceil(8 / columns);
  let currentPage = 1;
  const expectedIds = Array.from(
    { length: 8 },
    (_, index) => `calendar-020-attention-${index}`,
  );
  const expectCurrentPage = async () => {
    await expect(caption).toHaveText(`Sayfa ${currentPage} / ${pageCount}`);
    expect(
      await attentionRows(page).evaluateAll((cards) =>
        cards.map((card) => card.dataset.id),
      ),
    ).toEqual(
      expectedIds.slice((currentPage - 1) * columns, currentPage * columns),
    );
  };
  await expectCurrentPage();
  await expect(page.locator(".attention-window")).toHaveCount(0);
  await expect(previousAttention(page)).toBeDisabled();
  await expect(nextAttention(page)).toBeEnabled();
  while (currentPage < pageCount) {
    await nextAttention(page).focus();
    await page.keyboard.press("Enter");
    currentPage += 1;
    await expectCurrentPage();
    await expect(
      currentPage === pageCount ? previousAttention(page) : nextAttention(page),
    ).toBeFocused();
  }
  await expect(nextAttention(page)).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 720 });
  columns = await cardColumns(page);
  pageCount = Math.ceil(8 / columns);
  currentPage = Math.min(currentPage, pageCount);
  await expectCurrentPage();
  await previousAttention(page).click();
  currentPage -= 1;
  await expectCurrentPage();
  await nextAttention(page).click();
  currentPage += 1;
  await expectCurrentPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  columns = await cardColumns(page);
  pageCount = Math.ceil(8 / columns);
  currentPage = Math.min(currentPage, pageCount);
  await expectCurrentPage();
  await page.getByRole("searchbox").fill("Takip 01");
  await expect(attentionRows(page)).toHaveCount(1);
  await expect(attentionRows(page)).toHaveAttribute(
    "data-id",
    "calendar-020-attention-0",
  );
  await page.getByRole("searchbox").fill("");
  currentPage = 1;
  await expectCurrentPage();
  expect(await saved(page)).toBe(original);
  while (currentPage < pageCount) {
    await nextAttention(page).click();
    currentPage += 1;
  }
  await expectCurrentPage();
  const deletedIds = await attentionRows(page).evaluateAll((cards) =>
    cards.map((card) => card.dataset.id),
  );
  for (const id of deletedIds) {
    await page
      .locator(`.attention-list > [data-id="${id}"] .followup-title`)
      .click();
    const preview = page.locator("#waiting-record-panel");
    await expect(preview).toHaveAttribute("data-record-id", id);
    await preview
      .getByRole("button", { name: "Kaydı düzenle", exact: true })
      .click();
    await expect(page.locator('#record-form [name="id"]')).toHaveValue(id);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Kaydı sil", exact: true }).click();
    await expect(page.locator("#editor")).not.toBeVisible();
  }
  const remaining = 8 - deletedIds.length;
  const finalPageCount = Math.ceil(remaining / columns);
  await expect(caption).toHaveText(
    `Sayfa ${finalPageCount} / ${finalPageCount}`,
  );
  await expect(nextAttention(page)).toBeDisabled();
  expect(await records(page)).toEqual(
    fixture().filter((item) => !deletedIds.includes(item.id)),
  );
  for (let index = 0; index < deletedIds.length; index += 1)
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(original);
  expect((await readAttentionCards(page)).map((card) => card.id)).toEqual(
    expectedIds,
  );
});

test("compact and expanded Ekle controls keep the selected day and distinguish delivery from next follow-up without creating records on cancel", async ({
  page,
}) => {
  const original = await seed(page);
  for (const { expanded: openExpanded, type, day } of [
    { expanded: false, type: "daily", day: "2026-11-10" },
    { expanded: false, type: "waiting", day: "2026-11-11" },
    { expanded: true, type: "daily", day: "2026-11-12" },
    { expanded: true, type: "waiting", day: "2026-11-13" },
  ]) {
    if (openExpanded) {
      await page
        .getByRole("button", { name: "Takvimi aç", exact: true })
        .click();
      await expect(expanded(page)).toBeVisible();
    }
    const surface = openExpanded ? expanded(page) : compact(page);
    await surface
      .locator(
        `[data-calendar-action="select-day"][data-calendar-date="${day}"]`,
      )
      .click();
    await surface.locator(".calendar-new-type").selectOption(type);
    const selected = surface.locator(".calendar-selected-header");
    await expect(selected.locator("time")).toHaveAttribute("datetime", day);
    const add = selected.locator('[data-calendar-action="new-record"]');
    await expect(add).toHaveText("Ekle");
    await add.focus();
    await page.keyboard.press("Enter");
    if (openExpanded) await expect(expanded(page)).toBeVisible();
    else await expect(expanded(page)).not.toBeVisible();
    const form = page.locator("#record-form");
    await expect(form.locator('[name="type"]')).toHaveValue(type);
    await expect(
      form.locator(
        `[name="${type === "waiting" ? "nextFollowUpDate" : "dueDate"}"]`,
      ),
    ).toHaveValue(`${day.slice(8)}.11.2026`);
    await expect(form.locator('[name="sourceDate"]')).toHaveValue("07.11.2026");
    await expect(form.locator('[name="title"]')).toHaveValue("");
    await form.getByRole("button", { name: "Vazgeç", exact: true }).click();
    if (openExpanded) {
      await expect(expanded(page)).toBeVisible();
      await expect(
        expanded(page).locator(".calendar-selected-label time"),
      ).toHaveAttribute("datetime", day);
      await expanded(page)
        .getByRole("button", { name: "Takvimi kapat", exact: true })
        .click();
    }
    expect(await saved(page)).toBe(original);
  }
  await firstAttentionPage(page);
  await fitsViewport(page);
});

test("desktop header controls keep the same position across the dashboard and every work list", async ({
  page,
}, testInfo) => {
  const original = await seed(page);
  const controls = {
    search: ".topbar .search",
    newRecord: ".topbar .new-record",
    widget: ".topbar .widget-trigger",
    calendar: ".topbar .calendar-trigger",
    undo: ".topbar .undo-trigger",
    settings: ".topbar .settings-trigger",
  };
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1100, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('#nav [data-view="dashboard"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const baseline = {};
    for (const [name, selector] of Object.entries(controls)) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      baseline[name] = await page.locator(selector).boundingBox();
    }
    for (const view of [
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "meeting",
      "waiting",
    ]) {
      await page.locator(`#nav [data-view="${view}"]`).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const [name, selector] of Object.entries(controls)) {
        const control = page.locator(selector);
        await expect(control).toBeInViewport({ ratio: 1 });
        const box = await control.boundingBox();
        for (const dimension of ["x", "y", "width", "height"])
          expect(
            Math.abs(box[dimension] - baseline[name][dimension]),
            `${viewport.width}px ${view} ${name} ${dimension}`,
          ).toBeLessThanOrEqual(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(await saved(page)).toBe(original);
      if (view === "monthly")
        await page.screenshot({
          path: testInfo.outputPath(
            `shared-header-monthly-${viewport.width}.png`,
          ),
        });
    }
  }
});
