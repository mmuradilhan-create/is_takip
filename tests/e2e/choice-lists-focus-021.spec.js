import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const catalog = (page) =>
  page.locator('#settings-dialog [data-choice-catalog="projectCode"]');
const row = (page, value) =>
  catalog(page)
    .locator(".choice-catalog-list > [data-choice-value]")
    .filter({
      has: page.locator(".choice-catalog-value", { hasText: value }),
    });
const renameInput = (page) =>
  catalog(page).locator('[data-choice-form="rename"] input');
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const savedRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);

async function seed(page, { manyChoices = false } = {}) {
  const records = ["A-1", "B-2", "C-3"].map((projectCode, index) =>
    createRecord({
      id: `catalog-focus-${index}`,
      title: `Korunacak iş ${index + 1}`,
      projectCode,
      workContext: "ad_hoc",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records, manyChoices }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: {
              density: "comfortable",
              ...(manyChoices
                ? {
                    choiceLists: {
                      projectCode: {
                        added: Array.from(
                          { length: 40 },
                          (_, index) => `PROJE-${index + 1}`,
                        ),
                        hidden: [],
                      },
                      workType: {
                        added: Array.from(
                          { length: 40 },
                          (_, index) => `Tür ${index + 1}`,
                        ),
                        hidden: [],
                      },
                    },
                  }
                : {}),
            },
            history: [],
          },
        }),
      );
      localStorage.removeItem(`${key}-work-session`);
    },
    { key: KEY, records, manyChoices },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await catalog(page).locator(":scope > summary").click();
  return records;
}

async function activateWithKeyboard(control) {
  await control.focus();
  await expect(control).toBeFocused();
  await control.press("Enter");
}

test("catalog rename, remove and restore keep keyboard focus beside the changed choice", async ({
  page,
}) => {
  const original = await seed(page);
  await activateWithKeyboard(
    row(page, "B-2").locator('[data-choice-action="rename"]'),
  );
  await expect(renameInput(page)).toBeFocused();
  await renameInput(page).fill("B-20");
  await renameInput(page).press("Enter");
  await expect(
    row(page, "B-20").locator('[data-choice-action="rename"]'),
  ).toBeFocused();

  await activateWithKeyboard(
    row(page, "B-20").locator('[data-choice-action="remove"]'),
  );
  await expect(
    row(page, "C-3").locator('[data-choice-action="rename"]'),
  ).toBeFocused();

  await catalog(page).locator("[data-choice-removed] > summary").click();
  await activateWithKeyboard(
    catalog(page).locator(
      '[data-choice-hidden-value="B-20"] [data-choice-action="restore"]',
    ),
  );
  await expect(
    row(page, "B-20").locator('[data-choice-action="rename"]'),
  ).toBeFocused();

  for (const value of ["C-3", "B-20", "A-1"])
    await activateWithKeyboard(
      row(page, value).locator('[data-choice-action="remove"]'),
    );
  await expect(
    catalog(page).locator('[data-choice-form="add"] input'),
  ).toBeFocused();
  expect(await savedRecords(page)).toEqual(original);
});

test("starting another rename preserves a dirty draft until it is saved or cancelled", async ({
  page,
}) => {
  await seed(page);
  const original = await saved(page);
  await row(page, "A-1").locator('[data-choice-action="rename"]').click();
  await renameInput(page).fill("Taslak proje adı");
  await row(page, "C-3").locator('[data-choice-action="rename"]').click();
  await expect(renameInput(page)).toHaveCount(1);
  await expect(renameInput(page)).toHaveValue("Taslak proje adı");
  await expect(renameInput(page)).toBeFocused();
  await expect(catalog(page).locator("[data-choice-error]")).toContainText(
    "Önce açık düzenlemeyi kaydet veya vazgeç",
  );
  expect(await saved(page)).toBe(original);

  await renameInput(page).press("Escape");
  await expect(
    row(page, "A-1").locator('[data-choice-action="rename"]'),
  ).toBeFocused();
  await row(page, "C-3").locator('[data-choice-action="rename"]').click();
  await expect(renameInput(page)).toHaveValue("C-3");
  expect(await saved(page)).toBe(original);
});

test("expanded choice lists scroll inside settings while the header and footer stay pinned on short and narrow screens", async ({
  page,
}) => {
  const original = await seed(page, { manyChoices: true });
  const settings = page.locator("#settings-dialog");
  const body = settings.locator(":scope > .settings-content");
  const header = settings.locator(":scope > .modal-header");
  const footer = settings.locator(":scope > .modal-footer");
  const workTypes = settings.locator('[data-choice-catalog="workType"]');
  await workTypes.locator(":scope > summary").click();

  for (const size of [
    { width: 390, height: 700 },
    { width: 1280, height: 650 },
  ]) {
    await page.setViewportSize(size);
    const originalHeader = await header.boundingBox();
    const originalFooter = await footer.boundingBox();
    expect(originalHeader.y).toBeGreaterThanOrEqual(0);
    expect(originalFooter.y + originalFooter.height).toBeLessThanOrEqual(
      size.height,
    );
    await expect(body).toHaveCSS("overflow-y", "auto");
    expect(
      await body.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    expect(
      await settings.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
      ),
    ).toBe(true);

    const assertPinned = async () => {
      const currentHeader = await header.boundingBox();
      const currentFooter = await footer.boundingBox();
      expect(Math.abs(currentHeader.y - originalHeader.y)).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs(currentFooter.y - originalFooter.y)).toBeLessThanOrEqual(
        1,
      );
      await expect(
        settings.getByRole("button", { name: "Pencereyi kapat", exact: true }),
      ).toBeInViewport();
      await expect(
        settings.getByRole("button", { name: "Tamam", exact: true }),
      ).toBeInViewport();
    };

    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await assertPinned();

    const list = workTypes.locator(".choice-catalog-list");
    await list.scrollIntoViewIfNeeded();
    expect(
      await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    const bodyPosition = await body.evaluate((element) => element.scrollTop);
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(list.locator("li").last()).toBeInViewport();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(
      bodyPosition,
    );
    await assertPinned();

    await settings
      .getByRole("radio", {
        name: size.width === 390 ? "Koyu" : "Açık",
        exact: true,
      })
      .check();
    await expect(catalog(page)).toHaveAttribute("open", "");
    await expect(workTypes).toHaveAttribute("open", "");
    await assertPinned();

    const value = `YENI-${size.width}`;
    const add = catalog(page).locator('[data-choice-form="add"]');
    await add.locator("input").fill(value);
    await add.getByRole("button", { name: "Ekle", exact: true }).click();
    await expect(row(page, value)).toHaveCount(1);
    await assertPinned();
    expect(await savedRecords(page)).toEqual(original);
  }
});
