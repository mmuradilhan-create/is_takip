import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const make = (values) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...values });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

async function navigate(page, type) {
  const menu = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await menu.isVisible()) &&
    (await menu.getAttribute("aria-expanded")) !== "true"
  )
    await menu.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

async function expectActionAlignment(page, table, id, { count, maximumWidth }) {
  const row = table.locator(`[data-record-row][data-id="${id}"]`);
  const header = table.locator("thead .row-action-col");
  const cell = row.locator("td.row-action-col");
  const controls = cell.locator(".row-end-actions > button");
  await expect(controls).toHaveCount(count);
  const dimensions = await cell.evaluate((element) => {
    const header = element.closest("table").querySelector("th.row-action-col");
    const actions = element.querySelector(".row-end-actions");
    const buttons = [...actions.querySelectorAll(":scope > button")];
    const rect = element.getBoundingClientRect();
    const heading = header.getBoundingClientRect();
    const bounds = buttons.map((button) => button.getBoundingClientRect());
    const style = getComputedStyle(element);
    const headingStyle = getComputedStyle(header);
    const range = document.createRange();
    range.selectNodeContents(header);
    const label = range.getBoundingClientRect();
    return {
      cellWidth: rect.width,
      headingWidth: heading.width,
      padding: [
        style.paddingLeft,
        style.paddingRight,
        headingStyle.paddingLeft,
        headingStyle.paddingRight,
      ],
      firstLeft: bounds[0].left - rect.left,
      headingLeft: label.left - heading.left,
      gaps: bounds
        .slice(1)
        .map((button, index) => button.left - bounds[index].right),
      sizes: bounds.map((button) => [button.width, button.height]),
      labelFits: label.left >= heading.left && label.right <= heading.right,
      controlsFit: bounds.every(
        (button) =>
          button.left >= rect.left &&
          button.right <= rect.right - parseFloat(style.paddingRight) + 1,
      ),
      justification: getComputedStyle(actions).justifyContent,
    };
  });
  expect(dimensions.cellWidth).toBeLessThanOrEqual(maximumWidth);
  expect(
    Math.abs(dimensions.cellWidth - dimensions.headingWidth),
  ).toBeLessThanOrEqual(1);
  expect(dimensions.padding).toEqual(["8px", "8px", "8px", "8px"]);
  expect(
    Math.abs(dimensions.firstLeft - dimensions.headingLeft),
  ).toBeLessThanOrEqual(1);
  expect(dimensions.firstLeft).toBeCloseTo(8, 0);
  expect(dimensions.sizes).toEqual(
    Array.from({ length: count }, () => [30, 30]),
  );
  for (const gap of dimensions.gaps) expect(gap).toBeCloseTo(6, 0);
  expect(dimensions.justification).toBe("flex-start");
  expect(dimensions.labelFits).toBe(true);
  expect(dimensions.controlsFit).toBe(true);
  await expect(header).toHaveCSS("text-align", "left");
  await expect(cell).toHaveCSS("text-align", "left");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("action headers and controls share compact left alignment across meeting, goal and waiting tables in both themes and narrow screens", async ({
  page,
}) => {
  const source = make({
    id: "compact-meeting",
    type: "meeting",
    title: "Kompakt işlem sütunu için gerçek toplantı kararı",
    decision: "Özgün teknik karar ve bağlantı bilgileri korunur.",
    status: "in_progress",
    sourceDate: "2026-11-05",
  });
  const daily = make({
    id: "compact-meeting-daily",
    title: "Toplantıya bağlı gerçek günlük iş",
    status: "in_progress",
    dueDate: "2026-11-12",
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  });
  const goal = make({
    id: "compact-weekly",
    type: "weekly",
    title: "İki hedef işlemi olan haftalık plan",
    periodKey: "2026-W45",
    status: "in_progress",
  });
  const waiting = make({
    id: "compact-waiting",
    type: "waiting",
    title: "Üç işlemli gerçek bekleyen konu",
    status: "follow_up",
    expectedFrom: "Dış ekip",
    latestUpdate: "Teklif istendi.",
    sourceDate: "2026-11-01",
    nextFollowUpDate: "2026-11-12",
  });
  const initial = JSON.stringify({
    version: 1,
    records: [source, daily, goal, waiting],
    odak: {
      version: 1,
      preferences: { density: "compact", theme: "light" },
      history: [],
    },
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, initial }) => {
      if (sessionStorage.getItem("compact-meeting-seeded")) return;
      localStorage.setItem(key, initial);
      sessionStorage.setItem("compact-meeting-seeded", "1");
    },
    { key: KEY, initial },
  );
  await page.goto("/");
  expect(await saved(page)).toBe(initial);

  const table = page.locator(".meeting-table");
  const row = table.locator(`[data-record-row][data-id="${source.id}"]`);
  const pencil = row.locator(
    'td.row-action-col .record-edit-trigger[data-action="edit"]',
  );
  const form = page.locator("#editor #record-form");
  const cancel = () =>
    page
      .locator("#editor")
      .getByRole("button", { name: "Vazgeç", exact: true })
      .click();

  for (const theme of ["light", "dark"]) {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
      { width: 390, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await navigate(page, "meeting");
      // Preview the palette without adding a preference save to the data audit.
      await page.locator("html").evaluate((element, value) => {
        element.dataset.theme = value;
      }, theme);
      await expect(table.locator("thead th")).toHaveText([
        "Aksiyon / Karar",
        "Durum",
        "Bağlı iş",
        "Takip",
        "İşlem",
      ]);
      await expectActionAlignment(page, table, source.id, {
        count: 1,
        maximumWidth: 60,
      });

      await row.locator(".task-name").click();
      const preview = page.locator("#meeting-record-panel");
      await expect(preview).toHaveAttribute("data-record-id", source.id);
      await expect(preview).toBeVisible();
      const previewBounds = await preview.boundingBox();
      expect(previewBounds.x).toBeGreaterThanOrEqual(0);
      expect(previewBounds.y).toBeGreaterThanOrEqual(0);
      expect(previewBounds.x + previewBounds.width).toBeLessThanOrEqual(
        viewport.width,
      );
      expect(previewBounds.y + previewBounds.height).toBeLessThanOrEqual(
        viewport.height,
      );
      await preview.getByRole("button", { name: "Kapat", exact: true }).click();

      await pencil.click();
      await expect(page.locator("#editor")).toBeVisible();
      await expect(form.locator('[name="id"]')).toHaveValue(source.id);
      await expect(form.locator('select[name="type"]')).toHaveValue("meeting");
      await expect(form.locator('[name="title"]')).toHaveValue(source.title);
      await cancel();
      await expect(page.locator("#editor")).not.toBeVisible();
      expect(await saved(page)).toBe(initial);

      const dailyRoute = row.locator(
        '.meeting-linked-cell[data-route="daily"] .meeting-route',
      );
      const waitingRoute = row.locator(
        '.meeting-linked-cell[data-route="waiting"] .meeting-route',
      );
      await expect(dailyRoute).toHaveText("İşi aç");
      await expect(waitingRoute).toHaveText("Takip oluştur");
      for (const route of [dailyRoute, waitingRoute]) {
        const bounds = await route.boundingBox();
        // The same 96x30 box as the other lists, with its text fully shown.
        expect(Math.round(bounds.width)).toBe(96);
        expect(bounds.height).toBe(30);
        expect(
          await route.evaluate(
            (item) => item.scrollWidth <= item.clientWidth + 1,
          ),
        ).toBe(true);
      }
      await dailyRoute.click();
      await expect(form.locator('[name="id"]')).toHaveValue(daily.id);
      await expect(form.locator('select[name="type"]')).toHaveValue("daily");
      await cancel();
      await waitingRoute.click();
      await expect(form).toHaveAttribute("data-creation", "true");
      await expect(form.locator('select[name="type"]')).toHaveValue("waiting");
      await expect(form.locator('[name="title"]')).toHaveValue(source.title);
      await cancel();
      await expect(page.locator("#editor")).not.toBeVisible();
      await expect(page.locator("#page-title")).toHaveText(
        "Toplantı aksiyonları",
      );
      expect(await saved(page)).toBe(initial);

      for (const [view, id, selector, count, maximumWidth, editClass] of [
        ["weekly", goal.id, ".record-table", 2, 100, ".goal-edit-trigger"],
        [
          "waiting",
          waiting.id,
          ".waiting-table",
          2,
          100,
          ".record-edit-trigger",
        ],
      ]) {
        await navigate(page, view);
        await page.locator("html").evaluate((element, value) => {
          element.dataset.theme = value;
        }, theme);
        const currentTable = page.locator(selector);
        await expectActionAlignment(page, currentTable, id, {
          count,
          maximumWidth,
        });
        await currentTable
          .locator(
            `[data-record-row][data-id="${id}"] td.row-action-col ${editClass}`,
          )
          .click();
        await expect(page.locator("#editor")).toBeVisible();
        await expect(form.locator('[name="id"]')).toHaveValue(id);
        await expect(form.locator('select[name="type"]')).toHaveValue(view);
        await cancel();
        await expect(page.locator("#editor")).not.toBeVisible();
        expect(await saved(page)).toBe(initial);
      }
    }
  }
  await page.reload();
  expect(await saved(page)).toBe(initial);
});
