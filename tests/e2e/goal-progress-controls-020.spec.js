import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const panel = (page) => page.locator("#goal-detail-panel");
const controls = (page) => panel(page).locator("#goal-progress-form");
const progressInput = (page) => controls(page).locator('[name="currentValue"]');
const progressAction = (page, action) =>
  controls(page).locator(`[data-action="goal-progress-${action}"]`);
const progressBar = (page) =>
  panel(page).locator('.goal-panel-progress [role="progressbar"]');
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const list = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closePanel = (page) =>
  panel(page).locator('[data-action="goal-panel-close"]').last().click();

function fixture() {
  const goal = (id, type, input = {}) =>
    record({
      id,
      type,
      title: `Hedef ${id}`,
      status: "in_progress",
      periodKey: { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[
        type
      ],
      nextAction: `Özgün ${id} sonraki adımı`,
      ...input,
    });
  return [
    goal("year-rollup", "yearly"),
    goal("month-rollup", "monthly", { goalParentId: "year-rollup" }),
    goal("week-metric", "weekly", {
      goalParentId: "month-rollup",
      targetValue: 4,
      currentValue: 1,
      metric: "Rapor",
      priority: "urgent",
      dueDate: "2026-11-08",
      description: "Özgün haftalık not korunmalı.",
      projectCode: "ÖZGÜN-42",
      category: "Gerçek kategori",
      owner: "Sorumlu kişi",
      sourceFields: { "Özgün kaynak": { value: "Korunacak ham bilgi" } },
      workLog: [
        {
          id: "metric-history",
          date: "2026-11-01",
          endedAt: "2026-11-01T09:00:00.000Z",
          durationMs: 60_000,
          note: "Gerçek geçmiş sonucu",
          nextAction: "Geçmişteki sonraki adım",
        },
      ],
    }),
    record({
      id: "metric-child",
      title: "Ölçümlü hedefin tamamlanmış günlük işi",
      parentId: "week-metric",
      status: "completed",
      dueDate: "2026-11-06",
    }),
    goal("year-month-rollup", "yearly"),
    goal("month-metric", "monthly", {
      goalParentId: "year-month-rollup",
      targetValue: 4,
      currentValue: 1,
      metric: "Yayın",
      dueDate: "2026-11-20",
    }),
    goal("year-metric", "yearly", {
      targetValue: 4,
      currentValue: 1,
      metric: "Teslim",
      dueDate: "2026-12-20",
    }),
    goal("year-derived", "yearly"),
    goal("month-derived", "monthly", { goalParentId: "year-derived" }),
    goal("week-derived", "weekly", {
      goalParentId: "month-derived",
      dueDate: "2026-11-08",
    }),
    record({
      id: "derived-done",
      title: "Tamamlanmış bağlı günlük iş",
      parentId: "week-derived",
      status: "completed",
      dueDate: "2026-11-06",
    }),
    record({
      id: "derived-open",
      title: "Tamamlanacak bağlı günlük iş",
      parentId: "week-derived",
      dueDate: "2026-11-08",
    }),
    record({
      id: "derived-cancelled",
      title: "İptal edilen bağlı günlük iş",
      parentId: "week-derived",
      status: "cancelled",
    }),
    goal("week-null", "weekly", {
      targetValue: 4,
      currentValue: null,
      metric: "Parça",
      priority: "high",
    }),
    goal("closed-week", "weekly", {
      status: "completed",
      targetValue: 4,
      currentValue: 2,
    }),
    goal("closed-month", "monthly", {
      status: "cancelled",
      targetValue: 4,
      currentValue: 2,
    }),
    goal("closed-year", "yearly", {
      status: "transferred",
      targetValue: 4,
      currentValue: 2,
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("goal-progress-controls-020-seeded")) return;
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
      sessionStorage.setItem("goal-progress-controls-020-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

async function openGoal(page, type, id, scope = "open") {
  if (await panel(page).isVisible()) await closePanel(page);
  await list(page, type);
  await page
    .locator(`[data-action="list-scope"][data-scope="${scope}"]`)
    .click();
  await row(page, id).locator('.task-name[data-action="goal-details"]').click();
  await expect(panel(page)).toBeVisible();
}

async function expectTableProgress(page, type, id, percent) {
  if (await panel(page).isVisible()) await closePanel(page);
  await list(page, type);
  await expect(
    row(page, id).locator('.metric-cell [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", String(percent));
}

test("weekly, monthly and yearly panels render human periods and readable child dates without rewriting saved goals", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  for (const [type, id, period] of [
    ["weekly", "week-metric", "2 – 8 Kasım 2026"],
    ["monthly", "month-metric", "Kasım 2026"],
    ["yearly", "year-metric", "2026"],
  ]) {
    await openGoal(page, type, id);
    await expect(panel(page).locator(".goal-panel-period")).toContainText(
      period,
    );
    await expect(panel(page).locator(".goal-panel-period")).not.toContainText(
      "2026-W45",
    );
    await expect(panel(page).locator(".goal-panel-period")).not.toContainText(
      "2026-11",
    );
    await expect(controls(page)).toBeVisible();
    await expect(progressInput(page)).toHaveValue("1");
    await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "25");
    await expect(panel(page).locator("#goal-next-step-form")).toBeVisible();
    expect(await saved(page)).toBe(before);
  }
  await openGoal(page, "weekly", "week-derived");
  const openChildDate = panel(page).locator(
    '.goal-child-row[data-id="derived-open"] .goal-child-meta button[data-action="edit-date"]',
  );
  await expect(openChildDate.locator(".deadline-label")).toHaveText("8 Kas");
  await expect(openChildDate).toBeEnabled();
  await expect(openChildDate).toHaveAttribute("data-id", "derived-open");
  const closedChild = panel(page).locator(
    '.goal-child-row[data-id="derived-done"]',
  );
  await expect(
    closedChild.locator(".goal-child-date .deadline-label"),
  ).toHaveText("6 Kas");
  await expect(closedChild.locator('[data-action="edit-date"]')).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});

test("quick metric edits update tables, the Dashboard and derived ancestors as one exact undoable change that survives reload", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const example of [
    {
      type: "weekly",
      id: "week-metric",
      action: "increment",
      value: 2,
      percent: 50,
      ancestors: [
        ["monthly", "month-rollup"],
        ["yearly", "year-rollup"],
      ],
    },
    {
      type: "weekly",
      id: "week-metric",
      action: "decrement",
      value: 0,
      percent: 0,
      ancestors: [
        ["monthly", "month-rollup"],
        ["yearly", "year-rollup"],
      ],
    },
    {
      type: "monthly",
      id: "month-metric",
      value: 3,
      percent: 75,
      ancestors: [["yearly", "year-month-rollup"]],
    },
    {
      type: "yearly",
      id: "year-metric",
      action: "target",
      value: 4,
      percent: 100,
      ancestors: [],
    },
  ]) {
    await openGoal(page, example.type, example.id);
    if (example.action) await progressAction(page, example.action).click();
    else {
      await progressInput(page).fill(String(example.value));
      await controls(page)
        .getByRole("button", { name: "Değeri kaydet", exact: true })
        .click();
    }
    await expect(progressBar(page)).toHaveAttribute(
      "aria-valuenow",
      String(example.percent),
    );
    const after = await store(page);
    const old = original.find((record) => record.id === example.id);
    const changed = after.records.find((record) => record.id === example.id);
    expect(changed.currentValue).toBe(example.value);
    expect({
      ...changed,
      currentValue: old.currentValue,
      updatedAt: old.updatedAt,
    }).toEqual(old);
    expect(after.records.filter((record) => record.id !== old.id)).toEqual(
      original.filter((record) => record.id !== old.id),
    );
    expect(after.odak.history).toHaveLength(1);
    await expectTableProgress(page, example.type, example.id, example.percent);
    if (example.type === "weekly") {
      await list(page, "dashboard");
      await expect(
        page.locator(
          `.dashboard-goal-row[data-goal-id="${example.id}"] [role="progressbar"]`,
        ),
      ).toHaveAttribute("aria-valuenow", String(example.percent));
    }
    for (const [type, id] of example.ancestors)
      await expectTableProgress(page, type, id, example.percent);
    const afterSaved = await saved(page);
    await page.reload();
    expect(await saved(page)).toBe(afterSaved);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
});

test("derived goals use child actions and never create their own numeric measurement or automatically complete a parent", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const [type, id, childType] of [
    ["weekly", "week-derived", "daily"],
    ["monthly", "month-derived", "weekly"],
    ["yearly", "year-derived", "monthly"],
  ]) {
    await openGoal(page, type, id);
    await expect(controls(page)).toHaveCount(0);
    await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "50");
    await panel(page).locator('[data-action="goal-new-step"]').click();
    const creation = page.locator('#record-form[data-creation="true"]');
    await expect(creation.locator('select[name="type"]')).toHaveValue(
      childType,
    );
    await expect(
      creation.locator(
        `[name="${childType === "daily" ? "parentId" : "goalParentId"}"]`,
      ),
    ).toHaveValue(id);
    await page
      .locator("#editor")
      .getByRole("button", { name: "Vazgeç", exact: true })
      .click();
    expect(await saved(page)).toBe(before);
  }
  await openGoal(page, "weekly", "week-derived");
  await panel(page)
    .locator('.goal-child-row[data-id="derived-open"] .quick-complete')
    .click();
  await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "100");
  const after = await store(page);
  for (const id of ["week-derived", "month-derived", "year-derived"]) {
    const goal = after.records.find((record) => record.id === id);
    expect(goal.currentValue).toBeNull();
    expect(goal.targetValue).toBeNull();
    expect(goal.status).toBe("in_progress");
  }
  expect(
    after.records.filter((record) => record.id !== "derived-open"),
  ).toEqual(original.filter((record) => record.id !== "derived-open"));
  await expectTableProgress(page, "monthly", "month-derived", 100);
  await expectTableProgress(page, "yearly", "year-derived", 100);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("editing a goal keeps its detail panel, draft and scroll through cancel, save and deletion without cascading dismissal", async ({
  page,
}, testInfo) => {
  const original = await seed(page, [
    ...fixture(),
    ...Array.from({ length: 16 }, (_, index) =>
      record({
        id: `editor-scroll-child-${index}`,
        title: `Bağlı günlük kayıt ${index + 1}`,
        parentId: "week-metric",
      }),
    ),
  ]);
  const before = await saved(page);
  const originalGoal = original.find((item) => item.id === "week-metric");
  await openGoal(page, "weekly", originalGoal.id);
  const body = panel(page).locator(".goal-panel-body");
  const edit = () => panel(page).locator('[data-action="goal-edit-record"]');
  const editor = page.locator("#editor");
  const title = () => editor.locator('#record-form [name="title"]');
  await progressInput(page).fill("2,5");
  const scrollTop = await body.evaluate((element) => {
    element.scrollTop = 180;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  const retained = async () => {
    await expect(editor).not.toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-goal-id", originalGoal.id);
    await expect(progressInput(page)).toHaveValue("2,5");
    expect(await body.evaluate((element) => element.scrollTop)).toBe(scrollTop);
    await expect(edit()).toBeFocused();
  };
  for (const dismissal of ["cancel", "Escape", "outside"]) {
    await edit().click();
    await expect(editor).toBeVisible();
    expect(await panel(page).evaluate((element) => element.open)).toBe(true);
    await expect(editor.locator('#record-form [name="id"]')).toHaveValue(
      originalGoal.id,
    );
    await title().fill(`Kaydedilmemiş ${dismissal} başlığı`);
    if (dismissal === "cancel") {
      await page.screenshot({
        path: testInfo.outputPath("goal-editor-over-panel.png"),
        fullPage: false,
      });
      await editor.locator('[data-action="close"]').last().click();
    } else if (dismissal === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(8, 8);
    await retained();
    expect(await saved(page)).toBe(before);
  }
  await edit().click();
  const changedTitle = `${originalGoal.title} düzenlendi`;
  await title().fill(changedTitle);
  await editor
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await retained();
  await expect(panel(page).locator(".goal-panel-title")).toHaveText(
    changedTitle,
  );
  await page.screenshot({
    path: testInfo.outputPath("goal-panel-restored-after-save.png"),
    fullPage: false,
  });
  expect((await store(page)).records).toEqual(
    original.map((item) =>
      item.id === originalGoal.id
        ? { ...item, title: changedTitle, updatedAt: NOW.toISOString() }
        : item,
    ),
  );
  // A page click dismisses the panel first; its regular Undo shortcut keeps
  // this check inside the open panel instead.
  await page.keyboard.press("Control+z");
  expect(await saved(page)).toBe(before);
  await expect(progressInput(page)).toHaveValue("2,5");
  await edit().click();
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Kaydı sil", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".goal-panel-empty")).toContainText(
    "Bu hedef artık bulunamıyor",
  );
  await expect(
    panel(page).locator('[data-action="goal-panel-close"]').first(),
  ).toBeFocused();
  expect(
    (await store(page)).records.some((item) => item.id === originalGoal.id),
  ).toBe(false);
  await page.keyboard.press("Control+z");
  expect(await saved(page)).toBe(before);
  await expect(panel(page)).toHaveAttribute("data-goal-id", originalGoal.id);
  await expect(progressInput(page)).toHaveValue("2,5");
});

test("invalid numeric input never saves, decrement stops at zero and every closed goal remains read-only", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await openGoal(page, "weekly", "week-metric");
  for (const invalid of ["-1", "1e309"]) {
    await progressInput(page).fill(invalid);
    await controls(page)
      .getByRole("button", { name: "Değeri kaydet", exact: true })
      .click();
    await expect(panel(page).locator("#goal-progress-error")).toBeVisible();
    await expect(panel(page).locator("#goal-progress-error")).not.toBeEmpty();
    expect(await saved(page)).toBe(before);
    await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "25");
  }
  await progressInput(page).fill("0");
  await controls(page)
    .getByRole("button", { name: "Değeri kaydet", exact: true })
    .click();
  await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(progressAction(page, "decrement")).toBeDisabled();
  await undo(page);
  expect(await saved(page)).toBe(before);
  for (const [type, id] of [
    ["weekly", "closed-week"],
    ["monthly", "closed-month"],
    ["yearly", "closed-year"],
  ]) {
    await openGoal(page, type, id, "all");
    await expect(controls(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  }
});

test("null current values initialize explicitly and a stale numeric draft cannot overwrite another window's saved progress", async ({
  page,
  context,
}) => {
  await seed(page);
  const before = await saved(page);
  await openGoal(page, "weekly", "week-null");
  await expect(progressInput(page)).toHaveValue("0");
  await progressAction(page, "increment").click();
  expect(
    (await store(page)).records.find((record) => record.id === "week-null")
      .currentValue,
  ).toBe(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await openGoal(page, "weekly", "week-metric");
  await progressInput(page).fill("3");
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await openGoal(other, "weekly", "week-metric");
  await progressAction(other, "increment").click();
  const remoteSaved = await saved(other);
  await expect(progressBar(page)).toHaveAttribute("aria-valuenow", "50");
  await expect(progressInput(page)).toHaveValue("3");
  await controls(page)
    .getByRole("button", { name: "Değeri kaydet", exact: true })
    .click();
  await expect(panel(page).locator("#goal-progress-error")).not.toBeEmpty();
  await expect(progressInput(page)).toHaveValue("3");
  expect(await saved(page)).toBe(remoteSaved);
  expect(
    (await store(page)).records.find((record) => record.id === "week-metric")
      .currentValue,
  ).toBe(2);
  await other.close();
});
