import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";
import { appConfirms } from "./app-confirm-support.js";

const KEY = "is-takip-v1";

function fixtures() {
  return [
    createRecord({
      id: "quick-weekly",
      type: "weekly",
      title: "Haftalık hızlı düzenleme",
      status: "in_progress",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      sourceFields: { "Özgün bilgi": "Korunacak hedef bilgisi" },
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:00.000Z",
    }),
    createRecord({
      id: "quick-daily",
      title: "Hızlı düzenleme & <günlük iş>",
      parentId: "quick-weekly",
      status: "in_progress",
      dueDate: "2026-11-10",
      priority: "normal",
      description: "Notlar ve sonraki aksiyon korunmalı.",
      nextAction: "Kontrolü paylaş",
      waitingReason: "Tasarım yanıtı bekleniyor",
      sourceFields: { "Özgün bilgi": { value: "Korunacak iş bilgisi" } },
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-01T09:00:00.000Z",
    }),
  ];
}

async function seed(page, records = fixtures(), { canonical = false } = {}) {
  await page.clock.install({ time: new Date("2026-11-07T12:00:00Z") });
  await page.addInitScript(
    ({ key, records, canonical }) => {
      if (!sessionStorage.getItem("quick-fields-seeded")) {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            records,
            ...(canonical
              ? {
                  odak: {
                    version: 1,
                    preferences: { density: "comfortable" },
                    history: [],
                  },
                }
              : {}),
          }),
        );
        sessionStorage.setItem("quick-fields-seeded", "true");
      }
    },
    { key: KEY, records, canonical },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return records;
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const dailyRow = (page) =>
  page.locator('[data-record-row][data-id="quick-daily"]').first();

async function priorityMenu(page) {
  await dailyRow(page).locator(".inline-priority").click();
  const menu = page.locator("#priority-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  return menu;
}

async function dateMenu(page) {
  await dailyRow(page).locator(".inline-date").click();
  const calendar = page.locator("#odak-date-picker");
  await expect(calendar).toBeVisible();
  await expect(calendar).toHaveAttribute("data-selection-mode", "direct");
  await expect(page.locator("#due-date-menu")).toHaveCount(0);
  await expect(
    calendar.locator('input[type="text"], [data-date-input], textarea'),
  ).toHaveCount(0);
  await expect(
    calendar.getByRole("button", { name: /^(Kaydet|Vazgeç)$/ }),
  ).toHaveCount(0);
  await expect(
    calendar.getByRole("button", { name: "Takvimi kapat", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  return calendar;
}
async function chooseDate(page, value, { duplicate = false } = {}) {
  const calendar = page.locator("#odak-date-picker");
  const [year, month] = value.split("-");
  await calendar
    .getByLabel("Ay", { exact: true })
    .selectOption(String(Number(month) - 1));
  await calendar.getByLabel("Yıl", { exact: true }).fill(year);
  await calendar.getByLabel("Yıl", { exact: true }).press("Enter");
  const button = calendar.locator(`[data-date-day="${value}"]`);
  if (duplicate)
    await button.evaluate((element) => {
      element.click();
      element.click();
    });
  else await button.click();
}

test("inline priority changes only the selected field, skips no-ops, and undoes exactly", async ({
  page,
}) => {
  const original = await seed(page);
  let menu = await priorityMenu(page);
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    "Düşük",
    "Normal",
    "Yüksek",
    "Acil",
  ]);
  await menu
    .getByRole("menuitemradio", { name: "Normal", exact: true })
    .click();
  await expect(menu).not.toBeVisible();
  expect(await readRecords(page)).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();

  menu = await priorityMenu(page);
  await menu
    .getByRole("menuitemradio", { name: "Yüksek", exact: true })
    .click();
  await expect(menu).not.toBeVisible();
  const changed = await readRecords(page);
  expect(changed[0]).toEqual(original[0]);
  expect(changed[1].priority).toBe("high");
  expect(changed[1].updatedAt).not.toBe(original[1].updatedAt);
  expect({
    ...changed[1],
    priority: original[1].priority,
    updatedAt: original[1].updatedAt,
  }).toEqual(original[1]);
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
  await page.reload();
  expect(await readRecords(page)).toEqual(original);
});

test("inline due dates use only a calendar, dismiss without writes, and save or clear immediately with exact Undo", async ({
  page,
}) => {
  const original = await seed(page);
  let calendar = await dateMenu(page);
  await expect(
    calendar.locator('[data-date-day="2026-11-10"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(calendar).not.toBeVisible();
  await expect(dailyRow(page).locator(".inline-date")).toBeFocused();
  expect(await readRecords(page)).toEqual(original);
  calendar = await dateMenu(page);
  await calendar
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(calendar).not.toBeVisible();
  expect(await readRecords(page)).toEqual(original);
  calendar = await dateMenu(page);
  await page.locator("#page-title").click();
  await expect(calendar).not.toBeVisible();
  expect(await readRecords(page)).toEqual(original);
  calendar = await dateMenu(page);
  await calendar.locator('[data-date-day="2026-11-10"]').click();
  await expect(calendar).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  calendar = await dateMenu(page);
  await chooseDate(page, "2026-11-25", { duplicate: true });
  await expect(calendar).not.toBeVisible();
  const edited = await readRecords(page);
  expect(edited[0]).toEqual(original[0]);
  expect(edited[1].dueDate).toBe("2026-11-25");
  expect({
    ...edited[1],
    dueDate: original[1].dueDate,
    updatedAt: original[1].updatedAt,
  }).toEqual(original[1]);
  await expect(dailyRow(page).locator(".inline-date")).toBeFocused();
  calendar = await dateMenu(page);
  await calendar
    .getByRole("button", { name: "Tarihi kaldır", exact: true })
    .click();
  await expect(calendar).not.toBeVisible();
  expect((await readRecords(page))[1].dueDate).toBe("");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(edited);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
});

test("quick controls support keyboard selection and save a valid calendar day without an intermediate form", async ({
  page,
}) => {
  const original = await seed(page);
  await dailyRow(page).locator(".inline-priority").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('#priority-menu [aria-checked="true"]'),
  ).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect((await readRecords(page))[1].priority).toBe("urgent");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
  const calendar = await dateMenu(page);
  await expect(calendar.locator('[data-date-day="2026-11-10"]')).toBeFocused();
  const dateBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    KEY,
  );
  const year = calendar.getByLabel("Yıl", { exact: true });
  for (const invalid of ["", "1899"]) {
    await year.fill(invalid);
    await calendar.locator('[data-date-day="2026-11-11"]').click();
    await expect(calendar).toBeVisible();
    await expect(year).toHaveValue(invalid);
    await expect(calendar.locator("#date-picker-error")).toContainText(
      /yıl|1900/i,
    );
    expect(await readRecords(page)).toEqual(original);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      dateBefore,
    );
    await calendar
      .getByRole("button", { name: "Tarihi kaldır", exact: true })
      .click();
    await expect(calendar).toBeVisible();
    await expect(year).toHaveValue(invalid);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      dateBefore,
    );
  }
  await year.fill("2026");
  await year.press("Enter");
  await calendar.locator('[data-date-day="2026-11-10"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.locator('[data-date-day="2026-11-11"]')).toBeFocused();
  expect(await readRecords(page)).toEqual(original);
  await page.keyboard.press("Enter");
  await expect(calendar).not.toBeVisible();
  expect((await readRecords(page))[1].dueDate).toBe("2026-11-11");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
});

test("lists expose context-appropriate quick controls without opening the full editor or saving a draft", async ({
  page,
}) => {
  const records = [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ].map((type) =>
    createRecord({
      id: `quick-${type}`,
      type,
      title: `Hızlı ${type}`,
      status: "planned",
      ...(type === "meeting"
        ? {
            priority: "high",
            dueDate: "2026-11-19",
            nextAction: "Korunacak eski toplantı adımı.",
          }
        : {}),
      periodKey:
        type === "weekly"
          ? "2026-W45"
          : type === "monthly"
            ? "2026-11"
            : type === "yearly"
              ? "2026"
              : "",
    }),
  );
  await seed(page, records);
  const savedBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    KEY,
  );
  for (const record of records) {
    await page.locator(`#nav [data-view="${record.type}"]`).click();
    const row = page
      .locator(`[data-record-row][data-id="${record.id}"]`)
      .first();
    if (record.type === "meeting") {
      await expect(row.locator(".inline-priority, .inline-date")).toHaveCount(
        0,
      );
      await expect(row.locator(".status-col > .status-trigger")).toHaveText(
        "Planlanacak",
      );
      await expect(
        page.locator("#priority-filter, #period-filter"),
      ).toHaveCount(0);
      await row.locator(".task-name").click();
      const preview = page.locator("#meeting-record-panel");
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute("data-record-id", record.id);
      await expect(page.locator("#editor")).not.toBeVisible();
      await preview
        .getByRole("button", { name: "Kaydı düzenle", exact: true })
        .click();
      await expect(page.locator("#editor")).toBeVisible();
      await expect(page.locator('#record-form [name="id"]')).toHaveValue(
        record.id,
      );
      await expect(
        page.locator('#record-form select[name="type"]'),
      ).toHaveValue("meeting");
      await openCreationExtras(page);
      for (const name of ["priority", "dueDate", "nextAction"]) {
        await expect(
          page.locator(`#record-form [name="${name}"]`),
        ).not.toBeVisible();
        await expect(
          page.locator(`#record-form [name="${name}"]`),
        ).toBeDisabled();
      }
      await expect(page.locator('#record-form [name="priority"]')).toHaveValue(
        "high",
      );
      await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
        "19.11.2026",
      );
      await expect(
        page.locator('#record-form [name="nextAction"]'),
      ).toHaveValue(record.nextAction);
      await page
        .locator("#editor")
        .getByRole("button", { name: "Vazgeç", exact: true })
        .click();
      expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
        savedBefore,
      );
      continue;
    } else if (record.type === "waiting") {
      await expect(row.locator(".inline-priority, .inline-date")).toHaveCount(
        0,
      );
      await row.locator(".waiting-next-date").click();
    } else {
      await row.locator(".inline-priority").click();
      await expect(page.locator("#priority-menu")).toBeVisible();
      await page.keyboard.press("Escape");
      if (record.type === "yearly") {
        await expect(row.locator(".inline-date")).toHaveCount(0);
        await expect(page.locator("#odak-date-picker")).not.toBeVisible();
        expect(
          await page.evaluate((key) => localStorage.getItem(key), KEY),
        ).toBe(savedBefore);
        continue;
      }
      await row.locator(".inline-date").click();
    }
    const picker = page.locator("#odak-date-picker");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute("data-selection-mode", "direct");
    await expect(page.locator("#due-date-menu")).toHaveCount(0);
    await expect(
      picker.getByRole("button", { name: "Tarihi kaldır", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).not.toBeVisible();
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      savedBefore,
    );
  }
  expect(await readRecords(page)).toEqual(records);
});

test("Turkish quick calendars fit a short English-browser viewport and immediately save a selected month, year and day", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "Europe/Istanbul",
    viewport: { width: 1100, height: 560 },
  });
  const page = await context.newPage();
  try {
    const original = await seed(page);
    const calendar = await dateMenu(page);
    await expect(calendar.getByLabel("Ay", { exact: true })).toHaveValue("10");
    await expect(calendar.getByLabel("Yıl", { exact: true })).toHaveValue(
      "2026",
    );
    const bounds = await calendar.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(7);
    expect(bounds.y).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1093);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(553);
    await calendar.getByLabel("Ay", { exact: true }).selectOption("1");
    await calendar.getByLabel("Yıl", { exact: true }).fill("2028");
    await calendar.getByLabel("Yıl", { exact: true }).press("Enter");
    expect(await readRecords(page)).toEqual(original);
    await calendar
      .getByRole("button", { name: "29 Şubat 2028 Salı", exact: true })
      .click();
    await expect(calendar).not.toBeVisible();
    expect((await readRecords(page))[1].dueDate).toBe("2028-02-29");
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    expect(await readRecords(page)).toEqual(original);
  } finally {
    await context.close();
  }
});

test("a follow-up chip selects and immediately saves only its plan while Escape, same-day no-ops and exact Undo retain history", async ({
  page,
}) => {
  const waiting = createRecord({
    id: "quick-followup-calendar",
    type: "waiting",
    title: "Takvimden planlanacak dış yanıt",
    status: "follow_up",
    sourceDate: "2026-10-01",
    lastFollowUpDate: "2026-11-04",
    nextFollowUpDate: "2028-02-29",
    latestUpdate: "Özgün dış yanıt notu.",
    priority: "high",
    dueDate: "2020-01-01",
    followUpLog: [
      {
        id: "original-contact",
        date: "2026-11-04",
        note: "Yanıt istendi.",
        nextFollowUpDate: "2028-02-29",
      },
    ],
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
  });
  await seed(page, [waiting], { canonical: true });
  await page.locator('#nav [data-view="waiting"]').click();
  const before = await page.evaluate((key) => localStorage.getItem(key), KEY);
  const chip = page.locator(
    `.waiting-table tr[data-record-row][data-id="${waiting.id}"] .waiting-next-date`,
  );
  const calendar = page.locator("#odak-date-picker");
  await chip.click();
  await expect(calendar).toHaveAttribute("data-selection-mode", "direct");
  await expect(calendar.getByLabel("Ay", { exact: true })).toHaveValue("1");
  await expect(calendar.getByLabel("Yıl", { exact: true })).toHaveValue("2028");
  await expect(calendar.locator('[data-date-day="2028-02-29"]')).toBeFocused();
  await expect(page.locator("#due-date-menu")).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).not.toBeVisible();
  await expect(chip).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
  await chip.click();
  await calendar.locator('[data-date-day="2028-02-29"]').click();
  await expect(calendar).not.toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
  await chip.click();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.locator('[data-date-day="2028-03-01"]')).toBeFocused();
  expect(await readRecords(page)).toEqual([waiting]);
  await page.keyboard.press("Enter");
  await expect(calendar).not.toBeVisible();
  await expect(chip).toBeFocused();
  const changed = await readRecords(page);
  expect(changed[0].nextFollowUpDate).toBe("2028-03-01");
  expect({
    ...changed[0],
    nextFollowUpDate: waiting.nextFollowUpDate,
    updatedAt: waiting.updatedAt,
  }).toEqual(waiting);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
  await page.reload();
  expect(await readRecords(page)).toEqual([waiting]);
});

test("ordinary record date calendars keep selections as drafts, validate typed dates and require explicit Save", async ({
  page,
}) => {
  const original = await seed(page);
  await dailyRow(page).locator(".task-name").click();
  let input = page.locator('#record-form [name="dueDate"]');
  await input.fill("30.11.2026");
  await input.locator("..").locator(".date-picker-toggle").click();
  const calendar = page.locator("#odak-date-picker");
  await expect(calendar.locator('[data-date-day="2026-11-30"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.locator('[data-date-day="2026-12-01"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(calendar).not.toBeVisible();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(input).toHaveValue("01.12.2026");
  expect(await readRecords(page)).toEqual(original);
  await page.locator('#record-form [type="submit"]').click();
  expect((await readRecords(page))[1].dueDate).toBe("2026-12-01");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
  await dailyRow(page).locator(".task-name").click();
  input = page.locator('#record-form [name="dueDate"]');
  await input.fill("31.12.1899");
  await page.locator('#record-form [type="submit"]').click();
  expect(
    await input.evaluate((element) => element.validationMessage),
  ).toContain("1900");
  expect(await input.evaluate((element) => element.validity.valid)).toBe(false);
  expect(await readRecords(page)).toEqual(original);
  await input.fill("30.02.2026");
  await page.locator('#record-form [type="submit"]').click();
  expect(
    await input.evaluate((element) => element.validationMessage),
  ).toContain("Geçerli");
  expect(await input.evaluate((element) => element.validity.valid)).toBe(false);
  expect(await readRecords(page)).toEqual(original);
  appConfirms(page).once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await readRecords(page)).toEqual(original);
});
