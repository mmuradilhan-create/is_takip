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
].join("\n");
const stored = (page, id) =>
  page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("is-takip-v1")).records.find(
        (record) => record.id === id,
      ).decision,
    id,
  );

test("meeting rows stay one line; the decision previews and edits from its own symbol like a note", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00.000Z"));
  await page.addInitScript(
    (raw) => {
      if (sessionStorage.getItem("meeting-rows-180")) return;
      sessionStorage.setItem("meeting-rows-180", "1");
      localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({
      version: 1,
      records: [
        meeting("long", { title: "DYRK Test Planlaması", decision }),
        linked("long-work", "long", "daily", {
          title: "DYRK Test Planlaması deneme ve doğrulama adımları",
          dueDate: "2026-11-19",
        }),
        meeting("empty", { title: "Kısa karar", decision: "" }),
        linked("empty-work", "empty", "daily", {
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
  const symbol = (id) => row(id).locator(".record-decision-trigger");
  // One line per meeting: date in its own column, linked status and date.
  await expect(row("long").locator("td.meeting-date-col")).toHaveText("18 Ağu");
  await expect(
    row("long").locator('.meeting-linked-cell[data-route="daily"]'),
  ).toContainText("19 Kas");
  await expect(row("empty").locator(".meeting-linked-date")).toHaveClass(
    /is-late/,
  );
  await expect(row("long")).not.toContainText("Kelepçe");
  const heights = await page
    .locator(".meeting-table tbody tr[data-record-row]")
    .evaluateAll((rows) =>
      rows.map((item) => Math.round(item.getBoundingClientRect().height)),
    );
  expect(Math.max(...heights)).toBeLessThan(64);
  // A decision previews like a note and closes as soon as the pointer leaves.
  await expect(symbol("long")).not.toHaveClass(/is-empty/);
  await expect(symbol("empty")).toHaveClass(/is-empty/);
  await symbol("long").hover();
  const bubble = page.locator("#record-note-popover");
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-preview-kind", "decision");
  await expect(page.locator("#record-note-body")).toHaveText(decision);
  await page.mouse.move(2, 2);
  await expect(bubble).toBeHidden();
  await symbol("empty").hover();
  await page.waitForTimeout(200);
  await expect(bubble).toBeHidden();
  await page.mouse.move(2, 2);
  // A click edits it in the note editor: Enter saves one Undo step.
  await symbol("long").click();
  const editor = page.locator("#record-note-editor");
  await expect(editor.locator("h2")).toHaveText("Kararı düzenle");
  const box = editor.locator('textarea[name="decision"]');
  await expect(box).toHaveValue(decision);
  await box.press("Control+End");
  await box.press("Shift+Enter");
  await box.pressSequentially("3) Yeni madde.");
  await box.press("Enter");
  await expect(editor).toBeHidden();
  expect(await stored(page, "long")).toBe(`${decision}\n3) Yeni madde.`);
  await expect(symbol("long")).toBeFocused();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(() => stored(page, "long")).toBe(decision);
  // An empty decision is written from its faint symbol.
  await symbol("empty").click();
  await expect(editor.locator("h2")).toHaveText("Karar ekle");
  await editor.locator('textarea[name="decision"]').fill("İlk karar.");
  await editor.locator('textarea[name="decision"]').press("Enter");
  await expect.poll(() => stored(page, "empty")).toBe("İlk karar.");
  await expect(symbol("empty")).not.toHaveClass(/is-empty/);
  // The title still opens the details panel.
  await row("long").locator(".meeting-title").click();
  await expect(page.locator("#meeting-record-panel")).toHaveAttribute(
    "data-record-id",
    "long",
  );
  await page
    .locator("#meeting-record-panel")
    .getByRole("button", { name: "Kapat", exact: true })
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
