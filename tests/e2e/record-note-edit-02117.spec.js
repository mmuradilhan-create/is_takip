import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const original = () =>
  createRecord({
    id: "note-edit-daily",
    title: "Notu düzenlenecek iş",
    description: '<img src=x onerror="window.noteEditInjected=1">\nÖzgün not.',
    workContext: "ad_hoc",
    priority: "high",
    dueDate: "2026-11-13",
    sourceFields: { original: { value: "Kaynak alanı korunur." } },
    workLog: [
      {
        id: "note-edit-log",
        date: "2026-11-07",
        endedAt: STAMP,
        durationMs: 93_000,
        note: "Çalışma geçmişi korunur.",
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const editor = (page) => page.locator("#record-note-editor");
const text = (page) => editor(page).locator('[name="description"]');
const save = (page) =>
  editor(page).getByRole("button", { name: "Kaydet", exact: true });
const trigger = (page) =>
  page.locator(
    '[data-record-row][data-id="note-edit-daily"] [data-action="record-note"]',
  );
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(page, records = [original()]) {
  const record = original();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("note-edit-02117-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("note-edit-02117-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return record;
}

async function confirmDiscard(page, action, accept) {
  const confirmation = page.waitForEvent("dialog");
  const pending = action();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("Kaydedilmemiş değişiklikler");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await pending;
}

test("direct note editing confirms dirty dismissal, preserves only the note on Save, and removes or restores its icon with exact Undo", async ({
  page,
}) => {
  const record = await seed(page);
  const before = await saved(page);
  await trigger(page).click();
  await expect(editor(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(text(page)).toBeFocused();
  await expect(text(page)).toHaveValue(record.description);
  await expect(editor(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.noteEditInjected)).toBeUndefined();
  await text(page).fill("Kaydedilmemiş not taslağı");
  for (const action of [
    () => page.mouse.click(4, 4),
    () => page.keyboard.press("Escape"),
    () =>
      editor(page)
        .getByRole("button", { name: "Pencereyi kapat", exact: true })
        .click(),
    () =>
      editor(page).getByRole("button", { name: "Vazgeç", exact: true }).click(),
  ]) {
    await confirmDiscard(page, action, false);
    await expect(editor(page)).toBeVisible();
    await expect(text(page)).toHaveValue("Kaydedilmemiş not taslağı");
    expect(await saved(page)).toBe(before);
  }
  await confirmDiscard(page, () => page.mouse.click(4, 4), true);
  await expect(editor(page)).not.toBeVisible();
  await expect(trigger(page)).toBeFocused();
  expect(await saved(page)).toBe(before);

  const unexpected = [];
  page.on("dialog", async (dialog) => {
    unexpected.push(dialog.message());
    await dialog.dismiss();
  });
  await trigger(page).press("Enter");
  await text(page).fill("Geçici not");
  await text(page).fill(record.description);
  await page.keyboard.press("Escape");
  await expect(editor(page)).not.toBeVisible();
  await trigger(page).click();
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await trigger(page).click();
  await text(page).fill("Yeni ilk satır\nİkinci satır");
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual([
    {
      ...record,
      description: "Yeni ilk satır\nİkinci satır",
      updatedAt: NOW.toISOString(),
    },
  ]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await trigger(page).click();
  await text(page).fill("   ");
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  await expect(trigger(page)).toHaveCount(0);
  expect((await stored(page)).records).toEqual([
    { ...record, description: "", updatedAt: NOW.toISOString() },
  ]);
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expect(trigger(page)).toHaveCount(0);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(trigger(page)).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("editing a linked action or meeting note never synchronizes an unrelated stored lifecycle status", async ({
  page,
}) => {
  const meeting = createRecord({
    id: "note-edit-source",
    type: "meeting",
    title: "Tarihsel toplantı durumu korunacak",
    description: "Toplantının özgün notu",
    status: "completed",
    decision: "Günlük işin kendi durumu ayrı tutulur.",
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  const daily = createRecord({
    ...original(),
    sourceFields: {
      original: { value: "Kaynak alanı korunur." },
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  const records = [meeting, daily];
  await seed(page, records);
  const before = await saved(page);
  await trigger(page).click();
  await text(page).fill("Günlük işin yeni notu");
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual([
    meeting,
    {
      ...daily,
      description: "Günlük işin yeni notu",
      updatedAt: NOW.toISOString(),
    },
  ]);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.locator('#nav [data-view="meeting"]').click();
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await page
    .locator(
      `[data-record-row][data-id="${meeting.id}"] [data-action="record-note"]`,
    )
    .click();
  await text(page).fill("Toplantının yeni notu");
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual([
    {
      ...meeting,
      description: "Toplantının yeni notu",
      updatedAt: NOW.toISOString(),
    },
    daily,
  ]);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("a failed note storage write leaves the draft and exact records intact and retry makes one undoable save", async ({
  page,
}) => {
  const record = await seed(page);
  const before = await saved(page);
  await trigger(page).click();
  await text(page).fill("Yeniden denenecek not");
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    window.restoreNoteStorage = () => {
      Storage.prototype.setItem = originalSetItem;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test depolaması dolu", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, KEY);
  await save(page).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator("#record-note-edit-error")).toContainText(
    "kaydedilemedi",
  );
  await expect(text(page)).toHaveValue("Yeniden denenecek not");
  expect(await saved(page)).toBe(before);
  await page.evaluate(() => window.restoreNoteStorage());
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual([
    {
      ...record,
      description: "Yeniden denenecek not",
      updatedAt: NOW.toISOString(),
    },
  ]);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("note editing preserves a concurrent unrelated title change and refuses a concurrent note replacement without losing the local draft", async ({
  page,
  context,
}) => {
  await seed(page);
  await trigger(page).click();
  await text(page).fill("Yerel not taslağı");
  const peer = await context.newPage();
  await peer.clock.setFixedTime(NOW);
  await peer.goto("/");
  await peer.locator('#nav [data-view="daily"]').click();
  await peer
    .locator('[data-record-row][data-id="note-edit-daily"] .task-name')
    .click();
  await peer
    .locator('#record-form [name="title"]')
    .fill("Başka pencereden değişen başlık");
  await peer
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const external = await saved(peer);
  await expect.poll(() => saved(page)).toBe(external);
  await expect(editor(page).locator(".record-note-edit-topic")).toHaveText(
    "Başka pencereden değişen başlık",
  );
  await expect(
    editor(page).locator(".record-note-edit-availability"),
  ).not.toBeVisible();
  await save(page).click();
  await expect(editor(page)).not.toBeVisible();
  const externalStore = JSON.parse(external);
  expect((await stored(page)).records).toEqual([
    {
      ...externalStore.records[0],
      description: "Yerel not taslağı",
      updatedAt: NOW.toISOString(),
    },
  ]);
  await undo(page);
  expect(await saved(page)).toBe(external);

  await trigger(page).click();
  await text(page).fill("Çakışmada korunacak yerel not");
  await trigger(peer).click();
  await text(peer).fill("Başka pencereden kaydedilen yeni not");
  await save(peer).click();
  await expect(editor(peer)).not.toBeVisible();
  const externalNote = await saved(peer);
  await expect.poll(() => saved(page)).toBe(externalNote);
  await expect(
    editor(page).locator(".record-note-edit-availability"),
  ).toContainText("değişti");
  await expect(save(page)).toBeDisabled();
  await expect(text(page)).toHaveValue("Çakışmada korunacak yerel not");
  await editor(page)
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect(editor(page).locator("#record-note-edit-error")).toContainText(
    "değişti",
  );
  expect(await saved(page)).toBe(externalNote);
  await confirmDiscard(page, () => page.keyboard.press("Escape"), true);
  await expect(editor(page)).not.toBeVisible();
  await peer.close();
});
