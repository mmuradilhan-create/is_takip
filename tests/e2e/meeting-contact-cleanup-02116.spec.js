import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";

const KEY = "is-takip-v1";
const MARKER = `${KEY}-meeting-contact-cleanup`;
const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function restore(page, backup) {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restore-file").setInputFiles({
    name: "sentetik-toplanti-yedegi.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
}

test("meeting contacts clear once without changing other records, exact Undo survives reload, and edits plus both restore paths keep them cleared", async ({
  page,
}) => {
  const meeting = make({
    id: "contacts-meeting",
    type: "meeting",
    title: "Teknik karar",
    decision: "Doğrulama yapılacak.",
    status: "in_progress",
    sourceDate: "2026-11-01",
    dueDate: "2026-11-13",
    nextAction: "Korunacak eski adım",
    owner: "Sentetik sorumlu",
    participants: "Sentetik katılımcılar",
    description: "Sentetik sorumlu ifadesi notta korunur.",
    sourceFields: {
      Sorumlu: "Sentetik sorumlu",
      Katılımcılar: "Sentetik katılımcılar",
      Not: "Sentetik katılımcılar ifadesi notta korunur.",
      nested: { values: ["korunacak bilgi", 42] },
      __formulas: {
        Katılımcılar: {
          formula: '"Sentetik katılımcılar"',
          result: "Sentetik katılımcılar",
        },
        Termin: { formula: "DATE(2026,11,13)", result: 46339 },
      },
    },
  });
  const daily = make({
    id: "contacts-daily",
    title: "Toplantı dışı iş",
    workContext: "ad_hoc",
    owner: "Korunan iş sorumlusu",
    participants: "Korunan iş kişileri",
    sourceFields: {
      Sorumlu: "Korunan iş sorumlusu",
      Katılımcılar: "Korunan iş kişileri",
    },
    workLog: [
      {
        id: "contacts-log",
        date: "2026-11-01",
        endedAt: STAMP,
        durationMs: 60_000,
        note: "Korunacak çalışma kaydı",
        nextAction: "Sonraki çalışma",
      },
    ],
  });
  const original = [meeting, daily];
  const initialRaw = JSON.stringify({
    version: 1,
    records: original,
    odak: { version: 1, preferences: { density: "compact" }, history: [] },
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, initialRaw }) => {
      if (sessionStorage.getItem("meeting-contacts-seeded")) return;
      localStorage.setItem(key, initialRaw);
      for (const suffix of [
        "daily-context-migration",
        "import-notes-cleanup",
        "waiting-notes-cleanup",
        "waiting-state-migration",
      ])
        localStorage.setItem(`${key}-${suffix}`, "1");
      sessionStorage.setItem("meeting-contacts-seeded", "1");
    },
    { key: KEY, initialRaw },
  );
  await page.goto("/");
  await expect
    .poll(async () => (await stored(page)).records)
    .toEqual(cleanupMeetingContacts(original));
  expect((await stored(page)).records[1]).toEqual(daily);
  expect((await stored(page)).odak.history).toHaveLength(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), MARKER)).toBe(
    "1",
  );
  await undo(page);
  expect(await saved(page)).toBe(initialRaw);
  await page.reload();
  expect(await saved(page)).toBe(initialRaw);

  await page.locator('#nav [data-view="meeting"]').click();
  await page
    .locator(`[data-record-row][data-id="${meeting.id}"] .task-name`)
    .click();
  const preview = page.locator("#meeting-record-panel");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-record-id", meeting.id);
  expect(await saved(page)).toBe(initialRaw);
  await preview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  const form = page.locator("#editor #record-form");
  await expect(form.locator('[name="id"]')).toHaveValue(meeting.id);
  await form.locator('[name="title"]').fill("Düzeltilen teknik karar");
  await form
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect((await stored(page)).records).toEqual(
    cleanupMeetingContacts([
      {
        ...meeting,
        title: "Düzeltilen teknik karar",
        updatedAt: NOW.toISOString(),
      },
      daily,
    ]),
  );
  await undo(page);
  expect(await saved(page)).toBe(initialRaw);

  const incoming = [
    make({ ...meeting, id: "restored-meeting", title: "Yedekten gelen karar" }),
    daily,
  ];
  await restore(page, { version: 1, records: incoming });
  expect((await stored(page)).records).toEqual(
    cleanupMeetingContacts(incoming),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(initialRaw);
  const choiceLists = {
    projectCode: { added: ["Sentetik proje"], hidden: [] },
    workType: { added: [], hidden: [] },
  };
  await restore(page, { version: 1, records: incoming, choiceLists });
  expect((await stored(page)).records).toEqual(
    cleanupMeetingContacts(incoming),
  );
  expect((await stored(page)).odak.preferences.choiceLists).toEqual(
    choiceLists,
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(initialRaw);
  await page.reload();
  expect(await saved(page)).toBe(initialRaw);
});
