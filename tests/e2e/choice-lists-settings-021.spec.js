import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.catalogInjected=1"> Özel proje';
const SOURCE_LISTS = {
  projectCode: { added: ["TAŞINAN-42", UNSAFE], hidden: ["ESKİ-42"] },
  workType: { added: ["Özel inceleme"], hidden: ["Test"] },
};
const RECEIVER_LISTS = {
  projectCode: { added: ["ALICI-9"], hidden: [] },
  workType: { added: ["Yerel iş"], hidden: ["Atölye"] },
};
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const settings = (page) => page.locator("#settings-dialog");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  return [
    record({
      id: "catalog-week",
      type: "weekly",
      title: "Korunacak haftalık hedef",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "catalog-primary",
      title: "Eski seçim değerleri korunacak iş",
      parentId: "catalog-week",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-10",
      projectCode: UNSAFE,
      workType: "İnceleme",
      category: "Özgün kategori",
      description: "Gerçek kayıt notu",
      nextAction: "Kontrolü bitir.",
      sourceFields: { "Özgün bilgi": { value: "Korunacak ham veri" } },
      workLog: [
        {
          id: "catalog-log",
          date: "2026-11-01",
          endedAt: "2026-11-01T09:00:00.000Z",
          durationMs: 60_000,
          note: "Gerçek oturum",
          nextAction: "Sonraki kontrol",
        },
      ],
    }),
    record({
      id: "catalog-completed",
      title: "Tamamlanan eski proje işi",
      status: "completed",
      projectCode: "BİTEN-1",
      workType: "Atölye",
    }),
  ];
}

async function seed(
  page,
  records = fixture(),
  theme = "light",
  choiceLists = SOURCE_LISTS,
) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records, theme, choiceLists }) => {
      if (sessionStorage.getItem("choice-lists-settings-021-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable", theme, choiceLists },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("choice-lists-settings-021-seeded", "1");
    },
    { key: KEY, records, theme, choiceLists },
  );
  await page.goto("/");
  return records;
}

async function openBackup(page) {
  if (!(await settings(page).isVisible()))
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const details = settings(page).locator(".settings-backup");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
}

async function uploadBackup(page, data) {
  await openBackup(page);
  await settings(page)
    .locator("#restore-file")
    .setInputFiles({
      name: "kayit-yedegi.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
}

async function restore(page, data, accept = true) {
  let handled = false;
  page.once("dialog", async (dialog) => {
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    handled = true;
  });
  await uploadBackup(page, data);
  await expect.poll(() => handled).toBe(true);
}

test("native backup transfers legacy fields and catalogs atomically while record-only restore preserves the receiver's preferences", async ({
  page,
  browser,
  baseURL,
}) => {
  const original = await seed(page);
  const beforeBackup = await saved(page);
  await openBackup(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records).toEqual(original);
  expect(backup.choiceLists).toEqual(SOURCE_LISTS);
  expect(
    backup.records.find((record) => record.id === "catalog-primary")
      .projectCode,
  ).toBe(UNSAFE);
  expect(await saved(page)).toBe(beforeBackup);
  expect(await page.evaluate(() => window.catalogInjected)).toBeUndefined();
  const receiverContext = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const receiver = await receiverContext.newPage();
    await seed(
      receiver,
      [
        record({
          id: "receiver-record",
          title: "Alıcının özgün kaydı",
          projectCode: "ALICI-ÖZGÜN",
          workType: "Yerel iş",
        }),
      ],
      "dark",
      RECEIVER_LISTS,
    );
    const beforeImport = await saved(receiver);
    const receiverPreferences = (await store(receiver)).odak.preferences;
    let confirmations = 0;
    const dismissInvalidConfirmation = async (dialog) => {
      confirmations++;
      await dialog.dismiss();
    };
    receiver.on("dialog", dismissInvalidConfirmation);
    await uploadBackup(receiver, {
      ...backup,
      choiceLists: {
        ...SOURCE_LISTS,
        projectCode: { added: ["X".repeat(121)], hidden: [] },
      },
    });
    await expect(
      settings(receiver).locator("#settings-backup-error"),
    ).not.toBeEmpty();
    expect(confirmations).toBe(0);
    expect(await saved(receiver)).toBe(beforeImport);
    receiver.off("dialog", dismissInvalidConfirmation);

    await restore(receiver, backup, false);
    expect(await saved(receiver)).toBe(beforeImport);
    await restore(receiver, backup);
    await expect
      .poll(async () => (await store(receiver)).records)
      .toEqual(original);
    expect((await store(receiver)).odak.preferences).toEqual({
      ...receiverPreferences,
      choiceLists: SOURCE_LISTS,
    });
    await expect(receiver.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await receiver.reload();
    expect((await store(receiver)).records).toEqual(original);
    expect((await store(receiver)).odak.preferences).toEqual({
      ...receiverPreferences,
      choiceLists: SOURCE_LISTS,
    });
    await receiver.locator('#nav [data-view="daily"]').click();
    await receiver
      .locator('tr[data-record-row][data-id="catalog-primary"] .task-name')
      .click();
    const legacyProject = receiver.locator('#editor [name="projectCode"]');
    await expect(legacyProject).toBeHidden();
    await expect(legacyProject).toBeDisabled();
    await expect(legacyProject).toHaveValue(UNSAFE);
    await expect(receiver.locator("#editor img, #editor script")).toHaveCount(
      0,
    );
    expect(
      await receiver.evaluate(() => window.catalogInjected),
    ).toBeUndefined();
    await receiver.locator('#editor [data-action="close"]').last().click();
    await undo(receiver);
    expect(await saved(receiver)).toBe(beforeImport);

    const legacyRecords = [
      record({
        id: "legacy-backup",
        title: "Eski kayıt yedeği",
        projectCode: UNSAFE,
        workType: "Eski iş türü",
      }),
    ];
    await restore(receiver, { version: 1, records: legacyRecords });
    await expect
      .poll(async () => (await store(receiver)).records)
      .toEqual(legacyRecords);
    expect((await store(receiver)).odak.preferences).toEqual(
      receiverPreferences,
    );
    await expect(receiver.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await receiver.reload();
    expect((await store(receiver)).records).toEqual(legacyRecords);
    expect((await store(receiver)).odak.preferences).toEqual(
      receiverPreferences,
    );
    expect(
      await receiver.evaluate(() => window.catalogInjected),
    ).toBeUndefined();
    await undo(receiver);
    expect(await saved(receiver)).toBe(beforeImport);
  } finally {
    await receiverContext.close();
  }
});
