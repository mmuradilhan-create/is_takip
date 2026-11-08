import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const close = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

function fixture() {
  return [
    make({
      id: "context-choice-week",
      type: "weekly",
      title: "Gerçek haftalık hedef",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 3,
      metric: "Rapor",
    }),
    make({
      id: "context-choice-legacy",
      title: "Bağlam alanı bulunmayan eski iş",
      dueDate: "2026-11-15",
      description: "Özgün kişisel not.",
      nextAction: "Özgün sonraki adım.",
      sourceFields: { original: { value: "Ham veri korunmalı" } },
      workLog: [
        {
          id: "context-choice-log",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 90_000,
          note: "Gerçek çalışma sonucu.",
          nextAction: "Eski çalışma adımı.",
        },
      ],
    }),
    make({
      id: "context-choice-planned",
      title: "Açıkça planlı eski iş",
      workContext: "",
      dueDate: "2026-11-16",
    }),
    make({
      id: "context-choice-linked",
      title: "Hedefe bağlı eski iş",
      parentId: "context-choice-week",
    }),
  ];
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("daily-context-0213-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: items,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("daily-context-0213-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return items;
}

async function newDaily(page) {
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
}

async function saveNew(page, title) {
  await field(page, "title").fill(title);
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  return (await stored(page)).records.find((item) => item.title === title);
}

test("an unlinked daily draft defaults to ad hoc with a usable main parent choice and no missing-goal warning after save", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await newDaily(page);
  expect(
    await form(page)
      .locator("details.creation-advanced")
      .evaluate((element) => element.open),
  ).toBe(true);
  await expect(
    form(page).locator('.creation-main-fields [name="workContext"]'),
  ).toHaveCount(0);
  await expect(field(page, "workContext")).toBeVisible();
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await expect(field(page, "parentId")).toBeVisible();
  await expect(field(page, "parentId")).toBeEnabled();
  await expect(field(page, "parentId")).toHaveValue("");
  expect(await saved(page)).toBe(before);
  const created = await saveNew(page, "Bağımsız yeni anlık iş");
  expect(created).toMatchObject({
    type: "daily",
    workContext: "ad_hoc",
    parentId: null,
    dueDate: "",
    sourceDate: "2026-11-08",
    status: "planned",
  });
  expect(
    (await stored(page)).records.filter((item) => item.id !== created.id),
  ).toEqual(items);
  await expect(row(page, created.id)).not.toContainText("Haftalık hedef seç");
  await expect(
    row(page, created.id).locator('[data-context-kind="unresolved"]'),
  ).toHaveCount(0);
  await page.locator("#work-context-filter").selectOption("ad_hoc");
  await expect(row(page, created.id)).toBeVisible();
  await page.locator("#work-context-filter").selectOption("planned");
  await expect(row(page, created.id)).toHaveCount(0);
  await page.reload();
  expect(
    (await stored(page)).records.find((item) => item.id === created.id),
  ).toMatchObject({ workContext: "ad_hoc", parentId: null });
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("choosing or clearing a parent automatically sets context while optional planned work and weekly presets save honestly", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await newDaily(page);
  await field(page, "parentId").selectOption("context-choice-week");
  await expect(field(page, "workContext")).toHaveValue("");
  await field(page, "parentId").selectOption("");
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await field(page, "parentId").selectOption("context-choice-week");
  const linked = await saveNew(page, "Parent seçerek planlanan yeni iş");
  expect(linked).toMatchObject({
    workContext: "",
    parentId: "context-choice-week",
    dueDate: "",
  });
  expect(
    (await stored(page)).records.find(
      (item) => item.id === "context-choice-week",
    ),
  ).toEqual(items[0]);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await newDaily(page);
  await openCreationExtras(page);
  await field(page, "workContext").selectOption("");
  const planned = await saveNew(page, "Hedefsiz ama açıkça planlı yeni iş");
  expect(planned).toMatchObject({
    workContext: "",
    parentId: null,
    dueDate: "",
  });
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "context-choice-week")
    .locator('[data-action="new-linked"]')
    .click();
  await expect(form(page).locator('select[name="type"]')).toBeDisabled();
  await expect(field(page, "parentId")).toBeVisible();
  await expect(field(page, "parentId")).toHaveValue("context-choice-week");
  await expect(field(page, "workContext")).toHaveValue("");
  const preset = await saveNew(page, "Haftalık hedeften açılan yeni günlük iş");
  expect(preset).toMatchObject({
    workContext: "",
    parentId: "context-choice-week",
    dueDate: "",
  });
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("explicit context changes and type switching keep daily draft fields but cancel never persists a cleared or selected parent", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await newDaily(page);
  await field(page, "title").fill("Korunacak günlük taslak");
  await field(page, "dueDate").fill("17.11.2026");
  await field(page, "priority").selectOption("high");
  await field(page, "parentId").selectOption("context-choice-week");
  await openCreationExtras(page);
  await field(page, "description").fill("Tür değişirken korunacak gerçek not.");
  await field(page, "workContext").selectOption("ad_hoc");
  await expect(field(page, "parentId")).toHaveValue("");
  await expect(field(page, "parentId")).toBeEnabled();
  await expect(field(page, "parentId")).toBeVisible();
  await field(page, "parentId").selectOption("context-choice-week");
  await form(page).locator('select[name="type"]').selectOption("weekly");
  await field(page, "title").fill("Ayrı haftalık taslak");
  await form(page).locator('select[name="type"]').selectOption("daily");
  await expect(field(page, "title")).toHaveValue("Korunacak günlük taslak");
  await expect(field(page, "dueDate")).toHaveValue("17.11.2026");
  await expect(field(page, "priority")).toHaveValue("high");
  await expect(field(page, "parentId")).toHaveValue("context-choice-week");
  await expect(field(page, "workContext")).toHaveValue("");
  await openCreationExtras(page);
  await expect(field(page, "description")).toHaveValue(
    "Tür değişirken korunacak gerçek not.",
  );
  await field(page, "parentId").selectOption("");
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await form(page).locator('select[name="type"]').selectOption("waiting");
  await form(page).locator('select[name="type"]').selectOption("daily");
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await expect(field(page, "parentId")).toHaveValue("");
  const confirmation = page.waitForEvent("dialog");
  const closing = close(page);
  const discard = await confirmation;
  expect(discard.type()).toBe("confirm");
  expect(discard.message()).toContain("Kaydedilmemiş değişiklikler");
  await discard.accept();
  await closing;
  expect(await saved(page)).toBe(before);
  await newDaily(page);
  await expect(field(page, "title")).toHaveValue("");
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await expect(field(page, "parentId")).toHaveValue("");
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("opening and editing existing planned records preserves absent context fields, journals and links until an intentional parent change", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const id of [
    "context-choice-legacy",
    "context-choice-planned",
    "context-choice-linked",
  ]) {
    const original = items.find((item) => item.id === id);
    await row(page, id).locator(".task-name").click();
    await expect(
      form(page).locator('[data-record-editor-basic] [name="workContext"]'),
    ).toHaveCount(0);
    await expect(field(page, "workContext")).toBeVisible();
    await expect(field(page, "workContext")).toHaveValue("");
    await expect(field(page, "parentId")).toBeVisible();
    await expect(field(page, "parentId")).toBeEnabled();
    expect(await saved(page)).toBe(before);
    await field(page, "title").fill(`${original.title} düzeltildi`);
    await form(page)
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    const changed = (await stored(page)).records.find((item) => item.id === id);
    expect(changed).toEqual({
      ...original,
      title: `${original.title} düzeltildi`,
      updatedAt: NOW.toISOString(),
    });
    if (!Object.hasOwn(original, "workContext"))
      expect(changed).not.toHaveProperty("workContext");
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await row(page, "context-choice-linked").locator(".task-name").click();
  await field(page, "parentId").selectOption("");
  await expect(field(page, "workContext")).toHaveValue("ad_hoc");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect(
    (await stored(page)).records.find(
      (item) => item.id === "context-choice-linked",
    ),
  ).toEqual({
    ...items[3],
    parentId: null,
    workContext: "ad_hoc",
    updatedAt: NOW.toISOString(),
  });
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect((await stored(page)).records).toEqual(items);
});

test("binding an existing ad hoc task from its weekly goal plans that same task in one reversible save and updates derived progress", async ({
  page,
}) => {
  const goal = make({
    id: "bind-week",
    type: "weekly",
    title: "Mevcut günlük işleri planlayan hedef",
    periodKey: "2026-W45",
  });
  const completed = make({
    id: "bind-completed",
    title: "Önceden biten bağlı iş",
    parentId: goal.id,
    status: "completed",
  });
  const candidate = make({
    ...fixture()[1],
    id: "bind-adhoc",
    title: "Geçmişi olan mevcut anlık iş",
    workContext: "ad_hoc",
    status: "in_progress",
  });
  const items = [goal, completed, candidate];
  await seed(page, items);
  const before = await saved(page);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, goal.id)
    .locator('.task-name[data-action="goal-details"]')
    .click();
  const panel = page.locator("#goal-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-goal-id", goal.id);
  await expect(
    panel.locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "100");
  const binder = panel.locator("#goal-link-child-form");
  await expect(
    binder.locator(`select[name="childId"] option[value="${candidate.id}"]`),
  ).toHaveText(candidate.title);
  expect(await saved(page)).toBe(before);
  await binder.locator('select[name="childId"]').selectOption(candidate.id);
  await binder.getByRole("button", { name: "Bağla", exact: true }).click();
  await expect(panel.locator(".goal-child-row")).toHaveCount(2);
  await expect(
    panel.locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "50");
  const after = await stored(page);
  expect(after.records.find((item) => item.id === candidate.id)).toEqual({
    ...candidate,
    parentId: goal.id,
    workContext: "",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.find((item) => item.id === goal.id)).toEqual(goal);
  expect(after.records.find((item) => item.id === completed.id)).toEqual(
    completed,
  );
  expect(after.odak.history).toHaveLength(1);
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect((await stored(page)).records).toEqual(items);
});
