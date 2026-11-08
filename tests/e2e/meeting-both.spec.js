import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const SOURCE_ID = "both-source";
const TITLE =
  '<img src=x onerror="window.meetingBothInjected=1"> Toplantı kararı';
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const source = () =>
  cleanupMeetingContacts([
    record({
      id: SOURCE_ID,
      type: "meeting",
      title: TITLE,
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-10",
      owner: "Bağlam sorumlusu",
      nextAction: "İlk takip adımı.",
      decision: "Özgün toplantı kararı korunmalı.",
      participants: "Tasarım ve üretim ekibi",
      description: "Kaynak toplantı açıklaması.",
      sourceFields: { original: { value: "Korunur" } },
    }),
  ])[0];
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const targets = (items) =>
  items.filter(
    (item) => item.sourceFields?.__followupSource?.recordId === SOURCE_ID,
  );
const dialog = (page) => page.locator("#meeting-both-dialog");
const branch = (page, type) =>
  dialog(page).locator(`.meeting-both-branch[data-route="${type}"]`);
const form = (page) => page.locator("#record-form");
const row = (page) =>
  page.locator(`.full-table > tbody > tr[data-id="${SOURCE_ID}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(page, items) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("meeting-both-seeded")) return;
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
      sessionStorage.setItem("meeting-both-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
}

async function openBoth(page) {
  await page.locator('#nav [data-view="meeting"]').click();
  await row(page).locator(".record-edit-trigger").click();
  await form(page).locator('[data-action="meeting-route-both"]').click();
  await expect(dialog(page)).toBeVisible();
}

async function cancel(page) {
  await dialog(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
}

test("Her ikisi de saves a daily delivery and an external follow-up plan in one undoable change", async ({
  page,
}) => {
  const fixture = [source()];
  await seed(page, fixture);
  const original = await saved(page);
  await openBoth(page);
  await expect(dialog(page).locator(".meeting-both-source")).toHaveText(TITLE);
  await expect(branch(page, "daily").locator("legend")).toHaveText(
    "Ben yapacağım",
  );
  await expect(branch(page, "waiting").locator("legend")).toHaveText(
    "Başkasından bekliyorum",
  );
  await expect(dialog(page).locator('[name="dailyTitle"]')).toHaveValue(TITLE);
  await expect(dialog(page).locator('[name="waitingTitle"]')).toHaveValue(
    TITLE,
  );
  await expect(dialog(page).locator('[name="dailyPriority"]')).toHaveValue(
    "normal",
  );
  for (const name of [
    "dailyDueDate",
    "waitingExpectedFrom",
    "waitingNextFollowUpDate",
    "waitingLatestUpdate",
  ])
    await expect(dialog(page).locator(`[name="${name}"]`)).toHaveValue("");
  await expect(
    dialog(page).locator('[name="waitingDueDate"], [name="waitingNextAction"]'),
  ).toHaveCount(0);
  await expect(
    dialog(page).locator('[name="dailyNextAction"]'),
  ).not.toBeVisible();
  await expect(dialog(page).locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.meetingBothInjected)).toBeUndefined();
  await dialog(page)
    .locator('[name="dailyTitle"]')
    .fill("Kaydedilmeyecek günlük taslak");
  await cancel(page);
  expect(await saved(page)).toBe(original);
  await openBoth(page);
  await dialog(page)
    .locator('[name="dailyTitle"]')
    .fill("Benim hazırlayacağım teknik rapor");
  await expect(dialog(page).locator('[name="dailyOwner"]')).toBeHidden();
  await dialog(page).locator('[name="dailyPriority"]').selectOption("urgent");
  await expect(
    dialog(page).locator('[name="dailyNextAction"]'),
  ).not.toBeVisible();
  await branch(page, "daily").locator(".date-picker-toggle").click();
  await expect(dialog(page).locator("#odak-date-picker")).toBeVisible();
  await dialog(page).locator('[data-date-day="2026-11-14"]').click();
  await expect(dialog(page).locator('[name="dailyDueDate"]')).toHaveValue(
    "14.11.2026",
  );
  await dialog(page)
    .locator('[name="waitingTitle"]')
    .fill("Tedarikçiden beklediğim onay");
  await dialog(page)
    .locator('[name="waitingExpectedFrom"]')
    .fill("Tedarikçi ekibi");
  await dialog(page)
    .locator('[name="waitingNextFollowUpDate"]')
    .fill("20.11.2026");
  await dialog(page)
    .locator('[name="waitingLatestUpdate"]')
    .fill("Onayın durumunu sor.");
  expect(await saved(page)).toBe(original);
  await dialog(page)
    .getByRole("button", { name: "İki akışı kaydet", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  const created = await records(page);
  const actions = targets(created);
  expect(actions).toHaveLength(2);
  expect(actions.find((item) => item.type === "daily")).toMatchObject({
    title: "Benim hazırlayacağım teknik rapor",
    owner: "",
    priority: "urgent",
    dueDate: "2026-11-14",
    nextAction: "",
    status: "planned",
    sourceDate: "2026-11-07",
  });
  expect(actions.find((item) => item.type === "waiting")).toMatchObject({
    title: "Tedarikçiden beklediğim onay",
    expectedFrom: "Tedarikçi ekibi",
    nextFollowUpDate: "2026-11-20",
    latestUpdate: "Onayın durumunu sor.",
    dueDate: "",
    nextAction: "",
    lastFollowUpDate: "",
    status: "waiting_response",
    sourceDate: "2026-11-07",
  });
  for (const action of actions)
    expect(action.sourceFields.__followupSource).toEqual({
      recordId: SOURCE_ID,
      type: "meeting",
    });
  expect({
    ...created.find((item) => item.id === SOURCE_ID),
    status: fixture[0].status,
  }).toEqual(fixture[0]);
  expect(actions.find((item) => item.type === "waiting")).not.toHaveProperty(
    "followUpLog",
  );
  await expect(page.locator("#odak-date-picker")).toHaveCount(1);
  await undo(page);
  expect(await saved(page)).toBe(original);
});

test("an existing action is read-only and reused while only the missing external follow-up is created", async ({
  page,
  context,
}) => {
  const daily = record({
    id: "both-existing-daily",
    title: "Önceden kaydedilmiş 'onay' işi",
    status: "in_progress",
    owner: "Mevcut sorumlu",
    dueDate: "2026-11-12",
    nextAction: "Mevcut günlük adım.",
    sourceFields: {
      __followupSource: { recordId: SOURCE_ID, type: "meeting" },
      original: "Korunur",
    },
    workLog: [
      {
        id: "both-existing-log",
        date: "2026-11-06",
        endedAt: "2026-11-06T09:00:00.000Z",
        durationMs: 60_000,
        note: "Özgün sonuç",
        nextAction: "Özgün sonraki adım",
      },
    ],
  });
  const fixture = [
    source(),
    daily,
    record({ id: "both-unrelated", title: "İlgisiz günlük iş" }),
  ];
  await seed(page, fixture);
  const original = await saved(page);
  await openBoth(page);
  await expect(
    branch(page, "daily").locator(".meeting-both-existing"),
  ).toContainText(daily.title);
  await expect(dialog(page).locator('[name="dailyTitle"]')).toBeDisabled();
  await expect(
    branch(page, "daily").locator(".meeting-both-draft"),
  ).not.toBeVisible();
  await expect(
    dialog(page).getByRole("button", { name: "Eksik akışı ekle", exact: true }),
  ).toBeEnabled();
  const existingOpen = branch(page, "daily").locator(
    '[data-action="meeting-both-open-target"]',
  );
  await page.evaluate((key) => {
    window.meetingBothLastStorage = null;
    window.addEventListener("storage", (event) => {
      if (event.key === key) window.meetingBothLastStorage = event.newValue;
    });
  }, KEY);
  await existingOpen.focus();
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await other.locator('#nav [data-view="daily"]').click();
  await other
    .locator('.full-table tr[data-id="both-unrelated"] .task-name')
    .click();
  await openCreationExtras(other);
  await form(other)
    .locator('[name="description"]')
    .fill("İlgisiz kayıt güncellendi.");
  await other.locator('#editor [type="submit"]').click();
  const afterUnrelated = await saved(other);
  await expect
    .poll(() => page.evaluate(() => window.meetingBothLastStorage))
    .toBe(afterUnrelated);
  await expect(existingOpen).toBeFocused();
  await undo(other);
  await expect
    .poll(() => page.evaluate(() => window.meetingBothLastStorage))
    .toBe(original);
  await expect(existingOpen).toBeFocused();
  await other.close();
  await existingOpen.click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(form(page).locator('[name="id"]')).toHaveValue(daily.id);
  await page.locator('#editor [data-action="close"]').last().click();
  expect(await saved(page)).toBe(original);
  await openBoth(page);
  await dialog(page)
    .locator('[name="waitingTitle"]')
    .fill("Mevcut iş için dış ekip onayı");
  await dialog(page).locator('[name="waitingExpectedFrom"]').fill("Dış ekip");
  await dialog(page)
    .locator('[name="waitingNextFollowUpDate"]')
    .fill("18.11.2026");
  await dialog(page)
    .getByRole("button", { name: "Eksik akışı ekle", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  const created = await records(page);
  expect(created).toHaveLength(fixture.length + 1);
  expect(created.find((item) => item.id === daily.id)).toEqual(daily);
  expect(
    targets(created).find((item) => item.type === "waiting"),
  ).toMatchObject({
    title: "Mevcut iş için dış ekip onayı",
    expectedFrom: "Dış ekip",
    nextFollowUpDate: "2026-11-18",
    dueDate: "",
    nextAction: "",
    lastFollowUpDate: "",
  });
  await undo(page);
  expect(await saved(page)).toBe(original);
});

test("a concurrent saved action is reused without overwriting either draft and a missing source disables saving until undo", async ({
  page,
  context,
}) => {
  await seed(page, [source()]);
  const original = await saved(page);
  await openBoth(page);
  await dialog(page)
    .locator('[name="dailyTitle"]')
    .fill("Korunacak günlük taslak");
  await dialog(page).locator('[name="dailyPriority"]').selectOption("low");
  await dialog(page)
    .locator('[name="waitingTitle"]')
    .fill("Korunacak dış yanıt taslağı");
  await dialog(page)
    .locator('[name="waitingLatestUpdate"]')
    .fill("Dış ekibe tekrar sor.");
  await dialog(page)
    .locator('[name="waitingNextFollowUpDate"]')
    .fill("19.11.2026");
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  await other.locator('#nav [data-view="meeting"]').click();
  await row(other)
    .locator(
      '.meeting-linked-cell[data-route="daily"] [data-action="meeting-route"]',
    )
    .click();
  await form(other)
    .locator('[name="title"]')
    .fill("Diğer pencerede kaydedilen gerçek iş");
  await openCreationExtras(other);
  await expect(form(other).locator('[name="owner"]')).toBeHidden();
  await expect(form(other).locator('[name="nextAction"]')).not.toBeVisible();
  await form(other)
    .locator('[name="description"]')
    .fill("Diğer pencerede belirlenen gerçek çalışma notu.");
  await other.locator('#editor [type="submit"]').click();
  await expect(other.locator("#editor")).not.toBeVisible();
  const afterOther = await saved(other);
  const existing = targets(await records(other)).find(
    (item) => item.type === "daily",
  );
  expect(existing.nextAction).toBe("");
  expect(existing.description).toBe(
    "Diğer pencerede belirlenen gerçek çalışma notu.",
  );
  expect(existing.owner).toBe("");
  expect(existing.priority).toBe("normal");
  await expect(
    branch(page, "daily").locator(".meeting-both-existing"),
  ).toContainText(existing.title);
  await expect(dialog(page).locator('[name="dailyTitle"]')).toHaveValue(
    "Korunacak günlük taslak",
  );
  await expect(dialog(page).locator('[name="dailyTitle"]')).toBeDisabled();
  await expect(dialog(page).locator('[name="dailyPriority"]')).toHaveValue(
    "low",
  );
  await expect(dialog(page).locator('[name="dailyPriority"]')).toBeDisabled();
  await expect(dialog(page).locator('[name="waitingTitle"]')).toHaveValue(
    "Korunacak dış yanıt taslağı",
  );
  await expect(
    dialog(page).locator('[name="waitingNextFollowUpDate"]'),
  ).toHaveValue("19.11.2026");
  await dialog(page)
    .getByRole("button", { name: "Eksik akışı ekle", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  const created = await records(page);
  expect(targets(created)).toHaveLength(2);
  expect(created.find((item) => item.id === existing.id)).toEqual(existing);
  expect(
    targets(created).find((item) => item.type === "waiting"),
  ).toMatchObject({
    title: "Korunacak dış yanıt taslağı",
    latestUpdate: "Dış ekibe tekrar sor.",
    nextFollowUpDate: "2026-11-19",
    nextAction: "",
    dueDate: "",
  });
  await undo(page);
  expect(await saved(page)).toBe(afterOther);
  await undo(other);
  await expect.poll(() => saved(page)).toBe(original);
  await openBoth(page);
  await dialog(page)
    .locator('[name="waitingTitle"]')
    .fill("Silinse de korunacak taslak");
  await row(other).locator(".task-name").click();
  other.once("dialog", (message) => message.accept());
  await other.locator('#editor [data-action="delete"]').click();
  await expect(
    dialog(page).locator(".meeting-both-availability"),
  ).toBeVisible();
  await expect(dialog(page).locator('[type="submit"]')).toBeDisabled();
  await expect(dialog(page).locator('[name="waitingTitle"]')).toHaveValue(
    "Silinse de korunacak taslak",
  );
  await undo(other);
  await expect(dialog(page).locator('[type="submit"]')).toBeEnabled();
  await expect(dialog(page).locator('[name="waitingTitle"]')).toHaveValue(
    "Silinse de korunacak taslak",
  );
  await cancel(page);
  expect(await saved(page)).toBe(original);
  await other.close();
});
