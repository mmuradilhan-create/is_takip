import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-12T09:00:00.000Z");
const STAMP = "2026-11-01T08:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const record = async (page, id) =>
  (await stored(page)).records.find((item) => item.id === id);
const prompt = (page) => page.locator("#outcome-prompt");

async function seed(page) {
  const records = [
    make({ id: "job", title: "Eski taslağı düzenle" }),
    make({ id: "plain", title: "Tamamlanacak iş" }),
    make({
      id: "topic",
      type: "waiting",
      title: "Kalıp onayı",
      status: "waiting_response",
      expectedFrom: "Tedarikçi",
      sourceDate: "2026-11-01",
      nextFollowUpDate: "2026-11-12",
      latestUpdate: "Numune gönderildi",
    }),
    make({
      id: "quiet",
      type: "waiting",
      title: "Fiyat teyidi",
      status: "waiting_response",
      expectedFrom: "Satın alma",
      sourceDate: "2026-11-01",
      nextFollowUpDate: "2026-11-12",
    }),
    make({
      id: "goal",
      type: "weekly",
      title: "Rapor hedefi",
      periodKey: "2026-W46",
    }),
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: KEY, value: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
}

test("completing a job asks nothing; cancelling asks an optional reason that shows on the record", async ({
  page,
}) => {
  await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  const rowOf = (id) => page.locator(`.full-table tr[data-id="${id}"]`);
  // Tamamla stays a single click.
  await rowOf("plain").locator(".quick-complete").click();
  await expect(prompt(page)).toBeHidden();
  expect((await record(page, "plain")).status).toBe("completed");

  // Escape backs out: nothing changes and focus returns to the status box.
  const status = rowOf("job").locator('[data-action="status-menu"]');
  await status.click();
  await page.locator('#status-menu [data-status="cancelled"]').click();
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page).locator("label")).toHaveText("Neden?");
  await expect(prompt(page).locator(".outcome-prompt-confirm")).toHaveText(
    "İptal et",
  );
  await expect(prompt(page).locator("input")).toBeFocused();
  // It opens right under the status box it came from.
  const [anchor, box] = await Promise.all([
    status.boundingBox(),
    prompt(page).boundingBox(),
  ]);
  expect(box.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
  expect(box.y).toBeLessThanOrEqual(anchor.y + anchor.height + 10);
  await page.keyboard.press("Escape");
  await expect(prompt(page)).toBeHidden();
  expect((await record(page, "job")).status).toBe("planned");
  await expect(status).toBeFocused();

  // A reason is kept with the cancellation and shown on the status box.
  await status.click();
  await page.locator('#status-menu [data-status="cancelled"]').click();
  await prompt(page).locator("input").fill("Müşteri vazgeçti");
  await page.keyboard.press("Enter");
  await expect(prompt(page)).toBeHidden();
  const cancelled = await record(page, "job");
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.cancelReason).toBe("Müşteri vazgeçti");
  await page.locator('.list-scope-tabs [data-scope="all"]').click();
  await expect(rowOf("job").locator(".status-trigger")).toHaveAttribute(
    "title",
    /^İptal nedeni: Müşteri vazgeçti\nDurumu değiştir$/,
  );
  // One undo step takes back status and reason together.
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  const undone = await record(page, "job");
  expect(undone.status).toBe("planned");
  expect(Object.hasOwn(undone, "cancelReason")).toBe(false);

  // A click elsewhere backs out too; an empty Enter cancels without a reason.
  await page.locator('.list-scope-tabs [data-scope="open"]').click();
  await rowOf("job").locator('[data-action="status-menu"]').click();
  await page.locator('#status-menu [data-status="cancelled"]').click();
  await page.locator("#page-title").click();
  await expect(prompt(page)).toBeHidden();
  expect((await record(page, "job")).status).toBe("planned");
  await rowOf("job").locator('[data-action="status-menu"]').click();
  await page.locator('#status-menu [data-status="cancelled"]').click();
  await page.keyboard.press("Enter");
  const silent = await record(page, "job");
  expect(silent.status).toBe("cancelled");
  expect(Object.hasOwn(silent, "cancelReason")).toBe(false);
});

test("closing a waiting topic asks what happened; the answer becomes its latest update and last follow-up", async ({
  page,
}) => {
  await seed(page);
  await page.locator('#nav [data-view="waiting"]').click();
  const rowOf = (id) => page.locator(`.waiting-table tr[data-id="${id}"]`);
  await rowOf("topic").locator(".quick-complete").click();
  await expect(prompt(page).locator("label")).toHaveText("Ne oldu?");
  await expect(prompt(page).locator(".outcome-prompt-confirm")).toHaveText(
    "Konuyu kapat",
  );
  await prompt(page).locator("input").fill("Onay geldi, sipariş verildi");
  await prompt(page).locator(".outcome-prompt-confirm").click();
  const closed = await record(page, "topic");
  expect(closed.status).toBe("completed");
  expect(closed.latestUpdate).toBe("Kapandı: Onay geldi, sipariş verildi");
  expect(closed.lastFollowUpDate).toBe("2026-11-12");
  expect(closed.followUpLog).toHaveLength(1);
  expect(closed.followUpLog[0]).toMatchObject({
    date: "2026-11-12",
    note: "Kapandı: Onay geldi, sipariş verildi",
    previousUpdate: "Numune gönderildi",
  });
  const history = (await stored(page)).odak.history;
  expect(history.at(-1).label).toBe("Durum güncelleme");
  expect(history).toHaveLength(1);

  // Closing without an answer leaves the history untouched.
  await rowOf("quiet").locator(".quick-complete").click();
  await page.keyboard.press("Enter");
  const quiet = await record(page, "quiet");
  expect(quiet.status).toBe("completed");
  expect(Object.hasOwn(quiet, "followUpLog")).toBe(false);
  expect(quiet.latestUpdate ?? "").toBe("");
});

test("a cancelled goal shows its reason in its panel, and reopening it drops the reason", async ({
  page,
}) => {
  await seed(page);
  await page.locator('#nav [data-view="weekly"]').click();
  const row = page.locator('.full-table tr[data-id="goal"]');
  await row.locator('[data-action="status-menu"]').click();
  await page.locator('#status-menu [data-status="cancelled"]').click();
  await prompt(page).locator("input").fill("Öncelik değişti");
  await page.keyboard.press("Enter");
  await page.locator('.list-scope-tabs [data-scope="all"]').click();
  await row.locator(".task-name").click();
  await expect(
    page.locator("#goal-detail-panel .goal-panel-cancel-reason"),
  ).toHaveText("İptal nedeni: Öncelik değişti");
  await page.keyboard.press("Escape");
  await row.locator('[data-action="status-menu"]').click();
  await page.locator('#status-menu [data-status="planned"]').click();
  await expect(prompt(page)).toBeHidden();
  const reopened = await record(page, "goal");
  expect(reopened.status).toBe("planned");
  expect(Object.hasOwn(reopened, "cancelReason")).toBe(false);
});
