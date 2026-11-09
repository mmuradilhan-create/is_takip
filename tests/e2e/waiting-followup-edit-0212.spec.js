import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { selectListStatus } from "./list-scope-helper.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const OLD_NOTE =
  '<img src=x onerror="window.followupEditInjected=1"> Özgün ilk gelişme.';
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const topic = async (page, id = "history-topic") =>
  (await stored(page)).records.find((item) => item.id === id);
const dialog = (page) => page.locator("#waiting-followup-dialog");
const row = (page, id = "history-topic") =>
  page.locator(`.waiting-table tr[data-record-row][data-id="${id}"]`);
const entry = (page, id) =>
  dialog(page).locator(`li[data-followup-id="${id}"]`);
const edit = (page, id) =>
  entry(page, id).locator(`[data-followup-edit="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const make = (input = {}) =>
  createRecord({
    id: "history-topic",
    type: "waiting",
    title: "Gerçek dış yanıtı bekle",
    status: "waiting_response",
    sourceDate: "2026-10-28",
    dueDate: "2026-11-25",
    lastFollowUpDate: "2026-11-02",
    nextFollowUpDate: "2026-11-12",
    expectedFrom: "Dış teknik ekip",
    latestUpdate: OLD_NOTE,
    description: "Kişisel not ve ham veri korunmalı.",
    nextAction: "Yanıtı kontrol et.",
    sourceFields: { original: { value: "Özgün kayıt bilgisi" } },
    workLog: [
      {
        id: "historical-work",
        date: "2026-11-01",
        endedAt: STAMP,
        durationMs: 60_000,
        note: "Gerçek eski çalışma.",
        nextAction: "Eski çalışma adımı.",
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });

function withHistory(input = {}) {
  return make({
    lastFollowUpDate: "2026-11-05",
    latestUpdate: "Güncel takip sonucu.",
    followUpLog: [
      {
        id: "older",
        date: "2026-11-01",
        note: "Eski takip sonucu.",
        nextFollowUpDate: "2026-11-09",
        previousUpdate: OLD_NOTE,
      },
      {
        id: "latest",
        date: "2026-11-05",
        note: "Güncel takip sonucu.",
        nextFollowUpDate: "2026-11-12",
      },
    ],
    ...input,
  });
}

async function seed(page, items = [make()]) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("waiting-followup-edit-0212-seeded")) return;
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
      sessionStorage.setItem("waiting-followup-edit-0212-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function openHistory(
  page,
  id = "history-topic",
  { closed = false } = {},
) {
  await page.locator('#nav [data-view="waiting"]').click();
  if (closed) await selectListStatus(page, "completed");
  await row(page, id).locator('[data-action="waiting-followup"]').click();
  await expect(dialog(page)).toBeVisible();
}

async function closeHistory(page) {
  await dialog(page)
    .locator('.modal-footer [data-action="waiting-followup-close"]')
    .click();
  await expect(dialog(page)).not.toBeVisible();
}

async function append(
  page,
  { note = "", date = "08.11.2026", next = "14.11.2026" } = {},
) {
  await openHistory(page);
  await dialog(page).locator('[name="followUpDate"]').fill(date);
  await dialog(page).locator('[name="followUpNote"]').fill(note);
  await dialog(page).locator('[name="nextFollowUpDate"]').fill(next);
  await dialog(page)
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
}

async function startEdit(page, id) {
  await entry(page, id)
    .locator('[data-action="waiting-followup-edit"]')
    .click();
  await expect(edit(page, id)).toBeVisible();
  return edit(page, id);
}

async function saveEdit(page, id) {
  await entry(page, id)
    .locator('[data-action="waiting-followup-edit-save"]')
    .click();
  await expect(edit(page, id)).toHaveCount(0);
}

test("the first real follow-up archives an overwritten initial summary inside that entry through reload, native backup and exact Undo", async ({
  page,
}) => {
  const original = make();
  await seed(page, [original]);
  const before = await saved(page);
  await append(page, { note: "Bugün gerçek yanıt tekrar istendi." });
  const changed = await topic(page);
  expect(changed.followUpLog).toEqual([
    {
      id: expect.any(String),
      date: "2026-11-08",
      note: "Bugün gerçek yanıt tekrar istendi.",
      nextFollowUpDate: "2026-11-14",
      previousUpdate: OLD_NOTE,
    },
  ]);
  expect(changed).toEqual({
    ...original,
    updatedAt: NOW.toISOString(),
    lastFollowUpDate: "2026-11-08",
    nextFollowUpDate: "2026-11-14",
    latestUpdate: "Bugün gerçek yanıt tekrar istendi.",
    followUpLog: changed.followUpLog,
  });
  await page.reload();
  await openHistory(page);
  await expect(dialog(page).locator("li[data-followup-id]")).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const card = entry(page, changed.followUpLog[0].id);
    await expect(card.locator(".waiting-followup-previous")).toHaveCount(0);
    await expect(card).not.toContainText("Önceki son gelişme");
    await expect(card).not.toContainText(OLD_NOTE);
    await expect(card.locator("time")).toHaveText("8 Kasım 2026");
    await expect(card.locator(".waiting-followup-result")).toHaveText(
      changed.followUpLog[0].note,
    );
    await expect(card.locator(".waiting-followup-planned")).toContainText(
      "Sonraki takip: 14 Kasım 2026",
    );
    expect(await topic(page)).toEqual(changed);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await expect(dialog(page).locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.followupEditInjected),
  ).toBeUndefined();
  await closeHistory(page);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = page.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="backup-records"]').click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records).toEqual([changed]);
  await page.locator('#settings-dialog [data-action="close"]').last().click();
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect(await topic(page)).toEqual(original);
});

test("empty, identical and already represented summaries never invent additional context entries", async ({
  page,
}) => {
  await seed(page);
  const snapshots = [await saved(page)];
  await append(page);
  let current = await topic(page);
  expect(current.latestUpdate).toBe(OLD_NOTE);
  expect(current.followUpLog).toHaveLength(1);
  expect(current.followUpLog[0]).not.toHaveProperty("previousUpdate");
  snapshots.push(await saved(page));
  await append(page, { note: OLD_NOTE });
  current = await topic(page);
  expect(current.followUpLog).toHaveLength(2);
  expect(
    current.followUpLog.every((item) => !Object.hasOwn(item, "previousUpdate")),
  ).toBe(true);
  snapshots.push(await saved(page));
  await append(page, { note: "Yeni bağımsız takip sonucu." });
  current = await topic(page);
  expect(current.followUpLog).toHaveLength(3);
  expect(new Set(current.followUpLog.map((item) => item.id)).size).toBe(3);
  expect(
    current.followUpLog.every((item) => !Object.hasOwn(item, "previousUpdate")),
  ).toBe(true);
  expect(current.followUpLog.map((item) => item.note)).toEqual([
    "",
    OLD_NOTE,
    "Yeni bağımsız takip sonucu.",
  ]);
  for (const snapshot of snapshots.reverse()) {
    await undo(page);
    expect(await saved(page)).toBe(snapshot);
  }
});

test("history corrections keep entry identity and current-summary authority while closed topics stay closed", async ({
  page,
}) => {
  const original = withHistory();
  const closed = withHistory({
    id: "closed-history",
    title: "Kapalı konunun gerçek geçmişi",
    status: "completed",
  });
  await seed(page, [original, closed]);
  const before = await saved(page);
  await openHistory(page);
  await startEdit(page, "older");
  await edit(page, "older")
    .locator('[name="editFollowUpDate"]')
    .fill("02.11.2026");
  await edit(page, "older")
    .locator('[name="editNextFollowUpDate"]')
    .fill("10.11.2026");
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("Eski takip açıklaması düzeltildi.");
  await saveEdit(page, "older");
  let current = await topic(page);
  expect(current.followUpLog).toHaveLength(2);
  expect(current.followUpLog[0]).toEqual({
    ...original.followUpLog[0],
    date: "2026-11-02",
    nextFollowUpDate: "2026-11-10",
    note: "Eski takip açıklaması düzeltildi.",
  });
  expect(current).toMatchObject({
    latestUpdate: original.latestUpdate,
    lastFollowUpDate: original.lastFollowUpDate,
    nextFollowUpDate: original.nextFollowUpDate,
  });
  await startEdit(page, "latest");
  await edit(page, "latest")
    .locator('[name="editFollowUpDate"]')
    .fill("04.11.2026");
  await edit(page, "latest")
    .locator('[name="editNextFollowUpDate"]')
    .fill("16.11.2026");
  await edit(page, "latest")
    .locator('[name="editFollowUpNote"]')
    .fill("Güncel takip sonucu düzeltildi.");
  await saveEdit(page, "latest");
  current = await topic(page);
  expect(current.followUpLog.map((item) => item.id)).toEqual([
    "older",
    "latest",
  ]);
  expect(current).toMatchObject({
    latestUpdate: "Güncel takip sonucu düzeltildi.",
    lastFollowUpDate: "2026-11-04",
    nextFollowUpDate: "2026-11-16",
    status: original.status,
    dueDate: original.dueDate,
    workLog: original.workLog,
    sourceFields: original.sourceFields,
  });
  await closeHistory(page);
  await openHistory(page, closed.id, { closed: true });
  await expect(
    dialog(page).locator(".waiting-followup-fields"),
  ).toHaveJSProperty("disabled", true);
  await expect(
    dialog(page).locator('.waiting-followup-fields [name="followUpNote"]'),
  ).toBeDisabled();
  await startEdit(page, "latest");
  await expect(
    edit(page, "latest").locator('[name="editFollowUpNote"]'),
  ).toBeEnabled();
  await edit(page, "latest")
    .locator('[name="editFollowUpNote"]')
    .fill("Kapalı geçmişte yazım düzeltmesi.");
  await saveEdit(page, "latest");
  expect(await topic(page, closed.id)).toMatchObject({
    status: "completed",
    latestUpdate: "Kapalı geçmişte yazım düzeltmesi.",
    lastFollowUpDate: closed.lastFollowUpDate,
    nextFollowUpDate: closed.nextFollowUpDate,
  });
  await closeHistory(page);
  for (let index = 0; index < 3; index++) await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect((await stored(page)).records).toEqual([original, closed]);
});

test("inline edit cancel and keyboard save preserve a separate append draft without nested forms or accidental new entries", async ({
  page,
}) => {
  const original = withHistory();
  await seed(page, [original]);
  const before = await saved(page);
  await openHistory(page);
  await dialog(page).locator('[name="followUpDate"]').fill("07.11.2026");
  await dialog(page).locator('[name="nextFollowUpDate"]').fill("18.11.2026");
  await dialog(page)
    .locator('[name="followUpNote"]')
    .fill("Kaydedilmeyen yeni takip taslağı.");
  await startEdit(page, "older");
  await expect(
    edit(page, "older").locator('[name="editPreviousUpdate"]'),
  ).toHaveValue(OLD_NOTE);
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("İptal edilecek eski not taslağı.");
  await entry(page, "older")
    .locator('[data-action="waiting-followup-edit-cancel"]')
    .click();
  expect(await saved(page)).toBe(before);
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue(
    "Kaydedilmeyen yeni takip taslağı.",
  );
  await startEdit(page, "older");
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue(original.followUpLog[0].note);
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("Düzeltilen eski not.");
  await edit(page, "older")
    .locator(".date-picker-toggle")
    .first()
    .press("Enter");
  await expect(page.locator("#odak-date-picker")).toBeVisible();
  await expect(edit(page, "older")).toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(page.locator("#odak-date-picker")).not.toBeVisible();
  await expect(edit(page, "older")).toBeVisible();
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .press("Shift+Enter");
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue("Düzeltilen eski not.\n");
  await edit(page, "older")
    .locator('[name="editPreviousUpdate"]')
    .fill("Önceki gelişmenin düzeltilen açıklaması.");
  await expect(dialog(page).locator("form form")).toHaveCount(0);
  await expect(dialog(page).locator("form")).toHaveCount(1);
  expect(await saved(page)).toBe(before);
  await edit(page, "older")
    .locator('[name="editPreviousUpdate"]')
    .press("Enter");
  await expect(edit(page, "older")).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('[name="followUpDate"]')).toHaveValue(
    "07.11.2026",
  );
  await expect(dialog(page).locator('[name="nextFollowUpDate"]')).toHaveValue(
    "18.11.2026",
  );
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue(
    "Kaydedilmeyen yeni takip taslağı.",
  );
  const current = await topic(page);
  expect(current.followUpLog).toHaveLength(2);
  expect(current.followUpLog[0]).toEqual({
    ...original.followUpLog[0],
    note: "Düzeltilen eski not.",
    previousUpdate: "Önceki gelişmenin düzeltilen açıklaması.",
  });
  await expect(dialog(page).locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.followupEditInjected),
  ).toBeUndefined();
  await closeHistory(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("follow-up Enter saves one real entry while composition, modifiers, repeated keys and Shift Enter preserve the append draft", async ({
  page,
}) => {
  const original = make();
  await seed(page, [original]);
  const before = await saved(page);
  await openHistory(page);
  const note = dialog(page).locator('[name="followUpNote"]');
  await note.fill("Kaydedilmeden korunan sonuç.");
  await note.press("Shift+Enter");
  await expect(note).toHaveValue("Kaydedilmeden korunan sonuç.\n");
  await note.evaluate((element) => {
    for (const options of [
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ])
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
          ...options,
        }),
      );
    element.addEventListener("keydown", (event) => event.preventDefault(), {
      once: true,
    });
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(dialog(page)).toBeVisible();
  await expect(note).toHaveValue("Kaydedilmeden korunan sonuç.\n");
  expect(await saved(page)).toBe(before);

  await note.fill("Enter ile kaydedilen gerçek takip sonucu.");
  await note.evaluate((element) => {
    for (let index = 0; index < 2; index++)
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await expect(dialog(page)).not.toBeVisible();
  const current = await topic(page);
  expect(current.followUpLog).toHaveLength(1);
  expect(current.followUpLog[0]).toMatchObject({
    date: "2026-11-08",
    note: "Enter ile kaydedilen gerçek takip sonucu.",
    previousUpdate: original.latestUpdate,
    nextFollowUpDate: original.nextFollowUpDate,
  });
  expect(JSON.parse(await saved(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("a same-entry change in another window rejects a stale correction but an unrelated history edit safely composes", async ({
  page,
  context,
}) => {
  await seed(page, [withHistory()]);
  await openHistory(page);
  await startEdit(page, "older");
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("Korunacak yerel eski takip taslağı.");
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await openHistory(other);
  await startEdit(other, "older");
  await edit(other, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("Diğer pencerede kaydedilen eski takip.");
  await saveEdit(other, "older");
  const external = await saved(other);
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue("Korunacak yerel eski takip taslağı.");
  await entry(page, "older")
    .locator('[data-action="waiting-followup-edit-save"]')
    .click();
  await expect(
    entry(page, "older").locator("[data-followup-edit-error]"),
  ).toContainText("başka bir pencerede değişti");
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue("Korunacak yerel eski takip taslağı.");
  expect(await saved(page)).toBe(external);
  await entry(page, "older")
    .locator('[data-action="waiting-followup-edit-cancel"]')
    .click();
  await startEdit(page, "older");
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue("Diğer pencerede kaydedilen eski takip.");
  await edit(page, "older")
    .locator('[name="editFollowUpNote"]')
    .fill("Güncel veriye dayanan yerel düzeltme.");
  await startEdit(other, "latest");
  await edit(other, "latest")
    .locator('[name="editFollowUpNote"]')
    .fill("Diğer pencerede farklı takip düzeltildi.");
  await saveEdit(other, "latest");
  const beforeLocal = await saved(other);
  await expect(
    edit(page, "older").locator('[name="editFollowUpNote"]'),
  ).toHaveValue("Güncel veriye dayanan yerel düzeltme.");
  await saveEdit(page, "older");
  const current = await topic(page);
  expect(current.followUpLog).toHaveLength(2);
  expect(current.followUpLog.find((item) => item.id === "older").note).toBe(
    "Güncel veriye dayanan yerel düzeltme.",
  );
  expect(current.followUpLog.find((item) => item.id === "latest").note).toBe(
    "Diğer pencerede farklı takip düzeltildi.",
  );
  expect(current.latestUpdate).toBe("Diğer pencerede farklı takip düzeltildi.");
  await closeHistory(page);
  await other.close();
  await undo(page);
  expect(await saved(page)).toBe(beforeLocal);
});
