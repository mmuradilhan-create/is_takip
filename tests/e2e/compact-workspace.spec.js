import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const START = new Date("2026-11-07T12:00:00Z");
const STAMP = "2026-11-01T09:00:00.000Z";

function savedLog(id, date, durationMs) {
  return {
    id,
    date,
    endedAt: `${date}T09:00:00.000Z`,
    durationMs,
    note: "Önceden kaydedilen sonuç",
    nextAction: "Önceki sonraki adım",
  };
}

function fixture() {
  const record = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    record({
      id: "compact-weekly",
      type: "weekly",
      title: "Haftalık kontrol hedefi",
      periodKey: "2026-W45",
    }),
    record({
      id: "compact-urgent",
      title: "Öncelikli inceleme",
      priority: "urgent",
      status: "in_progress",
      dueDate: "2026-11-06",
      parentId: "compact-weekly",
      nextAction: "Kontrol listesini bitir",
      workLog: [savedLog("saved-active", "2026-11-07", 120_000)],
    }),
    record({
      id: "compact-urgent-none",
      title: "Tarihsiz acil hazırlık",
      priority: "urgent",
    }),
    record({
      id: "compact-high-today",
      title: "Bugün kontrol edilecek kayıt",
      priority: "high",
      dueDate: "2026-11-07",
    }),
    record({
      id: "compact-high-long",
      title:
        "Uzun başlık: teknik belgelerin güncel revizyonlarını incele ve eksik kalan kontrol maddelerini sorumlu kişiyle değerlendir",
      priority: "high",
      dueDate: "2026-11-10",
      status: "partially_completed",
      parentId: "compact-weekly",
    }),
    record({
      id: "compact-normal-long",
      title:
        "Uzun başlık: toplantıdan kalan tasarım kararlarını kontrol ederek raporlanması gereken değişiklikleri hazırla",
      priority: "normal",
      dueDate: "2026-11-05",
      status: "waiting",
    }),
    record({
      id: "compact-normal-none",
      title: "Tarihsiz normal iş",
      priority: "normal",
    }),
    record({
      id: "compact-low",
      title: "Düşük öncelikli son kontrol",
      priority: "low",
      dueDate: "2026-11-10",
    }),
    record({
      id: "compact-low-none",
      title: "Düşük öncelikli tarihsiz kontrol",
      priority: "low",
    }),
    record({
      id: "compact-completed",
      title: "Tamamlanmış günlük kontrol",
      status: "completed",
      parentId: "compact-weekly",
      workLog: [
        savedLog("saved-done", "2026-11-07", 180_000),
        savedLog("saved-yesterday", "2026-11-06", 360_000),
      ],
    }),
    record({
      id: "compact-monthly",
      type: "monthly",
      title: "Aylık kontrol hedefi",
      periodKey: "2026-11",
    }),
    record({
      id: "compact-yearly",
      type: "yearly",
      title: "Senelik kontrol hedefi",
      periodKey: "2026",
    }),
    record({
      id: "compact-meeting",
      type: "meeting",
      title: "Toplantı takip kaydı",
    }),
    record({
      id: "compact-waiting",
      type: "waiting",
      title: "Yanıt beklenen konu",
      status: "waiting_response",
    }),
  ];
}

async function seed(page) {
  const records = fixture();
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("compact-workspace-seeded")) return;
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
      sessionStorage.setItem("compact-workspace-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const focusIds = (page) =>
  page
    .locator(".focus-list > .focus-row")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id));
const navigate = (page, view) =>
  page.locator(`#nav [data-view="${view}"]`).click();

test("open completion controls are visually empty and only completed records show a tick", async ({
  page,
}) => {
  const originals = await seed(page);
  const before = await readSaved(page);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ]) {
    await navigate(page, type);
    const buttons = page.locator(".full-table .quick-complete");
    if (type === "meeting") await expect(buttons).toHaveCount(0);
    else expect(await buttons.count()).toBeGreaterThan(0);
    await expect(buttons.locator("svg")).toHaveCount(0);
    for (const value of await buttons.allTextContents())
      expect(value.trim()).toBe("");
    const actions = page.locator(
      ".full-table .row-end-actions button, .meeting-table .meeting-linked-cell .meeting-route",
    );
    expect(await actions.count()).toBeGreaterThan(0);
    if (type === "meeting") {
      await expect(
        page.locator(".meeting-table .meeting-linked-cell .meeting-route"),
      ).toHaveText(["İş oluştur", "Takip oluştur"]);
      await expect(
        page.locator(".meeting-table .row-end-actions button"),
      ).toHaveText([""]);
    }
    for (const action of await actions.all()) {
      await expect(action).toHaveAttribute("aria-label", /.+/);
      await expect(action).toHaveAttribute("title", /.+/);
      const size = await action.boundingBox();
      expect(size.height).toBe(30);
      if (type === "meeting") {
        const cell = await action.locator("xpath=ancestor::td").boundingBox();
        expect(size.width).toBeGreaterThanOrEqual(30);
        expect(size.x).toBeGreaterThanOrEqual(cell.x);
        expect(size.x + size.width).toBeLessThanOrEqual(cell.x + cell.width);
      } else {
        expect(size.width).toBe(30);
        expect((await action.textContent()).trim()).toBe("");
      }
    }
    await expect(
      page.locator(".task-meta-line .work-journal-trigger"),
    ).toHaveCount(0);
  }
  expect(await readSaved(page)).toBe(before);
  await navigate(page, "dashboard");
  await expect(page.locator(".focus-list .quick-complete svg")).toHaveCount(0);
  await expect(
    page.locator(".focus-list .completion-mark.is-completed"),
  ).toHaveCount(0);
  await navigate(page, "weekly");
  await page
    .locator('.full-table tr[data-id="compact-weekly"] .task-name')
    .click();
  await expect(
    page.locator("#goal-detail-panel .quick-complete svg"),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '#goal-detail-panel .goal-child-row[data-id="compact-completed"] .completion-mark.is-completed svg',
    ),
  ).toHaveCount(1);
  await page
    .locator('#goal-detail-panel [data-action="goal-panel-close"]')
    .last()
    .click();
  await navigate(page, "daily");
  const active = page.locator('.full-table tr[data-id="compact-urgent"]');
  await active.locator(".quick-complete").click();
  await selectListStatus(page, "completed");
  await expect(active.locator(".completion-mark.is-completed svg")).toHaveCount(
    1,
  );
  await expect(active.locator(".quick-complete")).toHaveCount(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(originals);
  await selectListStatus(page, "active");
  await expect(active.locator(".quick-complete svg")).toHaveCount(0);
});

test("compact focus rows align separate priority and delivery columns while header filters and fixed ordering stay read-only", async ({
  page,
}) => {
  await seed(page);
  const saved = await readSaved(page);
  const expectedInitial = [
    "compact-urgent",
    "compact-normal-long",
    "compact-high-today",
    "compact-high-long",
    "compact-low",
    "compact-urgent-none",
    "compact-normal-none",
    "compact-low-none",
  ];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await navigate(page, "dashboard");
    expect(await focusIds(page)).toEqual(expectedInitial);
    await expect(page.locator(".focus-more")).toHaveCount(0);
    await expect(
      page.locator(".focus-panel > .panel-header"),
    ).not.toContainText("8 açık günlük iş");
    await expect(page.locator(".focus-sort-note")).toHaveCount(0);
    await expect(page.locator("#focus-sort")).toHaveCount(0);
    await expect(
      page.locator(".focus-panel > .panel-header .focus-filters"),
    ).toBeVisible();
    const filters = page.locator(".focus-panel .focus-filters");
    await expect(filters.locator("button")).toHaveCount(4);
    await expect(
      filters.getByRole("button", { name: /^Bugün teslim/ }),
    ).toBeVisible();
    await expect(
      filters.getByRole("button", { name: /^Bugünün odağı\s*0\/3$/ }),
    ).toBeVisible();
    await expect(
      page.locator(".focus-task .priority, .focus-task .focus-date"),
    ).toHaveCount(0);
    const geometry = await page
      .locator(".focus-list > .focus-row")
      .evaluateAll((rows) =>
        rows.map((row) => {
          const rect = (selector) => {
            const bounds = row.querySelector(selector).getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              right: bounds.right,
              height: bounds.height,
            };
          };
          return {
            complete: rect(":scope > .quick-complete"),
            title: rect(".focus-task"),
            priority: rect(":scope > .focus-priority"),
            due: rect(":scope > .focus-date"),
            status: rect(":scope > .status-trigger"),
            journal: rect(".focus-work-actions .work-journal-trigger"),
            start: rect(".focus-work-actions .work-start"),
            height: row.getBoundingClientRect().height,
          };
        }),
      );
    for (const item of geometry) {
      expect(item.complete.right).toBeLessThanOrEqual(item.title.x);
      expect(item.title.right).toBeLessThanOrEqual(item.status.x + 1);
      expect(item.status.right).toBeLessThanOrEqual(item.priority.x + 1);
      expect(item.priority.right).toBeLessThanOrEqual(item.due.x + 1);
      expect(item.due.right).toBeLessThanOrEqual(item.journal.x + 1);
      expect(item.journal.right).toBeLessThanOrEqual(item.start.x + 1);
      expect(item.status.x).toBeCloseTo(geometry[0].status.x, 1);
      expect(item.priority.x).toBeCloseTo(geometry[0].priority.x, 1);
      expect(item.due.x).toBeCloseTo(geometry[0].due.x, 1);
      expect(item.journal.x).toBeCloseTo(geometry[0].journal.x, 1);
      expect(item.start.x).toBeCloseTo(geometry[0].start.x, 1);
      expect(item.height).toBeLessThanOrEqual(66);
    }
    const header = await page.locator(".focus-panel").boundingBox();
    const first = await page.locator(".focus-row").first().boundingBox();
    expect(first.y - header.y).toBeLessThanOrEqual(124);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .locator('[data-action="focus-filter"][data-filter="today"]')
    .click();
  expect(await focusIds(page)).toEqual(["compact-high-today"]);
  await page
    .locator('[data-action="focus-filter"][data-filter="overdue"]')
    .click();
  expect(await focusIds(page)).toEqual([
    "compact-urgent",
    "compact-normal-long",
  ]);
  await page
    .locator('[data-action="focus-filter"][data-filter="focus"]')
    .click();
  await expect(page.locator(".focus-list > .focus-row")).toHaveCount(0);
  await expect(page.locator(".focus-empty h3")).toHaveText(
    "Bugünün odağını seç",
  );
  await page
    .locator('[data-action="focus-filter"][data-filter="open"]')
    .click();
  expect(await focusIds(page)).toEqual(expectedInitial);
  expect(await readSaved(page)).toBe(saved);
});

test("sidebar work notes keep history available and save only finished results while staying inside navigation", async ({
  page,
}, testInfo) => {
  const originals = await seed(page);
  const sidebar = page.locator(".sidebar");
  const control = sidebar.locator("#sidebar-work-journal");
  const panel = control.locator("#work-session-panel");
  const draft = panel.locator("#work-session-note");
  await expect(control).toBeVisible();
  await expect(panel).not.toBeVisible();
  await expect(
    control.locator("#sidebar-saved-time, #work-session-time"),
  ).toHaveCount(0);
  await expect(control.locator(".sidebar-journal-saved")).toHaveCount(0);
  await expect(control.locator("#sidebar-saved-count")).toHaveText("3 kayıt");
  await expect(
    control.locator('[data-action="work-session-history"]'),
  ).toHaveText("Çalışma geçmişi");
  await expect(control.locator(".sidebar-journal-idle")).toHaveCount(0);
  const idleBounds = await control.boundingBox();
  expect(idleBounds.height).toBeLessThanOrEqual(110);
  await control.screenshot({
    path: testInfo.outputPath("mini-journal-idle.png"),
  });
  const before = await readSaved(page);
  await control.locator('[data-action="work-session-history"]').click();
  await expect(page.locator("#work-week-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await readSaved(page)).toBe(before);
  const idlePadding = await page
    .locator("#content")
    .evaluate((element) => getComputedStyle(element).paddingBottom);
  await page
    .locator('.focus-row[data-id="compact-urgent"] .work-start')
    .click();
  await page.clock.fastForward(35_000);
  await expect(panel).toHaveAttribute("data-phase", "running");
  await expect(draft).toHaveAccessibleName("Çalışma notu");
  const normalCaption = await panel
    .locator("#work-session-note-label")
    .boundingBox();
  expect(
    !normalCaption || (normalCaption.width <= 1 && normalCaption.height <= 1),
  ).toBe(true);
  await expect(
    control.locator("#sidebar-saved-time, #work-session-time"),
  ).toHaveCount(0);
  await draft.fill("Kompakt panelden inceleme tamamlandı.");
  await expect(control.locator(".sidebar-journal-phase")).toHaveText(
    "Çalışıyor",
  );
  const activeBounds = await control.boundingBox();
  expect(activeBounds.height).toBeGreaterThan(idleBounds.height + 30);
  expect(activeBounds.y).toBeLessThan(idleBounds.y);
  await control.screenshot({
    path: testInfo.outputPath("mini-journal-active.png"),
  });
  const parentBounds = await sidebar.boundingBox();
  const bounds = await panel.boundingBox();
  const navBounds = await page.locator("#nav").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(parentBounds.x);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    parentBounds.x + parentBounds.width,
  );
  expect(bounds.y).toBeGreaterThanOrEqual(navBounds.y + navBounds.height);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    page.viewportSize().height,
  );
  expect(
    await sidebar.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  for (const button of await page.locator("#nav > button").all())
    await expect(button).toBeInViewport({ ratio: 1 });
  await expect(page.locator("body")).not.toHaveAttribute("data-work-session");
  expect(
    await page
      .locator("#content")
      .evaluate((element) => getComputedStyle(element).paddingBottom),
  ).toBe(idlePadding);
  await panel.locator("#work-session-title").click();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Öncelikli inceleme",
  );
  await page.locator('#editor [data-action="close"]').last().click();
  await panel.getByRole("button", { name: "Duraklat", exact: true }).click();
  await page.clock.fastForward(120_000);
  await expect(panel).toHaveAttribute("data-collapsed", "true");
  await expect(draft).toBeHidden();
  expect(activeBounds.y).toBeLessThan((await control.boundingBox()).y);
  await expect(draft).toHaveValue("Kompakt panelden inceleme tamamlandı.");
  const paused = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `${KEY}-work-session`,
  );
  expect(
    paused.entries.find((entry) => entry.recordId === "compact-urgent"),
  ).toMatchObject({
    status: "paused",
    elapsedMs: 0,
    startedAt: null,
    trackTime: false,
    draftNote: "Kompakt panelden inceleme tamamlandı.",
  });
  await navigate(page, "monthly");
  await expect(panel).toBeVisible();
  await expect(draft).toHaveValue("Kompakt panelden inceleme tamamlandı.");
  expect(await readSaved(page)).toBe(before);
  await panel.locator('[data-action="work-finish"]').click();
  await expect(panel).toHaveAttribute("data-mode", "finish");
  await expect(draft).toHaveAccessibleName("Sonuç (isteğe bağlı)");
  await expect(panel.locator("#work-finish-form")).toBeVisible();
  await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
  await expect(
    page.locator('#work-finish-form [name="nextAction"]'),
  ).toHaveCount(0);
  await expect(draft).toHaveValue("Kompakt panelden inceleme tamamlandı.");
  await page.locator('#work-finish-form [name="resultNote"]').press("Enter");
  await expect(panel).not.toBeVisible();
  await expect(control).toBeVisible();
  await expect(
    control.locator("#sidebar-saved-time, #work-session-time"),
  ).toHaveCount(0);
  await expect(control.locator(".sidebar-journal-saved")).toHaveCount(0);
  await expect(control.locator("#sidebar-saved-count")).toHaveText("4 kayıt");
  const records = await readRecords(page);
  const changed = records.find((record) => record.id === "compact-urgent");
  expect(changed.status).toBe("in_progress");
  const original = originals.find((record) => record.id === "compact-urgent");
  expect(changed.nextAction).toBe(original.nextAction);
  expect(changed.workLog).toHaveLength(2);
  expect(changed.workLog[0]).toEqual(original.workLog[0]);
  expect(changed.workLog[1]).toMatchObject({
    date: "2026-11-07",
    durationMs: 0,
    note: "Kompakt panelden inceleme tamamlandı.",
    nextAction: "",
  });
  await control.locator('[data-action="work-session-history"]').click();
  await expect(page.locator("#work-week-dialog")).toContainText(
    "Kompakt panelden inceleme tamamlandı.",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(originals);
  expect(await readSaved(page)).toBe(before);
  await expect(control.locator("#sidebar-saved-count")).toHaveText("3 kayıt");
});
