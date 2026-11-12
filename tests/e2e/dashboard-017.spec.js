import { readWorkspaceDomainRaw } from "./work-session-support.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const SESSION_KEY = `${KEY}-work-session`;
const NOW = new Date("2026-11-07T12:00:00.000Z");
const NEXT_DAY = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
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
const saved = (page) => readWorkspaceDomainRaw(page);
const records = async (page) => JSON.parse(await saved(page)).records;
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const goalPanel = (page) => page.locator("#goal-detail-panel");
const weekly = (page) => page.locator(".weekly-dashboard-panel");
const focusRow = (page, id) => page.locator(`.focus-row[data-id="${id}"]`);
const focusButton = (page, id) =>
  focusRow(page, id).locator('[data-action="toggle-day-focus"]');
const focusFilter = (page, filter) =>
  page.locator(`.focus-filters [data-filter="${filter}"]`);
const focusIds = (page) =>
  page
    .locator(".focus-row[data-id]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const reviewDialog = (page) => page.locator("#goal-links-review-dialog");
const reviewRow = (page, id) =>
  reviewDialog(page).locator(`[data-review-record="${id}"]`);

async function seed(page, items) {
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, sessionKey, value }) => {
      if (sessionStorage.getItem("dashboard-017-seeded")) return;
      localStorage.setItem(key, value);
      localStorage.removeItem(sessionKey);
      sessionStorage.setItem("dashboard-017-seeded", "1");
    },
    {
      key: KEY,
      sessionKey: SESSION_KEY,
      value: JSON.stringify(envelope(items)),
    },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
}

async function secondWindow(context) {
  const page = await context.newPage();
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  return page;
}

function dailyFixture() {
  return [
    record({
      id: "focus-week",
      type: "weekly",
      title: "Odak işlerinin haftalık hedefi",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "focus-alpha",
      title: "Alfa bugün teslim",
      dueDate: "2026-11-07",
      parentId: "focus-week",
      status: "in_progress",
      priority: "high",
      nextAction: "Ölçümü gözden geçir.",
      workLog: [
        {
          id: "focus-saved-log",
          date: "2026-11-06",
          endedAt: "2026-11-06T09:00:00.000Z",
          durationMs: 60_000,
          note: "Korunacak sonuç",
          nextAction: "Önceki adım",
        },
      ],
      sourceFields: { original: { value: "Korunacak kaynak bilgisi" } },
    }),
    record({
      id: "focus-bravo",
      title: "Bravo ileri tarihli",
      dueDate: "2026-11-20",
      parentId: "focus-week",
    }),
    record({ id: "focus-charlie", title: "Charlie tarihsiz" }),
    record({
      id: "focus-delta",
      title: "Delta aramayla bulunan",
      dueDate: "2026-11-08",
    }),
    record({
      id: "focus-closed",
      title: "Kapalı geçmiş odağı",
      status: "completed",
      focusDate: "2026-11-07",
    }),
  ];
}

test("an empty current week previews only the nearest upcoming week and keeps its goals read-only", async ({
  page,
}) => {
  const fixture = [
    record({
      id: "upcoming-first",
      type: "weekly",
      title: "Yakın alfa hedefi",
      periodKey: "2026-W46",
      targetValue: 4,
      currentValue: 1,
      metric: "Rapor",
      nextAction: "İlk raporu hazırla.",
    }),
    record({
      id: "upcoming-second",
      type: "weekly",
      title: "Yakın beta hedefi",
      periodKey: "2026-W46",
    }),
    record({
      id: "upcoming-later",
      type: "weekly",
      title: "Uzaktaki hedef",
      periodKey: "2026-W47",
    }),
    record({
      id: "upcoming-previous",
      type: "weekly",
      title: "Eski açık hedef",
      periodKey: "2026-W44",
    }),
    record({
      id: "upcoming-current-closed",
      type: "weekly",
      title: "Bu hafta biten hedef",
      periodKey: "2026-W45",
      status: "completed",
    }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  await expect(weekly(page).locator(".dashboard-goal-row")).toHaveCount(2);
  expect(
    await weekly(page)
      .locator(".dashboard-goal-row")
      .evaluateAll((rows) => rows.map((row) => row.dataset.goalId).sort()),
  ).toEqual(["upcoming-first", "upcoming-second"]);
  await expect(weekly(page).locator(".dashboard-week-label")).toHaveCount(0);
  await expect(weekly(page).locator(".dashboard-panel-link")).toHaveAttribute(
    "data-week",
    "2026-W46",
  );
  await expect(weekly(page).locator(".dashboard-panel-link")).toHaveAttribute(
    "title",
    /Gelecek hafta.*9\s*[–-]\s*15 Kasım 2026/,
  );
  const nav = page.locator('#nav [data-view="weekly"]');
  await expect(nav.locator(".count")).toHaveText("4");
  await expect(nav).toHaveAttribute("title", "Tüm haftalardaki açık hedefler");
  const upcomingProgress = weekly(page)
    .locator('[data-goal-id="upcoming-first"]')
    .locator('[data-action="goal-progress-open"]');
  await expect(upcomingProgress).toHaveText(
    /^(\d+ \/ \d+|%\d+|Ölçüm yok|Tamamlandı)$/,
  );
  await upcomingProgress.click();
  await expect(goalPanel(page).locator(".goal-panel-title")).toHaveText(
    "Yakın alfa hedefi",
  );
  await expect(
    goalPanel(page).locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "25");
  await expect(goalPanel(page).locator(".goal-panel-period")).toContainText(
    "9 – 15 Kasım 2026",
  );
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(original);
  await page.locator("#global-search").fill("Uzaktaki");
  await expect(weekly(page).locator(".dashboard-goal-row")).toHaveCount(1);
  await expect(
    weekly(page).locator('[data-goal-id="upcoming-later"]'),
  ).toBeVisible();
  await expect(weekly(page).locator(".dashboard-panel-link")).toHaveAttribute(
    "data-week",
    "2026-W47",
  );
  await expect(weekly(page).locator(".dashboard-panel-link")).toHaveAttribute(
    "title",
    /Sıradaki hafta.*16\s*[–-]\s*22 Kasım 2026/,
  );
  await page.locator("#global-search").fill("eşleşmeyen arama");
  await expect(weekly(page).locator(".dashboard-goal-row")).toHaveCount(0);
  await page.locator("#global-search").fill("");
  await expect(weekly(page).locator(".dashboard-goal-row")).toHaveCount(2);
  expect(await saved(page)).toBe(original);
});

test("today's focus is a persistent three-item choice independent of deadlines, search and the next calendar day", async ({
  page,
  context,
}) => {
  const fixture = dailyFixture();
  await seed(page, fixture);
  const original = await saved(page);
  await expect(focusFilter(page, "today")).toContainText("Bugün teslim");
  for (const id of ["focus-alpha", "focus-bravo", "focus-charlie"])
    await focusButton(page, id).click();
  const chosen = await records(page);
  expect(
    chosen.filter(
      (item) =>
        item.type === "daily" &&
        item.status !== "completed" &&
        item.focusDate === "2026-11-07",
    ),
  ).toHaveLength(3);
  for (const item of chosen) {
    const before = fixture.find((candidate) => candidate.id === item.id);
    expect({
      ...item,
      focusDate: before.focusDate,
      updatedAt: before.updatedAt,
    }).toEqual({ ...before, focusDate: before.focusDate });
  }
  await focusFilter(page, "focus").click();
  expect((await focusIds(page)).sort()).toEqual([
    "focus-alpha",
    "focus-bravo",
    "focus-charlie",
  ]);
  await focusFilter(page, "today").click();
  expect(await focusIds(page)).toEqual(["focus-alpha"]);
  await focusFilter(page, "open").click();
  await page.locator("#global-search").fill("Delta");
  await expect(focusButton(page, "focus-delta")).toBeDisabled();
  const capped = await saved(page);
  const other = await secondWindow(context);
  await undo(other);
  await expect(focusButton(page, "focus-delta")).toBeEnabled();
  await focusButton(page, "focus-delta").click();
  expect(await saved(page)).not.toBe(capped);
  await expect
    .poll(
      async () =>
        (await records(other)).find((item) => item.id === "focus-delta")
          .focusDate,
    )
    .toBe("2026-11-07");
  await page.reload();
  await focusFilter(page, "focus").click();
  expect((await focusIds(page)).sort()).toEqual([
    "focus-alpha",
    "focus-bravo",
    "focus-delta",
  ]);
  const beforeNewDay = await saved(page);
  await page.clock.setFixedTime(NEXT_DAY);
  await page.reload();
  await focusFilter(page, "focus").click();
  await expect(page.locator(".focus-row[data-id]")).toHaveCount(0);
  expect(await saved(page)).toBe(beforeNewDay);
  await focusFilter(page, "open").click();
  await focusButton(page, "focus-charlie").click();
  expect(
    (await records(page)).find((item) => item.id === "focus-charlie").focusDate,
  ).toBe("2026-11-08");
  await undo(other);
  await expect.poll(() => saved(page)).toBe(beforeNewDay);
  await undo(other);
  await undo(other);
  await undo(other);
  expect(await saved(page)).toBe(original);
  await other.close();
});

test("goal-link review proposes replacements but only an explicit selected batch changes links and undo restores every record", async ({
  page,
  context,
}) => {
  const fixture = [
    record({
      id: "review-old",
      type: "weekly",
      title: "Teknik inceleme hedefi",
      periodKey: "2026-W44",
      status: "completed",
      targetValue: 10,
      currentValue: 10,
      metric: "Rapor",
    }),
    record({
      id: "review-next",
      type: "weekly",
      title: "Teknik inceleme hedefi",
      periodKey: "2026-W46",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "review-other",
      type: "weekly",
      title: "Alternatif açık hedef",
      periodKey: "2026-W45",
      targetValue: 100,
      currentValue: 25,
      metric: "Parça",
    }),
    record({
      id: "review-alpha",
      title: "Eski hedefe bağlı alfa işi",
      parentId: "review-old",
      description: "Kaynak ve oturum korunur.",
      sourceFields: { original: "korunur" },
      workLog: [
        {
          id: "review-log",
          date: "2026-11-06",
          endedAt: "2026-11-06T09:00:00.000Z",
          durationMs: 40_000,
          note: "Özgün sonuç",
          nextAction: "Özgün adım",
        },
      ],
    }),
    record({
      id: "review-bravo",
      title: "Eski hedefe bağlı bravo işi",
      parentId: "review-old",
      dueDate: "2026-11-08",
      status: "in_progress",
    }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  await page.locator('[data-action="review-goal-links"]').click();
  await expect(reviewDialog(page)).toBeVisible();
  await expect(reviewDialog(page).locator("[data-review-record]")).toHaveCount(
    2,
  );
  for (const id of ["review-alpha", "review-bravo"])
    await expect(
      reviewRow(page, id).locator('[name="goalTarget"]'),
    ).toHaveValue("review-next");
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(original);
  await page.locator('[data-action="review-goal-links"]').click();
  await reviewRow(page, "review-alpha").locator('[name="applyLink"]').check();
  await reviewRow(page, "review-bravo").locator('[name="applyLink"]').check();
  await reviewRow(page, "review-bravo")
    .locator('[name="goalTarget"]')
    .selectOption("review-other");
  await reviewDialog(page)
    .locator('#goal-links-review-form [type="submit"]')
    .click();
  const linked = await records(page);
  expect(linked.find((item) => item.id === "review-alpha").parentId).toBe(
    "review-next",
  );
  expect(linked.find((item) => item.id === "review-bravo").parentId).toBe(
    "review-other",
  );
  for (const item of linked) {
    const before = fixture.find((candidate) => candidate.id === item.id);
    expect({
      ...item,
      parentId: before.parentId,
      updatedAt: before.updatedAt,
    }).toEqual(before);
  }
  // Linked jobs live in the goal's details, opened from the card itself.
  await weekly(page)
    .locator('[data-goal-id="review-other"]')
    .locator(".dashboard-goal-title")
    .click();
  await expect(goalPanel(page).locator(".goal-panel-progress")).toHaveAttribute(
    "data-progress-basis",
    "metric",
  );
  await expect(
    goalPanel(page).locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "25");
  await expect(goalPanel(page).locator(".goal-child-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await saved(page)).toBe(original);

  await page.locator('[data-action="review-goal-links"]').click();
  for (const id of ["review-alpha", "review-bravo"])
    await reviewRow(page, id).locator('[name="applyLink"]').check();
  await reviewRow(page, "review-bravo")
    .locator('[name="goalTarget"]')
    .selectOption("review-other");
  const other = await secondWindow(context);
  await view(other, "daily");
  await other
    .locator('.full-table tr[data-id="review-alpha"] .task-name')
    .click();
  await other
    .locator('#record-form [name="parentId"]')
    .selectOption("review-other");
  await other
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const externallyChanged = await saved(other);
  await expect.poll(() => saved(page)).toBe(externallyChanged);
  await expect(
    reviewRow(page, "review-alpha").locator('[name="goalTarget"]'),
  ).toHaveValue("review-next");
  await reviewDialog(page)
    .locator('#goal-links-review-form [type="submit"]')
    .click();
  await expect(reviewDialog(page).getByRole("alert")).toContainText(
    /değiş|güncel|yeniden/i,
  );
  await expect(reviewDialog(page)).toBeVisible();
  expect(await saved(page)).toBe(externallyChanged);
  expect(
    (await records(page)).find((item) => item.id === "review-bravo").parentId,
  ).toBe("review-old");
  await page.keyboard.press("Escape");
  await undo(other);
  await expect.poll(() => saved(page)).toBe(original);
  await other.close();
});

test("the overview distinguishes idle work notes, an active untimed draft and manually chosen focus", async ({
  page,
}) => {
  const fixture = dailyFixture();
  await seed(page, fixture);
  const original = await saved(page);
  await expect(page.locator('#nav [data-view="dashboard"]')).toHaveText(
    "Genel bakış",
  );
  await expect(page.locator('#nav [data-view="meeting"]')).toContainText(
    "Toplantı aksiyonları",
  );
  await expect(page.locator(".sidebar-journal-idle")).toHaveCount(0);
  await expect(page.locator(".sidebar-journal-saved")).toHaveCount(0);
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 kayıt");
  await expect(page.locator('[data-action="work-session-history"]')).toHaveText(
    "Çalışma geçmişi",
  );
  await expect(
    page.locator("#sidebar-saved-time, #work-session-time"),
  ).toHaveCount(0);
  await expect(page.locator("#work-session-panel")).not.toBeVisible();
  await expect(page.locator(".sidebar-journal-phase")).not.toBeVisible();
  await expect(focusFilter(page, "focus")).toContainText("Bugünün odağı");
  await focusRow(page, "focus-alpha").locator(".work-start").click();
  await expect(page.locator("#work-session-panel")).toHaveAttribute(
    "data-phase",
    "running",
  );
  await expect(page.locator("#work-session-note")).toBeFocused();
  await page
    .locator("#work-session-note")
    .fill("Görünüm değişse de korunacak çalışma notu");
  await expect(page.locator(".sidebar-journal-idle")).not.toBeVisible();
  await expect(page.locator(".sidebar-journal-phase")).toHaveAttribute(
    "data-phase",
    "running",
  );
  await expect(focusRow(page, "focus-alpha")).toHaveClass(/is-working/);
  await focusFilter(page, "focus").click();
  await expect(page.locator(".focus-row[data-id]")).toHaveCount(0);
  await expect(page.locator("#work-session-panel")).toBeVisible();
  await expect(page.locator("#work-session-note")).toHaveValue(
    "Görünüm değişse de korunacak çalışma notu",
  );
  await page.locator('#work-session-panel [data-action="work-pause"]').click();
  await expect(page.locator(".sidebar-journal-phase")).toHaveText(
    "Duraklatıldı",
  );
  await expect(page.locator("#work-session-panel")).toHaveAttribute(
    "data-mode",
    "note",
  );
  await expect(page.locator("#work-session-panel")).toHaveAttribute(
    "data-collapsed",
    "true",
  );
  await expect(page.locator("#work-session-note")).toBeHidden();
  await expect(page.locator("#work-session-note")).toHaveValue(
    "Görünüm değişse de korunacak çalışma notu",
  );
  expect(await saved(page)).toBe(original);
  await view(page, "meeting");
  await expect(page.locator("#page-title")).toHaveText("Toplantı aksiyonları");
});
