import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = async (page) => JSON.parse(await saved(page)).records;
const form = (page) => page.locator("#record-form");
const editor = (page) => page.locator("#editor");

function fixture() {
  return [
    make({
      id: "conflict-source",
      type: "meeting",
      title: "Toplantının karar bağlamı",
      status: "in_progress",
      dueDate: "2026-11-10",
      owner: "Ben",
      nextAction: "Teknik kontrolü tamamla.",
      decision: "Özgün karar korunmalı.",
    }),
    make({
      id: "conflict-target",
      title: "Bağlı günlük uygulama işi",
      status: "in_progress",
      dueDate: "2026-11-10",
      owner: "Ben",
      nextAction: "Teknik kontrolü tamamla.",
      description: "Kullanıcının gerçek notu.",
      sourceFields: {
        __followupSource: { recordId: "conflict-source", type: "meeting" },
        original: { value: "Kaynak bilgisi korunmalı" },
      },
    }),
    make({
      id: "conflict-other",
      title: "Bağımsız günlük kayıt",
      nextAction: "Özgün bağımsız adım.",
    }),
  ];
}

async function seed(page) {
  const original = fixture();
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("editor-conflicts-seeded")) return;
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
      sessionStorage.setItem("editor-conflicts-seeded", "1");
    },
    { key: KEY, records: original },
  );
  await page.goto("/");
  return original;
}

async function secondWindow(context) {
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.clock.pauseAt(NOW);
  await other.goto("/");
  return other;
}

async function openDaily(page, id) {
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator(`.full-table tr[data-record-row][data-id="${id}"] .task-name`)
    .click();
  await expect(editor(page)).toBeVisible();
  await openCreationExtras(page);
}

async function submit(page) {
  await editor(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
}

test("a deleted routed record cannot be resurrected by an already-open editor and deletion undo retains its original link metadata", async ({
  page,
  context,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await openDaily(page, "conflict-target");
  await form(page)
    .locator('[name="title"]')
    .fill("Kaybolmaması gereken yerel taslak");
  const other = await secondWindow(context);
  await openDaily(other, "conflict-target");
  other.once("dialog", (dialog) => dialog.accept());
  await editor(other).locator('[data-action="delete"]').click();
  await expect(editor(other)).not.toBeVisible();
  await expect
    .poll(async () =>
      (await records(page)).some((record) => record.id === "conflict-target"),
    )
    .toBe(false);
  const deleted = await saved(page);
  await submit(page);
  await expect(editor(page)).toBeVisible();
  await expect(page.locator("#form-error")).toContainText(
    /silin|bulunam|değiş/i,
  );
  await expect(form(page).locator('[name="title"]')).toHaveValue(
    "Kaybolmaması gereken yerel taslak",
  );
  expect(await saved(page)).toBe(deleted);
  await other.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(() => saved(page)).toBe(before);
  expect(
    (await records(page)).find((record) => record.id === "conflict-target"),
  ).toEqual(original.find((record) => record.id === "conflict-target"));
  await other.close();
});

test("an already-open editor rejects overwriting the same record changed in another window and keeps the local draft", async ({
  page,
  context,
}) => {
  await seed(page);
  await openDaily(page, "conflict-target");
  await form(page).locator('[name="title"]').fill("Yerel taslak başlığı");
  await form(page).locator('[name="description"]').fill("Yerel taslak notu");
  const other = await secondWindow(context);
  await openDaily(other, "conflict-target");
  await form(other)
    .locator('[name="title"]')
    .fill("Diğer pencerede kaydedilen başlık");
  await form(other)
    .locator('[name="description"]')
    .fill("Diğer pencerenin yeni notu");
  await submit(other);
  await expect(editor(other)).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await records(page)).find((record) => record.id === "conflict-target")
          .title,
    )
    .toBe("Diğer pencerede kaydedilen başlık");
  const incoming = await saved(page);
  await submit(page);
  await expect(editor(page)).toBeVisible();
  await expect(page.locator("#form-error")).toContainText(/değiş|güncel/i);
  await expect(form(page).locator('[name="title"]')).toHaveValue(
    "Yerel taslak başlığı",
  );
  await expect(form(page).locator('[name="description"]')).toHaveValue(
    "Yerel taslak notu",
  );
  expect(await saved(page)).toBe(incoming);
  expect(
    (await records(page)).find((record) => record.id === "conflict-target")
      .sourceFields.__followupSource,
  ).toEqual({ recordId: "conflict-source", type: "meeting" });
  await other.close();
});

test("an unrelated record update does not block saving the open record and both windows retain the independent edits", async ({
  page,
  context,
}) => {
  const original = await seed(page);
  await openDaily(page, "conflict-target");
  await form(page).locator('[name="title"]').fill("Bağlı işin yeni başlığı");
  const other = await secondWindow(context);
  await openDaily(other, "conflict-other");
  await expect(form(other).locator('[name="nextAction"]')).toBeHidden();
  await expect(form(other).locator('[name="nextAction"]')).toBeDisabled();
  await expect(form(other).locator('[name="nextAction"]')).toHaveValue(
    "Özgün bağımsız adım.",
  );
  await form(other)
    .locator('[name="description"]')
    .fill("Başka pencerede kaydedilen bağımsız not.");
  await submit(other);
  await expect(editor(other)).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await records(page)).find((record) => record.id === "conflict-other")
          .description,
    )
    .toBe("Başka pencerede kaydedilen bağımsız not.");
  const unrelated = (await records(page)).find(
    (record) => record.id === "conflict-other",
  );
  expect(unrelated.nextAction).toBe("Özgün bağımsız adım.");
  await submit(page);
  await expect(editor(page)).not.toBeVisible();
  const after = await records(page);
  const target = after.find((record) => record.id === "conflict-target");
  const old = original.find((record) => record.id === "conflict-target");
  expect(target.title).toBe("Bağlı işin yeni başlığı");
  expect({ ...target, title: old.title, updatedAt: old.updatedAt }).toEqual(
    old,
  );
  expect(after.find((record) => record.id === "conflict-other")).toEqual(
    unrelated,
  );
  expect(after.find((record) => record.id === "conflict-source")).toEqual(
    original.find((record) => record.id === "conflict-source"),
  );
  expect(after).toHaveLength(original.length);
  await expect.poll(() => saved(other)).toBe(await saved(page));
  await other.close();
});
