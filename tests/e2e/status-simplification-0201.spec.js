import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord, validateStore } from "../../src/model.js";
import { cleanupMeetingContacts } from "../../src/meeting-contact-cleanup.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
const form = (page) => page.locator("#editor #record-form");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
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

function fixture() {
  return cleanupMeetingContacts(
    TYPES.flatMap((type) => [
      createRecord({
        id: `legacy-${type}`,
        type,
        title: `Özgün ${type} kaydı`,
        status: "partially_completed",
        priority: "high",
        createdAt: STAMP,
        updatedAt: STAMP,
        sourceDate: "2026-11-01",
        dueDate: "2026-11-10",
        description: `Gerçek ${type} notu`,
        nextAction: `Özgün ${type} sonraki adımı`,
        owner: "Özgün sorumlu",
        periodKey:
          { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] ||
          "",
        ...(type === "daily"
          ? {
              parentId: "legacy-weekly",
              projectCode: "ÖZGÜN-42",
              workType: "Teknik inceleme",
              category: "Korunacak kategori",
              waitingReason: "Önceden kaydedilmiş neden",
              workLog: [
                {
                  id: "legacy-session",
                  date: "2026-11-06",
                  endedAt: "2026-11-06T09:00:00.000Z",
                  durationMs: 90_000,
                  note: "Gerçek çalışma sonucu",
                  nextAction: "Geçmiş sonraki adım",
                },
              ],
            }
          : {}),
        ...(["weekly", "monthly", "yearly"].includes(type)
          ? { metric: "Rapor", targetValue: 10, currentValue: 4 }
          : {}),
        ...(type === "weekly" ? { goalParentId: "legacy-monthly" } : {}),
        ...(type === "monthly" ? { goalParentId: "legacy-yearly" } : {}),
        ...(type === "meeting"
          ? {
              decision: "Gerçek toplantı kararı",
              participants: "Tasarım ve üretim",
            }
          : {}),
        ...(type === "waiting"
          ? {
              expectedFrom: "Dış ekip",
              nextFollowUpDate: "2026-11-10",
              lastFollowUpDate: "2026-11-05",
              latestUpdate: "Gerçek takip özeti",
              followUpLog: [
                {
                  id: "legacy-followup",
                  date: "2026-11-05",
                  note: "Gerçekleşmiş takip",
                  nextFollowUpDate: "2026-11-10",
                },
              ],
            }
          : {}),
        sourceFields: { "Özgün kaynak": { value: `${type} ham bilgisi` } },
      }),
      createRecord({
        id: `canonical-${type}`,
        type,
        title: `Devam eden ${type} kaydı`,
        status: "in_progress",
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
      createRecord({
        id: `planned-${type}`,
        type,
        title: `Planlanan ${type} kaydı`,
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
    ]),
  );
}

async function seed(page) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  const records = fixture();
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("status-simplification-0201-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("status-simplification-0201-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

async function editLegacyFromRow(page, type) {
  const id = `legacy-${type}`;
  await row(page, id).locator(".task-name").click();
  if (type !== "daily") {
    const isGoal = ["weekly", "monthly", "yearly"].includes(type);
    const panel = page.locator(
      isGoal ? "#goal-detail-panel" : `#${type}-record-panel`,
    );
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute(
      isGoal ? "data-goal-id" : "data-record-id",
      id,
    );
    await panel
      .getByRole("button", {
        name: isGoal ? "Hedefi düzenle" : "Kaydı düzenle",
        exact: true,
      })
      .click();
  }
  await expect(form(page).locator('[name="id"]')).toHaveValue(id);
  await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
  await expect(form(page).locator('select[name="status"]')).toHaveValue(
    type === "meeting" ? "planned" : "in_progress",
  );
}

async function openLegacy(page, type) {
  await list(page, type);
  await editLegacyFromRow(page, type);
}

test("legacy partial work uses current display states while filters, menus and both forms omit the retired choice without writes", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  for (const type of TYPES) {
    await list(page, type);
    await expect(
      page.locator('#status-filter option[value="partially_completed"]'),
    ).toHaveCount(0);
    const displayStatus = type === "meeting" ? "planned" : "in_progress";
    await page.locator("#status-filter").selectOption(displayStatus);
    expect(
      (
        await page
          .locator(".full-table tbody > tr[data-record-row]")
          .evaluateAll((rows) => rows.map((row) => row.dataset.id))
      ).sort(),
    ).toEqual(
      type === "meeting"
        ? [`canonical-${type}`, `legacy-${type}`, `planned-${type}`]
        : [`canonical-${type}`, `legacy-${type}`],
    );
    const legacy = row(page, `legacy-${type}`);
    const badge = legacy.locator(".status-trigger");
    await expect(badge).toHaveText(
      type === "meeting" ? "Planlanacak" : "Devam ediyor",
    );
    await expect(badge).toHaveClass(new RegExp(`status-${displayStatus}`));
    await expect(badge).not.toHaveClass(/status-partially_completed/);
    const legacyColor = await badge.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    );
    const ongoingColor = await row(page, `canonical-${type}`)
      .locator(".status-trigger")
      .evaluate((button) => getComputedStyle(button).backgroundColor);
    expect(legacyColor).toBe(ongoingColor);
    await badge.click();
    await expect(
      page.locator('#status-menu [data-status="partially_completed"]'),
    ).toHaveCount(0);
    await expect(
      page.locator(`#status-menu [data-status="${displayStatus}"]`),
    ).toHaveAttribute("aria-checked", "true");
    if (type === "meeting")
      await expect(
        page.locator('#status-menu [data-status="in_progress"]'),
      ).toHaveCount(0);
    await expect(page.locator("#status-menu")).not.toContainText("Kısmi");
    await page.keyboard.press("Escape");
    await editLegacyFromRow(page, type);
    await expect(
      form(page).locator('[name="status"] option[value="partially_completed"]'),
    ).toHaveCount(0);
    await expect(form(page).locator('[name="status"]')).toHaveValue(
      displayStatus,
    );
    await closeEditor(page);
    await page.locator(".topbar .new-record").click();
    await expect(form(page)).toHaveAttribute("data-creation", "true");
    await openCreationExtras(page);
    await expect(
      form(page).locator('[name="status"] option[value="partially_completed"]'),
    ).toHaveCount(0);
    await expect(form(page).locator('[name="status"]')).not.toContainText(
      "Kısmi",
    );
    await closeEditor(page);
    expect(await saved(page)).toBe(before);
  }
  await page.reload();
  expect(await saved(page)).toBe(before);
});

test("unrelated edits preserve raw legacy status and all original measurements, dates, links and history through reload, undo and native backup", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const type of TYPES) {
    await openLegacy(page, type);
    await openCreationExtras(page);
    await form(page)
      .locator('[name="description"]')
      .fill(`Yalnızca ${type} notu düzenlendi`);
    await form(page)
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(page.locator("#editor")).not.toBeVisible();
    const after = await store(page);
    const old = original.find((record) => record.id === `legacy-${type}`);
    const edited = after.records.find((record) => record.id === old.id);
    expect(edited.status).toBe("partially_completed");
    expect({
      ...edited,
      description: old.description,
      updatedAt: old.updatedAt,
    }).toEqual(old);
    expect(after.records.filter((record) => record.id !== old.id)).toEqual(
      original.filter((record) => record.id !== old.id),
    );
    const afterSaved = await saved(page);
    await page.reload();
    expect(await saved(page)).toBe(afterSaved);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const backupDetails = page.locator("#settings-dialog .settings-backup");
  if (!(await backupDetails.evaluate((element) => element.open)))
    await backupDetails.locator(":scope > summary").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(
    (await readFile(await download.path())).toString("utf8"),
  );
  expect(validateStore(backup).records).toEqual(original);
  expect(
    backup.records.filter((record) => record.status === "partially_completed"),
  ).toHaveLength(6);
  expect(await saved(page)).toBe(before);
});

test("explicit ongoing selections canonicalize supported records while meeting archive controls preserve their legacy source and exact undo", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const type of TYPES.filter((type) => type !== "meeting")) {
    await list(page, type);
    await row(page, `legacy-${type}`).locator(".status-trigger").click();
    await page
      .locator(
        '#status-menu [data-action="set-status"][data-status="in_progress"]',
      )
      .click();
    const after = await store(page);
    const old = original.find((record) => record.id === `legacy-${type}`);
    const changed = after.records.find((record) => record.id === old.id);
    expect(changed.status).toBe("in_progress");
    expect({
      ...changed,
      status: old.status,
      updatedAt: old.updatedAt,
    }).toEqual(old);
    expect(after.records.filter((record) => record.id !== old.id)).toEqual(
      original.filter((record) => record.id !== old.id),
    );
    expect(after.odak.history).toHaveLength(1);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await list(page, "meeting");
  await row(page, "legacy-meeting").locator(".status-trigger").click();
  await expect(
    page.locator('#status-menu [data-status="in_progress"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#status-menu [data-status="planned"]'),
  ).toHaveAttribute("aria-checked", "true");
  await page.locator('#status-menu [data-status="planned"]').click();
  expect(await saved(page)).toBe(before);
  expect((await store(page)).records).toEqual(original);
  await openLegacy(page, "daily");
  await form(page).locator('[name="status"]').selectOption("planned");
  await form(page).locator('[name="status"]').selectOption("in_progress");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const old = original.find((record) => record.id === "legacy-daily");
  const changed = (await store(page)).records.find(
    (record) => record.id === old.id,
  );
  expect(changed.status).toBe("in_progress");
  expect({ ...changed, status: old.status, updatedAt: old.updatedAt }).toEqual(
    old,
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
});
