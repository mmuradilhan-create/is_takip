import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { readAttentionCards } from "./attention-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-10-20T09:00:00.000Z";
const UNSAFE_TITLE =
  '<img src=x onerror="window.planningInjected=1"> Haftalık ölçüm hedefi';

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const envelope = (records) => ({
  version: 1,
  records,
  odak: {
    version: 1,
    preferences: { density: "comfortable" },
    history: [],
  },
});
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const goals = (page) => page.locator(".weekly-dashboard-panel");
const goalRows = (page) =>
  goals(page).locator(".dashboard-goal-row[data-goal-id]");
const goal = (page, id) =>
  goals(page).locator(`.dashboard-goal-row[data-goal-id="${id}"]`);
const attention = (page) => page.locator(".attention-panel");
const attentionRows = (page) =>
  attention(page).locator(".attention-list .followup-row[data-id]");
const dashboard = (page) =>
  page.locator('#nav [data-view="dashboard"]').click();

async function seed(page, records) {
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("dashboard-planning-seeded")) return;
      localStorage.setItem(key, value);
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("dashboard-planning-seeded", "1");
    },
    { key: KEY, value: JSON.stringify(envelope(records)) },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
}

function goalsFixture() {
  return [
    record({
      id: "plan-current-primary",
      type: "weekly",
      title: UNSAFE_TITLE,
      periodKey: "2026-W45",
      dueDate: "2026-11-04",
      priority: "urgent",
      status: "in_progress",
      targetValue: 10,
      currentValue: 2,
      metric: "Ölçüm",
      nextAction: "Sekiz ölçümü daha gözden geçir.",
      description: "Özgün hedef notu korunmalı.",
    }),
    record({
      id: "plan-current-second",
      type: "weekly",
      title: "İkinci haftalık hedef",
      periodKey: "2026-W45",
      dueDate: "2026-11-05",
      nextAction: "Tasarım dosyasını hazırla.",
    }),
    record({
      id: "plan-current-third",
      type: "weekly",
      title: "Üçüncü haftalık hedef",
      periodKey: "2026-W45",
      dueDate: "2026-11-06",
    }),
    record({
      id: "plan-current-fallback",
      type: "weekly",
      title: "Teslim tarihinden haftası bilinen hedef",
      dueDate: "2026-11-08",
    }),
    record({
      id: "plan-prior",
      type: "weekly",
      title: "Önceki haftadan kalan açık hedef",
      periodKey: "2026-W44",
      dueDate: "2026-11-07",
      status: "waiting",
    }),
    record({
      id: "plan-future",
      type: "weekly",
      title: "Gelecek haftaya ait hedef",
      periodKey: "2026-W46",
      dueDate: "2026-11-01",
    }),
    record({
      id: "plan-closed",
      type: "weekly",
      title: "Bu haftanın tamamlanmış hedefi",
      periodKey: "2026-W45",
      dueDate: "2026-11-02",
      status: "completed",
    }),
    record({
      id: "plan-archive",
      type: "weekly",
      title: "Eski aktarılan hedef kaydı",
      periodKey: "2026-W45",
      dueDate: "2026-11-02",
      status: "transferred",
    }),
    record({
      id: "plan-prior-closed",
      type: "weekly",
      title: "Önceki haftanın bitmiş hedefi",
      periodKey: "2026-W44",
      status: "completed",
    }),
    record({
      id: "plan-monthly",
      type: "monthly",
      title: "Aylık hedef haftalık kutuya karışmamalı",
      periodKey: "2026-11",
      dueDate: "2026-11-02",
    }),
    record({
      id: "plan-child-first",
      title: "Tamamlanmış ilk günlük destek işi",
      parentId: "plan-current-primary",
      status: "completed",
    }),
    record({
      id: "plan-child-second",
      title: "Tamamlanmış ikinci günlük destek işi",
      parentId: "plan-current-primary",
      status: "completed",
    }),
  ];
}

function attentionFixture() {
  return [
    record({
      id: "attention-linked-topic",
      type: "waiting",
      title: "Günlük takip adımı olsa da yanıtı beklenen konu",
      status: "waiting_response",
      nextFollowUpDate: "2026-11-04",
      sourceDate: "2026-10-01",
    }),
    record({
      id: "attention-contact-step",
      title: "Beklenen konuyu telefonla sor",
      status: "in_progress",
      sourceFields: {
        __followupSource: {
          recordId: "attention-linked-topic",
          type: "waiting",
        },
      },
    }),
    record({
      id: "attention-followup-overdue",
      type: "waiting",
      title: "Geciken teknik inceleme yanıtı",
      nextFollowUpDate: "2026-11-05",
      expectedFrom: "Tasarım ekibi",
      latestUpdate: "Teknik inceleme sonucu hazırlanıyor.",
      description: "Takip bağlamı korunur.",
    }),
    record({
      id: "attention-topic-overdue",
      type: "waiting",
      title: "Dünkü yanıtı tekrar takip et",
      nextFollowUpDate: "2026-11-06",
    }),
    record({
      id: "attention-followup-today",
      type: "waiting",
      title: "Bugünkü öncelikli yanıt takibi",
      nextFollowUpDate: "2026-11-07",
      priority: "high",
    }),
    record({
      id: "attention-topic-today",
      type: "waiting",
      title: "Bugün takip edilecek yanıt",
      nextFollowUpDate: "2026-11-07",
      priority: "low",
    }),
    record({
      id: "attention-followup-near",
      type: "waiting",
      title: "Üç takvim günü içindeki yanıt takibi",
      nextFollowUpDate: "2026-11-10",
    }),
    record({
      id: "attention-meeting-undated",
      type: "meeting",
      title: "Henüz tarihi seçilmemiş toplantı kararı",
    }),
    record({
      id: "attention-topic-unscheduled",
      type: "waiting",
      title: "Takip planı eksik dış konu",
    }),
    record({
      id: "attention-meeting-far",
      type: "meeting",
      title: "Dört gün sonraki toplantı kararı",
      dueDate: "2026-11-11",
    }),
    record({
      id: "attention-topic-future",
      type: "waiting",
      title: "Yarına planlı takip konusu",
      nextFollowUpDate: "2026-11-08",
    }),
    record({
      id: "attention-topic-near",
      type: "waiting",
      title: "Üç takvim günü içindeki dış yanıt",
      nextFollowUpDate: "2026-11-10",
      priority: "low",
    }),
    record({
      id: "attention-topic-far",
      type: "waiting",
      title: "Dört gün sonra takip edilecek yanıt",
      nextFollowUpDate: "2026-11-11",
    }),
    record({
      id: "attention-meeting-closed",
      type: "meeting",
      title: "Tamamlanmış eski toplantı kararı",
      status: "completed",
      dueDate: "2026-11-01",
    }),
    record({
      id: "attention-topic-closed",
      type: "waiting",
      title: "Kapanmış eski takip konusu",
      status: "completed",
      nextFollowUpDate: "2026-11-01",
    }),
    record({
      id: "attention-routed-meeting",
      type: "meeting",
      title: "Uygulama yeri belirlenmiş toplantı kararı",
      status: "in_progress",
      dueDate: "2026-11-03",
    }),
    record({
      id: "attention-routed-daily",
      title: "Kararın bağlı günlük uygulama işi",
      status: "in_progress",
      dueDate: "2026-11-03",
      sourceFields: {
        __followupSource: {
          recordId: "attention-routed-meeting",
          type: "meeting",
        },
      },
    }),
    record({
      id: "attention-routed-waiting-source",
      type: "meeting",
      title: "Dış yanıta aktarılmış toplantı kararı",
      status: "waiting",
      dueDate: "2026-11-02",
    }),
    record({
      id: "attention-routed-waiting",
      type: "waiting",
      title: "Kararın planlı dış yanıtı",
      status: "waiting_response",
      dueDate: "2026-11-02",
      nextFollowUpDate: "2026-11-12",
      sourceFields: {
        __followupSource: {
          recordId: "attention-routed-waiting-source",
          type: "meeting",
        },
      },
    }),
  ];
}

test("the dashboard previews two current goals with numeric progress while the full weekly plan retains every goal and older work stays separate", async ({
  page,
}) => {
  const fixture = goalsFixture();
  await seed(page, fixture);
  const before = await saved(page);
  expect(JSON.parse(before).records).toEqual(fixture);
  await expect(goals(page)).toBeVisible();
  await expect(goalRows(page)).toHaveCount(2);
  await expect(goals(page).locator(".dashboard-panel-count")).toHaveText("4");
  expect(
    await goalRows(page).evaluateAll((rows) =>
      rows.map((row) => row.dataset.goalId),
    ),
  ).toEqual(["plan-current-primary", "plan-current-second"]);
  await expect(goals(page).locator(".dashboard-goals-more")).toHaveCount(0);
  const weeklyBox = await goals(page).boundingBox();
  const calendarBox = await page.locator(".dashboard-calendar").boundingBox();
  await goalRows(page)
    .last()
    .evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
  // Row decoration can round at the scroll edge; the action remains fully visible.
  await expect(goalRows(page).last()).toBeInViewport({ ratio: 0.99 });
  const lastTitle = goal(page, "plan-current-second").locator(
    ".dashboard-goal-title",
  );
  await expect(lastTitle).toBeInViewport({ ratio: 1 });
  await expect(lastTitle).not.toHaveAttribute("data-action");
  const lastProgress = goal(page, "plan-current-second").locator(
    '[data-action="goal-progress-open"]',
  );
  await expect(lastProgress).toHaveText(/^(\d+ \/ \d+|%\d+|Ölçüm yok)$/);
  await lastProgress.click();
  const lastPanel = page.locator("#goal-detail-panel");
  await expect(lastPanel).toBeVisible();
  await expect(lastPanel.locator(".goal-panel-title")).toHaveText(
    fixture.find((record) => record.id === "plan-current-second").title,
  );
  await expect(
    lastPanel.locator('[data-action="goal-edit-record"]'),
  ).toHaveAttribute("data-id", "plan-current-second");
  await page.keyboard.press("Escape");
  await expect(lastPanel).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  expect(await goals(page).boundingBox()).toEqual(weeklyBox);
  expect(await page.locator(".dashboard-calendar").boundingBox()).toEqual(
    calendarBox,
  );
  await expect(goal(page, "plan-current-primary")).toBeVisible();
  await expect(goal(page, "plan-current-primary")).toContainText(UNSAFE_TITLE);
  // The İlerleme button shows the count; percent and unit are its tooltip.
  const primaryProgress = goal(page, "plan-current-primary").locator(
    '[data-action="goal-progress-open"]',
  );
  await expect(primaryProgress).toHaveText("2 / 10");
  await expect(primaryProgress).toHaveAttribute("data-progress", "20");
  await expect(primaryProgress).toHaveAttribute("title", "%20 · 2 / 10 Ölçüm");
  await expect(primaryProgress).toHaveAccessibleName(
    /ilerleme, %20 · 2 \/ 10 Ölçüm$/,
  );
  await expect(goal(page, "plan-current-primary")).not.toContainText(
    "Sekiz ölçümü daha gözden geçir.",
  );
  await expect(goals(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.planningInjected)).toBeUndefined();
  for (const id of [
    "plan-prior",
    "plan-future",
    "plan-closed",
    "plan-archive",
    "plan-prior-closed",
    "plan-monthly",
  ])
    await expect(goal(page, id)).toHaveCount(0);
  // Linked jobs are listed inside the goal opened from its card.
  await expect(
    goal(page, "plan-current-primary").locator(
      '[data-action="goal-children-open"]',
    ),
  ).toHaveCount(0);
  await goal(page, "plan-current-primary")
    .locator(".dashboard-goal-title")
    .click();
  const panel = page.locator("#goal-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  await expect(panel.locator(".goal-panel-summary")).toContainText(
    "2/2 tamamlandı",
  );
  await expect(panel.locator(".goal-child-row")).toHaveCount(2);
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  await goals(page)
    .locator('.panel-header [data-action="dashboard-weekly"]')
    .click();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  expect(
    (
      await page
        .locator(".full-table > tbody > tr[data-record-row]")
        .evaluateAll((rows) => rows.map((row) => row.dataset.id))
    ).sort(),
  ).toEqual([
    "plan-current-fallback",
    "plan-current-primary",
    "plan-current-second",
    "plan-current-third",
  ]);
  await page
    .locator('tr[data-record-row][data-id="plan-current-fallback"] .task-name')
    .click();
  await expect(panel.locator(".goal-panel-title")).toHaveText(
    fixture.find((record) => record.id === "plan-current-fallback").title,
  );
  await expect(
    panel.locator('[data-action="goal-edit-record"]'),
  ).toHaveAttribute("data-id", "plan-current-fallback");
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  await dashboard(page);
  await expect(goalRows(page)).toHaveCount(2);
  await expect(
    goals(page).locator('[data-action="dashboard-previous"]'),
  ).toHaveCount(0);
  const prior = page.locator(
    '.planning-prompts [data-action="planning-prompt"][data-prompt="previous"]',
  );
  await expect(prior).toContainText("1");
  await prior.click();
  const suggestions = page.locator("#planning-prompts-dialog");
  await expect(suggestions).toBeVisible();
  await expect(
    suggestions.locator(".planning-prompt-list [data-prompt-record]"),
  ).toHaveCount(1);
  await expect(
    suggestions.locator('[data-prompt-record="plan-prior"]'),
  ).toBeVisible();
  expect(await saved(page)).toBe(before);
  await suggestions
    .locator(
      '[data-prompt-record="plan-prior"] [data-action="planning-prompt-record"]',
    )
    .click();
  await expect(suggestions).not.toBeVisible();
  await expect(panel.locator(".goal-panel-title")).toHaveText(
    "Önceki haftadan kalan açık hedef",
  );
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
});

test("one paged attention panel reaches all dated overdue and near records, keeps independent waiting topics, and excludes undated context", async ({
  page,
}) => {
  const fixture = attentionFixture();
  await seed(page, fixture);
  const before = await saved(page);
  expect(JSON.parse(before).records).toEqual(fixture);
  await expect(attention(page)).toBeVisible();
  await expect(attention(page)).toContainText(/Takip gerekenler\s*8/);
  const columns = Number(
    await page
      .locator(".dashboard-workspace")
      .getAttribute("data-card-columns"),
  );
  expect(columns).toBe(2);
  expect(
    await page
      .locator(".attention-list")
      .evaluate(
        (list) => getComputedStyle(list).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(columns);
  await expect(attentionRows(page)).toHaveCount(2);
  expect((await readAttentionCards(page)).map((card) => card.id)).toEqual([
    "attention-linked-topic",
    "attention-followup-overdue",
    "attention-topic-overdue",
    "attention-followup-today",
    "attention-topic-today",
    "attention-topic-future",
    "attention-followup-near",
    "attention-topic-near",
  ]);
  await expect(
    page.locator(
      ".dashboard-workspace.dashboard-rows > .dashboard-bottom-row > .attention-panel",
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(".dashboard-workspace + .attention-panel"),
  ).toHaveCount(0);
  await expect(
    page.locator(".dashboard-followups .attention-panel"),
  ).toHaveCount(0);
  // Each card carries one tick box at the start of its title.
  await expect(
    attentionRows(page).locator(".followup-title-line > .quick-complete"),
  ).toHaveCount(2);
  await expect(attentionRows(page).locator(".status-trigger")).toHaveCount(2);
  const followupDates = attentionRows(page).locator(
    '[data-action="edit-next-followup"]',
  );
  await expect(followupDates).toHaveCount(2);
  for (const date of await followupDates.all())
    await expect(date).toBeEnabled();
  for (const id of [
    "attention-meeting-undated",
    "attention-topic-unscheduled",
    "attention-meeting-far",
    "attention-topic-far",
    "attention-meeting-closed",
    "attention-topic-closed",
    "attention-routed-meeting",
    "attention-routed-waiting-source",
    "attention-routed-waiting",
  ])
    await expect(
      attention(page).locator(`.followup-row[data-id="${id}"]`),
    ).toHaveCount(0);
  await expect(
    page.locator(
      '.dashboard-followups [data-overview="meeting"], .dashboard-followups [data-overview="waiting"]',
    ),
  ).toHaveCount(0);
  const source = fixture.find(
    (item) => item.id === "attention-followup-overdue",
  );
  await attention(page)
    .locator('.followup-row[data-id="attention-followup-overdue"]')
    .getByRole("button", { name: source.title, exact: true })
    .click();
  const preview = page.locator("#waiting-record-panel");
  await expect(preview).toHaveAttribute("data-record-id", source.id);
  await preview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    source.title,
  );
  await expect(page.locator('#record-form [name="expectedFrom"]')).toHaveValue(
    source.expectedFrom,
  );
  await expect(page.locator('#record-form [name="latestUpdate"]')).toHaveValue(
    source.latestUpdate,
  );
  await page.locator('#editor [data-action="close"]').last().click();
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  const emptyFixture = fixture.filter((item) =>
    [
      "attention-meeting-far",
      "attention-topic-far",
      "attention-meeting-undated",
      "attention-topic-unscheduled",
      "attention-meeting-closed",
      "attention-topic-closed",
      "attention-routed-meeting",
      "attention-routed-daily",
      "attention-routed-waiting-source",
      "attention-routed-waiting",
    ].includes(item.id),
  );
  const emptySaved = JSON.stringify(envelope(emptyFixture));
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: KEY,
    value: emptySaved,
  });
  await page.reload();
  await expect(attention(page)).toHaveCount(1);
  await expect(attention(page).locator(".followup-empty")).toHaveText(
    "Yaklaşan takip yok.",
  );
  await expect(
    attention(page).locator(
      '.followup-header [data-action="open-list"][data-view="waiting"]',
    ),
  ).toBeVisible();
  await expect(attentionRows(page)).toHaveCount(0);
  await expect(
    page.locator(
      '.dashboard-followups [data-overview="meeting"], .dashboard-followups [data-overview="waiting"]',
    ),
  ).toHaveCount(0);
  expect(await saved(page)).toBe(emptySaved);
});
