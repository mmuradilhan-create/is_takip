import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const settings = (page) => page.locator("#settings-dialog");
const catalog = (page, kind) =>
  settings(page).locator(`[data-choice-catalog="${kind}"]`);
const caption = (page, kind, value) =>
  catalog(page, kind)
    .locator(".choice-catalog-list > [data-choice-value]")
    .getByText(value, { exact: true });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const close = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

async function seed(page, workTypes = ["Ölçüm", "Olcum"]) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  const original = createRecord({
    id: "identity-existing",
    title: "Özgün seçimleri olan iş",
    workType: "Ölçüm",
    projectCode: "I-42",
    description: "Gerçek kayıt korunmalı.",
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  await page.addInitScript(
    ({ key, original, workTypes }) => {
      if (sessionStorage.getItem("choice-list-identity-021-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: [original],
          odak: {
            version: 1,
            preferences: {
              density: "comfortable",
              choiceLists: {
                projectCode: { added: ["I-42", "İ-42"], hidden: [] },
                workType: { added: workTypes, hidden: [] },
              },
            },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("choice-list-identity-021-seeded", "1");
    },
    { key: KEY, original, workTypes },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return original;
}

async function openCatalog(page, kind) {
  if (!(await settings(page).isVisible()))
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  if (!(await catalog(page, kind).evaluate((element) => element.open)))
    await catalog(page, kind).locator(":scope > summary").click();
}

async function add(page, kind, value) {
  await openCatalog(page, kind);
  const addForm = catalog(page, kind).locator('[data-choice-form="add"]');
  await addForm.locator('[name="choiceValue"]').fill(value);
  await addForm.getByRole("button", { name: "Ekle", exact: true }).click();
}

const closeSettings = (page) =>
  settings(page).getByRole("button", { name: "Tamam", exact: true }).click();

test("accent-distinct catalog captions coexist in settings while retired form fields preserve their exact legacy values", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await openCatalog(page, "workType");
  for (const value of ["Ölçüm", "Olcum"])
    await expect(caption(page, "workType", value)).toBeVisible();
  await closeSettings(page);
  await page.locator(".topbar .new-record").click();
  await openCreationExtras(page);
  for (const kind of ["projectCode", "workType"]) {
    await expect(form(page).locator(`[name="${kind}"]`)).toBeHidden();
    await expect(form(page).locator(`[name="${kind}"]`)).toHaveValue("");
  }
  await expect(page.locator("#record-choice-menu")).not.toBeVisible();
  await close(page);
  await page
    .locator('.full-table tr[data-id="identity-existing"] .task-name')
    .click();
  await expect(form(page).locator('[name="id"]')).toHaveValue(original.id);
  await openCreationExtras(page);
  for (const kind of ["projectCode", "workType"]) {
    const field = form(page).locator(`[name="${kind}"]`);
    await expect(field).toBeHidden();
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue(original[kind]);
  }
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("an accent-similar existing caption does not suppress a distinct catalog addition and exact undo restores the original preferences", async ({
  page,
}) => {
  const original = await seed(page, ["Ölçüm"]);
  const before = await saved(page);
  await add(page, "workType", "Olcum");
  for (const value of ["Ölçüm", "Olcum"])
    await expect(caption(page, "workType", value)).toBeVisible();
  const after = await store(page);
  expect(after.records).toEqual([original]);
  expect(after.odak.preferences.choiceLists.workType).toEqual({
    added: ["Ölçüm", "Olcum"],
    hidden: [],
  });
  expect(after.odak.history).toHaveLength(1);
  await closeSettings(page);
  await page.reload();
  await openCatalog(page, "workType");
  for (const value of ["Ölçüm", "Olcum"])
    await expect(caption(page, "workType", value)).toBeVisible();
  await closeSettings(page);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(before);
});

test("Turkish dotted and dotless I remain distinct catalog identities while case and NFKC duplicate additions never write", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await openCatalog(page, "projectCode");
  for (const value of ["I-42", "İ-42"])
    await expect(caption(page, "projectCode", value)).toBeVisible();
  for (const query of ["ı-42", "i-42", "Ｉ-42"]) {
    await add(page, "projectCode", query);
    await expect(
      catalog(page, "projectCode").locator("[data-choice-error]"),
    ).toBeVisible();
    expect(await saved(page)).toBe(before);
    expect((await store(page)).records).toEqual([original]);
    await expect(
      catalog(page, "projectCode").locator(
        ".choice-catalog-list > [data-choice-value]",
      ),
    ).toHaveCount(2);
    for (const value of ["I-42", "İ-42"])
      await expect(caption(page, "projectCode", value)).toBeVisible();
  }
  await closeSettings(page);
  await page.reload();
  expect(await saved(page)).toBe(before);
});
