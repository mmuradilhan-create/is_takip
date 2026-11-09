import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const DECISION =
  '<img src=x onerror="window.routingInjected=1"> Teknik karar korunmalı.';

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const source = (id, extra = {}) =>
  cleanupMeetingContacts([
    record({
      id,
      type: "meeting",
      title: `Kaynak toplantı ${id}`,
      status: "in_progress",
      dueDate: "2026-11-10",
      nextAction: "İlk takip adımını uygula.",
      description: "Kaynak açıklaması korunmalı.",
      decision: DECISION,
      participants: "Tasarım ve üretim ekibi",
      owner: "Bağlam sorumlusu",
      sourceFields: { "Özgün toplantı": { bilgi: "Ham kaynak korunmalı" } },
      ...extra,
    }),
  ])[0];
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const form = (page) => page.locator("#record-form");
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const list = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
const targets = (items, sourceId) =>
  items.filter(
    (item) => item.sourceFields?.__followupSource?.recordId === sourceId,
  );

async function seed(page, items) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("action-routing-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: items,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("action-routing-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function openSource(page, id) {
  await list(page, "meeting");
  await row(page, id).locator(".record-edit-trigger").click();
  await expect(page.locator("#editor")).toBeVisible();
  await openCreationExtras(page);
}

async function routeDraft(page, id, type) {
  await openSource(page, id);
  await form(page)
    .locator(
      `[data-action="meeting-route"][data-id="${id}"][data-route="${type}"]`,
    )
    .click();
  await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
  await openCreationExtras(page);
}

async function saveDraft(page) {
  await page.locator('#editor button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

test("one meeting can create a daily action and an external follow-up only on save and reopen each without duplicates", async ({
  page,
}) => {
  const sourceId = "route-both";
  const original = await seed(page, [source(sourceId)]);
  const originalSaved = await saved(page);
  for (const [index, type] of ["daily", "waiting"].entries()) {
    const before = await saved(page);
    await routeDraft(page, sourceId, type);
    expect(await saved(page)).toBe(before);
    await expect(form(page).locator('[name="title"]')).toHaveValue(
      original.find((item) => item.id === sourceId).title,
    );
    await closeEditor(page);
    expect(await saved(page)).toBe(before);
    await routeDraft(page, sourceId, type);
    await form(page).locator('[name="title"]').fill(`${type} yürütme kaydı`);
    await expect(form(page).locator('[name="nextAction"]')).not.toBeVisible();
    if (type === "daily")
      await form(page)
        .locator('[name="description"]')
        .fill("Günlük iş için gerçek çalışma notu.");
    else
      await form(page)
        .locator('[name="latestUpdate"]')
        .fill(`${type} için net sonraki adım.`);
    if (type === "waiting") {
      await form(page)
        .locator('[name="expectedFrom"]')
        .fill("Dış tasarım ekibi");
      await form(page)
        .locator('[name="status"]')
        .selectOption("waiting_response");
    }
    await saveDraft(page);
    const current = await records(page);
    const target = targets(current, sourceId).find(
      (item) => item.type === type,
    );
    expect(targets(current, sourceId)).toHaveLength(index + 1);
    expect(
      targets(current, sourceId).filter((item) => item.type === type),
    ).toHaveLength(1);
    expect(target).toMatchObject({
      type,
      title: `${type} yürütme kaydı`,
      ...(type === "daily"
        ? { nextAction: "", description: "Günlük iş için gerçek çalışma notu." }
        : { latestUpdate: `${type} için net sonraki adım.`, nextAction: "" }),
    });
    expect(target.sourceFields.__followupSource).toEqual({
      recordId: sourceId,
      type: "meeting",
    });
    const currentSource = current.find((item) => item.id === sourceId);
    const originalSource = original.find((item) => item.id === sourceId);
    expect(currentSource).toEqual(originalSource);
    const beforeReopen = await saved(page);
    await openSource(page, sourceId);
    await expect(form(page).locator('[name="status"]')).toBeDisabled();
    await expect(form(page).locator("#meeting-derived-status-help")).toHaveText(
      "Durum bağlı iş ve takipten hesaplanır.",
    );
    await expect(form(page).locator('[name="status"] option')).toHaveText([
      "Planlanacak",
      "Açık",
      "Kapandı",
    ]);
    for (const name of ["priority", "dueDate", "nextAction"])
      await expect(form(page).locator(`[name="${name}"]`)).toBeDisabled();
    for (const name of ["priority", "dueDate", "nextAction"])
      await expect(form(page).locator(`[name="${name}"]`)).toBeHidden();
    for (const name of ["title", "decision"])
      await expect(form(page).locator(`[name="${name}"]`)).toBeEnabled();
    for (const name of ["participants", "owner"]) {
      await expect(form(page).locator(`[name="${name}"]`)).toBeHidden();
      await expect(form(page).locator(`[name="${name}"]`)).toHaveValue("");
    }
    await form(page)
      .locator(`[data-action="open-linked-action"][data-route="${type}"]`)
      .click();
    await expect(form(page).locator('[name="id"]')).toHaveValue(target.id);
    await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
    expect(await saved(page)).toBe(beforeReopen);
    await closeEditor(page);
    expect(targets(await records(page), sourceId)).toHaveLength(index + 1);
    expect(await page.evaluate(() => window.routingInjected)).toBeUndefined();
  }
  const current = await records(page);
  expect(current).toHaveLength(original.length + 2);
  const beforeBothLinks = await saved(page);
  for (const [type, caption] of [
    ["daily", "İşi aç"],
    ["waiting", "Takibi aç"],
  ]) {
    await openSource(page, sourceId);
    await expect(
      form(page).locator(
        '[data-action="open-linked-action"][data-route="daily"]',
      ),
    ).toContainText("İşi aç");
    await expect(
      form(page).locator(
        '[data-action="open-linked-action"][data-route="waiting"]',
      ),
    ).toContainText("Takibi aç");
    const link = form(page).locator(
      `[data-action="open-linked-action"][data-route="${type}"]`,
    );
    await expect(link).toContainText(caption);
    await link.click();
    const target = targets(current, sourceId).find(
      (item) => item.type === type,
    );
    await expect(form(page).locator('[name="id"]')).toHaveValue(target.id);
    await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
    await closeEditor(page);
    expect(await saved(page)).toBe(beforeBothLinks);
  }
  await undo(page);
  expect(
    targets(await records(page), sourceId).map((item) => item.type),
  ).toEqual(["daily"]);
  await undo(page);
  expect(await records(page)).toEqual(original);
  expect(await saved(page)).toBe(originalSaved);
});

test("daily and waiting actions keep their own context while the meeting closes only when both routes are closed", async ({
  page,
}) => {
  const original = await seed(page, [source("authority")]);
  await routeDraft(page, "authority", "daily");
  await form(page)
    .locator('[name="title"]')
    .fill("Yürütülecek bağımsız iş başlığı");
  await saveDraft(page);
  const created = await records(page);
  const [target] = targets(created, "authority");
  await list(page, "meeting");
  await row(page, "authority")
    .locator(
      `.meeting-linked-cell[data-route="daily"] .status-trigger[data-target-id="${target.id}"]`,
    )
    .click();
  const menu = page.locator("#status-menu");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("group", { name: "İşin durumu", exact: true }),
  ).toBeVisible();
  await expect(
    menu.locator('[data-action="set-status"][data-id="authority"]'),
  ).toHaveCount(0);
  await menu
    .locator(
      `[data-action="set-status"][data-id="${target.id}"][data-status="in_progress"]`,
    )
    .click();
  await expect(menu).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  const afterStatus = await records(page);
  expect(afterStatus.find((item) => item.id === target.id).status).toBe(
    "in_progress",
  );
  expect(afterStatus.find((item) => item.id === "authority")).toEqual(
    original[0],
  );
  await row(page, "authority")
    .locator(
      '.meeting-linked-cell[data-route="daily"] [data-action="open-linked-action"]',
    )
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(form(page).locator('[name="id"]')).toHaveValue(target.id);
  await openCreationExtras(page);
  await expect(form(page).locator('[name="status"]')).toHaveValue(
    "in_progress",
  );
  await form(page).locator('[name="dueDate"]').fill("15.11.2026");
  await expect(form(page).locator('[name="nextAction"]')).toBeHidden();
  await expect(form(page).locator('[name="nextAction"]')).toBeDisabled();
  await expect(form(page).locator('[name="nextAction"]')).toHaveValue(
    target.nextAction,
  );
  await form(page)
    .locator('[name="description"]')
    .fill("Hedefteki yeni yetkili çalışma notu.");
  await expect(form(page).locator('[name="owner"]')).toBeHidden();
  await saveDraft(page);
  const changed = await records(page);
  expect(changed.find((item) => item.id === target.id)).toMatchObject({
    status: "in_progress",
    dueDate: "2026-11-15",
    nextAction: target.nextAction,
    description: "Hedefteki yeni yetkili çalışma notu.",
    owner: target.owner,
  });
  expect(changed.find((item) => item.id === "authority")).toMatchObject({
    status: "in_progress",
    dueDate: original[0].dueDate,
    nextAction: original[0].nextAction,
    owner: original[0].owner,
    title: original[0].title,
    decision: DECISION,
    participants: original[0].participants,
  });
  await undo(page);
  expect(await records(page)).toEqual(afterStatus);
  await undo(page);
  expect(await records(page)).toEqual(created);
  await routeDraft(page, "authority", "waiting");
  await form(page)
    .locator('[name="title"]')
    .fill("Dış ekipten beklenecek yanıt");
  await form(page).locator('[name="status"]').selectOption("waiting_response");
  await expect(form(page).locator('[name="dueDate"]')).toBeHidden();
  await form(page).locator('[name="nextFollowUpDate"]').fill("16.11.2026");
  await form(page).locator('[name="expectedFrom"]').fill("Dış ekip");
  await form(page)
    .locator('[name="latestUpdate"]')
    .fill("Dış ekibin yanıtını takip et.");
  await saveDraft(page);
  const bothCreated = await records(page);
  const waitingTarget = targets(bothCreated, "authority").find(
    (item) => item.type === "waiting",
  );
  expect(waitingTarget).toMatchObject({
    dueDate: "",
    nextAction: "",
    nextFollowUpDate: "2026-11-16",
  });
  expect(targets(bothCreated, "authority")).toHaveLength(2);
  await list(page, "meeting");
  await expect(row(page, "authority").locator(".quick-complete")).toHaveCount(
    0,
  );
  await expect(row(page, "authority").locator(".completion-mark")).toHaveCount(
    0,
  );
  for (const [route, id, ownGroup, otherGroup] of [
    ["daily", target.id, "İşin durumu", "Takibin durumu"],
    ["waiting", waitingTarget.id, "Takibin durumu", "İşin durumu"],
  ]) {
    const status = row(page, "authority").locator(
      `.meeting-linked-cell[data-route="${route}"] .status-trigger`,
    );
    await expect(status).toHaveAttribute("data-target-id", id);
    await status.click();
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("group", { name: ownGroup, exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole("group", { name: otherGroup, exact: true }),
    ).toHaveCount(0);
    for (const targetId of [target.id, waitingTarget.id, "authority"])
      await expect(
        menu.locator(
          `[data-action="set-status"][data-id="${targetId}"][data-status="completed"]`,
        ),
      ).toHaveCount(0);
    await expect(page.locator("#editor")).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    expect(await records(page)).toEqual(bothCreated);
  }
  await openSource(page, "authority");
  await expect(form(page).locator('[name="id"]')).toHaveValue("authority");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="status"]')).toBeDisabled();
  await expect(form(page).locator("#meeting-derived-status-help")).toHaveText(
    "Durum bağlı iş ve takipten hesaplanır.",
  );
  await expect(form(page).locator('[name="status"] option')).toHaveText([
    "Planlanacak",
    "Açık",
    "Kapandı",
  ]);
  for (const name of ["priority", "dueDate", "nextAction"])
    await expect(form(page).locator(`[name="${name}"]`)).toBeDisabled();
  for (const name of ["owner", "participants"]) {
    const field = form(page).locator(`[name="${name}"]`);
    await expect(field).toBeHidden();
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue("");
  }
  await form(page)
    .locator('[name="title"]')
    .fill("Güncellenen toplantı bağlamı");
  await form(page)
    .locator('[name="decision"]')
    .fill("Yeni toplantı açıklaması.");
  await saveDraft(page);
  const editedContext = await records(page);
  expect(editedContext.find((item) => item.id === target.id)).toEqual(target);
  expect(editedContext.find((item) => item.id === waitingTarget.id)).toEqual(
    waitingTarget,
  );
  expect(editedContext.find((item) => item.id === "authority")).toMatchObject({
    title: "Güncellenen toplantı bağlamı",
    decision: "Yeni toplantı açıklaması.",
    owner: original[0].owner,
    participants: original[0].participants,
  });
  await list(page, "daily");
  await row(page, target.id).locator(".quick-complete").click();
  const dailyCompleted = await records(page);
  expect(dailyCompleted.find((item) => item.id === target.id).status).toBe(
    "completed",
  );
  expect(dailyCompleted.find((item) => item.id === waitingTarget.id)).toEqual(
    waitingTarget,
  );
  expect(dailyCompleted.find((item) => item.id === "authority")).toEqual(
    editedContext.find((item) => item.id === "authority"),
  );
  await list(page, "waiting");
  await row(page, waitingTarget.id).locator(".quick-complete").click();
  const completed = await records(page);
  expect(completed.find((item) => item.id === waitingTarget.id).status).toBe(
    "completed",
  );
  expect(completed.find((item) => item.id === "authority")).toEqual({
    ...editedContext.find((item) => item.id === "authority"),
    status: "completed",
  });
  await list(page, "meeting");
  await expect(row(page, "authority")).toHaveCount(0);
  await page
    .locator('[data-action="list-scope"][data-scope="completed"]')
    .click();
  await expect(
    row(page, "authority").locator(
      ".meeting-source-status-col > .status-summary",
    ),
  ).toHaveText("Kapandı");
  await expect(
    row(page, "authority").locator(
      `.status-trigger[data-target-id="${target.id}"]`,
    ),
  ).toHaveText("Tamamlandı");
  await expect(
    row(page, "authority").locator(
      `.status-trigger[data-target-id="${waitingTarget.id}"]`,
    ),
  ).toHaveText("Kapandı");
  await undo(page);
  expect(await records(page)).toEqual(dailyCompleted);
  await undo(page);
  expect(await records(page)).toEqual(editedContext);
  await undo(page);
  expect(await records(page)).toEqual(bothCreated);
  await undo(page);
  expect(await records(page)).toEqual(created);
  await undo(page);
  expect(await records(page)).toEqual(original);
});

test("legacy contact work stays independent and concurrent drafts allow opposite roles but cannot duplicate the same role", async ({
  page,
  context,
}) => {
  const meeting = source("legacy-waiting-source", {
    status: "waiting",
    dueDate: "2026-11-12",
    nextAction: "Dış yanıtı bekle.",
    owner: "Dış kişi",
  });
  const waiting = record({
    id: "legacy-waiting",
    type: "waiting",
    title: "Dış yanıta bağlı bekleyen konu",
    status: "waiting_response",
    dueDate: "2026-11-12",
    nextAction: "Dış yanıtı bekle.",
    expectedFrom: "Dış kişi",
    sourceDate: "2026-10-20",
    lastFollowUpDate: "2026-11-01",
    nextFollowUpDate: "2026-11-07",
    followUpLog: [
      {
        id: "old-followup",
        date: "2026-11-01",
        note: "Önceki takip korunsun.",
        nextFollowUpDate: "2026-11-07",
      },
    ],
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
      "Özgün bekleme": "Korunur",
    },
  });
  const contact = record({
    id: "legacy-contact",
    title: "Hatırlatma maili gönder",
    status: "planned",
    nextAction: "E-postayı gönder.",
    sourceFields: {
      __followupSource: { recordId: waiting.id, type: "waiting" },
    },
  });
  const legacySource = source("legacy-unmirrored", {
    dueDate: "2026-11-09",
    nextAction: "Eski kaynak adımı.",
  });
  const legacyTarget = record({
    id: "legacy-direct-target",
    title: "Önceki sürümden bağlı iş",
    status: "partially_completed",
    dueDate: "2026-11-13",
    nextAction: "Yeni yürütme adımı.",
    sourceFields: {
      __followupSource: { recordId: legacySource.id, type: "meeting" },
    },
  });
  const original = await seed(page, [
    source("race-source"),
    source("same-type-source"),
    meeting,
    waiting,
    contact,
    legacySource,
    legacyTarget,
  ]);
  expect(await records(page)).toEqual(original);
  await list(page, "waiting");
  const beforeOpening = await saved(page);
  await row(page, waiting.id).locator(".daily-source-control").click();
  await expect(form(page).locator('[name="id"]')).toHaveValue(contact.id);
  await closeEditor(page);
  expect(await saved(page)).toBe(beforeOpening);
  await list(page, "daily");
  await row(page, contact.id).locator(".quick-complete").click();
  const contacted = await records(page);
  expect(contacted.find((item) => item.id === contact.id).status).toBe(
    "completed",
  );
  expect(contacted.find((item) => item.id === waiting.id)).toEqual(waiting);
  expect(contacted.find((item) => item.id === meeting.id)).toEqual(meeting);
  await undo(page);
  expect(await records(page)).toEqual(original);
  const beforeLegacyRead = await saved(page);
  await openSource(page, legacySource.id);
  await expect(form(page).locator('[name="status"]')).toHaveValue(
    "in_progress",
  );
  await expect(form(page).locator('[name="status"]')).toBeDisabled();
  await expect(form(page).locator('[name="status"] option')).toHaveText([
    "Planlanacak",
    "Açık",
    "Kapandı",
  ]);
  await expect(form(page).locator('[name="dueDate"]')).toHaveValue(
    "09.11.2026",
  );
  await expect(form(page).locator('[name="nextAction"]')).toHaveValue(
    legacySource.nextAction,
  );
  await closeEditor(page);
  expect(await saved(page)).toBe(beforeLegacyRead);
  await routeDraft(page, "race-source", "daily");
  await form(page)
    .locator('[name="title"]')
    .fill("İlk pencerede kararlaştırılan iş");
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await routeDraft(other, "race-source", "waiting");
  await form(other)
    .locator('[name="title"]')
    .fill("İkinci pencerede beklenecek dış yanıt");
  await saveDraft(page);
  const firstRecords = await records(page);
  const [firstTarget] = targets(firstRecords, "race-source");
  expect(firstTarget).toMatchObject({
    type: "daily",
    title: "İlk pencerede kararlaştırılan iş",
  });
  await saveDraft(other);
  const oppositeSaved = await saved(other);
  const oppositeTargets = targets(await records(other), "race-source");
  expect(oppositeTargets).toHaveLength(2);
  expect(oppositeTargets.find((item) => item.type === "daily")).toEqual(
    firstTarget,
  );
  expect(oppositeTargets.find((item) => item.type === "waiting")).toMatchObject(
    {
      title: "İkinci pencerede beklenecek dış yanıt",
    },
  );
  expect(new Set(oppositeTargets.map((item) => item.id)).size).toBe(2);
  await routeDraft(page, "same-type-source", "daily");
  await form(page).locator('[name="title"]').fill("Aynı rol için ilk taslak");
  await routeDraft(other, "same-type-source", "daily");
  await form(other)
    .locator('[name="title"]')
    .fill("Çoğaltılmaması gereken taslak");
  await saveDraft(page);
  const firstSaved = await saved(page);
  const [sameTarget] = targets(await records(page), "same-type-source");
  await other.locator('#editor button[type="submit"]').click();
  await expect(form(other).locator('[name="id"]')).toHaveValue(sameTarget.id);
  await expect(form(other).locator('select[name="type"]')).toHaveValue("daily");
  await expect(form(other).locator('[name="title"]')).toHaveValue(
    "Aynı rol için ilk taslak",
  );
  expect(await saved(other)).toBe(firstSaved);
  expect(targets(await records(other), "same-type-source")).toHaveLength(1);
  expect(targets(await records(other), "race-source")).toHaveLength(2);
  await closeEditor(other);
  await other.close();
  await undo(page);
  expect(await saved(page)).toBe(oppositeSaved);
  await undo(page);
  expect(
    targets(await records(page), "race-source").map((item) => item.type),
  ).toEqual(["daily"]);
  await undo(page);
  expect(await records(page)).toEqual(original);
});
