import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const clockPages = new WeakSet();
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
const stamp = (index) =>
  new Date(Date.UTC(2026, 10, 1, 9, 0, index)).toISOString();
const make = (input) =>
  createRecord({ createdAt: stamp(0), updatedAt: stamp(0), ...input });
const rows = (page) =>
  page.locator(".full-table > tbody > tr[data-record-row]");
const ids = (page) =>
  rows(page).evaluateAll((items) => items.map((item) => item.dataset.id));
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const scope = (page, value) =>
  page.locator(`[data-action="list-scope"][data-scope="${value}"]`);
const next = (page) =>
  page.getByRole("button", { name: "Sonraki sayfa", exact: true });

async function seed(page, records) {
  if (!clockPages.has(page)) {
    await page.clock.install({ time: NOW });
    await page.clock.pauseAt(NOW);
    clockPages.add(page);
  }
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("list-controls-seeded")) return;
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
      sessionStorage.setItem("list-controls-seeded", "true");
    },
    { key: KEY, records },
  );
  await page.goto("/");
}

test("every work list limits a page to fifty records and opens with the newest records first", async ({
  page,
}) => {
  const records = TYPES.flatMap((type) =>
    Array.from({ length: 52 }, (_, index) =>
      make({
        id: `pages-${type}-${index}`,
        type,
        title: `${type} sayfalı kayıt ${index}`,
        createdAt: stamp(index),
      }),
    ),
  );
  await seed(page, records);
  const before = await saved(page);
  for (const type of TYPES) {
    await view(page, type);
    await expect(
      page.locator(".list-controls-bar > .list-view-toolbar"),
    ).toBeVisible();
    await expect(page.locator(".list-controls-bar > .filters")).toBeVisible();
    const filterSizes = await page
      .locator(".list-controls-bar .filter-surface")
      .evaluateAll((cards) =>
        cards.map((card) => ({
          height: card.getBoundingClientRect().height,
          captionWidth: card
            .querySelector(".filter-caption")
            .getBoundingClientRect().width,
        })),
      );
    expect(filterSizes.length).toBeGreaterThan(0);
    for (const size of filterSizes) {
      expect(size.height).toBeLessThanOrEqual(34);
      expect(size.captionWidth).toBeLessThanOrEqual(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("#list-sort")).toHaveValue("created-desc");
    await expect(rows(page)).toHaveCount(50);
    expect((await ids(page))[0]).toBe(`pages-${type}-51`);
    await expect(page.locator(".pagination-summary")).toHaveText(
      "1–50 / 52 kayıt",
    );
    await expect(
      page.getByRole("button", { name: "Önceki sayfa", exact: true }),
    ).toBeDisabled();
    await next(page).click();
    await expect(rows(page)).toHaveCount(2);
    expect(await ids(page)).toEqual([`pages-${type}-1`, `pages-${type}-0`]);
    await expect(page.locator(".pagination-summary")).toHaveText(
      "51–52 / 52 kayıt",
    );
    await expect(next(page)).toBeDisabled();
  }
  expect(await saved(page)).toBe(before);
});

test("all modules offer creation sorting while dated modules also sort calendar dates with undated work last", async ({
  page,
}) => {
  const records = TYPES.flatMap((type) => [
    make({
      id: `sort-${type}-old`,
      type,
      title: `${type} eski kayıt`,
      createdAt: stamp(0),
      updatedAt: stamp(9),
      dueDate: "2026-11-10",
      ...(type === "waiting" ? { nextFollowUpDate: "2026-11-20" } : {}),
    }),
    make({
      id: `sort-${type}-new`,
      type,
      title: `${type} yeni kayıt`,
      createdAt: stamp(2),
      dueDate: "2026-11-20",
      ...(type === "waiting" ? { nextFollowUpDate: "2026-11-10" } : {}),
    }),
    make({
      id: `sort-${type}-missing`,
      type,
      title: `${type} tarihsiz kayıt`,
      createdAt: stamp(1),
    }),
  ]);
  await seed(page, records);
  const before = await saved(page);
  for (const type of TYPES) {
    await view(page, type);
    expect(
      await page
        .locator("#list-sort option")
        .evaluateAll((options) => options.map((option) => option.value)),
    ).toEqual([
      "created-desc",
      "created-asc",
      ...(["yearly", "meeting"].includes(type) ? [] : ["due-asc", "due-desc"]),
    ]);
    await expect(page.locator("#period-filter")).toHaveCount(
      ["yearly", "meeting"].includes(type) ? 0 : 1,
    );
    await page.locator("#list-sort").selectOption("created-desc");
    await expect(page.locator(".clear-filters")).toHaveCount(0);
    expect(await ids(page)).toEqual([
      `sort-${type}-new`,
      `sort-${type}-missing`,
      `sort-${type}-old`,
    ]);
    await page.locator("#list-sort").selectOption("created-asc");
    await expect(page.locator(".clear-filters")).toHaveCount(0);
    expect(await ids(page)).toEqual([
      `sort-${type}-old`,
      `sort-${type}-missing`,
      `sort-${type}-new`,
    ]);
    if (["yearly", "meeting"].includes(type)) {
      await expect(
        page.locator('#list-sort option[value^="due-"]'),
      ).toHaveCount(0);
      if (type === "meeting") {
        await expect(page.locator("#priority-filter")).toHaveCount(0);
        await expect(
          page.locator(
            ".meeting-table .inline-priority, .meeting-table .inline-date",
          ),
        ).toHaveCount(0);
        await expect(page.locator(".meeting-table thead")).not.toContainText(
          "Teslim tarihi",
        );
        await expect(page.locator(".meeting-table thead")).not.toContainText(
          "Öncelik",
        );
      }
      continue;
    }
    const [near, far] = type === "waiting" ? ["new", "old"] : ["old", "new"];
    await page.locator("#list-sort").selectOption("due-asc");
    await expect(page.locator(".clear-filters")).toHaveCount(0);
    expect(await ids(page)).toEqual([
      `sort-${type}-${near}`,
      `sort-${type}-${far}`,
      `sort-${type}-missing`,
    ]);
    await page.locator("#list-sort").selectOption("due-desc");
    await expect(page.locator(".clear-filters")).toHaveCount(0);
    expect(await ids(page)).toEqual([
      `sort-${type}-${far}`,
      `sort-${type}-${near}`,
      `sort-${type}-missing`,
    ]);
  }
  expect(await saved(page)).toBe(before);
});

test("scope buttons replace repeated completion choices and the entire filter card opens its native selection", async ({
  page,
}) => {
  const records = TYPES.flatMap((type) =>
    ["planned", "in_progress", "completed", "cancelled", "transferred"].map(
      (status, index) =>
        make({
          id: `scope-${type}-${status}`,
          type,
          status,
          title: `${type} görünüm ${status}`,
          createdAt: stamp(index),
        }),
    ),
  );
  await seed(page, records);
  const before = await saved(page);
  for (const type of TYPES) {
    await view(page, type);
    await expect(scope(page, "open")).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(2);
    await expect(
      page.locator('#status-filter option[value="active"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('#status-filter option[value="completed"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('#status-filter option[value="cancelled"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('#status-filter option[value="transferred"]'),
    ).toHaveCount(0);

    if (type === "daily") {
      const card = page.locator(".filter-surface:has(#status-filter)");
      const geometry = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + 7,
          y: rect.top + 5,
          hits: [
            [rect.left + 7, rect.top + 5],
            [rect.left + 12, rect.bottom - 9],
            [rect.right - 10, rect.bottom - 10],
          ].map(([x, y]) => document.elementFromPoint(x, y)?.id),
        };
      });
      expect(geometry.hits).toEqual([
        "status-filter",
        "status-filter",
        "status-filter",
      ]);
      await page.mouse.click(geometry.x, geometry.y);
      await page.keyboard.press("Escape");
      await expect(page.locator("#status-filter")).toBeFocused();
    }
    await page
      .locator("#status-filter")
      .selectOption(type === "meeting" ? "planned" : "in_progress");
    await expect(
      page.locator(".filter-surface:has(#status-filter) .filter-value"),
    ).toHaveText(type === "meeting" ? "Planlanacak" : "Devam ediyor");
    expect(await ids(page)).toEqual(
      type === "meeting"
        ? ["scope-meeting-in_progress", "scope-meeting-planned"]
        : [`scope-${type}-in_progress`],
    );

    await scope(page, "completed").click();
    await expect(scope(page, "completed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#status-filter")).toHaveCount(0);
    expect(await ids(page)).toEqual([`scope-${type}-completed`]);

    await scope(page, "all").click();
    await expect(scope(page, "all")).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('#status-filter option[value="completed"]'),
    ).toHaveCount(0);
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator('#status-filter option[value="all"]')).toHaveText(
      "Tüm durumlar",
    );
    await page.locator("#status-filter").selectOption("transferred");
    expect(await ids(page)).toEqual([`scope-${type}-transferred`]);
    await scope(page, "open").click();
    await expect(page.locator("#status-filter")).toHaveValue("all");
    await expect(rows(page)).toHaveCount(2);
  }
  expect(await saved(page)).toBe(before);
});

test("filters, search, sort and scope reset pagination and deleting the last page clamps safely with exact undo", async ({
  page,
}) => {
  const records = ["planned", "completed"].flatMap((status) =>
    Array.from({ length: 51 }, (_, index) =>
      make({
        id: `reset-${status}-${index}`,
        title: `${status} sayfalı kayıt ${index}`,
        status,
        priority: index === 0 ? "high" : "normal",
        createdAt: stamp(index),
      }),
    ),
  );
  await seed(page, records);
  await view(page, "daily");
  const before = await saved(page);

  await next(page).click();
  await expect(rows(page)).toHaveCount(1);
  await page.locator("#list-sort").selectOption("created-asc");
  await expect(page.locator(".pagination-summary")).toHaveText(
    "1–50 / 51 kayıt",
  );
  expect((await ids(page))[0]).toBe("reset-planned-0");
  await next(page).click();
  await page.locator("#priority-filter").selectOption("high");
  expect(await ids(page)).toEqual(["reset-planned-0"]);
  await expect(page.locator(".list-pagination")).toHaveCount(0);
  await page.locator('[data-action="clear-filters"]').click();
  await expect(page.locator("#list-sort")).toHaveValue("created-asc");
  await next(page).click();
  await page.locator("#global-search").fill("planned sayfalı kayıt 50");
  expect(await ids(page)).toEqual(["reset-planned-50"]);
  await expect(page.locator(".list-pagination")).toHaveCount(0);
  await page.locator("#global-search").fill("");
  await expect(page.locator(".pagination-summary")).toHaveText(
    "1–50 / 51 kayıt",
  );
  await next(page).click();
  await scope(page, "completed").click();
  await expect(page.locator(".pagination-summary")).toHaveText(
    "1–50 / 51 kayıt",
  );
  await scope(page, "all").click();
  await expect(page.locator(".pagination-summary")).toHaveText(
    "1–50 / 102 kayıt",
  );
  await scope(page, "open").click();
  expect(await saved(page)).toBe(before);

  await next(page).click();
  const removedId = (await ids(page))[0];
  await rows(page).locator(".task-name").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('#editor [data-action="delete"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await expect(page.locator(".list-pagination")).toHaveCount(0);
  expect((await readRecords(page)).some((item) => item.id === removedId)).toBe(
    false,
  );
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  expect(await saved(page)).toBe(before);
  await expect(page.locator(".pagination-summary")).toHaveText(
    "1–50 / 51 kayıt",
  );
});
