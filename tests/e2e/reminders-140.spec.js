import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
// 15:00 in Europe/Istanbul, the suite's time zone.
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-08T08:00:00.000Z";
const note = (id, input = {}) => ({
  id,
  text: `Not ${id}`,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...input,
});
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const notesOf = async (page) => (await stored(page)).odak.notes;

async function seed(context, { notes = [], records = [] } = {}) {
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    {
      key: KEY,
      value: JSON.stringify({
        version: 1,
        records,
        odak: { version: 1, notes },
      }),
    },
  );
}

test("the bell counts due reminders, alerts once and finishes or snoozes them as one undo step", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("due", { text: "Tedarikçiyi ara", remindAt: "2026-11-08T14:50" }),
      note("later", { text: "Raporu gönder", remindAt: "2026-11-09T10:00" }),
      note("plain", { text: "Hatırlatmasız not" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bell = page.locator("#reminder-button");
  await expect(bell.locator(".reminder-count")).toHaveText("1");
  await expect(bell).toHaveClass(/is-due/);
  await expect(page.locator("#toast")).toHaveText(
    "Hatırlatma: Tedarikçiyi ara",
  );
  const tags = page.locator(".workspace-note-reminder");
  await expect(tags).toHaveText(["Bugün 14:50", "Yarın 10:00"]);
  await expect(tags.first()).toHaveClass(/is-due/);

  await bell.click();
  const panel = page.locator("#reminder-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".reminder-row.is-due .reminder-text")).toHaveText(
    "Tedarikçiyi ara",
  );
  await expect(
    panel.locator(".reminder-row:not(.is-due) .reminder-text"),
  ).toHaveText("Raporu gönder");
  await expect(panel.locator('[data-reminder="done"]')).toBeFocused();
  await panel.locator('[data-reminder="hour"]').click();
  await expect(bell.locator(".reminder-count")).toBeHidden();
  expect((await notesOf(page)).find((item) => item.id === "due").remindAt).toBe(
    "2026-11-08T16:00",
  );
  await expect(panel.locator(".reminder-row.is-due")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(bell.locator(".reminder-count")).toHaveText("1");
  // Undo restores the reminder without a second alert in this window.
  await bell.click();
  await panel.locator('[data-reminder="done"]').click();
  const done = (await notesOf(page)).find((item) => item.id === "due");
  expect(Object.hasOwn(done, "remindAt")).toBe(false);
  expect(done.text).toBe("Tedarikçiyi ara");
  expect((await stored(page)).odak.history.map((item) => item.label)).toEqual([
    "Hatırlatmayı kapatma",
  ]);
});

test("a note gets, shows and drops a dated reminder in its editor", async ({
  context,
}) => {
  await seed(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".workspace-note-add").click();
  const editor = page.locator("#workspace-note-editor");
  await editor.locator('[name="text"]').fill("Toplantı notlarını paylaş");
  await expect(editor.locator(".workspace-note-remind-when")).toBeHidden();
  await editor.locator('[name="remind"]').check();
  await expect(editor.locator('[name="remindTime"]')).toBeFocused();
  // The default is the next full hour today.
  await expect(editor.locator('[name="remindDate"]')).toHaveValue("08.11.2026");
  await expect(editor.locator('[name="remindTime"]')).toHaveValue("16:00");
  await editor.locator('[name="remindDate"]').fill("09.11.2026");
  await editor.locator('[name="remindTime"]').fill("10:30");
  await editor.locator('[type="submit"]').click();
  await expect(editor).toBeHidden();
  let notes = await notesOf(page);
  expect(notes[0]).toMatchObject({
    text: "Toplantı notlarını paylaş",
    remindAt: "2026-11-09T10:30",
  });
  await expect(page.locator(".workspace-note-reminder")).toHaveText(
    "Yarın 10:30",
  );
  await expect(page.locator("#reminder-button .reminder-count")).toBeHidden();

  await page.locator('[data-action="workspace-note-edit"]').click();
  await expect(editor.locator('[name="remind"]')).toBeChecked();
  await editor.locator('[name="remind"]').uncheck();
  await editor.locator('[type="submit"]').click();
  await expect(editor).toBeHidden();
  notes = await notesOf(page);
  expect(Object.hasOwn(notes[0], "remindAt")).toBe(false);
  await expect(page.locator(".workspace-note-reminder")).toHaveCount(0);
});

test("the widget shows due reminders above both views and answers them", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("due", {
        text: "Numuneyi kontrol et",
        remindAt: "2026-11-08T14:00",
      }),
      note("later", { remindAt: "2026-11-08T18:00" }),
    ],
  });
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 420 });
  await widget.goto("/#widget");
  const strip = widget.locator("#widget-reminders");
  await expect(strip).toBeVisible();
  await expect(strip.locator(".widget-reminder")).toHaveCount(1);
  await expect(strip.locator(".widget-reminder-text")).toHaveText(
    "Numuneyi kontrol et",
  );
  await expect(strip.locator(".widget-reminder-when")).toHaveText(
    "Bugün 14:00",
  );
  await widget.locator("#widget-view-toggle").click();
  await expect(strip).toBeVisible();
  await strip.locator('[data-wb="reminder-hour"]').click();
  await expect(strip).toBeHidden();
  expect(
    (await notesOf(widget)).find((item) => item.id === "due").remindAt,
  ).toBe("2026-11-08T16:00");
});

test("planning suggestions can be postponed, hidden and brought back as undo steps", async ({
  context,
}) => {
  const OLD = "2026-10-20T09:00:00.000Z";
  const topic = (id, input = {}) =>
    createRecord({
      id,
      title: id,
      type: "waiting",
      status: "waiting_response",
      createdAt: OLD,
      updatedAt: OLD,
      sourceDate: "2026-11-01",
      ...input,
    });
  await seed(context, {
    records: [
      topic("postpone", { nextFollowUpDate: "2026-11-12" }),
      topic("hide", { expectedFrom: "Lab" }),
      topic("keep", { expectedFrom: "Satın alma" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const prompt = page.locator('.planning-prompt[data-prompt="waiting"]');
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("3");
  await prompt.click();
  const dialog = page.locator("#planning-prompts-dialog");
  const menuFor = (id) =>
    dialog.locator(
      `[data-prompt-record="${id}"] [data-action="planning-prompt-menu"]`,
    );
  const menu = dialog.locator("#planning-prompt-menu");
  await menuFor("postpone").click();
  await expect(menu).toBeVisible();
  await expect(menu.locator("button")).toHaveText([
    "Yarın hatırlat",
    "1 hafta sonra hatırlat",
    "Bir daha önerme",
  ]);
  await expect(menu.locator("button").first()).toBeFocused();
  await menu.locator('[data-until="week"]').click();
  await menuFor("hide").click();
  await menu.locator('[data-until="never"]').click();
  await expect(dialog.locator("[data-prompt-record]")).toHaveCount(1);
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("1");
  let saved = await stored(page);
  const field = (id) =>
    saved.records.find((item) => item.id === id).sourceFields
      ?.__planningPrompts;
  expect(field("postpone")).toEqual({ waiting: "2026-11-15" });
  expect(field("hide")).toEqual({ waiting: "never" });
  expect(saved.records.find((item) => item.id === "hide").updatedAt).toBe(OLD);

  await dialog.locator(".planning-hidden-toggle").click();
  await expect(dialog.locator("[data-hidden-record]")).toHaveCount(2);
  await expect(
    dialog.locator('[data-hidden-record="hide"] .planning-prompt-period'),
  ).toHaveText("Bir daha önerilmeyecek");
  await dialog
    .locator(
      '[data-hidden-record="hide"] [data-action="planning-prompt-restore"]',
    )
    .click();
  await expect(dialog.locator("[data-prompt-record]")).toHaveCount(2);
  saved = await stored(page);
  expect(field("hide")).toBeUndefined();
  expect(saved.odak.history.map((item) => item.label)).toEqual([
    "Öneriyi erteleme",
    "Öneriyi gizleme",
    "Öneriyi geri getirme",
  ]);
  await dialog.locator(".modal-footer .btn.primary").click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("2");
});
