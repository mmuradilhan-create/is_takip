import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const card = (page, id = "goal-current") =>
  page.locator(`.dashboard-goal-row[data-goal-id="${id}"]`);
const panel = (page) => page.locator("#goal-detail-panel");
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  return [
    ...["yearly", "monthly", "weekly"].map((type) =>
      make({
        id: `legacy-${type}`,
        type,
        title: `Eski bekleyen ${type} hedefi`,
        status: "waiting",
        periodKey: { yearly: "2026", monthly: "2026-11", weekly: "2026-W45" }[
          type
        ],
        goalParentId:
          { monthly: "legacy-yearly", weekly: "legacy-monthly" }[type] || "",
        dueDate: type === "yearly" ? "2026-11-30" : "2026-11-14",
        currentValue: 2,
        targetValue: 5,
        metric: "Rapor",
        nextAction: "Hedefin isteğe bağlı gerçek sonraki adımı.",
        description: "Özgün hedef açıklaması.",
        sourceFields: { original: { value: "Ham hedef alanları korunmalı" } },
      }),
    ),
    make({
      id: "goal-current",
      type: "weekly",
      title: "İki açık eylemi olan haftalık hedef",
      periodKey: "2026-W45",
      currentValue: 2,
      targetValue: 8,
      metric: "Rapor",
      nextAction: "Hedefte sıradaki gerçek adım.",
    }),
    make({
      id: "goal-child",
      title: "Hedefe bağlı günlük iş",
      parentId: "goal-current",
      dueDate: "2026-11-12",
    }),
    make({
      id: "daily-old-next",
      title: "Eski adımı ve günlüğü korunan günlük iş",
      workContext: "ad_hoc",
      nextAction: "Gizlenecek eski günlük sonraki adım.",
      description: "Gerçek günlük notu.",
      sourceFields: { original: { value: "Kaynak günlük bilgisi" } },
      workLog: [
        {
          id: "next-old-log",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 60_000,
          note: "Gerçek eski sonuç.",
          nextAction: "İş günlüğündeki tarihsel sonraki adım korunur.",
        },
      ],
    }),
    make({
      id: "daily-waiting",
      title: "Nedeni eksik günlük bekleme",
      workContext: "ad_hoc",
      status: "waiting",
      waitingReason: "",
      nextAction: "Gizlenecek eski bekleme adımı.",
      description: "Gerçek bekleme notu.",
    }),
    make({
      id: "daily-reason-complete",
      title: "Yalnız nedeni dolu bekleyen günlük iş",
      status: "waiting",
      waitingReason: "Dış tasarım yanıtı bekleniyor.",
      nextAction: "",
    }),
    make({
      id: "topic-incomplete",
      type: "waiting",
      title: "Kişisi ve gelişmesi eksik dış yanıt",
      nextAction: "Gizlenecek eski dış takip adımı.",
      sourceDate: "2026-11-01",
      dueDate: "2026-11-20",
      lastFollowUpDate: "2026-11-03",
      nextFollowUpDate: "2026-11-14",
      followUpLog: [
        {
          id: "topic-old-log",
          date: "2026-11-03",
          note: "Gerçek tarihsel takip.",
          nextFollowUpDate: "2026-11-14",
        },
      ],
      sourceFields: { original: { value: "Ham takip alanları korunmalı" } },
    }),
    make({
      id: "topic-complete",
      type: "waiting",
      title: "Kişisi ve gelişmesi tamam dış yanıt",
      expectedFrom: "Üretim",
      latestUpdate: "Yanıt istendi.",
      nextAction: "",
    }),
  ];
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("next-step-goals-0216-seeded")) return;
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
      sessionStorage.setItem("next-step-goals-0216-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function saveEditor(page) {
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

test("daily and external waiting forms hide general next steps while preserving existing text, source data and journals through editing and type drafts", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const [type, id] of [
    ["daily", "daily-old-next"],
    ["waiting", "topic-incomplete"],
  ]) {
    await view(page, type);
    await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
    await openCreationExtras(page);
    await expect(field(page, "nextAction")).not.toBeVisible();
    await closeEditor(page);
    expect(await saved(page)).toBe(before);
    const original = items.find((item) => item.id === id);
    await row(page, id).locator(".task-name").click();
    await openCreationExtras(page);
    await expect(field(page, "nextAction")).not.toBeVisible();
    await expect(field(page, "nextAction")).toBeDisabled();
    await expect(field(page, "nextAction")).toHaveValue(original.nextAction);
    await field(page, "title").fill(`${original.title} düzeltildi`);
    await saveEditor(page);
    expect((await stored(page)).records.find((item) => item.id === id)).toEqual(
      {
        ...original,
        title: `${original.title} düzeltildi`,
        updatedAt: NOW.toISOString(),
      },
    );
    await page.reload();
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await view(page, "daily");
  await row(page, "daily-old-next").locator(".task-name").click();
  await openCreationExtras(page);
  await form(page).locator('select[name="type"]').selectOption("weekly");
  await expect(field(page, "nextAction")).toBeHidden();
  await expect(field(page, "nextAction")).toBeDisabled();
  await expect(field(page, "nextAction")).toHaveValue(
    items.find((item) => item.id === "daily-old-next").nextAction,
  );
  await expect(field(page, "variance")).toBeHidden();
  await expect(field(page, "variance")).toBeDisabled();
  await expect(field(page, "variance")).toHaveValue(
    items.find((item) => item.id === "daily-old-next").variance,
  );
  await field(page, "description").fill("Kaydedilmeyen hedef notu taslağı.");
  await form(page).locator('select[name="type"]').selectOption("daily");
  await expect(field(page, "nextAction")).not.toBeVisible();
  await expect(field(page, "nextAction")).toBeDisabled();
  await expect(field(page, "nextAction")).toHaveValue(
    items.find((item) => item.id === "daily-old-next").nextAction,
  );
  await expect(field(page, "description")).toHaveValue(
    "Kaydedilmeyen hedef notu taslağı.",
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
});

test("a daily waiting reason alone resolves its suggestion and its popup never exposes or rewrites the old next step", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  const prompt = page.locator('.planning-prompt[data-prompt="waiting"]');
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("2");
  await prompt.click();
  const prompts = page.locator("#planning-prompts-dialog");
  expect(
    await prompts
      .locator("[data-prompt-record]")
      .evaluateAll((elements) =>
        elements.map((element) => element.dataset.promptRecord).sort(),
      ),
  ).toEqual(["daily-waiting", "topic-incomplete"]);
  await prompts
    .locator(
      '[data-prompt-record="daily-waiting"] [data-action="planning-prompt-record"]',
    )
    .click();
  const details = page.locator("#waiting-details-dialog");
  await expect(details).toBeVisible();
  await expect(details.locator('[name="nextAction"]')).toHaveCount(0);
  await details
    .locator('[name="waitingReason"]')
    .fill("Teknik yanıt bekleniyor.");
  await details
    .getByRole("button", { name: "Bekleme bilgisini kaydet", exact: true })
    .click();
  await expect(details).not.toBeVisible();
  await expect(prompt.locator(".planning-prompt-count")).toHaveText("1");
  const original = items.find((item) => item.id === "daily-waiting");
  expect(
    (await stored(page)).records.find((item) => item.id === original.id),
  ).toEqual({
    ...original,
    waitingReason: "Teknik yanıt bekleniyor.",
    updatedAt: NOW.toISOString(),
  });
  await view(page, "daily");
  await row(page, original.id).locator('[data-action="waiting-info"]').hover();
  const popup = page.locator("#waiting-info-popover");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Teknik yanıt bekleniyor.");
  await expect(popup).not.toContainText(original.nextAction);
  await expect(popup.locator(".waiting-info-next")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("goal waiting is unavailable for new choices while all legacy goal statuses survive unrelated edits, backup and Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const type of ["weekly", "monthly", "yearly"]) {
    const id = `legacy-${type}`;
    const original = items.find((item) => item.id === id);
    await view(page, type);
    await expect(
      page.locator('#status-filter option[value="waiting"]'),
    ).toHaveCount(1);
    await page.locator("#status-filter").selectOption("waiting");
    await expect(page.locator(".full-table tr[data-record-row]")).toHaveCount(
      1,
    );
    await expect(row(page, id)).toBeVisible();
    await page.locator("#status-filter").selectOption("all");
    await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
    await openCreationExtras(page);
    await expect(
      field(page, "status").locator('option[value="waiting"]:enabled'),
    ).toHaveCount(0);
    await closeEditor(page);
    await row(page, id).locator('[data-action="status-menu"]').click();
    await expect(
      page.locator('#status-menu [data-status="waiting"]'),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await row(page, id).locator(".goal-edit-trigger").click();
    await expect(field(page, "status")).toHaveValue("waiting");
    const legacyOption = field(page, "status").locator(
      'option[value="waiting"]',
    );
    await expect(legacyOption).toHaveAttribute("disabled", "");
    expect(await legacyOption.evaluate((option) => option.disabled)).toBe(true);
    expect(await saved(page)).toBe(before);
    await field(page, "title").fill(`${original.title} düzeltildi`);
    await saveEditor(page);
    expect((await stored(page)).records.find((item) => item.id === id)).toEqual(
      {
        ...original,
        title: `${original.title} düzeltildi`,
        updatedAt: NOW.toISOString(),
      },
    );
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await page.reload();
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="backup-records"]').click(),
  ]);
  expect(
    JSON.parse(await readFile(await download.path(), "utf8")).records,
  ).toEqual(items);
  await page
    .locator("#settings-dialog")
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
  await view(page, "weekly");
  await row(page, "legacy-weekly").locator(".goal-edit-trigger").click();
  await field(page, "status").selectOption("in_progress");
  await expect(
    field(page, "status").locator('option[value="waiting"]:enabled'),
  ).toHaveCount(0);
  await saveEditor(page);
  expect(
    (await stored(page)).records.find((item) => item.id === "legacy-weekly")
      .status,
  ).toBe("in_progress");
  await row(page, "legacy-weekly").locator(".goal-edit-trigger").click();
  await expect(
    field(page, "status").locator('option[value="waiting"]:enabled'),
  ).toHaveCount(0);
  await closeEditor(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("the two goal actions navigate to their exact sections and preserve metric drafts and legacy fields while the child workflow stays explicit", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  const progress = card(page).locator('[data-action="goal-progress-open"]');
  const children = card(page).locator('[data-action="goal-children-open"]');
  await expect(progress).toHaveText("İlerleme");
  await expect(children).toContainText("Bağlı işler");
  expect(
    await card(page)
      .locator(".dashboard-goal-title")
      .evaluate((element) => element.tagName),
  ).not.toBe("BUTTON");
  await progress.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator("#goal-progress-current")).toBeFocused();
  await expect(panel(page).locator("#goal-progress-current")).toBeInViewport();
  await panel(page).locator("#goal-progress-current").fill("6");
  await expect(
    panel(page).locator("#goal-next-action, #goal-next-step-form"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await children.focus();
  await page.keyboard.press("Space");
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).locator(
      '.goal-child-row[data-id="goal-child"] .goal-child-title',
    ),
  ).toBeFocused();
  await expect(
    panel(page).locator(
      '.goal-child-row[data-id="goal-child"] .goal-child-title',
    ),
  ).toBeInViewport();
  await expect(panel(page).locator("#goal-progress-current")).toHaveValue("6");
  expect(await saved(page)).toBe(before);
  await panel(page)
    .getByRole("button", { name: "Yeni adım ekle", exact: true })
    .click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(field(page, "type")).toHaveValue("daily");
  await expect(field(page, "parentId")).toHaveValue("goal-current");
  const original = items.find((item) => item.id === "goal-current");
  expect(
    (await stored(page)).records.find((item) => item.id === original.id),
  ).toEqual(original);
  await closeEditor(page);
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
});

test("compact goal cards keep both labelled actions inside their bounds and keyboard navigation works without a numeric measurement or children", async ({
  page,
}) => {
  const title = `${"Uzun hedef başlığı ".repeat(15)}<img src=x onerror="window.goalActionsInjected=1">`;
  await seed(page, [
    make({
      id: "goal-plain",
      type: "weekly",
      title,
      periodKey: "2026-W45",
      nextAction: "İsteğe bağlı hedef adımı korunmalı.",
    }),
  ]);
  const before = await saved(page);
  for (const viewport of [
    { width: 1100, height: 640 },
    { width: 1280, height: 720 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const goal = card(page, "goal-plain");
    await expect(goal.getByRole("button")).toHaveText([
      "İlerleme",
      "Bağlı işler",
    ]);
    await expect(goal.locator("img")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.goalActionsInjected),
    ).toBeUndefined();
    const bounds = await goal.boundingBox();
    for (const action of await goal.getByRole("button").all()) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(
        bounds.x + bounds.width + 1,
      );
      expect(box.y).toBeGreaterThanOrEqual(bounds.y);
      expect(box.y + box.height).toBeLessThanOrEqual(
        bounds.y + bounds.height + 1,
      );
      expect(
        await action.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
    }
    await goal.locator('[data-action="goal-progress-open"]').focus();
    await page.keyboard.press("Enter");
    await expect(
      panel(page).locator('[data-goal-section-heading="progress"]'),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await goal.locator('[data-action="goal-children-open"]').focus();
    await page.keyboard.press("Enter");
    await expect(
      panel(page).locator('[data-goal-section-heading="children"]'),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    expect(await saved(page)).toBe(before);
  }
});
