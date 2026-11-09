import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const editor = (page) => page.locator("#editor");
const panel = (page) => page.locator("#goal-detail-panel");

async function seed(page) {
  const make = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  const records = [
    make({
      id: "dismiss-week",
      type: "weekly",
      title: "Taslağı korunacak ölçümlü hedef",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    make({
      id: "dismiss-peer",
      type: "weekly",
      title: "Doğrudan geçilecek ikinci hedef",
      periodKey: "2026-W45",
      targetValue: 12,
      currentValue: 2,
      metric: "Parça",
    }),
    make({
      id: "dismiss-day",
      title: "Takvimden açılan gerçek günlük iş",
      parentId: "dismiss-week",
      status: "in_progress",
      dueDate: "2026-11-12",
      description: "Gerçek kişisel not.",
      sourceFields: { original: { value: "Ham kayıt korunmalı" } },
    }),
    make({
      id: "dismiss-waiting",
      type: "waiting",
      title: "Gerçek beklenen yanıt",
      expectedFrom: "Dış ekip",
      latestUpdate: "Yanıt istendi.",
      nextFollowUpDate: "2026-11-13",
    }),
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("dialog-light-dismiss-0214-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("dialog-light-dismiss-0214-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return saved(page);
}

async function backdropPoint(page, dialog) {
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  const x = bounds.x >= 24 ? bounds.x - 16 : bounds.x + bounds.width + 16;
  const y = Math.min(viewport.height - 10, bounds.y + 70);
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(viewport.width);
  return { x, y };
}

async function clickPoint(page, point) {
  await page.mouse.click(point.x, point.y);
}

async function clickStaticHeading(page) {
  const heading = await page.locator("#page-title").boundingBox();
  await page.mouse.click(heading.x + 4, heading.y + 4);
}

test("native editor padding, input and an inside-to-backdrop drag keep drafts open while a fresh backdrop click cancels without writing", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  await row(page, "dismiss-day").locator(".task-name").click();
  await expect(editor(page)).toBeVisible();
  const title = editor(page).locator('[name="title"]');
  await title.fill("Kaydedilmeyen mevcut kayıt taslağı");
  const header = await editor(page).locator(".modal-header").boundingBox();
  await page.mouse.click(header.x + 5, header.y + 5);
  await expect(editor(page)).toBeVisible();
  await title.click();
  await expect(title).toBeFocused();
  const outside = await backdropPoint(page, editor(page));
  const input = await title.boundingBox();
  await page.mouse.move(input.x + 25, input.y + input.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 8 });
  await page.mouse.up();
  await expect(editor(page)).toBeVisible();
  await expect(title).toHaveValue("Kaydedilmeyen mevcut kayıt taslağı");
  expect(await saved(page)).toBe(before);
  page.once("dialog", (dialog) => dialog.accept());
  await clickPoint(page, outside);
  await expect(editor(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Günlük işler");
  expect(await saved(page)).toBe(before);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await editor(page).locator('[name="title"]').fill("Kaydedilmeyen yeni kayıt");
  page.once("dialog", (dialog) => dialog.accept());
  await clickPoint(page, await backdropPoint(page, editor(page)));
  await expect(editor(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("a nonmodal goal activates navigation on the first outside click and retains its unsaved measurement while a status popover dismisses first", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
  const current = panel(page).locator("#goal-progress-current");
  await current.fill("7");
  await page.locator('#nav [data-view="yearly"]').click();
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Senelik hedefler");
  expect(await saved(page)).toBe(before);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(current).toHaveValue("7");
  await panel(page)
    .locator('.goal-child-row[data-id="dismiss-day"] .status-trigger')
    .click();
  const status = page.locator("#status-menu");
  await expect(status).toBeVisible();
  await clickStaticHeading(page);
  await expect(status).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(current).toHaveValue("7");
  expect(await saved(page)).toBe(before);
  await clickStaticHeading(page);
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await row(page, "dismiss-week")
    .locator('.task-name[data-action="goal-details"]')
    .click();
  await expect(current).toHaveValue("7");
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  expect(await saved(page)).toBe(before);
});

test("an open goal preview switches directly to another page goal, preserves drafts and accepts Undo while modal editors still dismiss one layer", async ({
  page,
}) => {
  const before = await seed(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.locator('#nav [data-view="weekly"]').click();
  const firstTitle = row(page, "dismiss-week").locator(".task-name");
  const peerTitle = row(page, "dismiss-peer").locator(".task-name");
  const current = panel(page).locator("#goal-progress-current");
  await firstTitle.click();
  await current.fill("7");
  await panel(page).evaluate((element) => {
    window.goalPreviewCloseCount = 0;
    element.addEventListener("close", () => window.goalPreviewCloseCount++);
  });
  await peerTitle.click();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-peer");
  await expect(current).toHaveValue("2");
  await expect(peerTitle).toBeFocused();
  await current.fill("8");
  const firstCell = row(page, "dismiss-week").locator("td").first();
  const cell = await firstCell.boundingBox();
  await page.mouse.click(cell.x + 8, cell.y + cell.height - 8);
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
  await expect(current).toHaveValue("7");
  await expect(row(page, "dismiss-week")).toBeFocused();
  expect(await saved(page)).toBe(before);
  await panel(page)
    .getByRole("button", { name: "Değeri kaydet", exact: true })
    .click();
  await expect(current).toHaveValue("7");
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
  await expect(current).toHaveValue("4");
  expect(await saved(page)).toBe(before);
  await current.fill("7");
  await panel(page)
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  await expect(editor(page)).toBeVisible();
  const peerBounds = await peerTitle.boundingBox();
  const editorBounds = await editor(page).boundingBox();
  const point = {
    x: peerBounds.x + 4,
    y: peerBounds.y + peerBounds.height / 2,
  };
  expect(point.x).toBeLessThan(editorBounds.x);
  await clickPoint(page, point);
  await expect(editor(page)).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
  await expect(current).toHaveValue("7");
  await clickPoint(page, point);
  await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-peer");
  await expect(current).toHaveValue("8");
  expect(await page.evaluate(() => window.goalPreviewCloseCount)).toBe(0);
  await clickStaticHeading(page);
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await expect
    .poll(() => page.evaluate(() => window.goalPreviewCloseCount))
    .toBe(1);
  await firstTitle.click();
  await expect(current).toHaveValue("7");
  expect(await saved(page)).toBe(before);
});

test("a date popover closes before its editor and backdrop cancellation returns only to the still-open selected calendar", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('[data-action="open-calendar"]').click();
  const calendar = page.locator("#dashboard-calendar-dialog");
  await expect(calendar).toBeVisible();
  await calendar
    .locator('.calendar-cell-date[data-calendar-date="2026-11-12"]')
    .click();
  await calendar
    .locator('.calendar-day-agenda [data-calendar-record-id="dismiss-day"]')
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('[name="id"]')).toHaveValue("dismiss-day");
  await expect(calendar).toBeVisible();
  await editor(page)
    .locator('[name="title"]')
    .fill("Takvimden açılan kaydedilmemiş taslak");
  await editor(page)
    .locator('[name="dueDate"]')
    .locator("..")
    .locator(".date-picker-toggle")
    .click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await picker.locator('[data-date-day="2026-11-13"]').click();
  await expect(picker).not.toBeVisible();
  await expect(editor(page).locator('[name="dueDate"]')).toHaveValue(
    "13.11.2026",
  );
  await expect(editor(page)).toBeVisible();
  await expect(calendar).toBeVisible();
  expect(await saved(page)).toBe(before);
  const dateToggle = editor(page)
    .locator('[name="dueDate"]')
    .locator("..")
    .locator(".date-picker-toggle");
  await dateToggle.click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(editor(page)).toBeVisible();
  await expect(calendar).toBeVisible();
  await expect(editor(page).locator('[name="dueDate"]')).toHaveValue(
    "13.11.2026",
  );
  expect(await saved(page)).toBe(before);
  await dateToggle.click();
  await expect(picker).toBeVisible();
  const outside = await backdropPoint(page, editor(page));
  await clickPoint(page, outside);
  await expect(picker).not.toBeVisible();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('[name="title"]')).toHaveValue(
    "Takvimden açılan kaydedilmemiş taslak",
  );
  await expect(calendar).toBeVisible();
  expect(await saved(page)).toBe(before);
  page.once("dialog", (dialog) => dialog.accept());
  await clickPoint(page, outside);
  await expect(editor(page)).not.toBeVisible();
  await expect(calendar).toBeVisible();
  await expect(
    calendar.locator(".calendar-selected-label time"),
  ).toHaveAttribute("datetime", "2026-11-12");
  await expect(
    calendar.locator('.calendar-cell-date[data-calendar-date="2026-11-12"]'),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await saved(page)).toBe(before);
  await clickPoint(page, await backdropPoint(page, calendar));
  await expect(calendar).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("dirty edit and creation forms require discard confirmation while pristine, reverted and saved forms close without it", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "dismiss-week").locator(".task-name").click();
  await panel(page).locator("#goal-progress-current").fill("7");
  await panel(page)
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  const title = editor(page).locator('[name="title"]');
  const originalTitle = await title.inputValue();
  await title.fill("Kaydedilmeyen hedef düzenlemesi");
  const dismissals = [
    () => clickPoint(page, awaitPoint),
    () => page.keyboard.press("Escape"),
    () =>
      editor(page)
        .getByRole("button", { name: "Pencereyi kapat", exact: true })
        .click(),
    () =>
      editor(page).getByRole("button", { name: "Vazgeç", exact: true }).click(),
  ];
  const awaitPoint = await backdropPoint(page, editor(page));
  for (const dismiss of dismissals) {
    const confirmation = page.waitForEvent("dialog");
    const action = dismiss();
    const dialog = await confirmation;
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("Kaydedilmemiş değişiklikler");
    await dialog.dismiss();
    await action;
    await expect(editor(page)).toBeVisible();
    await expect(title).toHaveValue("Kaydedilmeyen hedef düzenlemesi");
    await expect(panel(page)).toHaveAttribute("data-goal-id", "dismiss-week");
    await expect(panel(page).locator("#goal-progress-current")).toHaveValue(
      "7",
    );
    expect(await saved(page)).toBe(before);
  }
  page.once("dialog", (dialog) => dialog.accept());
  await clickPoint(page, awaitPoint);
  await expect(editor(page)).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  expect(await saved(page)).toBe(before);

  const unexpectedDialogs = [];
  const rejectUnexpected = async (dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.dismiss();
  };
  page.on("dialog", rejectUnexpected);
  for (const revert of [false, true]) {
    await panel(page)
      .getByRole("button", { name: "Hedefi düzenle", exact: true })
      .click();
    if (revert) {
      await title.fill("Geçici değişiklik");
      await title.fill(originalTitle);
    }
    await page.keyboard.press("Escape");
    await expect(editor(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  }
  await panel(page)
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  await title.fill("Kaydedilen hedef düzenlemesi");
  await editor(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(editor(page)).not.toBeVisible();
  await expect(panel(page).locator(".goal-panel-title")).toHaveText(
    "Kaydedilen hedef düzenlemesi",
  );
  expect(
    JSON.parse(await saved(page)).records.find(
      (record) => record.id === "dismiss-week",
    ).title,
  ).toBe("Kaydedilen hedef düzenlemesi");
  expect(unexpectedDialogs).toEqual([]);
  page.off("dialog", rejectUnexpected);
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await page.locator('#nav [data-view="daily"]').click();
  const afterSave = await saved(page);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await title.fill("Kaydedilmeyen yeni iş taslağı");
  await editor(page).locator('[name="type"]').selectOption("waiting");
  await editor(page).locator('[name="type"]').selectOption("daily");
  await expect(title).toHaveValue("Kaydedilmeyen yeni iş taslağı");
  const confirmation = page.waitForEvent("dialog");
  const dismissal = clickPoint(page, await backdropPoint(page, editor(page)));
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  await dialog.dismiss();
  await dismissal;
  await expect(title).toHaveValue("Kaydedilmeyen yeni iş taslağı");
  expect(await saved(page)).toBe(afterSave);
  page.once("dialog", (next) => next.accept());
  await editor(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(editor(page)).not.toBeVisible();
  expect(await saved(page)).toBe(afterSave);

  page.on("dialog", rejectUnexpected);
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await editor(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(editor(page)).not.toBeVisible();
  expect(unexpectedDialogs).toEqual([]);
  expect(await saved(page)).toBe(afterSave);
});
