import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const source = (id) =>
  record({
    id,
    type: "meeting",
    title: `Toplantı kararı ${id}`,
    status: "in_progress",
    decision: "Karar bağlamı korunmalı.",
  });
const target = (id, sourceId, type = "daily") =>
  record({
    id,
    type,
    title: `${type} yürütme kaydı ${id}`,
    status: type === "daily" ? "in_progress" : "waiting_response",
    sourceFields: { __followupSource: { recordId: sourceId, type: "meeting" } },
  });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const list = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const form = (page) => page.locator("#editor #record-form");
const close = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

async function seed(page, records, theme = "light") {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records, theme }) => {
      if (sessionStorage.getItem("row-action-labels-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable", theme },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("row-action-labels-seeded", "1");
    },
    { key: KEY, records, theme },
  );
  await page.goto("/");
}

test("a meeting with two routes names and opens each exact destination without changing records or clipping its actions", async ({
  page,
}) => {
  await seed(
    page,
    [
      source("dual"),
      target("own-work", "dual"),
      target("external-reply", "dual", "waiting"),
    ],
    "dark",
  );
  const before = await saved(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await list(page, "meeting");
    const routes = row(page, "dual").locator(
      ".meeting-linked-cell .meeting-route",
    );
    await expect(routes).toHaveText(["İşi aç", "Takibi aç"]);
    await expect(
      row(page, "dual").locator(".status-col > .status-trigger"),
    ).toHaveText("Açık");
    await expect(page.locator(".meeting-table > thead th")).toHaveText([
      "Aksiyon / Karar",
      "Durum",
      "Bağlı iş",
      "Takip",
      "İşlem",
    ]);
    await expect(
      row(page, "dual").locator(".priority-col, .date-cell"),
    ).toHaveCount(0);
    await expect(row(page, "dual").locator(".row-end-actions")).toHaveCount(1);
    await expect(
      row(page, "dual").locator(".row-end-actions > button"),
    ).toHaveCount(1);
    await expect(
      row(page, "dual").locator(".row-end-actions .record-edit-trigger"),
    ).toBeVisible();
    for (const control of await routes.all()) {
      const cell = await control.locator("xpath=ancestor::td").boundingBox();
      const bounds = await control.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(cell.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(cell.x + cell.width);
      expect(bounds.height).toBe(30);
      await expect(control).toHaveAttribute("aria-label", /.+/);
      await expect(control).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const [type, id] of [
      ["daily", "own-work"],
      ["waiting", "external-reply"],
    ]) {
      await row(page, "dual")
        .locator(`.meeting-linked-cell[data-route="${type}"] .meeting-route`)
        .click();
      await expect(form(page).locator('[name="id"]')).toHaveValue(id);
      await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
      await close(page);
      await list(page, "meeting");
    }
  }
  expect(await saved(page)).toBe(before);
});

test("unrouted and single-route meetings name their separate creation or open actions and follow-up icons retain a readable tooltip", async ({
  page,
}) => {
  await seed(page, [
    source("unrouted"),
    source("single"),
    target("single-work", "single"),
    record({ id: "topic", type: "waiting", title: "Takip edilecek konu" }),
  ]);
  const before = await saved(page);
  await list(page, "meeting");
  for (const id of ["unrouted", "single"]) {
    const controls = row(page, id).locator(
      ".meeting-linked-cell .meeting-route",
    );
    await expect(controls).toHaveText([
      id === "single" ? "İşi aç" : "İş oluştur",
      "Takip oluştur",
    ]);
    for (const control of await controls.all()) {
      await expect(control).toHaveAttribute("aria-label", /.+/);
      const bounds = await control.boundingBox();
      const cell = await control.locator("xpath=ancestor::td").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(cell.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(cell.x + cell.width);
      expect(bounds.height).toBe(30);
    }
  }
  await row(page, "single")
    .locator('.meeting-linked-cell[data-route="daily"] .meeting-route')
    .click();
  await expect(form(page).locator('[name="id"]')).toHaveValue("single-work");
  await close(page);
  await list(page, "meeting");
  await row(page, "single")
    .locator(
      '.meeting-linked-cell[data-route="waiting"] [data-action="meeting-route"]',
    )
    .click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('select[name="type"]')).toHaveValue(
    "waiting",
  );
  await close(page);
  await list(page, "waiting");
  await expect(
    row(page, "topic").locator(".waiting-followup-trigger"),
  ).toHaveAttribute("title", "Takip ettim");
  expect(await saved(page)).toBe(before);
});
