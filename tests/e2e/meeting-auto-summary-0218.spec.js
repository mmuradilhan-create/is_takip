import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const source = (id, status = "waiting") =>
  cleanupMeetingContacts([
    make({
      id,
      type: "meeting",
      title: `Toplantı kararı ${id}`,
      status,
      sourceDate: "2026-10-28",
      dueDate: "2026-11-03",
      priority: "urgent",
      owner: "Toplantı bağlamının sorumlusu",
      nextAction: "Korunacak eski toplantı adımı.",
      decision: "Özgün mühendislik kararı.",
      participants: "Tasarım ve üretim ekibi",
      description: "Toplantının özgün notu.",
      sourceFields: { original: { value: "Kaynak ve geçmiş korunmalı" } },
    }),
  ])[0];
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => (await stored(page)).records;
const list = (page) => page.locator('#nav [data-view="meeting"]').click();
const row = (page, id) =>
  page.locator(`.meeting-table tr[data-record-row][data-id="${id}"]`);
const form = (page) => page.locator("#record-form");
const menu = (page) => page.locator("#status-menu");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
const saveEditor = async (page) => {
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
};

async function seed(page, items) {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.clock.setFixedTime(NOW);
  const original = JSON.stringify({
    version: 1,
    records: items,
    odak: { version: 1, preferences: { density: "compact" }, history: [] },
  });
  await page.addInitScript(
    ({ key, original }) => {
      if (sessionStorage.getItem("meeting-auto-summary-0218-seeded")) return;
      localStorage.setItem(key, original);
      sessionStorage.setItem("meeting-auto-summary-0218-seeded", "1");
    },
    { key: KEY, original },
  );
  await page.goto("/");
  await list(page);
  expect(await saved(page)).toBe(original);
  return original;
}

async function expectAssignmentChoices(page) {
  expect(
    await form(page)
      .locator('[name="status"] option')
      .evaluateAll((options) =>
        options.map((option) => ({
          value: option.value,
          label: option.textContent.trim(),
          disabled: option.disabled,
        })),
      ),
  ).toEqual([
    { value: "planned", label: "Planlanacak", disabled: false },
    { value: "in_progress", label: "Açık", disabled: false },
    { value: "completed", label: "Kapandı", disabled: false },
  ]);
}

async function openSourceMenu(page, id) {
  await row(page, id).locator(".status-col > .status-trigger").click();
  await expect(menu(page)).toBeVisible();
  expect(
    await menu(page)
      .locator('[data-action="set-status"]')
      .evaluateAll((options) =>
        options.map((option) => ({
          id: option.dataset.id,
          status: option.dataset.status,
          label: option.querySelector("span").textContent,
        })),
      ),
  ).toEqual([
    { id, status: "planned", label: "Planlanacak" },
    { id, status: "in_progress", label: "Açık" },
    { id, status: "completed", label: "Kapandı" },
  ]);
  await expect(menu(page).getByRole("group")).toHaveCount(0);
}

test("legacy unlinked meetings display their own status aliases without rewriting raw status on load, backup or title edits", async ({
  page,
}) => {
  const items = [
    source("legacy-waiting", "waiting"),
    source("legacy-working", "in_progress"),
    source("legacy-partial", "partially_completed"),
    source("current-planned", "planned"),
    source("already-completed", "completed"),
    source("already-cancelled", "cancelled"),
  ];
  const original = await seed(page, items);
  for (const item of items.slice(0, 4)) {
    const badge = row(page, item.id).locator(".status-col > .status-trigger");
    const planned = item.status === "planned";
    await expect(badge).toHaveText(planned ? "Planlanacak" : "Açık");
    await expect(badge).toHaveClass(
      planned ? /status-planned/ : /status-in_progress/,
    );
  }
  await page.locator("#status-filter").selectOption("in_progress");
  expect(
    (
      await page
        .locator(".meeting-table tr[data-record-row]")
        .evaluateAll((rows) => rows.map((item) => item.dataset.id))
    ).sort(),
  ).toEqual(
    items
      .slice(0, 3)
      .map((item) => item.id)
      .sort(),
  );
  await page.locator("#status-filter").selectOption("planned");
  await expect(row(page, "current-planned")).toBeVisible();
  await expect(page.locator(".meeting-table tr[data-record-row]")).toHaveCount(
    1,
  );
  await page.locator("#status-filter").selectOption("all");
  expect(await saved(page)).toBe(original);

  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
    .click();
  const download = await pendingDownload;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.records).toEqual(items);
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  expect(await saved(page)).toBe(original);

  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await openCreationExtras(page);
  await expect(form(page).locator('select[name="type"]')).toHaveValue(
    "meeting",
  );
  await expectAssignmentChoices(page);
  await closeEditor(page);
  expect(await saved(page)).toBe(original);

  await row(page, "legacy-waiting").locator(".record-edit-trigger").click();
  await expectAssignmentChoices(page);
  await expect(form(page).locator('[name="status"]')).toHaveValue(
    "in_progress",
  );
  await form(page)
    .locator('[name="title"]')
    .fill("Başlığı açıklığa kavuşmuş toplantı kararı");
  await saveEditor(page);
  expect(await records(page)).toEqual(
    items.map((item) =>
      item.id === "legacy-waiting"
        ? {
            ...item,
            title: "Başlığı açıklığa kavuşmuş toplantı kararı",
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await expect(
    row(page, "legacy-waiting").locator(".status-trigger"),
  ).toHaveText("Açık");
  await undo(page);
  expect(await saved(page)).toBe(original);
  await page.reload();
  expect(await saved(page)).toBe(original);
});

test("an unlinked meeting opens and closes through its own status column with exact Undo per transition", async ({
  page,
}) => {
  const item = source("unlinked-transition", "planned");
  const original = await seed(page, [item]);
  const ownStatus = () =>
    row(page, item.id).locator(".status-col > .status-trigger");
  await expect(ownStatus()).toHaveText("Planlanacak");
  await expect(
    row(page, item.id).locator(
      ".quick-complete, .completion-mark, .meeting-title-state, .meeting-archive-control",
    ),
  ).toHaveCount(0);
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await openSourceMenu(page, item.id);
  await menu(page).locator('[data-status="planned"]').click();
  expect(await saved(page)).toBe(original);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();

  await openSourceMenu(page, item.id);
  await menu(page).locator('[data-status="in_progress"]').click();
  const opened = {
    ...item,
    status: "in_progress",
    updatedAt: NOW.toISOString(),
  };
  expect(await records(page)).toEqual([opened]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await expect(ownStatus()).toHaveText("Açık");
  await row(page, item.id).locator(".record-edit-trigger").click();
  await expectAssignmentChoices(page);
  await expect(form(page).locator('[name="status"]')).toBeEnabled();
  await form(page).locator('[name="status"]').selectOption("completed");
  await saveEditor(page);
  expect(await records(page)).toEqual([{ ...opened, status: "completed" }]);
  expect((await stored(page)).odak.history).toHaveLength(2);
  const completedBytes = await saved(page);
  await expect(ownStatus()).toHaveText("Kapandı");
  await expect(
    row(page, item.id).locator(
      ".meeting-archive-control, .quick-complete, .completion-mark",
    ),
  ).toHaveCount(0);
  await page
    .locator('[data-action="list-scope"][data-scope="completed"]')
    .click();
  await expect(row(page, item.id)).toBeVisible();
  await page.reload();
  expect(await saved(page)).toBe(completedBytes);
  await list(page);
  await page
    .locator('[data-action="list-scope"][data-scope="completed"]')
    .click();
  await openSourceMenu(page, item.id);
  await menu(page).locator('[data-status="in_progress"]').click();
  await expect(row(page, item.id)).toHaveCount(0);
  expect(await records(page)).toEqual([opened]);
  expect((await stored(page)).odak.history).toHaveLength(3);
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await undo(page);
  expect(await saved(page)).toBe(completedBytes);
  await undo(page);
  expect(await records(page)).toEqual([opened]);
  await undo(page);
  expect(await saved(page)).toBe(original);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("linked meetings keep independent source and target status menus while source context edits preserve legacy fields", async ({
  page,
}) => {
  const context = source("linked-context", "in_progress");
  const target = (id, type, values) =>
    make({
      id,
      type,
      title: `${type} gerçek işi`,
      sourceFields: {
        __followupSource: { recordId: context.id, type: "meeting" },
      },
      ...values,
    });
  const daily = target("linked-daily", "daily", {
    status: "in_progress",
    dueDate: "2026-11-12",
  });
  const waiting = target("linked-waiting", "waiting", {
    status: "waiting_response",
    expectedFrom: "Test ekibi",
    latestUpdate: "Dış yanıt bekleniyor.",
    nextFollowUpDate: "2026-11-10",
    lastFollowUpDate: "2026-11-04",
  });
  const items = [context, daily, waiting];
  const original = await seed(page, items);
  const dailyStatus = () =>
    row(page, context.id).locator(
      `.status-trigger[data-target-id="${daily.id}"]`,
    );
  const waitingStatus = () =>
    row(page, context.id).locator(
      `.status-trigger[data-target-id="${waiting.id}"]`,
    );
  await expect(dailyStatus()).toHaveText("Devam ediyor");
  await expect(waitingStatus()).toHaveText("Cevap bekleniyor");
  await waitingStatus().click();
  await expect(
    menu(page).getByRole("group", { name: "İşin durumu", exact: true }),
  ).toHaveCount(0);
  await expect(
    menu(page).getByRole("group", { name: "Takibin durumu", exact: true }),
  ).toBeVisible();
  await expect(
    menu(page).locator(`[data-action="set-status"][data-id="${context.id}"]`),
  ).toHaveCount(0);
  await expect(
    menu(page)
      .locator(`[data-action="set-status"][data-id="${daily.id}"]`)
      .first(),
  ).toHaveCount(0);
  await expect(menu(page).locator('[data-status="completed"]')).toHaveCount(0);
  await menu(page)
    .locator(
      `[data-action="set-status"][data-id="${waiting.id}"][data-status="follow_up"]`,
    )
    .click();
  const followed = [
    context,
    daily,
    { ...waiting, status: "follow_up", updatedAt: NOW.toISOString() },
  ];
  expect(await records(page)).toEqual(followed);
  const followedBytes = await saved(page);

  await row(page, context.id).locator(".record-edit-trigger").click();
  await expect(form(page).locator('[name="status"]')).toBeEnabled();
  await expectAssignmentChoices(page);
  await expect(form(page).locator('[name="status"]')).toHaveValue(
    "in_progress",
  );
  await expect(form(page).locator('[name="dueDate"]')).toBeHidden();
  await expect(form(page).locator('[name="dueDate"]')).toHaveValue(
    "03.11.2026",
  );
  await expect(form(page).locator('[name="priority"]')).toBeHidden();
  await expect(form(page).locator('[name="priority"]')).toHaveValue("urgent");
  await form(page)
    .locator('[name="title"]')
    .fill("Bağlı işlerin açıklanmış toplantı bağlamı");
  await saveEditor(page);
  expect(await records(page)).toEqual([
    {
      ...context,
      title: "Bağlı işlerin açıklanmış toplantı bağlamı",
      updatedAt: NOW.toISOString(),
    },
    followed[1],
    followed[2],
  ]);
  await undo(page);
  expect(await saved(page)).toBe(followedBytes);

  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator(
      `.full-table tr[data-record-row][data-id="${daily.id}"] .quick-complete`,
    )
    .click();
  await list(page);
  await expect(dailyStatus()).toHaveText("Tamamlandı");
  await expect(waitingStatus()).toHaveText("Takipte");
  await expect(
    row(page, context.id).locator(".status-col > .status-trigger"),
  ).toHaveText("Açık");
  expect(await records(page)).toEqual([
    context,
    { ...daily, status: "completed", updatedAt: NOW.toISOString() },
    followed[2],
  ]);
  await undo(page);
  expect(await saved(page)).toBe(followedBytes);
  await undo(page);
  expect(await saved(page)).toBe(original);
});
