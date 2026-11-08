import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

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
const dateMenu = (page) => page.locator("#due-date-menu");
const followup = (page) => page.locator("#waiting-followup-dialog");
const closeWaiting = (page) =>
  waitingPanel(page)
    .locator('[data-action="waiting-record-close"]')
    .last()
    .click();
const closeGoal = (page) =>
  goalPanel(page).locator('[data-action="goal-panel-close"]').last().click();

function fixture() {
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
  ];
}

async function seed(page) {
  const items = fixture();
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
  await expect(panel.locator(".waiting-record-previous")).toContainText(
    "Önceki özgün gelişme.",
  );
  await expect(
    panel.locator(
      "input, textarea, select, [contenteditable=true], button[type=submit]",
    ),
  ).toHaveCount(0);
  await expect(
    panel.locator(
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
  await expect(waiting(page)).toHaveAttribute("role", "group");
  await expect(waiting(page)).toHaveAttribute("tabindex", "0");
  await waiting(page).locator(".waiting-age").click();
  await expectReadonlyWaiting(page, original);
  await closeWaiting(page);
  const title = waiting(page).locator(".followup-title");
  const expectNoFocusRectangle = async (control) => {
    await expect(control).toHaveCSS("outline-style", "none");
    await expect(control).toHaveCSS("box-shadow", "none");
  };
  await title.click();
  await expectReadonlyWaiting(page, original);
  await closeWaiting(page);
  await expect(title).toBeFocused();
  await expectNoFocusRectangle(title);
  await page.screenshot({
    path: testInfo.outputPath("followup-title-focused-no-rectangle.png"),
    fullPage: false,
  });
  await waiting(page).focus();
  await page.keyboard.press("Tab");
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS("text-decoration-line", /underline/);
  await expectNoFocusRectangle(title);
  for (const control of [
    waiting(page).locator('[data-action="edit-next-followup"]'),
    waiting(page).locator('[data-action="waiting-followup"]'),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await expectNoFocusRectangle(control);
    await expect(control).toHaveCSS("text-decoration-line", /underline/);
  }
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(title).toBeFocused();
  await page.keyboard.press("Enter");
  await expectReadonlyWaiting(page, original);
  await waitingPanel(page)
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(waitingPanel(page)).not.toBeVisible();
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

test("goal body opens the panel at its top while nested goal, follow-up and date actions keep their own destinations", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await expect(goal(page)).toHaveAttribute("role", "group");
  await expect(goal(page)).toHaveAttribute("tabindex", "0");
  await goal(page).locator(".goal-progress-label").click();
  await expect(goalPanel(page).locator("#goal-next-step-form")).toHaveAttribute(
    "data-id",
    "details-week",
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
  await goal(page).locator('[data-action="goal-children-open"]').focus();
  await page.keyboard.press("Space");
  await expect(
    goalPanel(page).locator(
      '.goal-child-row[data-id="details-child"] .goal-child-title',
    ),
  ).toBeFocused();
  const childTitle = goalPanel(page).locator(
    '.goal-child-row[data-id="details-child"] .goal-child-title',
  );
  await expect(childTitle).toHaveCSS("outline-style", "none");
  await expect(childTitle).toHaveCSS("box-shadow", "none");
  await expect(childTitle).toHaveCSS("text-decoration-line", /underline/);
  await closeGoal(page);
  await goal(page).locator('[data-action="edit-date"]').click();
  await expect(dateMenu(page)).toBeVisible();
  await expect(goalPanel(page)).not.toBeVisible();
  await expect(waitingPanel(page)).not.toBeVisible();
  await dateMenu(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await goal(page)
    .locator('.record-context-link[data-id="details-month"]')
    .click();
  await expect(goalPanel(page).locator("#goal-next-step-form")).toHaveAttribute(
    "data-id",
    "details-month",
  );
  await closeGoal(page);
  await waiting(page).locator('[data-action="edit-next-followup"]').click();
  await expect(dateMenu(page).locator('[name="nextFollowUpDate"]')).toHaveValue(
    "08.11.2026",
  );
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(goalPanel(page)).not.toBeVisible();
  await dateMenu(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await waiting(page).locator('[data-action="waiting-followup"]').click();
  await expect(followup(page)).toBeVisible();
  await expect(waitingPanel(page)).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await followup(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  expect(await saved(page)).toBe(before);
});

test("selecting card text does not activate details and external updates or deletion refresh an open preview without making local writes", async ({
  page,
  context,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  const age = await waiting(page).locator(".waiting-age").boundingBox();
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
  await waiting(page).locator(".waiting-age").click();
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
  await otherRow.locator(".task-name").click();
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
  await otherRow.locator(".task-name").click();
  other.once("dialog", (confirmation) => confirmation.accept());
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
    await waiting(page).locator(".waiting-age").tap();
    await expect(waitingPanel(page)).toBeVisible();
    const bounds = await waitingPanel(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await waitingPanel(page)
      .getByRole("button", { name: "Takip ettim", exact: true })
      .tap();
    await expect(waitingPanel(page)).not.toBeVisible();
    await expect(followup(page)).toBeVisible();
    await followup(page)
      .getByRole("button", { name: "Vazgeç", exact: true })
      .tap();
    await goal(page).locator(".dashboard-goal-progress").tap();
    await expect(goalPanel(page)).toBeVisible();
    expect(
      await goalPanel(page)
        .locator(".goal-panel-body")
        .evaluate((body) => body.scrollTop),
    ).toBe(0);
    await closeGoal(page);
    await waiting(page).locator('[data-action="edit-next-followup"]').tap();
    await expect(dateMenu(page)).toBeVisible();
    await expect(waitingPanel(page)).not.toBeVisible();
    await dateMenu(page)
      .getByRole("button", { name: "Vazgeç", exact: true })
      .tap();
    await goal(page).locator('[data-action="edit-date"]').tap();
    await expect(dateMenu(page)).toBeVisible();
    await expect(goalPanel(page)).not.toBeVisible();
    await dateMenu(page)
      .getByRole("button", { name: "Vazgeç", exact: true })
      .tap();
    expect(await saved(page)).toBe(before);
  } finally {
    await context.close();
  }
});
