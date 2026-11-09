import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const NOTE =
  '<img src=x onerror="window.waitingActionsInjected=1"> Yeni takip sonucu.';
const LONG_NOTE = Array.from(
  { length: 45 },
  (_, index) => `${index + 1}. Kaynağın uzun ve korunacak açıklaması.`,
).join("\n");
const make = (values) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...values });
const panel = (page) => page.locator("#waiting-record-panel");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const row = (page, id) =>
  page.locator(`.waiting-table [data-record-row][data-id="${id}"]`);

function fixture() {
  return [
    make({
      id: "waiting-actions-open",
      type: "waiting",
      title: "Teklif yanıtı için takip",
      status: "follow_up",
      expectedFrom: "Satın alma",
      latestUpdate: "Eski son gelişme.",
      sourceDate: "2026-10-20",
      lastFollowUpDate: "2026-11-07",
      nextFollowUpDate: "2026-11-10",
      description: LONG_NOTE,
      followUpLog: [
        {
          id: "waiting-actions-old-contact",
          date: "2026-11-07",
          note: "Eski son gelişme.",
          nextFollowUpDate: "2026-11-10",
        },
      ],
      sourceFields: { "Korunacak ham alan": { values: ["özgün", 7] } },
    }),
    make({
      id: "waiting-actions-linked",
      type: "waiting",
      title: "Bağlı işi bulunan yanıt",
      status: "waiting_response",
      expectedFrom: "Üretim",
      latestUpdate: "Teknik yanıt bekleniyor.",
      sourceDate: "2026-11-01",
    }),
    make({
      id: "waiting-actions-closed",
      type: "waiting",
      title: "Kapanmış ve geçmişi korunan yanıt",
      status: "completed",
      sourceDate: "2026-10-20",
      lastFollowUpDate: "2026-11-07",
      followUpLog: [
        {
          id: "waiting-actions-closed-contact",
          date: "2026-11-07",
          note: "Özgün kapanmış konu geçmişi.",
          nextFollowUpDate: "",
        },
      ],
    }),
    make({
      id: "waiting-actions-daily",
      title: "Yanıta bağlı gerçek günlük iş",
      status: "in_progress",
      dueDate: "2026-11-12",
      description: "Günlük işin açıklaması korunur.",
      sourceFields: {
        __followupSource: {
          recordId: "waiting-actions-linked",
          type: "waiting",
        },
      },
      workLog: [
        {
          id: "waiting-actions-session",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 61_234,
          note: "Gerçek eski çalışma oturumu.",
          nextAction: "Korunacak oturum adımı.",
        },
      ],
    }),
  ];
}

async function seed(page) {
  const records = fixture();
  const raw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact" },
      history: [],
    },
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, raw }) => {
      if (sessionStorage.getItem("waiting-panel-actions-seeded")) return;
      localStorage.setItem(key, raw);
      sessionStorage.setItem("waiting-panel-actions-seeded", "1");
    },
    { key: KEY, raw },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="waiting"]').click();
  await expect(page.locator("#page-title")).toHaveText("Bekleyen konular");
  expect(await saved(page)).toBe(raw);
  return { records, raw };
}

async function open(page, id) {
  await row(page, id).locator(".task-name").click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-record-id", id);
  await expect(page.locator("#editor")).not.toBeVisible();
}

const close = (page) =>
  panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
const sourceContext = (page) =>
  page.evaluate(() => ({
    title: document.querySelector("#page-title")?.textContent,
    search: document.querySelector("#global-search")?.value,
    scope: document.querySelector('.list-scope-tabs [aria-pressed="true"]')
      ?.dataset.scope,
    sort: document.querySelector("#list-sort")?.value,
    scroll: [window.scrollX, window.scrollY],
  }));

test("waiting panel keeps its sole follow-up action beside history and daily steps in their own section with compact footer and responsive alignment", async ({
  page,
}) => {
  const { raw } = await seed(page);
  for (const [width, height] of [
    [1440, 900],
    [390, 700],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      await expect(
        row(page, "waiting-actions-open").locator(
          ".daily-source-control svg path",
        ),
      ).toHaveAttribute("d", "M12 5v14M5 12h14");
      await open(page, "waiting-actions-open");
      const heading = panel(page).locator(
        ".waiting-record-history .waiting-record-section-heading",
      );
      const followUp = heading.getByRole("button", {
        name: "Takip ettim",
        exact: true,
      });
      await followUp.scrollIntoViewIfNeeded();
      await expect(followUp).toBeVisible();
      await expect(
        panel(page).locator('[data-action="waiting-record-followup"]'),
      ).toHaveCount(1);
      await expect(heading.locator("h3")).toHaveText("Takip geçmişi");
      await expect(heading.locator(".waiting-record-history-count")).toHaveText(
        "1",
      );
      const footer = panel(page).locator(":scope > .modal-footer");
      await expect(footer.locator("button")).toHaveText([
        "Kaydı düzenle",
        "Kapat",
      ]);
      await expect(
        footer.locator('[data-action="waiting-record-followup"]'),
      ).toHaveCount(0);
      const [title, count, action, bounds] = await Promise.all([
        heading.locator("h3").boundingBox(),
        heading.locator(".waiting-record-history-count").boundingBox(),
        followUp.boundingBox(),
        panel(page).boundingBox(),
      ]);
      expect(count.x).toBeGreaterThanOrEqual(title.x + title.width);
      expect(action.x).toBeGreaterThanOrEqual(count.x + count.width);
      expect(
        Math.abs(action.y + action.height / 2 - (title.y + title.height / 2)),
      ).toBeLessThanOrEqual(1);
      expect(action.x + action.width).toBeLessThanOrEqual(
        bounds.x + bounds.width,
      );
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      const children = panel(page).locator('[data-waiting-section="children"]');
      const childrenHeading = children.locator(
        '[data-waiting-section-heading="children"]',
      );
      await expect(childrenHeading).toHaveText("Bağlı günlük işler 0");
      await expect(childrenHeading).toHaveAttribute("tabindex", "-1");
      await expect(children.locator(".waiting-record-child")).toHaveCount(0);
      await expect(children.locator(".waiting-record-empty")).toHaveText(
        "Henüz bağlı günlük iş yok.",
      );
      const create = children.locator(
        '[data-action="waiting-record-create-daily"]',
      );
      await expect(create).toHaveAttribute("data-id", "waiting-actions-open");
      await expect(create).toHaveText("Yeni adım ekle");
      await expect(
        create.locator(".waiting-record-create-icon path"),
      ).toHaveAttribute("d", "M12 5v14M5 12h14");
      await expect(
        children.locator("#waiting-link-daily-form"),
      ).toHaveAttribute("data-id", "waiting-actions-open");
      await expect(children.locator("#waiting-link-daily")).toBeDisabled();
      await expect(
        children.getByRole("button", { name: "Bağla", exact: true }),
      ).toBeDisabled();
      await close(page);
      expect(await saved(page)).toBe(raw);
    }
  }
  await open(page, "waiting-actions-linked");
  const children = panel(page).locator('[data-waiting-section="children"]');
  await expect(
    children.locator('[data-waiting-section-heading="children"]'),
  ).toHaveText("Bağlı günlük işler 1");
  const child = children.locator(
    '.waiting-record-child.goal-child-row[data-id="waiting-actions-daily"]',
  );
  await expect(child).toHaveCount(1);
  const openDaily = child.locator('[data-action="waiting-record-open-daily"]');
  await expect(openDaily).toHaveText("Yanıta bağlı gerçek günlük iş");
  await expect(openDaily).toHaveAttribute("data-id", "waiting-actions-daily");
  await expect(openDaily).toHaveAttribute(
    "data-route",
    "waiting-actions-daily",
  );
  await expect(
    child.locator('[data-action="waiting-record-unlink-daily"]'),
  ).toHaveAttribute("data-id", "waiting-actions-daily");
  await expect(
    child.locator('[data-action="waiting-record-unlink-daily"]'),
  ).toHaveAttribute("data-route", "waiting-actions-daily");
  await expect(
    children.locator('[data-action="waiting-record-create-daily"]'),
  ).toHaveText("Yeni adım ekle");
  await expect(children.locator("#waiting-link-daily-form")).toHaveAttribute(
    "data-id",
    "waiting-actions-linked",
  );
  await expect(panel(page).locator(".waiting-record-history-count")).toHaveText(
    "0",
  );
  await close(page);
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await open(page, "waiting-actions-closed");
  await expect(
    panel(page).locator('[data-action="waiting-record-followup"]'),
  ).toHaveCount(0);
  await expect(
    panel(page).locator('[data-action="waiting-record-create-daily"]'),
  ).toHaveCount(0);
  await expect(panel(page).locator("#waiting-link-daily-form")).toHaveCount(0);
  await expect(panel(page).locator(".waiting-record-history-count")).toHaveText(
    "1",
  );
  await expect(panel(page).locator(".waiting-record-history li")).toHaveCount(
    1,
  );
  await expect(panel(page).locator(":scope > .modal-footer button")).toHaveText(
    ["Kaydı düzenle", "Kapat"],
  );
  await close(page);
  expect(await saved(page)).toBe(raw);
});

test("the history-heading follow-up saves one real contact and returns to the same panel scroll and focus before exact Undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  const { records, raw } = await seed(page);
  const context = await sourceContext(page);
  await open(page, "waiting-actions-open");
  const body = panel(page).locator(".waiting-record-body");
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const followUp = panel(page).locator(
    '.waiting-record-section-heading [data-action="waiting-record-followup"]',
  );
  await followUp.scrollIntoViewIfNeeded();
  const scroll = await body.evaluate((element) => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await followUp.click();
  const dialog = page.locator("#waiting-followup-dialog");
  await expect(dialog).toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute(
    "data-record-id",
    "waiting-actions-open",
  );
  await dialog.locator('[name="followUpDate"]').fill("09.11.2026");
  await dialog.locator('[name="followUpNote"]').fill(NOTE);
  await dialog.locator('[name="nextFollowUpDate"]').fill("12.11.2026");
  await dialog
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(followUp).toBeFocused();
  expect(await body.evaluate((element) => element.scrollTop)).toBe(scroll);
  expect(await sourceContext(page)).toEqual(context);
  const after = await stored(page);
  const updated = after.records.find((item) => item.id === records[0].id);
  expect(updated.followUpLog).toHaveLength(2);
  const added = updated.followUpLog[1];
  expect(added).toEqual({
    id: expect.any(String),
    date: "2026-11-09",
    note: NOTE,
    nextFollowUpDate: "2026-11-12",
  });
  expect(updated).toEqual({
    ...records[0],
    lastFollowUpDate: "2026-11-09",
    nextFollowUpDate: "2026-11-12",
    latestUpdate: NOTE,
    updatedAt: NOW.toISOString(),
    followUpLog: [...records[0].followUpLog, added],
  });
  expect(after.records.slice(1)).toEqual(records.slice(1));
  expect(after.odak.history).toHaveLength(1);
  await expect(panel(page).locator(".waiting-record-history-count")).toHaveText(
    "2",
  );
  await expect(
    panel(page).locator(".waiting-record-history li").first(),
  ).toHaveAttribute("data-followup-id", added.id);
  await expect(
    panel(page).locator(".waiting-record-history-note").first(),
  ).toHaveText(NOTE);
  await expect(panel(page).locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.waitingActionsInjected),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(raw);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute(
    "data-record-id",
    "waiting-actions-open",
  );
  await expect(panel(page).locator(".waiting-record-history-count")).toHaveText(
    "1",
  );
  await expect(panel(page).locator(".waiting-record-history li")).toHaveCount(
    1,
  );
  expect(await sourceContext(page)).toEqual(context);
  await close(page);
  await page.reload();
  expect(await saved(page)).toBe(raw);
});
