import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

test.use({ timezoneId: "Europe/Istanbul" });
const KEY = "is-takip-v1";
// It is 8 November in Istanbul while UTC is still on 7 November.
const NOW = new Date("2026-11-07T21:30:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const row = (page, id = "annual-legacy") =>
  page.locator(`.full-table > tbody > tr[data-id="${id}"]`);
const form = (page) => page.locator("#record-form");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  return [
    record({
      id: "annual-legacy",
      type: "yearly",
      title: "Tarihi veride korunacak senelik hedef",
      periodKey: "2026",
      status: "in_progress",
      dueDate: "2026-11-08",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      description: "Özgün senelik açıklama.",
      sourceFields: { original: { value: "Eski tarih ve ölçüm korunur" } },
    }),
    record({
      id: "annual-monthly-child",
      type: "monthly",
      title: "Takvimde gösterilecek aylık alt hedef",
      periodKey: "2026-11",
      goalParentId: "annual-legacy",
      dueDate: "2026-11-10",
      targetValue: 4,
      currentValue: 1,
      metric: "Rapor",
    }),
    record({
      id: "annual-dated-daily",
      title: "Takvimde gösterilecek günlük iş",
      dueDate: "2026-11-08",
    }),
  ];
}

async function seed(page) {
  const items = fixture();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("annual-no-deadline-seeded")) return;
      localStorage.setItem(key, value);
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("annual-no-deadline-seeded", "1");
    },
    {
      key: KEY,
      value: JSON.stringify({
        version: 1,
        records: items,
        odak: { version: 1, preferences: { density: "compact" }, history: [] },
      }),
    },
  );
  await page.goto("/");
  return items;
}

test("annual goals have no deadline controls while creation and editing preserve year, progress and legacy saved dates", async ({
  page,
}) => {
  const original = await seed(page);
  const originalBytes = await saved(page);
  await page.locator('#nav [data-view="yearly"]').click();
  await expect(page.locator(".full-table > thead")).not.toContainText(
    "Teslim tarihi",
  );
  await expect(row(page).locator(".date-cell")).toHaveCount(0);
  await expect(page.locator("#period-filter")).toHaveCount(0);
  await expect(page.locator('#list-sort option[value^="due-"]')).toHaveCount(0);
  await row(page).locator(".goal-details-trigger").click();
  const panel = page.locator("#goal-detail-panel");
  await expect(
    panel.locator('.goal-panel-progress [role="progressbar"]'),
  ).toHaveAttribute("aria-valuenow", "40");
  await expect(panel.locator(".modal-header .deadline-tag")).toHaveCount(0);
  await expect(
    panel.locator(
      '.goal-child-row[data-id="annual-monthly-child"] .goal-child-date',
    ),
  ).toContainText("10 Kas");
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(originalBytes);

  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('[name="periodYear"]')).toHaveValue("2026");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="dueDate"]')).toHaveCount(0);
  await form(page)
    .locator('[name="title"]')
    .fill("Teslim tarihi olmayan yeni senelik hedef");
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const created = await records(page);
  expect(created.find((item) => item.id === "annual-legacy")).toEqual(
    original[0],
  );
  expect(
    created.find(
      (item) => item.title === "Teslim tarihi olmayan yeni senelik hedef",
    ),
  ).toMatchObject({
    type: "yearly",
    dueDate: "",
    periodKey: "2026",
    sourceDate: "2026-11-08",
    status: "planned",
  });
  await undo(page);
  expect(await saved(page)).toBe(originalBytes);

  await row(page).locator(".task-name").click();
  await expect(form(page).locator('[name="dueDate"]')).not.toBeVisible();
  await expect(form(page).locator('[name="dueDate"]')).toBeDisabled();
  await openCreationExtras(page);
  await form(page)
    .locator('[name="description"]')
    .fill("İstenen senelik açıklama değişikliği.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const edited = (await records(page)).find(
    (item) => item.id === "annual-legacy",
  );
  expect(edited.dueDate).toBe("2026-11-08");
  expect({
    ...edited,
    description: original[0].description,
    updatedAt: original[0].updatedAt,
  }).toEqual(original[0]);
  await undo(page);
  expect(await saved(page)).toBe(originalBytes);
});

test("the global calendar omits legacy annual dates while monthly and daily dates still open their exact records without writes", async ({
  page,
}) => {
  const original = await seed(page);
  const originalBytes = await saved(page);
  await page.locator('#nav [data-view="yearly"]').click();
  await page.locator('[data-action="open-calendar"]').click();
  const calendar = page.locator("#dashboard-calendar-dialog");
  await expect(calendar).toBeVisible();
  await expect(
    calendar.locator('[data-calendar-record-id="annual-legacy"]'),
  ).toHaveCount(0);
  await expect(
    calendar.locator(
      '.calendar-expanded-grid [data-calendar-record-id="annual-monthly-child"]',
    ),
  ).toHaveCount(1);
  await expect(
    calendar.locator(
      '.calendar-expanded-grid [data-calendar-record-id="annual-dated-daily"]',
    ),
  ).toHaveCount(1);
  await calendar
    .locator(
      '.calendar-expanded-grid [data-calendar-record-id="annual-monthly-child"]',
    )
    .click();
  await expect(calendar).not.toBeVisible();
  await expect(form(page).locator('[name="id"]')).toHaveValue(
    "annual-monthly-child",
  );
  await expect(form(page).locator('[name="dueDate"]')).toHaveValue(
    "10.11.2026",
  );
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  expect(await saved(page)).toBe(originalBytes);
  expect(await records(page)).toEqual(original);
});
