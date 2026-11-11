import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

async function seed(page, records, viewport = { width: 1536, height: 1000 }) {
  const original = JSON.stringify({ version: 1, records });
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, original }) => localStorage.setItem(key, original),
    { key: KEY, original },
  );
  await page.goto("/");
  return original;
}

const weeklyGoals = Array.from({ length: 5 }, (_, index) =>
  make({
    id: `paging-week-${index + 1}`,
    type: "weekly",
    title: `Haftalık sayfalama hedefi ${index + 1}`,
    periodKey: "2026-W45",
  }),
);

test("weekly goal cards page with the same arrows as follow-up cards, keep focus and reset on search without writing", async ({
  page,
}) => {
  const original = await seed(page, weeklyGoals);
  const panel = page.locator(".weekly-dashboard-panel");
  const titles = panel.locator(".dashboard-goal-title");
  const previous = panel.getByRole("button", { name: "Önceki hedefler" });
  const next = panel.getByRole("button", { name: "Sonraki hedefler" });
  await expect(panel.locator(".dashboard-panel-count")).toHaveText("5");
  await expect(panel.locator(".weekly-goal-page-label")).toHaveText(
    "Sayfa 1 / 3",
  );
  await expect(titles).toHaveText([
    "Haftalık sayfalama hedefi 1",
    "Haftalık sayfalama hedefi 2",
  ]);
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(titles).toHaveText([
    "Haftalık sayfalama hedefi 3",
    "Haftalık sayfalama hedefi 4",
  ]);
  await expect(next).toBeFocused();
  await next.click();
  await expect(titles).toHaveText(["Haftalık sayfalama hedefi 5"]);
  await expect(next).toBeDisabled();
  await expect(previous).toBeFocused();
  await page.locator("#global-search").fill("sayfalama");
  await expect(panel.locator(".weekly-goal-page-label")).toHaveText(
    "Sayfa 1 / 3",
  );
  await expect(titles.first()).toHaveText("Haftalık sayfalama hedefi 1");
  await page.locator("#global-search").fill("hedefi 5");
  await expect(panel.locator(".weekly-goal-pagination")).toHaveCount(0);
  await expect(titles).toHaveText(["Haftalık sayfalama hedefi 5"]);
  expect(await saved(page)).toBe(original);
});

test("one page of weekly goals shows no pager", async ({ page }) => {
  await seed(page, weeklyGoals.slice(0, 2));
  await expect(
    page.locator(".weekly-dashboard-panel .dashboard-goal-title"),
  ).toHaveCount(2);
  await expect(page.locator(".weekly-goal-pagination")).toHaveCount(0);
});

test("the top bar stays in place while a long list scrolls", async ({
  page,
}) => {
  await seed(
    page,
    Array.from({ length: 40 }, (_, index) =>
      make({ id: `sticky-${index}`, title: `Kaydırma işi ${index + 1}` }),
    ),
    { width: 1280, height: 720 },
  );
  await page.locator('#nav [data-view="daily"]').click();
  const topbar = page.locator(".main > .topbar");
  const before = await topbar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
  const after = await topbar.boundingBox();
  expect(after.y).toBe(0);
  expect(after.height).toBe(before.height);
  await expect(page.locator("#global-search")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Yeni kayıt", exact: true }),
  ).toBeInViewport();
  const covering = await page.evaluate(() => {
    const bar = document
      .querySelector(".main > .topbar")
      .getBoundingClientRect();
    const hit = document.elementFromPoint(
      bar.left + bar.width / 2,
      bar.bottom - 4,
    );
    return Boolean(hit?.closest(".topbar"));
  });
  expect(covering).toBe(true);
});

test("title icons stay on the first line beside a wrapping title in every list row", async ({
  page,
}) => {
  await seed(
    page,
    [
      make({
        id: "icon-week",
        type: "weekly",
        title: "Bağlı hafta",
        periodKey: "2026-W45",
      }),
      make({
        id: "icon-note",
        title: "Salgı ölçümünün ömür uzatım dahil eklenmesi ve doğrulanması",
        description: "Not",
      }),
      make({
        id: "icon-parent",
        title: "Plastik Taşına Sandığı markalama ve etiket kontrolü yapılacak",
        parentId: "icon-week",
      }),
      make({
        id: "icon-both",
        title: "Hedefe bağlı ve notlu uzun başlıklı günlük iş kaydı burada",
        parentId: "icon-week",
        description: "Not",
      }),
    ],
    { width: 1000, height: 800 },
  );
  await page.locator('#nav [data-view="daily"]').click();
  for (const id of ["icon-note", "icon-parent", "icon-both"]) {
    const row = page.locator(`tr[data-id="${id}"]`);
    const geometry = await row.evaluate((element) => {
      const title = element.querySelector(".task-name");
      const icons = [
        ...element.querySelectorAll(
          ".task-name-line :is(.record-parent-link, .record-note-trigger)",
        ),
      ];
      const titleBox = title.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
      return {
        lines: Math.round(titleBox.height / lineHeight),
        titleTop: titleBox.top,
        titleRight: titleBox.right,
        icons: icons.map((icon) => icon.getBoundingClientRect().toJSON()),
      };
    });
    expect(geometry.lines, id).toBeGreaterThan(1);
    expect(geometry.icons.length, id).toBeGreaterThan(0);
    for (const icon of geometry.icons) {
      expect(icon.left, id).toBeGreaterThanOrEqual(geometry.titleRight);
      expect(Math.abs(icon.top - geometry.titleTop), id).toBeLessThan(6);
    }
  }
});
