import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.panelInjected=1"> Gerçek karar';
const LONG_NOTE = Array.from(
  { length: 55 },
  (_, index) => `${index + 1}. Özgün kayıt notu ve tarihsel bağlam korunur.`,
).join("\n");
const make = (values) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...values });
const source = (id, type) => ({
  __followupSource: { recordId: id, type },
});
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const panel = (page, type) => page.locator(`#${type}-record-panel`);
const editor = (page) => page.locator("#editor");
const form = (page) => page.locator("#record-form");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const view = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const sourceIcon = (page, id, sourceId) =>
  row(page, id).locator(`.record-source-link[data-id="${sourceId}"]`);
const closeEditor = (page) =>
  editor(page).getByRole("button", { name: "Vazgeç", exact: true }).click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture() {
  return [
    make({
      id: "panel-meeting",
      type: "meeting",
      title: "Panel toplantı kararı",
      decision: UNSAFE,
      sourceDate: "2026-11-05",
      description: LONG_NOTE,
      sourceFields: { "Özgün karar": { value: "Korunmalı" } },
    }),
    make({
      id: "panel-meeting-empty",
      type: "meeting",
      title: "Panel bağımsız toplantı",
      decision: "Henüz bağlı işi olmayan gerçek karar.",
      sourceDate: "2026-11-06",
      description: LONG_NOTE,
      sourceFields: { "Ham karar": { value: "Değişmemeli" } },
    }),
    make({
      id: "panel-meeting-archived",
      type: "meeting",
      title: "Panel arşivlenmiş toplantı",
      status: "completed",
      decision: "Arşivdeki kaynak yeni iş yaratmamalı.",
    }),
    make({
      id: "panel-waiting",
      type: "waiting",
      title: "Panel dış yanıt konusu",
      status: "follow_up",
      expectedFrom: "Dış ekip",
      latestUpdate: "Gerçek son gelişme korunmalı.",
      sourceDate: "2026-10-01",
      lastFollowUpDate: "2026-11-07",
      nextFollowUpDate: "2026-11-10",
      description: LONG_NOTE,
      followUpLog: [
        {
          id: "panel-contact",
          date: "2026-11-07",
          note: "Tarihli gerçek takip sonucu.",
          nextFollowUpDate: "2026-11-10",
        },
      ],
      sourceFields: { "Ham takip": { value: "Değişmemeli" } },
    }),
    make({
      id: "panel-waiting-empty",
      type: "waiting",
      title: "Panel bağımsız bekleyen konu",
      status: "follow_up",
      expectedFrom: "Satın alma",
      latestUpdate: "Teklif istendi.",
      sourceDate: "2026-10-01",
      nextFollowUpDate: "2026-11-11",
      description: LONG_NOTE,
      sourceFields: { "Özgün takip": "Korunmalı" },
    }),
    make({
      id: "panel-daily-meeting",
      title: "Bağlantı toplantı işi",
      description: "Günlük işin doğrudan düzenlenecek özgün notu.",
      status: "in_progress",
      dueDate: "2026-11-10",
      sourceFields: source("panel-meeting", "meeting"),
    }),
    make({
      id: "panel-daily-waiting",
      title: "Bağlantı dış ekip işi",
      dueDate: "2026-11-11",
      sourceFields: source("panel-waiting", "waiting"),
    }),
    make({
      id: "panel-meeting-followup",
      type: "waiting",
      title: "Toplantının gerçek dış takibi",
      status: "waiting_response",
      expectedFrom: "Üretim",
      latestUpdate: "Yanıt bekleniyor.",
      nextFollowUpDate: "2026-11-12",
      sourceFields: source("panel-meeting", "meeting"),
    }),
  ];
}

async function seed(page) {
  const items = fixture();
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("record-panels-02117-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: items,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("record-panels-02117-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function pageContext(page) {
  return page.evaluate(() => ({
    title: document.querySelector("#page-title")?.textContent,
    view: document.querySelector('#nav [aria-current="page"]')?.dataset.view,
    search: document.querySelector("#global-search")?.value,
    scope: document.querySelector('.list-scope-tabs [aria-pressed="true"]')
      ?.dataset.scope,
    filters: ["status-filter", "priority-filter", "list-sort"].map((id) => [
      id,
      document.getElementById(id)?.value || null,
    ]),
    scroll: [window.scrollX, window.scrollY],
  }));
}

async function expectPanel(page, type, id) {
  const detail = panel(page, type);
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute("data-record-id", id);
  expect(await detail.evaluate((element) => element.matches(":modal"))).toBe(
    false,
  );
  const controls = detail.locator("input,textarea,select,button[type=submit]");
  const allowedForms =
    type === "waiting"
      ? "#waiting-link-daily-form"
      : "#meeting-link-daily-form,#meeting-link-waiting-form";
  expect(
    await controls.evaluateAll(
      (elements, selector) =>
        elements
          .filter((element) => !element.closest(selector))
          .map((element) => element.outerHTML),
      allowedForms,
    ),
  ).toEqual([]);
  await expect(detail.locator("input,textarea")).toHaveCount(0);
  if (type === "waiting") {
    await expect(
      detail.locator('#waiting-link-daily-form select[name="childId"]'),
    ).toHaveCount(1);
    await expect(
      detail.locator('#waiting-link-daily-form button[type="submit"]'),
    ).toBeDisabled();
  } else if (id === "panel-meeting-archived") {
    await expect(detail.locator("form")).toHaveCount(0);
    await expect(controls).toHaveCount(0);
    await expect(
      detail.locator('[data-action="meeting-record-route"]'),
    ).toHaveCount(0);
  } else {
    const items = await records(page);
    const meeting = items.find((item) => item.id === id);
    const targets = items.filter(
      (item) =>
        ["daily", "waiting"].includes(item.type) &&
        item.sourceFields?.__followupSource?.recordId === id &&
        item.sourceFields.__followupSource.type === "meeting",
    );
    const closed = new Set(["completed", "cancelled", "transferred"]);
    const open = targets.length
      ? targets.some((item) => !closed.has(item.status))
      : !closed.has(meeting.status);
    const emptyRoutes = open
      ? ["daily", "waiting"].filter(
          (route) => !targets.some((item) => item.type === route),
        )
      : [];
    await expect(detail.locator("form")).toHaveCount(emptyRoutes.length);
    for (const route of ["daily", "waiting"]) {
      const attach = detail.locator(`#meeting-link-${route}-form`);
      if (!emptyRoutes.includes(route)) {
        await expect(attach).toHaveCount(0);
        continue;
      }
      const select = attach.locator(`#meeting-link-${route}[name="childId"]`);
      await expect(attach).toHaveCount(1);
      await expect(attach).toHaveAttribute("data-route", route);
      await expect(select).toHaveCount(1);
      await expect(select).toHaveValue("");
      await expect(attach.locator('button[type="submit"]')).toBeDisabled();
      if (await select.locator('option:not([value=""])').count())
        await expect(select).toBeEnabled();
      else await expect(select).toBeDisabled();
    }
  }
  await expect(editor(page)).not.toBeVisible();
}

async function confirmDismissal(page, action, accept) {
  const confirmation = page.waitForEvent("dialog");
  const attempted = action();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await attempted;
}

test("meeting and waiting titles, row keys and source icons open exact nonmodal details while explicit pencils open the original editor", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await view(page, "daily");
  await page.getByRole("searchbox").fill("Bağlantı");
  const origin = await pageContext(page);
  await sourceIcon(page, "panel-daily-meeting", "panel-meeting").click();
  await expectPanel(page, "meeting", "panel-meeting");
  await expect(
    panel(page, "meeting").locator(".meeting-record-decision"),
  ).toContainText(UNSAFE);
  await expect(panel(page, "meeting").locator("img,script")).toHaveCount(0);
  await sourceIcon(page, "panel-daily-waiting", "panel-waiting").click();
  await expectPanel(page, "waiting", "panel-waiting");
  await expect(panel(page, "meeting")).not.toBeVisible();
  expect(await pageContext(page)).toEqual(origin);
  await expect(panel(page, "waiting")).toContainText(
    "Tarihli gerçek takip sonucu.",
  );
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate(() => window.panelInjected)).toBeUndefined();
  await row(page, "panel-daily-meeting")
    .locator('[data-action="record-note"]')
    .click();
  await expect(page.locator("#record-note-editor")).toBeVisible();
  await expect(
    page.locator('#record-note-edit-form [name="description"]'),
  ).toHaveValue("Günlük işin doğrudan düzenlenecek özgün notu.");
  await page.keyboard.press("Escape");
  await expect(page.locator("#record-note-editor")).not.toBeVisible();
  await row(page, "panel-daily-meeting").locator(".task-name").click();
  await expect(form(page).locator('[name="id"]')).toHaveValue(
    "panel-daily-meeting",
  );
  await expect(panel(page, "waiting")).toBeVisible();
  await closeEditor(page);
  await expectPanel(page, "waiting", "panel-waiting");
  expect(await pageContext(page)).toEqual(origin);
  await sourceIcon(page, "panel-daily-meeting", "panel-meeting").click();
  await row(page, "panel-daily-meeting").locator(".quick-complete").click();
  await expect(panel(page, "meeting")).toBeVisible();
  expect(
    (await records(page)).find((item) => item.id === "panel-daily-meeting")
      .status,
  ).toBe("completed");
  await undo(page);
  await expectPanel(page, "meeting", "panel-meeting");
  expect(await saved(page)).toBe(before);
  await page.locator('#nav [data-view="yearly"]').click();
  await expect(page.locator("#page-title")).toHaveText("Senelik hedefler");
  await expect(panel(page, "meeting")).not.toBeVisible();
  await expect(panel(page, "waiting")).not.toBeVisible();
  await view(page, "daily");
  await page.getByRole("searchbox").fill("");

  for (const type of ["meeting", "waiting"]) {
    const id = `panel-${type}`;
    await view(page, type);
    await row(page, id).locator(".task-name").click();
    await expectPanel(page, type, id);
    const peerCell = await row(page, `panel-${type}-empty`)
      .locator("td")
      .first()
      .boundingBox();
    await page.mouse.click(peerCell.x + 6, peerCell.y + peerCell.height - 6);
    await expectPanel(page, type, `panel-${type}-empty`);
    await row(page, id).locator(".task-name").click();
    await expectPanel(page, type, id);
    await page.keyboard.press("Escape");
    await row(page, id).focus();
    await page.keyboard.press("Enter");
    await expectPanel(page, type, id);
    await page.keyboard.press("Escape");
    await row(page, id).locator(".task-name").focus();
    await page.keyboard.press("Space");
    await expectPanel(page, type, id);
    await page.keyboard.press("Escape");
    await expect(panel(page, type)).not.toBeVisible();
    await row(page, id)
      .locator('td:last-child .record-edit-trigger[data-action="edit"]')
      .click();
    await expect(editor(page)).toBeVisible();
    await expect(form(page).locator('[name="id"]')).toHaveValue(id);
    await expect(panel(page, type)).not.toBeVisible();
    await closeEditor(page);
    expect(await saved(page)).toBe(before);
  }
});

for (const type of ["meeting", "waiting"]) {
  test(`${type} details preserve the current page and body scroll through editor cancel, rejected discard, save, Undo and delete`, async ({
    page,
  }, testInfo) => {
    const items = await seed(page);
    const id = `panel-${type}-empty`;
    const original = items.find((item) => item.id === id);
    const before = await saved(page);
    await view(page, type);
    await page.getByRole("searchbox").fill("Panel");
    const origin = await pageContext(page);
    await row(page, id).locator(".task-name").click();
    await expectPanel(page, type, id);
    const detail = panel(page, type);
    const body = detail.locator(`.${type}-record-body`);
    const edit = detail.locator(`[data-action="${type}-record-edit"]`);
    await body.evaluate((element) => {
      element.scrollTop = 160;
    });
    const position = await body.evaluate((element) => element.scrollTop);
    expect(position).toBeGreaterThan(0);
    const returned = async () => {
      await expectPanel(page, type, id);
      expect(await pageContext(page)).toEqual(origin);
      expect(await body.evaluate((element) => element.scrollTop)).toBe(
        position,
      );
      await expect(edit).toBeFocused();
    };
    const startEdit = async () => {
      await edit.click();
      await expect(editor(page)).toBeVisible();
      await expect(form(page).locator('[name="id"]')).toHaveValue(id);
      await expect(detail).toBeVisible();
      expect(await pageContext(page)).toEqual(origin);
    };
    await startEdit();
    await page.screenshot({
      path: testInfo.outputPath(`${type}-panel-under-original-editor.png`),
    });
    await closeEditor(page);
    await returned();
    expect(await saved(page)).toBe(before);

    await startEdit();
    await form(page)
      .locator('[name="title"]')
      .fill("Kaydedilmeyen panel taslağı");
    await confirmDismissal(page, () => page.keyboard.press("Escape"), false);
    await expect(editor(page)).toBeVisible();
    await expect(form(page).locator('[name="title"]')).toHaveValue(
      "Kaydedilmeyen panel taslağı",
    );
    await expect(detail).toBeVisible();
    expect(await saved(page)).toBe(before);
    await confirmDismissal(page, () => page.mouse.click(2, 2), true);
    await returned();
    expect(await saved(page)).toBe(before);

    await startEdit();
    const changedTitle = `${original.title} güncellendi`;
    await form(page).locator('[name="title"]').fill(changedTitle);
    await form(page)
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await returned();
    await expect(detail.locator(`.${type}-record-title`)).toHaveText(
      changedTitle,
    );
    expect(await records(page)).toEqual(
      items.map((item) =>
        item.id === id
          ? { ...item, title: changedTitle, updatedAt: NOW.toISOString() }
          : item,
      ),
    );
    await undo(page);
    await expectPanel(page, type, id);
    await expect(detail.locator(`.${type}-record-title`)).toHaveText(
      original.title,
    );
    expect(await body.evaluate((element) => element.scrollTop)).toBe(position);
    expect(await saved(page)).toBe(before);

    await startEdit();
    await confirmDismissal(
      page,
      () =>
        editor(page)
          .getByRole("button", { name: "Kaydı sil", exact: true })
          .click(),
      true,
    );
    await expect(editor(page)).not.toBeVisible();
    await expect(detail).not.toBeVisible();
    expect(await pageContext(page)).toEqual(origin);
    expect(await records(page)).toEqual(items.filter((item) => item.id !== id));
    await undo(page);
    expect(await saved(page)).toBe(before);
    await page.reload();
    expect(await saved(page)).toBe(before);
  });
}

test("detail routes use the real linked work and follow-up, preserve waiting controls and never create missing actions merely by opening them", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  await view(page, "daily");
  const origin = await pageContext(page);
  await sourceIcon(page, "panel-daily-meeting", "panel-meeting").click();
  const meeting = panel(page, "meeting");
  await expect(meeting.locator('[data-meeting-route="daily"]')).toContainText(
    "Bağlantı toplantı işi",
  );
  await expect(meeting.locator('[data-meeting-route="waiting"]')).toContainText(
    "Toplantının gerçek dış takibi",
  );
  await meeting
    .locator('[data-action="meeting-record-route"][data-route="daily"]')
    .click();
  await expect(form(page).locator('[name="id"]')).toHaveValue(
    "panel-daily-meeting",
  );
  await expect(meeting).toBeVisible();
  expect(await pageContext(page)).toEqual(origin);
  await closeEditor(page);
  await expectPanel(page, "meeting", "panel-meeting");
  await meeting
    .locator('[data-action="meeting-record-route"][data-route="waiting"]')
    .click();
  await expectPanel(page, "waiting", "panel-meeting-followup");
  await expect(meeting).not.toBeVisible();
  expect(await pageContext(page)).toEqual(origin);
  await sourceIcon(page, "panel-daily-waiting", "panel-waiting").click();
  await expectPanel(page, "waiting", "panel-waiting");
  await panel(page, "waiting")
    .locator(
      '[data-action="waiting-record-open-daily"][data-id="panel-daily-waiting"]',
    )
    .click();
  await expect(form(page).locator('[name="id"]')).toHaveValue(
    "panel-daily-waiting",
  );
  await closeEditor(page);
  await expectPanel(page, "waiting", "panel-waiting");
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("Escape");

  for (const [type, routeType] of [
    ["meeting", "waiting"],
    ["waiting", "daily"],
  ]) {
    const id = `panel-${type}-empty`;
    await view(page, type);
    await row(page, id).locator(".task-name").click();
    await panel(page, type)
      .locator(
        type === "waiting"
          ? '[data-action="waiting-record-create-daily"]'
          : `[data-action="meeting-record-route"][data-route="${routeType}"]`,
      )
      .click();
    await expect(form(page)).toHaveAttribute("data-creation", "true");
    await expect(form(page).locator('[name="type"]')).toHaveValue(routeType);
    await expect(form(page).locator(".creation-source-context")).toContainText(
      items.find((item) => item.id === id).title,
    );
    expect(await saved(page)).toBe(before);
    await closeEditor(page);
    await expectPanel(page, type, id);
    await page.keyboard.press("Escape");
  }

  await view(page, "waiting");
  const waitingRow = row(page, "panel-waiting");
  await expect(waitingRow.locator(".waiting-followup-trigger")).toBeVisible();
  await expect(waitingRow.locator(".daily-source-control")).toBeVisible();
  await waitingRow.locator(".waiting-followup-trigger").click();
  await expect(page.locator("#waiting-followup-dialog")).toBeVisible();
  await page
    .locator("#waiting-followup-dialog")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await waitingRow.locator(".daily-source-control").click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('[name="type"]')).toHaveValue("daily");
  await expect(form(page).locator('[name="title"]')).toHaveValue("");
  await expect(form(page).locator(".creation-source-context")).toContainText(
    items.find((item) => item.id === "panel-waiting").title,
  );
  expect(await saved(page)).toBe(before);
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
  await view(page, "meeting");
  await page.locator('.list-scope-tabs [data-scope="all"]').click();
  await row(page, "panel-meeting-archived").locator(".task-name").click();
  await expectPanel(page, "meeting", "panel-meeting-archived");
  await expect(
    panel(page, "meeting").locator('[data-action="meeting-record-route"]'),
  ).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});
