import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord, validateStore } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const CLEANUP_KEY = `${KEY}-import-notes-cleanup`;
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const CUSTOM_PROJECT =
  '<img src=x onerror="window.detailsInjected=1"> PRJ-Özel';

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

function fixture() {
  return [
    record({
      id: "details-weekly",
      type: "weekly",
      title: "Ayrıntı kontrol haftalık hedefi",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "İnceleme",
    }),
    record({
      id: "details-primary",
      title: "İşin gerçek ayrıntılarını düzenle",
      parentId: "details-weekly",
      status: "in_progress",
      dueDate: "2026-11-07",
      category: "Özgün kategori korunmalı",
      workType: "İnceleme",
      description: "Kullanıcının gerçek notu korunmalı.",
      nextAction: "Kontrol sonucunu paylaş.",
      sourceFields: { "Özgün kaynak": "Kaynak saklanmalı" },
    }),
    record({
      id: "details-known-completed",
      title: "Önceden tamamlanmış proje işi",
      status: "completed",
      projectCode: "TST-42",
      workType: "Prototip",
    }),
    record({
      id: "details-waiting",
      title: "Malzeme yanıtını bekleyen iş",
      parentId: "details-weekly",
      status: "waiting",
      waitingReason: "Malzeme yanıtı bekleniyor.",
      projectCode: "ENG-11",
      workType: "Analiz",
    }),
    record({
      id: "details-closed-waiting",
      title: "Geçmişte beklemesi olan bitmiş iş",
      status: "completed",
      waitingReason: "Eski bekleme bilgisi.",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, cleanupKey, records }) => {
      if (sessionStorage.getItem("record-details-seeded")) return;
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
      localStorage.removeItem(cleanupKey);
      sessionStorage.setItem("record-details-seeded", "true");
    },
    { key: KEY, cleanupKey: CLEANUP_KEY, records },
  );
  await page.goto("/");
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const list = (page, type = "daily") =>
  page.locator(`#nav [data-view="${type}"]`).click();
const row = (page, id = "details-primary") =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const form = (page) => page.locator("#record-form");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator(
      '#editor [data-action="close"], #editor [data-action="creation-close"]',
    )
    .last()
    .click();

async function newDaily(page, title) {
  await list(page);
  await page.locator(".new-record").click();
  await form(page).locator('[name="title"]').fill(title);
  await openCreationExtras(page);
  return form(page);
}

async function choose(page, name, value) {
  await openCreationExtras(page);
  const field = form(page).locator(`[name="${name}"]`);
  await field.fill("");
  await field.press("ArrowDown");
  const menu = page.locator("#record-choice-menu");
  await expect(menu).toBeVisible();
  await menu.getByText(value, { exact: true }).click();
  await expect(field).toHaveValue(value);
  await expect(menu).not.toBeVisible();
}

test("only proven imported metadata is removed from notes, and a single undo remains respected after reload", async ({
  page,
}) => {
  const realNote = "Gerçek kullanıcı notu korunur.";
  const generated = record({
    id: "details-generated",
    title: "Aktarım notunu temizle",
    description: `Gün: Perşembe\nGecikme: Gecikti\nOdak Sıra: 6\n${realNote}`,
    sourceFields: { Gün: "Perşembe", Gecikme: "Gecikti", "Odak Sıra": 6 },
  });
  const genuine = record({
    id: "details-genuine",
    title: "Kullanıcı tarafından yazılmış gün notu",
    description: "Gün: Perşembe\nGerçek plan notu",
    sourceFields: {
      Gün: "Perşembe",
      Notlar: "Gün: Perşembe\nGerçek plan notu",
    },
  });
  const noSource = record({
    id: "details-no-source",
    title: "Kaynak kanıtı olmayan not",
    description: "Gün: Perşembe\nOdak Sıra: 6",
  });
  const original = await seed(page, [generated, genuine, noSource]);
  const cleaned = await readRecords(page);
  expect(cleaned).toEqual([
    { ...generated, description: realNote },
    genuine,
    noSource,
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CLEANUP_KEY),
  ).toBe("1");
  await list(page);
  await row(page, generated.id).locator(".task-name").click();
  await expect(form(page).locator('[name="description"]')).toHaveValue(
    realNote,
  );
  await expect(page.locator(".source-details, .source-note")).toHaveCount(0);
  await closeEditor(page);
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
  await page.reload();
  expect(await readRecords(page)).toEqual(original);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.locator('[data-action="cleanup-import-notes"]').click();
  expect(await readRecords(page)).toEqual(cleaned);
});

test("editable project and work-type choices include saved completed records and learn only saved custom values", async ({
  page,
}) => {
  const original = await seed(page);
  const draft = await newDaily(page, "Yeni özel proje işi");
  await choose(page, "projectCode", "TST-42");
  await choose(page, "workType", "Test");
  await draft.locator('[name="projectCode"]').fill(CUSTOM_PROJECT);
  await draft.locator('[name="workType"]').fill("Özel ölçüm");
  await draft.locator('[name="description"]').fill("Yeni gerçek sonuç notu.");
  await expect(draft.locator('[name="nextAction"]')).not.toBeVisible();
  await page.getByRole("button", { name: "Kaydı ekle", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const saved = await readRecords(page);
  const created = saved.find(
    (record) => record.title === "Yeni özel proje işi",
  );
  expect(created).toMatchObject({
    type: "daily",
    projectCode: CUSTOM_PROJECT,
    workType: "Özel ölçüm",
    description: "Yeni gerçek sonuç notu.",
    nextAction: "",
    sourceDate: "2026-11-07",
  });
  expect(saved.filter((record) => record.id !== created.id)).toEqual(original);
  expect(await page.evaluate(() => window.detailsInjected)).toBeUndefined();
  await page.reload();
  const beforeDraft = await readSaved(page);
  await newDaily(page, "Vazgeçilecek iş");
  await choose(page, "projectCode", CUSTOM_PROJECT);
  await choose(page, "workType", "Özel ölçüm");
  await form(page).locator('[name="projectCode"]').fill("Vazgeçilen proje");
  await page.keyboard.press("Escape");
  await closeEditor(page);
  expect(await readSaved(page)).toBe(beforeDraft);
  await newDaily(page, "Diğer taslak");
  await form(page).locator('[name="projectCode"]').press("ArrowDown");
  const menu = page.locator("#record-choice-menu");
  await expect(menu).toBeVisible();
  await expect(menu).not.toContainText("Vazgeçilen proje");
  await expect(menu.getByText(CUSTOM_PROJECT, { exact: true })).toBeVisible();
  await expect(menu.locator("img")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await closeEditor(page);
  expect(await readSaved(page)).toBe(beforeDraft);
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
});

test("daily waiting is controlled by status while reason, work details and backup remain intact", async ({
  page,
}) => {
  const original = await seed(page);
  await list(page);
  await row(page).locator(".task-name").click();
  await expect(form(page).locator('[name="category"]')).toHaveCount(0);
  await expect(form(page).locator('[name="blocked"]')).toHaveCount(0);
  await expect(form(page).locator('[name="waitingReason"]')).not.toBeVisible();
  await form(page).locator('[name="status"]').selectOption("waiting");
  await expect(form(page).locator('[name="waitingReason"]')).toBeVisible();
  await form(page)
    .locator('[name="waitingReason"]')
    .fill("Tasarım yanıtı bekleniyor.");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="nextAction"]')).toBeHidden();
  await expect(form(page).locator('[name="nextAction"]')).toBeDisabled();
  await form(page).locator('[name="projectCode"]').fill("ENG-11");
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const edited = await readRecords(page);
  const primary = edited.find((record) => record.id === "details-primary");
  const oldPrimary = original.find((record) => record.id === primary.id);
  expect(primary).toMatchObject({
    status: "waiting",
    blocked: false,
    waitingReason: "Tasarım yanıtı bekleniyor.",
    projectCode: "ENG-11",
    category: oldPrimary.category,
    workType: oldPrimary.workType,
    description: oldPrimary.description,
    nextAction: oldPrimary.nextAction,
    sourceFields: oldPrimary.sourceFields,
  });
  await expect(
    page.locator(".blocked-badge, #blocker-details-popover"),
  ).toHaveCount(0);
  await page.locator("#status-filter").selectOption("waiting");
  expect(
    await page
      .locator(".full-table > tbody > tr[data-record-row]")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id).sort()),
  ).toEqual(["details-primary", "details-waiting"]);
  await expect(row(page).locator(".work-start")).toBeEnabled();
  await row(page).locator(".work-start").click();
  await expect(page.locator("#work-session-panel")).toHaveAttribute(
    "data-phase",
    "running",
  );
  await page.clock.fastForward(2000);
  await page.locator('[data-action="work-pause"]').click();
  expect(await readRecords(page)).toEqual(edited);
  await list(page, "dashboard");
  await expect(
    page.locator('.focus-row[data-id="details-primary"] .status-trigger'),
  ).toContainText("Beklemede");
  await expect(page.locator(".blocked-badge")).toHaveCount(0);
  await list(page, "weekly");
  await page
    .locator('.weekly-goal-row[data-id="details-weekly"] .goal-details-trigger')
    .click();
  await expect(
    page.locator(
      '#goal-detail-panel .goal-child-row[data-id="details-primary"] .status-trigger',
    ),
  ).toContainText("Beklemede");
  await expect(page.locator(".blocked-badge")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = page.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="backup-records"]').click();
  const downloaded = await downloadPromise;
  const parsed = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(
    parsed.records.find((record) => record.id === primary.id),
  ).toMatchObject({
    projectCode: "ENG-11",
    waitingReason: primary.waitingReason,
    status: "waiting",
    blocked: false,
  });
  expect(validateStore(parsed).records).toEqual(edited);
  await page.locator('#settings-dialog [data-action="close"]').last().click();
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
});
