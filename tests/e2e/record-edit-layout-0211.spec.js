import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-10-20T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const extras = (page) =>
  form(page).locator("details[data-record-editor-extras]");
const measurement = (page) =>
  form(page).locator("div[data-record-editor-measurement]");
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const close = (page) =>
  page.locator('#editor [data-action="close"]').last().click();
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });

function fixture() {
  return cleanupMeetingContacts([
    ...["yearly", "monthly", "weekly"].map((type) =>
      make({
        id: `layout-${type}`,
        type,
        title: `Özgün ${type} hedefi`,
        status: "in_progress",
        periodKey: { yearly: "2026", monthly: "2026-11", weekly: "2026-W45" }[
          type
        ],
        goalParentId:
          { monthly: "layout-yearly", weekly: "layout-monthly" }[type] || "",
        dueDate: type === "weekly" ? "2026-11-08" : "2026-11-30",
        sourceDate: "2026-10-20",
        owner: "Korunacak eski hedef sorumlusu",
        targetValue: 10,
        currentValue: 4,
        metric: "Rapor",
        variance: "Özgün sapma açıklaması.",
        nextAction: "Özgün hedef adımı.",
        description: "Gerçek hedef notu.",
        sourceFields: { original: { value: "Özgün hedef bilgisi" } },
      }),
    ),
    make({
      id: "layout-daily",
      title: "Korunacak günlük iş",
      status: "in_progress",
      parentId: "layout-weekly",
      dueDate: "2026-11-09",
      sourceDate: "2026-10-20",
      owner: "Eski günlük sorumlusu",
      priority: "high",
      nextAction: "Gerçek günlük sonraki adım.",
      description: "Gerçek günlük notu.",
      projectCode: "KORU-42",
      workType: "Tasarım",
      focusDate: "2026-11-06",
      sourceFields: { original: { code: "Kaynak korunur" } },
    }),
    make({
      id: "layout-meeting",
      type: "meeting",
      title: "Korunacak toplantı aksiyonu",
      dueDate: "2026-11-10",
      owner: "Toplantı sorumlusu",
      participants: "Tasarım ve üretim",
      decision: "Gerçek toplantı kararı.",
      nextAction: "Kararı uygula.",
      description: "Toplantı bağlamı korunur.",
    }),
    make({
      id: "layout-waiting",
      type: "waiting",
      title: "Korunacak beklenen konu",
      priority: "urgent",
      dueDate: "2026-11-25",
      sourceDate: "2026-10-20",
      lastFollowUpDate: "2026-11-02",
      nextFollowUpDate: "2026-11-13",
      expectedFrom: "Dış tasarım ekibi",
      latestUpdate: "Gerçek önceki gelişme.",
      nextAction: "Yanıtı kontrol et.",
      description: "Gerçek bekleme notu.",
      owner: "Korunacak eski bekleme sorumlusu",
      followUpLog: [
        {
          id: "layout-old-followup",
          date: "2026-11-02",
          note: "Önceki gerçek takip.",
          nextFollowUpDate: "2026-11-13",
        },
      ],
      workLog: [
        {
          id: "layout-old-work",
          date: "2026-10-20",
          endedAt: STAMP,
          durationMs: 90_000,
          note: "Gerçek eski çalışma sonucu.",
          nextAction: "Eski çalışma adımı.",
        },
      ],
      sourceFields: { original: { value: "Ham bekleme verisi korunmalı" } },
    }),
  ]);
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("record-edit-layout-0211-seeded")) return;
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
      sessionStorage.setItem("record-edit-layout-0211-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function open(page, type, id = `layout-${type}`) {
  await page.locator(`#nav [data-view="${type}"]`).click();
  await row(page, id)
    .locator(
      ["weekly", "monthly", "yearly"].includes(type)
        ? ".goal-edit-trigger"
        : ["meeting", "waiting"].includes(type)
          ? ".record-edit-trigger"
          : ".task-name",
    )
    .click();
  await expect(form(page)).toBeVisible();
}

async function openExtras(page) {
  if (!(await extras(page).evaluate((element) => element.open)))
    await extras(page).locator(":scope > summary").click();
}

async function save(page) {
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function backupRecords(page) {
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator("#settings-dialog")
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  await page
    .locator("#settings-dialog")
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
  return backup.records;
}

function unchangedExcept(actual, original, changes) {
  expect(actual).toEqual({
    ...original,
    ...changes,
    updatedAt: NOW.toISOString(),
  });
}

test("waiting edits expose follow-up facts while hiding legacy delivery dates and preserving history through reload, backup and exact Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const original = items.find((item) => item.id === "layout-waiting");
  const before = await saved(page);
  await open(page, "waiting");
  await expect(extras(page).locator("summary")).toHaveText("Ek bilgiler");
  expect(await extras(page).evaluate((element) => element.open)).toBe(false);
  for (const name of [
    "title",
    "status",
    "expectedFrom",
    "lastFollowUpDate",
    "nextFollowUpDate",
    "latestUpdate",
  ])
    await expect(field(page, name)).toBeVisible();
  for (const name of ["sourceDate", "description"])
    await expect(field(page, name)).toBeHidden();
  await openExtras(page);
  for (const name of ["sourceDate", "description"])
    await expect(field(page, name)).toBeVisible();
  await expect(field(page, "priority")).toBeHidden();
  await expect(field(page, "priority")).toBeDisabled();
  await expect(field(page, "priority")).toHaveValue("urgent");
  await expect(page.locator("#priority-filter")).toHaveCount(0);
  await expect(field(page, "nextAction")).not.toBeVisible();
  await expect(
    form(page).getByText("Takip bilgileri", { exact: true }),
  ).toBeVisible();
  await expect(field(page, "dueDate")).not.toBeVisible();
  await expect(field(page, "dueDate")).toBeDisabled();
  await openExtras(page);
  await expect(field(page, "nextAction")).not.toBeVisible();
  await expect(field(page, "nextAction")).toBeDisabled();
  await expect(field(page, "nextAction")).toHaveValue(original.nextAction);
  await expect(field(page, "dueDate")).not.toBeVisible();
  await expect(field(page, "dueDate")).toBeDisabled();
  await expect(field(page, "owner")).not.toBeVisible();
  await expect(field(page, "owner")).toBeDisabled();
  expect(await saved(page)).toBe(before);
  await field(page, "title").fill("Beklenen konu netleştirildi");
  await field(page, "expectedFrom").fill("Güncel dış ekip");
  await field(page, "nextFollowUpDate").fill("14.11.2026");
  await save(page);
  const edited = (await records(page)).find((item) => item.id === original.id);
  unchangedExcept(edited, original, {
    title: "Beklenen konu netleştirildi",
    expectedFrom: "Güncel dış ekip",
    nextFollowUpDate: "2026-11-14",
  });
  await page.reload();
  expect((await records(page)).find((item) => item.id === original.id)).toEqual(
    edited,
  );
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = page.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator("#settings-dialog")
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records.find((item) => item.id === original.id)).toEqual(
    edited,
  );
  await page
    .locator("#settings-dialog")
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
  await undo(page);
  expect(await saved(page)).toBe(before);
  await page.reload();
  expect(await records(page)).toEqual(items);
});

test("daily essentials remain visible while hidden legacy project, work type and owner fields survive edits, type changes, backup and exact Undo", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const type of ["daily", "meeting"]) {
    const original = items.find((item) => item.id === `layout-${type}`);
    await open(page, type);
    expect(await extras(page).evaluate((element) => element.open)).toBe(false);
    for (const name of ["title", "status"])
      await expect(field(page, name)).toBeVisible();
    if (type === "daily") {
      await expect(field(page, "dueDate")).toBeVisible();
      await expect(field(page, "priority")).toBeVisible();
      await expect(field(page, "parentId")).toBeVisible();
      await expect(field(page, "parentId")).toHaveValue("layout-weekly");
    }
    await expect(field(page, "nextAction")).not.toBeVisible();
    await openExtras(page);
    for (const name of ["sourceDate", "description"])
      await expect(field(page, name)).toBeVisible();
    if (type === "meeting") {
      await expect(field(page, "decision")).toBeVisible();
      for (const name of ["priority", "dueDate", "nextAction"]) {
        await expect(field(page, name)).not.toBeVisible();
        await expect(field(page, name)).toBeDisabled();
      }
      for (const name of ["owner", "participants"]) {
        await expect(field(page, name)).toBeHidden();
        await expect(field(page, name)).toBeDisabled();
        await expect(field(page, name)).toHaveValue("");
      }
    } else {
      await expect(field(page, "nextAction")).not.toBeVisible();
      await expect(field(page, "nextAction")).toBeDisabled();
      await expect(field(page, "nextAction")).toHaveValue(
        items.find((item) => item.id === "layout-daily").nextAction,
      );
      await expect(field(page, "owner")).not.toBeVisible();
      await expect(field(page, "owner")).toBeDisabled();
    }
    await field(page, "title").fill(`${original.title} düzeltildi`);
    const changes = { title: `${original.title} düzeltildi` };
    if (type === "daily") {
      changes.description =
        "Tür geçişinde ve yedekte korunacak gerçek günlük notu.";
      await field(page, "description").fill(changes.description);
      for (const name of ["projectCode", "workType"]) {
        await expect(field(page, name)).toBeHidden();
        await expect(field(page, name)).toBeDisabled();
        await expect(field(page, name)).toHaveValue(original[name]);
      }
      await field(page, "type").selectOption("waiting");
      await field(page, "type").selectOption("daily");
      await field(page, "status").selectOption(original.status);
      await expect(field(page, "title")).toHaveValue(changes.title);
      await expect(field(page, "description")).toHaveValue(changes.description);
      for (const name of ["projectCode", "workType"]) {
        await expect(field(page, name)).toBeHidden();
        await expect(field(page, name)).toBeDisabled();
        await expect(field(page, name)).toHaveValue(original[name]);
      }
      expect(await saved(page)).toBe(before);
    }
    await save(page);
    const edited = (await records(page)).find(
      (item) => item.id === original.id,
    );
    unchangedExcept(edited, original, changes);
    if (type === "daily") {
      await page.reload();
      expect(
        (await records(page)).find((item) => item.id === original.id),
      ).toEqual(edited);
      expect(
        (await backupRecords(page)).find((item) => item.id === original.id),
      ).toEqual(edited);
    }
    await undo(page);
    expect(await saved(page)).toBe(before);
    if (type === "daily") {
      await page.reload();
      expect(await records(page)).toEqual(items);
    }
  }
});

test("all goal editors keep period and parent basics, existing numeric measurement and legacy annual dates without incidental changes", async ({
  page,
}, testInfo) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const type of ["weekly", "monthly", "yearly"]) {
    const original = items.find((item) => item.id === `layout-${type}`);
    await page.locator(`#nav [data-view="${type}"]`).click();
    const goalRow = row(page, original.id);
    const details = page.locator("#goal-detail-panel");
    await expect(goalRow.locator(".goal-details-trigger")).toHaveCount(0);
    await expect(
      goalRow.locator('.goal-edit-trigger[data-action="edit"]'),
    ).toHaveAttribute("aria-label", `${original.title}: hedefi düzenle`);
    for (const action of ["title", "Enter", "Space"]) {
      if (action === "title")
        await goalRow.locator('.task-name[data-action="goal-details"]').click();
      else {
        await goalRow.focus();
        await goalRow.press(action);
      }
      await expect(details).toBeVisible();
      await expect(details).toHaveAttribute("data-goal-id", original.id);
      await expect(
        details.locator("#goal-next-step-form, #goal-next-action"),
      ).toHaveCount(0);
      await expect(page.locator("#editor")).not.toBeVisible();
      await details.locator('[data-action="goal-panel-close"]').last().click();
      expect(await saved(page)).toBe(before);
    }
    if (type === "weekly")
      await page.screenshot({
        path: testInfo.outputPath("goal-list-pencil-route.png"),
        fullPage: false,
      });
    await goalRow.locator('[data-action="new-linked"]').click();
    await expect(form(page)).toHaveAttribute("data-creation", "true");
    await expect(field(page, "type")).toHaveValue(
      { weekly: "daily", monthly: "weekly", yearly: "monthly" }[type],
    );
    await expect(
      field(page, type === "weekly" ? "parentId" : "goalParentId"),
    ).toHaveValue(original.id);
    await page.locator('#editor [data-action="creation-close"]').last().click();
    expect(await saved(page)).toBe(before);
    await open(page, type);
    await expect(field(page, "id")).toHaveValue(original.id);
    await expect(form(page)).not.toHaveAttribute("data-creation", "true");
    await expect(field(page, "periodKey")).not.toBeVisible();
    await expect(field(page, "periodKey")).toHaveAttribute("type", "hidden");
    await expect(field(page, "periodKey")).toHaveValue(original.periodKey);
    await expect(field(page, "editorPeriodYear")).toBeVisible();
    await expect(field(page, "editorPeriodYear")).toHaveValue(
      original.periodKey.slice(0, 4),
    );
    if (type !== "yearly") {
      const second =
        type === "weekly" ? "editorPeriodWeek" : "editorPeriodMonth";
      await expect(field(page, second)).toBeVisible();
      await expect(field(page, second)).toHaveValue(
        original.periodKey.slice(-2),
      );
    }
    if (type !== "yearly") {
      await expect(field(page, "goalParentId")).toBeVisible();
      await expect(field(page, "goalParentId")).toHaveValue(
        original.goalParentId,
      );
    }
    await expect(measurement(page)).toBeVisible();
    await expect(measurement(page).locator("summary")).toHaveCount(0);
    await expect(
      measurement(page).getByRole("checkbox", {
        name: "Adetle takip et",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      measurement(page).getByLabel("Hedef adet", { exact: true }),
    ).toHaveValue("10");
    await expect(
      measurement(page).getByLabel("Birim", { exact: true }),
    ).toHaveValue("Rapor");
    expect(await extras(page).evaluate((element) => element.open)).toBe(false);
    await expect(extras(page).locator('[name="sourceDate"]')).toBeHidden();
    await expect(field(page, "sourceDate")).toHaveValue("20.10.2026");
    await expect(field(page, "dueDate")).toHaveValue(
      original.dueDate.split("-").reverse().join("."),
    );
    if (type !== "yearly") {
      await expect(
        form(page).locator('[data-record-editor-basic] [name="dueDate"]'),
      ).toBeVisible();
      await expect(field(page, "dueDate")).toBeEnabled();
      await expect(extras(page).locator('[name="dueDate"]')).toHaveCount(0);
    }
    await expect(field(page, "currentValue")).toBeHidden();
    await openExtras(page);
    await expect(extras(page).locator('[name="sourceDate"]')).toBeVisible();
    await expect(field(page, "sourceDate")).toBeEnabled();
    await expect(
      extras(page).getByLabel("Mevcut adet", { exact: true }),
    ).toHaveValue("4");
    await expect(field(page, "currentValue")).toBeVisible();
    await expect(field(page, "currentValue")).toHaveValue("4");
    await expect(field(page, "targetValue")).toHaveValue("10");
    await expect(field(page, "metric")).toHaveValue("Rapor");
    expect(await extras(page).evaluate((element) => element.open)).toBe(true);
    await extras(page).locator(":scope > summary").click();
    await field(page, "status").selectOption("planned");
    await expect(measurement(page)).toBeVisible();
    await expect(field(page, "targetValue")).toBeVisible();
    await expect(field(page, "metric")).toBeVisible();
    await expect(field(page, "currentValue")).toBeHidden();
    await field(page, "status").selectOption("in_progress");
    expect(await extras(page).evaluate((element) => element.open)).toBe(false);
    await openExtras(page);
    for (const name of ["nextAction", "variance"]) {
      await expect(field(page, name)).toBeHidden();
      await expect(field(page, name)).toBeDisabled();
      await expect(field(page, name)).toHaveValue(original[name]);
    }
    await expect(field(page, "owner")).not.toBeVisible();
    await expect(field(page, "owner")).toBeDisabled();
    if (type === "yearly") {
      await expect(field(page, "dueDate")).not.toBeVisible();
      await expect(field(page, "dueDate")).toBeDisabled();
    }
    expect(await saved(page)).toBe(before);
    if (type === "weekly")
      await page.screenshot({
        path: testInfo.outputPath("goal-record-form.png"),
        fullPage: false,
      });
    await field(page, "title").fill(`${original.title} düzenlendi`);
    const description = `${original.description} Düzenlenmiş gerçek not.`;
    await field(page, "description").fill(description);
    await save(page);
    const edited = (await records(page)).find(
      (item) => item.id === original.id,
    );
    unchangedExcept(edited, original, {
      title: `${original.title} düzenlendi`,
      description,
    });
    await page.reload();
    expect(
      (await records(page)).find((item) => item.id === original.id),
    ).toEqual(edited);
    expect(
      (await backupRecords(page)).find((item) => item.id === original.id),
    ).toEqual(edited);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
});

test("switching waiting and daily preserves drafts and dates without duplicate submitted controls or a hidden delivery overwrite", async ({
  page,
}) => {
  const items = await seed(page);
  const original = items.find((item) => item.id === "layout-waiting");
  const before = await saved(page);
  await open(page, "waiting");
  await field(page, "expectedFrom").fill("Taslak beklenen kişi");
  await field(page, "nextFollowUpDate").fill("16.11.2026");
  await openExtras(page);
  await field(page, "description").fill(
    "Türler arasında korunan gerçek taslak.",
  );
  const type = form(page).locator('select[name="type"]');
  await type.selectOption("daily");
  await expect(field(page, "dueDate")).toBeVisible();
  await expect(field(page, "priority")).toBeVisible();
  await expect(field(page, "priority")).toHaveValue(original.priority);
  await field(page, "priority").selectOption("low");
  await expect(field(page, "dueDate")).toHaveValue("25.11.2026");
  await field(page, "dueDate").fill("26.11.2026");
  await type.selectOption("waiting");
  await expect(field(page, "expectedFrom")).toHaveValue("Taslak beklenen kişi");
  await expect(field(page, "nextFollowUpDate")).toHaveValue("16.11.2026");
  await expect(field(page, "description")).toHaveValue(
    "Türler arasında korunan gerçek taslak.",
  );
  await expect(field(page, "dueDate")).not.toBeVisible();
  await expect(field(page, "dueDate")).toBeDisabled();
  await expect(field(page, "priority")).toBeHidden();
  await expect(field(page, "priority")).toBeDisabled();
  await expect(field(page, "priority")).toHaveValue("low");
  const names = await form(page).evaluate((element) => [
    ...new FormData(element).keys(),
  ]);
  expect(new Set(names).size).toBe(names.length);
  expect(names).not.toContain("dueDate");
  expect(names).not.toContain("priority");
  expect(await saved(page)).toBe(before);
  await save(page);
  unchangedExcept(
    (await records(page)).find((item) => item.id === original.id),
    original,
    {
      expectedFrom: "Taslak beklenen kişi",
      nextFollowUpDate: "2026-11-16",
      description: "Türler arasında korunan gerçek taslak.",
    },
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
  await open(page, "waiting");
  await openExtras(page);
  await form(page).locator('select[name="type"]').selectOption("daily");
  await field(page, "dueDate").fill("26.11.2026");
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("routed meetings show their derived status while legacy context and waiting follow-up history survive a later summary edit", async ({
  page,
}) => {
  const items = fixture();
  const meeting = items.find((item) => item.id === "layout-meeting");
  const topic = items.find((item) => item.id === "layout-waiting");
  topic.sourceFields.__followupSource = {
    recordId: meeting.id,
    type: "meeting",
  };
  const original = await seed(page, items);
  const before = await saved(page);
  await open(page, "meeting");
  await openExtras(page);
  await expect(field(page, "status")).toBeDisabled();
  await expect(field(page, "status")).toHaveValue("in_progress");
  await expect(
    form(page).locator("#meeting-derived-status-help"),
  ).toContainText("bağlı iş ve takipten");
  await expect(field(page, "status").locator("option")).toHaveText([
    "Planlanacak",
    "Açık",
    "Kapandı",
  ]);
  for (const name of ["dueDate", "nextAction"])
    await expect(field(page, name)).toBeDisabled();
  for (const name of ["owner", "participants"]) {
    await expect(field(page, name)).toBeHidden();
    await expect(field(page, name)).toBeDisabled();
    await expect(field(page, name)).toHaveValue("");
  }
  await close(page);
  await open(page, "waiting");
  await expect(form(page).locator('select[name="type"]')).toBeDisabled();
  await openExtras(page);
  await expect(field(page, "dueDate")).not.toBeVisible();
  await expect(field(page, "dueDate")).toBeDisabled();
  await close(page);
  expect(await saved(page)).toBe(before);
  await row(page, topic.id).locator('[data-action="waiting-followup"]').click();
  const followup = page.locator("#waiting-followup-dialog");
  await expect(followup).toBeVisible();
  await followup.locator('[name="followUpDate"]').fill("07.11.2026");
  await followup
    .locator('[name="followUpNote"]')
    .fill("Dış ekipten güncel yanıt istendi.");
  await followup.locator('[name="nextFollowUpDate"]').fill("17.11.2026");
  await followup
    .getByRole("button", { name: "Takibi kaydet", exact: true })
    .click();
  await expect(followup).not.toBeVisible();
  const afterFollowup = (await records(page)).find(
    (item) => item.id === topic.id,
  );
  expect(afterFollowup.followUpLog).toHaveLength(2);
  expect(afterFollowup.followUpLog[0]).toEqual(topic.followUpLog[0]);
  expect(afterFollowup).toMatchObject({
    lastFollowUpDate: "2026-11-07",
    latestUpdate: "Dış ekipten güncel yanıt istendi.",
    nextFollowUpDate: "2026-11-17",
    dueDate: topic.dueDate,
  });
  const followupBytes = await saved(page);
  await open(page, "waiting");
  await expect(field(page, "lastFollowUpDate")).toHaveValue("07.11.2026");
  await expect(field(page, "latestUpdate")).toHaveValue(
    "Dış ekipten güncel yanıt istendi.",
  );
  await field(page, "latestUpdate").fill("Özet açıklaması düzeltildi.");
  await save(page);
  const afterSummary = (await records(page)).find(
    (item) => item.id === topic.id,
  );
  expect({ ...afterSummary, latestUpdate: afterFollowup.latestUpdate }).toEqual(
    afterFollowup,
  );
  expect(afterSummary.followUpLog).toEqual(afterFollowup.followUpLog);
  await undo(page);
  expect(await saved(page)).toBe(followupBytes);
  await undo(page);
  expect(await saved(page)).toBe(before);
  expect(await records(page)).toEqual(original);
});
