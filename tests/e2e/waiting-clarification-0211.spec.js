import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const prompt = (page) =>
  page.locator('.planning-prompt[data-prompt="waiting"]');
const dialog = (page) => page.locator("#planning-prompts-dialog");
const form = (page) => page.locator("#editor #record-form");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  const topic = (id, title, extra = {}) =>
    make({
      id,
      type: "waiting",
      title,
      sourceDate: "2026-10-20",
      dueDate: "2026-11-25",
      nextFollowUpDate: "2026-11-14",
      lastFollowUpDate: "2026-11-02",
      nextAction: "Gerçek sonraki temas adımı.",
      description: "Gerçek kişisel bekleme notu.",
      sourceFields: { original: { value: "Kaynak bilgisi korunmalı" } },
      followUpLog: [
        {
          id: `${id}-history`,
          date: "2026-11-02",
          note: "Özgün takip sonucu.",
          nextFollowUpDate: "2026-11-14",
        },
      ],
      ...extra,
    });
  return [
    topic("missing-person", "İmalat kişi eksik", {
      expectedFrom: "   ",
      latestUpdate: "Özgün son gelişme.",
    }),
    topic("missing-update", "İmalat gelişme eksik", {
      expectedFrom: "Tedarik birimi",
      latestUpdate: "   ",
    }),
    topic("missing-both", "İmalat iki bilgi eksik"),
    topic("complete", "İmalat bilgileri tam", {
      expectedFrom: "Dış ekip",
      latestUpdate: "Yanıt istendi.",
    }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      topic(`closed-${status}`, `İmalat kapalı ${status}`, { status }),
    ),
    make({
      id: "daily-waiting",
      title: "İmalat günlük bekleme",
      status: "waiting",
      waitingReason: "",
      nextAction: "",
      description: "Günlük not korunmalı.",
      dueDate: "2026-11-15",
    }),
    make({
      id: "daily-ready",
      title: "İmalat henüz başlamamış günlük iş",
      status: "planned",
    }),
    make({ id: "meeting", type: "meeting", title: "İmalat toplantı aksiyonu" }),
  ];
}

async function seed(page) {
  const items = fixture();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("waiting-clarification-0211-seeded")) return;
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
      sessionStorage.setItem("waiting-clarification-0211-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function openPrompt(page) {
  await prompt(page).click();
  await expect(dialog(page)).toBeVisible();
}

async function clarify(page, id) {
  await openPrompt(page);
  await dialog(page)
    .locator(
      `[data-prompt-record="${id}"] [data-action="planning-prompt-record"]`,
    )
    .click();
  await expect(dialog(page)).not.toBeVisible();
}

test("waiting clarification counts only matching open incomplete subjects and filling visible basics removes the suggestion with one exact Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await expect(prompt(page)).toContainText("Beklemeyi netleştir");
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("4");
  await openPrompt(page);
  expect(
    await dialog(page)
      .locator("[data-prompt-record]")
      .evaluateAll((rows) =>
        rows.map((row) => row.dataset.promptRecord).sort(),
      ),
  ).toEqual([
    "daily-waiting",
    "missing-both",
    "missing-person",
    "missing-update",
  ]);
  await dialog(page)
    .getByRole("button", { name: "Kapat", exact: true })
    .click();
  await page.locator("#global-search").fill("İMALAT kişi");
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("1");
  await clarify(page, "missing-person");
  await expect(form(page)).toBeVisible();
  await expect(form(page).locator('select[name="type"]')).toHaveValue(
    "waiting",
  );
  await expect(form(page).locator('[name="expectedFrom"]')).toBeVisible();
  await expect(form(page).locator('[name="latestUpdate"]')).toBeVisible();
  await expect(form(page).locator('[name="expectedFrom"]')).toBeFocused();
  expect(
    await form(page)
      .locator("[data-record-editor-extras]")
      .evaluate((element) => element.open),
  ).toBe(true);
  await expect(form(page).locator('[name="dueDate"]')).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await form(page).locator('[name="expectedFrom"]').fill("Kalite birimi");
  await form(page)
    .locator('[name="latestUpdate"]')
    .fill("Güncel dış yanıt istendi.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  const after = await stored(page);
  const original = items.find((item) => item.id === "missing-person");
  expect(after.records.find((item) => item.id === original.id)).toEqual({
    ...original,
    expectedFrom: "Kalite birimi",
    latestUpdate: "Güncel dış yanıt istendi.",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.filter((item) => item.id !== original.id)).toEqual(
    items.filter((item) => item.id !== original.id),
  );
  expect(after.odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("1");
  await page.locator("#global-search").fill("");
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("4");
  await page.reload();
  expect(await saved(page)).toBe(before);
});

test("missing update focuses its basic field, cancelled drafts never write, and daily waiting keeps its separate optional-details workflow", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await clarify(page, "missing-update");
  await expect(form(page).locator('[name="latestUpdate"]')).toBeFocused();
  await expect(form(page).locator('[name="expectedFrom"]')).toHaveValue(
    "Tedarik birimi",
  );
  await form(page)
    .locator('[name="latestUpdate"]')
    .fill("Kaydedilmeyen özet taslağı.");
  const confirmation = page.waitForEvent("dialog");
  const closing = page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  const discard = await confirmation;
  expect(discard.type()).toBe("confirm");
  expect(discard.message()).toContain("Kaydedilmemiş değişiklikler");
  await discard.accept();
  await closing;
  expect(await saved(page)).toBe(before);
  await openPrompt(page);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await clarify(page, "daily-waiting");
  const detail = page.locator("#waiting-details-dialog");
  await expect(detail).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail.locator('[name="waitingReason"]')).toHaveValue("");
  await expect(detail.locator('[name="nextAction"]')).toHaveCount(0);
  await detail
    .locator('[name="waitingReason"]')
    .fill("Tasarım onayı bekleniyor.");
  await detail.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await saved(page)).toBe(before);
  await clarify(page, "daily-waiting");
  await expect(detail.locator('[name="waitingReason"]')).toHaveValue("");
  await detail
    .locator('[name="waitingReason"]')
    .fill("Tasarım onayı bekleniyor.");
  await detail
    .getByRole("button", { name: "Bekleme bilgisini kaydet", exact: true })
    .click();
  await expect(detail).not.toBeVisible();
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("3");
  const original = items.find((item) => item.id === "daily-waiting");
  const after = await stored(page);
  expect(after.records.find((item) => item.id === original.id)).toEqual({
    ...original,
    waitingReason: "Tasarım onayı bekleniyor.",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.filter((item) => item.id !== original.id)).toEqual(
    items.filter((item) => item.id !== original.id),
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(prompt(page).locator(".planning-prompt-count")).toHaveText("4");
});
