import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-07T09:00:00.000Z";
const LONG_METRIC = [
  "Üretim raporlarının kontrolü, test sonuçlarının karşılaştırılması ve yayın dosyalarının tamamlanması. ".repeat(
    3,
  ),
  `İkinci satırdaki ürün kodları: ${"X00000001".repeat(14)}`,
  '<img src=x onerror="window.__progressMetricExecuted=1"> <script>window.__progressMetricExecuted=2</script>',
].join("\n");
const record = (value) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...value });

function fixture() {
  return [
    record({
      id: "progress-yearly",
      type: "yearly",
      title: "Uzun ölçümlü senelik hedef",
      targetValue: 100,
      currentValue: 5,
      metric: LONG_METRIC,
      periodKey: "2026",
      dueDate: "2026-12-20",
    }),
    record({
      id: "progress-monthly",
      type: "monthly",
      title: "Alt hedeflerden hesaplanan aylık hedef",
      goalParentId: "progress-yearly",
      periodKey: "2026-11",
      dueDate: "2026-11-25",
    }),
    record({
      id: "progress-weekly",
      type: "weekly",
      title: "Günlük işlerden hesaplanan haftalık hedef",
      goalParentId: "progress-monthly",
      periodKey: "2026-W45",
      dueDate: "2026-11-08",
    }),
    record({
      id: "progress-weekly-numeric",
      type: "weekly",
      title: "Sayısal haftalık alt hedef",
      goalParentId: "progress-monthly",
      targetValue: 10,
      currentValue: 5,
      metric: "Rapor",
      periodKey: "2026-W45",
      dueDate: "2026-11-08",
    }),
    record({
      id: "progress-weekly-done",
      type: "weekly",
      title: "Tamamlanan haftalık alt hedef",
      goalParentId: "progress-monthly",
      status: "completed",
      periodKey: "2026-W45",
      dueDate: "2026-11-08",
    }),
    record({
      id: "progress-daily-done",
      title: "Tamamlanan günlük adım",
      parentId: "progress-weekly",
      status: "completed",
      dueDate: "2026-11-06",
    }),
    record({
      id: "progress-daily-open",
      title: "Açık günlük adım",
      parentId: "progress-weekly",
      dueDate: "2026-11-07",
    }),
    record({
      id: "progress-empty",
      type: "yearly",
      title: "Henüz ölçümü olmayan senelik hedef",
      periodKey: "2026",
      dueDate: "2026-12-21",
    }),
    record({
      id: "progress-completed",
      type: "yearly",
      title: "Tamamlanan senelik hedef",
      status: "completed",
      periodKey: "2026",
      dueDate: "2026-12-22",
    }),
  ];
}

const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-id="${id}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

async function openList(page, type) {
  await page.locator(`#nav [data-view="${type}"]`).click();
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
}

for (const width of [1280, 1920]) {
  test(`goal progress keeps long metric details readable and all calculation bases unchanged at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-11-07T12:00:00.000Z"));
    const items = fixture();
    const original = JSON.stringify({
      version: 1,
      records: items,
      odak: { version: 1, preferences: { density: "compact" }, history: [] },
    });
    await page.addInitScript(
      ({ key, original }) => localStorage.setItem(key, original),
      { key: KEY, original },
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#page-title")).toHaveText("Genel bakış");
    expect(await saved(page)).toBe(original);

    await openList(page, "yearly");
    const numeric = row(page, "progress-yearly");
    await expect(numeric.locator(".goal-progress-summary > span")).toHaveText(
      "5 / 100",
    );
    // The percent sits in the progress box's value and tooltip.
    await expect(
      numeric.locator(".metric-cell .progress-chip"),
    ).toHaveAttribute("title", `%5 · 5 / 100 ${LONG_METRIC}`);
    await expect(
      numeric.locator('.metric-cell [role="progressbar"]'),
    ).toHaveAttribute("aria-valuenow", "5");
    expect(await numeric.locator(".metric-cell").textContent()).not.toContain(
      LONG_METRIC,
    );

    await expect(
      numeric.locator(".goal-progress-info, .metric-cell button"),
    ).toHaveCount(0);
    const details = numeric.locator('.task-name[data-action="goal-details"]');
    await expect(details).toHaveText("Uzun ölçümlü senelik hedef");
    await expect(numeric.locator(".goal-details-trigger")).toHaveCount(0);
    await details.click();
    const panel = page.locator("#goal-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-goal-id", "progress-yearly");
    await expect(panel.locator("#goal-next-step-form")).toHaveCount(0);
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(panel.locator(".goal-panel-progress")).toHaveAttribute(
      "data-progress-basis",
      "metric",
    );
    await expect(
      panel.locator('.goal-panel-progress [role="progressbar"]'),
    ).toHaveAttribute("aria-valuenow", "5");
    const description = panel.locator(".goal-panel-metric");
    expect(await description.textContent()).toBe(`5 / 100 ${LONG_METRIC}`);
    const geometry = await description.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 1);
    expect(geometry.height).toBeGreaterThan(geometry.lineHeight * 2);
    await expect(
      panel.locator(".goal-panel-metric img, .goal-panel-metric script"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__progressMetricExecuted),
    ).toBeUndefined();
    expect(await saved(page)).toBe(original);
    await page.keyboard.press("Escape");
    await numeric.locator('.goal-edit-trigger[data-action="edit"]').click();
    await expect(page.locator("#editor")).toBeVisible();
    await expect(page.locator('#record-form [name="id"]')).toHaveValue(
      "progress-yearly",
    );
    await expect(panel).not.toBeVisible();
    await page
      .locator("#editor")
      .getByRole("button", { name: "Vazgeç", exact: true })
      .click();
    expect(await saved(page)).toBe(original);

    for (const example of [
      {
        type: "weekly",
        id: "progress-weekly",
        summary: "1 / 2",
        percent: 50,
        basis: "linked",
        explanation: "1 / 2 günlük iş tamamlandı",
      },
      {
        type: "monthly",
        id: "progress-monthly",
        // A roll-up has no count of its own, so its box shows the percent.
        summary: "%67",
        percent: 67,
        basis: "rollup",
        explanation: "3 bağlı haftalık hedefin ortalaması",
      },
      {
        type: "yearly",
        id: "progress-empty",
        summary: "Ölçüm yok",
        percent: 0,
        basis: "status",
        explanation: "Henüz ilerleme yok",
      },
      {
        type: "yearly",
        id: "progress-completed",
        summary: "Tamamlandı",
        percent: 100,
        basis: "status",
        explanation: "Hedef tamamlandı",
      },
    ]) {
      await openList(page, example.type);
      const target = row(page, example.id);
      await expect(target.locator(".goal-progress-summary > span")).toHaveText(
        example.summary,
      );
      await expect(
        target.locator('.metric-cell [role="progressbar"]'),
      ).toHaveAttribute("aria-valuenow", String(example.percent));
      await expect(
        target.locator(".metric-cell .progress-chip"),
      ).toHaveAttribute(
        "title",
        `%${example.percent} · ${example.explanation}`,
      );
      await expect(
        target.locator(".goal-progress-info, .metric-cell button"),
      ).toHaveCount(0);
      const targetTitle = target.locator(
        '.task-name[data-action="goal-details"]',
      );
      await expect(targetTitle).toHaveAttribute("data-id", example.id);
      await expect(target.locator(".goal-details-trigger")).toHaveCount(0);
      await expect(
        target.locator('.goal-edit-trigger[data-action="edit"]'),
      ).toHaveAttribute("data-id", example.id);
      await targetTitle.click();
      await expect(panel).toHaveAttribute("data-goal-id", example.id);
      await expect(panel.locator(".goal-panel-progress")).toHaveAttribute(
        "data-progress-basis",
        example.basis,
      );
      await expect(
        panel.locator('.goal-panel-progress [role="progressbar"]'),
      ).toHaveAttribute("aria-valuenow", String(example.percent));
      await page.keyboard.press("Escape");
      expect(await saved(page)).toBe(original);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(JSON.parse(await saved(page)).records).toEqual(items);
    expect(errors).toEqual([]);
  });
}
