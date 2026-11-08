import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const title = "Uzun kayıt formu";

function longRecord() {
  return createRecord({
    id: "long-editor-record",
    title,
    description: [
      "Başlangıç notu",
      ...Array.from(
        { length: 20 },
        (_, index) => `${index + 1}. İnceleme sonucu ve takip edilecek adım.`,
      ),
    ].join("\n"),
    sourceFields: { "Özgün alan": "Yedekte korunacak kaynak bilgisi" },
  });
}

async function seed(page, record) {
  await page.addInitScript(
    ({ key, record }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, records: [record] }),
      );
    },
    { key: KEY, record },
  );
  await page.goto("/");
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator("#editor")).toBeVisible();
}

async function scrollFields(page, end) {
  await page.locator("#editor .modal-body").evaluate((body, atEnd) => {
    body.scrollTop = atEnd ? body.scrollHeight : 0;
  }, end);
}

async function expandNotes(page) {
  await openCreationExtras(page);
  // A user can enlarge a notes textarea while editing a detailed record.
  // Its height must remain inside the scrollable body, above fixed actions.
  await page.locator('#record-form [name="description"]').evaluate((notes) => {
    notes.style.height = "1300px";
  });
}

async function actionBounds(page) {
  const footer = page.locator("#editor .modal-footer");
  await expect(footer).toBeInViewport({ ratio: 1 });
  for (const name of ["Kaydı sil", "Vazgeç", "Değişiklikleri kaydet"]) {
    await expect(
      footer.getByRole("button", { name, exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }
  const box = await footer.boundingBox();
  expect(box.height).toBeGreaterThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  return box;
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`record actions stay fixed while expanded work notes scroll at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const record = longRecord();
    await seed(page, record);
    await page
      .locator('#record-form [name="title"]')
      .fill("Güncellenen uzun kayıt");
    await expandNotes(page);
    await scrollFields(page, false);
    const top = await actionBounds(page);
    const body = page.locator("#editor .modal-body");
    expect(
      await body.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await scrollFields(page, true);
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      1000,
    );
    const bottom = await actionBounds(page);
    expect(Math.abs(bottom.y - top.y)).toBeLessThanOrEqual(1);
    await expect(page.locator("#editor .modal-header")).toBeInViewport({
      ratio: 1,
    });
    expect(
      await page.locator("#editor").evaluate((element) => element.scrollTop),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(page.locator("#editor")).not.toBeVisible();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records[0],
      KEY,
    );
    expect(saved.title).toBe("Güncellenen uzun kayıt");
    expect(saved.description).toBe(record.description);
    expect(saved.sourceFields).toEqual(record.sourceFields);

    await page
      .getByRole("button", { name: "Güncellenen uzun kayıt", exact: true })
      .click();
    await openCreationExtras(page);
    await page
      .locator('#record-form [name="description"]')
      .fill("Üstten kaydedilen not");
    await scrollFields(page, false);
    await actionBounds(page);
    await page
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).records[0].description,
        KEY,
      ),
    ).toBe("Üstten kaydedilen not");
  });
}

test("cancel and delete remain available at the end of a long record form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const record = longRecord();
  await seed(page, record);
  await page
    .locator('#record-form [name="title"]')
    .fill("Kaydedilmeyen başlık");
  await expandNotes(page);
  await scrollFields(page, true);
  await actionBounds(page);
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records[0].title,
      KEY,
    ),
  ).toBe(title);
  await page.getByRole("button", { name: title, exact: true }).click();
  await expandNotes(page);
  await scrollFields(page, true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kaydı sil", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records.length,
      KEY,
    ),
  ).toBe(0);
});

test("saving an invalid field reveals it inside the scroll area without losing the action bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seed(page, longRecord());
  const input = page.locator('#record-form [name="title"]');
  await input.fill("");
  await expandNotes(page);
  await scrollFields(page, true);
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport({ ratio: 1 });
  await actionBounds(page);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records[0].title,
      KEY,
    ),
  ).toBe(title);
});
