import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const VALUES = ["planned", "in_progress", "completed"];
const CAPTIONS = ["Planlanacak", "Açık", "Kapandı"];
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const meeting = (id, extra = {}) =>
  make({
    id,
    type: "meeting",
    title: `Toplantı kararı ${id}`,
    status: "planned",
    sourceDate: "2026-11-02",
    decision: "Özgün toplantı kararı ve kapsamı korunur.",
    description: "Toplantının kendi notu korunur.",
    sourceFields: { original: { value: "Özgün kaynak bilgisi" } },
    ...extra,
  });
const child = (id, sourceId, type, extra = {}) =>
  make({
    id,
    type,
    title: `${type} için ayrı yürütme kaydı ${id}`,
    status: "planned",
    ...(type === "daily"
      ? {
          dueDate: "2026-11-12",
          workLog: [
            {
              id: `session-${id}`,
              date: "2026-11-06",
              endedAt: "2026-11-06T09:00:00.000Z",
              durationMs: 120_000,
              note: "Kaydedilmiş gerçek çalışma sonucu",
              nextAction: "Geçmiş sonraki adım",
            },
          ],
        }
      : {
          sourceDate: "2026-11-01",
          expectedFrom: "Dış tasarım ekibi",
          latestUpdate: "Yanıt bekleniyor.",
          nextFollowUpDate: "2026-11-12",
        }),
    sourceFields: { __followupSource: { recordId: sourceId, type: "meeting" } },
    ...extra,
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = async (page) => JSON.parse(await saved(page));
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const ownStatus = (page, id) =>
  row(page, id).locator("td.status-col > .status-trigger");
const routeStatus = (page, id, targetId) =>
  row(page, id).locator(`.status-trigger[data-target-id="${targetId}"]`);
const panel = (page) => page.locator("#meeting-record-panel");
const form = (page) => page.locator("#editor #record-form");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const scope = (page, value) =>
  page.locator(`[data-action="list-scope"][data-scope="${value}"]`).click();

async function navigate(page, type) {
  const toggle = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

async function seed(page, records) {
  const initial = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact", theme: "light" },
      history: [],
    },
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, initial }) => {
      if (sessionStorage.getItem("meeting-own-status-seeded")) return;
      localStorage.setItem(key, initial);
      localStorage.removeItem(`${key}-work-session`);
      for (const suffix of [
        "waiting-state-migration",
        "daily-context-migration",
        "meeting-contact-cleanup",
      ])
        localStorage.setItem(`${key}-${suffix}`, "1");
      sessionStorage.setItem("meeting-own-status-seeded", "1");
    },
    { key: KEY, initial },
  );
  await page.goto("/");
  await navigate(page, "meeting");
  expect(await saved(page)).toBe(initial);
  return initial;
}

async function chooseStatus(page, trigger, id, status) {
  await trigger.click();
  const menu = page.locator("#status-menu");
  await expect(menu).toBeVisible();
  await menu
    .locator(`.status-option[data-id="${id}"][data-status="${status}"]`)
    .click();
  await expect(menu).not.toBeVisible();
}

async function expectThreeChoices(select) {
  expect(
    await select
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(VALUES);
  await expect(select.locator("option")).toHaveText(CAPTIONS);
}

test("a meeting owns all three quick statuses and its preview while linked work and one-step Undo retain their exact records", async ({
  page,
}) => {
  const items = [
    meeting("own-source"),
    child("own-daily", "own-source", "daily", { status: "in_progress" }),
    child("own-waiting", "own-source", "waiting", { status: "follow_up" }),
    make({ id: "own-unrelated", title: "İlişkisiz günlük iş" }),
  ];
  const before = await seed(page, items);
  await expect(ownStatus(page, "own-source")).toHaveText("Planlanacak");
  await expect(routeStatus(page, "own-source", "own-daily")).toHaveText(
    "Devam ediyor",
  );
  await expect(routeStatus(page, "own-source", "own-waiting")).toHaveText(
    "Takipte",
  );
  await ownStatus(page, "own-source").click();
  const options = page.locator("#status-menu .status-option");
  await expect(options).toHaveText(CAPTIONS);
  expect(
    await options.evaluateAll((buttons) =>
      buttons.map((button) => [button.dataset.id, button.dataset.status]),
    ),
  ).toEqual(VALUES.map((value) => ["own-source", value]));
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);

  await chooseStatus(
    page,
    ownStatus(page, "own-source"),
    "own-source",
    "in_progress",
  );
  await expect(ownStatus(page, "own-source")).toHaveText("Açık");
  const afterOpen = await saved(page);
  const openStore = JSON.parse(afterOpen);
  expect(openStore.records).toEqual([
    { ...items[0], status: "in_progress", updatedAt: NOW.toISOString() },
    ...items.slice(1),
  ]);
  expect(openStore.odak.history).toHaveLength(1);

  await row(page, "own-source").locator(".task-name").click();
  await expect(panel(page)).toHaveAttribute("data-record-id", "own-source");
  const summary = panel(page).locator(
    ".meeting-record-summary .status-trigger",
  );
  await expect(summary).toHaveText("Açık");
  await expect(summary).not.toHaveAttribute("data-target-id");
  await chooseStatus(page, summary, "own-source", "completed");
  await expect(panel(page)).toBeVisible();
  await expect(summary).toHaveText("Kapandı");
  await expect(row(page, "own-source")).toHaveCount(0);
  const closedStore = await store(page);
  expect(closedStore.records).toEqual([
    { ...items[0], status: "completed", updatedAt: NOW.toISOString() },
    ...items.slice(1),
  ]);
  expect(closedStore.odak.history).toHaveLength(2);
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();

  await page.reload();
  await navigate(page, "meeting");
  await undo(page);
  expect(await saved(page)).toBe(afterOpen);
  await expect(ownStatus(page, "own-source")).toHaveText("Açık");
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(ownStatus(page, "own-source")).toHaveText("Planlanacak");
});

test("meeting forms and filters expose three states while unrelated edits preserve legacy keys and an explicit selection stores the chosen state", async ({
  page,
}) => {
  const historical = [
    ["waiting", "in_progress"],
    ["partially_completed", "in_progress"],
    ["cancelled", "completed"],
    ["transferred", "completed"],
  ];
  const items = [
    ...historical.map(([status]) => meeting(`legacy-${status}`, { status })),
    child("legacy-linked-job", "legacy-waiting", "daily"),
  ];
  const before = await seed(page, items);
  await scope(page, "all");
  const filter = page.locator("#status-filter");
  expect(
    await filter
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(["all", ...VALUES]);
  await expect(filter.locator("option")).toHaveText([
    "Tüm durumlar",
    ...CAPTIONS,
  ]);
  await filter.selectOption("in_progress");
  await expect(row(page, "legacy-waiting")).toBeVisible();
  await expect(row(page, "legacy-partially_completed")).toBeVisible();
  await expect(row(page, "legacy-cancelled")).toHaveCount(0);
  await filter.selectOption("completed");
  await expect(row(page, "legacy-cancelled")).toBeVisible();
  await expect(row(page, "legacy-transferred")).toBeVisible();
  await expect(row(page, "legacy-waiting")).toHaveCount(0);
  await filter.selectOption("all");
  expect(await saved(page)).toBe(before);

  for (const [raw, alias] of historical) {
    const original = items.find((item) => item.id === `legacy-${raw}`);
    await row(page, original.id).locator(".record-edit-trigger").click();
    await expect(form(page).locator('[name="id"]')).toHaveValue(original.id);
    const status = form(page).locator('select[name="status"]');
    await expect(status).toBeEnabled();
    await expectThreeChoices(status);
    await expect(status).toHaveValue(alias);
    await form(page)
      .locator('[name="title"]')
      .fill(`${original.title} düzeltildi`);
    await form(page).locator('[type="submit"]').click();
    await expect(page.locator("#editor")).not.toBeVisible();
    expect((await store(page)).records).toEqual(
      items.map((item) =>
        item.id === original.id
          ? {
              ...item,
              title: `${item.title} düzeltildi`,
              updatedAt: NOW.toISOString(),
            }
          : item,
      ),
    );
    await undo(page);
    expect(await saved(page)).toBe(before);
  }

  await row(page, "legacy-cancelled").locator(".record-edit-trigger").click();
  await form(page).locator('select[name="status"]').selectOption("in_progress");
  await form(page).locator('[type="submit"]').click();
  expect((await store(page)).records).toEqual(
    items.map((item) =>
      item.id === "legacy-cancelled"
        ? { ...item, status: "in_progress", updatedAt: NOW.toISOString() }
        : item,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(before);

  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('select[name="type"]')).toHaveValue(
    "meeting",
  );
  await expectThreeChoices(form(page).locator('select[name="status"]'));
  await expect(form(page).locator('select[name="status"]')).toHaveValue(
    "planned",
  );
  await form(page)
    .locator('[name="title"]')
    .fill("Kendi durumu seçilmiş yeni toplantı");
  await form(page).locator('select[name="status"]').selectOption("in_progress");
  await form(page).locator('[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const created = (await store(page)).records;
  expect(
    created.filter((item) => items.some((original) => original.id === item.id)),
  ).toEqual(items);
  expect(
    created.filter(
      (item) => !items.some((original) => original.id === item.id),
    ),
  ).toEqual([
    expect.objectContaining({
      type: "meeting",
      title: "Kendi durumu seçilmiş yeni toplantı",
      status: "in_progress",
    }),
  ]);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("closing or reopening linked actions never changes the meeting state and every lifecycle action has an exact atomic Undo", async ({
  page,
}) => {
  const items = [
    meeting("independent-source", { status: "in_progress" }),
    child("independent-job", "independent-source", "daily"),
    child("independent-reply", "independent-source", "waiting"),
  ];
  const before = await seed(page, items);
  const snapshots = [before];
  await navigate(page, "daily");
  await row(page, "independent-job").locator(".quick-complete").click();
  snapshots.push(await saved(page));
  expect(
    (await store(page)).records.find(
      (item) => item.id === "independent-source",
    ),
  ).toEqual(items[0]);
  await navigate(page, "waiting");
  await row(page, "independent-reply").locator(".quick-complete").click();
  snapshots.push(await saved(page));
  const bothClosed = await store(page);
  expect(
    bothClosed.records.find((item) => item.id === "independent-source"),
  ).toEqual(items[0]);
  expect(
    bothClosed.records.find((item) => item.id === "independent-reply"),
  ).toEqual({
    ...items[2],
    status: "completed",
    updatedAt: NOW.toISOString(),
    sourceFields: {
      ...items[2].sourceFields,
      __waitingClosure: {
        version: 1,
        closedDate: "2026-11-09",
        closedAt: NOW.toISOString(),
      },
    },
  });
  expect(bothClosed.odak.history).toHaveLength(2);
  await navigate(page, "meeting");
  await expect(ownStatus(page, "independent-source")).toHaveText("Açık");
  await expect(
    routeStatus(page, "independent-source", "independent-job"),
  ).toHaveText("Tamamlandı");
  await expect(
    routeStatus(page, "independent-source", "independent-reply"),
  ).toHaveText("Kapandı");
  await chooseStatus(
    page,
    ownStatus(page, "independent-source"),
    "independent-source",
    "completed",
  );
  snapshots.push(await saved(page));
  const closedSource = await store(page);
  expect(closedSource.records).toEqual(
    bothClosed.records.map((item) =>
      item.id === "independent-source"
        ? { ...item, status: "completed", updatedAt: NOW.toISOString() }
        : item,
    ),
  );
  expect(closedSource.odak.history).toHaveLength(3);
  await scope(page, "all");
  await chooseStatus(
    page,
    routeStatus(page, "independent-source", "independent-job"),
    "independent-job",
    "planned",
  );
  const reopenedChild = await store(page);
  expect(
    reopenedChild.records.find((item) => item.id === "independent-source"),
  ).toEqual(
    closedSource.records.find((item) => item.id === "independent-source"),
  );
  expect(
    reopenedChild.records.find((item) => item.id === "independent-reply"),
  ).toEqual(
    closedSource.records.find((item) => item.id === "independent-reply"),
  );
  expect(
    reopenedChild.records.find((item) => item.id === "independent-job"),
  ).toEqual({ ...items[1], status: "planned", updatedAt: NOW.toISOString() });
  expect(reopenedChild.odak.history).toHaveLength(4);
  await expect(ownStatus(page, "independent-source")).toHaveText("Kapandı");
  for (const snapshot of snapshots.reverse()) {
    await undo(page);
    expect(await saved(page)).toBe(snapshot);
  }
});

test("meeting source status, routes and pencil share compact left-aligned columns in both themes and narrow viewports without losing their destinations", async ({
  page,
}) => {
  const unsafe = '<img src=x onerror="window.meetingOwnInjected=1">';
  const items = [
    meeting("layout-unlinked"),
    meeting("layout-linked", {
      title: `${unsafe} Çok uzun toplantı kararı ve özgün teknik açıklama`,
      status: "in_progress",
    }),
    meeting("layout-closed", { status: "completed" }),
    child("layout-job", "layout-linked", "daily"),
    child("layout-reply", "layout-linked", "waiting", {
      status: "waiting_response",
    }),
    child("layout-old-job", "layout-closed", "daily", { status: "completed" }),
    child("layout-open-reply", "layout-closed", "waiting", {
      status: "follow_up",
    }),
  ];
  const before = await seed(page, items);
  for (const theme of ["light", "dark"]) {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
      { width: 390, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await navigate(page, "meeting");
      await scope(page, "all");
      await page.locator("html").evaluate((element, value) => {
        element.dataset.theme = value;
      }, theme);
      const table = page.locator(".meeting-table");
      await expect(table.locator("thead th")).toHaveText([
        "Aksiyon / Karar",
        "Durum",
        "Bağlı iş",
        "Takip",
        "İşlem",
      ]);
      await expect(
        table.locator(".meeting-title-state, .meeting-archive-control"),
      ).toHaveCount(0);
      await expect(table.locator("img")).toHaveCount(0);
      expect(
        await page.evaluate(() => window.meetingOwnInjected),
      ).toBeUndefined();
      const dimensions = await table.evaluate((element) => {
        const headers = [...element.querySelectorAll("thead th")];
        const entries = [
          ...element.querySelectorAll("tbody tr[data-record-row]"),
        ];
        return entries.map((entry) => {
          const cells = [...entry.querySelectorAll(":scope > td")];
          const controlSets = [
            [...cells[1].querySelectorAll(":scope > .status-trigger")],
            [...cells[2].querySelectorAll(".meeting-route")],
            [...cells[3].querySelectorAll(".meeting-route")],
            [...cells[4].querySelectorAll(".row-end-actions > button")],
          ];
          return {
            columnWidths: cells.map(
              (cell) => cell.getBoundingClientRect().width,
            ),
            alignment: cells.slice(1).map((cell, index) => {
              const header = headers[index + 1];
              const range = document.createRange();
              range.selectNodeContents(header);
              const heading = range.getBoundingClientRect();
              const box = cell.getBoundingClientRect();
              return {
                headerAlignment: getComputedStyle(header).textAlign,
                firstLeft:
                  controlSets[index][0]?.getBoundingClientRect().left -
                  box.left,
                headingLeft: heading.left - header.getBoundingClientRect().left,
                count: controlSets[index].length,
                controls: controlSets[index].map((control) => {
                  const bounds = control.getBoundingClientRect();
                  return {
                    width: bounds.width,
                    height: bounds.height,
                    fits:
                      bounds.left >= box.left && bounds.right <= box.right + 1,
                  };
                }),
              };
            }),
          };
        });
      });
      for (const entry of dimensions) {
        expect(entry.columnWidths).toHaveLength(5);
        expect(entry.columnWidths[1]).toBeLessThanOrEqual(132);
        expect(entry.columnWidths[2]).toBeLessThanOrEqual(136);
        expect(entry.columnWidths[3]).toBeLessThanOrEqual(136);
        expect(entry.columnWidths[4]).toBeLessThanOrEqual(56);
        expect(
          entry.columnWidths.slice(1).reduce((sum, width) => sum + width, 0),
        ).toBeLessThanOrEqual(448);
        if (viewport.width >= 1280)
          expect(entry.columnWidths[0]).toBeGreaterThan(448);
        for (const [index, column] of entry.alignment.entries()) {
          expect(column.headerAlignment).toBe("left");
          expect(column.count).toBe(1);
          expect(
            Math.abs(column.firstLeft - column.headingLeft),
          ).toBeLessThanOrEqual(1);
          expect(column.controls).toEqual([
            { width: index === 3 ? 30 : 112, height: 30, fits: true },
          ]);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (viewport.width === 390) {
        expect(
          await table
            .locator("..")
            .evaluate((wrapper) => wrapper.scrollWidth > wrapper.clientWidth),
        ).toBe(true);
        await row(page, "layout-linked").locator(".task-name").click();
        await expect(panel(page)).toHaveAttribute(
          "data-record-id",
          "layout-linked",
        );
        await expect(
          panel(page).locator(".meeting-record-summary .status-trigger"),
        ).toHaveText("Açık");
        const bounds = await panel(page).boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        await panel(page)
          .getByRole("button", { name: "Kapat", exact: true })
          .click();
        await row(page, "layout-linked")
          .locator(".record-edit-trigger")
          .click();
        await expect(form(page).locator('[name="id"]')).toHaveValue(
          "layout-linked",
        );
        await expect(form(page).locator('select[name="status"]')).toBeEnabled();
        await expectThreeChoices(form(page).locator('select[name="status"]'));
        await page
          .locator("#editor")
          .getByRole("button", { name: "Vazgeç", exact: true })
          .click();
        await expect(page.locator("#editor")).not.toBeVisible();
      }
      expect(await saved(page)).toBe(before);
    }
  }
});
