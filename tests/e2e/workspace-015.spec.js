import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";
import { completeGoalTransfer } from "./goal-transfer-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const envelope = (records) => ({
  version: 1,
  records,
  odak: {
    version: 1,
    preferences: { density: "comfortable" },
    history: [],
  },
});
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const records = async (page) => (await stored(page)).records;
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const form = (page) => page.locator("#record-form");
const panel = (page) => page.locator("#goal-detail-panel");
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-id="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

async function seed(page, items, { pause = true } = {}) {
  await page.clock.install({ time: NOW });
  if (pause) await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("workspace-015-seeded")) return;
      localStorage.setItem(key, value);
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("workspace-015-seeded", "1");
    },
    { key: KEY, value: JSON.stringify(envelope(items)) },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  return page.locator(
    '#settings-dialog [role="radiogroup"][aria-label="Tema"]',
  );
}

async function openGoal(page, type, id) {
  await view(page, type);
  await row(page, id).locator('.task-name[data-action="goal-details"]').click();
  await expect(panel(page)).toBeVisible();
}

async function openPrompt(page, kind, id) {
  await page.locator(`.planning-prompts [data-prompt="${kind}"]`).click();
  const dialog = page.locator("#planning-prompts-dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .locator(
      `[data-prompt-record="${id}"] [data-action="planning-prompt-record"]`,
    )
    .click();
  await expect(dialog).not.toBeVisible();
}

test("theme choices survive reload and undo while the widget follows without changing work records", async ({
  page,
}) => {
  const fixture = [
    record({ id: "theme-task", title: "Temadan bağımsız günlük iş" }),
  ];
  await page.emulateMedia({ colorScheme: "dark" });
  await seed(page, fixture, { pause: false });
  const original = await saved(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const opening = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Widget aç", exact: true }).click();
  const widget = await opening;
  await widget.emulateMedia({ colorScheme: "dark" });
  await expect(widget.locator("#widget-open-main")).toBeVisible();
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await saved(widget)).toBe(original);

  let themes = await openSettings(page);
  await expect(themes.locator('[value="light"]')).toBeChecked();
  await themes.locator('[value="dark"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await stored(page)).odak.preferences.theme).toBe("dark");
  expect(await records(page)).toEqual(fixture);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await undo(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await saved(page)).toBe(original);

  themes = await openSettings(page);
  await themes.locator('[value="system"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "dark");
  const systemSaved = await saved(page);
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await widget.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      colorScheme,
    );
    await expect(widget.locator("html")).toHaveAttribute(
      "data-theme",
      colorScheme,
    );
    expect(await saved(page)).toBe(systemSaved);
    expect(await saved(widget)).toBe(systemSaved);
  }
  await themes.locator('[value="light"]').check();
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect((await stored(page)).odak.preferences.theme).toBe("light");
  await undo(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await saved(page)).toBe(systemSaved);
  await undo(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(widget.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await saved(page)).toBe(original);
  expect(await records(page)).toEqual(fixture);
  await widget.close();
});

test("compact list controls keep their native whole-card targets and filter work without editing records", async ({
  page,
}) => {
  const fixture = [
    record({
      id: "filter-active",
      title: "Öncelikli açık iş",
      status: "in_progress",
      priority: "high",
    }),
    record({
      id: "filter-planned",
      title: "Planlı normal iş",
      status: "planned",
    }),
    record({ id: "filter-completed", title: "Biten iş", status: "completed" }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  await view(page, "daily");
  const bar = page.locator(".list-controls-bar");
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(bar.locator(".list-scope-tabs")).toBeVisible();
    await expect(bar.locator("#list-sort")).toBeVisible();
    const card = bar.locator(".filter-surface:has(#status-filter)");
    const geometry = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        x: rect.left + 6,
        y: rect.top + 6,
        hits: [
          [rect.left + 5, rect.top + 5],
          [rect.right - 5, rect.bottom - 5],
        ].map(([x, y]) => document.elementFromPoint(x, y)?.id),
      };
    });
    expect(geometry.height).toBeLessThanOrEqual(36);
    expect(geometry.hits).toEqual(["status-filter", "status-filter"]);
    await page.mouse.click(geometry.x, geometry.y);
    await page.keyboard.press("Escape");
    await expect(bar.locator("#status-filter")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await bar.locator("#status-filter").selectOption("in_progress");
  await expect(
    bar.locator(".filter-surface:has(#status-filter) .filter-value"),
  ).toHaveText("Devam ediyor");
  await expect(
    page.locator(".full-table > tbody > tr[data-record-row]"),
  ).toHaveCount(1);
  await expect(row(page, "filter-active")).toBeVisible();
  await bar
    .locator('[data-action="list-scope"][data-scope="completed"]')
    .click();
  await expect(bar.locator("#status-filter")).toHaveCount(0);
  await expect(row(page, "filter-completed")).toBeVisible();
  await bar.locator('[data-action="list-scope"][data-scope="open"]').click();
  await expect(bar.locator("#status-filter")).toHaveValue("all");
  await expect(
    page.locator(".full-table > tbody > tr[data-record-row]"),
  ).toHaveCount(2);
  expect(await saved(page)).toBe(original);
});

test("planning suggestions open the relevant context, keep waiting details optional, and disappear when nothing needs planning", async ({
  page,
}) => {
  const fixture = [
    record({
      id: "prompt-goal",
      type: "weekly",
      title: "Adımlara ayrılabilecek hedef",
      periodKey: "2026-W45",
    }),
    record({
      id: "prompt-previous",
      type: "weekly",
      title: "Önceki haftadan kalan hedef",
      periodKey: "2026-W44",
      status: "in_progress",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "prompt-waiting",
      title: "İsteğe bağlı bilgi bekleyen iş",
      status: "waiting",
      waitingReason: "",
      nextAction: "",
    }),
    record({
      id: "prompt-review",
      title: "Gözden geçirilecek eski iş",
      updatedAt: "2026-10-31T12:00:00.000Z",
      description: "Özgün açıklama korunur.",
    }),
    record({
      id: "prompt-previous-child",
      title: "Eski hedefe bağlı bitmiş günlük iş",
      status: "completed",
      parentId: "prompt-previous",
    }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  await expect(page.locator(".planning-prompts")).toBeVisible();
  expect(
    await page
      .locator('.planning-prompts [data-action="planning-prompt"]')
      .evaluateAll((items) => items.map((item) => item.dataset.prompt)),
  ).toEqual(["goals", "waiting", "review", "previous"]);
  await expect(page.locator(".stat-card, .stats-grid")).toHaveCount(0);
  await openPrompt(page, "goals", "prompt-goal");
  await expect(panel(page).locator(".goal-panel-title")).toHaveText(
    fixture[0].title,
  );
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(original);
  await openPrompt(page, "review", "prompt-review");
  await expect(form(page).locator('[name="id"]')).toHaveValue("prompt-review");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="description"]')).toHaveValue(
    fixture[3].description,
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(original);

  await page.locator('.planning-prompts [data-prompt="waiting"]').click();
  await expect(
    page.locator("#planning-prompts-dialog .field-help"),
  ).toContainText("kimden beklendiğini ve son gelişmeyi");
  await expect(
    page.locator("#planning-prompts-dialog .field-help"),
  ).not.toContainText("neden ve sonraki adımı");
  await page
    .locator(
      '#planning-prompts-dialog [data-prompt-record="prompt-waiting"] button',
    )
    .click();
  const details = page.locator("#waiting-details-dialog");
  await expect(details).toBeVisible();
  await details
    .locator('[name="waitingReason"]')
    .fill("Test raporunu ekipten bekliyorum.");
  await expect(details.locator('[name="nextAction"]')).toHaveCount(0);
  await details
    .getByRole("button", { name: "Bekleme bilgisini kaydet", exact: true })
    .click();
  await expect(
    page.locator('.planning-prompts [data-prompt="waiting"]'),
  ).toHaveCount(0);
  expect(
    (await records(page)).find((item) => item.id === "prompt-waiting"),
  ).toEqual({
    ...fixture.find((item) => item.id === "prompt-waiting"),
    waitingReason: "Test raporunu ekipten bekliyorum.",
    updatedAt: NOW.toISOString(),
  });
  await undo(page);
  expect(await saved(page)).toBe(original);
  await openPrompt(page, "previous", "prompt-previous");
  await expect(panel(page).locator(".goal-panel-title")).toHaveText(
    fixture[1].title,
  );
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(original);
  await page.locator('.planning-prompts [data-prompt="previous"]').click();
  await page
    .locator(
      '#planning-prompts-dialog [data-prompt-record="prompt-previous"] [data-action="carry-weekly"]',
    )
    .click();
  await completeGoalTransfer(page);
  await expect(
    page.locator("#planning-prompts-dialog .planning-prompt-list"),
  ).toHaveCount(0);
  const carried = await records(page);
  const moved = carried.find((item) => item.id === "prompt-previous");
  expect(moved.periodKey).toBe("2026-W45");
  expect(moved.status).toBe("in_progress");
  expect(moved.currentValue).toBe(4);
  expect(carried.find((item) => item.id === "prompt-previous-child")).toEqual(
    fixture[4],
  );
  expect(carried).toHaveLength(fixture.length);
  await page.keyboard.press("Escape");
  await expect(
    page.locator('.planning-prompts [data-prompt="previous"]'),
  ).toHaveCount(0);
  await undo(page);
  expect(await saved(page)).toBe(original);

  const clear = JSON.stringify(
    envelope([
      record({
        id: "clear-goal",
        type: "weekly",
        title: "Ölçümü belirli hedef",
        periodKey: "2026-W45",
        targetValue: 10,
        currentValue: 2,
      }),
      record({ id: "clear-work", title: "Yeni güncellenmiş günlük iş" }),
      record({
        id: "clear-previous",
        type: "weekly",
        title: "Bitmiş eski hedef",
        periodKey: "2026-W44",
        status: "completed",
      }),
    ]),
  );
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: KEY,
    value: clear,
  });
  await page.reload();
  await expect(page.locator(".planning-prompts")).toHaveCount(0);
  await expect(page.locator(".stat-card, .stats-grid")).toHaveCount(0);
  expect(await saved(page)).toBe(clear);
});

test("goal links are explicit and undoable, roll up their immediate children, and preserve an existing completed parent", async ({
  page,
}) => {
  const fixture = [
    record({
      id: "hierarchy-year",
      type: "yearly",
      title: "Senelik yön",
      periodKey: "2026",
      status: "in_progress",
    }),
    record({
      id: "hierarchy-month",
      type: "monthly",
      title: "Aylık alt hedef",
      periodKey: "2026-11",
      status: "in_progress",
    }),
    record({
      id: "hierarchy-measured",
      type: "monthly",
      title: "Ölçümü esas alınan aylık hedef",
      periodKey: "2026-11",
      targetValue: 10,
      currentValue: 3,
      metric: "Rapor",
      goalParentId: "hierarchy-year",
    }),
    record({
      id: "hierarchy-week",
      type: "weekly",
      title: "Bağlanacak haftalık hedef",
      periodKey: "2026-W45",
      targetValue: 2,
      currentValue: 1,
      metric: "Rapor",
    }),
    record({
      id: "hierarchy-done-week",
      type: "weekly",
      title: "Aylık hedefin bitmiş haftası",
      periodKey: "2026-W44",
      status: "completed",
      goalParentId: "hierarchy-month",
    }),
    record({
      id: "hierarchy-measured-child",
      type: "weekly",
      title: "Ölçümlü aylık hedefin bitmiş haftası",
      periodKey: "2026-W44",
      status: "completed",
      goalParentId: "hierarchy-measured",
    }),
    record({
      id: "hierarchy-closed-month",
      type: "monthly",
      title: "Tamamlanmış aylık üst hedef",
      periodKey: "2026-10",
      status: "completed",
    }),
    record({
      id: "hierarchy-closed-link",
      type: "weekly",
      title: "Kapalı üst hedefe mevcut bağlantı",
      periodKey: "2026-W45",
      goalParentId: "hierarchy-closed-month",
      sourceFields: { original: "korunur" },
    }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  expect(await records(page)).toEqual(fixture);
  await openGoal(page, "monthly", "hierarchy-month");
  await panel(page)
    .locator('#goal-link-child-form [name="childId"]')
    .selectOption("hierarchy-week");
  await panel(page).locator('#goal-link-child-form [type="submit"]').click();
  await expect(panel(page).locator(".goal-panel-progress")).toHaveAttribute(
    "data-progress-basis",
    "rollup",
  );
  await expect(
    panel(page).locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "75");
  let linked = await records(page);
  expect(linked.find((item) => item.id === "hierarchy-week").goalParentId).toBe(
    "hierarchy-month",
  );
  expect(linked.find((item) => item.id === "hierarchy-month")).toEqual(
    fixture[1],
  );
  await page.keyboard.press("Escape");
  await openGoal(page, "yearly", "hierarchy-year");
  await panel(page)
    .locator('#goal-link-child-form [name="childId"]')
    .selectOption("hierarchy-month");
  await panel(page).locator('#goal-link-child-form [type="submit"]').click();
  await expect(
    panel(page).locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "53");
  linked = await records(page);
  expect(linked.find((item) => item.id === "hierarchy-year")).toEqual(
    fixture[0],
  );
  expect(linked.find((item) => item.id === "hierarchy-month").status).toBe(
    "in_progress",
  );
  await panel(page)
    .locator('[data-action="goal-open-child"][data-id="hierarchy-measured"]')
    .first()
    .click();
  await expect(panel(page).locator(".goal-panel-progress")).toHaveAttribute(
    "data-progress-basis",
    "metric",
  );
  await expect(
    panel(page).locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "30");
  await expect(panel(page).locator(".goal-child-row")).toHaveCount(1);
  await undo(page);
  await undo(page);
  expect(await saved(page)).toBe(original);
  await page.keyboard.press("Escape");

  for (const [type, parentId, childType] of [
    ["yearly", "hierarchy-year", "monthly"],
    ["monthly", "hierarchy-month", "weekly"],
  ]) {
    await openGoal(page, type, parentId);
    await panel(page).locator('[data-action="goal-new-step"]').click();
    await expect(form(page).locator('[name="type"]')).toHaveValue(childType);
    await expect(form(page).locator("#higher-goal-select")).toHaveValue(
      parentId,
    );
    await closeEditor(page);
    expect(await saved(page)).toBe(original);
  }
  await view(page, "weekly");
  await row(page, "hierarchy-closed-link").locator(".task-name").click();
  await expect(form(page).locator("#higher-goal-select")).toHaveValue(
    "hierarchy-closed-month",
  );
  await expect(
    form(page).locator(
      '#higher-goal-select option[value="hierarchy-closed-month"]',
    ),
  ).toContainText("Tamamlandı");
  await openCreationExtras(page);
  await form(page)
    .locator('[name="description"]')
    .fill("Mevcut bağlantıyı koruyan açıklama.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect(
    (await records(page)).find((item) => item.id === "hierarchy-closed-link")
      .goalParentId,
  ).toBe("hierarchy-closed-month");
  await undo(page);
  expect(await saved(page)).toBe(original);
});
