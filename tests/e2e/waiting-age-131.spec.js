import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const topic = (id, input = {}) =>
  make({
    id,
    type: "waiting",
    title: id,
    status: "waiting_response",
    expectedFrom: "Tedarikçi",
    nextFollowUpDate: "2026-11-12",
    ...input,
  });

async function seed(page) {
  const records = [
    topic("fresh", { sourceDate: "2026-11-05" }),
    topic("week", { sourceDate: "2026-10-30" }),
    topic("month", { sourceDate: "2026-07-23" }),
    topic("no-start"),
    topic("closed", {
      status: "completed",
      sourceDate: "2026-10-01",
      sourceFields: { "Kaç Gün Bekledi": 12 },
    }),
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem("seeded", "1");
    },
    { key: KEY, value: JSON.stringify({ version: 1, records }) },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="waiting"]').click();
}

const chip = (page, id) =>
  page.locator(`.waiting-table tr[data-id="${id}"] .waiting-start-date`);

test("waiting columns read status, last and next follow-up, then a toned waiting length", async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator(".waiting-table thead th")).toHaveText([
    "Konu / Beklenen",
    "Durum",
    "Son takip",
    "Sonraki takip",
    "Bekleme",
    "İşlem",
  ]);
  for (const [id, text, tone] of [
    ["fresh", "3 gün", "fresh"],
    ["week", "9 gün", "long"],
    ["month", "108 gün", "very-long"],
    ["no-start", "Başlangıç ekle", "missing"],
  ]) {
    await expect(chip(page, id).locator(".waiting-age")).toHaveText(text);
    await expect(chip(page, id)).toHaveAttribute("data-waiting-age-tone", tone);
    expect(await chip(page, id).evaluate((element) => element.tagName)).toBe(
      "BUTTON",
    );
    const box = await chip(page, id).boundingBox();
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([112, 30]);
  }
  await expect(chip(page, "month")).toHaveAttribute(
    "title",
    /Beklemeye başlama: 23\.07\.2026 · Başlangıç tarihini değiştir/,
  );
  await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  // A closed topic keeps its frozen length and offers no edit.
  expect(
    await chip(page, "closed").evaluate((element) => element.tagName),
  ).toBe("SPAN");
  await expect(chip(page, "closed")).not.toHaveAttribute("data-action");
});

test("the waiting chip edits the start date, never into the future, as one undo step", async ({
  page,
}) => {
  await seed(page);
  await chip(page, "week").click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await expect(picker.locator(".date-picker-day.is-selected")).toHaveAttribute(
    "data-date-day",
    "2026-10-30",
  );
  await picker.locator('[data-date-nav="1"]').click();
  await expect(picker.locator('[data-date-day="2026-11-09"]')).toBeDisabled();
  await expect(picker.locator('[data-date-day="2026-11-08"]')).toBeEnabled();
  await picker.locator('[data-date-day="2026-11-02"]').click();
  await expect(chip(page, "week").locator(".waiting-age")).toHaveText("6 gün");
  await expect(chip(page, "week")).toHaveAttribute(
    "data-waiting-age-tone",
    "fresh",
  );
  let saved = await stored(page);
  expect(saved.records.find((item) => item.id === "week").sourceDate).toBe(
    "2026-11-02",
  );
  expect(saved.odak.history.map((entry) => entry.label)).toEqual([
    "Bekleme başlangıcı güncelleme",
  ]);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(chip(page, "week").locator(".waiting-age")).toHaveText("9 gün");

  await chip(page, "no-start").click();
  await picker.locator('[data-date-day="2026-11-04"]').click();
  await expect(chip(page, "no-start").locator(".waiting-age")).toHaveText(
    "4 gün",
  );
  saved = await stored(page);
  expect(saved.records.find((item) => item.id === "no-start").sourceDate).toBe(
    "2026-11-04",
  );
});
