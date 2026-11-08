import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.catalogInjected=1"> Özel proje';
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const settings = (page) => page.locator("#settings-dialog");
const catalog = (page, kind) =>
  settings(page).locator(`[data-choice-catalog="${kind}"]`);
const catalogRow = (page, kind, value) =>
  catalog(page, kind).locator("[data-choice-value]").filter({ hasText: value });
const addForm = (page, kind) =>
  catalog(page, kind).locator('[data-choice-form="add"]');
const renameForm = (page, kind) =>
  catalog(page, kind).locator('[data-choice-form="rename"]');
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const form = (page) => page.locator("#editor #record-form");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

function fixture() {
  return [
    record({
      id: "catalog-week",
      type: "weekly",
      title: "Korunacak haftalık hedef",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "catalog-primary",
      title: "Eski seçim değerleri korunacak iş",
      parentId: "catalog-week",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-10",
      projectCode: "İPEK-42",
      workType: "İnceleme",
      category: "Özgün kategori",
      description: "Gerçek kayıt notu",
      nextAction: "Kontrolü bitir.",
      sourceFields: { "Özgün bilgi": { value: "Korunacak ham veri" } },
      workLog: [
        {
          id: "catalog-log",
          date: "2026-11-01",
          endedAt: "2026-11-01T09:00:00.000Z",
          durationMs: 60_000,
          note: "Gerçek oturum",
          nextAction: "Sonraki kontrol",
        },
      ],
    }),
    record({
      id: "catalog-completed",
      title: "Tamamlanan eski proje işi",
      status: "completed",
      projectCode: "BİTEN-1",
      workType: "Atölye",
    }),
  ];
}

async function seed(page, records = fixture(), theme = "light") {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records, theme }) => {
      if (sessionStorage.getItem("choice-lists-settings-021-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable", theme },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("choice-lists-settings-021-seeded", "1");
    },
    { key: KEY, records, theme },
  );
  await page.goto("/");
  return records;
}

async function openSettings(page) {
  if (!(await settings(page).isVisible()))
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(
    settings(page).locator("[data-choice-list-settings]"),
  ).toBeVisible();
}

async function openCatalog(page, kind) {
  await openSettings(page);
  if (!(await catalog(page, kind).evaluate((element) => element.open)))
    await catalog(page, kind).locator(":scope > summary").click();
}

async function closeSettings(page) {
  await settings(page)
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
}

async function add(page, kind, value) {
  await openCatalog(page, kind);
  await addForm(page, kind).locator('[name="choiceValue"]').fill(value);
  await addForm(page, kind)
    .getByRole("button", { name: "Ekle", exact: true })
    .click();
}

async function startRename(page, kind, value) {
  await openCatalog(page, kind);
  await catalogRow(page, kind, value)
    .locator('[data-choice-action="rename"]')
    .click();
  return renameForm(page, kind).locator('[name="choiceValue"]');
}

async function rename(page, kind, oldValue, value) {
  await (await startRename(page, kind, oldValue)).fill(value);
  await renameForm(page, kind)
    .getByRole("button", { name: "Kaydet", exact: true })
    .click();
}

async function remove(page, kind, value) {
  await openCatalog(page, kind);
  await catalogRow(page, kind, value)
    .locator('[data-choice-action="remove"]')
    .click();
}

async function openNewDaily(page) {
  await page.locator('#nav [data-view="daily"]').click();
  await page.locator(".topbar .new-record").click();
  await openCreationExtras(page);
}

async function openChoices(page, kind) {
  await openCreationExtras(page);
  const field = form(page).locator(`[name="${kind}"]`);
  await field.fill("");
  await field.press("ArrowDown");
  const menu = page.locator("#record-choice-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function openBackup(page) {
  await openSettings(page);
  const details = settings(page).locator(".settings-backup");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
}

async function restore(page, data, accept = true) {
  await openBackup(page);
  let handled = false;
  page.once("dialog", async (dialog) => {
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    handled = true;
  });
  await settings(page)
    .locator("#restore-file")
    .setInputFiles({
      name: "secim-listeleri.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect.poll(() => handled).toBe(true);
}

test("catalog additions and renames reach new and existing forms after reload while every preference change has exact undo", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await add(page, "projectCode", "PRJ-ALFA");
  await expect(catalogRow(page, "projectCode", "PRJ-ALFA")).toBeVisible();
  const afterAdd = await saved(page);
  expect((await store(page)).records).toEqual(original);
  await closeSettings(page);
  await openNewDaily(page);
  let menu = await openChoices(page, "projectCode");
  await menu.getByText("PRJ-ALFA", { exact: true }).click();
  await expect(form(page).locator('[name="projectCode"]')).toHaveValue(
    "PRJ-ALFA",
  );
  await closeEditor(page);
  await page
    .locator('.full-table tr[data-id="catalog-primary"] .task-name')
    .click();
  menu = await openChoices(page, "projectCode");
  await expect(menu.getByText("PRJ-ALFA", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await closeEditor(page);
  expect(await saved(page)).toBe(afterAdd);
  await rename(page, "projectCode", "PRJ-ALFA", "PRJ-BETA");
  expect((await store(page)).records).toEqual(original);
  await closeSettings(page);
  await page.reload();
  await openNewDaily(page);
  menu = await openChoices(page, "projectCode");
  await expect(menu.getByText("PRJ-BETA", { exact: true })).toBeVisible();
  await expect(menu.getByText("PRJ-ALFA", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await closeEditor(page);
  await undo(page);
  expect(await saved(page)).toBe(afterAdd);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("removed learned and built-in choices stay hidden without rewriting old values and explicit re-add restores only the chosen entries", async ({
  page,
}) => {
  const original = await seed(page);
  await remove(page, "projectCode", "İPEK-42");
  await remove(page, "workType", "Test");
  await remove(page, "workType", "Atölye");
  await rename(page, "workType", "İnceleme", "Değerlendirme");
  expect((await store(page)).records).toEqual(original);
  await closeSettings(page);
  await page.reload();
  await openNewDaily(page);
  let menu = await openChoices(page, "projectCode");
  await expect(menu.getByText("İPEK-42", { exact: true })).toHaveCount(0);
  await expect(menu.getByText("BİTEN-1", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  menu = await openChoices(page, "workType");
  for (const value of ["Test", "Atölye", "İnceleme"])
    await expect(menu.getByText(value, { exact: true })).toHaveCount(0);
  await expect(menu.getByText("Değerlendirme", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await closeEditor(page);
  await page
    .locator('.full-table tr[data-id="catalog-primary"] .task-name')
    .click();
  await expect(form(page).locator('[name="projectCode"]')).toHaveValue(
    "İPEK-42",
  );
  await expect(form(page).locator('[name="workType"]')).toHaveValue("İnceleme");
  await openCreationExtras(page);
  await form(page)
    .locator('[name="description"]')
    .fill("Yalnızca gerçek not düzenlendi.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const old = original.find((item) => item.id === "catalog-primary");
  const edited = (await store(page)).records.find((item) => item.id === old.id);
  expect({
    ...edited,
    description: old.description,
    updatedAt: old.updatedAt,
  }).toEqual(old);
  await add(page, "projectCode", "İPEK-42");
  await openCatalog(page, "workType");
  const removed = catalog(page, "workType").locator("[data-choice-removed]");
  if (!(await removed.evaluate((element) => element.open)))
    await removed.locator(":scope > summary").click();
  await removed
    .locator("[data-choice-hidden-value]")
    .filter({ hasText: "Test" })
    .locator('[data-choice-action="restore"]')
    .click();
  await closeSettings(page);
  await page.reload();
  await openNewDaily(page);
  menu = await openChoices(page, "projectCode");
  await expect(menu.getByText("İPEK-42", { exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  menu = await openChoices(page, "workType");
  await expect(menu.getByText("Test", { exact: true })).toBeVisible();
  await expect(menu.getByText("Atölye", { exact: true })).toHaveCount(0);
});

test("blank, duplicate and overlong catalogs fail without writes while literal HTML remains safe in settings and dropdowns", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const value of ["   ", " ipek-42 "]) {
    await add(page, "projectCode", value);
    await expect(
      catalog(page, "projectCode").locator("[data-choice-error]"),
    ).toBeVisible();
    expect(await saved(page)).toBe(before);
  }
  await rename(page, "projectCode", "İPEK-42", "BİTEN-1");
  await expect(
    catalog(page, "projectCode").locator("[data-choice-error]"),
  ).not.toBeEmpty();
  expect(await saved(page)).toBe(before);
  await renameForm(page, "projectCode")
    .locator('[data-choice-action="cancel"]')
    .click();
  for (const kind of ["projectCode", "workType"]) {
    await openCatalog(page, kind);
    await expect(
      addForm(page, kind).locator('[name="choiceValue"]'),
    ).toHaveAttribute("maxlength", "120");
  }
  await openBackup(page);
  let confirmations = 0;
  page.on("dialog", async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  await settings(page)
    .locator("#restore-file")
    .setInputFiles({
      name: "uzun-liste.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          records: original,
          choiceLists: {
            projectCode: { added: ["X".repeat(121)], hidden: [] },
            workType: { added: [], hidden: [] },
          },
        }),
      ),
    });
  await expect(
    settings(page).locator("#settings-backup-error"),
  ).not.toBeEmpty();
  expect(confirmations).toBe(0);
  expect(await saved(page)).toBe(before);
  await add(page, "projectCode", UNSAFE);
  await expect(catalogRow(page, "projectCode", UNSAFE)).toBeVisible();
  await expect(
    settings(page).locator(
      "[data-choice-list-settings] img, [data-choice-list-settings] script",
    ),
  ).toHaveCount(0);
  await closeSettings(page);
  await openNewDaily(page);
  const menu = await openChoices(page, "projectCode");
  await expect(menu.getByText(UNSAFE, { exact: true })).toBeVisible();
  await expect(menu.locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.catalogInjected)).toBeUndefined();
  await page.keyboard.press("Escape");
  await closeEditor(page);
  expect((await store(page)).records).toEqual(original);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("a stale rename keeps its draft and cannot replace another window's committed catalog", async ({
  page,
  context,
}) => {
  const original = await seed(page);
  const local = await startRename(page, "projectCode", "İPEK-42");
  await local.fill("Kaydedilmemiş yerel ad");
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await rename(other, "projectCode", "İPEK-42", "Uzak penceredeki yeni ad");
  const remote = await saved(other);
  await expect(local).toHaveValue("Kaydedilmemiş yerel ad");
  const submit = renameForm(page, "projectCode").getByRole("button", {
    name: "Kaydet",
    exact: true,
  });
  if (await submit.isEnabled()) await submit.click();
  await expect(
    catalog(page, "projectCode").locator("[data-choice-error]"),
  ).not.toBeEmpty();
  await expect(local).toHaveValue("Kaydedilmemiş yerel ad");
  expect(await saved(page)).toBe(remote);
  expect((await store(page)).records).toEqual(original);
  await renameForm(page, "projectCode")
    .locator('[data-choice-action="cancel"]')
    .click();
  await expect(
    catalogRow(page, "projectCode", "Uzak penceredeki yeni ad"),
  ).toBeVisible();
  await other.close();
});

test("native backup transfers records and catalogs atomically while legacy record-only restore preserves the receiver's current lists", async ({
  page,
  browser,
}) => {
  const original = await seed(page);
  await add(page, "projectCode", "TAŞINAN-42");
  await remove(page, "workType", "Test");
  const sourceCatalog = (await store(page)).odak.preferences.choiceLists;
  await openBackup(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records).toEqual(original);
  expect(backup.choiceLists).toEqual(sourceCatalog);
  const receiverContext = await browser.newContext({
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const receiver = await receiverContext.newPage();
    await seed(
      receiver,
      [
        record({
          id: "receiver-record",
          title: "Alıcının özgün kaydı",
          projectCode: "ALICI-ÖZGÜN",
          workType: "Yerel iş",
        }),
      ],
      "dark",
    );
    await add(receiver, "projectCode", "ALICI-9");
    const beforeImport = await saved(receiver);
    const receiverCatalog = (await store(receiver)).odak.preferences
      .choiceLists;
    await restore(receiver, backup, false);
    expect(await saved(receiver)).toBe(beforeImport);
    await restore(receiver, backup);
    await expect
      .poll(async () => (await store(receiver)).records)
      .toEqual(original);
    expect((await store(receiver)).odak.preferences.choiceLists).toEqual(
      sourceCatalog,
    );
    await expect(receiver.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await openNewDaily(receiver);
    let menu = await openChoices(receiver, "projectCode");
    await expect(menu.getByText("TAŞINAN-42", { exact: true })).toBeVisible();
    await expect(menu.getByText("ALICI-9", { exact: true })).toHaveCount(0);
    await receiver.keyboard.press("Escape");
    menu = await openChoices(receiver, "workType");
    await expect(menu.getByText("Test", { exact: true })).toHaveCount(0);
    await receiver.keyboard.press("Escape");
    await closeEditor(receiver);
    await undo(receiver);
    expect(await saved(receiver)).toBe(beforeImport);
    const legacyRecords = [
      record({
        id: "legacy-backup",
        title: "Eski kayıt yedeği",
        projectCode: "ESKİ-DOSYA",
      }),
    ];
    await restore(receiver, { version: 1, records: legacyRecords });
    await expect
      .poll(async () => (await store(receiver)).records)
      .toEqual(legacyRecords);
    expect((await store(receiver)).odak.preferences.choiceLists).toEqual(
      receiverCatalog,
    );
    await undo(receiver);
    expect(await saved(receiver)).toBe(beforeImport);
  } finally {
    await receiverContext.close();
  }
});
