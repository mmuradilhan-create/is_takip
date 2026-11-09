import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord, validateStore } from "../../src/model.js";
import { nextAttention } from "./attention-support.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const CLEANUP_KEY = `${KEY}-waiting-notes-cleanup`;
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const NOTE = '<img src=x onerror="window.followupInjected=1"> Yanıt istendi.';
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

function fixture() {
  return [
    record({
      id: "waiting-primary",
      type: "waiting",
      title: "Üretim teklifinin yanıtını bekle",
      status: "waiting_response",
      sourceDate: "2026-10-28",
      lastFollowUpDate: "2026-11-02",
      nextFollowUpDate: "2026-11-08",
      expectedFrom: "Tedarik birimi",
      latestUpdate: "Önceki gerçek gelişme.",
      description: "Kullanıcının gerçek bekleme notu.",
      category: "Özgün kategori",
      sourceFields: { "Özgün alan": "Korunacak kaynak" },
    }),
    record({
      id: "waiting-unknown",
      type: "waiting",
      title: "Açılış tarihi bilinmeyen yanıt",
      status: "follow_up",
      nextFollowUpDate: "2026-11-06",
      createdAt: "2020-01-01T09:00:00.000Z",
      updatedAt: "2026-11-06T09:00:00.000Z",
    }),
    record({
      id: "waiting-unplanned",
      type: "waiting",
      title: "Sonraki takibi henüz planlanmamış konu",
      sourceDate: "2026-11-01",
    }),
    record({
      id: "waiting-closed",
      type: "waiting",
      title: "Daha önce kapanmış bekleme kaydı",
      status: "completed",
      sourceDate: "2020-01-01",
      lastFollowUpDate: "2026-11-01",
    }),
    record({
      id: "meeting-primary",
      type: "meeting",
      title: "Toplantı kararını onaylat",
      status: "waiting",
      dueDate: "2026-11-09",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, cleanupKey, records }) => {
      if (sessionStorage.getItem("waiting-followup-seeded")) return;
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
      localStorage.removeItem(cleanupKey);
      sessionStorage.setItem("waiting-followup-seeded", "true");
    },
    { key: KEY, cleanupKey: CLEANUP_KEY, records },
  );
  await page.goto("/");
  return records;
}

const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const list = (page) => page.locator('#nav [data-view="waiting"]').click();
const row = (page, id = "waiting-primary") =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const overview = (page, id = "waiting-primary") =>
  page.locator(`.attention-panel .followup-row[data-id="${id}"]`);
const dialog = (page) => page.locator("#waiting-followup-dialog");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function openFollowUp(page) {
  await list(page);
  await row(page).locator('[data-action="waiting-followup"]').click();
  await expect(dialog(page)).toBeVisible();
}

async function setFollowUp(
  page,
  { date = "07.11.2026", note = "", next = "" } = {},
) {
  await dialog(page).locator('[name="followUpDate"]').fill(date);
  await dialog(page).locator('[name="followUpNote"]').fill(note);
  await dialog(page).locator('[name="nextFollowUpDate"]').fill(next);
}

async function submitFollowUp(page) {
  await dialog(page)
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
}

async function openWaitingEditor(page, id = "waiting-primary") {
  await row(page, id).locator(".task-name").click();
  const preview = page.locator("#waiting-record-panel");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-record-id", id);
  await expect(page.locator("#editor")).not.toBeVisible();
  await preview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(id);
  await expect(page.locator('#record-form [name="type"]')).toHaveValue(
    "waiting",
  );
}

test("waiting import metadata becomes a real latest update while genuine notes and undo survive reload", async ({
  page,
}) => {
  const realNote = "Siparişe bağlanması bekleniyor.";
  const latest = "ArGe talep yapıldı.";
  const generated = record({
    id: "waiting-generated",
    type: "waiting",
    title: "Aktarılmış bekleme notunu temizle",
    sourceDate: "2026-10-28",
    description: `${realNote}\nSon Durum: ${latest}\nKaç Gün Bekledi: 10`,
    sourceFields: {
      Not: realNote,
      "Son Durum": latest,
      "Kaç Gün Bekledi": 10,
    },
  });
  const genuine = record({
    id: "waiting-genuine",
    type: "waiting",
    title: "Kullanıcının gerçek gün sayısı notu",
    description: "Kaç Gün Bekledi: 10\nGerçek kullanıcı notu.",
    sourceFields: {
      Not: "Kaç Gün Bekledi: 10\nGerçek kullanıcı notu.",
      "Kaç Gün Bekledi": 10,
    },
  });
  const noSource = record({
    id: "waiting-no-source",
    type: "waiting",
    title: "Kaynağı olmayan bekleme notu",
    description: "Son Durum: Kullanıcı yazdı\nKaç Gün Bekledi: 10",
  });
  const original = await seed(page, [generated, genuine, noSource]);
  const cleaned = await records(page);
  expect(cleaned).toEqual([
    { ...generated, description: realNote, latestUpdate: latest },
    genuine,
    noSource,
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CLEANUP_KEY),
  ).toBe("1");
  await list(page);
  await openWaitingEditor(page, generated.id);
  await expect(page.locator('#record-form [name="description"]')).toHaveValue(
    realNote,
  );
  await expect(page.locator('#record-form [name="latestUpdate"]')).toHaveValue(
    latest,
  );
  await page.locator('#editor [data-action="close"]').last().click();
  await undo(page);
  expect(await records(page)).toEqual(original);
  await page.reload();
  expect(await records(page)).toEqual(original);
});

test("waiting reminder dates open from attention cards and their own list while meeting legacy dates stay read-only", async ({
  page,
}) => {
  const items = fixture().map((item) =>
    item.id === "waiting-primary"
      ? { ...item, nextFollowUpDate: "2026-11-07" }
      : item,
  );
  items.push(
    record({
      id: "waiting-future-excluded",
      type: "waiting",
      title: "Üç günlük aralığın dışındaki konu gündeme girmesin",
      sourceDate: "2026-10-28",
      nextFollowUpDate: "2026-11-11",
    }),
  );
  const original = await seed(page, items);
  const initialBytes = await saved(page);
  const primary = overview(page);
  await expect(overview(page, "waiting-future-excluded")).toHaveCount(0);
  await expect(primary.locator(".waiting-age")).toHaveText("10 gün");
  await expect(primary.locator(".waiting-age")).toHaveAttribute(
    "aria-label",
    "10 gündür bekliyor",
  );
  await expect(
    overview(page, "waiting-unknown").locator(".waiting-age"),
  ).toHaveText("—");
  await expect(
    overview(page, "waiting-unknown").locator(".waiting-age"),
  ).toHaveAttribute("aria-label", "Bekleme başlangıcı yok");
  await expect(
    overview(page, "waiting-unknown").locator(".waiting-age"),
  ).toHaveAttribute("title", "Beklemeye başlama tarihi belirlenmedi");
  await expect(overview(page, "meeting-primary")).toHaveCount(0);
  await page.getByRole("button", { name: "Takvimi aç", exact: true }).click();
  await expect(
    page.locator(
      '#dashboard-calendar-dialog [data-calendar-record-id="meeting-primary"]',
    ),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="meeting"]').click();
  const meetingRow = row(page, "meeting-primary");
  await expect(
    meetingRow.locator(".inline-priority, .inline-date"),
  ).toHaveCount(0);
  await meetingRow.locator(".task-name").click();
  const meetingPreview = page.locator("#meeting-record-panel");
  await expect(meetingPreview).toBeVisible();
  await meetingPreview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "meeting-primary",
  );
  await expect(page.locator('#record-form select[name="type"]')).toHaveValue(
    "meeting",
  );
  await expect(page.locator('#record-form [name="dueDate"]')).toBeHidden();
  await expect(page.locator('#record-form [name="dueDate"]')).toBeDisabled();
  await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
    "09.11.2026",
  );
  await page.locator('#editor [data-action="close"]').last().click();
  expect(await saved(page)).toBe(initialBytes);
  await page.locator('#nav [data-view="dashboard"]').click();
  const attentionDate = primary.locator("button.waiting-next-date");
  await expect(attentionDate).toBeVisible();
  await attentionDate.click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("data-selection-mode", "direct");
  await expect(page.locator("#due-date-menu, #quick-date-form")).toHaveCount(0);
  await expect(
    picker.locator('input[type="text"], [type="submit"]'),
  ).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(picker.locator('[data-date-day="2026-11-07"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(attentionDate).toHaveAttribute("aria-expanded", "false");
  expect(await saved(page)).toBe(initialBytes);
  await list(page);
  await row(page).locator(".waiting-next-date").click();
  await expect(picker).toBeVisible();
  await picker.locator('[data-date-day="2026-11-10"]').click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    (await records(page)).find((item) => item.id === "waiting-primary")
      .nextFollowUpDate,
  ).toBe("2026-11-10");
  expect(
    (await records(page)).find((item) => item.id === "waiting-primary"),
  ).not.toHaveProperty("followUpLog");
  expect(
    (await records(page)).find((item) => item.id === "meeting-primary"),
  ).toEqual(original.find((item) => item.id === "meeting-primary"));
  await undo(page);
  expect(await saved(page)).toBe(initialBytes);
  await row(page).locator(".waiting-next-date").click();
  await picker
    .getByRole("button", { name: "Tarihi kaldır", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(await records(page)).toEqual(
    original.map((item) =>
      item.id === "waiting-primary"
        ? { ...item, nextFollowUpDate: "", updatedAt: NOW.toISOString() }
        : item,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(initialBytes);
  await list(page);
  await page.locator("#period-filter").selectOption("overdue");
  await expect(row(page, "waiting-unknown")).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await expect(row(page, "waiting-unplanned")).toHaveCount(0);
  await page.locator("#period-filter").selectOption("soon");
  await expect(row(page)).toBeVisible();
  await expect(row(page, "waiting-unknown")).toHaveCount(0);
  await page.locator("#period-filter").selectOption("unscheduled");
  await expect(row(page, "waiting-unplanned")).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await page.locator("#period-filter").selectOption("all");
  await expect(row(page)).toBeVisible();
  expect(await saved(page)).toBe(initialBytes);
  await page.locator('#nav [data-view="dashboard"]').click();
  await expect(overview(page, "waiting-unplanned")).toHaveCount(0);
  await list(page);
  const unplannedDate = row(page, "waiting-unplanned").locator(
    ".waiting-next-date",
  );
  await expect(unplannedDate).toContainText("Takip planla");
  await unplannedDate.click();
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Tarihi kaldır", exact: true }),
  ).toBeDisabled();
  await picker.locator('[data-date-day="2026-11-10"]').click();
  await expect(picker).not.toBeVisible();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  const edited = await records(page);
  expect(edited).toEqual(
    original.map((item) =>
      item.id === "waiting-unplanned"
        ? {
            ...item,
            nextFollowUpDate: "2026-11-10",
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  expect(
    edited.find((item) => item.id === "waiting-unplanned"),
  ).not.toHaveProperty("followUpLog");
  await page.locator('#nav [data-view="dashboard"]').click();
  const plannedCard = overview(page, "waiting-unplanned");
  const nextPage = nextAttention(page);
  while (
    !(await plannedCard.isVisible()) &&
    (await nextPage.count()) &&
    !(await nextPage.isDisabled())
  )
    await nextPage.click();
  await expect(plannedCard).toBeVisible();
  await expect(plannedCard.locator("[data-attention-date]")).toHaveAttribute(
    "data-attention-date",
    "2026-11-10",
  );
  await undo(page);
  expect(await saved(page)).toBe(initialBytes);
  await expect(overview(page, "waiting-unplanned")).toHaveCount(0);
});

test("a dated follow-up saves one history entry and next plan while waiting age, source notes, status and native backup stay accurate", async ({
  page,
}) => {
  const original = await seed(page);
  const initialBytes = await saved(page);
  await openFollowUp(page);
  await expect(dialog(page).locator('[name="followUpDate"]')).toHaveValue(
    "07.11.2026",
  );
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue("");
  await expect(dialog(page).locator(".waiting-followup-latest")).toContainText(
    original[0].latestUpdate,
  );
  await setFollowUp(page, { note: NOTE, next: "10.11.2026" });
  await submitFollowUp(page);
  await expect(dialog(page)).not.toBeVisible();
  const edited = await records(page);
  const primary = edited.find((item) => item.id === "waiting-primary");
  expect(primary).toMatchObject({
    ...original[0],
    lastFollowUpDate: "2026-11-07",
    nextFollowUpDate: "2026-11-10",
    latestUpdate: NOTE,
    updatedAt: NOW.toISOString(),
  });
  expect(primary.followUpLog).toHaveLength(1);
  expect(primary.followUpLog[0]).toEqual({
    id: expect.any(String),
    date: "2026-11-07",
    note: NOTE,
    nextFollowUpDate: "2026-11-10",
    previousUpdate: original[0].latestUpdate,
  });
  expect(edited.slice(1)).toEqual(original.slice(1));
  await expect(row(page).locator(".waiting-age")).toHaveText("10 gün");
  await row(page).locator('[data-action="waiting-followup"]').click();
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue("");
  await expect(dialog(page)).toContainText(NOTE);
  await expect(dialog(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.followupInjected)).toBeUndefined();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = page.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="backup-records"]').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(validateStore(backup).records).toEqual(edited);
  await page.locator('#settings-dialog [data-action="close"]').last().click();
  await openWaitingEditor(page);
  await page.locator('#record-form [name="nextFollowUpDate"]').fill("geçersiz");
  await openCreationExtras(page);
  await page.locator('#record-form [name="type"]').selectOption("meeting");
  await expect(
    page.locator('#record-form [name="nextFollowUpDate"]'),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const retyped = (await records(page)).find((item) => item.id === primary.id);
  expect(retyped).toMatchObject({
    type: "meeting",
    nextFollowUpDate: primary.nextFollowUpDate,
    latestUpdate: primary.latestUpdate,
    followUpLog: primary.followUpLog,
    description: primary.description,
  });
  await undo(page);
  expect(await records(page)).toEqual(edited);
  await page.reload();
  expect(await records(page)).toEqual(edited);
  await undo(page);
  expect(await saved(page)).toBe(initialBytes);
});

test("cancelled, future and failed follow-up saves preserve records and keep a retryable draft without duplicate history", async ({
  page,
}) => {
  const original = await seed(page);
  const initialBytes = await saved(page);
  await openFollowUp(page);
  await setFollowUp(page, {
    note: "Kaydedilmeyecek taslak",
    next: "12.11.2026",
  });
  await dialog(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  expect(await saved(page)).toBe(initialBytes);
  await openFollowUp(page);
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue("");
  await setFollowUp(page, {
    date: "08.11.2026",
    note: "Gelecekte yapılmış takip olamaz",
    next: "12.11.2026",
  });
  await submitFollowUp(page);
  await expect(dialog(page)).toBeVisible();
  const followUpDate = dialog(page).locator('[name="followUpDate"]');
  expect(await followUpDate.evaluate((input) => input.checkValidity())).toBe(
    false,
  );
  expect(
    await followUpDate.evaluate((input) => input.validationMessage),
  ).not.toBe("");
  expect(await saved(page)).toBe(initialBytes);
  await setFollowUp(page, {
    note: "Bugün yanıt tekrar istendi.",
    next: "12.11.2026",
  });
  await page.evaluate((key) => {
    window.followupOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key)
        throw new DOMException("Depolama dolu", "QuotaExceededError");
      return window.followupOriginalSetItem.call(this, storageKey, value);
    };
  }, KEY);
  await submitFollowUp(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('[name="followUpNote"]')).toHaveValue(
    "Bugün yanıt tekrar istendi.",
  );
  await expect(page.locator("#waiting-followup-error")).not.toBeEmpty();
  expect(await saved(page)).toBe(initialBytes);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.followupOriginalSetItem;
  });
  await submitFollowUp(page);
  await expect(dialog(page)).not.toBeVisible();
  const edited = await records(page);
  expect(edited[0].followUpLog).toHaveLength(1);
  expect(edited[0].followUpLog[0].note).toBe("Bugün yanıt tekrar istendi.");
  expect(edited[0].status).toBe(original[0].status);
  await undo(page);
  expect(await saved(page)).toBe(initialBytes);
});

test("closed waiting topics show plain durations while preserving original counts, reopen, backup and exact Undo", async ({
  page,
  context,
}) => {
  test.setTimeout(45_000);
  const original = fixture().map((item) =>
    item.id === "waiting-closed"
      ? {
          ...item,
          sourceFields: {
            "Kaç Gün Bekledi": 27,
            __formulas: {
              "Kaç Gün Bekledi": { formula: "TODAY()-A2", result: 27 },
            },
          },
        }
      : item,
  );
  original.push(
    record({
      id: "waiting-closed-unknown",
      type: "waiting",
      title: "Başlangıcı bilinmeyen kapalı konu",
      status: "completed",
      sourceFields: { "Kaç Gün Bekledi": 31 },
    }),
  );
  await seed(page, original);
  const initialBytes = await saved(page);
  await list(page);
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  const legacy = row(page, "waiting-closed").locator(".waiting-age");
  await expect(legacy).toHaveText("27 gün");
  await expect(legacy).toHaveAttribute("data-waiting-age-kind", "imported");
  await expect(legacy).toHaveAttribute("title", "Bekleme süresi: 27 gün");
  await expect(legacy).toHaveAttribute("aria-label", "27 gün bekledi");
  await expect(legacy).not.toHaveAttribute("title", /Excel|aktar/iu);
  await row(page, "waiting-closed").locator(".task-name").click();
  const legacyDetail = page.locator("#waiting-record-panel");
  await expect(legacyDetail).toHaveAttribute(
    "data-record-id",
    "waiting-closed",
  );
  const legacyDetailAge = legacyDetail.locator('[data-waiting-fact="age"] dd');
  await expect(legacyDetailAge).toHaveText("27 gün bekledi");
  await expect(legacyDetailAge).toHaveAttribute(
    "title",
    "Bekleme süresi: 27 gün",
  );
  await expect(legacyDetailAge).toHaveAttribute("aria-label", "27 gün bekledi");
  await expect(legacyDetailAge).not.toContainText(/Excel|aktar/iu);
  await legacyDetail
    .getByRole("button", { name: "Kapat", exact: true })
    .click();
  await expect(legacyDetail).not.toBeVisible();
  const unknown = row(page, "waiting-closed-unknown").locator(".waiting-age");
  await expect(unknown).toHaveText("—");
  await expect(unknown).toHaveAttribute("data-waiting-age-kind", "unknown");
  expect(await saved(page)).toBe(initialBytes);
  await page.locator('#nav [data-view="dashboard"]').click();
  await overview(page).locator(".followup-title").click();
  const detail = page.locator("#waiting-record-panel");
  const detailAge = detail.locator('[data-waiting-fact="age"] dd');
  await expect(detailAge).toHaveText("10 gündür bekliyor");

  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await list(other);
  await row(other).locator('[data-action="quick-complete"]').click();
  await other.locator('[data-action="list-scope"][data-scope="all"]').click();
  const age = row(other).locator(".waiting-age");
  await expect(age).toHaveText("10 gün");
  await expect(age).toHaveAttribute("data-waiting-age-kind", "closure");
  await expect(detailAge).toHaveText("10 gün bekledi");
  await expect(detailAge).toHaveAttribute("data-waiting-age-kind", "closure");
  await expect(
    detail.locator('[data-action="waiting-record-followup"]'),
  ).toHaveCount(0);
  const closed = (await records(other)).find(
    (item) => item.id === "waiting-primary",
  );
  expect(closed.sourceFields).toEqual({
    ...original[0].sourceFields,
    __waitingClosure: {
      version: 1,
      closedDate: "2026-11-07",
      closedAt: NOW.toISOString(),
    },
  });
  const firstClosedBytes = await saved(other);
  const later = new Date("2026-11-09T12:00:00.000Z");
  await other.clock.setFixedTime(later);
  await other.reload();
  await list(other);
  await other.locator('[data-action="list-scope"][data-scope="all"]').click();
  await expect(age).toHaveText("10 gün");
  expect(await saved(other)).toBe(firstClosedBytes);
  await row(other).locator('[data-action="status-menu"]').click();
  await other
    .locator('#status-menu [data-action="set-status"][data-status="follow_up"]')
    .click();
  await expect(age).toHaveText("12 gün");
  await expect(age).toHaveAttribute("data-waiting-age-kind", "live");
  await row(other).locator('[data-action="quick-complete"]').click();
  await expect(age).toHaveText("12 gün");
  await expect(age).toHaveAttribute("data-waiting-age-kind", "closure");
  await expect(detailAge).toHaveText("12 gün bekledi");
  const reclosedRecords = await records(other);
  expect(
    reclosedRecords.find((item) => item.id === closed.id).sourceFields
      .__waitingClosure,
  ).toEqual({
    version: 1,
    closedDate: "2026-11-09",
    closedAt: later.toISOString(),
  });
  expect(reclosedRecords.filter((item) => item.id !== closed.id)).toEqual(
    original.filter((item) => item.id !== closed.id),
  );
  await other.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = other.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const downloadPromise = other.waitForEvent("download");
  await other.locator('[data-action="backup-records"]').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(validateStore(backup).records).toEqual(reclosedRecords);
  await other.locator('#settings-dialog [data-action="close"]').last().click();
  await undo(other);
  await expect(age).toHaveAttribute("data-waiting-age-kind", "live");
  await undo(other);
  expect(await saved(other)).toBe(firstClosedBytes);
  await undo(other);
  expect(await saved(other)).toBe(initialBytes);

  await other.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const restored = original.map((item) =>
    item.id === "waiting-primary" ? { ...item, status: "completed" } : item,
  );
  other.once("dialog", (confirmation) => confirmation.accept());
  await other.locator("#restore-file").setInputFiles({
    name: "eski-kapali-kayitlar.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, records: restored })),
  });
  await expect(other.locator("#settings-dialog")).not.toBeVisible();
  expect(await records(other)).toEqual(restored);
  expect(
    (await records(other)).find((item) => item.id === closed.id).sourceFields,
  ).toEqual(original[0].sourceFields);
  await undo(other);
  expect(await saved(other)).toBe(initialBytes);
  await other.close();
  await detail.locator('[data-action="waiting-record-close"]').last().click();
  expect(await saved(page)).toBe(initialBytes);
});
