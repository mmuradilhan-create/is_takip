import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord, validateStore } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const SESSION_KEY = `${KEY}-work-session`;
const START = new Date("2026-11-07T12:00:00Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const NOTE =
  '<img src=x onerror="window.journalInjected=1"> Üç madde incelendi.';
const NEXT =
  "<script>window.journalInjected=1</script> Tasarım yanıtını değerlendir.";

function recordsFixture() {
  return [
    createRecord({
      id: "journal-weekly",
      type: "weekly",
      title: "Haftalık inceleme hedefi",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Madde",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "journal-daily",
      title: "Dokümanları incele",
      status: "in_progress",
      parentId: "journal-weekly",
      priority: "high",
      dueDate: "2026-11-07",
      nextAction: "İlk üç maddeyi kontrol et",
      description: "Kaynak notu korunmalı.",
      sourceFields: { "Özgün alan": { value: "Korunacak veri" } },
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
}

function log(id, date, durationMs, note = "", nextAction = "") {
  return {
    id,
    date,
    endedAt: `${date}T12:00:00.000Z`,
    durationMs,
    note,
    nextAction,
  };
}

async function seed(page, records = recordsFixture()) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START);
  await page.addInitScript(
    ({ key, sessionKey, records }) => {
      if (sessionStorage.getItem("work-journal-test-seeded")) return;
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
      localStorage.setItem(
        `${key}-preferences`,
        JSON.stringify({ density: "comfortable" }),
      );
      localStorage.removeItem(sessionKey);
      sessionStorage.setItem("work-journal-test-seeded", "true");
    },
    { key: KEY, sessionKey: SESSION_KEY, records },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const panel = (page) => page.locator("#work-session-panel");
const finishDialog = (page) => page.locator("#work-finish-dialog");

async function beginFinish(page, durationMs = 65_000) {
  await row(page, "journal-daily").locator(".work-start").click();
  await page.clock.fastForward(durationMs);
  await panel(page)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  await expect(finishDialog(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
}

async function finish(page, { note = "" } = {}) {
  await finishDialog(page).locator('[name="resultNote"]').fill(note);
  await finishDialog(page).locator('[name="resultNote"]').press("Enter");
  await expect(finishDialog(page)).not.toBeVisible();
  await expect(panel(page)).not.toBeVisible();
}

async function openBackup(page) {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backup = page.locator("#settings-dialog .settings-backup");
  if (!(await backup.evaluate((element) => element.open)))
    await backup.locator(":scope > summary").click();
}

test("finishing with Enter freezes the session and saves only its result while preserving the task's next step and exact reload Undo", async ({
  page,
}) => {
  const originals = await seed(page);
  await beginFinish(page);
  await expect(finishDialog(page).locator('[name="nextAction"]')).toHaveCount(
    0,
  );
  await expect(
    finishDialog(page).locator('[name="resultNote"]'),
  ).toHaveAccessibleDescription(
    "Enter ile kaydet, Shift+Enter ile alt satıra geç.",
  );
  await page.clock.fastForward(120_000);
  await expect(page.locator("#work-session-time")).toHaveText("00:01:05");
  expect(await readRecords(page)).toEqual(originals);
  await finish(page, { note: NOTE });
  const saved = await readRecords(page);
  expect(saved[0]).toEqual(originals[0]);
  const daily = saved.find((record) => record.id === "journal-daily");
  expect(daily.workLog).toHaveLength(1);
  expect(daily.workLog[0]).toEqual({
    id: expect.any(String),
    date: "2026-11-07",
    endedAt: "2026-11-07T12:01:05.000Z",
    durationMs: 65_000,
    note: NOTE,
    nextAction: "",
  });
  expect(daily.nextAction).toBe(originals[1].nextAction);
  expect(JSON.parse(await readSaved(page)).odak.history).toHaveLength(1);
  expect({
    ...daily,
    nextAction: originals[1].nextAction,
    updatedAt: originals[1].updatedAt,
    workLog: undefined,
  }).toEqual({ ...originals[1], workLog: undefined });
  const state = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SESSION_KEY,
  );
  expect(state.currentId).toBeNull();
  expect(
    state.entries.find((entry) => entry.recordId === daily.id).status,
  ).toBe("finished");
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator('[data-action="work-journal"][data-id="journal-daily"]')
    .click();
  const journal = page.locator("#work-journal-dialog");
  await expect(journal).toBeVisible();
  await expect(journal.locator(".work-journal-entry")).toHaveCount(1);
  await expect(journal).toContainText(NOTE);
  await expect(journal).not.toContainText("Sonraki adım");
  await expect(journal.locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.journalInjected)).toBeUndefined();
  await journal.getByRole("button", { name: "Tamam", exact: true }).click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(originals);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("results are optional and successive sessions have separate durable entries without completing the task", async ({
  page,
}) => {
  const originals = await seed(page);
  await beginFinish(page, 10_000);
  await finish(page);
  await beginFinish(page, 20_000);
  await finish(page);
  const daily = (await readRecords(page)).find(
    (record) => record.id === "journal-daily",
  );
  expect(daily.status).toBe(originals[1].status);
  expect(daily.workLog.map((entry) => entry.durationMs)).toEqual([
    10_000, 20_000,
  ]);
  expect(new Set(daily.workLog.map((entry) => entry.id)).size).toBe(2);
  expect(daily.workLog.map((entry) => entry.note)).toEqual(["", ""]);
  expect(daily.workLog.map((entry) => entry.nextAction)).toEqual(["", ""]);
  expect(daily.nextAction).toBe(originals[1].nextAction);
});

test("a failed Enter journal write retains its multiline result and paused draft while retry saves exactly once without changing the task's next step", async ({
  page,
}) => {
  const originals = await seed(page);
  await beginFinish(page);
  const field = finishDialog(page).getByRole("textbox", {
    name: "Sonuç",
  });
  await field.fill("Kaybolmayacak sonuç");
  await field.press("Shift+Enter");
  await field.pressSequentially("İkinci sonuç satırı.");
  const note = "Kaybolmayacak sonuç\nİkinci sonuç satırı.";
  await expect(field).toHaveValue(note);
  await field.evaluate((field) => {
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
  await expect(finishDialog(page)).toBeVisible();
  expect(await readRecords(page)).toEqual(originals);
  await page.evaluate((key) => {
    window.journalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key)
        throw new DOMException("Depolama dolu", "QuotaExceededError");
      return window.journalSetItem.call(this, storageKey, value);
    };
  }, KEY);
  await field.press("Enter");
  await expect(finishDialog(page)).toBeVisible();
  await expect(finishDialog(page).locator('[role="alert"]')).toBeVisible();
  await expect(field).toHaveValue(note);
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  expect(await readRecords(page)).toEqual(originals);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.journalSetItem;
  });
  await field.press("Enter");
  await expect(finishDialog(page)).not.toBeVisible();
  const daily = (await readRecords(page)).find(
    (record) => record.id === "journal-daily",
  );
  expect(daily.workLog).toHaveLength(1);
  expect(daily.workLog[0]).toMatchObject({
    durationMs: 65_000,
    note,
    nextAction: "",
  });
  expect(daily.nextAction).toBe(originals[1].nextAction);
  expect(JSON.parse(await readSaved(page)).odak.history).toHaveLength(1);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(originals);
});

test("finishing the same session from two open windows records its duration only once", async ({
  page,
  context,
}) => {
  await seed(page);
  await beginFinish(page, 45_000);
  await finishDialog(page)
    .locator('[name="resultNote"]')
    .fill("İlk kaydedilen sonuç");
  const other = await context.newPage();
  await other.goto("/");
  await panel(other)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  await expect(finishDialog(other)).toBeVisible();
  await finishDialog(other)
    .locator('[name="resultNote"]')
    .fill("İkinci pencerenin sonucu");
  await finishDialog(page)
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(finishDialog(page)).not.toBeVisible();
  await finishDialog(other)
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(finishDialog(other)).not.toBeVisible();
  const daily = (await readRecords(other)).find(
    (record) => record.id === "journal-daily",
  );
  expect(daily.workLog).toHaveLength(1);
  expect(daily.workLog[0]).toMatchObject({
    durationMs: 45_000,
    note: "İlk kaydedilen sonuç",
  });
  await other.reload();
  expect(
    (await readRecords(other)).find((record) => record.id === daily.id).workLog,
  ).toEqual(daily.workLog);
});

test("a saved journal whose timer finalization fails cannot resume and recovers without losing subsequent work", async ({
  page,
}) => {
  await seed(page);
  await beginFinish(page, 45_000);
  const refuseSessionWrites = ({ sessionKey, flag }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === sessionKey && sessionStorage.getItem(flag))
        throw new DOMException("Oturum yazılamadı", "QuotaExceededError");
      return original.call(this, storageKey, value);
    };
  };
  const config = {
    sessionKey: SESSION_KEY,
    flag: "journal-block-session-writes",
  };
  await page.evaluate(
    (flag) => sessionStorage.setItem(flag, "true"),
    config.flag,
  );
  await page.addInitScript(refuseSessionWrites, config);
  await page.evaluate(refuseSessionWrites, config);
  await finishDialog(page)
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(finishDialog(page).locator('[role="alert"]')).toBeVisible();
  await finishDialog(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  let daily = (await readRecords(page)).find(
    (record) => record.id === "journal-daily",
  );
  expect(daily.workLog).toHaveLength(1);
  expect(daily.workLog[0].durationMs).toBe(45_000);
  await expect(row(page, daily.id).locator(".work-start")).toBeDisabled();
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expect(row(page, daily.id).locator(".work-start")).toBeDisabled();
  await page.evaluate((flag) => sessionStorage.removeItem(flag), config.flag);
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expect(row(page, daily.id).locator(".work-start")).toBeEnabled();
  await beginFinish(page, 10_000);
  await finish(page);
  daily = (await readRecords(page)).find((record) => record.id === daily.id);
  expect(daily.workLog.map((entry) => entry.durationMs)).toEqual([
    45_000, 10_000,
  ]);
  expect(new Set(daily.workLog.map((entry) => entry.id)).size).toBe(2);
});

test("a journal backup survives reset and restores all records and journal fields losslessly", async ({
  page,
}) => {
  const originals = recordsFixture();
  originals[1].workLog = [
    log("historical-next-step", "2026-11-06", 65_001, "Önceki sonuç", NEXT),
  ];
  await seed(page, originals);
  await beginFinish(page, 61_000);
  await finish(page, { note: NOTE });
  const records = await readRecords(page);
  expect(records[1].workLog[0]).toEqual(originals[1].workLog[0]);
  expect(records[1].workLog[1].nextAction).toBe("");
  expect(records[1].nextAction).toBe(originals[1].nextAction);
  await openBackup(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const bytes = await readFile(await download.path());
  expect(validateStore(JSON.parse(bytes.toString("utf8"))).records).toEqual(
    records,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Çalışma alanını sıfırla", exact: true })
    .click();
  expect(await readRecords(page)).toEqual([]);
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await openBackup(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restore-file").setInputFiles({
    name: "is-gunlugu-yedegi.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect.poll(() => readRecords(page)).toEqual(records);
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
});

test("a backup with malformed journal data is rejected before replacement and does not alter the workspace", async ({
  page,
}) => {
  const records = await seed(page);
  await openBackup(page);
  const saved = await readSaved(page);
  let confirmations = 0;
  page.on("dialog", async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  const valid = log("invalid-backup-entry", "2026-11-07", 60_000);
  for (const workLog of [
    [{ ...valid, durationMs: -1 }],
    [{ ...valid, date: "2026-02-30" }],
    [valid, valid],
  ]) {
    const backup = {
      version: 1,
      records: records.map((record) =>
        record.type === "daily" ? { ...record, workLog } : record,
      ),
    };
    await page.locator("#restore-file").setInputFiles({
      name: "gecersiz-gunluk.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator("#settings-backup-error")).toBeVisible();
    await expect(page.locator("#settings-backup-error")).not.toBeEmpty();
    expect(await readSaved(page)).toBe(saved);
  }
  expect(confirmations).toBe(0);
});

test("weekly goals total saved daily time across statuses while keeping their numeric progress", async ({
  page,
}) => {
  const records = recordsFixture();
  records[1].workLog = [log("active-log", "2026-11-07", 30 * 60_000)];
  records.push(
    ...["completed", "cancelled", "transferred"].map((status) =>
      createRecord({
        id: `journal-${status}`,
        title: `Geçmiş çalışma ${status}`,
        status,
        parentId: "journal-weekly",
        workLog: [log(`${status}-log`, "2026-10-29", 30 * 60_000)],
      }),
    ),
  );
  await seed(page, records);
  const saved = await readSaved(page);
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(
    row(page, "journal-weekly").locator(".metric-cell"),
  ).toContainText("%40");
  await expect(
    row(page, "journal-weekly").locator(".weekly-work-time"),
  ).toHaveCount(0);
  await row(page, "journal-weekly")
    .locator('[data-action="goal-details"]')
    .click();
  await expect(page.locator("#goal-detail-panel")).toContainText(
    /2\s*(?:sa|saat)/,
  );
  await expect(row(page, "journal-weekly").locator(".work-start")).toHaveCount(
    0,
  );
  expect(await readSaved(page)).toBe(saved);
});

test("the weekly report uses saved entry dates from Monday through Sunday and escapes journal text", async ({
  page,
}) => {
  const records = recordsFixture();
  records[1].workLog = [
    log("previous-week", "2026-11-01", 60_000, "Önceki haftanın sonucu"),
    log("monday", "2026-11-02", 120_000, NOTE, NEXT),
    log("sunday", "2026-11-08", 180_000, "Pazar sonucu"),
    log("next-week", "2026-11-09", 240_000, "Sonraki haftanın sonucu"),
  ];
  await seed(page, records);
  const saved = await readSaved(page);
  await page.locator('[data-action="work-session-history"]').click();
  const report = page.locator("#work-week-dialog");
  await expect(report).toBeVisible();
  await expect(report.locator(".work-week-record")).toHaveCount(1);
  await expect(report).toContainText(NOTE);
  await expect(report).toContainText("Pazar sonucu");
  await expect(report).not.toContainText("Önceki haftanın sonucu");
  await expect(report).not.toContainText("Sonraki haftanın sonucu");
  await expect(report.locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.journalInjected)).toBeUndefined();
  await report.locator('[data-action="work-week-prev"]').click();
  await expect(report).toContainText("Önceki haftanın sonucu");
  await expect(report).not.toContainText("Pazar sonucu");
  await report.locator('[data-action="work-week-current"]').click();
  await report.locator('[data-action="work-week-next"]').click();
  await expect(report).toContainText("Sonraki haftanın sonucu");
  await expect(report).not.toContainText(NOTE);
  expect(await readSaved(page)).toBe(saved);
});

for (const type of ["meeting", "waiting"]) {
  test(`${type} follow-ups create a linked daily task only on save and reopen that task without duplicates`, async ({
    page,
  }) => {
    const source = cleanupMeetingContacts([
      createRecord({
        id: `source-${type}`,
        type,
        title: `Takip edilecek ${type}`,
        status: type === "waiting" ? "waiting_response" : "in_progress",
        priority: "high",
        dueDate: "2026-11-10",
        nextAction: "Yanıtı incele",
        description: "Kaynak açıklaması",
        owner: "Kişisel kullanıcı",
        sourceFields: { "Özgün kaynak": "Korunmalı" },
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
    ])[0];
    const records = [recordsFixture()[0], source];
    await seed(page, records);
    await page.locator(`#nav [data-view="${type}"]`).click();
    const trigger = page.locator(
      type === "meeting"
        ? `[data-action="meeting-route"][data-route="daily"][data-id="${source.id}"]`
        : `[data-action="daily-from-source"][data-id="${source.id}"]`,
    );
    const saved = await readSaved(page);
    await trigger.click();
    const editor = page.locator("#editor");
    const form = page.locator("#record-form");
    await expect(editor).toBeVisible();
    await openCreationExtras(page);
    for (const name of ["title", "description"]) {
      await expect(form.locator(`[name="${name}"]`)).toHaveValue(source[name]);
    }
    await expect(form.locator('[name="priority"]')).toHaveValue(
      type === "meeting" ? "normal" : source.priority,
    );
    await expect(form.locator('[name="nextAction"]')).toHaveValue(
      type === "meeting" ? "" : source.nextAction,
    );
    await expect(form.locator('[name="owner"]')).toHaveValue(
      type === "meeting" ? "" : source.owner,
    );
    await expect(form.locator('[name="dueDate"]')).toHaveValue(
      type === "meeting" ? "" : "10.11.2026",
    );
    await expect(form.locator('select[name="type"]')).toHaveValue("daily");
    await expect(form.locator('[name="status"]')).toHaveValue("planned");
    expect(await readSaved(page)).toBe(saved);
    await editor.getByRole("button", { name: "Vazgeç", exact: true }).click();
    expect(await readSaved(page)).toBe(saved);
    await trigger.click();
    await form.locator('[name="parentId"]').selectOption("journal-weekly");
    await editor
      .getByRole("button", { name: "Kaydı ekle", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    const created = await readRecords(page);
    const daily = created.find((record) => record.type === "daily");
    expect(created).toHaveLength(3);
    expect(created.find((record) => record.id === source.id)).toEqual(
      type === "meeting"
        ? {
            ...source,
            status: "in_progress",
          }
        : source,
    );
    expect(daily.status).toBe("planned");
    expect(daily.parentId).toBe("journal-weekly");
    expect(daily.sourceFields.__followupSource).toEqual({
      recordId: source.id,
      type,
    });
    await page.locator(`#nav [data-view="${type}"]`).click();
    await page
      .locator(
        type === "meeting"
          ? `[data-action="open-linked-action"][data-id="${source.id}"]`
          : `[data-action="daily-from-source"][data-id="${source.id}"]`,
      )
      .last()
      .click();
    await expect(
      editor.getByRole("button", {
        name: "Değişiklikleri kaydet",
        exact: true,
      }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    expect(
      (await readRecords(page)).filter((record) => record.type === "daily"),
    ).toHaveLength(1);
  });
}

test("two already-open source forms do not create duplicate daily tasks across windows", async ({
  page,
  context,
}) => {
  const source = createRecord({
    id: "source-shared",
    type: "meeting",
    title: "Ortak takip konusu",
  });
  await seed(page, [source]);
  await page.locator('#nav [data-view="meeting"]').click();
  await page
    .locator(
      '[data-action="meeting-route"][data-route="daily"][data-id="source-shared"]',
    )
    .click();
  const other = await context.newPage();
  await other.goto("/");
  await other.locator('#nav [data-view="meeting"]').click();
  await other
    .locator(
      '[data-action="meeting-route"][data-route="daily"][data-id="source-shared"]',
    )
    .click();
  await page
    .locator("#editor")
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  const firstSaved = await readSaved(page);
  const daily = (await readRecords(page)).find(
    (record) => record.type === "daily",
  );
  await expect(other.locator('#record-form [type="submit"]')).toHaveText(
    "Mevcut kaydı aç",
  );
  await other.locator('#record-form [type="submit"]').click();
  await expect(other.locator('#record-form [name="id"]')).toHaveValue(daily.id);
  expect(await readSaved(other)).toBe(firstSaved);
  await expect
    .poll(
      async () =>
        (await readRecords(other)).filter((record) => record.type === "daily")
          .length,
    )
    .toBe(1);
  expect(
    (await readRecords(other)).find((record) => record.id === source.id),
  ).toEqual({ ...source, status: "in_progress" });
});

test("current work keeps saved and empty journal controls beside Play across desktop and narrow themes without starting a session or changing records", async ({
  page,
}) => {
  const fixture = recordsFixture();
  fixture[1] = createRecord({
    ...fixture[1],
    title: "Kayıtlı çalışma",
    workLog: [log("overview-saved-log", "2026-11-07", 60_000, NOTE)],
  });
  fixture.push(
    createRecord({
      id: "overview-empty-journal",
      title: "Boş günlük işi",
      status: "planned",
      dueDate: "2026-11-07",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  await seed(page, fixture);
  await page.locator('#nav [data-view="dashboard"]').click();
  const before = await readSaved(page);
  const sessionBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    SESSION_KEY,
  );
  const journal = page.locator("#work-journal-dialog");

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ["light", "dark"]) {
      // Palette preview changes only the DOM, keeping the exact saved bytes.
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const [id, title, count] of [
        ["journal-daily", "Kayıtlı çalışma", 1],
        ["overview-empty-journal", "Boş günlük işi", 0],
      ]) {
        const current = page.locator(`.focus-row[data-id="${id}"]`);
        const actions = current.locator(".focus-work-actions");
        const trigger = actions.locator('[data-action="work-journal"]');
        const play = actions.locator(".work-start");
        await expect(trigger).toBeVisible();
        await expect(play).toBeVisible();
        await expect(trigger).toHaveAttribute(
          "data-session-count",
          String(count),
        );
        await expect(trigger).toHaveAttribute(
          "aria-label",
          `${title}: iş günlüğünü gör · ${count} kayıtlı oturum`,
        );
        if (count) await expect(trigger).toHaveClass(/has-entries/);
        else await expect(trigger).not.toHaveClass(/has-entries/);
        const geometry = await current.evaluate((element) => {
          const box = (target) => {
            const { x, y, width, height, right } =
              target.getBoundingClientRect();
            return { x, y, width, height, right };
          };
          return {
            row: box(element),
            journal: box(element.querySelector('[data-action="work-journal"]')),
            play: box(element.querySelector(".work-start")),
            title: box(element.querySelector(".focus-task")),
            viewport: innerWidth,
          };
        });
        for (const control of [geometry.journal, geometry.play]) {
          expect(control.width).toBe(22);
          expect(control.height).toBe(22);
          expect(control.x).toBeGreaterThanOrEqual(geometry.row.x);
          expect(control.right).toBeLessThanOrEqual(geometry.row.right);
          expect(control.right).toBeLessThanOrEqual(geometry.viewport);
        }
        expect(geometry.play.x - geometry.journal.right).toBeCloseTo(6, 1);
        expect(geometry.journal.y).toBeCloseTo(geometry.play.y, 1);
        expect(geometry.title.right).toBeLessThanOrEqual(geometry.journal.x);

        await trigger.click();
        await expect(journal).toBeVisible();
        await expect(journal.locator(".work-journal-subtitle")).toHaveText(
          title,
        );
        await expect(journal.locator(".work-journal-entry")).toHaveCount(count);
        if (count) await expect(journal).toContainText(NOTE);
        else await expect(journal.locator(".work-journal-empty")).toBeVisible();
        await expect(page.locator("#page-title")).toHaveText("Genel bakış");
        await expect(page.locator("#editor")).not.toBeVisible();
        await expect(panel(page)).not.toBeVisible();
        expect(await readSaved(page)).toBe(before);
        expect(
          await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
        ).toBe(sessionBefore);
        await journal
          .getByRole("button", { name: "Tamam", exact: true })
          .click();
        await expect(journal).not.toBeVisible();
        await expect(trigger).toBeFocused();
        expect((await current.boundingBox()).height).toBe(geometry.row.height);
      }
    }
  }
  expect(await readRecords(page)).toEqual(fixture);
  expect(await readSaved(page)).toBe(before);
});
