import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const records = async (page) => (await stored(page)).records;
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.meeting-table tr[data-record-row][data-id="${id}"]`);
const cell = (page, id, type) =>
  row(page, id).locator(`.meeting-linked-cell[data-route="${type}"]`);
const route = (page, id, type) =>
  cell(page, id, type).locator(".meeting-route");
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const list = (page) => page.locator('#nav [data-view="meeting"]').click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
async function editMeetingThroughPreview(page, id) {
  await row(page, id).locator(".task-name").click();
  const preview = page.locator("#meeting-record-panel");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-record-id", id);
  await expect(page.locator("#editor")).not.toBeVisible();
  await preview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(field(page, "id")).toHaveValue(id);
}

const source = (id, extra = {}) =>
  make({
    id,
    type: "meeting",
    title: `Toplantı kararı ${id}`,
    decision: `Gerçek teknik karar ${id}.`,
    status: "in_progress",
    priority: "urgent",
    dueDate: "2026-11-06",
    nextAction: "Korunacak eski toplantı adımı.",
    sourceDate: "2026-10-28",
    owner: "",
    participants: "",
    description: "Özgün toplantı bağlamı.",
    sourceFields: { original: { value: "Ham toplantı bilgisi" } },
    ...extra,
  });
const target = (id, sourceId, type, extra = {}) =>
  make({
    id,
    type,
    title: `${type} akışı ${id}`,
    status: type === "waiting" ? "waiting_response" : "planned",
    priority: "normal",
    sourceFields: { __followupSource: { recordId: sourceId, type: "meeting" } },
    ...extra,
  });

async function seed(page, items = []) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("meeting-redesign-0214-seeded")) return;
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
      sessionStorage.setItem("meeting-redesign-0214-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  await list(page);
}

async function newMeeting(page) {
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('select[name="type"]')).toHaveValue(
    "meeting",
  );
}

async function saveCreation(page) {
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

test("meeting creation keeps decision primary and source-only saves contain no invented work deadline, priority or follow-up", async ({
  page,
}) => {
  const unrelated = make({ id: "untouched", title: "Mevcut günlük iş" });
  await seed(page, [unrelated]);
  const before = await saved(page);
  await newMeeting(page);
  await expect(field(page, "title")).toBeVisible();
  await expect(field(page, "decision")).toBeVisible();
  for (const name of ["priority", "dueDate"])
    await expect(field(page, name)).toHaveCount(0);
  await expect(field(page, "nextAction")).toHaveAttribute("type", "hidden");
  await expect(field(page, "nextAction")).toHaveValue("");
  await expect(field(page, "nextAction")).not.toBeVisible();
  const extra = form(page).locator("details.creation-advanced");
  expect(await extra.evaluate((element) => element.open)).toBe(true);
  await expect(field(page, "sourceDate")).toBeVisible();
  await openCreationExtras(page);
  await expect(field(page, "sourceDate")).toHaveAttribute(
    "aria-label",
    "Toplantı tarihi",
  );
  await expect(field(page, "sourceDate")).toHaveValue("08.11.2026");
  for (const name of ["priority", "dueDate"])
    await expect(field(page, name)).toHaveCount(0);
  await expect(field(page, "nextAction")).not.toBeVisible();
  await field(page, "title").fill("Yalnız karar olarak kaydedilen toplantı");
  await field(page, "decision").fill("Önce teknik tasarım gözden geçirilecek.");
  await field(page, "description").fill("Kararın gerçek bağlamı.");
  expect(await saved(page)).toBe(before);
  await saveCreation(page);
  const after = await stored(page);
  const created = after.records.find((item) => item.type === "meeting");
  expect(created).toMatchObject({
    title: "Yalnız karar olarak kaydedilen toplantı",
    decision: "Önce teknik tasarım gözden geçirilecek.",
    description: "Kararın gerçek bağlamı.",
    priority: "normal",
    dueDate: "",
    nextAction: "",
    sourceDate: "2026-11-08",
    status: "planned",
  });
  expect(after.records).toHaveLength(2);
  expect(after.records.find((item) => item.id === unrelated.id)).toEqual(
    unrelated,
  );
  expect(
    after.records.some(
      (item) => item.sourceFields?.__followupSource?.recordId === created.id,
    ),
  ).toBe(false);
  expect(after.odak.history).toHaveLength(1);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect(await records(page)).toEqual([unrelated]);
});

test("creating both routes saves the daily work's own priority and delivery separately from external follow-up information in one Undo", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await newMeeting(page);
  await field(page, "title").fill("İki bağımsız akışlı teknik karar");
  await field(page, "decision").fill(
    "Ben raporu hazırlayacağım; dış ekip doğrulayacak.",
  );
  await form(page)
    .locator('[data-action="creation-meeting-route"][data-route="both"]')
    .click();
  const daily = form(page).locator('[data-creation-route="daily"]');
  const waiting = form(page).locator('[data-creation-route="waiting"]');
  await expect(daily.locator('[name="dailyPriority"]')).toHaveValue("normal");
  await expect(daily.locator('[name="dailyDueDate"]')).toHaveValue("");
  await expect(waiting.locator('[name="nextFollowUpDate"]')).toHaveValue("");
  await expect(waiting.locator('[name="latestUpdate"]')).toHaveValue("");
  await expect(
    waiting.locator('[name="waitingDueDate"], [name="waitingNextAction"]'),
  ).toHaveCount(0);
  await daily.locator('[name="dailyTitle"]').fill("Benim teknik raporum");
  await daily.locator('[name="dailyPriority"]').selectOption("high");
  await daily.locator('[name="dailyDueDate"]').fill("12.11.2026");
  await expect(daily.locator('[name="dailyNextAction"]')).not.toBeVisible();
  await waiting.locator('[name="waitingTitle"]').fill("Dış doğrulama yanıtı");
  await waiting.locator('[name="expectedFrom"]').fill("Kalite birimi");
  await waiting.locator('[name="nextFollowUpDate"]').fill("13.11.2026");
  await waiting
    .locator('[name="latestUpdate"]')
    .fill("Teknik doğrulama istendi.");
  expect(await saved(page)).toBe(before);
  await saveCreation(page);
  const after = await stored(page);
  const meeting = after.records.find((item) => item.type === "meeting");
  const actions = after.records.filter(
    (item) => item.sourceFields?.__followupSource?.recordId === meeting.id,
  );
  expect(actions).toHaveLength(2);
  expect(actions.find((item) => item.type === "daily")).toMatchObject({
    title: "Benim teknik raporum",
    priority: "high",
    dueDate: "2026-11-12",
    nextAction: "",
    workContext: "ad_hoc",
  });
  expect(actions.find((item) => item.type === "waiting")).toMatchObject({
    title: "Dış doğrulama yanıtı",
    expectedFrom: "Kalite birimi",
    nextFollowUpDate: "2026-11-13",
    latestUpdate: "Teknik doğrulama istendi.",
    dueDate: "",
    nextAction: "",
    priority: "normal",
    lastFollowUpDate: "",
  });
  expect(meeting).toMatchObject({
    status: "planned",
    priority: "normal",
    dueDate: "",
    nextAction: "",
    decision: "Ben raporu hazırlayacağım; dış ekip doğrulayacak.",
  });
  expect(after.odak.history).toHaveLength(1);
  expect(after.records).toHaveLength(3);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("existing meeting edits and new routes preserve remaining legacy source fields while retired contact fields stay empty", async ({
  page,
}) => {
  const legacy = source("legacy", {
    owner: "Özgün toplantı sorumlusu",
    participants: "Tasarım ve üretim",
    sourceFields: {
      original: { value: "Ham toplantı bilgisi" },
      Katılımcılar: "Tasarım ve üretim",
    },
  });
  const original = cleanupMeetingContacts([legacy])[0];
  await seed(page, [legacy]);
  const before = await saved(page);
  const beforeHistory = (await stored(page)).odak.history.length;
  await editMeetingThroughPreview(page, original.id);
  await expect(
    form(page).locator('[data-record-editor-basic] [name="decision"]'),
  ).toBeVisible();
  for (const name of ["priority", "dueDate", "nextAction"]) {
    await expect(field(page, name)).not.toBeVisible();
    await expect(field(page, name)).toBeDisabled();
  }
  for (const name of ["owner", "participants"]) {
    await expect(field(page, name)).toBeHidden();
    await expect(field(page, name)).toBeDisabled();
    await expect(field(page, name)).toHaveValue(original[name]);
    await expect(
      form(page).locator(`[data-record-editor-unused] [name="${name}"]`),
    ).toHaveCount(1);
  }
  await openCreationExtras(page);
  await expect(field(page, "sourceDate")).toHaveAttribute(
    "aria-label",
    "Toplantı tarihi",
  );
  for (const name of [
    "priority",
    "dueDate",
    "nextAction",
    "owner",
    "participants",
  ])
    await expect(field(page, name)).not.toBeVisible();
  await field(page, "decision").fill("Toplantı kararındaki yazım düzeltildi.");
  await field(page, "description").fill("Toplantı bağlamı netleştirildi.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  expect((await records(page))[0]).toEqual({
    ...original,
    decision: "Toplantı kararındaki yazım düzeltildi.",
    description: "Toplantı bağlamı netleştirildi.",
    updatedAt: NOW.toISOString(),
  });
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(before);
  await list(page);
  await editMeetingThroughPreview(page, original.id);
  await form(page).locator('[data-action="meeting-route-both"]').click();
  const both = page.locator("#meeting-both-dialog");
  await expect(both).toBeVisible();
  await expect(both.locator('[name="dailyPriority"]')).toHaveValue("normal");
  await expect(both.locator('[name="dailyDueDate"]')).toHaveValue("");
  await expect(both.locator('[name="dailyNextAction"]')).toHaveValue("");
  await expect(both.locator('[name="waitingNextFollowUpDate"]')).toHaveValue(
    "",
  );
  await expect(both.locator('[name="waitingLatestUpdate"]')).toHaveValue("");
  await expect(
    both.locator('[name="waitingDueDate"], [name="waitingNextAction"]'),
  ).toHaveCount(0);
  await both.locator('[name="dailyPriority"]').selectOption("low");
  await both.locator('[name="dailyDueDate"]').fill("11.11.2026");
  await both.locator('[name="waitingExpectedFrom"]').fill("Dış üretim ekibi");
  await both.locator('[name="waitingNextFollowUpDate"]').fill("15.11.2026");
  await both
    .locator('[name="waitingLatestUpdate"]')
    .fill("Yanıt henüz gelmedi.");
  await both
    .getByRole("button", { name: "İki akışı kaydet", exact: true })
    .click();
  await expect(both).not.toBeVisible();
  const after = await stored(page);
  const preserved = after.records.find((item) => item.id === original.id);
  for (const name of [
    "dueDate",
    "priority",
    "nextAction",
    "owner",
    "description",
    "decision",
    "participants",
    "sourceDate",
    "sourceFields",
  ])
    expect(preserved[name]).toEqual(original[name]);
  expect(after.records.find((item) => item.type === "daily")).toMatchObject({
    priority: "low",
    dueDate: "2026-11-11",
    nextAction: "",
  });
  expect(after.records.find((item) => item.type === "waiting")).toMatchObject({
    expectedFrom: "Dış üretim ekibi",
    nextFollowUpDate: "2026-11-15",
    latestUpdate: "Yanıt henüz gelmedi.",
    dueDate: "",
    nextAction: "",
  });
  expect(after.odak.history).toHaveLength(beforeHistory + 1);
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("meeting tables keep their own status separate from route statuses, omit missing dates and keep route changes reversible", async ({
  page,
}) => {
  const items = [
    source("none"),
    source("only-daily"),
    source("only-waiting"),
    source("both", { status: "planned" }),
    target("one-work", "only-daily", "daily", {
      dueDate: "",
      priority: "high",
    }),
    target("one-reply", "only-waiting", "waiting", {
      dueDate: "2026-11-20",
      nextFollowUpDate: "2026-11-14",
    }),
    target("both-work", "both", "daily", { dueDate: "2026-11-15" }),
    target("both-reply", "both", "waiting", {
      dueDate: "2026-11-21",
      nextFollowUpDate: "",
    }),
  ];
  await seed(page, items);
  const before = await saved(page);
  await expect(page.locator(".meeting-table thead th")).toHaveText([
    "Aksiyon / Karar",
    "Durum",
    "Bağlı iş",
    "Takip",
    "İşlem",
  ]);
  await expect(page.locator("#priority-filter, #period-filter")).toHaveCount(0);
  await expect(row(page, "none").locator(".meeting-decision")).toHaveText(
    items[0].decision,
  );
  await expect(
    cell(page, "none", "daily").locator(".meeting-linked-date"),
  ).toHaveCount(0);
  await expect(
    cell(page, "none", "waiting").locator(".meeting-linked-date"),
  ).toHaveCount(0);
  await expect(
    row(page, "none").locator(".status-col > .status-trigger"),
  ).toHaveText("Açık");
  await expect(
    row(page, "both").locator(".status-col > .status-trigger"),
  ).toHaveText("Planlanacak");
  await expect(
    row(page, "both").locator(".status-col > .status-trigger"),
  ).toHaveAttribute("data-id", "both");
  await expect(
    row(page, "both").locator(".status-col > .status-trigger"),
  ).not.toHaveAttribute("data-target-id", /./);
  await expect(
    page.locator(".meeting-title-state, .meeting-archive-control"),
  ).toHaveCount(0);
  await expect(
    cell(page, "only-daily", "daily").locator(".meeting-linked-date"),
  ).toHaveCount(0);
  await expect(cell(page, "both", "daily")).toContainText("İş teslimi");
  await expect(cell(page, "both", "daily")).toContainText("15 Kas");
  await expect(
    cell(page, "both", "waiting").locator(".meeting-linked-date"),
  ).toHaveCount(0);
  await expect(page.locator(".meeting-table")).not.toContainText(
    "Teslim tarihi yok",
  );
  await expect(page.locator(".meeting-table")).not.toContainText(
    "Takip tarihi yok",
  );
  await expect(cell(page, "only-waiting", "waiting")).toContainText(
    "Sonraki takip",
  );
  await expect(cell(page, "only-waiting", "waiting")).toContainText("14 Kas");
  await expect(cell(page, "only-waiting", "waiting")).not.toContainText(
    "20 Kas",
  );
  for (const [sourceId, type, targetId] of [
    ["none", "daily", null],
    ["none", "waiting", null],
    ["only-daily", "daily", "one-work"],
    ["only-daily", "waiting", null],
    ["only-waiting", "waiting", "one-reply"],
    ["both", "daily", "both-work"],
    ["both", "waiting", "both-reply"],
  ]) {
    await list(page);
    await expect(route(page, sourceId, type)).toHaveText(
      targetId
        ? type === "daily"
          ? "İşi aç"
          : "Takibi aç"
        : type === "daily"
          ? "İş oluştur"
          : "Takip oluştur",
    );
    await route(page, sourceId, type).click();
    await expect(page.locator("#page-title")).toHaveText(
      "Toplantı aksiyonları",
    );
    await expect(page.locator('#nav [data-view="meeting"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(form(page)).toBeVisible();
    await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
    if (targetId) await expect(field(page, "id")).toHaveValue(targetId);
    else await expect(form(page)).toHaveAttribute("data-creation", "true");
    await closeEditor(page);
    if (targetId) await expect(route(page, sourceId, type)).toBeFocused();
    expect(await saved(page)).toBe(before);
  }
  await page.getByRole("searchbox").fill("Toplantı kararı both");
  for (const [type, targetId] of [
    ["daily", "both-work"],
    ["waiting", "both-reply"],
  ]) {
    await route(page, "both", type).click();
    await expect(field(page, "id")).toHaveValue(targetId);
    await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
    await expect(page.locator("#page-title")).toHaveText(
      "Toplantı aksiyonları",
    );
    await field(page, "description").fill(`${type} akışının kendi notu.`);
    await form(page)
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(form(page)).not.toBeVisible();
    await expect(page.locator("#page-title")).toHaveText(
      "Toplantı aksiyonları",
    );
    await expect(page.getByRole("searchbox")).toHaveValue(
      "Toplantı kararı both",
    );
    await expect(route(page, "both", type)).toBeFocused();
    const updated = await records(page);
    expect(updated.find((item) => item.id === targetId).description).toBe(
      `${type} akışının kendi notu.`,
    );
    const updatedSource = updated.find((item) => item.id === "both");
    expect(updatedSource).toEqual(items[3]);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await page.getByRole("searchbox").fill("");
  await list(page);
  await row(page, "both")
    .locator('.status-trigger[data-target-id="both-work"]')
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await page
    .locator(
      '#status-menu .status-option[data-id="both-work"][data-status="in_progress"]',
    )
    .click();
  const after = await records(page);
  expect(after.find((item) => item.id === "both-work").status).toBe(
    "in_progress",
  );
  expect(after.find((item) => item.id === "both-reply")).toEqual(items[7]);
  expect(after.find((item) => item.id === "both")).toEqual(items[3]);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("calendar dates belong only to real daily deliveries or waiting follow-ups, never a meeting or a waiting legacy deadline", async ({
  page,
}) => {
  const items = [
    source("calendar-unrouted", { dueDate: "2026-11-08" }),
    source("calendar-both", { dueDate: "2026-11-09" }),
    target("calendar-work", "calendar-both", "daily", {
      dueDate: "2026-11-12",
    }),
    target("calendar-reply", "calendar-both", "waiting", {
      dueDate: "2026-11-14",
      nextFollowUpDate: "2026-11-13",
    }),
    make({
      id: "waiting-no-reminder",
      type: "waiting",
      title: "Yalnız eski teslim tarihi bulunan konu",
      dueDate: "2026-11-15",
    }),
  ];
  await seed(page, items);
  const before = await saved(page);
  await page.locator('[data-action="open-calendar"]').click();
  const calendar = page.locator("#dashboard-calendar-dialog");
  await expect(calendar).toBeVisible();
  for (const id of [
    "calendar-unrouted",
    "calendar-both",
    "waiting-no-reminder",
  ])
    await expect(
      calendar.locator(`[data-calendar-record-id="${id}"]`),
    ).toHaveCount(0);
  const dateCell = (date) =>
    calendar.locator(
      `.calendar-expanded-grid > .calendar-expanded-cell:has(> [data-calendar-date="${date}"])`,
    );
  await expect(
    dateCell("2026-11-12").locator('[data-calendar-record-id="calendar-work"]'),
  ).toHaveCount(1);
  await expect(
    dateCell("2026-11-13").locator(
      '[data-calendar-record-id="calendar-reply"]',
    ),
  ).toHaveCount(1);
  await expect(
    dateCell("2026-11-14").locator(
      '[data-calendar-record-id="calendar-reply"]',
    ),
  ).toHaveCount(0);
  await dateCell("2026-11-13")
    .locator('[data-calendar-record-id="calendar-reply"]')
    .click();
  await expect(field(page, "id")).toHaveValue("calendar-reply");
  await expect(field(page, "nextFollowUpDate")).toHaveValue("13.11.2026");
  await expect(field(page, "dueDate")).not.toBeVisible();
  await closeEditor(page);
  expect(await saved(page)).toBe(before);
});
