import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T08:00:00.000Z";
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const statusOf = async (page, id) =>
  (await stored(page)).records.find((item) => item.id === id).status;

async function seed(page, records) {
  await page.clock.setFixedTime(new Date("2026-11-11T09:00:00.000Z"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
}

async function openHistory(page) {
  await page.locator(".settings-trigger").click();
  const section = page.locator("#settings-dialog .settings-history");
  // Closed by default, like the hidden suggestions.
  await expect(section).not.toHaveAttribute("open", "");
  await section.locator("summary").click();
  return section;
}

test("any kept action can be undone alone from Settings, and that undo can be undone", async ({
  page,
}) => {
  await seed(
    page,
    ["Rapor hazırla", "Teklif karşılaştır", "Kalıp onayı"].map((title, index) =>
      createRecord({
        id: `r${index}`,
        title,
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
    ),
  );
  await page.locator('#nav [data-view="daily"]').click();
  for (const id of ["r0", "r1", "r2"])
    await page.locator(`tr[data-id="${id}"] .quick-complete`).click();
  await expect.poll(() => statusOf(page, "r2")).toBe("completed");

  const section = await openHistory(page);
  await expect(section.locator(".settings-hidden-count")).toHaveText("3");
  await expect(section.locator(".settings-hidden-title")).toHaveText([
    "1. Durum güncelleme",
    "2. Durum güncelleme",
    "3. Durum güncelleme",
  ]);
  await expect(section.locator("li small")).toHaveText([
    "Kalıp onayı",
    "Teklif karşılaştır",
    "Rapor hazırla",
  ]);

  // The oldest action goes back alone; the two later ones stay.
  await section.getByRole("button", { name: /^3\. işlemi geri al/ }).click();
  await expect.poll(() => statusOf(page, "r0")).toBe("planned");
  expect(await statusOf(page, "r1")).toBe("completed");
  expect(await statusOf(page, "r2")).toBe("completed");
  const refreshed = page.locator("#settings-dialog .settings-history");
  await expect(refreshed.locator(".settings-hidden-title").first()).toHaveText(
    "1. Geri alındı: Durum güncelleme",
  );
  await page.locator("#settings-dialog .modal-footer .btn.primary").click();

  // The revert is an ordinary step: the toolbar Undo brings it back.
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(() => statusOf(page, "r0")).toBe("completed");
});

test("an action whose record changed later asks before undoing down to it", async ({
  page,
}) => {
  await seed(page, [
    createRecord({
      id: "goal",
      type: "weekly",
      title: "Rapor hedefi",
      periodKey: "2026-W46",
      targetValue: 5,
      currentValue: 0,
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ]);
  await page.locator('#nav [data-view="weekly"]').click();
  const row = page.locator('tr[data-id="goal"]');
  await row.hover();
  const plus = row.getByRole("button", { name: /İlerlemeyi 1 artır/ });
  await plus.click();
  await plus.click();
  await expect(row.locator(".goal-progress-summary")).toHaveText("2 / 5");

  const section = await openHistory(page);
  await section.getByRole("button", { name: /^2\. işlemi geri al/ }).click();
  const confirm = page.locator(".app-confirm-dialog");
  await expect(confirm).toContainText(
    "“Rapor hedefi” bu işlemden sonra yeniden değişti.",
  );
  // Cancelling changes nothing.
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  expect(
    (await stored(page)).records.find((item) => item.id === "goal")
      .currentValue,
  ).toBe(2);
  await section.getByRole("button", { name: /^2\. işlemi geri al/ }).click();
  await confirm.getByRole("button", { name: "2 işlemi geri al" }).click();
  await expect
    .poll(
      async () =>
        (await stored(page)).records.find((item) => item.id === "goal")
          .currentValue,
    )
    .toBe(0);
  await expect(
    page.locator("#settings-dialog .settings-history .settings-hidden-empty"),
  ).toHaveText("Henüz geri alınabilecek işlem yok.");
});
