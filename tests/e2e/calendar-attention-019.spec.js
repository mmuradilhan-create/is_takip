import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { nextAttention, readAttentionCards } from "./attention-support.js";

test.use({ timezoneId: "Europe/Istanbul" });

const KEY = "is-takip-v1";
// Istanbul has entered 8 November while UTC is still on 7 November.
const NOW = new Date("2026-11-07T21:30:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE_TITLE =
  '<img src=x onerror="window.__calendarInjected=1"> Takvim kaydı';
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const calendar = (page) => page.locator(".dashboard-calendar");
const expanded = (page) => page.locator("#dashboard-calendar-dialog");
const attentionRows = (page) =>
  page.locator(".attention-panel .attention-list > [data-id]");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

function fixture() {
  return [
    record({
      id: "calendar-daily",
      title: "Özel arama günlük işi",
      dueDate: "2026-11-08",
    }),
    record({
      id: "calendar-unsafe",
      title: UNSAFE_TITLE,
      dueDate: "2026-11-08",
    }),
    record({
      id: "calendar-weekly",
      type: "weekly",
      title: "Takvim haftalık teslimi",
      dueDate: "2026-11-08",
      periodKey: "2026-W45",
    }),
    record({
      id: "calendar-monthly",
      type: "monthly",
      title: "Takvim aylık teslimi",
      dueDate: "2026-11-10",
      periodKey: "2026-11",
    }),
    record({
      id: "calendar-yearly",
      type: "yearly",
      title: "Takvim senelik teslimi",
      dueDate: "2026-11-11",
      periodKey: "2026",
    }),
    record({
      id: "calendar-period-only",
      type: "weekly",
      title: "Yalnız plan haftası var",
      periodKey: "2026-W46",
    }),
    record({
      id: "attention-waiting-overdue",
      type: "waiting",
      title: "Gecikmiş test planı yanıtı",
      nextFollowUpDate: "2026-11-07",
    }),
    record({
      id: "attention-waiting-today",
      type: "waiting",
      title: "Bugünkü yanıt takibi",
      nextFollowUpDate: "2026-11-08",
      sourceDate: "2026-11-01",
    }),
    record({
      id: "attention-waiting-urgent-plus-three",
      type: "waiting",
      title: "Üç gün içinde sorulacak teknik yanıt",
      nextFollowUpDate: "2026-11-11",
      priority: "urgent",
    }),
    record({
      id: "attention-waiting-plus-three",
      type: "waiting",
      title: "Özel arama dış yanıtı",
      nextFollowUpDate: "2026-11-11",
      dueDate: "2026-11-09",
      sourceDate: "2026-11-01",
    }),
    record({
      id: "calendar-meeting-plus-four",
      type: "meeting",
      title: "Dördüncü gün toplantısı",
      dueDate: "2026-11-12",
    }),
    record({
      id: "calendar-waiting-plus-four",
      type: "waiting",
      title: "Dördüncü gün takibi",
      nextFollowUpDate: "2026-11-12",
    }),
    record({
      id: "calendar-meeting-no-date",
      type: "meeting",
      title: "Tarihsiz toplantı",
    }),
    record({
      id: "calendar-waiting-due-only",
      type: "waiting",
      title: "Takip tarihi olmadan teslim tarihi var",
      dueDate: "2026-11-10",
    }),
    record({
      id: "calendar-closed",
      title: "Tamamlanan takvim işi",
      status: "completed",
      dueDate: "2026-11-08",
    }),
    record({
      id: "calendar-cancelled",
      type: "meeting",
      title: "İptal toplantı",
      status: "cancelled",
      dueDate: "2026-11-08",
    }),
    record({
      id: "calendar-routed-meeting",
      type: "meeting",
      title: "Ortak toplantı başlığı",
      dueDate: "2026-11-09",
    }),
    record({
      id: "calendar-routed-daily",
      title: "Toplantının gerçek günlük işi",
      dueDate: "2026-11-09",
      sourceFields: {
        __followupSource: {
          recordId: "calendar-routed-meeting",
          type: "meeting",
        },
      },
    }),
  ];
}

async function seed(
  page,
  { width = 1440, height = 1000, theme = "light" } = {},
) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  const original = JSON.stringify({
    version: 1,
    records: fixture(),
    odak: {
      version: 1,
      preferences: { density: "compact", theme },
      history: [],
    },
  });
  await page.addInitScript(
    ({ key, original }) => {
      if (sessionStorage.getItem("calendar-019-seeded")) return;
      localStorage.setItem(key, original);
      sessionStorage.setItem("calendar-019-seeded", "true");
    },
    { key: KEY, original },
  );
  await page.goto("/");
  await expect(calendar(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  expect(await saved(page)).toBe(original);
  return original;
}

for (const { width, height, theme } of [
  { width: 1280, height: 720, theme: "light" },
  { width: 1920, height: 1080, theme: "dark" },
]) {
  test(`two dashboard rows align work with the calendar and supporting panels while attention uses the inclusive three-day window at ${width}px ${theme}`, async ({
    page,
  }, testInfo) => {
    const original = await seed(page, { width, height, theme });
    await expect(
      calendar(page).locator('[data-calendar-action="select-day"]').first(),
    ).toHaveAttribute("data-calendar-date", "2026-10-26");
    await expect(
      calendar(page).locator(".calendar-selected-label"),
    ).toContainText("8 Kasım");
    await expect(attentionRows(page)).toHaveCount(3);
    const allCards = await readAttentionCards(page);
    const ids = allCards.map((card) => card.id);
    expect(ids).toEqual([
      "attention-waiting-overdue",
      "attention-waiting-today",
      "attention-waiting-urgent-plus-three",
      "attention-waiting-plus-three",
    ]);
    expect(allCards.map((card) => card.date)).toEqual([
      "2026-11-07",
      "2026-11-08",
      "2026-11-11",
      "2026-11-11",
    ]);
    expect(allCards.filter((card) => card.near)).toHaveLength(3);
    const calendarBox = await calendar(page).boundingBox();
    const weeklyBox = await page
      .locator(".weekly-dashboard-panel")
      .boundingBox();
    const mainColumnBox = await page
      .locator(".dashboard-main-column")
      .boundingBox();
    const asideBox = await page.locator(".dashboard-followups").boundingBox();
    const focusBox = await page.locator(".focus-panel").boundingBox();
    const attentionBox = await page.locator(".attention-panel").boundingBox();
    expect(Math.abs(focusBox.y - mainColumnBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(mainColumnBox.y - asideBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(focusBox.y - calendarBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(focusBox.height - calendarBox.height)).toBeLessThanOrEqual(
      1,
    );
    expect(calendarBox.x).toBeGreaterThanOrEqual(
      mainColumnBox.x + mainColumnBox.width,
    );
    expect(weeklyBox.y).toBeGreaterThanOrEqual(
      calendarBox.y + calendarBox.height - 1,
    );
    expect(attentionBox.y).toBeGreaterThanOrEqual(
      focusBox.y + focusBox.height - 1,
    );
    expect(Math.abs(attentionBox.x - focusBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(attentionBox.y - weeklyBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(attentionBox.width - weeklyBox.width)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(attentionBox.height - weeklyBox.height),
    ).toBeLessThanOrEqual(1);
    expect(weeklyBox.x).toBeGreaterThanOrEqual(
      attentionBox.x + attentionBox.width,
    );
    expect(
      await page
        .locator(".attention-list")
        .evaluate((list) => list.scrollWidth <= list.clientWidth + 1),
    ).toBe(true);
    await nextAttention(page).click();
    await expect(attentionRows(page)).toHaveCount(1);
    await expect(page.locator(".attention-page-label")).toHaveText(
      "Sayfa 2 / 2",
    );
    const after = await calendar(page).boundingBox();
    expect(after).toEqual(calendarBox);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await saved(page)).toBe(original);
    await page.screenshot({
      path: testInfo.outputPath(`calendar-attention-${width}-${theme}.png`),
      fullPage: false,
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `calendar-attention-${width}-${theme}-full.png`,
      ),
      fullPage: true,
    });
  });
}

test("expanded month and week show only real active dates, escape source titles, and open the exact record with keyboard and Escape", async ({
  page,
}, testInfo) => {
  const original = await seed(page);
  await calendar(page).locator(".calendar-expand").focus();
  await page.keyboard.press("Enter");
  await expect(expanded(page)).toBeVisible();
  await expect(expanded(page).locator(".calendar-expanded-grid")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("calendar-expanded-month.png"),
  });
  expect(
    await expanded(page)
      .locator(".calendar-day-agenda [data-calendar-record-id]")
      .evaluateAll((entries) =>
        entries.map((entry) => entry.dataset.calendarRecordId).sort(),
      ),
  ).toEqual(
    [
      "attention-waiting-today",
      "calendar-daily",
      "calendar-unsafe",
      "calendar-weekly",
    ].sort(),
  );
  const visibleIds = await expanded(page)
    .locator(".calendar-expanded-grid [data-calendar-record-id]")
    .evaluateAll((rows) => [
      ...new Set(rows.map((row) => row.dataset.calendarRecordId)),
    ]);
  expect(visibleIds.sort()).toEqual(
    [
      "attention-waiting-overdue",
      "attention-waiting-urgent-plus-three",
      "attention-waiting-plus-three",
      "calendar-daily",
      "calendar-monthly",
      "calendar-routed-daily",
      "calendar-unsafe",
      "calendar-waiting-plus-four",
    ].sort(),
  );
  await expect(
    expanded(page).locator(
      '.calendar-cell-more[data-calendar-date="2026-11-08"]',
    ),
  ).toHaveText("+2 kayıt");
  expect(
    await expanded(page)
      .locator(".calendar-expanded-cell")
      .evaluateAll((cells) =>
        cells.every(
          (cell) => cell.querySelectorAll(".calendar-cell-entry").length <= 2,
        ),
      ),
  ).toBe(true);
  for (const id of [
    "calendar-yearly",
    "calendar-period-only",
    "calendar-meeting-no-date",
    "calendar-meeting-plus-four",
    "calendar-waiting-due-only",
    "calendar-closed",
    "calendar-cancelled",
    "calendar-routed-meeting",
  ])
    expect(visibleIds).not.toContain(id);
  await expect(
    expanded(page).locator(
      '.calendar-expanded-grid [data-calendar-record-id="calendar-unsafe"]',
    ),
  ).toContainText(UNSAFE_TITLE);
  await expect(expanded(page).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__calendarInjected)).toBeUndefined();
  await expanded(page)
    .locator('.calendar-cell-date[data-calendar-date="2026-11-08"]')
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    expanded(page).locator(
      '.calendar-cell-date[data-calendar-date="2026-11-09"]',
    ),
  ).toBeFocused();
  expect(
    await expanded(page)
      .locator(".calendar-day-agenda [data-calendar-record-id]")
      .evaluateAll((entries) => [
        ...new Set(entries.map((entry) => entry.dataset.calendarRecordId)),
      ]),
  ).toEqual(["calendar-routed-daily"]);
  await expanded(page)
    .locator(
      '[data-calendar-action="select-day"][data-calendar-date="2026-11-10"]',
    )
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    expanded(page).locator(
      '.calendar-day-agenda [data-calendar-record-id="calendar-monthly"]',
    ),
  ).toBeVisible();
  await expect(
    expanded(page).locator(
      '.calendar-day-agenda [data-calendar-record-id="calendar-waiting-due-only"]',
    ),
  ).toHaveCount(0);
  await expanded(page)
    .locator('.calendar-cell-date[data-calendar-date="2026-11-11"]')
    .click();
  await expanded(page)
    .locator('.calendar-mode [data-calendar-mode="week"]')
    .click();
  await expect(expanded(page).locator(".calendar-expanded-week")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("calendar-expanded-week.png"),
  });
  await expect(
    expanded(page)
      .locator('.calendar-expanded-week [data-calendar-action="select-day"]')
      .first(),
  ).toHaveAttribute("data-calendar-date", "2026-11-09");
  await expanded(page)
    .locator(
      '.calendar-day-agenda [data-calendar-record-id="attention-waiting-plus-three"]',
    )
    .click();
  await expect(expanded(page)).toBeVisible();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Özel arama dış yanıtı",
  );
  await expect(page.locator('#record-form [name="type"]')).toHaveValue(
    "waiting",
  );
  expect(await saved(page)).toBe(original);
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(expanded(page)).toBeVisible();
  await expect(expanded(page).locator(".calendar-expanded-week")).toBeVisible();
  await expect(
    expanded(page).locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-11-11");
  await expect(
    expanded(page).locator(
      '.calendar-day-agenda [data-calendar-record-id="attention-waiting-plus-three"]',
    ),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(expanded(page)).not.toBeVisible();
  expect(await saved(page)).toBe(original);
});

test("an expanded calendar survives record cancel, save and delete with its selected month and day intact", async ({
  page,
}) => {
  const original = await seed(page);
  const originalRecords = JSON.parse(original).records;
  const currentRecords = async () => JSON.parse(await saved(page)).records;
  await page.getByRole("button", { name: "Takvimi aç", exact: true }).click();
  await expanded(page)
    .locator(
      '[data-calendar-action="select-day"][data-calendar-date="2026-11-10"]',
    )
    .first()
    .click();
  const entry = expanded(page).locator(
    '.calendar-day-agenda [data-calendar-record-id="calendar-monthly"]',
  );
  const returned = async () => {
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(expanded(page)).toBeVisible();
    expect(
      await expanded(page).evaluate((element) => element.matches(":modal")),
    ).toBe(true);
    await expect(
      expanded(page).locator(".calendar-selected-label time"),
    ).toHaveAttribute("datetime", "2026-11-10");
    await expect(expanded(page).locator(".calendar-month-title")).toContainText(
      "Kasım 2026",
    );
  };
  await entry.click();
  await expect(page.locator("#editor")).toBeVisible();
  expect(
    await page
      .locator("#editor")
      .evaluate((element) => element.matches(":modal")),
  ).toBe(true);
  expect(
    await expanded(page).evaluate((element) => element.matches(":modal")),
  ).toBe(true);
  await page
    .locator('#record-form [name="title"]')
    .fill("Kaydedilmeyen takvim taslağı");
  await page.keyboard.press("Escape");
  await returned();
  await expect(entry).toBeFocused();
  expect(await saved(page)).toBe(original);

  await entry.click();
  await page
    .locator('#record-form [name="title"]')
    .fill("Takvimden güncellenen aylık hedef");
  await page
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await returned();
  await expect(entry).toContainText("Takvimden güncellenen aylık hedef");
  await expect(entry).toBeFocused();
  const edited = originalRecords.map((item) =>
    item.id === "calendar-monthly"
      ? {
          ...item,
          title: "Takvimden güncellenen aylık hedef",
          updatedAt: NOW.toISOString(),
        }
      : item,
  );
  expect(await currentRecords()).toEqual(edited);

  await entry.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#editor")
    .getByRole("button", { name: "Kaydı sil", exact: true })
    .click();
  await returned();
  await expect(entry).toHaveCount(0);
  await expect(
    expanded(page).locator(
      '.calendar-cell-date[data-calendar-date="2026-11-10"]',
    ),
  ).toBeFocused();
  expect(await currentRecords()).toEqual(
    edited.filter((item) => item.id !== "calendar-monthly"),
  );
  await expanded(page)
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(expanded(page)).not.toBeVisible();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await currentRecords()).toEqual(edited);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(original);

  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator(
      '.full-table tr[data-record-row][data-id="calendar-daily"] .task-name',
    )
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(expanded(page)).not.toBeVisible();
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(original);
  await page.reload();
  expect(await saved(page)).toBe(original);
});

test("expanded future-week creation returns to the same calendar and today navigation remains read-only", async ({
  page,
}) => {
  const original = await seed(page);
  const originalRecords = JSON.parse(original).records;
  await page.getByRole("button", { name: "Takvimi aç", exact: true }).click();
  await expanded(page).locator('[data-calendar-action="next"]').click();
  await expect(expanded(page)).toBeVisible();
  await expect(expanded(page).locator(".calendar-month-title")).toContainText(
    "Aralık 2026",
  );
  await expanded(page)
    .locator('.calendar-cell-date[data-calendar-date="2026-12-12"]')
    .click();
  await expanded(page)
    .locator('[data-calendar-action="mode"][data-calendar-mode="week"]')
    .click();
  await expanded(page).locator(".calendar-new-type").selectOption("waiting");
  await expanded(page).locator('[data-calendar-action="new-record"]').click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(expanded(page)).toBeVisible();
  await expect(
    page.locator('#record-form [name="nextFollowUpDate"]'),
  ).toHaveValue("12.12.2026");
  await expect(page.locator('#record-form [name="sourceDate"]')).toHaveValue(
    "08.11.2026",
  );
  await page
    .locator('#record-form [name="title"]')
    .fill("Aralık ayında yapılacak takip");
  await page
    .locator("#record-form")
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(expanded(page)).toBeVisible();
  await expect(expanded(page).locator(".calendar-expanded-week")).toBeVisible();
  await expect(
    expanded(page).locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-12-12");
  await expect(
    expanded(page).locator('[data-calendar-action="new-record"]'),
  ).toBeFocused();
  const afterCreation = JSON.parse(await saved(page)).records;
  const created = afterCreation.find(
    (item) => !originalRecords.some((original) => original.id === item.id),
  );
  expect(afterCreation.filter((item) => item.id !== created.id)).toEqual(
    originalRecords,
  );
  expect(created).toMatchObject({
    type: "waiting",
    title: "Aralık ayında yapılacak takip",
    nextFollowUpDate: "2026-12-12",
    sourceDate: "2026-11-08",
    lastFollowUpDate: "",
    latestUpdate: "",
  });
  expect(created).not.toHaveProperty("followUpLog");
  await expect(
    expanded(page).locator(
      `.calendar-day-agenda [data-calendar-record-id="${created.id}"]`,
    ),
  ).toBeVisible();
  const createdBytes = await saved(page);

  await expanded(page).locator(".calendar-new-type").selectOption("daily");
  await expanded(page).locator('[data-calendar-action="new-record"]').click();
  await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
    "12.12.2026",
  );
  await page
    .locator('#record-form [name="title"]')
    .fill("Kaydedilmeyen Aralık işi");
  await page
    .locator("#record-form")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(expanded(page)).toBeVisible();
  await expect(
    expanded(page).locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-12-12");
  expect(await saved(page)).toBe(createdBytes);
  await expanded(page).locator('[data-calendar-action="today"]').click();
  await expect(expanded(page)).toBeVisible();
  await expect(
    expanded(page).locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-11-08");
  await expect(expanded(page).locator(".calendar-expanded-week")).toBeVisible();
  expect(await saved(page)).toBe(createdBytes);
  await expanded(page)
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(original);
});

test("calendar query and view state stay read-only while daily and waiting creation preset the selected date and cancel without writes", async ({
  page,
}) => {
  const original = await seed(page);
  await calendar(page).locator('[data-calendar-action="next"]').click();
  await expect(
    calendar(page).locator('[data-calendar-action="select-day"]').first(),
  ).toHaveAttribute("data-calendar-date", "2026-11-30");
  await page.getByRole("searchbox").fill("Özel arama");
  await expect(
    calendar(page).locator('[data-calendar-action="select-day"]').first(),
  ).toHaveAttribute("data-calendar-date", "2026-11-30");
  expect(
    await attentionRows(page).evaluateAll((rows) =>
      rows.map((row) => row.dataset.id),
    ),
  ).toEqual(["attention-waiting-plus-three"]);
  await calendar(page).locator('[data-calendar-action="prev"]').click();
  await calendar(page)
    .locator(
      '[data-calendar-action="select-day"][data-calendar-date="2026-11-08"]',
    )
    .click();
  await expect(
    calendar(page).locator(
      '.calendar-day-agenda [data-calendar-record-id="calendar-daily"]',
    ),
  ).toBeVisible();
  await expect(
    calendar(page).locator(
      '.calendar-day-agenda [data-calendar-record-id="calendar-unsafe"]',
    ),
  ).toHaveCount(0);
  for (const type of ["daily", "waiting"]) {
    await calendar(page)
      .locator(
        '[data-calendar-action="select-day"][data-calendar-date="2026-11-12"]',
      )
      .click();
    await calendar(page)
      .getByRole("combobox", { name: "Eklenecek kayıt türü" })
      .selectOption(type);
    await calendar(page).locator('[data-calendar-action="new-record"]').click();
    const form = page.locator("#record-form");
    await expect(page.locator("#editor")).toBeVisible();
    await expect(form.locator('[name="type"]')).toHaveValue(type);
    await expect(form.locator('[name="sourceDate"]')).toHaveValue("08.11.2026");
    await expect(
      form.locator(
        `[name="${type === "daily" ? "dueDate" : "nextFollowUpDate"}"]`,
      ),
    ).toHaveValue("12.11.2026");
    if (type === "waiting")
      await expect(form.locator('[name="dueDate"]')).toHaveValue("");
    expect(await saved(page)).toBe(original);
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(
      calendar(page).locator(".calendar-selected-label"),
    ).toContainText("12 Kasım");
    expect(await saved(page)).toBe(original);
  }
});
