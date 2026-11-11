import { readWorkspaceDomainRaw } from "./work-session-support.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const MIGRATION_KEY = `${KEY}-waiting-state-migration`;
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE_REASON =
  '<img src=x onerror="window.waitingInjected=1"> Teknik yanıt bekleniyor.';

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const saved = (page) => readWorkspaceDomainRaw(page);
const form = (page) => page.locator("#record-form");
const detail = (page) => page.locator("#waiting-details-dialog");
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const list = (page) => page.locator('#nav [data-view="daily"]').click();
const dashboard = (page) =>
  page.locator('#nav [data-view="dashboard"]').click();
const closeEditor = (page) =>
  page.locator('#editor [data-action="close"]').last().click();

async function seed(page, records) {
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, migrationKey, records }) => {
      if (sessionStorage.getItem("waiting-state-seeded")) return;
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
      localStorage.removeItem(migrationKey);
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("waiting-state-seeded", "1");
    },
    { key: KEY, migrationKey: MIGRATION_KEY, records },
  );
  await page.goto("/");
  return records;
}

test("legacy daily blockers become one waiting status with their reasons intact and exact undo is respected after reload", async ({
  page,
}) => {
  const original = await seed(page, [
    record({
      id: "legacy-open",
      title: "Eski teknik yanıt bekleyen iş",
      status: "in_progress",
      blocked: true,
      blockReason: "Tasarım yanıtı bekleniyor.",
      nextAction: "Yanıt gelince ölçümü tamamla.",
      description: "Gerçek not korunur.",
      category: "Teknik",
      sourceFields: { "Özgün bilgi": "Saklanmalı" },
    }),
    record({
      id: "legacy-conflict",
      title: "Yeni bekleme nedeni zaten olan iş",
      status: "waiting",
      blocked: true,
      blockReason: "Özgün eski engel nedeni.",
      waitingReason: "Kullanıcının güncel bekleme nedeni.",
    }),
    record({
      id: "legacy-closed",
      title: "Eski engeli olan tamamlanmış iş",
      status: "completed",
      blocked: true,
      blockReason: "Geçmiş yanıt bilgisi.",
      nextAction: "Geçmiş sonraki adım.",
    }),
    record({
      id: "untouched-open",
      title: "Engeli olmayan açık iş",
      status: "in_progress",
      nextAction: "Çalışmaya devam et.",
    }),
    record({
      id: "foreign-legacy",
      type: "meeting",
      title: "Başka listeye ait eski alanlar",
      status: "waiting",
      blocked: true,
      blockReason: "Bu listeye dokunulmaz.",
    }),
  ]);
  const migrated = await readRecords(page);
  expect(migrated.map((item) => item.id)).toEqual(
    original.map((item) => item.id),
  );
  expect(migrated.find((item) => item.id === "legacy-open")).toMatchObject({
    status: "waiting",
    blocked: false,
    waitingReason: "Tasarım yanıtı bekleniyor.",
    blockReason: "Tasarım yanıtı bekleniyor.",
    nextAction: original[0].nextAction,
    description: original[0].description,
    category: original[0].category,
    createdAt: original[0].createdAt,
    updatedAt: original[0].updatedAt,
  });
  expect(migrated[0].sourceFields).toMatchObject(original[0].sourceFields);
  expect(migrated[0].sourceFields.__waitingStateMigration).toMatchObject({
    version: 1,
    originalStatus: "in_progress",
    originalBlocked: true,
    originalBlockReason: "Tasarım yanıtı bekleniyor.",
  });
  expect(migrated.find((item) => item.id === "legacy-conflict")).toMatchObject({
    status: "waiting",
    waitingReason: "Kullanıcının güncel bekleme nedeni.",
    blockReason: "Özgün eski engel nedeni.",
  });
  expect(migrated.find((item) => item.id === "legacy-closed")).toMatchObject({
    status: "completed",
    waitingReason: "Geçmiş yanıt bilgisi.",
    updatedAt: original[2].updatedAt,
  });
  expect(migrated.find((item) => item.id === "untouched-open")).toEqual(
    original[3],
  );
  expect(migrated.find((item) => item.id === "foreign-legacy")).toEqual(
    original[4],
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), MIGRATION_KEY),
  ).toBe("1");
  await expect(
    page.locator(".blocked-badge, #blocker-details-popover, [name=blocked]"),
  ).toHaveCount(0);
  await list(page);
  await row(page, "legacy-open").locator(".task-name").click();
  await expect(form(page).locator('[name="status"]')).toHaveValue("waiting");
  await expect(form(page).locator('[name="waitingReason"]')).toHaveValue(
    "Tasarım yanıtı bekleniyor.",
  );
  await closeEditor(page);
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
  await page.reload();
  expect(await readRecords(page)).toEqual(original);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), MIGRATION_KEY),
  ).toBe("1");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await page.locator('[data-action="migrate-waiting-state"]').click();
  expect(await readRecords(page)).toEqual(migrated);
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
});

test("waiting reason is conditional on the daily status and survives leaving that state or retyping without overwriting hidden values", async ({
  page,
}) => {
  const original = await seed(page, [
    record({
      id: "conditional",
      title: "Durumla kontrol edilen iş",
      status: "in_progress",
      nextAction: "İlk sonraki adım.",
      blockReason: "Yalnızca eski yedekte kalan neden.",
      waitingReason: "",
      description: "Gerçek not.",
      sourceFields: {
        Kaynak: "Korunur",
        __waitingStateMigration: {
          version: 1,
          originalStatus: "in_progress",
          originalBlocked: true,
          originalBlockReason: "Yalnızca eski yedekte kalan neden.",
        },
      },
    }),
  ]);
  await list(page);
  await row(page, "conditional").locator(".task-name").click();
  await openCreationExtras(page);
  await expect(form(page).locator('[name="blocked"]')).toHaveCount(0);
  await expect(form(page).locator('[name="waitingReason"]')).not.toBeVisible();
  await form(page).locator('[name="status"]').selectOption("waiting");
  await expect(form(page).locator('[name="waitingReason"]')).toBeVisible();
  await expect(form(page).locator('[name="waitingReason"]')).toHaveValue("");
  await form(page).locator('[name="waitingReason"]').fill(UNSAFE_REASON);
  await expect(form(page).locator('[name="nextAction"]')).toBeHidden();
  await expect(form(page).locator('[name="nextAction"]')).toBeDisabled();
  await expect(form(page).locator('[name="nextAction"]')).toHaveValue(
    original[0].nextAction,
  );
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const waiting = await readRecords(page);
  expect(waiting[0]).toMatchObject({
    status: "waiting",
    waitingReason: UNSAFE_REASON,
    nextAction: original[0].nextAction,
    blocked: false,
    sourceFields: original[0].sourceFields,
    description: original[0].description,
  });
  await row(page, "conditional").locator(".task-name").click();
  await openCreationExtras(page);
  await form(page).locator('[name="status"]').selectOption("planned");
  await expect(form(page).locator('[name="waitingReason"]')).not.toBeVisible();
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect((await readRecords(page))[0]).toMatchObject({
    status: "planned",
    waitingReason: UNSAFE_REASON,
    nextAction: waiting[0].nextAction,
  });
  await undo(page);
  expect(await readRecords(page)).toEqual(waiting);
  await row(page, "conditional").locator(".task-name").click();
  await openCreationExtras(page);
  await form(page)
    .locator('[name="waitingReason"]')
    .fill("Kaydedilmeyecek görünür taslak.");
  await form(page).locator('[name="type"]').selectOption("meeting");
  await expect(form(page).locator('[name="waitingReason"]')).toBeDisabled();
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect((await readRecords(page))[0]).toMatchObject({
    type: "meeting",
    waitingReason: UNSAFE_REASON,
    nextAction: waiting[0].nextAction,
  });
  await undo(page);
  expect(await readRecords(page)).toEqual(waiting);
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
  expect(await page.evaluate(() => window.waitingInjected)).toBeUndefined();
});

test("review suggestions use seven local calendar days, exclude closed work and the running session, and open records without writes", async ({
  page,
}) => {
  await seed(page, [
    record({
      id: "review-boundary",
      title: "Tam yedi günlük açık iş",
      updatedAt: "2026-10-31T20:30:00.000Z",
    }),
    record({
      id: "review-old",
      title: "Daha eski açık iş",
      updatedAt: "2026-10-20T09:00:00.000Z",
    }),
    record({
      id: "review-running",
      title: "Çalışmaya başlanacak eski iş",
      updatedAt: "2026-10-25T09:00:00.000Z",
    }),
    record({
      id: "review-local-recent",
      title: "Yerel tarihte altı günlük iş",
      updatedAt: "2026-10-31T21:30:00.000Z",
    }),
    record({
      id: "review-future",
      title: "Geleceğe tarihli iş",
      updatedAt: "2026-11-08T09:00:00.000Z",
    }),
    record({
      id: "review-closed",
      title: "Eski kapanmış iş",
      status: "completed",
      updatedAt: "2026-10-01T09:00:00.000Z",
    }),
    record({
      id: "review-weekly",
      type: "weekly",
      title: "Eski haftalık hedef",
      periodKey: "2026-W45",
      updatedAt: "2026-10-01T09:00:00.000Z",
    }),
    record({
      id: "review-topic",
      type: "waiting",
      title: "Eski bekleyen konu",
      updatedAt: "2026-10-01T09:00:00.000Z",
    }),
  ]);
  const before = await saved(page);
  const review = page.locator('.planning-prompt[data-prompt="review"]');
  await expect(review.locator(".planning-prompt-count")).toHaveText("3");
  await page
    .locator('.focus-row[data-id="review-running"] .work-start')
    .click();
  await expect(review.locator(".planning-prompt-count")).toHaveText("2");
  await review.click();
  const dialog = page.locator("#planning-prompts-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  expect(
    (
      await page
        .locator("#planning-prompts-dialog [data-prompt-record]")
        .evaluateAll((rows) => rows.map((row) => row.dataset.promptRecord))
    ).sort(),
  ).toEqual(["review-boundary", "review-old"]);
  expect(await saved(page)).toBe(before);
  await dialog
    .locator(
      '[data-prompt-record="review-boundary"] [data-action="planning-prompt-record"]',
    )
    .click();
  await expect(form(page).locator('[name="title"]')).toHaveValue(
    "Tam yedi günlük açık iş",
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
  await page.locator('[data-action="work-pause"]').click();
  await dashboard(page);
  // 1.3.0: a work just paused was worked on this week and stays out.
  await expect(review.locator(".planning-prompt-count")).toHaveText("2");
  expect(await saved(page)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("quick waiting status and its optional detail editor are separate reversible actions without a second blocker flag", async ({
  page,
}) => {
  const original = await seed(page, [
    record({
      id: "quick-wait",
      title: "Hızlı beklemeye alınacak iş",
      status: "in_progress",
      nextAction: "Önceki sonraki adım.",
      blockReason: "Eski, sonradan temizlenmiş neden.",
      waitingReason: "",
      description: "Genel not korunmalı.",
      sourceFields: {
        Özgün: "Kaynak",
        __waitingStateMigration: {
          version: 1,
          originalStatus: "in_progress",
          originalBlocked: true,
          originalBlockReason: "Eski, sonradan temizlenmiş neden.",
        },
      },
    }),
  ]);
  await list(page);
  await row(page, "quick-wait").locator(".status-trigger").click();
  await page
    .locator('#status-menu [data-action="set-status"][data-status="waiting"]')
    .click();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue("");
  await expect(detail(page).locator('[name="nextAction"]')).toHaveCount(0);
  const afterStatus = await readRecords(page);
  expect(afterStatus[0]).toMatchObject({
    status: "waiting",
    nextAction: original[0].nextAction,
    description: original[0].description,
  });
  await page.keyboard.press("Escape");
  expect(await readRecords(page)).toEqual(afterStatus);
  await row(page, "quick-wait").locator(".status-trigger").click();
  await page.locator('#status-menu [data-action="waiting-details"]').click();
  await detail(page).locator('[name="waitingReason"]').fill(UNSAFE_REASON);
  await detail(page).locator('button[type="submit"]').click();
  await expect(detail(page)).not.toBeVisible();
  const afterDetails = await readRecords(page);
  expect(afterDetails[0]).toMatchObject({
    status: "waiting",
    waitingReason: UNSAFE_REASON,
    nextAction: original[0].nextAction,
    sourceFields: original[0].sourceFields,
    description: original[0].description,
  });
  await expect(
    page.locator(".blocked-badge, #blocker-details-popover, [name=blocked]"),
  ).toHaveCount(0);
  await row(page, "quick-wait").locator(".status-trigger").click();
  await page.locator('#status-menu [data-action="waiting-details"]').click();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue(
    UNSAFE_REASON,
  );
  await expect(detail(page).locator("img, svg[onload]")).toHaveCount(0);
  expect(await page.evaluate(() => window.waitingInjected)).toBeUndefined();
  await detail(page).locator('[name="waitingReason"]').fill("");
  await detail(page).locator('button[type="submit"]').click();
  expect((await readRecords(page))[0]).toMatchObject({
    waitingReason: "",
    blockReason: original[0].blockReason,
  });
  await row(page, "quick-wait").locator(".status-trigger").click();
  await page.locator('#status-menu [data-action="waiting-details"]').click();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue("");
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await readRecords(page)).toEqual(afterDetails);
  await undo(page);
  expect(await readRecords(page)).toEqual(afterStatus);
  await undo(page);
  expect(await readRecords(page)).toEqual(original);
});
