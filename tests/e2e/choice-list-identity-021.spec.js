import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const form = (page) => page.locator("#editor #record-form");
const menu = (page) => page.locator("#record-choice-menu");
const option = (page, value) =>
  menu(page).getByRole("option", { name: value, exact: true });
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

async function newDaily(page) {
  await page.locator(".topbar .new-record").click();
  await openCreationExtras(page);
}

test("accent-distinct catalog captions coexist in both forms while tolerant search highlights only the exact identity", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await newDaily(page);
  const field = form(page).locator('[name="workType"]');
  await field.fill("olcum");
  await expect(option(page, "Ölçüm")).toBeVisible();
  await expect(option(page, "Olcum")).toBeVisible();
  await expect(menu(page).locator(".choice-custom")).toHaveCount(0);
  await expect(option(page, "Olcum")).toHaveAttribute("aria-selected", "true");
  await expect(option(page, "Olcum").locator(".choice-check svg")).toHaveCount(
    1,
  );
  await expect(option(page, "Ölçüm").locator(".choice-check svg")).toHaveCount(
    0,
  );
  await option(page, "Ölçüm").click();
  await expect(field).toHaveValue("Ölçüm");
  await close(page);
  await page
    .locator('.full-table tr[data-id="identity-existing"] .task-name')
    .click();
  await openCreationExtras(page);
  const existing = form(page).locator('[name="workType"]');
  await existing.press("ArrowDown");
  await expect(option(page, "Ölçüm")).toBeVisible();
  await expect(option(page, "Olcum")).toBeVisible();
  await expect(option(page, "Ölçüm").locator(".choice-check svg")).toHaveCount(
    1,
  );
  await expect(option(page, "Olcum").locator(".choice-check svg")).toHaveCount(
    0,
  );
  await existing.fill("Olcum");
  await existing.press("Enter");
  await expect(existing).toHaveValue("Olcum");
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("an accent-similar existing caption does not suppress a distinct custom value that can be saved, learned and undone", async ({
  page,
}) => {
  const original = await seed(page, ["Ölçüm"]);
  const before = await saved(page);
  await newDaily(page);
  await form(page).locator('[name="title"]').fill("Ayrı isimli yeni iş");
  const field = form(page).locator('[name="workType"]');
  await field.fill("Olcum");
  await expect(option(page, "Ölçüm")).toBeVisible();
  await expect(option(page, "Ölçüm").locator(".choice-check svg")).toHaveCount(
    0,
  );
  const custom = menu(page).locator('[data-choice-custom="true"]');
  await expect(custom).toHaveCount(1);
  await expect(custom.locator("strong")).toHaveText("Olcum");
  await custom.click();
  await expect(field).toHaveValue("Olcum");
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const after = await store(page);
  expect(after.records.find((record) => record.id === original.id)).toEqual(
    original,
  );
  expect(
    after.records.find((record) => record.title === "Ayrı isimli yeni iş")
      .workType,
  ).toBe("Olcum");
  expect(after.odak.preferences.choiceLists).toEqual(
    JSON.parse(before).odak.preferences.choiceLists,
  );
  await newDaily(page);
  await form(page).locator('[name="workType"]').fill("olcum");
  await expect(option(page, "Ölçüm")).toBeVisible();
  await expect(option(page, "Olcum")).toBeVisible();
  await expect(menu(page).locator(".choice-custom")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await close(page);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(before);
});

test("Turkish dotted and dotless I remain distinct identities while their own case and NFKC equivalents are exact matches", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await newDaily(page);
  const field = form(page).locator('[name="projectCode"]');
  for (const [query, chosen, other] of [
    ["ı-42", "I-42", "İ-42"],
    ["i-42", "İ-42", "I-42"],
    ["Ｉ-42", "I-42", "İ-42"],
  ]) {
    await field.fill(query);
    await expect(option(page, chosen)).toBeVisible();
    await expect(option(page, other)).toBeVisible();
    await expect(menu(page).locator(".choice-custom")).toHaveCount(0);
    await expect(option(page, chosen)).toHaveAttribute("aria-selected", "true");
    await expect(option(page, chosen).locator(".choice-check svg")).toHaveCount(
      1,
    );
    await expect(option(page, other).locator(".choice-check svg")).toHaveCount(
      0,
    );
    await field.press("Enter");
    await expect(field).toHaveValue(chosen);
  }
  await close(page);
  expect(await saved(page)).toBe(before);
});
