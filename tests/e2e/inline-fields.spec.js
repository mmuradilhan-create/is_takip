import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

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

async function dateMenu(page, { keepCalendar = false } = {}) {
  await dailyRow(page).locator(".inline-date").click();
  const menu = page.locator("#due-date-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator("#odak-date-picker")).toBeVisible();
  if (!keepCalendar) {
    await page.keyboard.press("Escape");
    await expect(page.locator("#odak-date-picker")).not.toBeVisible();
    await expect(menu).toBeVisible();
  }
  await expect(page.locator("#editor")).not.toBeVisible();
  return menu;
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

test("inline due dates cancel without saving, clear intentionally, and undo each edit", async ({
  page,
}) => {
  const original = await seed(page);
  let menu = await dateMenu(page);
  await expect(menu.locator('[name="dueDate"]')).toHaveValue("10.11.2026");
  await menu.locator('[name="dueDate"]').fill("25.11.2026");
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  expect(await readRecords(page)).toEqual(original);

  menu = await dateMenu(page);
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  menu = await dateMenu(page);
  await menu.locator('[name="dueDate"]').fill("25.11.2026");
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  const edited = await readRecords(page);
  expect(edited[1].dueDate).toBe("2026-11-25");
  expect({
    ...edited[1],
    dueDate: original[1].dueDate,
    updatedAt: original[1].updatedAt,
  }).toEqual(original[1]);

  menu = await dateMenu(page);
  await menu
    .getByRole("button", { name: "Tarihi kaldır", exact: true })
    .click();
  expect((await readRecords(page))[1].dueDate).toBe("");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(edited);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
});

test("quick controls support keyboard selection and reject invalid dates without changing saved records", async ({
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

  const menu = await dateMenu(page);
  const input = menu.locator('[name="dueDate"]');
  await input.fill("31.12.1899");
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(menu).toBeVisible();
  await expect(menu.locator('[role="alert"]')).toContainText("1900");
  expect(await readRecords(page)).toEqual(original);

  await input.fill("30.02.2026");
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(menu.locator('[role="alert"]')).toContainText("Geçerli");
  expect(await readRecords(page)).toEqual(original);
  await menu.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(menu).not.toBeVisible();
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
      await expect(page.locator('#record-form [name="type"]')).toHaveValue(
        "meeting",
      );
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
      await expect(
        page.locator('#due-date-menu [name="nextFollowUpDate"]'),
      ).toHaveValue("");
      await page
        .locator('#due-date-menu [name="nextFollowUpDate"]')
        .fill("20.11.2026");
    } else {
      await row.locator(".inline-priority").click();
      await expect(page.locator("#priority-menu")).toBeVisible();
      await page.keyboard.press("Escape");
      if (record.type === "yearly") {
        await expect(row.locator(".inline-date")).toHaveCount(0);
        await expect(page.locator("#due-date-menu")).not.toBeVisible();
        await expect(page.locator("#editor")).not.toBeVisible();
        expect(
          await page.evaluate((key) => localStorage.getItem(key), KEY),
        ).toBe(savedBefore);
        continue;
      }
      await row.locator(".inline-date").click();
      await expect(page.locator('#due-date-menu [name="dueDate"]')).toHaveValue(
        "",
      );
    }
    await expect(page.locator("#due-date-menu")).toBeVisible();
    await expect(page.locator("#odak-date-picker")).toBeVisible();
    await expect(
      page
        .locator("#due-date-menu")
        .getByRole("button", { name: "Tarihi kaldır", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#odak-date-picker")).not.toBeVisible();
    await expect(page.locator("#due-date-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#due-date-menu")).not.toBeVisible();
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      savedBefore,
    );
  }
  expect(await readRecords(page)).toEqual(records);
});

test("Turkish calendar stays inside a short viewport in an English browser and selects month, year and day", async ({
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
    const menu = await dateMenu(page, { keepCalendar: true });
    const input = menu.locator('[name="dueDate"]');
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("10.11.2026");
    const calendar = page.locator("#odak-date-picker");
    await expect(calendar).toBeVisible();
    await expect(calendar.getByLabel("Ay", { exact: true })).toHaveValue("10");
    await expect(calendar.getByLabel("Yıl", { exact: true })).toHaveValue(
      "2026",
    );
    await expect(
      calendar.locator('[data-date-day="2026-11-10"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(menu).toBeVisible();
    const bounds = await calendar.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(7);
    expect(bounds.y).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1093);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(553);
    await calendar.getByLabel("Ay", { exact: true }).selectOption("1");
    await calendar.getByLabel("Yıl", { exact: true }).fill("2028");
    await calendar.getByLabel("Yıl", { exact: true }).press("Enter");
    await calendar
      .getByRole("button", { name: "29 Şubat 2028 Salı", exact: true })
      .click();
    await expect(calendar).not.toBeVisible();
    await expect(menu).toBeVisible();
    await expect(input).toHaveValue("29.02.2028");
    expect(await readRecords(page)).toEqual(original);
    await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
    expect((await readRecords(page))[1].dueDate).toBe("2028-02-29");
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    expect(await readRecords(page)).toEqual(original);
  } finally {
    await context.close();
  }
});

test("a follow-up chip opens its selected calendar immediately and preserves drafts through Escape, invalid input, save and exact Undo", async ({
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
  const menu = page.locator("#due-date-menu");
  const input = menu.locator('[name="nextFollowUpDate"]');
  await chip.click();
  await expect(menu).toBeVisible();
  await expect(calendar).toBeVisible();
  await expect(calendar.getByLabel("Ay", { exact: true })).toHaveValue("1");
  await expect(calendar.getByLabel("Yıl", { exact: true })).toHaveValue("2028");
  await expect(calendar.locator('[data-date-day="2028-02-29"]')).toBeFocused();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await readRecords(page)).toEqual([waiting]);
  await page.keyboard.press("Escape");
  await expect(calendar).not.toBeVisible();
  await expect(menu).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill("31.02.2028");
  await menu.locator(".date-picker-toggle").click();
  await expect(calendar).toBeVisible();
  await expect(input).toHaveValue("31.02.2028");
  await page.keyboard.press("Escape");
  await expect(calendar).not.toBeVisible();
  await expect(input).toHaveValue("31.02.2028");
  await menu.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(menu).not.toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );

  await chip.click();
  await expect(calendar.locator('[data-date-day="2028-02-29"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.locator('[data-date-day="2028-03-01"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(calendar).not.toBeVisible();
  await expect(menu).toBeVisible();
  await expect(input).toHaveValue("01.03.2028");
  expect(await readRecords(page)).toEqual([waiting]);
  await menu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(menu).not.toBeVisible();
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

test("calendar selection remains a draft and keyboard navigation crosses month boundaries", async ({
  page,
}) => {
  const original = await seed(page);
  const menu = await dateMenu(page);
  await menu.locator('[name="dueDate"]').fill("30.11.2026");
  await menu.locator(".date-picker-toggle").click();
  const calendar = page.locator("#odak-date-picker");
  await expect(
    calendar.getByRole("button", {
      name: "30 Kasım 2026 Pazartesi",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    calendar.getByRole("button", { name: "1 Aralık 2026 Salı", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.locator('[name="dueDate"]')).toHaveValue("01.12.2026");
  await menu.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readRecords(page)).toEqual(original);
});
