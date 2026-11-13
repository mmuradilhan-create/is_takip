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
  // Turning the reminder on keeps focus on the toggle.
  await expect(editor.locator('[name="remind"]')).toBeFocused();
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

test("Settings lists postponed and hidden suggestions by kind and brings one back", async ({
  context,
}) => {
  const OLD = "2026-10-20T09:00:00.000Z";
  const make = (input) =>
    createRecord({ createdAt: OLD, updatedAt: OLD, ...input });
  await seed(context, {
    records: [
      make({
        id: "goal",
        type: "weekly",
        title: "Ertelenen hedef",
        periodKey: "2026-W45",
        sourceFields: { __planningPrompts: { goals: "2026-11-10" } },
      }),
      make({
        id: "topic",
        type: "waiting",
        title: "Gizlenen konu",
        status: "waiting_response",
        sourceDate: "2026-10-01",
        sourceFields: { __planningPrompts: { waiting: "never" } },
      }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const section = page.locator("#settings-dialog .settings-hidden-prompts");
  await expect(section).not.toHaveAttribute("open");
  await expect(section.locator(".settings-hidden-count")).toHaveText("2");
  await section.locator("summary").click();
  await expect(section.locator(".settings-hidden-group h3")).toHaveText([
    "Hedeflere adım planla",
    "Beklemeyi netleştir",
  ]);
  await expect(section.locator('[data-hidden-record="goal"] small')).toHaveText(
    "10 Kas tarihinde yeniden önerilecek",
  );
  await expect(
    section.locator('[data-hidden-record="topic"] small'),
  ).toHaveText("Bir daha önerilmeyecek");
  await section
    .locator(
      '[data-hidden-record="topic"] [data-action="planning-prompt-restore"]',
    )
    .click();
  await expect(section).toHaveAttribute("open");
  await expect(section.locator(".settings-hidden-count")).toHaveText("1");
  await expect(
    section.locator('[data-hidden-record="goal"] button'),
  ).toBeFocused();
  const saved = await stored(page);
  expect(
    saved.records.find((item) => item.id === "topic").sourceFields,
  ).toEqual({});
  expect(saved.odak.history.map((item) => item.label)).toEqual([
    "Öneriyi geri getirme",
  ]);
  await page.locator("#settings-dialog .modal-footer .btn.primary").click();
  await expect(
    page.locator(
      '.planning-prompt[data-prompt="waiting"] .planning-prompt-count',
    ),
  ).toHaveText("1");
});

test("a note's reminder tag turns due as its minute passes and opens the editor on the reminder date", async ({
  context,
}) => {
  // 17:54:30 in Europe/Istanbul; the reminder is due at 17:55.
  await context.clock.install({ time: new Date("2026-11-11T14:54:30.000Z") });
  await context.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    {
      key: KEY,
      value: JSON.stringify({
        version: 1,
        records: [],
        odak: {
          version: 1,
          notes: [note("soon", { remindAt: "2026-11-11T17:55" })],
        },
      }),
    },
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const tag = page.locator(".workspace-note-reminder");
  const bell = page.locator("#reminder-button");
  await expect(tag).toHaveText("Bugün 17:55");
  await expect(tag).not.toHaveClass(/is-due/);
  await expect(bell).not.toHaveClass(/is-due/);
  await context.clock.runFor(60000);
  await expect(tag).toHaveClass(/is-due/);
  await expect(bell).toHaveClass(/is-due/);
  await expect(bell.locator(".reminder-count")).toHaveText("1");
  // The bell keeps the framed look of Undo and Settings when due.
  const frame = await bell.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopWidth, style.borderTopStyle, style.borderRadius];
  });
  expect(frame).toEqual(["1px", "solid", "11px"]);
  await tag.click();
  const editor = page.locator("#workspace-note-editor");
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="remindDate"]')).toBeFocused();
  await expect(editor.locator('[name="remind"]')).toBeChecked();
  // Focused, not highlighted: the caret waits at the end of the date.
  expect(
    await editor
      .locator('[name="remindDate"]')
      .evaluate((field) => [
        field.selectionStart === field.selectionEnd,
        field.selectionEnd === field.value.length,
      ]),
  ).toEqual([true, true]);
});

test("reminders set for later leave a numberless dot and name the next one in the tooltip", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("later", { text: "Raporu gönder", remindAt: "2026-11-09T10:00" }),
      note("next", { text: "Numuneyi sor", remindAt: "2026-11-08T17:30" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bell = page.locator("#reminder-button");
  const dot = () =>
    bell.evaluate((item) => getComputedStyle(item, "::after").content);
  await expect(bell).toHaveClass(/has-upcoming/);
  await expect(bell).not.toHaveClass(/is-due/);
  await expect(bell.locator(".reminder-count")).toBeHidden();
  expect(await dot()).toBe('""');
  await expect(bell).toHaveAttribute(
    "title",
    "2 yaklaşan hatırlatma · sıradaki: Bugün 17:30",
  );
  await expect(bell).toHaveAccessibleName(
    "Hatırlatmalar: 2 yaklaşan hatırlatma · sıradaki: Bugün 17:30",
  );

  // When one comes due the count takes over and the dot steps aside.
  await context.clock.setFixedTime(new Date("2026-11-08T14:31:00.000Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bell.locator(".reminder-count")).toHaveText("1");
  await expect(bell).toHaveClass(/is-due/);
  await expect(bell).not.toHaveClass(/has-upcoming/);
  expect(await dot()).toBe("none");
  await expect(bell).toHaveAttribute(
    "title",
    "1 hatırlatmanın zamanı geldi · 1 yaklaşan hatırlatma · sıradaki: Yarın 10:00",
  );

  // Finishing the last one clears the bell completely.
  await bell.click();
  await page.locator('#reminder-panel [data-reminder="done"]').click();
  await page.keyboard.press("Escape");
  await expect(bell).toHaveClass(/has-upcoming/);
  await page.evaluate(
    ({ key }) => {
      const data = JSON.parse(localStorage.getItem(key));
      data.odak.notes = data.odak.notes.map(({ remindAt, ...rest }) => rest);
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: KEY },
  );
  await page.reload();
  await expect(bell).not.toHaveClass(/has-upcoming/);
  await expect(bell).toHaveAttribute("title", "Hatırlatmalar");
});

test("a reminder at an odd minute can be moved to any other minute", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("odd", { text: "Teklifi kontrol et", remindAt: "2026-11-08T19:53" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator('[data-action="workspace-note-edit"]').click();
  const editor = page.locator("#workspace-note-editor");
  const time = editor.locator('[name="remindTime"]');
  await expect(time).toHaveValue("19:53");
  await time.fill("15:00");
  expect(await time.evaluate((input) => input.validity.valid)).toBe(true);
  await editor.locator('[type="submit"]').click();
  await expect(editor).toBeHidden();
  expect((await notesOf(page))[0].remindAt).toBe("2026-11-08T15:00");
});

test("reminder date and time move with arrow buttons and keys in 24-hour quarters", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("odd", { text: "Teklifi kontrol et", remindAt: "2026-11-12T09:07" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator('[data-action="workspace-note-edit"]').click();
  const editor = page.locator("#workspace-note-editor");
  const date = editor.locator('[name="remindDate"]');
  const time = editor.locator('[name="remindTime"]');
  await expect(date).toHaveValue("12.11.2026");
  await expect(time).toHaveValue("09:07");
  await expect(time).toHaveAttribute("type", "text");

  await editor.getByRole("button", { name: "Sonraki gün" }).click();
  await expect(date).toHaveValue("13.11.2026");
  await editor.getByRole("button", { name: "Önceki gün" }).click();
  await editor.getByRole("button", { name: "Önceki gün" }).click();
  await expect(date).toHaveValue("11.11.2026");
  await date.focus();
  await page.keyboard.press("ArrowUp");
  await expect(date).toHaveValue("12.11.2026");

  // Minutes snap to :00, :15, :30 and :45.
  await editor.getByRole("button", { name: "15 dakika sonra" }).click();
  await expect(time).toHaveValue("09:15");
  await editor.getByRole("button", { name: "15 dakika sonra" }).click();
  await expect(time).toHaveValue("09:30");
  await editor.getByRole("button", { name: "15 dakika önce" }).click();
  await expect(time).toHaveValue("09:15");
  // On the hour part the arrows move hours; on the minute part quarters.
  await time.focus();
  await time.evaluate((input) => input.setSelectionRange(0, 0));
  await page.keyboard.press("ArrowUp");
  await expect(time).toHaveValue("10:15");
  await time.evaluate((input) => input.setSelectionRange(4, 4));
  await page.keyboard.press("ArrowDown");
  await expect(time).toHaveValue("10:00");
  await page.keyboard.press("ArrowDown");
  await expect(time).toHaveValue("09:45");

  // Quarters roll the date over midnight; typed times are 24-hour.
  await time.fill("23:50");
  await editor.getByRole("button", { name: "15 dakika sonra" }).click();
  await expect(time).toHaveValue("00:00");
  await expect(date).toHaveValue("13.11.2026");
  await time.fill("1430");
  await time.blur();
  await expect(time).toHaveValue("14:30");
  await editor.locator('[type="submit"]').click();
  await expect(editor).toBeHidden();
  expect((await notesOf(page))[0].remindAt).toBe("2026-11-13T14:30");

  // A time that is not a 24-hour clock value is refused with a hint.
  await page.locator('[data-action="workspace-note-edit"]').click();
  await time.fill("25:00");
  await editor.locator('[type="submit"]').click();
  await expect(editor.locator("#workspace-note-error")).toContainText(
    "24 saat",
  );
  expect((await notesOf(page))[0].remindAt).toBe("2026-11-13T14:30");
});

test("pressing the reminder arrows quickly never highlights the Tarih or Saat labels", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("odd", { text: "Teklifi kontrol et", remindAt: "2026-11-12T09:00" }),
    ],
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator('[data-action="workspace-note-edit"]').click();
  const editor = page.locator("#workspace-note-editor");
  const selected = () =>
    page.evaluate(() => String(window.getSelection()).trim());
  await editor.getByRole("button", { name: "Sonraki gün" }).dblclick();
  expect(await selected()).toBe("");
  await editor.getByRole("button", { name: "15 dakika sonra" }).dblclick();
  expect(await selected()).toBe("");
  await expect(editor.locator('[name="remindDate"]')).toHaveValue("14.11.2026");
  await expect(editor.locator('[name="remindTime"]')).toHaveValue("09:30");
});

test("the widget bell opens every reminder note: due ones are answered there, later ones only shown", async ({
  context,
}) => {
  await seed(context, {
    notes: [
      note("due", { text: "Tedarikçiyi ara", remindAt: "2026-11-08T14:50" }),
      note("later", { text: "Raporu gönder", remindAt: "2026-11-09T10:00" }),
      note("plain", { text: "Hatırlatmasız not" }),
    ],
  });
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 520 });
  await widget.goto("/#widget");
  const bell = widget.locator("#widget-reminder-button");
  await expect(bell).toBeVisible();
  // It sits before the Çalışma label and the Ajanda button.
  const order = await widget.evaluate(() =>
    [...document.querySelector(".widget-header-tools").children].map(
      (item) => item.id || item.className,
    ),
  );
  expect(order.indexOf("widget-reminder-button")).toBeLessThan(
    order.indexOf("widget-live"),
  );
  await expect(bell).toHaveClass(/is-due/);
  await expect(bell.locator(".reminder-count")).toHaveText("1");
  await bell.click();
  const panel = widget.locator("#reminder-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".reminder-row")).toHaveCount(2);
  await expect(panel.locator(".reminder-row.is-due .reminder-text")).toHaveText(
    "Tedarikçiyi ara",
  );
  await expect(
    panel.locator('.reminder-row[data-note-id="later"] button'),
  ).toHaveCount(0);
  await expect(panel).not.toContainText("Hatırlatmasız not");
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(380);
  await panel.getByRole("button", { name: "Tamam" }).click();
  await expect
    .poll(async () =>
      Object.hasOwn(
        (await notesOf(widget)).find((item) => item.id === "due"),
        "remindAt",
      ),
    )
    .toBe(false);
  await expect(bell.locator(".reminder-count")).toBeHidden();
  await expect(bell).toHaveClass(/has-upcoming/);
  await expect(widget.locator("#widget-reminders")).toBeHidden();
  await expect(panel.locator(".reminder-row")).toHaveCount(1);
  await widget.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
