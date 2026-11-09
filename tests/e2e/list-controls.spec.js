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
const view = async (page, type) => {
  const toggle = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
};
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

async function expectSingleFilterRow(group) {
  const layout = await group.evaluate((element) => {
    const style = getComputedStyle(element);
    const children = [...element.children].filter(
      (child) => child.getBoundingClientRect().width > 0,
    );
    return {
      centers: children.map((child) => {
        const box = child.getBoundingClientRect();
        return box.y + box.height / 2;
      }),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowX: style.overflowX,
      requiredWidth:
        children.reduce((sum, child) => {
          const childStyle = getComputedStyle(child);
          return (
            sum +
            child.getBoundingClientRect().width +
            parseFloat(childStyle.marginLeft) +
            parseFloat(childStyle.marginRight)
          );
        }, 0) +
        Math.max(0, children.length - 1) * parseFloat(style.columnGap || 0) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight),
    };
  });
  expect(layout.centers.length).toBeGreaterThan(0);
  expect(
    Math.max(...layout.centers) - Math.min(...layout.centers),
  ).toBeLessThanOrEqual(1);
  if (layout.scrollWidth > layout.clientWidth + 1) {
    expect(["auto", "scroll"]).toContain(layout.overflowX);
    expect(layout.requiredWidth).toBeGreaterThan(layout.clientWidth - 1);
  }
}

async function expectReachableFilter(control) {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  const geometry = await control.evaluate((element) => {
    const native = element.tagName === "SELECT";
    const surface = native ? element.closest(".filter-surface") : element;
    const group = surface.closest(
      ".filters, .focus-filters, .list-view-toolbar",
    );
    const text = native ? surface.querySelector(".filter-value") : surface;
    const box = surface.getBoundingClientRect();
    const groupBox = group.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    const clip = {
      left: Math.max(0, groupBox.left + group.clientLeft),
      right: Math.min(
        innerWidth,
        groupBox.left + group.clientLeft + group.clientWidth,
      ),
      top: Math.max(0, groupBox.top + group.clientTop),
      bottom: Math.min(
        innerHeight,
        groupBox.top + group.clientTop + group.clientHeight,
      ),
    };
    const textRects = [];
    const textLines = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      const rects = [...range.getClientRects()];
      textLines.push(rects.length);
      textRects.push(...rects.map((rect) => rect.toJSON()));
    }
    return {
      box: box.toJSON(),
      textBox: textBox.toJSON(),
      textRects,
      textLines,
      clip,
      textWidth: text.scrollWidth,
      textClientWidth: text.clientWidth,
      accessibleName:
        element.getAttribute("aria-label") || element.textContent.trim(),
      hits: [
        [box.left + 3, box.top + 3],
        [box.right - 3, box.bottom - 3],
        [box.left + box.width / 2, box.top + box.height / 2],
      ].map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return native ? hit === element : hit?.closest("button") === element;
      }),
    };
  });
  expect(geometry.accessibleName).not.toBe("");
  expect(geometry.box.left).toBeGreaterThanOrEqual(geometry.clip.left - 1);
  expect(geometry.box.right).toBeLessThanOrEqual(geometry.clip.right + 1);
  expect(geometry.hits).toEqual([true, true, true]);
  expect(geometry.textRects.length).toBeGreaterThan(0);
  expect(geometry.textLines.every((lines) => lines === 1)).toBe(true);
  expect(geometry.textWidth).toBeLessThanOrEqual(geometry.textClientWidth + 1);
  for (const rect of geometry.textRects) {
    expect(rect.left).toBeGreaterThanOrEqual(
      Math.max(geometry.clip.left, geometry.textBox.left) - 0.5,
    );
    expect(rect.right).toBeLessThanOrEqual(
      Math.min(geometry.clip.right, geometry.textBox.right) + 0.5,
    );
    expect(rect.top).toBeGreaterThanOrEqual(geometry.clip.top - 0.5);
    expect(rect.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 0.5);
  }
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
        ? ["scope-meeting-planned"]
        : [`scope-${type}-in_progress`],
    );

    await scope(page, "completed").click();
    await expect(scope(page, "completed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#status-filter")).toHaveCount(0);
    const closedIds =
      type === "meeting"
        ? [
            "scope-meeting-transferred",
            "scope-meeting-cancelled",
            "scope-meeting-completed",
          ]
        : [`scope-${type}-completed`];
    expect(await ids(page)).toEqual(closedIds);

    await scope(page, "all").click();
    await expect(scope(page, "all")).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('#status-filter option[value="completed"]'),
    ).toHaveCount(type === "meeting" ? 1 : 0);
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator('#status-filter option[value="all"]')).toHaveText(
      "Tüm durumlar",
    );
    await page
      .locator("#status-filter")
      .selectOption(type === "meeting" ? "completed" : "transferred");
    expect(await ids(page)).toEqual(
      type === "meeting" ? closedIds : [`scope-${type}-transferred`],
    );
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

test("filters remain one reachable row beside a fixed native sort icon across every list and the dashboard without saving workspace data", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const records = TYPES.flatMap((type) => [
    make({
      id: `geometry-${type}-old`,
      type,
      title: `${type} eski`,
      createdAt: stamp(0),
      periodKey:
        { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] || "",
    }),
    make({
      id: `geometry-${type}-new`,
      type,
      title: `${type} yeni`,
      createdAt: stamp(2),
      periodKey:
        { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] || "",
    }),
  ]);
  await seed(page, records);
  const before = await saved(page);
  await view(page, "daily");
  await page.locator("#list-sort").selectOption("created-asc");
  await page.locator("#list-sort").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#list-sort")).toHaveValue("created-desc");
  await page.locator("#list-sort").selectOption("created-asc");
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 850, height: 700 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      for (const type of TYPES) {
        await view(page, type);
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page
          .locator("#status-filter")
          .selectOption(records.find((record) => record.type === type).status);
        const filters = page.locator(".list-controls-bar > .filters");
        await expectSingleFilterRow(filters);
        const label = page.locator(".list-controls-bar > .list-sort");
        const select = page.getByRole("combobox", {
          name: "Kayıtları sırala",
          exact: true,
        });
        await expect(label).toBeVisible();
        await expect(select).toHaveValue("created-asc");
        await expect(label).toHaveAttribute(
          "title",
          "Sırala: Oluşturma · en eski",
        );
        await expect(select).toHaveAttribute(
          "title",
          "Sırala: Oluşturma · en eski",
        );
        await expect(label.locator("svg")).toHaveCount(1);
        const geometry = await label.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const bar = element
            .closest(".list-controls-bar")
            .getBoundingClientRect();
          const native = element
            .querySelector("select")
            .getBoundingClientRect();
          const hit = (x, y) =>
            document.elementFromPoint(x, y)?.id === "list-sort";
          return {
            width: box.width,
            height: box.height,
            top: box.top - bar.top,
            right: bar.right - box.right,
            native: { width: native.width, height: native.height },
            text: [...element.childNodes]
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent.trim())
              .join(""),
            hits: [
              [box.left + 3, box.top + 3],
              [box.right - 3, box.bottom - 3],
              [box.left + box.width / 2, box.top + box.height / 2],
            ].map(([x, y]) => hit(x, y)),
          };
        });
        for (const dimension of [
          geometry.width,
          geometry.height,
          geometry.native.width,
          geometry.native.height,
        ])
          expect(dimension).toBeCloseTo(32, 0);
        expect(geometry.top).toBeCloseTo(10, 0);
        expect(geometry.right).toBeCloseTo(viewport.width <= 600 ? 12 : 16, 0);
        expect(geometry.text).toBe("");
        expect(geometry.hits).toEqual([true, true, true]);
        if (viewport.width <= 600) {
          const scopeButtons = page.locator(
            ".list-controls-bar .list-scope-tabs > button",
          );
          const scopeBefore = await scopeButtons.evaluateAll((buttons) =>
            buttons.map((button) => ({
              scope: button.dataset.scope,
              pressed: button.getAttribute("aria-pressed"),
            })),
          );
          const filtersBefore = await filters
            .locator("select")
            .evaluateAll((controls) =>
              controls.map((control) => ({
                id: control.id,
                value: control.value,
              })),
            );
          await expect(scopeButtons).toHaveCount(3);
          for (const button of await scopeButtons.all())
            await expectReachableFilter(button);
          expect(
            await scopeButtons.evaluateAll((buttons) =>
              buttons.map((button) => ({
                scope: button.dataset.scope,
                pressed: button.getAttribute("aria-pressed"),
              })),
            ),
          ).toEqual(scopeBefore);
          expect(
            await filters.locator("select").evaluateAll((controls) =>
              controls.map((control) => ({
                id: control.id,
                value: control.value,
              })),
            ),
          ).toEqual(filtersBefore);
          expect(await saved(page)).toBe(before);
        }
        for (const native of await filters.locator("select").all()) {
          await expectReachableFilter(native);
          const edge = await label.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const bar = element
              .closest(".list-controls-bar")
              .getBoundingClientRect();
            return { top: box.top - bar.top, right: bar.right - box.right };
          });
          expect(edge.top).toBeCloseTo(10, 0);
          expect(edge.right).toBeCloseTo(viewport.width <= 600 ? 12 : 16, 0);
        }
        await expectReachableFilter(filters.locator(".clear-filters"));
        expect(await ids(page)).toEqual([
          `geometry-${type}-old`,
          `geometry-${type}-new`,
        ]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(await saved(page)).toBe(before);
      }
      await view(page, "dashboard");
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      const focusFilters = page.locator(".focus-filters");
      await expectSingleFilterRow(focusFilters);
      const keys = await focusFilters
        .locator('[data-action="focus-filter"]')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.dataset.filter),
        );
      for (const key of keys) {
        const control = focusFilters.locator(`[data-filter="${key}"]`);
        await expectReachableFilter(control);
        await control.click();
        await expect(control).toHaveAttribute("aria-pressed", "true");
        await expectSingleFilterRow(focusFilters);
        expect(await saved(page)).toBe(before);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});
