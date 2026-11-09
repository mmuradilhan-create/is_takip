import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T12:00:00.000Z");
const STAMP = "2026-11-02T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const numeric = (page) => field(page, "editorNumeric");
const measurement = (page) =>
  form(page).locator("[data-record-editor-measurement]");
const extras = (page) => form(page).locator("[data-record-editor-extras]");
const panel = (page) => page.locator("#goal-detail-panel");
const binder = (page) => panel(page).locator("#goal-link-child-form");
const childSelect = (page) => binder(page).locator("#goal-link-child");
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page.locator('#editor [data-action="close"]').last().click();

function make(input) {
  return createRecord({
    title: `Korunacak ${input.id}`,
    type: "weekly",
    status: "in_progress",
    periodKey: { yearly: "2026", monthly: "2026-11" }[input.type] || "2026-W46",
    sourceDate: "2026-11-02",
    dueDate: "2026-11-15",
    description: "Özgün gerçek not.",
    nextAction: "Korunacak eski adım.",
    owner: "Korunacak eski sorumlu",
    sourceFields: { original: { code: "HAM-26", value: "1,250" } },
    workLog: [
      {
        id: `${input.id}-work`,
        date: "2026-11-02",
        endedAt: STAMP,
        durationMs: 90_123,
        note: "Gerçek tarihsel sonuç.",
        nextAction: "Tarihsel sonraki adım.",
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
}

function measured() {
  return make({
    id: "numeric-full",
    targetValue: 10,
    currentValue: 4,
    metric: "Rapor",
  });
}

async function seed(page, records) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("record-editor-numeric-02126-seeded")) return;
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
      sessionStorage.setItem("record-editor-numeric-02126-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
}

async function openEditor(page, record) {
  await page.locator(`#nav [data-view="${record.type}"]`).click();
  await row(page, record.id).locator(".goal-edit-trigger").click();
  await expect(form(page)).toBeVisible();
  await expect(extras(page)).toHaveJSProperty("open", false);
}

async function openExtras(page) {
  if (!(await extras(page).evaluate((element) => element.open)))
    await extras(page).locator(":scope > summary").click();
  await expect(extras(page)).toHaveJSProperty("open", true);
}

async function saveEditor(page) {
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function expectNumericFields(page, enabled, values) {
  for (const [name, value] of Object.entries(values)) {
    await expect(field(page, name)).toHaveValue(String(value ?? ""));
    if (enabled) {
      await expect(field(page, name)).toBeVisible();
      await expect(field(page, name)).toBeEnabled();
    } else {
      await expect(field(page, name)).toBeHidden();
      await expect(field(page, name)).toBeDisabled();
    }
  }
  const names = await form(page).evaluate((element) => [
    ...new FormData(element).keys(),
  ]);
  expect(new Set(names).size).toBe(names.length);
  for (const name of ["metric", "targetValue", "currentValue"])
    expect(names.includes(name)).toBe(enabled);
}

async function openGoal(page, record) {
  if (await panel(page).isVisible())
    await panel(page)
      .locator('[data-action="goal-panel-close"]')
      .last()
      .click();
  await page.locator(`#nav [data-view="${record.type}"]`).click();
  await row(page, record.id)
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-goal-id", record.id);
}

async function expectEmptyBinder(page, caption) {
  await expect(binder(page)).toBeVisible();
  await expect(childSelect(page)).toHaveAttribute("name", "childId");
  await expect(childSelect(page)).toBeDisabled();
  await expect(childSelect(page)).toHaveValue("");
  await expect(childSelect(page).locator("option")).toHaveCount(1);
  await expect(childSelect(page).locator("option")).toHaveAttribute(
    "value",
    "",
  );
  await expect(childSelect(page).locator("option")).toHaveText(caption);
  await expect(childSelect(page)).not.toHaveAttribute("aria-describedby");
  await expect(binder(page).locator("#goal-link-child-empty")).toHaveCount(0);
  await expect(
    binder(page).getByRole("button", { name: "Bağla", exact: true }),
  ).toBeDisabled();
}

test("numeric mode infers existing measurements and untouched OFF saves preserve hidden values and exact no-op state", async ({
  page,
}) => {
  const records = [
    measured(),
    make({ id: "numeric-target-zero", type: "monthly", targetValue: 0 }),
    make({ id: "numeric-metric-only", type: "yearly", metric: "Parça" }),
    make({ id: "numeric-current-only", currentValue: 2 }),
    make({ id: "numeric-current-zero", status: "waiting", currentValue: 0 }),
    make({ id: "numeric-empty", type: "monthly" }),
  ];
  await seed(page, records);
  const before = await saved(page);
  for (const record of records) {
    await openEditor(page, record);
    await expect(numeric(page)).toHaveAccessibleName("Adetle takip et");
    const enabled = !["numeric-current-zero", "numeric-empty"].includes(
      record.id,
    );
    await expect(numeric(page)).toBeChecked({ checked: enabled });
    await expect(field(page, "currentValue")).toBeHidden();
    await openExtras(page);
    await expectNumericFields(page, enabled, {
      targetValue: record.targetValue,
      metric: record.metric,
      currentValue: record.currentValue,
    });
    expect(await saved(page)).toBe(before);
    await closeEditor(page);
  }
  const zero = records.find((record) => record.id === "numeric-current-zero");
  await openEditor(page, zero);
  await saveEditor(page);
  expect(await saved(page)).toBe(before);
  expect((await stored(page)).odak.history).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  const empty = records.find((record) => record.id === "numeric-empty");
  await openEditor(page, empty);
  await numeric(page).check();
  await numeric(page).uncheck();
  await saveEditor(page);
  expect(await saved(page)).toBe(before);
  expect((await stored(page)).odak.history).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await openEditor(page, zero);
  await numeric(page).check();
  await numeric(page).uncheck();
  await saveEditor(page);
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === zero.id
        ? { ...record, currentValue: null, updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await openEditor(page, zero);
  await field(page, "title").fill("Ölçümsüz hedefin başlığı düzeltildi");
  await saveEditor(page);
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === zero.id
        ? {
            ...record,
            title: "Ölçümsüz hedefin başlığı düzeltildi",
            updatedAt: NOW.toISOString(),
          }
        : record,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("numeric OFF, ON and type switches retain drafts while cancel and a non-goal save preserve original measurements", async ({
  page,
}) => {
  const original = measured();
  await seed(page, [original]);
  const before = await saved(page);
  const draft = {
    targetValue: 12.5,
    metric: "Taslak parça",
    currentValue: 6.25,
  };
  await openEditor(page, original);
  await openExtras(page);
  for (const [name, value] of Object.entries(draft))
    await field(page, name).fill(String(value));
  await numeric(page).uncheck();
  await expectNumericFields(page, false, draft);
  await numeric(page).check();
  await expectNumericFields(page, true, draft);
  await field(page, "type").selectOption("daily");
  await expect(extras(page)).toHaveJSProperty("open", true);
  await expect(measurement(page)).toBeHidden();
  await expect(numeric(page)).toBeDisabled();
  await expectNumericFields(page, false, draft);
  await field(page, "type").selectOption("weekly");
  await expect(extras(page)).toHaveJSProperty("open", true);
  await expect(numeric(page)).toBeChecked();
  await expectNumericFields(page, true, draft);
  await numeric(page).uncheck();
  await field(page, "type").selectOption("monthly");
  await expect(extras(page)).toHaveJSProperty("open", true);
  await expect(numeric(page)).not.toBeChecked();
  await expectNumericFields(page, false, draft);
  await field(page, "type").selectOption("weekly");
  await expect(extras(page)).toHaveJSProperty("open", true);
  await expect(numeric(page)).not.toBeChecked();
  await numeric(page).check();
  await expectNumericFields(page, true, draft);
  expect(await saved(page)).toBe(before);
  const confirmation = page.waitForEvent("dialog");
  const closing = closeEditor(page);
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("Kaydedilmemiş değişiklikler");
  await dialog.accept();
  await closing;
  expect(await saved(page)).toBe(before);
  await openEditor(page, original);
  await openExtras(page);
  await expectNumericFields(page, true, {
    targetValue: original.targetValue,
    metric: original.metric,
    currentValue: original.currentValue,
  });
  await numeric(page).uncheck();
  await field(page, "type").selectOption("daily");
  await expect(extras(page)).toHaveJSProperty("open", true);
  await saveEditor(page);
  expect((await stored(page)).records).toEqual([
    { ...original, type: "daily", updatedAt: NOW.toISOString() },
  ]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("explicit numeric OFF clears only three values in one Undo and enabled saves keep raw context and millisecond history", async ({
  page,
}) => {
  const original = measured();
  const other = make({ id: "untouched-other", type: "monthly" });
  await seed(page, [original, other]);
  const before = await saved(page);
  await openEditor(page, original);
  await expect(measurement(page)).toHaveJSProperty("tagName", "DIV");
  await expect(measurement(page).locator("summary")).toHaveCount(0);
  await expect(
    measurement(page).getByLabel("Hedef adet", { exact: true }),
  ).toHaveValue("10");
  await expect(
    measurement(page).getByLabel("Birim", { exact: true }),
  ).toHaveValue("Rapor");
  await expect(
    extras(page).getByLabel("Mevcut adet", { exact: true }),
  ).toHaveValue("4");
  await expect(field(page, "currentValue")).toBeHidden();
  const target = await field(page, "targetValue").boundingBox();
  const metric = await field(page, "metric").boundingBox();
  expect(Math.abs(target.y - metric.y)).toBeLessThanOrEqual(1);
  expect(target.x + target.width).toBeLessThan(metric.x);
  await numeric(page).uncheck();
  await saveEditor(page);
  expect((await stored(page)).records).toEqual([
    {
      ...original,
      targetValue: null,
      metric: "",
      currentValue: null,
      updatedAt: NOW.toISOString(),
    },
    other,
  ]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  const cleared = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(cleared);
  await openEditor(page, original);
  await expect(numeric(page)).not.toBeChecked();
  await closeEditor(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await openEditor(page, original);
  await field(page, "targetValue").fill("12.5");
  await field(page, "metric").fill("Parça");
  await openExtras(page);
  await field(page, "currentValue").fill("6.25");
  await saveEditor(page);
  expect((await stored(page)).records).toEqual([
    {
      ...original,
      targetValue: 12.5,
      metric: "Parça",
      currentValue: 6.25,
      updatedAt: NOW.toISOString(),
    },
    other,
  ]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  for (const record of (await stored(page)).records)
    expect(record).not.toHaveProperty("editorNumeric");
  const edited = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(edited);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("goal attach forms explain empty weekly, monthly and yearly choices while eligible linking stays exactly reversible", async ({
  page,
}) => {
  const year = make({ id: "attach-year", type: "yearly" });
  const month = make({
    id: "attach-month",
    type: "monthly",
    goalParentId: year.id,
  });
  const week = make({ id: "attach-week", goalParentId: month.id });
  const linked = make({
    id: "attach-linked",
    type: "daily",
    parentId: week.id,
  });
  const closed = make({
    id: "attach-closed",
    type: "daily",
    status: "completed",
  });
  const free = make({
    id: "attach-free",
    type: "daily",
    workContext: "ad_hoc",
  });
  const records = [year, month, week, linked, closed, free];
  await seed(page, records);
  const before = await saved(page);
  for (const [record, caption] of [
    [year, "Bağlanabilecek aylık hedef yok"],
    [month, "Bağlanabilecek haftalık hedef yok"],
  ]) {
    await openGoal(page, record);
    await expectEmptyBinder(page, caption);
    expect(await saved(page)).toBe(before);
  }
  await openGoal(page, week);
  await expect(binder(page)).toBeVisible();
  await expect(childSelect(page)).toBeEnabled();
  await expect(childSelect(page).locator("option")).toHaveText([
    "Kayıt seç",
    free.title,
  ]);
  await expect(binder(page).locator("#goal-link-child-empty")).toHaveCount(0);
  await expect(childSelect(page)).not.toHaveAttribute("aria-describedby");
  await expect(
    binder(page).getByRole("button", { name: "Bağla", exact: true }),
  ).toBeDisabled();
  await childSelect(page).selectOption(free.id);
  expect(await saved(page)).toBe(before);
  await binder(page)
    .getByRole("button", { name: "Bağla", exact: true })
    .click();
  await expectEmptyBinder(page, "Bağlanabilecek günlük iş yok");
  await expect(
    panel(page).locator(`.goal-child-row[data-id="${free.id}"]`),
  ).toBeVisible();
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === free.id
        ? {
            ...record,
            parentId: week.id,
            workContext: "",
            updatedAt: NOW.toISOString(),
          }
        : record,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  const after = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(after);
  await undo(page);
  expect(await saved(page)).toBe(before);
});
