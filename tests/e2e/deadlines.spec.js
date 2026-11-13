import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { showAgenda } from "./widget-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";

function fixtures() {
  const daily = [
    ["overdue", "2026-11-06", "in_progress"],
    ["today", "2026-11-07", "in_progress"],
    ["three", "2026-11-10", "planned"],
    ["four", "2026-11-11", "planned"],
    ["undated", "", "planned"],
    ["done", "2026-11-10", "completed"],
    ["cancelled", "2026-11-07", "cancelled"],
    ["transferred", "2026-11-07", "transferred"],
  ].map(([id, dueDate, status]) =>
    createRecord({
      id: `deadline-${id}`,
      title: `Teslim kontrolü ${id}`,
      type: "daily",
      priority: "normal",
      parentId: "deadline-weekly",
      dueDate,
      status,
      nextAction: "Mevcut adım korunmalı.",
      sourceFields: { "Özgün tarih": dueDate },
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  return [
    createRecord({
      id: "deadline-weekly",
      title: "Teslim tarihleri haftalık hedefi",
      type: "weekly",
      dueDate: "2026-11-07",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "deadline-weekly-three",
      title: "Üç gün sonraki haftalık hedef",
      type: "weekly",
      dueDate: "2026-11-10",
      periodKey: "2026-W45",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "deadline-meeting",
      title: "Bugün toplantı takip kaydı",
      type: "meeting",
      dueDate: "2026-11-07",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    ...daily,
  ];
}

async function seed(page, records = fixtures()) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("deadline-test-seeded")) return;
      localStorage.setItem(key, JSON.stringify({ version: 1, records }));
      sessionStorage.setItem("deadline-test-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const row = (page, id) =>
  page.locator(
    `.full-table > tbody > tr[data-record-row][data-id="deadline-${id}"]`,
  );
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);

async function expectTone(locator, expected) {
  await expect(locator).toBeVisible();
  if (expected === "overdue") {
    await expect(locator).toHaveClass(/(?:^|\s)overdue(?:\s|$)/);
    await expect(locator).not.toHaveClass(/(?:^|\s)due-soon(?:\s|$)/);
  } else if (expected === "due-soon") {
    await expect(locator).toHaveClass(/(?:^|\s)due-soon(?:\s|$)/);
    await expect(locator).not.toHaveClass(/(?:^|\s)overdue(?:\s|$)/);
  } else {
    await expect(locator).not.toHaveClass(
      /(?:^|\s)(?:overdue|due-soon)(?:\s|$)/,
    );
  }
}

test("daily deadlines from today through three days ahead are orange while overdue, distant and closed dates keep their own tones", async ({
  page,
}) => {
  const records = await seed(page);
  const saved = await readSaved(page);
  await page.locator('#nav [data-view="daily"]').click();
  await selectListStatus(page, "all");
  const matrix = [
    ["overdue", "overdue"],
    ["today", "due-soon"],
    ["three", "due-soon"],
    ["four", "neutral"],
    ["undated", "neutral"],
    ["done", "neutral"],
    ["cancelled", "neutral"],
    ["transferred", "neutral"],
  ];
  for (const [id, tone] of matrix) {
    await expectTone(row(page, id).locator("td.date-cell"), tone);
    const date = row(page, id).locator(".inline-date");
    await expectTone(date, tone);
    await expect(date).toHaveClass(/deadline-tag/);
    await expect(date.locator(".deadline-label")).toHaveCount(1);
    await expect(date).not.toContainText("Gecikti");
    const state = ["done", "cancelled", "transferred"].includes(id)
      ? "closed"
      : id === "undated"
        ? "missing"
        : tone === "neutral"
          ? "scheduled"
          : tone;
    await expect(date).toHaveAttribute("data-deadline-state", state);
    const deadlineIcon = date.locator("svg.deadline-symbol");
    await expect(deadlineIcon).toHaveCount(1);
    await expect(deadlineIcon).toHaveAttribute("aria-hidden", "true");
    await expect(deadlineIcon).toHaveAttribute(
      "data-deadline-icon",
      state === "overdue"
        ? "warning"
        : id === "today"
          ? "today" // due today: the target, not the clock
          : state === "due-soon"
            ? "clock"
            : state === "missing"
              ? "minus"
              : "calendar",
    );
  }
  await expect(row(page, "overdue").locator(".inline-date")).toHaveAttribute(
    "title",
    /Teslim tarihi geçti/,
  );
  await expect(row(page, "today").locator(".inline-date")).toHaveAttribute(
    "title",
    /Bugün teslim/,
  );
  await expect(row(page, "three").locator(".inline-date")).toHaveAttribute(
    "title",
    /3 gün içinde teslim/,
  );
  await expect(row(page, "done").locator(".inline-date")).toHaveAttribute(
    "title",
    /Kapalı kayıt/,
  );
  const ink = (id) =>
    row(page, id)
      .locator(".inline-date")
      .evaluate((element) => getComputedStyle(element).color);
  expect(await ink("today")).not.toBe(await ink("overdue"));
  expect(await ink("today")).not.toBe(await ink("four"));
  const surface = (id) =>
    row(page, id)
      .locator(".inline-date")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          borderStyle: style.borderStyle,
        };
      });
  const red = await surface("overdue");
  const amber = await surface("today");
  const neutral = await surface("four");
  expect(red.background).not.toBe(amber.background);
  expect(amber.background).not.toBe(neutral.background);
  expect(red.border).not.toBe(amber.border);
  expect(red.borderStyle).not.toBe("none");
  expect(amber.borderStyle).not.toBe("none");
  await page.locator('#nav [data-view="weekly"]').click();
  await expectTone(row(page, "weekly").locator(".inline-date"), "neutral");
  await expectTone(
    row(page, "weekly-three").locator(".inline-date"),
    "neutral",
  );
  await page.locator('#nav [data-view="meeting"]').click();
  await expect(
    row(page, "meeting").locator(".inline-date, .inline-priority, .date-cell"),
  ).toHaveCount(0);
  await expect(page.locator("#period-filter, #priority-filter")).toHaveCount(0);
  expect(
    (await readRecords(page)).find((record) => record.id === "deadline-meeting")
      .dueDate,
  ).toBe("2026-11-07");
  expect(await readSaved(page)).toBe(saved);
  expect(await readRecords(page)).toEqual(records);
});

test("dashboard and linked details share deadline tones while the mini agenda shows only its selected day's real deadlines", async ({
  page,
  context,
}) => {
  const records = await seed(page);
  const saved = await readSaved(page);
  for (const [id, tone] of [
    ["overdue", "overdue"],
    ["today", "due-soon"],
    ["three", "due-soon"],
    ["four", "neutral"],
    ["undated", "neutral"],
  ]) {
    await expectTone(
      page.locator(`.focus-row[data-id="deadline-${id}"] .focus-date`),
      tone,
    );
  }
  await expect(page.locator('.focus-row[data-id="deadline-done"]')).toHaveCount(
    0,
  );
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "weekly")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  const panel = page.locator("#goal-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-goal-id", "deadline-weekly");
  for (const [id, tone] of [
    ["overdue", "overdue"],
    ["today", "due-soon"],
    ["three", "due-soon"],
    ["four", "neutral"],
    ["undated", "neutral"],
    ["done", "neutral"],
    ["cancelled", "neutral"],
    ["transferred", "neutral"],
  ]) {
    await expectTone(
      panel.locator(
        `.goal-child-row[data-id="deadline-${id}"] :is(.inline-date, .goal-child-date)`,
      ),
      tone,
    );
    await expect(
      panel.locator(
        `.goal-child-row[data-id="deadline-${id}"] :is(.inline-date, .goal-child-date)`,
      ),
    ).not.toContainText("Gecikti");
  }
  const widget = await context.newPage();
  try {
    await widget.clock.install({ time: NOW });
    await widget.goto("/#widget");
    await showAgenda(widget);
    await expect(widget.locator("#widget-today-count")).toHaveText("2");
    await expect(widget.locator("#widget-tomorrow-count")).toHaveText("0");
    await expect(widget.locator("#widget-date")).toHaveAttribute(
      "datetime",
      "2026-11-07",
    );
    expect(
      await widget
        .locator(".widget-task")
        .evaluateAll((items) => items.map((item) => item.dataset.id).sort()),
    ).toEqual(["deadline-today", "deadline-weekly"]);
    for (const id of ["today", "weekly"])
      await expect(
        widget.locator(
          `.widget-task[data-id="deadline-${id}"] .widget-event-kind`,
        ),
      ).toHaveText("Teslim");
    await expect(
      widget.locator(
        '.widget-task[data-id="deadline-done"], .widget-task[data-id="deadline-overdue"], .widget-task[data-id="deadline-undated"], .widget-task[data-id="deadline-meeting"]',
      ),
    ).toHaveCount(0);
    await widget.locator('[data-widget-day="tomorrow"]').click();
    await expect(widget.locator(".widget-task")).toHaveCount(0);
    await expect(widget.locator("#widget-date")).toHaveAttribute(
      "datetime",
      "2026-11-08",
    );
    expect(await readSaved(page)).toBe(saved);
    expect(await readRecords(page)).toEqual(records);
  } finally {
    await widget.close();
  }
});

test("editing a daily deadline moves it into the orange window and undo restores the exact record and neutral date", async ({
  page,
}) => {
  const records = await seed(page);
  const before = await readSaved(page);
  await page.locator('#nav [data-view="daily"]').click();
  await expectTone(row(page, "four").locator(".inline-date"), "neutral");
  await row(page, "four").locator(".inline-date").click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("data-selection-mode", "direct");
  await expect(page.locator("#due-date-menu, #quick-date-form")).toHaveCount(0);
  await expect(
    picker.locator('input[type="text"], [type="submit"]'),
  ).toHaveCount(0);
  expect(await readSaved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  expect(await readSaved(page)).toBe(before);
  await row(page, "four").locator(".inline-date").click();
  await picker.locator('[data-date-day="2026-11-10"]').click();
  await expect(picker).not.toBeVisible();
  await expectTone(row(page, "four").locator(".inline-date"), "due-soon");
  const changed = (await readRecords(page)).find(
    (record) => record.id === "deadline-four",
  );
  const original = records.find((record) => record.id === changed.id);
  expect(changed.dueDate).toBe("2026-11-10");
  expect({
    ...changed,
    dueDate: original.dueDate,
    updatedAt: original.updatedAt,
  }).toEqual(original);
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expectTone(row(page, "four").locator(".inline-date"), "due-soon");
  expect(
    (await readRecords(page)).find((record) => record.id === changed.id),
  ).toEqual(changed);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expectTone(row(page, "four").locator(".inline-date"), "neutral");
  expect(await readRecords(page)).toEqual(records);
});
