import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const goal = (page, id = "metadata-goal") =>
  page.locator(`.dashboard-goal-row[data-goal-id="${id}"]`);
const waiting = (page, id = "metadata-waiting") =>
  page.locator(`.attention-panel .followup-row[data-id="${id}"]`);
const panel = (page) => page.locator("#goal-detail-panel");
const datePicker = (page) => page.locator("#odak-date-picker");
const goalDate = (page) => goal(page).locator('[data-action="edit-date"]');
const childDate = (page) =>
  panel(page).locator(
    '.goal-child-row[data-id="metadata-child"] [data-action="edit-date"]',
  );
const metricDraft = (page) => panel(page).locator("#goal-progress-current");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closePanel = (page) =>
  panel(page).locator('[data-action="goal-panel-close"]').last().click();
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();

function fixture({ dense = false } = {}) {
  const long = dense
    ? "Uzun teknik kapsam ve gerçek kayıt ayrıntıları ".repeat(6)
    : "";
  return [
    make({
      id: "metadata-year",
      type: "yearly",
      title: "Senelik teknik hedef",
      periodKey: "2026",
      targetValue: 10,
      currentValue: 3,
      metric: "Rapor",
    }),
    make({
      id: "metadata-month",
      type: "monthly",
      title: "Aylık teknik hedef",
      periodKey: "2026-11",
      goalParentId: "metadata-year",
      targetValue: 8,
      currentValue: 2,
      metric: "Rapor",
    }),
    make({
      id: "metadata-goal",
      type: "weekly",
      title: `${long}Haftalık ölçümlü hedef`,
      periodKey: "2026-W45",
      goalParentId: "metadata-month",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-10",
      targetValue: 8,
      currentValue: 2,
      metric: "Rapor",
      nextAction: "Yalnız hedef panelinde kalacak isteğe bağlı adım.",
      description: "Özgün hedef açıklaması.",
      sourceFields: { original: { value: "Ham hedef alanları" } },
    }),
    make({
      id: "metadata-goal-two",
      type: "weekly",
      title: `${long}İkinci haftalık hedef`,
      periodKey: "2026-W45",
      status: "planned",
      priority: "normal",
      dueDate: "2026-11-11",
      targetValue: 4,
      currentValue: 1,
      metric: "Kontrol",
      nextAction: "Kartta tekrarlanmayacak ikinci hedef adımı.",
    }),
    make({
      id: "metadata-source",
      type: "meeting",
      title: "Kaynak toplantı kararı",
      status: "in_progress",
      decision: "Kaynağın gerçek kararı korunur.",
    }),
    make({
      id: "metadata-child",
      title: "Hedefe bağlı gerçek günlük iş",
      parentId: "metadata-goal",
      status: "in_progress",
      priority: "urgent",
      dueDate: "2026-11-12",
      projectCode: "GK-42",
      workType: "Test",
      description: "Günlük kişisel notu korunmalı.",
      sourceFields: {
        original: { value: "Ham günlük alanları" },
        __followupSource: { recordId: "metadata-source", type: "meeting" },
      },
      workLog: [
        {
          id: "metadata-work-log",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 90_000,
          note: "Gerçek kaydedilmiş sonuç.",
          nextAction: "Tarihsel sonraki adım.",
        },
      ],
    }),
    make({ id: "metadata-plain", title: "Bağımsız günlük iş" }),
    make({
      id: "metadata-waiting",
      type: "waiting",
      title: `${long}Dış üretim yanıtı`,
      status: "waiting_response",
      sourceDate: dense ? "2026-11-08" : "2026-07-16",
      lastFollowUpDate: dense ? "" : "2026-08-03",
      nextFollowUpDate: "2026-11-08",
      expectedFrom: "Üretim birimi",
      latestUpdate: "Yanıt istendi.",
      dueDate: "2020-01-01",
    }),
    make({
      id: "metadata-waiting-two",
      type: "waiting",
      title: `${long}İkinci dış teknik yanıt`,
      status: "follow_up",
      sourceDate: "2026-11-01",
      lastFollowUpDate: "2026-11-03",
      nextFollowUpDate: "2026-11-09",
      expectedFrom: "Kalite birimi",
      latestUpdate: "Değerlendirme sürüyor.",
      followUpLog: [
        {
          id: "metadata-followup",
          date: "2026-11-03",
          note: "Değerlendirme sürüyor.",
          nextFollowUpDate: "2026-11-09",
        },
      ],
    }),
    ...(dense
      ? [3, 4].map((index) =>
          make({
            id: `metadata-goal-${index}`,
            type: "weekly",
            title: `${long}${index}. ek haftalık hedef`,
            periodKey: "2026-W45",
            goalParentId: "metadata-month",
            status: "in_progress",
            priority: "normal",
            dueDate: `2026-11-${index + 9}`,
            targetValue: 6,
            currentValue: 2,
            metric: "Kontrol",
          }),
        )
      : []),
    ...(dense
      ? [
          make({
            id: "metadata-waiting-three",
            type: "waiting",
            title: `${long}Üçüncü dış teknik yanıt`,
            status: "waiting_response",
            sourceDate: "2026-11-01",
            nextFollowUpDate: "2026-11-10",
            expectedFrom: "Teknik ekip",
            latestUpdate: "İnceleme bekleniyor.",
          }),
        ]
      : []),
  ];
}

async function seed(page, { dense = false } = {}) {
  const items = fixture({ dense });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("dashboard-metadata-0218-seeded")) return;
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
      sessionStorage.setItem("dashboard-metadata-0218-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function openDate(control, page) {
  await control.click();
  await expect(datePicker(page)).toBeVisible();
  await expect(datePicker(page)).toHaveAttribute(
    "data-selection-mode",
    "direct",
  );
  await expect(page.locator("#due-date-menu")).toHaveCount(0);
  await expect(
    datePicker(page).locator('form, input[type="text"], [data-date-input]'),
  ).toHaveCount(0);
  await expect(
    datePicker(page).getByRole("button", { name: /^(Kaydet|Vazgeç)$/ }),
  ).toHaveCount(0);
  await expect(
    datePicker(page).getByRole("button", {
      name: "Tarihi kaldır",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    datePicker(page).getByRole("button", {
      name: "Takvimi kapat",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#waiting-followup-dialog")).not.toBeVisible();
}

async function selectDate(page, value) {
  await datePicker(page).locator(`[data-date-day="${value}"]`).click();
  await expect(datePicker(page)).not.toBeVisible();
}

async function openGoal(page) {
  await goal(page).locator('[data-action="goal-progress-open"]').click();
  await expect(panel(page)).toBeVisible();
}

const palette = (control) =>
  control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderColor,
    };
  });

test("Dashboard metadata explains follow-up age, offers reversible type-specific status menus and keeps daily connections in compact accessible title icons", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  const subtitle = page.locator(".attention-panel .dashboard-panel-subtitle");
  await expect(subtitle).toHaveCount(0);
  await expect(waiting(page).locator(".waiting-age")).toHaveText("115 gün");
  await expect(waiting(page).locator(".followup-last")).toHaveText("3 Ağu");
  await expect(waiting(page).locator(".followup-fact-label")).toHaveText([
    "Bekleme",
    "Son takip",
  ]);
  await expect(waiting(page).locator(".waiting-followup-trigger")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const dashboardPalette = await palette(waiting(page).locator(".badge"));
  await expect(
    goal(page).locator(".dashboard-goal-meta-controls button.status-trigger"),
  ).toBeVisible();
  await expect(
    goal(page).locator(
      '.dashboard-goal-meta-controls [data-action="status-menu"]',
    ),
  ).toHaveCount(1);
  await expect(goalDate(page)).toBeVisible();
  await expect(goal(page).locator(".goal-progress-label")).toHaveText(
    "%25 · 2 / 8",
  );
  await expect(goal(page).locator(".goal-progress-label")).toHaveAttribute(
    "title",
    /Rapor/,
  );
  await expect(
    goal(page).locator(".dashboard-goal-meta, .dashboard-goal-linked"),
  ).toHaveCount(0);
  await expect(
    goal(page).locator('[data-action="goal-children-open"]'),
  ).toContainText("Bağlı işler");
  await expect(
    goal(page).locator('[data-action="goal-children-open"]'),
  ).toContainText("1");
  const focus = page.locator('.focus-row[data-id="metadata-child"]');
  const status = await focus
    .locator('[data-action="status-menu"]')
    .boundingBox();
  const priority = await focus
    .locator('[data-action="edit-priority"]')
    .boundingBox();
  const date = await focus.locator('[data-action="edit-date"]').boundingBox();
  expect(status.x).toBeLessThan(priority.x);
  expect(priority.x).toBeLessThan(date.x);
  const goalParent = goal(page).locator(
    '.dashboard-goal-title-line .record-parent-link[data-action="goal-details"][data-id="metadata-month"]',
  );
  const dailyParent = focus.locator(
    '.focus-title-line .record-parent-link[data-id="metadata-goal"]',
  );
  await expect(goalParent).toBeVisible();
  await expect(dailyParent).toBeVisible();
  await expect(goalParent.locator("svg")).toHaveCount(1);
  await expect(dailyParent.locator("svg")).toHaveCount(1);
  const focusSource = focus.locator(
    '.focus-title-line .record-source-link[data-context-kind="source"][data-action="meeting-record-details"][data-id="metadata-source"]',
  );
  await expect(focusSource).toBeVisible();
  await expect(focusSource).toHaveAttribute(
    "data-record-link-tooltip",
    "Toplantı: Kaynak toplantı kararı",
  );
  await expect(focusSource).not.toHaveAttribute("title");
  const focusNote = focus.locator('[data-action="record-note"]');
  const notePreview = page.locator("#record-note-popover");
  await expect(focusNote).toBeVisible();
  await expect(
    page.locator(
      '.focus-row[data-id="metadata-plain"] [data-action="record-note"]',
    ),
  ).toHaveCount(0);
  const expectedNote = items.find(
    (item) => item.id === "metadata-child",
  ).description;
  for (const reveal of [
    () => focusNote.hover(),
    async () => {
      await focusSource.focus();
      await page.keyboard.press("Tab");
      await expect(focusNote).toBeFocused();
    },
  ]) {
    await reveal();
    await expect(notePreview).toBeVisible();
    await expect(notePreview.locator(".record-note-body")).toHaveText(
      expectedNote,
    );
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(panel(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(notePreview).not.toBeVisible();
  }
  await expect(focusNote).toBeFocused();
  await focusNote.click();
  const noteEditor = page.locator("#record-note-editor");
  await expect(noteEditor).toBeVisible();
  await expect(noteEditor.locator('textarea[name="description"]')).toHaveValue(
    expectedNote,
  );
  await expect(notePreview).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(noteEditor).not.toBeVisible();
  await expect(notePreview).not.toBeVisible();
  await expect(focusNote).toBeFocused();
  await focusSource.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#meeting-record-panel")).toBeVisible();
  await expect(
    page.locator("#meeting-record-panel .meeting-record-title"),
  ).toHaveText("Kaynak toplantı kararı");
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#meeting-record-panel")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  expect(await saved(page)).toBe(before);
  const goalParentText = "Aylık hedef: Aylık teknik hedef";
  await expect(goalParent).toHaveText("");
  await expect(goalParent).toHaveAttribute(
    "data-record-link-tooltip",
    goalParentText,
  );
  await expect(goalParent).not.toHaveAttribute("title");
  const dailyParentText = "Haftalık hedef: Haftalık ölçümlü hedef";
  await expect(dailyParent).toHaveText("");
  await expect(dailyParent).toHaveAttribute(
    "data-record-link-tooltip",
    dailyParentText,
  );
  await expect(dailyParent).not.toHaveAttribute("title");
  await expect(dailyParent).toHaveAttribute(
    "aria-label",
    `${dailyParentText}: üst hedefi aç`,
  );
  const goalTitleBox = await goal(page)
    .locator(".dashboard-goal-title")
    .boundingBox();
  const goalTitleLineBox = await goal(page)
    .locator(".dashboard-goal-title-line")
    .boundingBox();
  const goalParentBox = await goalParent.boundingBox();
  const goalMetadataBox = await goal(page)
    .locator(".dashboard-goal-meta-controls")
    .boundingBox();
  await expect(goal(page).locator(".dashboard-goal-context")).toHaveCount(0);
  expect(goalParentBox.x).toBeGreaterThanOrEqual(
    goalTitleBox.x + goalTitleBox.width + 4,
  );
  expect(Math.abs(goalParentBox.y - goalTitleBox.y)).toBeLessThanOrEqual(1);
  expect(goalParentBox.width).toBe(18);
  expect(goalParentBox.height).toBe(18);
  expect(goalMetadataBox.y).toBeGreaterThanOrEqual(
    goalTitleLineBox.y + goalTitleLineBox.height - 1,
  );
  await expect(focus.locator(".focus-goal-context")).toHaveCount(0);
  const focusTitleBox = await focus.locator(".focus-title").boundingBox();
  const plainFocusBox = await page
    .locator('.focus-row[data-id="metadata-plain"]')
    .boundingBox();
  expect(
    Math.abs((await focus.boundingBox()).height - plainFocusBox.height),
  ).toBeLessThanOrEqual(1);
  let previousRight = focusTitleBox.x + focusTitleBox.width;
  for (const control of [dailyParent, focusSource, focusNote]) {
    const box = await control.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(previousRight + 4);
    expect(Math.abs(box.y - focusTitleBox.y)).toBeLessThanOrEqual(1);
    expect(box.width).toBe(18);
    expect(box.height).toBe(18);
    previousRight = box.x + box.width;
  }
  await goalParent.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-goal-id", "metadata-month");
  await closePanel(page);
  await dailyParent.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-goal-id", "metadata-goal");
  await closePanel(page);
  expect(await saved(page)).toBe(before);
  for (const { card, id, status, available, absent } of [
    {
      card: waiting(page, "metadata-waiting-two"),
      id: "metadata-waiting-two",
      status: "waiting_response",
      available: ["waiting_response", "follow_up"],
      absent: ["in_progress"],
    },
    {
      card: goal(page, "metadata-goal-two"),
      id: "metadata-goal-two",
      status: "in_progress",
      available: ["planned", "in_progress"],
      absent: ["waiting", "waiting_response"],
    },
  ]) {
    const trigger = card.locator(
      'button.status-trigger[data-action="status-menu"]',
    );
    const menu = page.locator("#status-menu");
    await trigger.click();
    await expect(menu).toBeVisible();
    for (const detail of [
      "#editor",
      "#goal-detail-panel",
      "#waiting-record-panel",
    ])
      await expect(page.locator(detail)).not.toBeVisible();
    expect(
      await menu
        .locator(".status-option")
        .evaluateAll((options) =>
          options.every(
            (option) => option.dataset.id === options[0].dataset.id,
          ),
        ),
    ).toBe(true);
    await expect(menu.locator(".status-option").first()).toHaveAttribute(
      "data-id",
      id,
    );
    for (const option of available)
      await expect(menu.locator(`[data-status="${option}"]`)).toBeVisible();
    for (const option of ["completed", ...absent])
      await expect(menu.locator(`[data-status="${option}"]`)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    expect(await saved(page)).toBe(before);
    await trigger.click();
    await menu.locator(`[data-id="${id}"][data-status="${status}"]`).click();
    const after = await stored(page);
    expect(after.records.find((item) => item.id === id)).toEqual({
      ...items.find((item) => item.id === id),
      status,
      updatedAt: NOW.toISOString(),
    });
    expect(after.records.filter((item) => item.id !== id)).toEqual(
      items.filter((item) => item.id !== id),
    );
    expect(after.odak.history).toHaveLength(1);
    await expect(
      goal(page, "metadata-goal-two").locator('[role="progressbar"]'),
    ).toHaveAttribute("aria-valuenow", "25");
    for (const detail of [
      "#editor",
      "#goal-detail-panel",
      "#waiting-record-panel",
    ])
      await expect(page.locator(detail)).not.toBeVisible();
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await view(page, "waiting");
  expect(
    await palette(
      row(page, "metadata-waiting").locator('[data-action="status-menu"]'),
    ),
  ).toEqual(dashboardPalette);
  await view(page, "daily");
  const daily = row(page, "metadata-child");
  const context = daily.locator("[data-record-context]");
  await expect(daily.locator(".task-meta-line")).toHaveCount(0);
  const tableParent = daily.locator(
    '.task-name-line .record-parent-link[data-id="metadata-goal"]',
  );
  await expect(tableParent).toBeVisible();
  await expect(tableParent).toHaveText("");
  await expect(tableParent).toHaveAttribute(
    "data-record-link-tooltip",
    dailyParentText,
  );
  await expect(tableParent).not.toHaveAttribute("title");
  await expect(tableParent).toHaveAttribute(
    "aria-label",
    `${dailyParentText}: üst hedefi aç`,
  );
  await expect(tableParent.locator("svg")).toHaveCount(1);
  await tableParent.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-goal-id", "metadata-goal");
  await closePanel(page);
  const source = row(page, "metadata-child").locator(
    '.task-name-line .record-source-link[data-context-kind="source"][data-id="metadata-source"][data-action="meeting-record-details"]',
  );
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute(
    "data-record-link-tooltip",
    "Toplantı: Kaynak toplantı kararı",
  );
  await expect(source).not.toHaveAttribute("title");
  await expect(source).toHaveAttribute(
    "aria-label",
    "Toplantı: Kaynak toplantı kararı: kaynak kaydı aç",
  );
  await expect(context).toHaveCount(0);
  await source.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#meeting-record-panel")).toBeVisible();
  await expect(
    page.locator("#meeting-record-panel .meeting-record-title"),
  ).toHaveText("Kaynak toplantı kararı");
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#meeting-record-panel")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  expect(await saved(page)).toBe(before);
  await expect(context.locator(".record-context-separator")).toHaveCount(0);
  await expect(
    row(page, "metadata-plain").locator("[data-record-context], .task-sub"),
  ).toHaveCount(0);
  for (const separator of await context
    .locator(".record-context-separator")
    .all())
    await expect(separator).toBeVisible();
  for (const type of ["daily", "weekly", "monthly"]) {
    await view(page, type);
    const headers = await page
      .locator(".full-table thead th")
      .allTextContents();
    const statusIndex = headers.indexOf("Durum");
    const priorityIndex = headers.indexOf("Öncelik");
    const dateIndex = headers.indexOf("Teslim tarihi");
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(priorityIndex).toBeGreaterThan(statusIndex);
    expect(dateIndex).toBeGreaterThan(priorityIndex);
    if (type !== "daily")
      expect(headers.indexOf("İlerleme")).toBeGreaterThan(dateIndex);
    if (type === "weekly")
      await expect(
        row(page, "metadata-goal").locator(
          '.record-context-link[data-id="metadata-month"]',
        ),
      ).toHaveAttribute("data-record-link-tooltip", goalParentText);
  }
  expect(await saved(page)).toBe(before);
});

test("a goal deadline calendar immediately saves or clears only its date and preserves metric drafts and historical fields through close and exact Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await openGoal(page);
  await metricDraft(page).fill("6");
  await expect(
    panel(page).locator("#goal-next-action, #goal-next-step-form"),
  ).toHaveCount(0);
  await closePanel(page);
  await openDate(goalDate(page), page);
  await expect(
    datePicker(page).locator('[data-date-day="2026-11-10"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await datePicker(page).locator('[data-date-nav="1"]').click();
  await datePicker(page)
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(datePicker(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await openDate(goalDate(page), page);
  await selectDate(page, "2026-11-10");
  expect(await saved(page)).toBe(before);
  await openDate(goalDate(page), page);
  await selectDate(page, "2026-11-17");
  await expect(goalDate(page)).toBeFocused();
  const original = items.find((item) => item.id === "metadata-goal");
  const after = await stored(page);
  expect(after.records.find((item) => item.id === original.id)).toEqual({
    ...original,
    dueDate: "2026-11-17",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.filter((item) => item.id !== original.id)).toEqual(
    items.filter((item) => item.id !== original.id),
  );
  expect(after.odak.history).toHaveLength(1);
  await expect(goal(page).locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await openGoal(page);
  await expect(metricDraft(page)).toHaveValue("6");
  expect(
    (await stored(page)).records.find((item) => item.id === original.id)
      .nextAction,
  ).toBe(original.nextAction);
  await closePanel(page);
  await undo(page);
  expect(await saved(page)).toBe(before);

  await openDate(goalDate(page), page);
  await datePicker(page)
    .getByRole("button", { name: "Tarihi kaldır", exact: true })
    .click();
  await expect(datePicker(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual(
    items.map((item) =>
      item.id === original.id
        ? { ...item, dueDate: "", updatedAt: NOW.toISOString() }
        : item,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(1);
  await openGoal(page);
  await expect(metricDraft(page)).toHaveValue("6");
  await closePanel(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("a child deadline calendar safely retries failed writes and preserves goal drafts and external history and data", async ({
  page,
  context,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await openGoal(page);
  await metricDraft(page).fill("5");
  await expect(
    panel(page).locator("#goal-next-action, #goal-next-step-form"),
  ).toHaveCount(0);
  await openDate(childDate(page), page);
  await expect(
    datePicker(page).locator('[data-date-day="2026-11-12"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    window.restoreMetadataStorage = () => {
      Storage.prototype.setItem = originalSetItem;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test depolaması dolu", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, KEY);
  await datePicker(page).locator('[data-date-day="2026-11-18"]').click();
  await expect(datePicker(page)).toBeVisible();
  await expect(
    datePicker(page).locator('#date-picker-error[role="alert"]'),
  ).not.toBeEmpty();
  await expect(metricDraft(page)).toHaveValue("5");
  await expect(childDate(page)).toContainText("12 Kas");
  expect(await saved(page)).toBe(before);
  await page.evaluate(() => window.restoreMetadataStorage());
  await selectDate(page, "2026-11-18");
  await expect(childDate(page)).toBeFocused();
  const original = items.find((item) => item.id === "metadata-child");
  expect(
    (await stored(page)).records.find((item) => item.id === original.id),
  ).toEqual({
    ...original,
    dueDate: "2026-11-18",
    updatedAt: NOW.toISOString(),
  });
  expect((await stored(page)).odak.history).toHaveLength(1);
  await expect(metricDraft(page)).toHaveValue("5");
  expect(
    (await stored(page)).records.find((item) => item.id === "metadata-goal")
      .nextAction,
  ).toBe(items.find((item) => item.id === "metadata-goal").nextAction);
  await closePanel(page);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await openGoal(page);
  await openDate(childDate(page), page);
  await datePicker(page).locator('[data-date-nav="1"]').click();
  expect(await saved(page)).toBe(before);
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await view(other, "daily");
  await row(other, original.id).locator(".task-name").click();
  await openCreationExtras(other);
  await other
    .locator('#record-form [name="title"]')
    .fill("Diğer penceredeki güncel günlük başlık");
  await other.locator('#record-form [name="dueDate"]').fill("19.11.2026");
  await other
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(other.locator("#editor")).not.toBeVisible();
  const external = await saved(other);
  await expect.poll(() => saved(page)).toBe(external);
  await expect(datePicker(page)).not.toBeVisible();
  await expect(metricDraft(page)).toHaveValue("5");
  expect(
    (await stored(page)).records.find((item) => item.id === "metadata-goal")
      .nextAction,
  ).toBe(items.find((item) => item.id === "metadata-goal").nextAction);
  await openDate(childDate(page), page);
  await expect(
    datePicker(page).locator('[data-date-day="2026-11-19"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await selectDate(page, "2026-11-22");
  await expect(metricDraft(page)).toHaveValue("5");
  const remoteChild = JSON.parse(external).records.find(
    (item) => item.id === original.id,
  );
  expect(
    (await stored(page)).records.find((item) => item.id === original.id),
  ).toEqual({
    ...remoteChild,
    dueDate: "2026-11-22",
    updatedAt: NOW.toISOString(),
  });
  await closePanel(page);
  await other.close();
  await undo(page);
  expect(await saved(page)).toBe(external);
});

test("dense previews keep two shared cards beside independent notes and every goal remains reachable as the panels narrow", async ({
  page,
}, testInfo) => {
  await seed(page, { dense: true });
  const before = await saved(page);
  await expect(waiting(page).locator(".waiting-age")).toHaveText("0 gün");
  await expect(waiting(page).locator(".waiting-age")).toHaveAttribute(
    "aria-label",
    "0 gündür bekliyor",
  );
  await expect(waiting(page).locator(".followup-last")).toHaveText("—");
  await expect(
    waiting(page).locator(".followup-last .waiting-last-date"),
  ).toHaveAttribute("title", "Henüz takip edilmedi");
  // Expanded subjects stay bounded when a browser ignores line clamping.
  await page.addStyleTag({
    content:
      ".followup-title { -webkit-line-clamp: unset !important; line-clamp: unset !important; display: block !important; }",
  });
  for (const viewport of [
    { width: 1100, height: 640 },
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
    { width: 1280, height: 700 },
    { width: 1200, height: 800 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 375, height: 700 },
    { width: 1536, height: 864, theme: "dark" },
    { width: 1280, height: 700, theme: "dark" },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, viewport.theme || "light");
    const columns = viewport.width > 760 ? 2 : 1;
    const goals = page.locator(".weekly-dashboard-panel .dashboard-goals");
    const followups = page.locator(".attention-panel .attention-list");
    await goals.evaluate((element) => {
      element.scrollTop = 0;
    });
    for (const list of [goals, followups])
      await expect
        .poll(() =>
          list.evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(" ").length,
          ),
        )
        .toBe(columns);
    await expect(page.locator(".dashboard-rows")).toHaveAttribute(
      "data-card-columns",
      "2",
    );
    await expect(page.locator(".dashboard-goal-row")).toHaveCount(2);
    await expect(followups.locator(".followup-row")).toHaveCount(2);
    await expect(
      page.locator(".weekly-dashboard-panel .dashboard-panel-count"),
    ).toHaveText("4");
    const notes = page.locator(".dashboard-notes-panel");
    await expect(notes).toBeVisible();
    await expect(page.locator(".dashboard-bottom-row > .panel")).toHaveCount(3);
    const attentionPanelBounds = await page
      .locator(".attention-panel")
      .boundingBox();
    const goalPanelBounds = await page
      .locator(".weekly-dashboard-panel")
      .boundingBox();
    const notesBounds = await notes.boundingBox();
    if (viewport.width >= 1280) {
      for (const bounds of [attentionPanelBounds, goalPanelBounds, notesBounds])
        expect(bounds.height).toBeCloseTo(
          viewport.height <= 740 ? 210 : 220,
          0,
        );
      for (const header of await page
        .locator(".dashboard-bottom-row .dashboard-panel-header")
        .all())
        expect((await header.boundingBox()).height).toBeCloseTo(42, 0);
      expect(Math.abs(notesBounds.y - goalPanelBounds.y)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(notesBounds.width - goalPanelBounds.width),
      ).toBeLessThanOrEqual(1);
      expect(notesBounds.x).toBeGreaterThanOrEqual(
        goalPanelBounds.x + goalPanelBounds.width,
      );
    } else {
      expect(notesBounds.y).toBeGreaterThanOrEqual(
        Math.max(
          attentionPanelBounds.y + attentionPanelBounds.height,
          goalPanelBounds.y + goalPanelBounds.height,
        ) - 1,
      );
    }
    const firstGoal = goals.locator(".dashboard-goal-row").first();
    const goalBounds = await firstGoal.boundingBox();
    const goalStatus = await firstGoal.locator(".status-trigger").boundingBox();
    const goalDateBounds = await firstGoal
      .locator('[data-action="edit-date"]')
      .boundingBox();
    const goalActions = await firstGoal
      .locator(".dashboard-goal-actions")
      .boundingBox();
    for (const item of await followups.locator(".followup-row").all()) {
      const bounds = await item.boundingBox();
      const title = await item.locator(".followup-title-line").boundingBox();
      const subject = item.locator(".followup-title");
      const subjectBounds = await subject.boundingBox();
      const lineHeight = await subject.evaluate((element) =>
        parseFloat(getComputedStyle(element).lineHeight),
      );
      const visibleLines =
        viewport.width >= 1536 && viewport.height > 740
          ? 4
          : viewport.width >= 1280 &&
              viewport.width < 1536 &&
              viewport.height <= 740
            ? 2
            : 3;
      const status = await item.locator(".status-trigger").boundingBox();
      const action = item.locator('[data-action="waiting-followup"]');
      const actionBounds = await action.boundingBox();
      expect(subjectBounds.height).toBeCloseTo(lineHeight * visibleLines, 0);
      expect(title.height).toBeGreaterThanOrEqual(subjectBounds.height - 1);
      expect(status.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
      const dateBounds = await item
        .locator('[data-action="edit-next-followup"]')
        .boundingBox();
      expect(dateBounds.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
      expect(
        Math.abs(status.y - bounds.y - (goalStatus.y - goalBounds.y)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(dateBounds.y - bounds.y - (goalDateBounds.y - goalBounds.y)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          bounds.y +
            bounds.height -
            actionBounds.y -
            actionBounds.height -
            (goalBounds.y +
              goalBounds.height -
              goalActions.y -
              goalActions.height),
        ),
      ).toBeLessThanOrEqual(1);
      for (const control of await item
        .locator(
          '.status-trigger, [data-action="edit-next-followup"], .waiting-age, .followup-last, [data-action="waiting-followup"]',
        )
        .all()) {
        await expect(control).toHaveCSS("white-space", "nowrap");
        const box = await control.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        );
        expect(
          await control.evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth + 1 &&
              element.scrollHeight <= element.clientHeight + 1,
          ),
        ).toBe(true);
      }
    }
    if (viewport.width === 1536 || viewport.width === 1280) {
      await goals.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: testInfo.outputPath(
          viewport.width === 1536
            ? `dashboard-two-cards-notes-${viewport.theme || "light"}.png`
            : `dashboard-two-cards-notes-${viewport.width}x${viewport.height}-${viewport.theme || "light"}.png`,
        ),
        fullPage: false,
      });
    }
    for (const item of await page.locator(".dashboard-goal-row").all()) {
      await item.scrollIntoViewIfNeeded();
      const bounds = await item.boundingBox();
      const grid = await goals.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: element.clientWidth,
          padding:
            parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
          gap: parseFloat(style.columnGap),
        };
      });
      expect(
        Math.abs(
          bounds.width -
            (grid.width - grid.padding - grid.gap * (columns - 1)) / columns,
        ),
      ).toBeLessThanOrEqual(1);
      await expect(item.locator(".dashboard-goal-meta-controls")).toBeVisible();
      await expect(item.locator(".status-trigger")).toHaveCSS(
        "white-space",
        "nowrap",
      );
      const statusBox = await item.locator(".status-trigger").boundingBox();
      const dateBox = await item
        .locator('[data-action="edit-date"]')
        .boundingBox();
      expect(Math.abs(statusBox.height - dateBox.height)).toBeLessThanOrEqual(
        1,
      );
      expect(
        statusBox.x + statusBox.width <= dateBox.x + 1 ||
          dateBox.x + dateBox.width <= statusBox.x + 1 ||
          statusBox.y + statusBox.height <= dateBox.y + 1 ||
          dateBox.y + dateBox.height <= statusBox.y + 1,
      ).toBe(true);
      await expect(item.locator('[role="progressbar"]')).toBeVisible();
      await expect(
        item.locator(".dashboard-goal-meta, .dashboard-goal-linked"),
      ).toHaveCount(0);
      const controls = item.locator(
        ".dashboard-goal-meta-controls button, .dashboard-goal-actions button",
      );
      await expect(controls).toHaveCount(4);
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        await expect(control).toBeVisible();
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        );
        expect(
          await control.evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth + 1 &&
              element.scrollHeight <= element.clientHeight + 1,
          ),
        ).toBe(true);
        if (viewport.width >= 1100)
          await expect(control).toBeInViewport({ ratio: 1 });
      }
      for (const parent of await item
        .locator(".dashboard-goal-title-line .record-parent-link")
        .all()) {
        const box = await parent.boundingBox();
        await expect(parent).toBeVisible();
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        );
        if (viewport.width >= 1100)
          await expect(parent).toBeInViewport({ ratio: 1 });
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await saved(page)).toBe(before);
  }
  await page.setViewportSize({ width: 1536, height: 864 });
  await page
    .locator('.weekly-dashboard-panel [data-action="dashboard-weekly"]')
    .click();
  expect(
    (
      await page
        .locator(".full-table tr[data-record-row]")
        .evaluateAll((rows) => rows.map((item) => item.dataset.id))
    ).sort(),
  ).toEqual(
    [
      "metadata-goal",
      "metadata-goal-two",
      "metadata-goal-3",
      "metadata-goal-4",
    ].sort(),
  );
  expect(await saved(page)).toBe(before);
  await view(page, "daily");
  const daily = row(page, "metadata-child");
  const status = daily.locator('[data-action="status-menu"]');
  await expect(status).toHaveText("Devam ediyor");
  await expect(status).toHaveCSS("white-space", "nowrap");
  expect(
    await status.evaluate(
      (element) =>
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  const statusBox = await status.boundingBox();
  for (const control of [
    daily.locator('[data-action="edit-priority"]'),
    daily.locator('[data-action="edit-date"]'),
  ])
    expect(
      Math.abs((await control.boundingBox()).height - statusBox.height),
    ).toBeLessThanOrEqual(1);
  expect(await saved(page)).toBe(before);
});
