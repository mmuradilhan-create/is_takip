import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const settings = (page) => page.locator("#settings-dialog");
const body = (page) => settings(page).locator(":scope > .settings-content");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const catalog = (page) =>
  settings(page).locator('[data-choice-catalog="projectCode"]');
const catalogRow = (page, value) =>
  catalog(page).locator(`[data-choice-value="${value}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(page) {
  const records = [
    createRecord({
      id: "compact-week",
      type: "weekly",
      title: "Özgün haftalık hedef",
      periodKey: "2026-W45",
      currentValue: 3,
      targetValue: 8,
      metric: "Rapor",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "compact-task",
      title: "Gerçek bilgileri korunacak iş",
      parentId: "compact-week",
      projectCode: "A-1",
      workType: "Test",
      description: "Gerçek kullanıcı notu.",
      sourceFields: { original: { value: "Kaynak verisi korunmalı" } },
      workLog: [
        {
          id: "compact-log",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 60_000,
          note: "Gerçek çalışma sonucu.",
          nextAction: "Özgün sonraki adım.",
        },
      ],
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "compact-other",
      title: "Başka proje işi",
      projectCode: "B-2",
      workContext: "ad_hoc",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("settings-compact-0215-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: {
              density: "compact",
              theme: "light",
              choiceLists: {
                projectCode: { added: ["C-3"], hidden: [] },
                workType: { added: ["Teknik rapor"], hidden: [] },
              },
            },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("settings-compact-0215-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

async function open(page) {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(settings(page)).toBeVisible();
}

async function close(page) {
  await settings(page)
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
  await expect(settings(page)).not.toBeVisible();
}

test("common settings fit without body scrolling on desktop and narrow screens with backup immediately available", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1536, height: 864 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await open(page);
    const controls = [
      ...(await settings(page).getByRole("radio").all()),
      ...(await settings(page)
        .locator("[data-choice-catalog] > summary")
        .all()),
      settings(page).getByRole("button", {
        name: "Kayıt yedeğini indir",
        exact: true,
      }),
      settings(page).getByRole("button", {
        name: "Kayıt yedeğini geri yükle",
        exact: true,
      }),
      settings(page).locator(".settings-help > summary"),
      settings(page).getByRole("button", {
        name: "Çalışma alanını sıfırla",
        exact: true,
      }),
      settings(page).getByRole("button", { name: "Tamam", exact: true }),
    ];
    await expect(settings(page).getByRole("radio")).toHaveCount(3);
    await expect(settings(page).locator(".settings-backup")).toHaveAttribute(
      "open",
      "",
    );
    for (const detail of await settings(page)
      .locator("[data-choice-catalog], .settings-help")
      .all())
      expect(await detail.evaluate((element) => element.open)).toBe(false);
    expect(
      await body(page).evaluate((element) => ({
        scroll: element.scrollTop,
        overflow: element.scrollHeight > element.clientHeight + 1,
      })),
    ).toEqual({ scroll: 0, overflow: false });
    for (const control of controls) {
      await expect(control).toBeVisible();
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    for (const part of [
      settings(page).locator(":scope > .modal-header"),
      settings(page).locator(":scope > .modal-footer"),
    ])
      await expect(part).toBeInViewport({ ratio: 1 });
    expect(
      await settings(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(await body(page).evaluate((element) => element.scrollTop)).toBe(0);
    await close(page);
    expect(await saved(page)).toBe(before);
  }
});

test("help and catalog rows disclose through the keyboard while cancelling a local rename leaves all data untouched", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page);
  const before = await saved(page);
  await open(page);
  const help = settings(page).locator(".settings-help");
  await expect(
    settings(page).getByRole("heading", {
      name: "Hedef ilerlemesi",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(help.locator(".settings-goal-rules")).not.toBeVisible();
  await help.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(help).toHaveAttribute("open", "");
  await expect(
    settings(page).getByRole("heading", {
      name: "Hedef ilerlemesi",
      exact: true,
    }),
  ).toBeVisible();
  await expect(help).toContainText("Günlük iş → Haftalık → Aylık → Senelik");
  await help.locator(":scope > summary").focus();
  await page.keyboard.press("Space");
  await expect(help.locator(".settings-goal-rules")).not.toBeVisible();
  await catalog(page).locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(catalog(page)).toHaveAttribute("open", "");
  const rename = catalogRow(page, "A-1").locator(
    '[data-choice-action="rename"]',
  );
  await rename.focus();
  await page.keyboard.press("Enter");
  const input = catalog(page).locator('[data-choice-form="rename"] input');
  await expect(input).toBeFocused();
  await input.fill("Kaydedilmeyecek liste taslağı");
  await input.press("Escape");
  await expect(rename).toBeFocused();
  expect(await saved(page)).toBe(before);
  await close(page);
  await open(page);
  await expect(
    catalog(page).locator('[data-choice-form="rename"]'),
  ).toHaveCount(0);
  if (!(await catalog(page).evaluate((element) => element.open)))
    await catalog(page).locator(":scope > summary").click();
  await expect(catalogRow(page, "A-1")).toBeVisible();
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("compact theme and catalog actions persist independently and each Undo restores the exact previous workspace", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await open(page);
  const dark = settings(page).getByRole("radio", { name: "Koyu", exact: true });
  await dark.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await stored(page)).records).toEqual(original);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await close(page);
  await page.reload();
  await open(page);
  await expect(
    settings(page).getByRole("radio", { name: "Koyu", exact: true }),
  ).toBeChecked();
  await close(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await open(page);
  await catalog(page).locator(":scope > summary").click();
  await catalogRow(page, "A-1")
    .locator('[data-choice-action="rename"]')
    .click();
  const input = catalog(page).locator('[data-choice-form="rename"] input');
  await input.fill("A-10");
  await input.press("Enter");
  await expect(catalogRow(page, "A-10")).toBeVisible();
  expect((await stored(page)).records).toEqual(original);
  const renamed = await saved(page);
  await catalogRow(page, "A-10")
    .locator('[data-choice-action="remove"]')
    .click();
  await expect(catalogRow(page, "A-10")).toHaveCount(0);
  expect((await stored(page)).records).toEqual(original);
  await close(page);
  await undo(page);
  expect(await saved(page)).toBe(renamed);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("direct backup buttons download the original records and open upload without bypassing invalid-data or reset-cancellation guards", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await open(page);
  await expect(settings(page).locator(".settings-backup")).toHaveAttribute(
    "open",
    "",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records).toEqual(original);
  expect(backup.choiceLists).toEqual(
    (await stored(page)).odak.preferences.choiceLists,
  );
  expect(await saved(page)).toBe(before);
  let confirmations = 0;
  page.on("dialog", async (confirmation) => {
    confirmations++;
    await confirmation.dismiss();
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini geri yükle", exact: true })
      .click(),
  ]);
  await chooser.setFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken-json"),
  });
  await expect(
    settings(page).locator("#settings-backup-error"),
  ).not.toBeEmpty();
  expect(confirmations).toBe(0);
  expect(await saved(page)).toBe(before);
  await settings(page)
    .getByRole("button", { name: "Çalışma alanını sıfırla", exact: true })
    .click();
  expect(confirmations).toBe(1);
  expect(await saved(page)).toBe(before);
  await close(page);
  await open(page);
  await expect(settings(page).locator("#settings-backup-error")).toBeEmpty();
  await close(page);
  expect(await saved(page)).toBe(before);
});
