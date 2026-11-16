import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const meeting = (id, input) =>
  make({
    id,
    type: "meeting",
    status: "in_progress",
    sourceDate: "2026-08-18",
    ...input,
  });
const linked = (id, sourceId, type, input) =>
  make({
    id,
    type,
    status: type === "waiting" ? "waiting_response" : "planned",
    sourceFields: { __followupSource: { recordId: sourceId, type: "meeting" } },
    ...input,
  });
const decision = [
  "1) Kelepçe kompleleri sipariş tamamlandı. Test planlaması yapılması gerekmektedir ve bu karar uzun bir cümledir.",
  "2) Tedarikçi ile test tarihleri netleştirilecek.",
  "3) Sonuçlar haftalık toplantıda paylaşılacak.",
].join("\n");

test("meeting rows stay two lines however long the decision and linked names get", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00.000Z"));
  await page.addInitScript(
    (raw) => localStorage.setItem("is-takip-v1", raw),
    JSON.stringify({
      version: 1,
      records: [
        meeting("long", { title: "DYRK Test Planlaması", decision }),
        linked("long-work", "long", "daily", {
          title: "DYRK Test Planlaması deneme ve doğrulama adımları",
          dueDate: "2026-11-19",
        }),
        meeting("short", { title: "Kısa karar", decision: "Tek madde." }),
        linked("short-work", "short", "daily", {
          title: "Kısa karar",
          dueDate: "2026-11-10",
        }),
      ],
    }),
  );
  await page.setViewportSize({ width: 1536, height: 800 });
  await page.goto("/");
  await page.locator('#nav [data-view="meeting"]').click();
  const row = (id) =>
    page.locator(`.meeting-table tr[data-record-row][data-id="${id}"]`);
  // One line: the meeting date, the first item and how many more there are.
  const summary = row("long").locator(".meeting-summary");
  await expect(summary.locator(".meeting-summary-date")).toHaveText("18 Ağu");
  await expect(summary.locator(".meeting-summary-text")).toHaveText(
    decision.split("\n")[0],
  );
  await expect(summary.locator(".meeting-summary-more")).toHaveText("+2 madde");
  expect(
    await summary.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(22);
  await expect(row("short").locator(".meeting-summary-more")).toHaveCount(0);
  // The whole decision shows in the hover bubble.
  await summary.hover();
  await expect(page.locator("#record-link-tooltip")).toHaveText(decision);
  await page.mouse.move(5, 5);
  // A linked work is one line; its name shows only when it differs.
  const work = row("long").locator('.meeting-linked-cell[data-route="daily"]');
  await expect(work.locator(".meeting-linked-row .status-trigger")).toHaveText(
    "Yapılacak",
  );
  await expect(work.locator(".meeting-linked-date")).toHaveText("19 Kas");
  await expect(work.locator(".meeting-linked-title")).toHaveText(
    "DYRK Test Planlaması deneme ve doğrulama adımları",
  );
  await expect(row("short").locator(".meeting-linked-title")).toHaveCount(0);
  await expect(row("short").locator(".meeting-linked-date")).toHaveClass(
    /is-late/,
  );
  const tops = await work
    .locator(".meeting-linked-row > *")
    .evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      }),
    );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  const heights = await page
    .locator(".meeting-table tbody tr[data-record-row]")
    .evaluateAll((rows) =>
      rows.map((item) => item.getBoundingClientRect().height),
    );
  expect(Math.max(...heights)).toBeLessThan(80);
  await work.locator(".meeting-open").click();
  await expect(page.locator('#editor [name="id"]')).toHaveValue("long-work");
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  // No window width makes the list scroll sideways.
  for (const width of [1100, 880, 879, 780, 600]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => {
        const wrap = document.querySelector(".meeting-table").parentElement;
        return [
          document.documentElement.scrollWidth <= innerWidth,
          wrap.scrollWidth <= wrap.clientWidth,
        ];
      }),
      `${width}px`,
    ).toEqual([true, true]);
  }
});
