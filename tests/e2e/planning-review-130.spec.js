import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const OLD = "2026-10-20T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: OLD, updatedAt: OLD, ...input });
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const rows = (page) =>
  page
    .locator("#planning-prompts-dialog [data-prompt-record]")
    .evaluateAll((items) => items.map((item) => item.dataset.promptRecord));

async function seed(page) {
  const records = [
    make({ id: "keep", title: "Tedarikçi teklifini karşılaştır" }),
    make({ id: "finish", title: "Eski rapor taslağını düzenle" }),
    make({ id: "drop", title: "Artık gerekmeyen iş" }),
    make({ id: "worked", title: "Dün üzerinde çalışılan eski iş" }),
    make({
      id: "no-contact",
      type: "waiting",
      title: "Kalıp onayı",
      status: "waiting_response",
      nextFollowUpDate: "2026-11-12",
      sourceDate: "2026-11-07",
    }),
    make({
      id: "no-date",
      type: "waiting",
      title: "Numune sonucu",
      status: "waiting_response",
      expectedFrom: "Laboratuvar",
      sourceDate: "2026-10-01",
    }),
    make({
      id: "fresh",
      type: "waiting",
      title: "Yeni açılan konu",
      status: "waiting_response",
      expectedFrom: "Satın alma",
      nextFollowUpDate: "2026-11-12",
      sourceDate: "2026-11-07",
    }),
  ];
  const odak = {
    version: 1,
    workSessions: {
      version: 1,
      currentId: null,
      entries: [
        {
          recordId: "worked",
          sessionId: "worked-session",
          status: "paused",
          elapsedMs: 0,
          startedAt: null,
          ownerId: null,
          updatedAt: Date.parse("2026-11-07T15:00:00.000Z"),
          draftNote: "Dün yazılan not",
          trackTime: false,
        },
      ],
    },
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem("seeded", "1");
    },
    { key: KEY, value: JSON.stringify({ version: 1, records, odak }) },
  );
  await page.goto("/");
}

test("review suggestions are answered in place: still valid, complete or cancel, each one undo step", async ({
  page,
}) => {
  await seed(page);
  await page.locator('.planning-prompt[data-prompt="review"]').click();
  // A job with a recent work note is active even if the record is old.
  expect(await rows(page)).toEqual(["drop", "finish", "keep"]);
  const row = (id) =>
    page.locator(`#planning-prompts-dialog [data-prompt-record="${id}"]`);
  expect(
    await row("keep")
      .locator("button")
      .evaluateAll((items) => items.map((item) => item.textContent.trim())),
  ).toEqual(["Hâlâ geçerli", "Tamamla", "İptal", "İşi aç", ""]);

  await row("keep").locator('[data-review="keep"]').click();
  expect(await rows(page)).toEqual(["drop", "finish"]);
  // The keyboard moves on to the neighbouring job still left to review.
  await expect(row("finish").locator('[data-review="keep"]')).toBeFocused();
  await row("finish").locator('[data-review="completed"]').click();
  await row("drop").locator('[data-review="cancelled"]').click();
  // Cancelling asks why; the reason is optional and Enter goes ahead.
  const prompt = page.locator("#planning-prompts-dialog #outcome-prompt");
  await expect(prompt.locator("label")).toHaveText("Neden?");
  await expect(prompt.locator("input")).toBeFocused();
  await prompt.locator("input").fill("Proje durduruldu");
  await page.keyboard.press("Enter");
  await expect(page.locator("#planning-prompts-dialog .soft-empty")).toHaveText(
    "Burada planlanacak kayıt kalmadı.",
  );
  await expect(
    page.locator("#planning-prompts-dialog .modal-footer .btn.primary"),
  ).toBeFocused();
  let saved = await stored(page);
  const find = (id) => saved.records.find((item) => item.id === id);
  expect(find("keep").updatedAt).toBe(NOW.toISOString());
  expect(find("keep").status).toBe("planned");
  expect(find("finish").status).toBe("completed");
  expect(find("drop").status).toBe("cancelled");
  expect(find("drop").cancelReason).toBe("Proje durduruldu");
  expect(saved.odak.history.map((entry) => entry.label)).toEqual([
    "İşi gözden geçirme",
    "Durum güncelleme",
    "Durum güncelleme",
  ]);
  await page
    .locator("#planning-prompts-dialog .modal-footer .btn.primary")
    .click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  saved = await stored(page);
  expect(find("keep").updatedAt).toBe(OLD);
  expect(find("finish").status).toBe("planned");
  expect(find("drop").status).toBe("planned");
  await expect(
    page.locator(
      '.planning-prompt[data-prompt="review"] .planning-prompt-count',
    ),
  ).toHaveText("3");
});

test("waiting suggestions name what is missing and open the editor on that field", async ({
  page,
}) => {
  await seed(page);
  await page.locator('.planning-prompt[data-prompt="waiting"]').click();
  // A new topic without a latest update is not nagged.
  expect(await rows(page)).toEqual(["no-contact", "no-date"]);
  await expect(
    page.locator(
      '#planning-prompts-dialog [data-prompt-record="no-contact"] .planning-prompt-gaps',
    ),
  ).toHaveText("Eksik: Kimden bekleniyor");
  await expect(
    page.locator(
      '#planning-prompts-dialog [data-prompt-record="no-date"] .planning-prompt-gaps',
    ),
  ).toHaveText("Eksik: Sonraki takip tarihi · Son gelişme");
  await page
    .locator(
      '#planning-prompts-dialog [data-prompt-record="no-date"] [data-action="planning-prompt-record"]',
    )
    .click();
  await expect(
    page.locator('#record-form [name="nextFollowUpDate"]'),
  ).toBeFocused();
});
