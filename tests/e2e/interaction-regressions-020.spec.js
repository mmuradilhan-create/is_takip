import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const waitingRow = (page) =>
  page.locator('.waiting-table tbody > tr[data-id="regression-waiting"]');
const followUpDialog = (page) => page.locator("#waiting-followup-dialog");

async function seed(page, additional = []) {
  const initial = [
    make({
      id: "regression-daily",
      title: "Takvim konumunu doğrula",
      dueDate: "2026-11-10",
      description: "Kullanıcının gerçek çalışma notu.",
      nextAction: "Tasarım dosyasını incele.",
    }),
    make({
      id: "regression-waiting",
      type: "waiting",
      title: "Tedarik yanıtını bekle",
      status: "waiting_response",
      sourceDate: "2026-10-28",
      lastFollowUpDate: "2026-11-02",
      nextFollowUpDate: "2026-11-08",
      expectedFrom: "Tedarik birimi",
      latestUpdate: "Özgün gelişme korunmalı.",
      description: "Özgün bekleme notu korunmalı.",
      sourceFields: { original: "Kaynak alanı korunmalı." },
    }),
    ...additional,
  ];
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, initial }) => {
      if (sessionStorage.getItem("interaction-regressions-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: initial,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("interaction-regressions-seeded", "1");
    },
    { key: KEY, initial },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  return initial;
}

async function goToWaiting(page) {
  await page.locator('#nav [data-view="waiting"]').click();
  await expect(waitingRow(page)).toBeVisible();
}

async function openFollowUp(page) {
  await goToWaiting(page);
  await waitingRow(page).locator('[data-action="waiting-followup"]').click();
  await expect(followUpDialog(page)).toBeVisible();
}

async function expectCalendarInBody(page) {
  const bounds = await page.evaluate(() => {
    const popup = document
      .querySelector("#odak-date-picker")
      .getBoundingClientRect();
    const body = document
      .querySelector("#editor .modal-body")
      .getBoundingClientRect();
    return {
      popup: popup.toJSON(),
      body: body.toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  expect(bounds.popup.x).toBeGreaterThanOrEqual(bounds.body.x);
  expect(bounds.popup.y).toBeGreaterThanOrEqual(bounds.body.y);
  expect(bounds.popup.x + bounds.popup.width).toBeLessThanOrEqual(
    Math.min(bounds.body.x + bounds.body.width, bounds.viewport.width),
  );
  expect(bounds.popup.y + bounds.popup.height).toBeLessThanOrEqual(
    Math.min(bounds.body.y + bounds.body.height, bounds.viewport.height),
  );
}

test("a date popover follows a scrolling editor field, stays inside the dialog, and closes when that field scrolls away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seed(page);
  const before = await saved(page);
  await page
    .locator('.focus-row[data-id="regression-daily"] .focus-title')
    .click();
  const editor = page.locator("#editor");
  await expect(editor).toBeVisible();
  await openCreationExtras(page);
  await editor.locator('[name="description"]').evaluate((input) => {
    input.style.height = "1600px";
  });
  const input = editor.locator('[name="dueDate"]');
  await input.scrollIntoViewIfNeeded();
  await input.evaluate((field) => {
    const body = field.closest(".modal-body");
    body.scrollTop +=
      field.getBoundingClientRect().top - body.getBoundingClientRect().top - 50;
  });
  const toggle = input.locator("..").locator(".date-picker-toggle");
  await toggle.click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await expectCalendarInBody(page);
  const beforeScroll = await picker.boundingBox();
  await editor.locator(".modal-body").evaluate((body) => {
    body.scrollTop += 12;
  });
  await expect
    .poll(async () => Math.round((await picker.boundingBox()).y))
    .toBe(Math.round(beforeScroll.y - 12));
  await expectCalendarInBody(page);

  await page.setViewportSize({ width: 1280, height: 480 });
  await expect(picker).toBeVisible();
  await expectCalendarInBody(page);
  expect(
    await picker.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await picker.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(picker).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await editor.locator(".modal-body").evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  await expect(picker).not.toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(editor).toBeVisible();
  await editor.locator('.modal-footer [data-action="close"]').click();
  expect(await saved(page)).toBe(before);
});

test("a changed reminder in another tab preserves the follow-up draft and blocks stale saves while unrelated title edits remain saveable", async ({
  page,
  context,
}) => {
  const initial = await seed(page);
  await openFollowUp(page);
  const dialog = followUpDialog(page);
  await dialog.locator('[name="followUpDate"]').fill("06.11.2026");
  await dialog.locator('[name="nextFollowUpDate"]').fill("13.11.2026");
  await dialog
    .locator('[name="followUpNote"]')
    .fill("Korunacak yerel sonuç taslağı.");

  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await goToWaiting(other);
  await waitingRow(other).locator('[data-action="edit-next-followup"]').click();
  const menu = other.locator("#due-date-menu");
  await menu.locator('[name="nextFollowUpDate"]').fill("14.11.2026");
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(dialog.locator(".waiting-followup-availability")).toContainText(
    "Sonraki takip tarihi başka bir pencerede değişti",
  );
  await expect(dialog.locator('[type="submit"]')).toBeDisabled();
  await expect(dialog.locator('[name="followUpDate"]')).toHaveValue(
    "06.11.2026",
  );
  await expect(dialog.locator('[name="nextFollowUpDate"]')).toHaveValue(
    "13.11.2026",
  );
  await expect(dialog.locator('[name="followUpNote"]')).toHaveValue(
    "Korunacak yerel sonuç taslağı.",
  );
  const external = await saved(page);
  await dialog.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect(dialog.locator("#waiting-followup-error")).toContainText(
    "Sonraki takip tarihi başka bir pencerede değişti",
  );
  expect(await saved(page)).toBe(external);
  await dialog.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await waitingRow(page).locator('[data-action="waiting-followup"]').click();
  await expect(dialog.locator('[name="nextFollowUpDate"]')).toHaveValue(
    "14.11.2026",
  );
  await expect(dialog.locator('[name="followUpNote"]')).toHaveValue("");
  await dialog.locator('[name="nextFollowUpDate"]').fill("15.11.2026");
  await dialog
    .locator('[name="followUpNote"]')
    .fill("Güncel plana göre yanıt tekrar istendi.");

  await waitingRow(other).locator(".task-name").click();
  await expect(other.locator("#editor")).toBeVisible();
  await other
    .locator('#record-form [name="title"]')
    .fill("Diğer sekmede güncellenen konu");
  await other
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(other.locator("#editor")).not.toBeVisible();
  await expect(dialog.locator(".waiting-followup-topic")).toHaveText(
    "Diğer sekmede güncellenen konu",
  );
  await expect(dialog.locator(".waiting-followup-availability")).toBeHidden();
  await expect(dialog.locator('[type="submit"]')).toBeEnabled();
  await expect(dialog.locator('[name="nextFollowUpDate"]')).toHaveValue(
    "15.11.2026",
  );
  await dialog
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const after = await records(page);
  const waiting = after.find((record) => record.id === "regression-waiting");
  expect(waiting).toMatchObject({
    ...initial[1],
    title: "Diğer sekmede güncellenen konu",
    updatedAt: NOW.toISOString(),
    lastFollowUpDate: "2026-11-07",
    nextFollowUpDate: "2026-11-15",
    latestUpdate: "Güncel plana göre yanıt tekrar istendi.",
  });
  expect(waiting.followUpLog).toEqual([
    {
      id: expect.any(String),
      date: "2026-11-07",
      note: "Güncel plana göre yanıt tekrar istendi.",
      nextFollowUpDate: "2026-11-15",
      previousUpdate: initial[1].latestUpdate,
    },
  ]);
  expect(after.find((record) => record.id === "regression-daily")).toEqual(
    initial[0],
  );
  await other.close();
});

test("journal icons fill lilac only for saved entries and follow session save, deletion and Undo without writes when viewed", async ({
  page,
}) => {
  const initial = await seed(page, [
    make({
      id: "regression-journal-saved",
      title: "Önceden kaydedilmiş çalışma",
      workLog: [
        {
          id: "regression-saved-log",
          date: "2026-11-07",
          endedAt: NOW.toISOString(),
          durationMs: 65_000,
          note: "Kaydedilmiş gerçek sonuç.",
          nextAction: "Özgün sonraki adım.",
        },
      ],
    }),
  ]);
  await page.locator('#nav [data-view="daily"]').click();
  const row = page.locator(
    '.full-table tbody > tr[data-id="regression-daily"]',
  );
  const empty = row.locator(".work-journal-trigger");
  const populated = page.locator(
    '.work-journal-trigger[data-id="regression-journal-saved"]',
  );
  await expect(empty).not.toHaveClass(/has-entries/);
  await expect(empty).toHaveAttribute("data-session-count", "0");
  await expect(populated).toHaveClass(/has-entries/);
  await expect(populated).toHaveAttribute("data-session-count", "1");
  await expect(populated).toHaveAttribute(
    "aria-label",
    /iş günlüğünü gör.*1 kayıtlı oturum/,
  );
  await expect(populated).toHaveAttribute("title", /1 oturum.*1 dk 5 sn/);
  expect(
    await empty.evaluate((button) => button.getBoundingClientRect().width),
  ).toBe(30);
  expect(
    await populated.evaluate((button) => button.getBoundingClientRect().width),
  ).toBe(30);
  expect(
    await populated.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    ),
  ).toBe("rgb(241, 234, 250)");
  const beforeView = await saved(page);
  await populated.click();
  const journal = page.locator("#work-journal-dialog");
  await expect(journal.locator(".work-journal-entry")).toHaveCount(1);
  await journal.getByRole("button", { name: "Tamam", exact: true }).click();
  expect(await saved(page)).toBe(beforeView);

  await row.locator(".work-start").click();
  await page.clock.runFor(1_000);
  await expect(empty).not.toHaveClass(/has-entries/);
  await expect(empty).toHaveAttribute("data-session-count", "0");
  await page.locator('[data-action="work-pause"]').click();
  await expect(empty).not.toHaveClass(/has-entries/);
  await page.locator('[data-action="work-finish"]').click();
  const finish = page.locator("#work-finish-dialog");
  await finish.locator('[name="resultNote"]').fill("Yeni kaydedilen sonuç.");
  await finish
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(finish).not.toBeVisible();
  await expect(empty).toHaveClass(/has-entries/);
  await expect(empty).toHaveAttribute("data-session-count", "1");
  const afterFinish = await records(page);
  expect(
    afterFinish.find((record) => record.id === "regression-daily").workLog,
  ).toHaveLength(1);
  await empty.click();
  const entry = journal.locator(".work-journal-entry");
  await expect(entry).toHaveCount(1);
  await entry.locator('[data-action="work-log-delete"]').click();
  await entry.locator('[data-action="work-log-delete-confirm"]').click();
  await expect(journal.locator(".work-journal-entry")).toHaveCount(0);
  await expect(empty).not.toHaveClass(/has-entries/);
  await expect(empty).toHaveAttribute("data-session-count", "0");
  await journal.getByRole("button", { name: "Tamam", exact: true }).click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(empty).toHaveClass(/has-entries/);
  await expect(empty).toHaveAttribute("data-session-count", "1");
  expect(await records(page)).toEqual(afterFinish);
  expect(
    (await records(page)).find(
      (record) => record.id === "regression-journal-saved",
    ),
  ).toEqual(initial[2]);
});
