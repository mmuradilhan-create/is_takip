import { test, expect } from "@playwright/test";
import { selectListStatus } from "./list-scope-helper.js";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("is-takip-v1")) {
      localStorage.setItem(
        "is-takip-v1",
        JSON.stringify({ version: 1, records: [] }),
      );
    }
  });
});

async function seed(page, records) {
  await page.goto("/");
  await page.evaluate(
    ({ key, records }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, records }));
    },
    { key: KEY, records },
  );
  await page.reload();
}

const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const readSaved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const detail = (page) => page.locator("#goal-detail-panel");

async function closeDetail(page) {
  if (await detail(page).isVisible()) await page.keyboard.press("Escape");
  await expect(detail(page)).not.toBeVisible();
}

async function expand(page, id) {
  await closeDetail(page);
  await row(page, id).locator('.task-name[data-action="goal-details"]').click();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page)).toHaveAttribute("data-goal-id", id);
}

async function changeStatus(page, id, status) {
  const child = detail(page).locator(`.goal-child-row[data-id="${id}"]`);
  if (status === "completed") await child.locator(".quick-complete").click();
  else {
    await child.locator(".status-trigger").click();
    await expect(page.locator("#status-menu")).toBeVisible();
    await page.locator(`#status-menu [data-status="${status}"]`).click();
    await expect(page.locator("#status-menu")).not.toBeVisible();
  }
  await expect(page.locator("#editor")).not.toBeVisible();
}

function linkedFixture() {
  const weekly = createRecord({
    id: "weekly-plan",
    type: "weekly",
    title: "Haftalık teslim planı",
    periodKey: "2026-W45",
    dueDate: "2026-11-08",
    owner: "Kişisel kullanıcı",
  });
  const children = [
    createRecord({
      id: "daily-done",
      title: "İlk adımı tamamla",
      status: "completed",
      parentId: weekly.id,
    }),
    createRecord({
      id: "daily-next",
      title: "İkinci adımı hazırla",
      status: "in_progress",
      parentId: weekly.id,
      priority: "high",
      dueDate: "2026-11-07",
      sourceFields: { "Özgün alan": "Korunacak değer" },
    }),
    createRecord({
      id: "daily-waiting",
      title: "Onayı takip et",
      status: "waiting",
      parentId: weekly.id,
    }),
    createRecord({
      id: "daily-cancelled",
      title: "İptal edilen adım",
      status: "cancelled",
      parentId: weekly.id,
    }),
    createRecord({
      id: "daily-transferred",
      title: "Devredilen adım",
      status: "transferred",
      parentId: weekly.id,
    }),
  ];
  return [weekly, ...children];
}

test("planning screens share compact rows and weekly details open separately without editing or saving", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-09T12:00:00.000Z"));
  const records = [
    ...linkedFixture(),
    createRecord({
      id: "monthly-goal",
      type: "monthly",
      title: "Aylık rapor hedefi",
      periodKey: "2026-11",
      targetValue: 10,
      currentValue: 7,
      metric: "Rapor",
    }),
    createRecord({
      id: "yearly-goal",
      type: "yearly",
      title: "Senelik rapor hedefi",
      periodKey: "2026",
      targetValue: 100,
      currentValue: 40,
      metric: "Rapor",
    }),
  ];
  await seed(page, records);
  for (const type of ["daily", "weekly", "monthly", "yearly"]) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await expect(page.locator(".full-table")).toBeVisible();
    await expect(page.locator(".weekly-card, .weekly-card-list")).toHaveCount(
      0,
    );
    await expect(page.locator(".full-table > thead .owner-col")).toHaveCount(0);
    const headings = await page
      .locator(".full-table > thead th")
      .allTextContents();
    expect(
      headings
        .map((text) => text.trim())
        .filter((text) => !["İŞLEM", "İşlem", ""].includes(text))
        .slice(1),
    ).toEqual(
      type === "daily"
        ? ["Durum", "Öncelik", "Teslim tarihi"]
        : type === "yearly"
          ? ["Durum", "Öncelik", "İlerleme"]
          : ["Durum", "Öncelik", "Teslim tarihi", "İlerleme"],
    );
    const dimensions = await page.locator(".full-table").evaluate((table) => {
      const row = table.querySelector("tbody > tr");
      const controls = [
        ["status-col", ".status-trigger"],
        ["priority-col", ".priority"],
        ["date-col", ".deadline-tag"],
      ].flatMap(([column, selector]) => {
        const header = table.querySelector(`thead .${column}`);
        if (!header) return [];
        return [
          {
            column,
            header: header.getBoundingClientRect().width,
            cell: row.querySelector(`td.${column}`).getBoundingClientRect()
              .width,
            control: row
              .querySelector(`td.${column} > ${selector}`)
              .getBoundingClientRect().width,
          },
        ];
      });
      const actions = row.querySelector("td.row-action-col");
      const progress = table.querySelector("thead .progress-col");
      return {
        controls,
        actions: actions.getBoundingClientRect().width,
        actionHeader: table
          .querySelector("thead .row-action-col")
          .getBoundingClientRect().width,
        actionAlignment: getComputedStyle(
          actions.querySelector(".row-end-actions"),
        ).justifyContent,
        actionGroups: [
          ...table.querySelectorAll("tbody > tr .row-end-actions"),
        ].map((group) =>
          [...group.children].map((control) => control.dataset.action),
        ),
        progress: progress?.getBoundingClientRect().width,
      };
    });
    expect(dimensions.controls.map(({ column }) => column)).toEqual(
      type === "yearly"
        ? ["status-col", "priority-col"]
        : ["status-col", "priority-col", "date-col"],
    );
    for (const control of dimensions.controls) {
      expect(control.header).toBeCloseTo(112, 1);
      expect(control.cell).toBeCloseTo(112, 1);
      expect(control.control).toBeCloseTo(96, 1);
    }
    const actionCount = Math.max(
      ...dimensions.actionGroups.map((group) => group.length),
    );
    expect([2, 3]).toContain(actionCount);
    if (actionCount === 3) {
      expect(["weekly", "monthly"]).toContain(type);
      for (const group of dimensions.actionGroups.filter(
        (group) => group.length === 3,
      ))
        expect(group).toEqual([
          "edit",
          type === "weekly" ? "carry-weekly" : "carry-monthly",
          "new-linked",
        ]);
    }
    const actionWidth = actionCount === 3 ? 122 : 88;
    expect(dimensions.actions).toBeCloseTo(actionWidth, 1);
    expect(dimensions.actionHeader).toBeCloseTo(actionWidth, 1);
    expect(dimensions.actionAlignment).toBe("flex-start");
    // Progress is a 112px column with a 96x30 box like status and date.
    if (type !== "daily") expect(dimensions.progress).toBeCloseTo(112, 1);
    await expect(page.locator("#period-filter")).toHaveCount(
      type === "yearly" ? 0 : 1,
    );
    await expect(page.locator("#status-filter")).toHaveValue("all");
    await expect(
      page.locator('[data-action="list-scope"][data-scope="open"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(
        ".task-meta-line .goal-details-trigger, .task-meta-line .work-journal-trigger",
      ),
    ).toHaveCount(0);
    const actions = page
      .locator(".full-table > tbody > tr")
      .first()
      .locator("td.row-action-col .row-icon-action");
    expect(await actions.count()).toBeGreaterThan(0);
    for (const action of await actions.all()) {
      await expect(action).toHaveText("");
      await expect(action.locator("svg")).toHaveCount(1);
      await expect(action).toHaveAttribute("aria-label", /.+/);
    }
    if (type !== "daily") {
      await expect(
        page
          .locator(".full-table > tbody > tr")
          .first()
          .locator('td.row-action-col .goal-edit-trigger[data-action="edit"]'),
      ).toHaveCount(1);
    }
  }
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(
    row(page, "weekly-plan").locator('[data-action="carry-weekly"]'),
  ).toBeVisible();
  await page.locator('[data-action="period-prev"]').click();
  await expect(row(page, "weekly-plan")).toBeVisible();
  await expect(
    row(page, "weekly-plan").locator('[data-action="carry-weekly"]'),
  ).toHaveCount(0);
  await expect(
    row(page, "weekly-plan").locator(".row-end-actions > button"),
  ).toHaveCount(2);
  expect(
    (await row(page, "weekly-plan").locator("td.row-action-col").boundingBox())
      .width,
  ).toBeCloseTo(88, 1);
  expect(
    (await page.locator(".full-table thead th.row-action-col").boundingBox())
      .width,
  ).toBeCloseTo(88, 1);
  const saved = await readSaved(page);
  const beforeHeight = (await row(page, "weekly-plan").boundingBox()).height;
  await expect(page.locator(".linked-detail-row")).toHaveCount(0);
  await expand(page, "weekly-plan");
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail(page).locator(".goal-child-row")).toHaveCount(5);
  expect((await row(page, "weekly-plan").boundingBox()).height).toBe(
    beforeHeight,
  );
  await closeDetail(page);
  expect(await readSaved(page)).toBe(saved);
  await row(page, "weekly-plan").focus();
  await page.keyboard.press("Enter");
  await expect(detail(page)).toBeVisible();
  await expect(detail(page)).toHaveAttribute("data-goal-id", "weekly-plan");
  await expect(page.locator("#editor")).not.toBeVisible();
  await detail(page)
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "weekly-plan",
  );
  await expect(page.locator('#record-form select[name="type"]')).toHaveValue(
    "weekly",
  );
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Haftalık teslim planı",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("weekly-common-list.png"),
    fullPage: false,
  });
});

test("linked panel refreshes after status changes and undo updates weekly progress exactly", async ({
  page,
}) => {
  const records = linkedFixture();
  await seed(page, records);
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(
    row(page, "weekly-plan").locator(".metric-cell .progress-chip"),
  ).toHaveAttribute("aria-valuenow", "33");
  await expand(page, "weekly-plan");
  await changeStatus(page, "daily-next", "completed");
  await expect(detail(page, "weekly-plan")).toBeVisible();
  await expect(
    row(page, "weekly-plan").locator(".metric-cell .progress-chip"),
  ).toHaveAttribute("aria-valuenow", "67");
  const changed = await readRecords(page);
  expect(changed.map((record) => record.id)).toEqual(
    records.map((record) => record.id),
  );
  for (const record of changed) {
    const original = records.find((candidate) => candidate.id === record.id);
    if (record.id === "daily-next")
      expect({
        ...record,
        status: original.status,
        updatedAt: original.updatedAt,
      }).toEqual(original);
    else expect(record).toEqual(original);
  }
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  await expect(detail(page)).toBeVisible();
  await expect(
    row(page, "weekly-plan").locator(".metric-cell .progress-chip"),
  ).toHaveAttribute("aria-valuenow", "33");
  await expect(detail(page, "weekly-plan")).toBeVisible();
  await detail(page, "weekly-plan")
    .getByRole("button", { name: "İkinci adımı hazırla", exact: true })
    .click();
  await expect(page.locator('#record-form [name="parentId"]')).toHaveValue(
    "weekly-plan",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await closeDetail(page);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.locator("#list-density")).toHaveCount(0);
  await page.locator('#settings-dialog [name="theme"][value="dark"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await expand(page, "weekly-plan");
  await expect(detail(page)).toBeVisible();
  expect(await readRecords(page)).toEqual(records);
});

test("measured goals keep their numerical progress while linked work and empty goals remain accessible", async ({
  page,
}) => {
  const records = [
    createRecord({
      id: "weekly-measured",
      type: "weekly",
      title: "Ölçülen haftalık hedef",
      targetValue: 10,
      currentValue: 7,
      metric: "Rapor",
      status: "in_progress",
    }),
    createRecord({
      id: "measured-done",
      title: "İlk rapor işi",
      status: "completed",
      parentId: "weekly-measured",
    }),
    createRecord({
      id: "measured-next",
      title: "İkinci rapor işi",
      parentId: "weekly-measured",
    }),
    createRecord({
      id: "weekly-empty",
      type: "weekly",
      title: "Yeni haftalık hedef",
    }),
  ];
  await seed(page, records);
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(
    row(page, "weekly-measured").locator(".metric-cell .progress-chip"),
  ).toHaveAttribute("aria-valuenow", "70");
  await expect(
    row(page, "weekly-measured").locator(".metric-cell"),
  ).toContainText(/7\s*\/\s*10/);
  await expand(page, "weekly-measured");
  await expect(detail(page).locator(".goal-panel-body")).toContainText(
    /1\s*\/\s*2/,
  );
  await changeStatus(page, "measured-next", "completed");
  await expect(
    row(page, "weekly-measured").locator(".metric-cell .progress-chip"),
  ).toHaveAttribute("aria-valuenow", "70");
  await expect(detail(page).locator(".goal-panel-body")).toContainText(
    /2\s*\/\s*2/,
  );
  await closeDetail(page);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  await expand(page, "weekly-empty");
  await expect(detail(page).locator(".goal-panel-empty")).toBeVisible();
  await detail(page, "weekly-empty")
    .getByRole("button", { name: "Yeni adım ekle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="type"]')).toHaveValue("daily");
  await expect(page.locator('#record-form [name="parentId"]')).toHaveValue(
    "weekly-empty",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
});

test("period navigation selects weekly, monthly and yearly records without rewriting their periods", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  const records = [
    createRecord({
      id: "week-past",
      type: "weekly",
      title: "Önceki hafta",
      periodKey: "2026-W44",
      dueDate: "2026-11-06",
    }),
    createRecord({
      id: "week-current",
      type: "weekly",
      title: "Bu hafta",
      periodKey: "2026-W45",
      dueDate: "2026-12-01",
    }),
    createRecord({
      id: "week-date",
      type: "weekly",
      title: "Tarihten gelen hafta",
      dueDate: "2026-11-05",
    }),
    createRecord({
      id: "week-next",
      type: "weekly",
      title: "Gelecek hafta",
      periodKey: "2026-W46",
      dueDate: "2026-11-06",
    }),
    createRecord({
      id: "month-past",
      type: "monthly",
      title: "Önceki ay",
      periodKey: "2026-10",
      dueDate: "2026-11-06",
    }),
    createRecord({
      id: "month-current",
      type: "monthly",
      title: "Bu ay",
      periodKey: "2026-11",
      dueDate: "2026-12-01",
    }),
    createRecord({
      id: "month-next",
      type: "monthly",
      title: "Gelecek ay",
      periodKey: "2026-12",
    }),
    createRecord({
      id: "year-past",
      type: "yearly",
      title: "Önceki yıl",
      periodKey: "2025",
    }),
    createRecord({
      id: "year-current",
      type: "yearly",
      title: "Bu yıl",
      periodKey: "2026",
    }),
    createRecord({
      id: "year-next",
      type: "yearly",
      title: "Gelecek yıl",
      periodKey: "2027",
    }),
  ];
  await seed(page, records);
  const visibleIds = () =>
    page
      .locator(".full-table > tbody > tr[data-record-row]")
      .evaluateAll((rows) => rows.map((element) => element.dataset.id).sort());
  for (const [type, prefix, currentIds] of [
    ["weekly", "week", ["week-current", "week-date"]],
    ["monthly", "month", ["month-current"]],
    ["yearly", "year", ["year-current"]],
  ]) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await expect(page.locator(".planning-periodbar")).toBeVisible();
    await page.locator('[data-action="period-current"]').click();
    expect(await visibleIds()).toEqual(currentIds);
    await page.locator('[data-action="period-next"]').click();
    expect(await visibleIds()).toEqual([`${prefix}-next`]);
    await page.locator('[data-action="period-prev"]').click();
    expect(await visibleIds()).toEqual(currentIds);
    await page.locator('[data-action="period-prev"]').click();
    expect(await visibleIds()).toEqual([`${prefix}-past`]);
    await page.locator('[data-action="period-all"]').click();
    expect(await visibleIds()).toEqual(
      records
        .filter((record) => record.type === type)
        .map((record) => record.id)
        .sort(),
    );
  }
  expect(await readRecords(page)).toEqual(records);
});

test("lists open on current work and completed records remain available through status without exposing owner columns", async ({
  page,
}) => {
  const records = [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ].flatMap((type) => [
    createRecord({
      id: `open-${type}`,
      type,
      title: `Açık ${type}`,
      owner: "Korunan sorumlu",
    }),
    createRecord({
      id: `done-${type}`,
      type,
      title: `Tamamlanan ${type}`,
      status: "completed",
      owner: "Korunan sorumlu",
    }),
    createRecord({
      id: `cancelled-${type}`,
      type,
      title: `İptal edilen ${type}`,
      status: "cancelled",
      owner: "Korunan sorumlu",
    }),
  ]);
  await seed(page, records);
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ]) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await expect(page.locator("#status-filter")).toHaveValue("all");
    await expect(
      page.locator('[data-action="list-scope"][data-scope="open"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".full-table > tbody > tr[data-record-row]"),
    ).toHaveCount(1);
    await expect(row(page, `open-${type}`)).toBeVisible();
    await selectListStatus(page, "completed");
    await expect(page.locator("#status-filter")).toHaveCount(0);
    await expect(
      page.locator('[data-action="list-scope"][data-scope="completed"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, `done-${type}`)).toBeVisible();
    await expect(
      page.locator(".full-table > tbody > tr[data-record-row]"),
    ).toHaveCount(type === "meeting" ? 2 : 1);
    if (type === "meeting")
      await expect(row(page, `cancelled-${type}`)).toBeVisible();
    else await expect(row(page, `cancelled-${type}`)).toHaveCount(0);
    await selectListStatus(page, "all");
    await expect(
      page.locator(".full-table > tbody > tr[data-record-row]"),
    ).toHaveCount(3);
    await expect(page.locator(".full-table > thead .owner-col")).toHaveCount(0);
  }
  expect(await readRecords(page)).toEqual(records);
});

test("new goals inherit the selected period and linked daily work remains under that goal", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  await seed(page, []);
  await page.locator('#nav [data-view="weekly"]').click();
  await page.locator('[data-action="period-current"]').click();
  await page.locator('[data-action="period-next"]').click();
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  const form = page.locator("#record-form");
  await expect(form.locator('[name="type"]')).toHaveValue("weekly");
  await expect(form.locator('[name="periodYear"]')).toHaveValue("2026");
  await expect(form.locator('[name="periodWeek"]')).toHaveValue("46");
  await expect(form.locator('[name="periodKey"]')).toHaveValue("2026-W46");
  await form.locator('[name="title"]').fill("Gelecek haftanın yeni hedefi");
  await form.getByRole("button", { name: "Kaydı ekle", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const [goal] = await readRecords(page);
  expect(goal.type).toBe("weekly");
  expect(goal.periodKey).toBe("2026-W46");
  await expect(row(page, goal.id)).toBeVisible();
  await expand(page, goal.id);
  await detail(page, goal.id)
    .getByRole("button", { name: "Yeni adım ekle", exact: true })
    .click();
  await expect(form.locator('[name="type"]')).toHaveValue("daily");
  await expect(form.locator('[name="parentId"]')).toHaveValue(goal.id);
  await form.locator('[name="title"]').fill("Hedefin ilk günlük adımı");
  await form.getByRole("button", { name: "Kaydı ekle", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const saved = await readRecords(page);
  expect(saved).toHaveLength(2);
  expect(saved.find((record) => record.type === "daily").parentId).toBe(
    goal.id,
  );
  expect(saved.find((record) => record.type === "weekly")).toEqual(goal);
  await expand(page, goal.id);
  await expect(detail(page).locator(".goal-child-row")).toHaveCount(1);
});
