import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: `İş ${id}`,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const unresolved = (id, input = {}) =>
  record(id, {
    sourceFields: {
      __unresolvedParent: "Eski hedef adı",
      retained: { value: "Kaynak bilgisi korunmalı" },
    },
    ...input,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const scope = (page, value) =>
  page.locator(`[data-action="list-scope"][data-scope="${value}"]`);
const ids = (page) =>
  page
    .locator(".full-table > tbody > tr[data-record-row]")
    .evaluateAll((rows) => rows.map((row) => row.dataset.id).sort());
const warning = (page) => page.locator(".link-warning");

async function seed(page, records) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("list-refinements-018-seeded")) return;
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
      sessionStorage.setItem("list-refinements-018-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
}

test("closed imported links remain historical and never advertise an empty unresolved-work action", async ({
  page,
}) => {
  await seed(page, [
    record("ordinary", { title: "Normal açık iş" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      unresolved(status, { title: `İPEK eski ${status}`, status }),
    ),
  ]);
  const before = await saved(page);
  await view(page, "daily");
  await expect(warning(page)).toHaveCount(0);
  await scope(page, "all").click();
  expect(await ids(page)).toEqual([
    "cancelled",
    "completed",
    "ordinary",
    "transferred",
  ]);
  await expect(warning(page)).toHaveCount(0);
  await page.locator("#global-search").fill("ipek");
  expect(await ids(page)).toEqual(["cancelled", "completed", "transferred"]);
  await expect(warning(page)).toHaveCount(0);
  await scope(page, "completed").click();
  await expect(warning(page)).toHaveCount(0);
  expect(await saved(page)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("the unresolved-work banner counts active query matches and clears conflicting local filters while preserving query and sort", async ({
  page,
}) => {
  await seed(page, [
    unresolved("ipek-open", {
      title: "İPEK açık planlı iş",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-20",
    }),
    unresolved("other-open", { title: "Diğer açık planlı iş" }),
    unresolved("ipek-closed", {
      title: "İPEK kapanmış iş",
      status: "completed",
    }),
    unresolved("ipek-adhoc", { title: "İPEK anlık iş", workContext: "ad_hoc" }),
    record("ipek-ordinary", {
      title: "İPEK bağımsız talep",
      workContext: "ad_hoc",
      priority: "urgent",
      dueDate: "2026-11-07",
    }),
  ]);
  const before = await saved(page);
  await view(page, "daily");
  await expect(warning(page).locator("span")).toContainText(/^2\s/);
  await page.locator("#global-search").fill("ipek");
  await expect(warning(page).locator("span")).toContainText(/^1\s/);
  await scope(page, "all").click();
  await page.locator("#list-sort").selectOption("created-asc");
  await page.locator("#work-context-filter").selectOption("ad_hoc");
  await page.locator("#status-filter").selectOption("planned");
  await page.locator("#priority-filter").selectOption("urgent");
  await page.locator("#period-filter").selectOption("today");
  expect(await ids(page)).toEqual(["ipek-ordinary"]);
  await expect(warning(page).locator("span")).toContainText(/^1\s/);
  await warning(page).locator('[data-action="unlinked"]').click();
  await expect(scope(page, "open")).toHaveAttribute("aria-pressed", "true");
  for (const selector of [
    "#work-context-filter",
    "#status-filter",
    "#priority-filter",
    "#period-filter",
  ])
    await expect(page.locator(selector)).toHaveValue("all");
  await expect(page.locator("#global-search")).toHaveValue("ipek");
  await expect(page.locator("#list-sort")).toHaveValue("created-asc");
  expect(await ids(page)).toEqual(["ipek-open"]);
  await expect(warning(page).locator('[data-action="unlinked"]')).toContainText(
    "Tüm açık işleri göster",
  );
  await warning(page).locator('[data-action="unlinked"]').click();
  expect(await ids(page)).toEqual(["ipek-adhoc", "ipek-open", "ipek-ordinary"]);
  await scope(page, "completed").click();
  await expect(warning(page)).toHaveCount(0);
  await scope(page, "all").click();
  await expect(warning(page).locator("span")).toContainText(/^1\s/);
  await page.locator("#global-search").fill("eşleşmeyen arama");
  await expect(warning(page)).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});

test("clear applies to real list filters and preserves sort, visibility tab, selected planning period and global search", async ({
  page,
}) => {
  await seed(page, [
    record("week-first", {
      type: "weekly",
      title: "İPEK ilk hedef",
      periodKey: "2026-W45",
      priority: "high",
      dueDate: "2026-11-07",
    }),
    record("week-second", {
      type: "weekly",
      title: "İPEK ikinci hedef",
      periodKey: "2026-W45",
      priority: "low",
      status: "waiting",
      dueDate: "2026-11-20",
    }),
    record("week-done", {
      type: "weekly",
      title: "İPEK bitmiş hedef",
      periodKey: "2026-W45",
      status: "completed",
      priority: "low",
      dueDate: "2026-11-07",
    }),
    record("week-future", {
      type: "weekly",
      title: "İPEK gelecek hedef",
      periodKey: "2026-W46",
    }),
  ]);
  const before = await saved(page);
  await view(page, "weekly");
  await page.locator("#list-sort").selectOption("created-asc");
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  await scope(page, "all").click();
  await page.locator('[data-action="period-current"]').click();
  await page.locator("#global-search").fill("ipek");
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  await page.locator("#status-filter").selectOption("waiting");
  await page.locator("#priority-filter").selectOption("high");
  await page.locator("#period-filter").selectOption("overdue");
  await page.locator('[data-action="clear-filters"]').click();
  await expect(scope(page, "all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  await expect(page.locator("#list-sort")).toHaveValue("created-asc");
  await expect(page.locator("#global-search")).toHaveValue("ipek");
  for (const selector of [
    "#status-filter",
    "#priority-filter",
    "#period-filter",
  ])
    await expect(page.locator(selector)).toHaveValue("all");
  expect(await ids(page)).toEqual(["week-done", "week-first", "week-second"]);
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  await scope(page, "completed").click();
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  await page.locator("#priority-filter").selectOption("high");
  await page.locator('[data-action="clear-filters"]').click();
  await expect(scope(page, "completed")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  await expect(page.locator("#list-sort")).toHaveValue("created-asc");
  await expect(page.locator("#global-search")).toHaveValue("ipek");
  await expect(page.locator("#status-filter")).toHaveCount(0);
  expect(await ids(page)).toEqual(["week-done"]);
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});

test("planning-week navigation stays separate from this week's deadlines and follow-up filters name their own date", async ({
  page,
}) => {
  await seed(page, [
    record("current-plan", {
      type: "weekly",
      periodKey: "2026-W45",
      dueDate: "2026-11-20",
    }),
    record("old-plan-due-now", {
      type: "weekly",
      periodKey: "2026-W44",
      dueDate: "2026-11-07",
    }),
    record("waiting-next-today", {
      type: "waiting",
      nextFollowUpDate: "2026-11-07",
      dueDate: "2026-11-20",
    }),
    record("waiting-delivery-today", {
      type: "waiting",
      nextFollowUpDate: "2026-11-20",
      dueDate: "2026-11-07",
    }),
  ]);
  const before = await saved(page);
  await view(page, "weekly");
  await expect(page.locator('#period-filter option[value="week"]')).toHaveText(
    "Bu hafta teslim",
  );
  await expect(page.locator('#period-filter option[value="today"]')).toHaveText(
    "Bugün teslim",
  );
  await page.locator('[data-action="period-current"]').click();
  expect(await ids(page)).toEqual(["current-plan"]);
  await page.locator("#period-filter").selectOption("week");
  expect(await ids(page)).toEqual([]);
  await expect(page.locator("#planning-period-label")).toHaveText(
    "2 – 8 Kasım 2026",
  );
  await page.locator('[data-action="period-all"]').click();
  expect(await ids(page)).toEqual(["old-plan-due-now"]);
  await view(page, "waiting");
  await expect(page.locator('#period-filter option[value="week"]')).toHaveText(
    "Bu hafta takip",
  );
  await expect(page.locator('#period-filter option[value="today"]')).toHaveText(
    "Bugün takip",
  );
  await page.locator("#period-filter").selectOption("today");
  expect(await ids(page)).toEqual(["waiting-next-today"]);
  expect(await saved(page)).toBe(before);
});
