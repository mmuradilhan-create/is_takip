import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { appConfirms } from "./app-confirm-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const UNSAFE =
  '<img src=x onerror="window.cardDetailsInjected=1"> Gerçek dış yanıt';
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const waiting = (page) =>
  page.locator('.attention-panel .followup-row[data-id="details-waiting"]');
const goal = (page) =>
  page.locator('.dashboard-goal-row[data-goal-id="details-week"]');
const waitingPanel = (page) => page.locator("#waiting-record-panel");
const goalPanel = (page) => page.locator("#goal-detail-panel");
const datePicker = (page) => page.locator("#odak-date-picker");
const followup = (page) => page.locator("#waiting-followup-dialog");
const closeWaiting = (page) =>
  waitingPanel(page)
    .locator('[data-action="waiting-record-close"]')
    .last()
    .click();
const closeGoal = (page) =>
  goalPanel(page).locator('[data-action="goal-panel-close"]').last().click();

async function expectQuickDatePicker(page, value) {
  await expect(datePicker(page)).toBeVisible();
  await expect(datePicker(page)).toHaveAttribute(
    "data-selection-mode",
    "direct",
  );
  await expect(
    datePicker(page).locator(`[data-date-day="${value}"]`),
  ).toHaveAttribute("aria-pressed", "true");
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
  await expect(followup(page)).not.toBeVisible();
}

async function expectBottomCardControls(page, sideBySide) {
  const boxes = await page.evaluate(() => {
    const card = document.querySelector(
      '[data-goal-id="details-week"].dashboard-goal-row',
    );
    const waiting = document.querySelector(
      '.attention-panel .followup-row[data-id="details-waiting"]',
    );
    const rect = (node) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    return {
      goal: rect(card),
      waiting: rect(waiting),
      panels: [
        ".attention-panel",
        ".weekly-dashboard-panel",
        ".dashboard-notes-panel",
      ].map((selector) => rect(document.querySelector(selector))),
      goalRows: [".dashboard-goal-meta-controls", ".dashboard-card-facts"].map(
        (selector) => [...card.querySelector(selector).children].map(rect),
      ),
      waitingRows: [".followup-meta", ".dashboard-card-facts"].map((selector) =>
        [...waiting.querySelector(selector).children].map(rect),
      ),
      bodyFits: document.documentElement.scrollWidth <= innerWidth + 1,
    };
  });
  // Both cards: two rows of two equal 30px boxes, 6px apart, same inset.
  for (const rows of [boxes.goalRows, boxes.waitingRows]) {
    expect(rows.map((row) => row.length)).toEqual([2, 2]);
    for (const [left, right] of rows) {
      expect(left.bottom - left.top).toBeCloseTo(30, 0);
      expect(right.top).toBeCloseTo(left.top, 0);
      expect(right.left - left.right).toBeCloseTo(6, 0);
      expect(right.right - right.left).toBeCloseTo(left.right - left.left, 0);
    }
    expect(rows[1][0].top - rows[0][0].bottom).toBeCloseTo(6, 0);
  }
  const goalInset = boxes.goal.bottom - boxes.goalRows[1][0].bottom;
  const waitingInset = boxes.waiting.bottom - boxes.waitingRows[1][0].bottom;
  expect(goalInset).toBeGreaterThanOrEqual(8);
  expect(goalInset).toBeLessThanOrEqual(18);
  expect(Math.abs(goalInset - waitingInset)).toBeLessThanOrEqual(1);
  if (sideBySide) {
    const [attentionPanel, weeklyPanel, notesPanel] = boxes.panels;
    expect(weeklyPanel.left).toBeGreaterThanOrEqual(attentionPanel.right);
    expect(notesPanel.left).toBeGreaterThanOrEqual(weeklyPanel.right);
    expect(Math.abs(attentionPanel.top - notesPanel.top)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(attentionPanel.bottom - notesPanel.bottom),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(boxes.goalRows[1][0].bottom - boxes.waitingRows[1][0].bottom),
    ).toBeLessThanOrEqual(1);
  }
  for (const [card, controls] of [
    [boxes.goal, boxes.goalRows.flat()],
    [boxes.waiting, boxes.waitingRows.flat()],
  ]) {
    for (const control of controls) {
      expect(control.left).toBeGreaterThanOrEqual(card.left);
      expect(control.right).toBeLessThanOrEqual(card.right + 1);
      expect(control.top).toBeGreaterThanOrEqual(card.top);
      expect(control.bottom).toBeLessThanOrEqual(card.bottom);
    }
  }
  expect(boxes.bodyFits).toBe(true);
}

function fixture({ linked = false } = {}) {
  return [
    make({
      id: "details-month",
      type: "monthly",
      title: "Bağlı aylık hedef",
      periodKey: "2026-11",
      targetValue: 8,
      currentValue: 3,
      metric: "Rapor",
    }),
    make({
      id: "details-week",
      type: "weekly",
      title: "Karttan açılacak haftalık hedef",
      periodKey: "2026-W45",
      goalParentId: "details-month",
      status: "in_progress",
      dueDate: "2026-11-12",
      targetValue: 8,
      currentValue: 2,
      metric: "Rapor",
      nextAction: "Gerçek hedef adımı korunur.",
    }),
    make({
      id: "details-child",
      title: "Hedefin gerçek günlük adımı",
      parentId: "details-week",
      dueDate: "2026-11-14",
    }),
    make({
      id: "details-waiting",
      type: "waiting",
      title: UNSAFE,
      status: "waiting_response",
      expectedFrom: "Dış üretim ekibi",
      latestUpdate: "Gerçek son gelişme.\nYanıt yeniden istendi.",
      sourceDate: "2026-07-16",
      lastFollowUpDate: "2026-11-07",
      nextFollowUpDate: "2026-11-08",
      dueDate: "2020-01-01",
      nextAction: "Gizli kalacak tarihsel genel adım.",
      description: `${UNSAFE}\n${Array.from({ length: 35 }, (_, index) => `${index + 1}. Kişisel not ve gerçek bekleme bağlamı.`).join("\n")}`,
      followUpLog: [
        {
          id: "details-older",
          date: "2026-11-03",
          note: "Önceki gerçek takip.",
          nextFollowUpDate: "2026-11-07",
          previousUpdate: "Önceki özgün gelişme.",
        },
        {
          id: "details-newest",
          date: "2026-11-07",
          note: "Gerçek son takip sonucu.",
          nextFollowUpDate: "2026-11-08",
        },
      ],
      sourceFields: { original: { value: "Ham takip bilgisi korunmalı" } },
    }),
    ...(linked
      ? ["planned", "completed"].map((status, index) =>
          make({
            id: `details-waiting-child-${index}`,
            title: `Bekleyen konunun ${index + 1}. gerçek günlük adımı`,
            status,
            dueDate: "2026-11-14",
            sourceFields: {
              __followupSource: {
                recordId: "details-waiting",
                type: "waiting",
              },
            },
          }),
        )
      : []),
  ];
}

async function seed(page, options) {
  const items = fixture(options);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("dashboard-card-details-0219-seeded")) return;
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
      sessionStorage.setItem("dashboard-card-details-0219-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function expectReadonlyWaiting(page, original) {
  const panel = waitingPanel(page);
  await expect(panel).toBeVisible();
  expect(
    await panel
      .locator(".waiting-record-body")
      .evaluate((body) => body.scrollTop),
  ).toBe(0);
  await expect(panel.locator(".waiting-record-title")).toHaveText(
    original.title,
  );
  await expect(
    panel.locator('[data-waiting-fact="expectedFrom"]'),
  ).toContainText(original.expectedFrom);
  await expect(
    panel.locator('[data-waiting-fact="latestUpdate"]'),
  ).toContainText(original.latestUpdate);
  await expect(
    panel.locator('[data-waiting-fact="nextFollowUpDate"]'),
  ).toContainText("8 Kas");
  await expect(panel.locator(".waiting-record-note")).toContainText(
    original.description,
  );
  expect(
    await panel
      .locator("li[data-followup-id]")
      .evaluateAll((rows) => rows.map((row) => row.dataset.followupId)),
  ).toEqual(["details-newest", "details-older"]);
  await expect(panel.locator(".waiting-record-previous")).toHaveCount(0);
  await expect(panel.locator(".waiting-record-history")).not.toContainText(
    "Önceki son gelişme",
  );
  await expect(panel.locator(".waiting-record-history")).not.toContainText(
    "Önceki özgün gelişme.",
  );
  await expect(
    panel
      .locator(
        ".waiting-record-facts, .waiting-record-history, .waiting-record-note",
      )
      .locator(
        "input, textarea, select, [contenteditable=true], button[type=submit]",
      ),
  ).toHaveCount(0);
  await expect(
    panel
      .locator(
        ".waiting-record-facts, .waiting-record-history, .waiting-record-note",
      )
      .locator(
        '[data-action="status-menu"], [data-action="edit-date"], [data-action="edit-next-followup"]',
      ),
  ).toHaveCount(0);
  await expect(panel).not.toContainText(original.nextAction);
  await expect(panel).not.toContainText("2020");
  await expect(panel.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.cardDetailsInjected)).toBeUndefined();
  await expect(page.locator("#editor")).not.toBeVisible();
}

test("follow-up card bodies, titles and card keyboard actions open read-only details and editing is an explicit separate handoff", async ({
  page,
}, testInfo) => {
  const items = await seed(page);
  const original = items.find((item) => item.id === "details-waiting");
  const before = await saved(page);
  const title = waiting(page).locator(".followup-title");
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((node, value) => {
      node.dataset.theme = value;
    }, theme);
    const hoverColor = await goal(page).evaluate((card) => {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.backgroundColor = "var(--theme-hover, #fafcf7)";
      card.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await goal(page).locator(".dashboard-goal-title").hover();
    await expect(goal(page)).toHaveCSS("background-color", hoverColor);
    await expect(goal(page).locator(".dashboard-goal-title")).not.toHaveCSS(
      "text-decoration-line",
      /underline/,
    );
    await title.hover();
    await expect(waiting(page)).toHaveCSS("background-color", hoverColor);
    await expect(title).not.toHaveCSS("text-decoration-line", /underline/);
  }
  await page.locator("html").evaluate((node, value) => {
    if (value === null) delete node.dataset.theme;
    else node.dataset.theme = value;
  }, initialTheme);
  await expect(waiting(page)).toHaveAttribute("role", "group");
  await expect(waiting(page)).toHaveAttribute("tabindex", "0");
  // A click on the card's own surface opens its read-only details.
  await waiting(page).click({ position: { x: 4, y: 4 } });
  await expectReadonlyWaiting(page, original);
  await closeWaiting(page);
  const expectNoFocusRectangle = async (control) => {
    await expect(control).toHaveCSS("outline-style", "none");
    await expect(control).toHaveCSS("box-shadow", "none");
  };
  await title.click();
  await expectReadonlyWaiting(page, original);
  await closeWaiting(page);
  await expect(title).toBeFocused();
  await expect(title).not.toHaveCSS("text-decoration-line", /underline/);
  await expectNoFocusRectangle(title);
  await page.screenshot({
    path: testInfo.outputPath("followup-title-focused-no-rectangle.png"),
    fullPage: false,
  });
  await waiting(page).focus();
  // The card's tick box comes first, then the title.
  await page.keyboard.press("Tab");
  await expect(
    waiting(page).locator(".followup-title-line > .quick-complete"),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS("text-decoration-line", /underline/);
  await expectNoFocusRectangle(title);
  for (const control of [
    waiting(page).locator('[data-action="status-menu"]'),
    waiting(page).locator('[data-action="edit-next-followup"]'),
    waiting(page).locator('[data-action="waiting-followup"]'),
    waiting(page).locator('[data-action="edit-waiting-start"]'),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await expectNoFocusRectangle(control);
    await expect(control).toHaveCSS("text-decoration-line", /underline/);
  }
  for (let step = 0; step < 4; step++) await page.keyboard.press("Shift+Tab");
  await expect(title).toBeFocused();
  await page.keyboard.press("Enter");
  await expectReadonlyWaiting(page, original);
  await waitingPanel(page)
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(waitingPanel(page)).toBeVisible();
  await expect(waitingPanel(page)).toHaveAttribute(
    "data-record-id",
    original.id,
  );
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    original.id,
  );
  await expect(page.locator('#record-form [name="expectedFrom"]')).toHaveValue(
    original.expectedFrom,
  );
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expectReadonlyWaiting(page, original);
  await expect(
    waitingPanel(page).locator('[data-action="waiting-record-edit"]'),
  ).toBeFocused();
  await closeWaiting(page);
  await waiting(page).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(waiting(page)).toBeFocused();
  expect(
    await waiting(page).evaluate((element) =>
      element.matches(":focus-visible"),
    ),
  ).toBe(true);
  await expectNoFocusRectangle(waiting(page));
  for (const key of ["Enter", "Space"]) {
    await waiting(page).focus();
    await page.keyboard.press(key);
    await expect(waitingPanel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(waitingPanel(page)).not.toBeVisible();
  }
  expect(await saved(page)).toBe(before);
});

test("dashboard subject clicks and every detail close keep titles plain while fresh keyboard navigation remains visible", async ({
  page,
}) => {
  await seed(page, { linked: true });
  const before = await saved(page);
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((node, value) => {
      node.dataset.theme = value;
    }, theme);
    for (const [card, title, panel, returnedFocus] of [
      [
        goal(page),
        goal(page).locator(".dashboard-goal-title"),
        goalPanel(page),
        goal(page),
      ],
      [
        waiting(page),
        waiting(page).locator(".followup-title"),
        waitingPanel(page),
        waiting(page).locator(".followup-title"),
      ],
    ]) {
      for (const method of ["header", "footer", "Escape"]) {
        await card.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(card).toBeFocused();
        await expect(title).toHaveCSS("text-decoration-line", /underline/);
        await title.click();
        await expect(panel).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "data-input-modality",
          "pointer",
        );
        await expect(title).not.toHaveCSS("text-decoration-line", /underline/);
        if (method === "Escape") await page.keyboard.press("Escape");
        else {
          const buttons = panel.locator(
            '[data-action="goal-panel-close"], [data-action="waiting-record-close"]',
          );
          await (
            method === "header" ? buttons.first() : buttons.last()
          ).click();
        }
        await expect(panel).not.toBeVisible();
        await expect(returnedFocus).toBeFocused();
        await expect(title).not.toHaveCSS("text-decoration-line", /underline/);
        await title.hover();
        await expect(title).not.toHaveCSS("text-decoration-line", /underline/);
        expect(await saved(page)).toBe(before);
      }
    }
  }
});

test("goal body opens the panel at its top while nested goal, follow-up and date actions keep their own destinations", async ({
  page,
}) => {
  await seed(page, { linked: true });
  const before = await saved(page);
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1280, height: 700 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await page.locator("html").evaluate((node, value) => {
        node.dataset.theme = value;
      }, theme);
      await expectBottomCardControls(page, viewport.width > 760);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await saved(page)).toBe(before);
  await expect(goal(page)).toHaveAttribute("role", "group");
  await expect(goal(page)).toHaveAttribute("tabindex", "0");
  // The card body (here its title) opens the panel at its top.
  await goal(page).locator(".dashboard-goal-title").click();
  await expect(goalPanel(page)).toHaveAttribute("data-goal-id", "details-week");
  await expect(goalPanel(page).locator(".goal-panel-title")).toHaveText(
    "Karttan açılacak haftalık hedef",
  );
  expect(
    await goalPanel(page)
      .locator(".goal-panel-body")
      .evaluate((body) => body.scrollTop),
  ).toBe(0);
  await closeGoal(page);
  await goal(page).focus();
  await page.keyboard.press("Space");
  await expect(goalPanel(page)).toBeVisible();
  expect(
    await goalPanel(page)
      .locator(".goal-panel-body")
      .evaluate((body) => body.scrollTop),
  ).toBe(0);
  await closeGoal(page);
  const progressAction = goal(page).locator(
    '[data-action="goal-progress-open"]',
  );
  await progressAction.focus();
  await page.keyboard.press("Enter");
  await expect(goalPanel(page).locator("#goal-progress-current")).toBeFocused();
  const heading = goalPanel(page).locator(
    '[data-goal-section-heading="progress"]',
  );
  await heading.focus();
  await expect(heading).toHaveCSS("outline-style", "none");
  await expect(heading).toHaveCSS("box-shadow", "none");
  await closeGoal(page);
  await expect(progressAction).toBeFocused();
  await expect(progressAction).toHaveCSS("outline-style", "none");
  await expect(progressAction).toHaveCSS("box-shadow", "none");
  // Linked jobs are reached inside the details opened from the card.
  await expect(
    goal(page).locator('[data-action="goal-children-open"]'),
  ).toHaveCount(0);
  await goal(page).focus();
  await page.keyboard.press("Space");
  await expect(goalPanel(page)).toBeVisible();
  await goalPanel(page)
    .locator('.goal-child-row[data-id="details-child"] .goal-child-title')
    .focus();
  const childTitle = goalPanel(page).locator(
    '.goal-child-row[data-id="details-child"] .goal-child-title',
  );
  await expect(childTitle).toHaveCSS("outline-style", "none");
  await expect(childTitle).toHaveCSS("box-shadow", "none");
  await expect(childTitle).toHaveCSS("text-decoration-line", /underline/);
  await page.keyboard.press("Shift+Tab");
  await expect(childTitle).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(childTitle).toBeFocused();
  await expect(childTitle).toHaveCSS("text-decoration-line", /underline/);
  await closeGoal(page);
  await goal(page).locator('[data-action="edit-date"]').click();
  await expectQuickDatePicker(page, "2026-11-12");
  await expect(goalPanel(page)).not.toBeVisible();
  await expect(waitingPanel(page)).not.toBeVisible();
  await datePicker(page)
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(datePicker(page)).not.toBeVisible();
  await expect(goal(page).locator('[data-action="edit-date"]')).toBeFocused();
  await expect(goal(page).locator(".record-parent-link")).toHaveCount(0);
  await page.locator('#nav [data-view="weekly"]').click();
  await page
    .locator(
      '.full-table [data-record-row][data-id="details-week"] .record-context-link[data-id="details-month"]',
    )
    .click();
  await expect(goalPanel(page)).toHaveAttribute(
    "data-goal-id",
    "details-month",
  );
  await expect(goalPanel(page).locator(".goal-panel-title")).toHaveText(
    "Bağlı aylık hedef",
  );
  await closeGoal(page);
  await page.locator('#nav [data-view="dashboard"]').click();
  await waiting(page).locator('[data-action="edit-next-followup"]').click();
  await expectQuickDatePicker(page, "2026-11-08");
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(goalPanel(page)).not.toBeVisible();
  await datePicker(page)
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(datePicker(page)).not.toBeVisible();
  await expect(
    waiting(page).locator('[data-action="edit-next-followup"]'),
  ).toBeFocused();
  await waiting(page).locator('[data-action="waiting-followup"]').click();
  await expect(followup(page)).toBeVisible();
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await followup(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  // Linked jobs live in the card's details, not on the card.
  await expect(
    waiting(page).locator('[data-action="waiting-children-open"]'),
  ).toHaveCount(0);
  const body = waitingPanel(page).locator(".waiting-record-body");
  const childrenHeading = waitingPanel(page).locator(
    '[data-waiting-section-heading="children"]',
  );
  await waiting(page).locator(".followup-title").click();
  await expect(waitingPanel(page)).toHaveAttribute(
    "data-record-id",
    "details-waiting",
  );
  await expect(childrenHeading).toHaveText("Bağlı günlük işler 2");
  await expect(waitingPanel(page).locator(".waiting-record-child")).toHaveCount(
    2,
  );
  await expect(
    waitingPanel(page).locator(
      '.waiting-record-child[data-id="details-waiting-child-1"] .goal-child-title.completed',
    ),
  ).toBeAttached();
  expect(await saved(page)).toBe(before);
  await closeWaiting(page);
  for (const open of [
    () => waiting(page).locator(".followup-title").click(),
    () => waiting(page).click({ position: { x: 4, y: 4 } }),
  ]) {
    await open();
    await expect(waitingPanel(page)).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    await closeWaiting(page);
  }
  expect(await saved(page)).toBe(before);
});

test("selecting card text does not activate details and external updates or deletion refresh an open preview without making local writes", async ({
  page,
  context,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  const age = await waiting(page).locator(".followup-title").boundingBox();
  await page.mouse.move(age.x + 2, age.y + age.height / 2);
  await page.mouse.down();
  await page.mouse.move(age.x + age.width - 2, age.y + age.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  expect(
    await page.evaluate(
      () => window.getSelection()?.toString().trim().length || 0,
    ),
  ).toBeGreaterThan(0);
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(goalPanel(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await waiting(page).locator(".followup-title").click();
  await expect(waitingPanel(page)).toBeVisible();
  const body = waitingPanel(page).locator(".waiting-record-body");
  await body.evaluate((element) => {
    element.scrollTop = 35;
  });
  const scroll = await body.evaluate((element) => element.scrollTop);
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await other.locator('#nav [data-view="waiting"]').click();
  const otherRow = other.locator(
    '.waiting-table tr[data-id="details-waiting"]',
  );
  await otherRow.locator(".record-edit-trigger").click();
  await other.locator('#record-form [name="status"]').selectOption("follow_up");
  await other
    .locator('#record-form [name="latestUpdate"]')
    .fill("Diğer pencereden kaydedilen gerçek gelişme.");
  await other
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(other.locator("#editor")).not.toBeVisible();
  const external = await saved(other);
  await expect.poll(() => saved(page)).toBe(external);
  await expect(
    waitingPanel(page).locator('[data-waiting-fact="latestUpdate"]'),
  ).toContainText("Diğer pencereden kaydedilen gerçek gelişme.");
  await expect(waitingPanel(page)).toContainText("Takipte");
  expect(await body.evaluate((element) => element.scrollTop)).toBe(scroll);
  const original = items.find((item) => item.id === "details-waiting");
  expect(
    (await stored(page)).records.find((item) => item.id === original.id),
  ).toEqual({
    ...original,
    status: "follow_up",
    latestUpdate: "Diğer pencereden kaydedilen gerçek gelişme.",
    updatedAt: NOW.toISOString(),
  });
  await closeWaiting(page);
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(waiting(page)).toBeFocused();
  expect(await saved(page)).toBe(external);
  await page.keyboard.press("Enter");
  await expect(waitingPanel(page)).toBeVisible();
  await expect(
    waitingPanel(page).locator('[data-waiting-fact="latestUpdate"]'),
  ).toContainText("Diğer pencereden kaydedilen gerçek gelişme.");
  await otherRow.locator(".record-edit-trigger").click();
  appConfirms(other).once("dialog", (confirmation) => confirmation.accept());
  await other.locator('#editor [data-action="delete"]').click();
  await expect(other.locator("#editor")).not.toBeVisible();
  const deleted = await saved(other);
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(waiting(page)).toHaveCount(0);
  expect(await saved(page)).toBe(deleted);
  await other.close();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(external);
  await expect(waiting(page)).toBeVisible();
});

test("touch cards open read-only details while nested date and follow-up controls stay independent on narrow screens", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 700 },
    isMobile: true,
    hasTouch: true,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const page = await context.newPage();
    await seed(page);
    const before = await saved(page);
    const age = waiting(page).locator(".followup-title");
    await age.scrollIntoViewIfNeeded();
    await expect(age).toBeInViewport();
    await age.tap();
    await expect(waitingPanel(page)).toBeVisible();
    const bounds = await waitingPanel(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await waitingPanel(page)
      .getByRole("button", { name: "Takip ettim", exact: true })
      .tap();
    await expect(waitingPanel(page)).toBeVisible();
    await expect(waitingPanel(page)).toHaveAttribute(
      "data-record-id",
      "details-waiting",
    );
    await expect(followup(page)).toBeVisible();
    await followup(page)
      .getByRole("button", { name: "Vazgeç", exact: true })
      .tap();
    await expect(followup(page)).not.toBeVisible();
    await expect(waitingPanel(page)).toBeVisible();
    await expect(
      waitingPanel(page).locator('[data-action="waiting-record-followup"]'),
    ).toBeFocused();
    // The narrow panel covers the background card until explicitly closed.
    await closeWaiting(page);
    await goal(page).locator(".dashboard-goal-title").tap();
    await expect(goalPanel(page)).toBeVisible();
    expect(
      await goalPanel(page)
        .locator(".goal-panel-body")
        .evaluate((body) => body.scrollTop),
    ).toBe(0);
    await closeGoal(page);
    await waiting(page).locator('[data-action="edit-next-followup"]').tap();
    await expectQuickDatePicker(page, "2026-11-08");
    await expect(waitingPanel(page)).not.toBeVisible();
    await datePicker(page)
      .getByRole("button", { name: "Takvimi kapat", exact: true })
      .tap();
    await expect(datePicker(page)).not.toBeVisible();
    await goal(page).locator('[data-action="edit-date"]').tap();
    await expectQuickDatePicker(page, "2026-11-12");
    await expect(goalPanel(page)).not.toBeVisible();
    await datePicker(page)
      .getByRole("button", { name: "Takvimi kapat", exact: true })
      .tap();
    await expect(datePicker(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  } finally {
    await context.close();
  }
});
