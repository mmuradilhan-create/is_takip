import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-05T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

async function seed(context, records, notes = []) {
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    {
      key: KEY,
      raw: JSON.stringify({
        version: 1,
        records,
        odak: { version: 1, notes },
      }),
    },
  );
}

test("the week choice and list sort come back after ODAK is reopened, and Bu hafta follows the calendar", async ({
  context,
}) => {
  await context.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  await seed(context, [
    make({ id: "goal", type: "weekly", title: "Rapor", periodKey: "2026-W46" }),
  ]);
  let page = await context.newPage();
  await page.goto("/");
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".period-all")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".period-current").click();
  await page.locator("#list-sort").selectOption("due-asc");
  await page.close();

  // A week later the saved "Bu hafta" means the new current week.
  await context.clock.setFixedTime(new Date("2026-11-19T09:00:00.000Z"));
  page = await context.newPage();
  await page.goto("/");
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".period-current")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#planning-period-label")).toHaveText(
    "16 – 22 Kasım 2026",
  );
  await expect(page.locator("#list-sort")).toHaveValue("due-asc");
  // Choosing "Tüm haftalar" is kept too, and none of it enters Undo.
  await page.locator(".period-all").click();
  await page.reload();
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".period-all")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("a widget agenda title opens its details inside the widget; only the edit button opens ODAK", async ({
  context,
}) => {
  await context.clock.setFixedTime(new Date("2026-11-13T09:00:00.000Z"));
  await seed(context, [
    make({
      id: "topic",
      type: "waiting",
      title: "Kalıp onayı",
      status: "waiting_response",
      expectedFrom: "Tedarikçi",
      latestUpdate: "Numune gönderildi",
      nextFollowUpDate: "2026-11-13",
    }),
  ]);
  const widget = await context.newPage();
  await widget.setViewportSize({ width: 380, height: 520 });
  await widget.goto("/#widget");
  await widget.locator(".widget-view-toggle").click();
  const title = widget.locator('[data-agenda-detail="topic"]');
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await title.click();
  expect(context.pages()).toHaveLength(1);
  const detail = widget.locator("#widget-detail-topic");
  await expect(detail.locator(".wb-detail-facts")).toHaveText(
    /Takip: 13 Kas\s*Bekleniyor/,
  );
  await expect(detail).toContainText("Kimden: Tedarikçi");
  await expect(detail).toContainText("Son gelişme: Numune gönderildi");
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await title.click();
  await expect(detail).toHaveCount(0);
  await title.click();
  const opening = widget.waitForEvent("popup");
  await widget.getByRole("button", { name: "ODAK’ta düzenle" }).click();
  const main = await opening;
  await expect(main).toHaveURL(/#desktop\?record=topic$/);
});

test("the reminder panel lists due reminders without a heading and stepping progress shows no toast", async ({
  context,
}) => {
  await context.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  await seed(
    context,
    [
      make({
        id: "goal",
        type: "weekly",
        title: "Rapor",
        periodKey: "2026-W46",
        targetValue: 7,
        currentValue: 2,
      }),
    ],
    [
      {
        id: "due",
        text: "Tedarikçiyi ara",
        remindAt: "2026-11-12T10:00",
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("#reminder-button").click();
  const panel = page.locator("#reminder-panel");
  await expect(panel.locator(".reminder-list")).toContainText(
    "Tedarikçiyi ara",
  );
  await expect(panel.getByText("Zamanı gelenler", { exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="weekly"]').click();
  await page.locator('tr[data-id="goal"]').hover();
  await page.getByRole("button", { name: "Rapor: İlerlemeyi 1 artır" }).click();
  await expect(
    page.locator('tr[data-id="goal"] .goal-progress-summary'),
  ).toHaveText("3 / 7");
  await expect(page.locator("#toast")).not.toHaveClass(/visible/);
});

test("short status names fit their boxes in one line in the waiting and daily lists", async ({
  context,
}) => {
  await context.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  await seed(context, [
    make({
      id: "topic",
      type: "waiting",
      title: "Kalıp onayı",
      status: "waiting_response",
      expectedFrom: "Tedarikçi",
      nextFollowUpDate: "2026-11-14",
      sourceMeetingId: "meeting",
    }),
    make({ id: "job", title: "Rapor", status: "in_progress" }),
  ]);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  for (const [view, label] of [
    ["waiting", "Bekleniyor"],
    ["daily", "Devam"],
  ]) {
    await page.locator(`#nav [data-view="${view}"]`).click();
    const status = page.locator(".full-table tbody .status-trigger").first();
    await expect(status).toHaveText(label);
    expect(
      await status.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element.lastChild);
        return [
          range.getClientRects().length,
          element.scrollWidth <= element.clientWidth + 1,
        ];
      }),
    ).toEqual([1, true]);
  }
});
