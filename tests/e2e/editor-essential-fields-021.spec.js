import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const form = (page) => page.locator("#record-form");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);

function fixture() {
  return [
    record({
      id: "essential-weekly",
      type: "weekly",
      title: "Kontrol haftalık hedefi",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 2,
      metric: "Çizim",
    }),
    record({
      id: "essential-daily",
      title: "Geçmiş sorumlusu bulunan günlük iş",
      status: "in_progress",
      owner: "Geçmiş kayıt sorumlusu",
      parentId: "essential-weekly",
      sourceDate: "2026-10-28",
      dueDate: "2026-11-10",
      projectCode: "PRJ-01",
      workType: "Analiz",
      category: "Eski kategori korunur",
      nextAction: "Doğrulama çizimini incele.",
      description: "Kullanıcının özgün notu.",
      sourceFields: { "Özgün kaynak": "Bu değer korunur" },
    }),
    record({
      id: "essential-meeting",
      type: "meeting",
      title: "Toplantıda kararlaştırılan kontrol",
      owner: "Toplantı sorumlusu",
      participants: "Tasarım ve üretim ekipleri",
      decision: "Çizimin son revizyonu kontrol edilecek.",
    }),
    record({
      id: "essential-waiting",
      type: "waiting",
      title: "Üretim ekibinin yanıtını bekle",
      owner: "Geçmiş aktarım sorumlusu",
      expectedFrom: "Üretim ekibi",
      sourceDate: "2026-10-30",
      lastFollowUpDate: "2026-11-02",
      nextFollowUpDate: "2026-11-09",
      latestUpdate: "İnceleme devam ediyor.",
    }),
    record({
      id: "essential-yearly",
      type: "yearly",
      title: "Senelik doğrulama hedefi",
      periodKey: "2026",
      dueDate: "2026-12-31",
      owner: "Geçmiş hedef sorumlusu",
      description: "Senelik hedefin özgün notu korunur.",
    }),
  ];
}

async function seed(page) {
  await page.clock.setFixedTime(NOW);
  const initial = JSON.stringify({
    version: 1,
    records: fixture(),
    odak: {
      version: 1,
      preferences: { density: "compact", theme: "light" },
      history: [],
    },
  });
  await page.addInitScript(
    ({ key, initial }) => {
      if (sessionStorage.getItem("essential-fields-021-seeded")) return;
      localStorage.setItem(key, initial);
      sessionStorage.setItem("essential-fields-021-seeded", "true");
    },
    { key: KEY, initial },
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  expect(await saved(page)).toBe(initial);
  return initial;
}

async function openExisting(page, type, id) {
  await page.locator(`#nav [data-view="${type}"]`).click();
  await page.locator(`.full-table tr[data-id="${id}"] .task-name`).click();
  await expect(page.locator("#editor")).toBeVisible();
  await openCreationExtras(page);
}

test("new daily work omits the owner field while meeting and waiting forms retain their person fields and cached drafts", async ({
  page,
}) => {
  const initial = await seed(page);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await openCreationExtras(page);
  await expect(form(page).locator('[name="owner"]')).toBeHidden();
  await expect(form(page).locator('[name="owner"]')).toHaveValue("");
  await expect(form(page).locator('[name="category"]')).toBeHidden();
  await expect(form(page).getByLabel("Sorumlu", { exact: true })).toHaveCount(
    0,
  );
  await form(page)
    .locator('[name="title"]')
    .fill("Sorumlu alanı olmadan yeni günlük iş");
  await form(page).locator('[name="type"]').selectOption("meeting");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="owner"]')).toBeVisible();
  await form(page)
    .locator('[name="owner"]')
    .fill("Toplantı taslağının sorumlusu");
  await form(page).locator('[name="type"]').selectOption("daily");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="owner"]')).toBeHidden();
  await expect(form(page).locator('[name="owner"]')).toHaveValue("");
  await form(page).locator('[name="type"]').selectOption("meeting");
  await openCreationExtras(page);
  await expect(form(page).locator('[name="owner"]')).toHaveValue(
    "Toplantı taslağının sorumlusu",
  );
  await form(page).locator('[name="type"]').selectOption("waiting");
  await expect(form(page).locator('[name="expectedFrom"]')).toBeVisible();
  await expect(form(page).getByLabel("Sorumlu", { exact: true })).toHaveCount(
    0,
  );
  await form(page).locator('[name="type"]').selectOption("yearly");
  await expect(form(page).locator('[name="dueDate"]')).toHaveCount(0);
  await form(page).locator('[name="type"]').selectOption("daily");
  await expect(form(page).locator('[name="title"]')).toHaveValue(
    "Sorumlu alanı olmadan yeni günlük iş",
  );
  expect(await saved(page)).toBe(initial);
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const after = await records(page);
  const added = after.find(
    (item) => !fixture().some((old) => old.id === item.id),
  );
  expect(added.owner).toBe("");
  expect(added.category).toBe("");
  expect(added.title).toBe("Sorumlu alanı olmadan yeni günlük iş");
  expect(after.filter((item) => item.id !== added.id)).toEqual(fixture());
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(initial);
});

test("editing an unrelated daily field preserves hidden legacy owners and undo restores the exact backup", async ({
  page,
}) => {
  const initial = await seed(page);
  await openExisting(page, "daily", "essential-daily");
  await expect(form(page).locator('[name="owner"]')).toBeHidden();
  await expect(form(page).locator('[name="owner"]')).toBeDisabled();
  await expect(form(page).locator('[name="owner"]')).toHaveValue(
    "Geçmiş kayıt sorumlusu",
  );
  await form(page)
    .locator('[name="description"]')
    .fill("Güncellenmiş gerçek kullanıcı notu.");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await records(page)).toEqual(
    fixture().map((item) =>
      item.id === "essential-daily"
        ? {
            ...item,
            description: "Güncellenmiş gerçek kullanıcı notu.",
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(initial);
  for (const [type, id] of [
    ["meeting", "essential-meeting"],
    ["waiting", "essential-waiting"],
    ["yearly", "essential-yearly"],
  ]) {
    await openExisting(page, type, id);
    const owner = form(page).locator('[name="owner"]');
    await expect(owner).toHaveValue(
      fixture().find((item) => item.id === id).owner,
    );
    if (type === "meeting") {
      await expect(owner).toBeVisible();
      await expect(owner).toBeEnabled();
    } else {
      await expect(owner).toBeHidden();
      await expect(owner).toBeDisabled();
    }
    if (type === "waiting")
      await expect(form(page).locator('[name="expectedFrom"]')).toBeVisible();
    if (type === "yearly") {
      await expect(form(page).locator('[name="dueDate"]')).toBeHidden();
      await expect(form(page).locator('[name="dueDate"]')).toBeDisabled();
      await expect(form(page).locator('[name="dueDate"]')).toHaveValue(
        "31.12.2026",
      );
      await expect(form(page).locator('[name="description"]')).toHaveValue(
        "Senelik hedefin özgün notu korunur.",
      );
    }
    await form(page)
      .getByRole("button", { name: "Vazgeç", exact: true })
      .click();
    expect(await saved(page)).toBe(initial);
  }
  await page
    .locator('.full-table tr[data-id="essential-yearly"] .goal-details-trigger')
    .click();
  await expect(page.locator("#goal-detail-panel")).toBeVisible();
  await expect(page.locator("#goal-detail-panel .goal-panel-note")).toHaveCount(
    0,
  );
  expect(await saved(page)).toBe(initial);
  await page.keyboard.press("Escape");
});
