import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE_REASON =
  '<img src=x onerror="window.waitingInfoInjected=1"> Tasarım yanıtı bekleniyor.';
const NEXT = "Yanıt gelince teknik kontrolü tamamla.";

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const popup = (page) => page.locator("#waiting-info-popover");
const detail = (page) => page.locator("#waiting-details-dialog");
const focusButton = (page, id = "waiting-info-primary") =>
  page.locator(`.focus-row[data-id="${id}"] .waiting-info-trigger`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

function fixture() {
  return [
    record({
      id: "waiting-info-goal",
      type: "weekly",
      title: "Bekleyen günlük adımların hedefi",
      periodKey: "2026-W45",
    }),
    record({
      id: "waiting-info-primary",
      title: "Teknik yanıtı bekleyen günlük iş",
      status: "waiting",
      waitingReason: UNSAFE_REASON,
      nextAction: NEXT,
      parentId: "waiting-info-goal",
      description: "Genel not bu küçük bilgi penceresine taşınmamalı.",
      sourceFields: { "Özgün bilgi": "Korunur" },
    }),
    record({
      id: "waiting-info-empty",
      title: "Henüz nedeni girilmemiş bekleyen iş",
      status: "waiting",
      waitingReason: "",
      blockReason: "Eski alan açıkça boşaltılmış nedenin yerine geçmemeli.",
      nextAction: "",
    }),
    record({
      id: "waiting-info-active",
      title: "Çalışılabilir günlük iş",
      status: "in_progress",
      waitingReason: "Eski bekleme bilgisi korunur ama simge gösterilmez.",
    }),
    record({
      id: "waiting-info-closed",
      title: "Tamamlanmış günlük iş",
      status: "completed",
      waitingReason: "Geçmiş neden.",
    }),
    record({
      id: "waiting-info-meeting",
      title: "Beklemedeki toplantı aksiyonu",
      type: "meeting",
      status: "waiting",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("waiting-info-seeded")) return;
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
      localStorage.removeItem(`${key}-work-session`);
      localStorage.setItem(`${key}-waiting-state-migration`, "1");
      sessionStorage.setItem("waiting-info-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

test("waiting symbols preview context on hover in daily work surfaces without opening forms or changing records", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await expect(page.locator(".focus-row .waiting-info-trigger")).toHaveCount(2);
  await expect(
    page.locator(
      '.focus-row[data-id="waiting-info-active"] .waiting-info-trigger',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-overview="meeting"] .waiting-info-trigger'),
  ).toHaveCount(0);

  const control = focusButton(page);
  await control.hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).locator(".waiting-info-heading strong")).toHaveText(
    "Bekleme bilgisi",
  );
  await expect(popup(page)).not.toContainText(
    "Teknik yanıtı bekleyen günlük iş",
  );
  await expect(popup(page).locator("#waiting-info-reason")).toHaveText(
    UNSAFE_REASON,
  );
  await expect(popup(page).locator(".waiting-info-next")).toHaveCount(0);
  await expect(popup(page)).not.toContainText(NEXT);
  await expect(popup(page)).not.toContainText("Genel not");
  await expect(popup(page).locator("img, svg[onload]")).toHaveCount(0);
  expect(await page.evaluate(() => window.waitingInfoInjected)).toBeUndefined();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail(page)).not.toBeVisible();
  await popup(page)
    .getByRole("button", { name: "Düzenle", exact: true })
    .hover();
  await page.clock.runFor(200);
  await expect(popup(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(150);
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toHaveAttribute("aria-expanded", "false");

  await page.locator('#nav [data-view="daily"]').click();
  const row = page
    .locator('.full-table [data-id="waiting-info-primary"]')
    .first();
  await row.locator(".waiting-info-trigger").hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await page.locator('#nav [data-view="weekly"]').click();
  await page
    .locator(
      '.weekly-goal-row[data-id="waiting-info-goal"] [data-action="goal-details"]',
    )
    .click();
  const child = page.locator(
    '#goal-detail-panel .goal-child-row[data-id="waiting-info-primary"]',
  );
  await child.locator(".waiting-info-trigger").hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("click and keyboard activation open the waiting editor directly while previews and cancelled drafts keep records intact", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  const control = focusButton(page);
  await control.focus();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  await control.click();
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue(
    UNSAFE_REASON,
  );
  await expect(detail(page).locator('[name="nextAction"]')).toHaveCount(0);
  await detail(page)
    .locator('[name="waitingReason"]')
    .fill("Kaydedilmeyen taslak.");
  await detail(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(detail(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);

  const empty = focusButton(page, "waiting-info-empty");
  await empty.focus();
  await page.clock.runFor(180);
  await expect(empty).toBeFocused();
  await expect(popup(page).locator("#waiting-info-reason")).toHaveText(
    "Bekleme nedeni eklenmedi.",
  );
  await expect(popup(page).locator(".waiting-info-next")).toHaveCount(0);
  await empty.press("Space");
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue("");
  await detail(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(detail(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);

  await control.focus();
  await control.press("Enter");
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue(
    UNSAFE_REASON,
  );
  await detail(page)
    .locator('[name="waitingReason"]')
    .fill("Ölçüm sonucu bekleniyor.");
  await detail(page).locator('button[type="submit"]').click();
  await expect(detail(page)).not.toBeVisible();
  const edited = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).records,
    KEY,
  );
  expect(
    edited.find((item) => item.id === "waiting-info-primary"),
  ).toMatchObject({
    status: "waiting",
    waitingReason: "Ölçüm sonucu bekleniyor.",
    nextAction: original[1].nextAction,
    description: original[1].description,
    sourceFields: original[1].sourceFields,
  });
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(before);
});

test("long waiting context stays inside a short modal viewport and Escape closes only the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 });
  const records = fixture();
  records[1] = record({
    ...records[1],
    title: "Uzun başlık ".repeat(16),
    waitingReason: "Teknik bir açıklama bekleniyor. ".repeat(25),
    nextAction: "Yanıt geldiğinde kontrol edilecek ayrıntılar. ".repeat(70),
  });
  await seed(page, records);
  const before = await saved(page);
  await page
    .locator('.focus-row[data-id="waiting-info-primary"] .focus-title')
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.evaluate(() => {
    const source = document.querySelector(
      '.focus-row[data-id="waiting-info-primary"] .waiting-info-trigger',
    );
    const control = source.cloneNode(true);
    control.id = "modal-waiting-info-test";
    Object.assign(control.style, {
      position: "fixed",
      right: "10px",
      bottom: "10px",
      zIndex: "1",
    });
    document.querySelector("#editor .modal-body").append(control);
  });
  const control = page.locator("#modal-waiting-info-test");
  await control.hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  expect(await popup(page).evaluate((node) => node.parentElement.id)).toBe(
    "editor",
  );
  const bounds = await popup(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.y).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(893);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(473);
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(control).toBeFocused();
  expect(await saved(page)).toBe(before);
});
