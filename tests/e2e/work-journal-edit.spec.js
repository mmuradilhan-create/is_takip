import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  readEffectiveWorkSession,
  readWorkspaceDomainRaw,
} from "./work-session-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const DAILY_ID = "journal-edit-daily";
const RESULT =
  '<img src=x onerror="window.journalEditInjected=1"> Düzeltilmiş sonuç';
const log = (id, date, durationMs) => ({
  id,
  date,
  durationMs,
  endedAt: `${date}T12:00:00.000Z`,
  note: "Kaydedilen sonuç",
  nextAction: "Oturumdaki sonraki adım",
});

function fixture() {
  return [
    createRecord({
      id: DAILY_ID,
      title: "İş günlüğü kayıtlarını düzenle",
      status: "in_progress",
      nextAction: "İşin güncel sonraki adımı",
      sourceFields: { "Özgün alan": "Korunacak veri" },
      createdAt: STAMP,
      updatedAt: STAMP,
      workLog: [
        log("journal-edit-one", "2026-11-07", 65_001),
        log("journal-edit-two", "2026-11-06", 30_000),
      ],
    }),
    createRecord({
      id: "journal-edit-other",
      title: "Başka günlük iş korunmalı",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
}

async function seed(page) {
  const records = fixture();
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("journal-edit-seeded")) return;
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
      sessionStorage.setItem("journal-edit-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = readWorkspaceDomainRaw;
const editDialog = (page) => page.locator("#work-log-edit-dialog");
const entry = (page, id = "journal-edit-one") =>
  page.locator(`dialog[open] .work-journal-entry[data-log-id="${id}"]`).first();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function openJournal(page) {
  await page.locator('#nav [data-view="daily"]').click();
  // The sidebar work card carries the same journal button for active work.
  await page
    .locator(`.full-table .work-journal-trigger[data-id="${DAILY_ID}"]`)
    .click();
  await expect(page.locator("#work-journal-dialog")).toBeVisible();
}

async function expectHistoryPanel(page, id, count) {
  const history = page.locator(`#${id}`);
  await expect(history).toBeVisible();
  await expect(history).toHaveClass(/work-history-panel/);
  expect(await history.evaluate((element) => element.matches(":modal"))).toBe(
    false,
  );
  await expect(history).not.toHaveAttribute("aria-modal", "true");
  await expect(history.locator(".work-journal-totals")).toHaveCount(0);
  const header = history.locator(".modal-header");
  const caption = header.locator(".work-history-count");
  await expect(caption).toHaveText(count);
  const geometry = await history.evaluate((element) => {
    const caption = element.querySelector(".work-history-count");
    const range = document.createRange();
    range.selectNodeContents(caption);
    const viewport = document.documentElement.getBoundingClientRect();
    return {
      panel: element.getBoundingClientRect().toJSON(),
      header: element
        .querySelector(".modal-header")
        .getBoundingClientRect()
        .toJSON(),
      count: range.getBoundingClientRect().toJSON(),
      lines: range.getClientRects().length,
      width: viewport.width,
      right: viewport.right,
      windowWidth: innerWidth,
      height: innerHeight,
    };
  });
  const narrow = geometry.windowWidth <= 760;
  const gap = narrow ? 12 : 16;
  expect(geometry.panel.x + geometry.panel.width).toBeCloseTo(
    geometry.right - gap,
    0,
  );
  expect(geometry.panel.y).toBeCloseTo(narrow ? 12 : 92, 0);
  expect(geometry.panel.y + geometry.panel.height).toBeCloseTo(
    geometry.height - gap,
    0,
  );
  expect(geometry.panel.width).toBeCloseTo(
    narrow ? geometry.width - 24 : 480,
    0,
  );
  expect(geometry.header.height).toBeLessThanOrEqual(92);
  expect(geometry.lines).toBe(1);
  expect(geometry.count.left).toBeGreaterThanOrEqual(geometry.header.left);
  expect(geometry.count.right).toBeLessThanOrEqual(geometry.header.right);
  expect(geometry.count.top).toBeGreaterThanOrEqual(geometry.header.top);
  expect(geometry.count.bottom).toBeLessThanOrEqual(geometry.header.bottom);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function useUnderlyingList(page, historyId, saved) {
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  await expect(page.locator(`#${historyId}`)).toBeVisible();
  await page
    .locator('[data-action="list-scope"][data-scope="completed"]')
    .click();
  await expect(page.locator(".full-table tr[data-record-row]")).toHaveCount(0);
  await expect(page.locator(`#${historyId}`)).toBeVisible();
  await page.locator('[data-action="list-scope"][data-scope="open"]').click();
  await expect(page.locator(".full-table tr[data-record-row]")).toHaveCount(2);
  expect(await readSaved(page)).toBe(saved);
}

test("weekly saved records can be edited across weeks while exact legacy duration and the task's current next step survive one Undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const original = await seed(page);
  const saved = await readSaved(page);
  await page.locator('#nav [data-view="daily"]').click();
  await page.locator('[data-action="work-session-history"]').click();
  await expectHistoryPanel(page, "work-week-dialog", "1 iş · 2 kayıt");
  await useUnderlyingList(page, "work-week-dialog", saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectHistoryPanel(page, "work-week-dialog", "1 iş · 2 kayıt");
  expect(await readSaved(page)).toBe(saved);
  await page.setViewportSize({ width: 1440, height: 900 });
  await entry(page).locator('[data-action="work-log-edit"]').click();
  const dialog = editDialog(page);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
    true,
  );
  await expect(page.locator("#work-week-dialog")).toBeVisible();
  await expect(dialog.locator('[name="workLogNextAction"]')).toHaveCount(0);
  const note = dialog.getByRole("textbox", { name: "Sonuç", exact: true });
  await expect(note).toHaveAccessibleDescription(
    "Enter ile kaydet, Shift+Enter ile alt satıra geç.",
  );
  await expect(dialog.locator("#work-log-edit-error")).toBeHidden();
  expect(
    await dialog
      .locator("#work-log-edit-error")
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(0);
  await dialog.locator('[name="workLogDate"]').fill("31.10.2026");
  await expect(
    dialog.locator(
      '[name="workLogHours"], [name="workLogMinutes"], [name="workLogSeconds"]',
    ),
  ).toHaveCount(0);
  await note.fill(RESULT);
  await note.press("Shift+Enter");
  await note.pressSequentially("İkinci sonuç satırı.");
  const result = `${RESULT}\nİkinci sonuç satırı.`;
  await expect(note).toHaveValue(result);
  expect(await readSaved(page)).toBe(saved);
  await note.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expectHistoryPanel(page, "work-week-dialog", "1 iş · 1 kayıt");
  await expect(
    page.locator('#work-week-dialog [data-log-id="journal-edit-one"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#work-week-dialog [data-log-id="journal-edit-two"]'),
  ).toBeVisible();
  const updated = await readRecords(page);
  expect(updated[0].workLog[0]).toEqual({
    ...original[0].workLog[0],
    date: "2026-10-31",
    note: result,
  });
  expect(updated[0].nextAction).toBe(original[0].nextAction);
  expect(updated[0].status).toBe(original[0].status);
  expect(updated[0].sourceFields).toEqual(original[0].sourceFields);
  expect(updated[1]).toEqual(original[1]);
  await page
    .locator('#work-week-dialog [data-action="work-week-prev"]')
    .click();
  await expect(
    page.locator('#work-week-dialog [data-log-id="journal-edit-one"]'),
  ).toContainText(result);
  await expect(page.locator("#work-week-dialog img")).toHaveCount(0);
  expect(await page.evaluate(() => window.journalEditInjected)).toBeUndefined();
  await page
    .locator('#work-week-dialog [data-action="work-week-close"]')
    .last()
    .click();
  await expect(
    page.locator('[data-action="work-session-history"]'),
  ).toBeFocused();
  await undo(page);
  expect(await readSaved(page)).toBe(saved);
  expect(await readRecords(page)).toEqual(original);
});

test("per-task history preserves millisecond duration during text edits and can cancel or delete one record without touching an active working note", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const original = await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator(`.full-table [data-record-row][data-id="${DAILY_ID}"] .work-start`)
    .click();
  const timer = await readEffectiveWorkSession(page);
  const saved = await readSaved(page);
  await openJournal(page);
  await expectHistoryPanel(page, "work-journal-dialog", "2 kayıt");
  await expect(
    page.locator("#work-journal-dialog .modal-header .work-journal-subtitle"),
  ).toHaveText(original[0].title);
  await useUnderlyingList(page, "work-journal-dialog", saved);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectHistoryPanel(page, "work-journal-dialog", "2 kayıt");
  expect(await readSaved(page)).toBe(saved);
  await page.setViewportSize({ width: 1280, height: 800 });
  await entry(page).locator('[data-action="work-log-edit"]').click();
  await expect(editDialog(page)).toBeVisible();
  expect(
    await editDialog(page).evaluate((element) => element.matches(":modal")),
  ).toBe(true);
  await editDialog(page).locator('[name="workLogNote"]').press("Enter");
  await expect(editDialog(page)).not.toBeVisible();
  expect(await readSaved(page)).toBe(saved);
  await entry(page).locator('[data-action="work-log-edit"]').click();
  await expect(
    editDialog(page).locator(
      '[name="workLogHours"], [name="workLogMinutes"], [name="workLogSeconds"]',
    ),
  ).toHaveCount(0);
  await editDialog(page).locator('[name="workLogNote"]').fill(RESULT);
  await editDialog(page).locator('[name="workLogDate"]').fill("06.11.2026");
  await editDialog(page).locator('[name="workLogNote"]').press("Enter");
  await expect(editDialog(page)).not.toBeVisible();
  const edited = await readSaved(page);
  expect((await readRecords(page))[0].workLog[0]).toEqual({
    ...original[0].workLog[0],
    date: "2026-11-06",
    note: RESULT,
  });
  expect(JSON.parse(edited).odak.history).toHaveLength(1);
  await entry(page).locator('[data-action="work-log-delete"]').click();
  await entry(page).locator('[data-action="work-log-delete-cancel"]').click();
  expect(await readSaved(page)).toBe(edited);
  await entry(page).locator('[data-action="work-log-delete"]').click();
  await entry(page).locator('[data-action="work-log-delete-confirm"]').click();
  await expect(
    page.locator('#work-journal-dialog [data-log-id="journal-edit-one"]'),
  ).toHaveCount(0);
  expect((await readRecords(page))[0].workLog).toEqual([
    original[0].workLog[1],
  ]);
  await expectHistoryPanel(page, "work-journal-dialog", "1 kayıt");
  const afterTimer = await readEffectiveWorkSession(page);
  expect(afterTimer).toEqual(timer);
  await page
    .locator('#work-journal-dialog [data-action="work-journal-close"]')
    .last()
    .click();
  await undo(page);
  expect(await readSaved(page)).toBe(edited);
  await undo(page);
  expect(await readSaved(page)).toBe(saved);
  await openJournal(page);
  await entry(page, "journal-edit-two")
    .locator('[data-action="work-log-edit"]')
    .click();
  await expect(
    editDialog(page).locator('[name="workLogHours"], [name="workLogMinutes"]'),
  ).toHaveCount(0);
  await editDialog(page)
    .locator('[name="workLogNote"]')
    .fill("Bir dakikadan kısa oturumun notu");
  await editDialog(page).locator('[name="workLogNote"]').press("Enter");
  await expect(editDialog(page)).not.toBeVisible();
  expect((await readRecords(page))[0].workLog[1].durationMs).toBe(30_000);
  await page
    .locator('#work-journal-dialog [data-action="work-journal-close"]')
    .last()
    .click();
  await undo(page);
  expect(await readSaved(page)).toBe(saved);
});

test("missing dates, cancelled drafts and failed storage writes preserve the original history and allow one safe retry", async ({
  page,
}) => {
  await seed(page);
  const saved = await readSaved(page);
  await openJournal(page);
  await entry(page).locator('[data-action="work-log-edit"]').click();
  await editDialog(page)
    .locator('[name="workLogNote"]')
    .fill("Vazgeçilen taslak");
  await page.keyboard.press("Escape");
  expect(await readSaved(page)).toBe(saved);
  await entry(page).locator('[data-action="work-log-edit"]').click();
  const dialog = editDialog(page);
  await dialog.locator('[name="workLogDate"]').fill("");
  await dialog.locator('[name="workLogNote"]').press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#work-log-edit-error")).toContainText(
    "tarihini seç",
  );
  expect(await readSaved(page)).toBe(saved);
  await dialog.locator('[name="workLogDate"]').fill("07.11.2026");
  await dialog
    .locator('[name="workLogNote"]')
    .fill("Yazma hatasından korunan taslak");
  await dialog.locator('[name="workLogNote"]').evaluate((field) => {
    for (const options of [
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { prevented: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      if (options.keyCode)
        Object.defineProperty(event, "keyCode", { value: options.keyCode });
      if (options.prevented) event.preventDefault();
      field.dispatchEvent(event);
    }
  });
  await expect(dialog).toBeVisible();
  expect(await readSaved(page)).toBe(saved);
  await page.evaluate((key) => {
    window.journalEditOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key)
        throw new Error("Simulated quota failure");
      return window.journalEditOriginalSetItem.call(this, name, value);
    };
  }, KEY);
  await dialog.locator('[name="workLogNote"]').press("Enter");
  await expect(dialog.locator('[role="alert"]')).toContainText("kaydedilemedi");
  await expect(dialog.locator("#work-log-edit-error")).toBeVisible();
  await expect(dialog.locator('[name="workLogNote"]')).toHaveValue(
    "Yazma hatasından korunan taslak",
  );
  expect(await readSaved(page)).toBe(saved);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.journalEditOriginalSetItem;
  });
  await dialog.locator('[name="workLogNote"]').press("Enter");
  await expect(dialog).not.toBeVisible();
  const records = await readRecords(page);
  expect(records[0].workLog).toHaveLength(2);
  expect(records[0].workLog[0].note).toBe("Yazma hatasından korunan taslak");
  expect(records[0].workLog[0].durationMs).toBe(65_001);
  expect(records[0].nextAction).toBe("İşin güncel sonraki adımı");
  expect(records[0].workLog[0].nextAction).toBe("Oturumdaki sonraki adım");
  expect(JSON.parse(await readSaved(page)).odak.history).toHaveLength(1);
  await entry(page).locator('[data-action="work-log-edit"]').click();
  await expect(editDialog(page).locator("#work-log-edit-error")).toBeHidden();
  await page.keyboard.press("Escape");
  await page
    .locator('#work-journal-dialog [data-action="work-journal-close"]')
    .last()
    .click();
  await undo(page);
  expect(await readSaved(page)).toBe(saved);
});

test("a concurrent session correction disables stale Enter saves without losing the local result or adding another Undo", async ({
  page,
  context,
}) => {
  const original = await seed(page);
  const before = await readSaved(page);
  await openJournal(page);
  await entry(page).locator('[data-action="work-log-edit"]').click();
  const field = editDialog(page).locator('[name="workLogNote"]');
  await field.fill("Korunacak yerel sonuç taslağı");

  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await openJournal(other);
  await entry(other).locator('[data-action="work-log-edit"]').click();
  await editDialog(other)
    .locator('[name="workLogNote"]')
    .fill("Diğer pencereden düzeltilen sonuç");
  await editDialog(other).locator('[name="workLogNote"]').press("Enter");
  await expect(editDialog(other)).not.toBeVisible();
  const external = await readSaved(other);
  await expect.poll(() => readSaved(page)).toBe(external);
  await expect(field).toBeDisabled();
  await expect(field).toHaveValue("Korunacak yerel sonuç taslağı");
  await expect(editDialog(page).locator("#work-log-edit-error")).toContainText(
    "başka bir pencerede değişti",
  );
  await field.evaluate((textarea) => {
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(await readSaved(page)).toBe(external);
  const current = await readRecords(page);
  expect(current[0].workLog[0]).toEqual({
    ...original[0].workLog[0],
    note: "Diğer pencereden düzeltilen sonuç",
  });
  expect(current[0].nextAction).toBe(original[0].nextAction);
  expect(JSON.parse(external).odak.history).toHaveLength(1);
  await editDialog(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await other
    .locator('#work-journal-dialog [data-action="work-journal-close"]')
    .last()
    .click();
  await undo(other);
  await expect.poll(() => readSaved(page)).toBe(before);
  await other.close();
});
