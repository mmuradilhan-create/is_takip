import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const panel = (page) => page.locator("#goal-detail-panel");
const child = (page, id) =>
  panel(page).locator(`.goal-child-row[data-id="${id}"]`);
const unlink = (page, id) =>
  child(page, id).locator('[data-action="goal-unlink-child"]');
const undo = (page) => page.locator("#undo-button").click();

function fixture() {
  return [
    make({
      id: "unlink-year",
      type: "yearly",
      title: "Senelik teslim",
      periodKey: "2026",
      status: "in_progress",
    }),
    make({
      id: "unlink-month",
      type: "monthly",
      title: "Aylık teslim",
      periodKey: "2026-11",
      goalParentId: "unlink-year",
      status: "in_progress",
    }),
    make({
      id: "unlink-week",
      type: "weekly",
      title: "Haftalık teslim",
      periodKey: "2026-W46",
      goalParentId: "unlink-month",
      status: "in_progress",
    }),
    make({
      id: "unlink-done",
      title: "Kaydı korunacak tamamlanan iş",
      parentId: "unlink-week",
      workContext: "",
      status: "completed",
      priority: "high",
      dueDate: "2026-11-12",
      sourceDate: "2026-11-01",
      description: "Açıklama korunur.",
      nextAction: "Eski sonraki adım",
      owner: "İş sahibi",
      sourceFields: {
        __followupSource: { recordId: "unlink-meeting", type: "meeting" },
        nested: { retained: [1, "iki"] },
      },
      workLog: [
        {
          id: "unlink-log",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 35_789,
          note: "Çalışma korunur.",
          nextAction: "Oturum adımı",
        },
      ],
    }),
    make({
      id: "unlink-open",
      title: "Açık günlük iş",
      parentId: "unlink-week",
      workContext: "",
      dueDate: "2026-11-13",
    }),
    make({
      id: "unlink-meeting",
      type: "meeting",
      title: "Kaynak karar",
      status: "planned",
      decision: "Eski kaynak durumu yalnız bağlantı değişikliğinde eşitlenmez.",
    }),
    make({
      id: "unlink-unrelated",
      title: "İlişkisiz anlık iş",
      workContext: "ad_hoc",
    }),
  ];
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  const raw = JSON.stringify({
    version: 1,
    records: items,
    odak: { version: 1, preferences: { density: "compact" }, history: [] },
  });
  await page.addInitScript(
    ({ key, raw }) => {
      if (sessionStorage.getItem("goal-child-unlink-seeded")) return;
      localStorage.setItem(key, raw);
      for (const suffix of [
        "daily-context-migration",
        "import-notes-cleanup",
        "waiting-notes-cleanup",
        "waiting-state-migration",
        "meeting-contact-cleanup",
      ])
        localStorage.setItem(`${key}-${suffix}`, "1");
      sessionStorage.setItem("goal-child-unlink-seeded", "1");
    },
    { key: KEY, raw },
  );
  await page.goto("/");
  expect(await saved(page)).toBe(raw);
  return raw;
}

async function view(page, type) {
  if (
    await page
      .getByRole("button", { name: "Menüyü aç", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Menüyü aç", exact: true }).click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

async function openGoal(page, type, id) {
  await view(page, type);
  await page.locator('[data-action="period-all"]').click();
  await page
    .locator(`.full-table [data-record-row][data-id="${id}"] .task-name`)
    .click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-goal-id", id);
}

test("unlinking a daily step makes it instant work without changing its saved work, source, lifecycle or other records and one Undo restores the exact link", async ({
  page,
}) => {
  const items = fixture();
  const raw = await seed(page, items);
  await openGoal(page, "weekly", "unlink-week");
  const progress = panel(page).locator(
    '[data-goal-section="progress"] [role="progressbar"]',
  );
  await expect(progress).toHaveAttribute("aria-valuenow", "50");
  await expect(child(page, "unlink-done")).toBeVisible();
  await expect(unlink(page, "unlink-done")).toHaveAttribute(
    "data-record-link-tooltip",
    "Bağı kaldır ve anlık işe dönüştür",
  );
  await expect(unlink(page, "unlink-done")).not.toHaveAttribute("title");
  await unlink(page, "unlink-done").click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "unlink-week");
  await expect(child(page, "unlink-done")).toHaveCount(0);
  await expect(
    child(page, "unlink-open").locator(".goal-child-title"),
  ).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  const changed = await records(page);
  expect(changed).toEqual(
    items.map((item) =>
      item.id === "unlink-done"
        ? {
            ...item,
            parentId: null,
            workContext: "ad_hoc",
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  expect(JSON.parse(await saved(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await expect(panel(page)).toBeVisible();
  await expect(child(page, "unlink-done")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "50");

  await unlink(page, "unlink-done").click();
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await view(page, "daily");
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await page
    .locator('.full-table [data-record-row][data-id="unlink-done"] .task-name')
    .click();
  const form = page.locator("#record-form");
  await expect(form.locator('[name="id"]')).toHaveValue("unlink-done");
  await expect(form.locator('[name="workContext"]')).toHaveValue("ad_hoc");
  await expect(form.locator('[name="parentId"]')).toHaveValue("");
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await undo(page);
  expect(await saved(page)).toBe(raw);
});

test("failed unlink keeps the daily step and metric draft retryable while a successful retry and Undo preserve narrow-panel controls and manual progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const items = fixture();
  items[2] = make({
    ...items[2],
    targetValue: 10,
    currentValue: 2,
    metric: "Rapor",
  });
  const raw = await seed(page, items);
  await openGoal(page, "weekly", "unlink-week");
  const panelBounds = await panel(page).boundingBox();
  expect(panelBounds.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds.y).toBeGreaterThanOrEqual(0);
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(390);
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(700);
  await panel(page).locator("#goal-progress-current").fill("7");
  const action = unlink(page, "unlink-open");
  const work = child(page, "unlink-open").locator(".work-start");
  const bounds = await action.boundingBox();
  const workBounds = await work.boundingBox();
  expect(bounds.width).toBe(22);
  expect(workBounds.x).toBeGreaterThanOrEqual(bounds.x + bounds.width + 5);
  expect(workBounds.x + workBounds.width).toBeLessThanOrEqual(390);
  await page.evaluate((key) => {
    window.unlinkOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key)
        throw new DOMException("Full", "QuotaExceededError");
      return window.unlinkOriginalSetItem.call(this, storageKey, value);
    };
  }, KEY);
  await action.click();
  await expect(panel(page).locator("#goal-unlink-child-error")).toBeVisible();
  await expect(child(page, "unlink-open")).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(panel(page).locator("#goal-progress-current")).toHaveValue("7");
  expect(await saved(page)).toBe(raw);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.unlinkOriginalSetItem;
  });
  await action.click();
  await expect(child(page, "unlink-open")).toHaveCount(0);
  await expect(panel(page).locator("#goal-progress-current")).toHaveValue("7");
  expect(
    (await records(page)).find((item) => item.id === "unlink-week"),
  ).toEqual(items[2]);
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await expect(child(page, "unlink-open")).toBeVisible();
  await expect(panel(page).locator("#goal-progress-current")).toHaveValue("7");
});

test("unlinking weekly or monthly subgoals leaves their own hierarchy and historical status intact and is exactly undoable", async ({
  page,
}) => {
  const items = fixture();
  items[2] = make({ ...items[2], status: "completed" });
  items[1] = make({
    ...items[1],
    title: "Dar ekranda da okunacak aylık teslim ve doğrulama kapsamı",
  });
  const raw = await seed(page, items);
  for (const [type, parentId, childId] of [
    ["monthly", "unlink-month", "unlink-week"],
    ["yearly", "unlink-year", "unlink-month"],
  ]) {
    await openGoal(page, type, parentId);
    await expect(unlink(page, childId)).toHaveAttribute(
      "data-record-link-tooltip",
      "Üst hedef bağlantısını kaldır",
    );
    const open = child(page, childId).locator(".goal-child-open");
    await expect(open).toHaveAttribute("data-action", "goal-open-child");
    await expect(open).toHaveAttribute("data-id", childId);
    await expect(open.locator("svg")).toHaveCount(1);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const layout = await child(page, childId).evaluate((element) => {
        const box = (selector) => {
          const { x, y, width, height } = element
            .querySelector(selector)
            .getBoundingClientRect();
          return { x, y, width, height };
        };
        const heading = element.querySelector(".goal-child-heading");
        return {
          title: box(".goal-child-title"),
          unlink: box(".goal-child-unlink"),
          open: box(".goal-child-open"),
          heading: box(".goal-child-heading"),
          columns:
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
          overflow: heading.scrollWidth - heading.clientWidth,
        };
      });
      expect(layout.columns).toBe(2);
      expect(layout.unlink.width).toBeCloseTo(22, 1);
      expect(layout.unlink.height).toBeCloseTo(22, 1);
      expect(layout.open.width).toBeCloseTo(22, 1);
      expect(layout.open.height).toBeCloseTo(22, 1);
      expect(layout.open.x - layout.unlink.x - layout.unlink.width).toBeCloseTo(
        4,
        1,
      );
      expect(layout.unlink.x - layout.title.x - layout.title.width).toBeCloseTo(
        6,
        1,
      );
      expect(Math.abs(layout.unlink.y - layout.open.y)).toBeLessThanOrEqual(1);
      expect(layout.open.x + layout.open.width).toBeLessThanOrEqual(
        layout.heading.x + layout.heading.width + 1,
      );
      expect(layout.overflow).toBeLessThanOrEqual(1);
    }
    await open.click();
    await expect(panel(page)).toHaveAttribute("data-goal-id", childId);
    expect(await saved(page)).toBe(raw);
    await panel(page)
      .getByRole("button", { name: "Kapat", exact: true })
      .click();
    await openGoal(page, type, parentId);
    await unlink(page, childId).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-goal-id", parentId);
    await expect(child(page, childId)).toHaveCount(0);
    expect(await records(page)).toEqual(
      items.map((item) =>
        item.id === childId
          ? { ...item, goalParentId: null, updatedAt: NOW.toISOString() }
          : item,
      ),
    );
    await undo(page);
    expect(await saved(page)).toBe(raw);
    await expect(child(page, childId)).toBeVisible();
  }
});

test("a stale displayed relationship cannot unlink a daily step from the goal it was moved to", async ({
  page,
}) => {
  const items = fixture();
  items.push(
    make({
      id: "unlink-new-parent",
      type: "weekly",
      title: "İşin taşındığı hedef",
      periodKey: "2026-W46",
      status: "in_progress",
    }),
  );
  await seed(page, items);
  await openGoal(page, "weekly", "unlink-week");
  const externalItems = items.map((item) =>
    item.id === "unlink-open"
      ? {
          ...item,
          parentId: "unlink-new-parent",
          description: "Diğer penceredeki yeni not",
          updatedAt: "2026-11-09T09:59:00.000Z",
        }
      : item,
  );
  const externalRaw = JSON.stringify({
    version: 1,
    records: externalItems,
    odak: { version: 1, preferences: { density: "compact" }, history: [] },
  });
  // Storage changes in another process can arrive before the storage event.
  // The stale action must fail the store's atomic compare before detaching.
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: KEY,
    raw: externalRaw,
  });
  await unlink(page, "unlink-open").click();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "unlink-week");
  await expect(panel(page).locator("#goal-unlink-child-error")).toBeVisible();
  await expect(child(page, "unlink-open")).toHaveCount(0);
  expect(await saved(page)).toBe(externalRaw);
  await expect(page.locator("#undo-button")).toBeDisabled();
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await openGoal(page, "weekly", "unlink-new-parent");
  await expect(child(page, "unlink-open")).toBeVisible();
  await unlink(page, "unlink-open").click();
  expect(await records(page)).toEqual(
    externalItems.map((item) =>
      item.id === "unlink-open"
        ? {
            ...item,
            parentId: null,
            workContext: "ad_hoc",
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(externalRaw);
  await expect(child(page, "unlink-open")).toBeVisible();
});
