import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const source = (id, extra = {}) =>
  make({
    id,
    type: "meeting",
    title: `Toplantı kararı ${id}`,
    status: "planned",
    decision: "Karar ve toplantı bağlamı korunmalı.",
    description: "Kaynak notu değişmemeli.",
    sourceFields: { original: { value: "Ham kaynak korunmalı" } },
    ...extra,
  });
const target = (id, sourceId, type, extra = {}) =>
  make({
    id,
    type,
    title: `${type} yürütme kaydı ${id}`,
    status: "planned",
    dueDate: "2026-11-10",
    nextAction: `${type} için gerçek sonraki adım.`,
    ...(type === "waiting"
      ? { expectedFrom: "Dış ekip", nextFollowUpDate: "2026-11-12" }
      : { owner: "İş sorumlusu" }),
    sourceFields: { __followupSource: { recordId: sourceId, type: "meeting" } },
    ...extra,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = async (page) => JSON.parse(await saved(page));
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const routeStatus = (page, id, targetId) =>
  row(page, id).locator(`.status-trigger[data-target-id="${targetId}"]`);
const menu = (page) => page.locator("#status-menu");
const group = (page, name) =>
  menu(page).getByRole("group", { name, exact: true });
const option = (page, id, status) =>
  menu(page).locator(
    `.status-option[data-id="${id}"][data-status="${status}"]`,
  );
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(page, items) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("meeting-status-menu-0211-seeded")) return;
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
      sessionStorage.setItem("meeting-status-menu-0211-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="meeting"]').click();
}

async function openMenu(page, id, targetId = null) {
  const trigger = targetId
    ? routeStatus(page, id, targetId)
    : row(page, id).locator('[data-action="status-menu"]').first();
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Toplantı aksiyonları");
  return trigger;
}

test("a linked meeting exposes independent job and follow-up badges and changes each real target with one exact Undo", async ({
  page,
}) => {
  const items = [
    source("dual"),
    target("own", "dual", "daily"),
    target("reply", "dual", "waiting", { status: "waiting_response" }),
    make({ id: "unrelated", title: "İlişkisiz günlük iş" }),
  ];
  await seed(page, items);
  const before = await saved(page);
  const url = page.url();
  await expect(routeStatus(page, "dual", "own")).toHaveText("Yapılacak");
  await expect(routeStatus(page, "dual", "reply")).toHaveText(
    "Cevap bekleniyor",
  );
  await expect(page.locator(".meeting-table thead th")).toHaveText([
    "Aksiyon / Karar",
    "Bağlı iş",
    "Takip",
    "İşlem",
  ]);
  await expect(row(page, "dual").locator(".meeting-status-kind")).toHaveCount(
    0,
  );
  await expect(
    row(page, "dual").locator(
      '.meeting-linked-cell[data-route="daily"] .status-trigger',
    ),
  ).toHaveAttribute("data-target-id", "own");
  await expect(
    row(page, "dual").locator(
      '.meeting-linked-cell[data-route="waiting"] .status-trigger',
    ),
  ).toHaveAttribute("data-target-id", "reply");
  await expect(row(page, "dual").locator(".meeting-title-state")).toHaveCount(
    0,
  );
  await openMenu(page, "dual", "own");
  await expect(menu(page).locator(".status-menu-heading")).toContainText(
    "Aksiyon durumu",
  );
  await expect(group(page, "İşin durumu")).toContainText(items[1].title);
  await expect(group(page, "Takibin durumu")).toHaveCount(0);
  await expect(group(page, "İşin durumu")).toHaveAttribute(
    "data-target-id",
    "own",
  );
  await expect(option(page, "own", "completed")).toHaveCount(0);
  await expect(option(page, "reply", "completed")).toHaveCount(0);
  await expect(
    menu(page).locator('.status-option[data-id="dual"]'),
  ).toHaveCount(0);
  await expect(page).toHaveURL(url);
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(menu(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await openMenu(page, "dual", "own");
  await option(page, "own", "in_progress").click();
  await expect(menu(page)).not.toBeVisible();
  await expect(routeStatus(page, "dual", "own")).toHaveText("Devam ediyor");
  await expect(routeStatus(page, "dual", "reply")).toHaveText(
    "Cevap bekleniyor",
  );
  const afterFirst = await saved(page);
  const after = await store(page);
  const daily = after.records.find((item) => item.id === "own");
  expect(daily).toEqual({
    ...items[1],
    status: "in_progress",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.find((item) => item.id === "reply")).toEqual(items[2]);
  expect(after.records.find((item) => item.id === "unrelated")).toEqual(
    items[3],
  );
  expect(after.records.find((item) => item.id === "dual")).toMatchObject({
    id: "dual",
    status: "in_progress",
    title: items[0].title,
    decision: items[0].decision,
    description: items[0].description,
    sourceFields: items[0].sourceFields,
  });
  expect(after.odak.history).toHaveLength(1);
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page).toHaveURL(url);
  await openMenu(page, "dual", "reply");
  await expect(group(page, "İşin durumu")).toHaveCount(0);
  await expect(group(page, "Takibin durumu")).toContainText(items[2].title);
  await expect(option(page, "reply", "completed")).toHaveCount(0);
  await option(page, "reply", "follow_up").click();
  await expect(routeStatus(page, "dual", "reply")).toHaveText("Takipte");
  await expect(routeStatus(page, "dual", "own")).toHaveText("Devam ediyor");
  const afterReply = await store(page);
  expect(afterReply.records.find((item) => item.id === "own")).toEqual(daily);
  expect(afterReply.records.find((item) => item.id === "reply")).toEqual({
    ...items[2],
    status: "follow_up",
    updatedAt: NOW.toISOString(),
  });
  expect(afterReply.records.find((item) => item.id === "dual")).toEqual(
    after.records.find((item) => item.id === "dual"),
  );
  expect(afterReply.odak.history).toHaveLength(2);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(afterFirst);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect((await store(page)).records).toEqual(items);
});

test("the meeting closes only after both separate targets close and two Undo steps restore each exact prior state", async ({
  page,
}) => {
  const items = [
    source("completion"),
    target("own", "completion", "daily"),
    target("reply", "completion", "waiting"),
  ];
  await seed(page, items);
  const before = await saved(page);
  await openMenu(page, "completion", "own");
  await expect(option(page, "own", "completed")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="daily"]').click();
  await row(page, "own").locator(".quick-complete").click();
  await page.locator('#nav [data-view="meeting"]').click();
  const afterFirst = await saved(page);
  const first = JSON.parse(afterFirst);
  expect(first.records.find((item) => item.id === "own").status).toBe(
    "completed",
  );
  expect(first.records.find((item) => item.id === "reply")).toEqual(items[2]);
  expect(first.records.find((item) => item.id === "completion").status).toBe(
    "waiting",
  );
  await expect(row(page, "completion")).toBeVisible();
  await expect(routeStatus(page, "completion", "own")).toHaveText("Tamamlandı");
  await expect(routeStatus(page, "completion", "reply")).toHaveText("Açık");
  await openMenu(page, "completion", "reply");
  await expect(option(page, "reply", "planned")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(option(page, "reply", "completed")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="waiting"]').click();
  await row(page, "reply").locator(".quick-complete").click();
  await page.locator('#nav [data-view="meeting"]').click();
  const complete = await store(page);
  expect(complete.records.find((item) => item.id === "reply").status).toBe(
    "completed",
  );
  expect(complete.records.find((item) => item.id === "completion").status).toBe(
    "completed",
  );
  expect(complete.odak.history).toHaveLength(2);
  await expect(row(page, "completion")).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(afterFirst);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect((await store(page)).records).toEqual(items);
});

test("a single external target keeps waiting statuses and keyboard access while legacy aliases and ordinary meeting menus remain read-only", async ({
  page,
}) => {
  const items = [
    source("single"),
    target("single-reply", "single", "waiting", { status: "waiting_response" }),
    source("legacy", { status: "partially_completed" }),
    target("legacy-work", "legacy", "daily", { status: "partially_completed" }),
    source("ordinary"),
  ];
  await seed(page, items);
  const before = await saved(page);
  await openMenu(page, "single");
  await expect(group(page, "İşin durumu")).toHaveCount(0);
  await expect(group(page, "Takibin durumu")).toHaveCount(1);
  await expect(option(page, "single-reply", "planned")).toHaveText("Açık");
  await expect(option(page, "single-reply", "waiting_response")).toHaveText(
    "Cevap bekleniyor",
  );
  await expect(option(page, "single-reply", "follow_up")).toHaveText("Takipte");
  await expect(option(page, "single-reply", "completed")).toHaveCount(0);
  await expect(
    option(page, "single-reply", "waiting_response"),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    menu(page).locator('.status-option[data-id="single"]'),
  ).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(menu(page).locator(".status-option").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).locator(".status-option").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu(page).locator(".status-option").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu(page).locator(".status-option").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).not.toBeVisible();
  await openMenu(page, "legacy");
  await expect(option(page, "legacy-work", "in_progress")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    menu(page).locator('[data-status="partially_completed"]'),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openMenu(page, "ordinary");
  await expect(menu(page).getByRole("group")).toHaveCount(0);
  await expect(option(page, "ordinary", "planned")).toBeVisible();
  await expect(option(page, "ordinary", "completed")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  await openMenu(page, "single");
  await option(page, "single-reply", "follow_up").click();
  const after = await store(page);
  expect(after.records.find((item) => item.id === "single-reply")).toEqual({
    ...items[1],
    status: "follow_up",
    updatedAt: NOW.toISOString(),
  });
  expect(after.records.find((item) => item.id === "legacy-work")).toEqual(
    items[3],
  );
  expect(after.records.find((item) => item.id === "legacy")).toEqual(items[2]);
  await expect(page.locator("#editor")).not.toBeVisible();
  await undo(page);
  expect(await saved(page)).toBe(before);
});
