import { test, expect } from "@playwright/test";
import { selectListStatus } from "./list-scope-helper.js";
import { readFile } from "node:fs/promises";
import { createRecord, validateStore } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";
import {
  firstAttentionPage,
  nextAttention,
  readAttentionCards,
} from "./attention-support.js";
import { appConfirms } from "./app-confirm-support.js";
import { showAgenda } from "./widget-support.js";

const RECORDS_KEY = "is-takip-v1";
const PREFERENCES_KEY = `${RECORDS_KEY}-preferences`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("is-takip-v1")) {
      localStorage.setItem(
        "is-takip-v1",
        JSON.stringify({ version: 1, records: [] }),
      );
    }
  });
});

async function readRecords(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).records,
    RECORDS_KEY,
  );
}

async function seedRecords(page, records) {
  await page.goto("/");
  await page.evaluate(
    ({ key, records }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, records }));
    },
    { key: RECORDS_KEY, records },
  );
  await page.reload();
}

async function addRecord(
  page,
  {
    title,
    type = "daily",
    parentId,
    dueDate,
    status = "planned",
    priority = "normal",
  },
) {
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  const form = page.locator("#record-form");
  await form.locator("[name=title]").fill(title);
  await form.locator("[name=type]").selectOption(type);
  await openCreationExtras(page);
  await form.locator("[name=status]").selectOption(status);
  await form.locator("[name=priority]").selectOption(priority);
  if (dueDate) await form.locator("[name=dueDate]").fill(dueDate);
  if (parentId) {
    const parentOption = form
      .locator('[name="parentId"] option')
      .filter({ hasText: parentId });
    await expect(parentOption).toHaveCount(1);
    await form
      .locator("[name=parentId]")
      .selectOption(await parentOption.getAttribute("value"));
  }
  await form.getByRole("button", { name: "Kaydı ekle", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    (await readRecords(page)).some((record) => record.title === title),
  ).toBe(true);
}

async function chooseStatus(page, trigger, status) {
  if (status === "completed") {
    const id = await trigger.getAttribute("data-id");
    await page
      .locator(`.quick-complete[data-id="${id}"]:visible`)
      .first()
      .click();
    await expect(page.locator("#status-menu")).not.toBeVisible();
    await expect(page.locator("#editor")).not.toBeVisible();
    return;
  }
  await trigger.click();
  const menu = page.locator("#status-menu");
  await expect(menu).toBeVisible();
  await menu
    .locator(`[data-action="set-status"][data-status="${status}"]`)
    .click();
  await expect(menu).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function expandWeekly(page, id = null) {
  await closeGoalPanel(page);
  const row = id
    ? page.locator(`.weekly-goal-row[data-id="${id}"]`)
    : page.locator(".weekly-goal-row").first();
  await row.locator('[data-action="goal-details"]').click();
  await expect(page.locator("#goal-detail-panel")).toBeVisible();
}

async function closeGoalPanel(page) {
  if (await page.locator("#goal-detail-panel").isVisible()) {
    await page.keyboard.press("Escape");
    await expect(page.locator("#goal-detail-panel")).not.toBeVisible();
  }
}

async function openSettings(page) {
  await closeGoalPanel(page);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
}

async function openBackupSettings(page) {
  await openSettings(page);
  const backup = page.locator("#settings-dialog .settings-backup");
  if (!(await backup.evaluate((element) => element.open)))
    await backup.locator(":scope > summary").click();
}

async function openWorkspaceReset(page) {
  await page
    .locator('#settings-dialog [data-action="reset-workspace"]')
    .click();
  const confirmation = page.locator("#workspace-reset-dialog");
  await expect(confirmation).toBeVisible();
  return confirmation;
}

function linkedRecords() {
  const weekly = createRecord({
    id: "weekly-plan",
    type: "weekly",
    title: "Haftalık rapor",
    periodKey: "2026-W45",
    status: "in_progress",
    targetValue: 2,
    currentValue: 1,
    metric: "Rapor",
  });
  const daily = createRecord({
    id: "daily-task",
    title: "Verileri kontrol et",
    parentId: weekly.id,
    sourceDate: "2026-11-06",
    dueDate: "2026-11-07",
    status: "partially_completed",
    priority: "high",
    nextAction: "Raporu paylaş",
    category: "Dokümantasyon",
    workType: "Rutin iş",
    waitingReason: "Tasarım yanıtı bekleniyor",
    description: "İlk kontrol",
    sourceFields: {
      "İş / Görev": "Verileri kontrol et",
      "İlgili Haftalık Hedef": "Haftalık rapor",
    },
  });
  return [weekly, daily];
}

test("creates, edits, completes, persists and safely unlinks daily work from weekly goals", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Genel bakış", exact: true, level: 1 }),
  ).toBeVisible();
  await addRecord(page, { title: "Haftalık sunum", type: "weekly" });
  const weekly = (await readRecords(page)).find(
    (record) => record.title === "Haftalık sunum",
  );
  await addRecord(page, {
    title: "Teklif hazırla",
    parentId: "Haftalık sunum",
    priority: "high",
    dueDate: "2026-01-01",
  });
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".weekly-goal-row .metric-cell")).toContainText(
    "%0",
  );
  await expandWeekly(page);
  await expect(
    page.locator("#goal-detail-panel .goal-child-list"),
  ).toContainText("Teklif hazırla");
  await chooseStatus(
    page,
    page
      .getByRole("button", {
        name: "Teklif hazırla: durumu değiştir",
        exact: true,
      })
      .first(),
    "completed",
  );
  await expect(page.locator(".weekly-goal-row .metric-cell")).toContainText(
    "%100",
  );
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await selectListStatus(page, "all");
  await expect(page.locator("tbody")).toContainText("Tamamlandı");
  await page
    .getByRole("button", { name: "Teklif hazırla", exact: true })
    .click();
  await page.locator("#record-form [name=title]").fill("Son teklif");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.locator("tbody")).toContainText("Son teklif");
  await page.locator('#nav [data-view="weekly"]').click();
  await page
    .getByRole("button", { name: "Haftalık sunum", exact: true })
    .click();
  const weeklyPreview = page.locator("#goal-detail-panel");
  await expect(weeklyPreview).toBeVisible();
  await expect(weeklyPreview).toHaveAttribute("data-goal-id", weekly.id);
  await weeklyPreview
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(weekly.id);
  await expect(page.locator('#record-form select[name="type"]')).toHaveValue(
    "weekly",
  );
  appConfirms(page).once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kaydı sil", exact: true }).click();
  await page.locator('#nav [data-view="daily"]').click();
  await selectListStatus(page, "all");
  await expect(page.locator("tbody")).toContainText("Son teklif");
  await expect(page.locator("tbody")).not.toContainText("Haftalık sunum");
  const saved = await readRecords(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].parentId).toBeNull();
  expect(errors).toEqual([]);
});

test("daily-use views contain no Excel controls or one-time migration banners", async ({
  page,
}) => {
  await page.goto("/");
  const views = [
    "dashboard",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ];
  for (const view of views) {
    await page.locator(`#nav [data-view="${view}"]`).click();
    await expect(page.locator("#content")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Excel’den aktar|Excel listemi aktar|Dışa aktar|Excel’e aktar/,
      }),
    ).toHaveCount(0);
    await expect(
      page.locator("#import-dialog, .migration-banner, #excel-file"),
    ).toHaveCount(0);
    await expect(page.locator("#content")).not.toContainText("Excel");
  }
  await openSettings(page);
  await expect(page.locator("#settings-dialog")).not.toContainText("Excel");
  expect(await readRecords(page)).toEqual([]);
});

test("existing migrated records keep measurements, periods, original fields and links after editing", async ({
  page,
}, testInfo) => {
  const records = linkedRecords();
  const monthly = createRecord({
    id: "monthly-goal",
    type: "monthly",
    title: "Rapor sürecini iyileştir",
    periodKey: "2026-11",
    status: "in_progress",
    targetValue: 10,
    currentValue: 7,
    metric: "Rapor",
  });
  await seedRecords(page, [...records, monthly]);
  await page.locator('#nav [data-view="monthly"]').click();
  await expect(page.locator(".metric-cell")).toContainText("%70");
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".weekly-goal-row .metric-cell")).toContainText(
    "%50",
  );
  await expandWeekly(page, "weekly-plan");
  await expect(page.locator("#goal-detail-panel .goal-child-row")).toHaveCount(
    1,
  );
  await closeGoalPanel(page);
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .getByRole("button", { name: "Verileri kontrol et", exact: true })
    .click();
  const form = page.locator("#record-form");
  await expect(form.locator("[name=nextAction]")).toHaveValue("Raporu paylaş");
  await expect(form.locator("[name=category]")).toHaveCount(0);
  await expect(form.locator("[name=workType]")).toHaveValue("Rutin iş");
  await expect(form.locator("[name=blocked]")).toHaveCount(0);
  await expect(form.locator("[name=waitingReason]")).toHaveValue(
    "Tasarım yanıtı bekleniyor",
  );
  await expect(form.locator("[name=parentId] option:checked")).toContainText(
    "2026-W45",
  );
  await openCreationExtras(page);
  await form.locator("[name=description]").fill("Güncel not");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await page.reload();
  const saved = await readRecords(page);
  expect(saved).toHaveLength(3);
  const item = saved.find((record) => record.id === "daily-task");
  expect(item.description).toBe("Güncel not");
  expect(item.nextAction).toBe("Raporu paylaş");
  expect(item.category).toBe("Dokümantasyon");
  expect(item.workType).toBe("Rutin iş");
  expect(item.waitingReason).toBe("Tasarım yanıtı bekleniyor");
  expect(item.sourceDate).toBe("2026-11-06");
  expect(item.parentId).toBe("weekly-plan");
  expect(item.sourceFields).toEqual(records[1].sourceFields);
  expect(saved.find((record) => record.id === "monthly-goal")).toEqual(monthly);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-desktop.png"),
    fullPage: true,
  });
});

test("filters by status and priority, handles literal HTML safely, and supports mobile navigation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await addRecord(page, {
    title: "<img src=x onerror=alert(1)>",
    priority: "urgent",
    status: "waiting",
  });
  await addRecord(page, { title: "Normal görev" });
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await page.locator('#nav [data-view="daily"]').click();
  await selectListStatus(page, "waiting");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("tbody img")).toHaveCount(0);
  await page.locator("#priority-filter").selectOption("low");
  await expect(
    page.getByRole("heading", { name: "Aramana uygun kayıt yok" }),
  ).toBeVisible();
  await page.locator("#priority-filter").selectOption("all");
  await page.getByRole("searchbox").fill("Normal");
  await expect(
    page.getByRole("heading", { name: "Aramana uygun kayıt yok" }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("daily-mobile.png"),
    fullPage: true,
  });
});

test("compact header and all sidebar links remain accessible while only the main page scrolls", async ({
  page,
}, testInfo) => {
  const records = Array.from({ length: 40 }, (_, index) =>
    createRecord({
      id: `layout-task-${index}`,
      title: `Örnek görev ${String(index + 1).padStart(2, "0")}`,
      description: "Yerleşim ve kaydırma kontrolü için örnek kayıt.",
    }),
  );
  await seedRecords(page, records);
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 600 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ];
  const settleScroll = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        }),
    );

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".topbar h1#page-title")).toHaveText(
      "Genel bakış",
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".topbar #page-subtitle")).toHaveCount(0);
    await expect(page.locator(".topbar .new-record")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Yeni kayıt", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(
        ".heading, .breadcrumb, .sidebar-bottom, .sidebar-footer, .storage-note",
      ),
    ).toHaveCount(0);

    await expect(page.locator(".stats, .stat")).toHaveCount(0);
    // Fresh daily work has no optional planning suggestions to display.
    await expect(page.locator(".planning-prompts")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `dashboard-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: false,
    });

    if (viewport.width >= 1100 && viewport.height >= 640) {
      const focusList = page.locator(".focus-list");
      const lastTitle = focusList.locator(".focus-title").last();
      expect(
        await focusList.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      await lastTitle.scrollIntoViewIfNeeded();
      await expect(lastTitle).toBeInViewport({ ratio: 1 });
      expect(
        await focusList.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => window.scrollY + document.querySelector(".main").scrollTop,
        ),
      ).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
    }

    if (viewport.width === 390) {
      await openBackupSettings(page);
      await expect(page.locator(".settings-content")).toBeVisible();
      await expect(page.locator(".settings-backup-body")).toBeVisible();
      await expect(page.locator("#list-density")).toHaveCount(0);
      await expect(
        page.getByRole("radio", { name: "Açık", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "Koyu", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "Sistem", exact: true }),
      ).toBeVisible();
      for (const catalog of await page
        .locator("#settings-dialog [data-choice-catalog]")
        .all()) {
        if (!(await catalog.evaluate((element) => element.open)))
          await catalog.locator(":scope > summary").click();
      }
      const dialog = page.locator("#settings-dialog");
      const body = dialog.locator(".modal-body");
      const bodyOverflows = await body.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      );
      const header = dialog.locator(".modal-header");
      const footer = dialog.locator(".modal-footer");
      const headerBox = await header.boundingBox();
      const footerBox = await footer.boundingBox();
      const dialogScroll = await dialog.evaluate(
        (element) => element.scrollTop,
      );
      const windowScroll = await page.evaluate(() => window.scrollY);
      for (const name of [
        "Kayıt yedeğini indir",
        "Kayıt yedeğini geri yükle",
        "Çalışma alanını sıfırla",
        "Tamam",
      ]) {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toBeVisible();
        if (
          await button.evaluate((element) =>
            Boolean(element.closest(".modal-body")),
          )
        )
          await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1 });
        await expect(header).toBeInViewport({ ratio: 1 });
        await expect(footer).toBeInViewport({ ratio: 1 });
        expect(await header.boundingBox()).toEqual(headerBox);
        expect(await footer.boundingBox()).toEqual(footerBox);
      }
      const bodyScroll = await body.evaluate((element) => element.scrollTop);
      if (bodyOverflows) expect(bodyScroll).toBeGreaterThan(0);
      else expect(bodyScroll).toBe(0);
      expect(await dialog.evaluate((element) => element.scrollTop)).toBe(
        dialogScroll,
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(windowScroll);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("settings-mobile-backup-open.png"),
        fullPage: false,
      });
      await page.getByRole("button", { name: "Tamam", exact: true }).click();
    }
    if (viewport.width <= 760) {
      await page
        .getByRole("button", { name: "Menüyü aç", exact: true })
        .click();
    }
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeInViewport({ ratio: 1 });
    const links = page.locator("#nav button[data-view]");
    await expect(links).toHaveCount(7);
    for (const link of await links.all()) await expect(link).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    const firstBox = await links.first().boundingBox();
    const lastBox = await links.last().boundingBox();
    expect(firstBox.y).toBeGreaterThanOrEqual(sidebarBox.y);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
      sidebarBox.y + sidebarBox.height + 1,
    );
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(viewport.height + 1);

    await page.locator('#nav [data-view="daily"]').click();
    await expect(page.locator(".topbar h1#page-title")).toHaveText(
      "Günlük işler",
    );
    await expect(page.locator("#content .panel-header")).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(40);
    if (viewport.width <= 760) {
      await page
        .getByRole("button", { name: "Menüyü aç", exact: true })
        .click();
      await expect(sidebar).toBeInViewport({ ratio: 1 });
    }
    const visibleSidebar = await sidebar.boundingBox();
    const windowScrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(
      visibleSidebar.x + visibleSidebar.width / 2,
      visibleSidebar.y + visibleSidebar.height / 2,
    );
    await page.mouse.wheel(0, 650);
    await settleScroll();
    expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(windowScrollBefore);

    // Navigating closes the mobile drawer and puts the main list back at the top.
    await page.locator('#nav [data-view="daily"]').click();
    await page.mouse.move(viewport.width - 60, viewport.height - 65);
    await page.mouse.wheel(0, 650);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.scrollY + document.querySelector(".main").scrollTop,
        ),
      )
      .toBeGreaterThan(0);
    expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await readRecords(page)).toEqual(records);
  }
});

test("fixed identity ignores legacy names while theme auto-saves and preserves legacy density and records", async ({
  page,
}) => {
  const records = linkedRecords();
  await seedRecords(page, records);
  await page.evaluate(
    ({ key, storeKey, records }) => {
      localStorage.setItem(storeKey, JSON.stringify({ version: 1, records }));
      localStorage.setItem(
        key,
        JSON.stringify({
          appName: "<img src=x onerror=alert(1)>",
          workspaceName: "Eski çalışma alanı",
          displayName: "Eski profil",
          density: "compact",
        }),
      );
    },
    { key: PREFERENCES_KEY, storeKey: RECORDS_KEY, records },
  );
  await page.reload();
  await expect(page.locator("#brand-name")).toHaveText("ODAK");
  await expect(page.locator(".workspace-caption")).toHaveCount(0);
  await expect(page).toHaveTitle(/Odak$/);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(
    page.locator(
      ".workspace, .avatar, .profile, #user-initial, #profile-initial",
    ),
  ).toHaveCount(0);
  await expect(page.locator("#brand-name img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ayarlar", exact: true }),
  ).toHaveCount(1);
  expect(await readRecords(page)).toEqual(records);
  await page.locator('#nav [data-view="daily"]').click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await openSettings(page);
  await expect(
    page
      .locator("#settings-dialog")
      .getByRole("heading", { name: "Ayarlar", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      "#settings-form, #settings-dialog [name=appName], #settings-dialog [name=workspaceName], #settings-dialog [name=displayName]",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ayarları kaydet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Vazgeç", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#list-density")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Koyu", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  const prefs = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(prefs).toEqual({ density: "compact", theme: "dark" });
  expect(await readRecords(page)).toEqual(records);
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#brand-name")).toHaveText("ODAK");
  await expect(page.locator(".workspace-caption")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await readRecords(page)).toEqual(records);
});

test("native record backup restores all fields and weekly links after an explicit replacement confirmation", async ({
  page,
}) => {
  const records = linkedRecords();
  await seedRecords(page, records);
  await openBackupSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(validateStore(backup).records).toEqual(records);
  await page.locator('#settings-dialog [data-action="close"]').first().click();
  await addRecord(page, { title: "Yedekten sonra eklenen kayıt" });
  expect(await readRecords(page)).toHaveLength(3);
  await openBackupSettings(page);
  let confirmationMessage = "";
  appConfirms(page).once("dialog", async (dialog) => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page
      .getByRole("button", { name: "Kayıt yedeğini geri yükle", exact: true })
      .click(),
  ]);
  await chooser.setFiles({
    name: "kayit-yedegi.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect.poll(async () => (await readRecords(page)).length).toBe(2);
  expect(confirmationMessage).toMatch(/2 kayıt/);
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
});

test("invalid native backups show an error without changing records or requesting replacement", async ({
  page,
}) => {
  const records = linkedRecords();
  await seedRecords(page, records);
  await openBackupSettings(page);
  let confirmations = 0;
  appConfirms(page).on("dialog", async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  await page.locator("#restore-file").setInputFiles({
    name: "bozuk.json",
    mimeType: "application/json",
    buffer: Buffer.from("invalid JSON"),
  });
  await expect(page.locator("#settings-backup-error")).toBeVisible();
  await expect(page.locator("#settings-backup-error")).not.toBeEmpty();
  expect(await readRecords(page)).toEqual(records);
  await page.locator("#restore-file").setInputFiles({
    name: "gecersiz.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, records: [{ title: "Eksik kimlik" }] }),
    ),
  });
  await expect(page.locator("#settings-backup-error")).not.toBeEmpty();
  expect(await readRecords(page)).toEqual(records);
  expect(confirmations).toBe(0);
});

test("workspace reset respects cancellation, keeps an empty saved store, and restores the downloaded backup losslessly", async ({
  page,
}) => {
  const records = linkedRecords();
  await seedRecords(page, records);
  await openSettings(page);
  await page.getByRole("radio", { name: "Koyu", exact: true }).check();
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await selectListStatus(page, "in_progress");
  await page.locator("#priority-filter").selectOption("high");
  await page.getByRole("searchbox").fill("Verileri");
  await openBackupSettings(page);
  const resetButton = page.getByRole("button", {
    name: "Çalışma alanını sıfırla",
    exact: true,
  });
  await expect(page.locator(".settings-reset")).toBeVisible();
  await expect(resetButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const downloadedBytes = await readFile(await download.path());
  const backup = JSON.parse(downloadedBytes.toString("utf8"));
  expect(validateStore(backup).records).toEqual(records);

  const cancelledReset = await openWorkspaceReset(page);
  await expect(
    cancelledReset.locator("#workspace-reset-description"),
  ).toContainText("2 kayıt");
  await cancelledReset
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(cancelledReset).not.toBeVisible();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  expect(await readRecords(page)).toEqual(records);
  await expect(page.getByRole("searchbox")).toHaveValue("Verileri");
  await expect(page.locator("#status-filter")).toHaveValue("in_progress");
  await expect(page.locator("#priority-filter")).toHaveValue("high");

  const acceptedReset = await openWorkspaceReset(page);
  await expect(
    acceptedReset.locator("#workspace-reset-description"),
  ).toContainText("2 kayıt");
  await acceptedReset
    .locator('[data-action="confirm-reset-workspace"]')
    .click();
  await expect(acceptedReset).not.toBeVisible();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Genel bakış");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  const savedAfterReset = await page.evaluate(
    (key) => localStorage.getItem(key),
    RECORDS_KEY,
  );
  // An explicit empty store prevents startup migration data from returning after reload.
  expect(savedAfterReset).not.toBeNull();
  const emptySavedStore = JSON.parse(savedAfterReset);
  expect(emptySavedStore.version).toBe(1);
  expect(emptySavedStore.records).toEqual([]);
  expect(emptySavedStore.odak).toMatchObject({
    version: 1,
    preferences: { density: "comfortable", theme: "dark" },
  });
  expect(Array.isArray(emptySavedStore.odak.history)).toBe(true);
  expect(emptySavedStore.odak.history.length).toBeGreaterThan(0);
  await page.reload();
  expect(await readRecords(page)).toEqual([]);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      PREFERENCES_KEY,
    ),
  ).toEqual({ density: "comfortable", theme: "dark" });
  await openBackupSettings(page);
  await expect(
    page.getByRole("button", { name: "Çalışma alanını sıfırla", exact: true }),
  ).toBeDisabled();

  let restoreMessage = "";
  appConfirms(page).once("dialog", async (dialog) => {
    restoreMessage = dialog.message();
    await dialog.accept();
  });
  await page.locator("#restore-file").setInputFiles({
    name: "sifirlamadan-once.json",
    mimeType: "application/json",
    buffer: downloadedBytes,
  });
  await expect.poll(async () => (await readRecords(page)).length).toBe(2);
  expect(restoreMessage).toContain("2 kayıt");
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.locator('#nav [data-view="daily"]').click();
  await expect(page.locator("#status-filter")).toHaveValue("all");
  await expect(
    page.locator('[data-action="list-scope"][data-scope="open"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#priority-filter")).toHaveValue("all");
  await expect(page.locator("#period-filter")).toHaveValue("all");
  await expect(page.locator("tbody")).toContainText("Verileri kontrol et");
  await page.locator('#nav [data-view="weekly"]').click();
  await expandWeekly(page, "weekly-plan");
  await expect(page.locator("#goal-detail-panel .goal-child-row")).toHaveCount(
    1,
  );
  await openBackupSettings(page);
  const [secondDownload] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const secondBackup = JSON.parse(
    await readFile(await secondDownload.path(), "utf8"),
  );
  expect(secondBackup).toEqual(backup);
});

test("dashboard exposes active daily work with fixed order, filters, scrolling and ordered follow-ups", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  const make = (input) =>
    createRecord({
      createdAt: "2026-11-01T08:00:00Z",
      updatedAt: "2026-11-01T08:00:00Z",
      ...input,
    });
  const weekly = make({
    id: "focus-weekly",
    type: "weekly",
    title: "Haftalık hedef örneği",
    dueDate: "2026-11-06",
  });
  const activeDaily = [
    make({
      id: "urgent-late",
      title: "Acil geciken iş",
      priority: "urgent",
      dueDate: "2026-11-04",
      status: "in_progress",
      parentId: weekly.id,
      updatedAt: "2026-11-01T08:00:00Z",
    }),
    make({
      id: "high-today",
      title: "Yüksek öncelikli bugünkü iş",
      priority: "high",
      dueDate: "2026-11-06",
      updatedAt: "2026-11-02T08:00:00Z",
    }),
    make({
      id: "high-late",
      title: "Yüksek öncelikli geciken iş",
      priority: "high",
      dueDate: "2026-11-05",
      status: "waiting",
      updatedAt: "2026-11-03T08:00:00Z",
    }),
    make({
      id: "high-none",
      title: "Yüksek öncelikli tarihsiz iş",
      priority: "high",
      status: "partially_completed",
      updatedAt: "2026-11-04T08:00:00Z",
    }),
    make({
      id: "normal-late",
      title: "Normal öncelikli geciken iş",
      dueDate: "2026-11-03",
      status: "in_progress",
      updatedAt: "2026-11-05T08:00:00Z",
    }),
    make({
      id: "normal-today",
      title: "Normal öncelikli bugünkü iş",
      dueDate: "2026-11-06",
      updatedAt: "2026-11-06T08:00:00Z",
    }),
    make({
      id: "normal-future",
      title: "Normal öncelikli sonraki iş",
      dueDate: "2026-11-09",
      status: "waiting_response",
      updatedAt: "2026-11-07T08:00:00Z",
    }),
    make({
      id: "low-today",
      title: "Düşük öncelikli bugünkü iş",
      priority: "low",
      dueDate: "2026-11-06",
      status: "follow_up",
      updatedAt: "2026-11-08T08:00:00Z",
    }),
    make({
      id: "low-none",
      title: "Düşük öncelikli tarihsiz iş",
      priority: "low",
      updatedAt: "2026-11-09T08:00:00Z",
    }),
  ];
  const closedDaily = [
    make({
      id: "daily-done",
      title: "Tamamlanan günlük iş",
      status: "completed",
      priority: "urgent",
      dueDate: "2026-11-06",
    }),
    make({
      id: "daily-cancelled",
      title: "İptal edilen günlük iş",
      status: "cancelled",
      priority: "urgent",
      dueDate: "2026-11-06",
    }),
    make({
      id: "daily-transferred",
      title: "Aktarılan günlük iş",
      status: "transferred",
      priority: "urgent",
      dueDate: "2026-11-02",
    }),
  ];
  const meetings = [
    make({
      id: "meeting-old",
      type: "meeting",
      title: "Önce teslim edilecek aksiyon",
      dueDate: "2026-11-01",
    }),
    make({
      id: "meeting-today",
      type: "meeting",
      title: "Bugün teslim edilecek aksiyon",
      dueDate: "2026-11-06",
    }),
    make({
      id: "meeting-none-a",
      type: "meeting",
      title: "Tarihsiz aksiyon A",
    }),
    make({
      id: "meeting-none-b",
      type: "meeting",
      title: "Tarihsiz aksiyon B",
    }),
    make({
      id: "meeting-near",
      type: "meeting",
      title: "Üç gün içinde teslim edilecek aksiyon",
      dueDate: "2026-11-09",
    }),
    make({
      id: "meeting-beyond",
      type: "meeting",
      title: "Dört gün sonraki aksiyon",
      dueDate: "2026-11-10",
    }),
    make({
      id: "meeting-done",
      type: "meeting",
      title: "Tamamlanan toplantı aksiyonu",
      status: "completed",
      dueDate: "2026-10-01",
    }),
  ];
  const waiting = [
    make({
      id: "waiting-old",
      type: "waiting",
      title: "Uzun süredir takip edilmeyen konu",
      status: "waiting_response",
      lastFollowUpDate: "2026-10-01",
      nextFollowUpDate: "2026-11-03",
      dueDate: "2026-12-01",
    }),
    make({
      id: "waiting-today",
      type: "waiting",
      title: "Bugün takip edilen konu",
      status: "follow_up",
      lastFollowUpDate: "2026-11-06",
      nextFollowUpDate: "2026-11-06",
      dueDate: "2026-10-01",
    }),
    make({
      id: "waiting-none-a",
      type: "waiting",
      title: "Takip tarihi olmayan konu A",
      status: "waiting",
    }),
    make({
      id: "waiting-none-b",
      type: "waiting",
      title: "Takip tarihi olmayan konu B",
      status: "waiting",
    }),
    make({
      id: "waiting-near",
      type: "waiting",
      title: "Üç gün içinde takip edilecek konu",
      nextFollowUpDate: "2026-11-09",
    }),
    make({
      id: "waiting-beyond",
      type: "waiting",
      title: "Dört gün sonraki takip konusu",
      nextFollowUpDate: "2026-11-10",
    }),
    make({
      id: "waiting-done",
      type: "waiting",
      title: "Kapanan bekleyen konu",
      status: "completed",
      lastFollowUpDate: "2026-09-01",
    }),
    make({
      id: "waiting-earliest",
      type: "waiting",
      title: "Önce sorulacak teknik yanıt",
      nextFollowUpDate: "2026-11-01",
      expectedFrom: "Test ekibi",
      latestUpdate: "Değerlendirme sürüyor.",
    }),
    make({
      id: "waiting-confirm-today",
      type: "waiting",
      title: "Bugün teyit edilecek teknik yanıt",
      nextFollowUpDate: "2026-11-06",
      expectedFrom: "Test ekibi",
      latestUpdate: "Değerlendirme sürüyor.",
    }),
    make({
      id: "waiting-confirm-near",
      type: "waiting",
      title: "Üç gün içinde teyit edilecek teknik yanıt",
      nextFollowUpDate: "2026-11-09",
      expectedFrom: "Test ekibi",
      latestUpdate: "Değerlendirme sürüyor.",
    }),
  ];
  const records = [
    weekly,
    ...activeDaily,
    ...closedDaily,
    ...meetings,
    ...waiting,
    make({
      id: "focus-monthly",
      type: "monthly",
      title: "Aylık hedef örneği",
      priority: "urgent",
      dueDate: "2026-11-06",
    }),
    make({
      id: "focus-yearly",
      type: "yearly",
      title: "Senelik hedef örneği",
      priority: "urgent",
      dueDate: "2026-11-01",
    }),
  ];
  await seedRecords(page, records);
  const ids = () =>
    page
      .locator(".focus-list > .focus-row")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id));
  const planningPrompts = () =>
    page.locator(".planning-prompt").evaluateAll((buttons) =>
      buttons.map((button) => ({
        kind: button.dataset.prompt,
        count: Number(
          button.querySelector(".planning-prompt-count").textContent,
        ),
      })),
    );
  await expect(
    page
      .locator(".focus-panel")
      .getByRole("heading", { name: "Güncel işler", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".focus-sort-note")).toHaveCount(0);
  await expect(page.locator("#focus-sort")).toHaveCount(0);
  await expect(
    page.locator(
      ".week-panel, .week-days, .focus-card, .bottom-grid, .dashboard-grid",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".stats, .stat")).toHaveCount(0);
  expect(await planningPrompts()).toEqual([{ kind: "waiting", count: 7 }]);
  expect(
    await page.locator(".focus-filters [data-filter]").evaluateAll((buttons) =>
      buttons.map((button) => ({
        filter: button.dataset.filter,
        count: button.querySelector("span").textContent,
      })),
    ),
  ).toEqual([
    { filter: "open", count: "9" },
    { filter: "today", count: "3" },
    { filter: "overdue", count: "3" },
    { filter: "focus", count: "0/3" },
  ]);
  expect(await ids()).toEqual([
    "urgent-late",
    "high-late",
    "normal-late",
    "high-today",
    "normal-today",
    "low-today",
    "normal-future",
    "high-none",
    "low-none",
  ]);
  await expect(page.locator(".focus-more")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("focused-dashboard-desktop.png"),
    fullPage: false,
  });

  const weeklyPanel = page.locator(".weekly-dashboard-panel");
  const attentionPanel = page.locator(".attention-panel");
  const notesPanel = page.locator(".dashboard-notes-panel");
  const expectAttentionPageSize = async (total) => {
    const workspace = page.locator(".dashboard-workspace");
    await expect(workspace).toHaveAttribute("data-card-columns", "2");
    const columns = page.viewportSize().width > 760 ? 2 : 1;
    expect(
      await attentionPanel
        .locator(".attention-list")
        .evaluate(
          (list) =>
            getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/)
              .length,
        ),
    ).toBe(columns);
    await expect(attentionPanel.locator(".attention-list > li")).toHaveCount(
      Math.min(2, total),
    );
  };
  await expect(notesPanel).toBeVisible();
  await expect(page.locator(".dashboard-bottom-row > .panel")).toHaveCount(3);
  await expect(weeklyPanel.locator(".dashboard-goal-row")).toHaveCount(1);
  await expect(weeklyPanel.locator(".dashboard-goal-title")).toHaveText(
    weekly.title,
  );
  await expect(weeklyPanel.locator('[role="progressbar"]')).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expectAttentionPageSize(6);
  expect((await readAttentionCards(page)).map((card) => card.id)).toEqual([
    "waiting-earliest",
    "waiting-old",
    "waiting-today",
    "waiting-confirm-today",
    "waiting-near",
    "waiting-confirm-near",
  ]);
  await expect(
    attentionPanel.locator('.attention-list > li[data-id^="meeting-"]'),
  ).toHaveCount(0);
  await expect(attentionPanel.locator(".followup-header h2 > span")).toHaveText(
    "6",
  );
  await expect(
    attentionPanel.locator(
      '.attention-list > li[data-id*="none"], .attention-list > li[data-id*="beyond"]',
    ),
  ).toHaveCount(0);
  expect(
    await attentionPanel
      .locator(".attention-list")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await expect(
    page.locator('[data-overview="meeting"], [data-overview="waiting"]'),
  ).toHaveCount(0);
  const beforeGoalPreview = await readRecords(page);
  await weeklyPanel.locator('[data-action="goal-progress-open"]').click();
  await expect(page.locator("#goal-detail-panel")).toBeVisible();
  await expect(
    page.locator('#goal-detail-panel [data-goal-section="progress"]'),
  ).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await page
    .locator('#goal-detail-panel [data-action="goal-panel-close"]')
    .last()
    .click();
  expect(await readRecords(page)).toEqual(beforeGoalPreview);

  await page.locator('.focus-filters [data-filter="today"]').click();
  expect(await ids()).toEqual(["high-today", "normal-today", "low-today"]);
  expect(await planningPrompts()).toEqual([{ kind: "waiting", count: 7 }]);
  await page.locator('.focus-filters [data-filter="overdue"]').click();
  expect(await ids()).toEqual(["urgent-late", "high-late", "normal-late"]);
  await page.locator('.focus-filters [data-filter="open"]').click();
  expect(await ids()).toEqual([
    "urgent-late",
    "high-late",
    "normal-late",
    "high-today",
    "normal-today",
    "low-today",
    "normal-future",
    "high-none",
    "low-none",
  ]);
  await expect(page.locator(".focus-more")).toHaveCount(0);
  await expect(page.locator("#focus-sort")).toHaveCount(0);
  await chooseStatus(
    page,
    page.locator('.focus-row[data-id="urgent-late"] .status-trigger'),
    "completed",
  );
  await expect(page.locator('.focus-row[data-id="urgent-late"]')).toHaveCount(
    0,
  );
  expect(await planningPrompts()).toEqual([{ kind: "waiting", count: 7 }]);
  expect(
    (await readRecords(page)).find((record) => record.id === "urgent-late")
      .status,
  ).toBe("completed");
  await page.locator('#nav [data-view="weekly"]').click();
  await expect(page.locator(".weekly-goal-row .metric-cell")).toContainText(
    "%100",
  );
  await page.locator('#nav [data-view="dashboard"]').click();
  await attentionPanel
    .locator('li[data-id="waiting-earliest"] .followup-title')
    .click();
  const waitingPreview = page.locator("#waiting-record-panel");
  await expect(waitingPreview).toBeVisible();
  await expect(waitingPreview).toHaveAttribute(
    "data-record-id",
    "waiting-earliest",
  );
  await expect(page.locator("#editor")).not.toBeVisible();
  await waitingPreview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "waiting-earliest",
  );
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    waiting[7].title,
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await waitingPreview
    .getByRole("button", { name: "Kapat", exact: true })
    .click();
  await expect(waitingPreview).not.toBeVisible();
  await page.locator('#nav [data-view="meeting"]').click();
  await expect(page.locator("#page-title")).toHaveText("Toplantı aksiyonları");
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator("tbody")).not.toContainText(
    "Tamamlanan toplantı aksiyonu",
  );
  await page.locator('#nav [data-view="dashboard"]').click();
  await page.locator('.planning-prompt[data-prompt="waiting"]').click();
  await expect(page.locator("#planning-prompts-dialog")).toBeVisible();
  await expect(
    page.locator("#planning-prompts-dialog [data-prompt-record]"),
  ).toHaveCount(7);
  await page.keyboard.press("Escape");
  await page.locator('#nav [data-view="waiting"]').click();
  await page.locator("#period-filter").selectOption("followup");
  await expect(page.locator("#page-title")).toHaveText("Bekleyen konular");
  await expect(page.locator("#period-filter")).toHaveValue("followup");
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator("tbody")).not.toContainText(
    "Kapanan bekleyen konu",
  );

  // Current work and the calendar share the top row; the three supporting panels share the bottom row.
  await seedRecords(page, [
    weekly,
    ...activeDaily.slice(0, 6),
    meetings[0],
    meetings[1],
    waiting[0],
    waiting[1],
    waiting[2],
    waiting[7],
    waiting[8],
  ]);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".focus-list > .focus-row")).toHaveCount(6);
    await expect(page.locator(".focus-more")).toHaveCount(0);
    expect(await planningPrompts()).toEqual([{ kind: "waiting", count: 4 }]);
    await expect(weeklyPanel.locator(".dashboard-goal-row")).toHaveCount(1);
    expect((await readAttentionCards(page)).map((card) => card.id)).toEqual([
      "waiting-earliest",
      "waiting-old",
      "waiting-today",
      "waiting-confirm-today",
    ]);
    await expectAttentionPageSize(4);
    const mainColumnBox = await page
      .locator(".dashboard-main-column")
      .boundingBox();
    const focusBox = await page.locator(".focus-panel").boundingBox();
    const followupBox = await page
      .locator(".dashboard-followups")
      .boundingBox();
    expect(Math.abs(focusBox.y - mainColumnBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(mainColumnBox.y - followupBox.y)).toBeLessThanOrEqual(1);
    expect(followupBox.x).toBeGreaterThanOrEqual(
      mainColumnBox.x + mainColumnBox.width,
    );
    const attentionBox = await attentionPanel.boundingBox();
    const calendarBox = await page.locator(".dashboard-calendar").boundingBox();
    const weeklyBox = await weeklyPanel.boundingBox();
    const notesBox = await notesPanel.boundingBox();
    expect(Math.abs(focusBox.height - calendarBox.height)).toBeLessThanOrEqual(
      1,
    );
    expect(attentionBox.y).toBeGreaterThanOrEqual(
      Math.max(
        focusBox.y + focusBox.height,
        calendarBox.y + calendarBox.height,
      ) - 1,
    );
    expect(Math.abs(attentionBox.y - weeklyBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(attentionBox.width - weeklyBox.width)).toBeLessThanOrEqual(
      1,
    );
    expect(weeklyBox.x).toBeGreaterThanOrEqual(
      attentionBox.x + attentionBox.width,
    );
    expect(Math.abs(notesBox.y - weeklyBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(notesBox.width - weeklyBox.width)).toBeLessThanOrEqual(1);
    expect(notesBox.x).toBeGreaterThanOrEqual(weeklyBox.x + weeklyBox.width);
    await weeklyPanel.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await expect(weeklyPanel).toBeInViewport({ ratio: 1 });
    await nextAttention(page).click();
    const lastAttention = attentionPanel.locator(".attention-list > li").last();
    await lastAttention.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "center" }),
    );
    await expect(lastAttention).toBeInViewport({ ratio: 1 });
    await firstAttentionPage(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `focused-dashboard-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: false,
    });
  }
});

async function undoToRecords(page, expected) {
  const undo = page.getByRole("button", { name: "Geri al", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => readRecords(page)).toEqual(expected);
}

test("multiple undo restores exact add, edit, status and weekly-unlink states and survives reload", async ({
  page,
}) => {
  const original = linkedRecords();
  await seedRecords(page, original);
  const undo = page.getByRole("button", { name: "Geri al", exact: true });
  await expect(undo).toBeDisabled();
  await addRecord(page, { title: "Ek günlük iş" });
  const afterAdd = await readRecords(page);
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .getByRole("button", { name: "Verileri kontrol et", exact: true })
    .click();
  await page.locator("#record-form [name=title]").fill("Güncellenen görev");
  await openCreationExtras(page);
  await page
    .locator("#record-form [name=description]")
    .fill("Güncellenen gerçek açıklama");
  await expect(page.locator("#record-form [name=nextAction]")).toBeHidden();
  await expect(page.locator("#record-form [name=nextAction]")).toHaveValue(
    original.find((record) => record.id === "daily-task").nextAction,
  );
  await page
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const afterEdit = await readRecords(page);
  expect(afterEdit.find((record) => record.id === "daily-task")).toMatchObject({
    description: "Güncellenen gerçek açıklama",
    nextAction: original.find((record) => record.id === "daily-task")
      .nextAction,
  });
  await chooseStatus(
    page,
    page
      .getByRole("button", {
        name: "Güncellenen görev: durumu değiştir",
        exact: true,
      })
      .first(),
    "completed",
  );
  const afterStatus = await readRecords(page);
  expect(afterStatus.find((record) => record.id === "daily-task").status).toBe(
    "completed",
  );
  await page.locator('#nav [data-view="weekly"]').click();
  await page
    .getByRole("button", { name: "Haftalık rapor", exact: true })
    .click();
  const weeklyPreview = page.locator("#goal-detail-panel");
  await expect(weeklyPreview).toBeVisible();
  await expect(weeklyPreview).toHaveAttribute("data-goal-id", "weekly-plan");
  await weeklyPreview
    .getByRole("button", { name: "Hedefi düzenle", exact: true })
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "weekly-plan",
  );
  await expect(page.locator('#record-form select[name="type"]')).toHaveValue(
    "weekly",
  );
  appConfirms(page).once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kaydı sil", exact: true }).click();
  await appConfirms(page).settled();
  const afterDelete = await readRecords(page);
  expect(afterDelete).toHaveLength(2);
  expect(
    afterDelete.find((record) => record.id === "daily-task").parentId,
  ).toBeNull();
  await undoToRecords(page, afterStatus);
  await page.locator("#page-title").click();
  await page.keyboard.press("Control+z");
  await expect.poll(() => readRecords(page)).toEqual(afterEdit);
  await undoToRecords(page, afterAdd);
  await page.reload();
  await expect(undo).toBeEnabled();
  await undoToRecords(page, original);
  await expect(undo).toBeDisabled();
});

test("undo reverses reset, backup restoration and theme while preserving the atomic saved workspace", async ({
  page,
}) => {
  const original = linkedRecords();
  const restored = [
    createRecord({
      id: "restored-monthly",
      type: "monthly",
      title: "Yedekteki aylık hedef",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      status: "in_progress",
      periodKey: "2026-11",
      sourceFields: { Hedef: "Yedekteki aylık hedef" },
    }),
  ];
  await seedRecords(page, original);
  await openSettings(page);
  await page.getByRole("radio", { name: "Koyu", exact: true }).check();
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openSettings(page);
  const firstReset = await openWorkspaceReset(page);
  await firstReset.locator('[data-action="confirm-reset-workspace"]').click();
  await expect(firstReset).not.toBeVisible();
  expect(await readRecords(page)).toEqual([]);
  await undoToRecords(page, original);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openSettings(page);
  const secondReset = await openWorkspaceReset(page);
  await secondReset.locator('[data-action="confirm-reset-workspace"]').click();
  await expect(secondReset).not.toBeVisible();
  expect(await readRecords(page)).toEqual([]);
  await openBackupSettings(page);
  appConfirms(page).once("dialog", (dialog) => dialog.accept());
  await page.locator("#restore-file").setInputFiles({
    name: "geri-al-denemesi.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, records: restored })),
  });
  await expect.poll(() => readRecords(page)).toEqual(restored);
  await undoToRecords(page, []);
  await undoToRecords(page, original);
  const undo = page.getByRole("button", { name: "Geri al", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await readRecords(page)).toEqual(original);
  await expect(undo).toBeDisabled();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    RECORDS_KEY,
  );
  expect(stored.odak).toMatchObject({
    version: 1,
    preferences: { density: "comfortable" },
  });
  expect(stored.odak.history).toEqual([]);
  await page.reload();
  expect(await readRecords(page)).toEqual(original);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("native text undo stays local and stale cross-tab history cannot erase external changes", async ({
  page,
}) => {
  const original = linkedRecords();
  await seedRecords(page, original);
  await addRecord(page, { title: "Geri alınabilir ek iş" });
  const afterAdd = await readRecords(page);
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .getByRole("button", { name: "Verileri kontrol et", exact: true })
    .click();
  const title = page.locator("#record-form [name=title]");
  await title.press("End");
  await title.pressSequentially("!");
  await expect(title).toHaveValue("Verileri kontrol et!");
  await title.press("ControlOrMeta+z");
  await expect(title).toHaveValue("Verileri kontrol et");
  expect(await readRecords(page)).toEqual(afterAdd);
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  const otherPage = await page.context().newPage();
  try {
    await otherPage.goto("/");
    const external = createRecord({
      id: "external-task",
      title: "Diğer sekmeden gelen iş",
      status: "waiting",
      description: "Eski geçmiş korunarak dışarıdan eklenen kayıt.",
    });
    await otherPage.evaluate(
      ({ key, external }) => {
        const store = JSON.parse(localStorage.getItem(key));
        store.records.push(external);
        localStorage.setItem(key, JSON.stringify(store));
      },
      { key: RECORDS_KEY, external },
    );
    const expected = [...afterAdd, external];
    await expect.poll(() => readRecords(page)).toEqual(expected);
    const undo = page.getByRole("button", { name: "Geri al", exact: true });
    if (await undo.isEnabled()) await undo.click();
    expect(await readRecords(page)).toEqual(expected);
    await page.reload();
    expect(await readRecords(page)).toEqual(expected);
  } finally {
    await otherPage.close();
  }
});

test("PC widget handles blocked popups, shows dated daily and planning work with follow-ups, and follows completion and undo", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-06T09:00:00Z"));
  const weekly = createRecord({
    id: "widget-weekly",
    type: "weekly",
    title: "Widget haftalık teslimi",
    dueDate: "2026-11-06",
    priority: "urgent",
  });
  const daily = [
    createRecord({
      id: "widget-urgent",
      title: "Widget acil işi",
      parentId: weekly.id,
      dueDate: "2026-11-06",
      priority: "urgent",
    }),
    createRecord({
      id: "widget-high",
      title: "Widget yüksek öncelikli iş",
      dueDate: "2026-11-06",
      priority: "high",
    }),
    createRecord({
      id: "widget-normal",
      title: "Widget normal işi",
      dueDate: "2026-11-06",
    }),
    createRecord({
      id: "widget-low",
      title: "Widget sonraki işi",
      dueDate: "2026-11-07",
      priority: "low",
    }),
    createRecord({
      id: "widget-done",
      title: "Widget dışında tamamlanan iş",
      status: "completed",
      dueDate: "2026-11-06",
      priority: "urgent",
    }),
  ];
  const waiting = createRecord({
    id: "widget-waiting",
    type: "waiting",
    title: "Widget bugünkü yanıt takibi",
    sourceDate: "2026-11-01",
    nextFollowUpDate: "2026-11-06",
    dueDate: "2026-11-07",
    expectedFrom: "Üretim ekibi",
  });
  const records = [weekly, ...daily, waiting];
  await seedRecords(page, records);
  await page.evaluate(() => {
    window.__nativeOpen = window.open;
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Widget aç", exact: true }).click();
  await expect(page.locator("#toast")).toContainText(/engell|izin/i);
  expect(await readRecords(page)).toEqual(records);
  expect(page.context().pages()).toHaveLength(1);
  await page.evaluate(() => {
    window.open = window.__nativeOpen;
    delete window.__nativeOpen;
  });
  const [widget] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Widget aç", exact: true }).click(),
  ]);
  await widget.waitForLoadState();
  await showAgenda(widget);
  await expect(widget.locator("#widget-today-count")).toHaveText("5");
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("1");
  const widgetIds = () =>
    widget
      .locator("#widget-tasks .widget-task")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id));
  expect(await widgetIds()).toEqual([
    "widget-urgent",
    "widget-weekly",
    "widget-high",
    "widget-normal",
    "widget-waiting",
  ]);
  await widget.locator('[data-widget-day="tomorrow"]').click();
  expect(await widgetIds()).toEqual(["widget-low"]);
  await widget.locator('[data-widget-day="today"]').click();
  expect(await readRecords(page)).toEqual(records);
  // 1.2.0: the work note is the widget's only editable field.
  await expect(
    widget.locator(
      "input, textarea:not(#widget-work-note), select, .status-trigger, .work-start",
    ),
  ).toHaveCount(0);
  await expect(widget.locator("textarea")).toHaveCount(1);
  await page.getByRole("button", { name: "Widget aç", exact: true }).click();
  expect(page.context().pages()).toHaveLength(2);
  await chooseStatus(
    page,
    page.locator('.focus-row[data-id="widget-urgent"] .status-trigger'),
    "completed",
  );
  await expect(widget.locator("#widget-today-count")).toHaveText("4");
  await expect(widget.locator("#widget-tomorrow-count")).toHaveText("1");
  expect(await widgetIds()).toEqual([
    "widget-weekly",
    "widget-high",
    "widget-normal",
    "widget-waiting",
  ]);
  await undoToRecords(page, records);
  await expect(widget.locator("#widget-today-count")).toHaveText("5");
  expect(await widgetIds()).toEqual([
    "widget-urgent",
    "widget-weekly",
    "widget-high",
    "widget-normal",
    "widget-waiting",
  ]);
  await widget
    .getByRole("button", { name: "Widget normal işi", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator("#record-form [name=title]")).toHaveValue(
    "Widget normal işi",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.locator('#nav [data-view="waiting"]').click();
  await widget.locator("#widget-open-main").click();
  await expect(page.locator("#page-title")).toHaveText("Bekleyen konular");
  await page.reload();
  expect(widget.isClosed()).toBe(false);
  await expect(widget.locator("#widget-today-count")).toHaveText("5");
  await widget.evaluate(() => {
    window.odakWidgetFocusCalls = 0;
    const focus = window.focus.bind(window);
    window.focus = () => {
      window.odakWidgetFocusCalls++;
      focus();
    };
  });
  await page.getByRole("button", { name: "Widget aç", exact: true }).click();
  await expect
    .poll(() => widget.evaluate(() => window.odakWidgetFocusCalls))
    .toBeGreaterThanOrEqual(1);
  expect(page.context().pages()).toHaveLength(2);
  await expect(widget.locator("#widget-tasks .widget-task")).toHaveCount(5);
  await widget.close();
});

const STATUS_SETS = {
  daily: [
    ["planned", "Yapılacak"],
    ["in_progress", "Devam ediyor"],
    ["waiting", "Beklemede"],
    ["completed", "Tamamlandı"],
    ["cancelled", "İptal"],
  ],
  meeting: [
    ["planned", "Planlanacak"],
    ["in_progress", "Açık"],
    ["completed", "Kapandı"],
  ],
  waiting: [
    ["planned", "Açık"],
    ["follow_up", "Takipte"],
    ["waiting_response", "Cevap bekleniyor"],
    ["completed", "Kapandı"],
  ],
};
for (const type of ["weekly", "monthly", "yearly"])
  STATUS_SETS[type] = STATUS_SETS.daily.filter(
    ([status]) => status !== "waiting",
  );

async function selectValuesAndLabels(select) {
  return select
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => [option.value, option.textContent.trim()]),
    );
}

test("each module keeps its own status options in forms, filters and the quick status menu", async ({
  page,
}) => {
  const records = Object.keys(STATUS_SETS).map((type) =>
    createRecord({
      id: `status-${type}`,
      type,
      title: `Durum seçimi ${type}`,
      status: "planned",
    }),
  );
  await seedRecords(page, records);
  for (const [type, expected] of Object.entries(STATUS_SETS)) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    expect(await selectValuesAndLabels(page.locator("#status-filter"))).toEqual(
      [
        ["all", "Tüm durumlar"],
        ...expected.filter(
          ([status]) =>
            !["completed", "cancelled", "transferred"].includes(status),
        ),
      ],
    );
    await expect(
      page.locator('[data-action="list-scope"][data-scope="open"]'),
    ).toHaveAttribute("aria-pressed", "true");
    const trigger = page
      .locator(`[data-action="status-menu"][data-id="status-${type}"]`)
      .first();
    await trigger.click();
    const menu = page.locator("#status-menu");
    await expect(menu).toBeVisible();
    expect(
      await menu
        .locator('[data-action="set-status"]')
        .evaluateAll((buttons) =>
          buttons.map((button) => [
            button.dataset.status,
            button.textContent.trim(),
          ]),
        ),
    ).toEqual(
      type === "meeting"
        ? expected
        : expected.filter(([status]) => status !== "completed"),
    );
    await expect(menu.locator('[data-status="planned"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(await readRecords(page)).toEqual(records);
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await page
      .getByRole("button", { name: `Durum seçimi ${type}`, exact: true })
      .click();
    const preview = page.locator(
      ["weekly", "monthly", "yearly"].includes(type)
        ? "#goal-detail-panel"
        : `#${type}-record-panel`,
    );
    if (type !== "daily") {
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute(
        ["weekly", "monthly", "yearly"].includes(type)
          ? "data-goal-id"
          : "data-record-id",
        `status-${type}`,
      );
      await expect(page.locator("#editor")).not.toBeVisible();
      await preview
        .getByRole("button", {
          name: ["weekly", "monthly", "yearly"].includes(type)
            ? "Hedefi düzenle"
            : "Kaydı düzenle",
          exact: true,
        })
        .click();
    }
    await expect(page.locator("#editor")).toBeVisible();
    await expect(page.locator('#record-form [name="id"]')).toHaveValue(
      `status-${type}`,
    );
    await expect(page.locator('#record-form select[name="type"]')).toHaveValue(
      type,
    );
    expect(
      await selectValuesAndLabels(page.locator('#record-form [name="status"]')),
    ).toEqual(expected);
    await expect(page.locator('#record-form [name="status"]')).toHaveValue(
      "planned",
    );
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(page.locator("#editor")).not.toBeVisible();
    if (type !== "daily") {
      await expect(preview).toBeVisible();
      await preview.getByRole("button", { name: "Kapat", exact: true }).click();
      await expect(preview).not.toBeVisible();
    }
    expect(await readRecords(page)).toEqual(records);
  }

  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  const form = page.locator("#record-form");
  for (const [type, expected] of Object.entries(STATUS_SETS)) {
    await form.locator('[name="type"]').selectOption(type);
    await openCreationExtras(page);
    expect(
      await selectValuesAndLabels(form.locator('[name="status"]')),
    ).toEqual(expected);
    await expect(form.locator('[name="status"]')).toHaveValue("planned");
  }
  await form.locator('[name="status"]').selectOption("completed");
  await form.locator('[name="type"]').selectOption("daily");
  await openCreationExtras(page);
  await expect(form.locator('[name="status"]')).toHaveValue("planned");
  await form.locator('[name="type"]').selectOption("waiting");
  await openCreationExtras(page);
  await form.locator('[name="status"]').selectOption("waiting_response");
  await form.locator('[name="type"]').selectOption("daily");
  await openCreationExtras(page);
  await expect(form.locator('[name="status"]')).toHaveValue("planned");
  expect(await selectValuesAndLabels(form.locator('[name="status"]'))).toEqual(
    STATUS_SETS.daily,
  );
  await form.locator('[name="type"]').selectOption("yearly");
  await openCreationExtras(page);
  await expect(form.locator('[name="status"]')).toHaveValue("completed");
  await form.locator('[name="type"]').selectOption("waiting");
  await openCreationExtras(page);
  await expect(form.locator('[name="status"]')).toHaveValue("waiting_response");
  const discard = appConfirms(page).waitForEvent("dialog");
  const cancelDraft = page
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  const confirmation = await discard;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toBe(
    "Kaydedilmemiş değişiklikler var. Kaydetmeden kapatmak istiyor musun?",
  );
  await confirmation.accept();
  await cancelDraft;
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await readRecords(page)).toEqual(records);
});

test("clicking a record opens editing and quick statuses preserve imported legacy values and undo exactly", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-07T09:00:00Z"));
  const records = [
    createRecord({
      id: "row-daily",
      title: "Satıra tıklanabilen iş",
      priority: "high",
      owner: "Sorumlu kişi",
      dueDate: "2026-11-10",
    }),
    createRecord({
      id: "row-meeting",
      type: "meeting",
      title: "Satıra tıklanabilen aksiyon",
      dueDate: "2026-11-10",
    }),
    createRecord({
      id: "legacy-daily",
      title: "Önceki durumunu koruyan iş",
      status: "transferred",
      parentId: "legacy-weekly",
      sourceFields: { Durum: "Aktarıldı", "Korunacak alan": "Özgün veri" },
    }),
    createRecord({
      id: "legacy-weekly",
      type: "weekly",
      title: "Durumu koruyan haftalık hedef",
    }),
  ];
  await seedRecords(page, records);
  await expect(page.locator(".row-menu")).toHaveCount(0);
  await page.locator('.focus-row[data-id="row-daily"] .priority').click();
  await expect(page.locator("#priority-menu")).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('.focus-row[data-id="row-daily"] .focus-title').click();
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Satıra tıklanabilen iş",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  const beforeMeetingView = await page.evaluate(
    (key) => localStorage.getItem(key),
    RECORDS_KEY,
  );
  await expect(
    page.locator('.attention-panel li[data-id="row-meeting"]'),
  ).toHaveCount(0);
  await page.locator('#nav [data-view="meeting"]').click();
  const meetingRow = page.locator('tr[data-record-row][data-id="row-meeting"]');
  await expect(
    meetingRow.locator(".inline-priority, .inline-date"),
  ).toHaveCount(0);
  await meetingRow.locator(".task-name").click();
  const meetingPreview = page.locator("#meeting-record-panel");
  await expect(meetingPreview).toBeVisible();
  await expect(meetingPreview).toHaveAttribute("data-record-id", "row-meeting");
  await expect(page.locator("#editor")).not.toBeVisible();
  await meetingPreview
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "row-meeting",
  );
  await expect(page.locator('#record-form [name="type"]')).toHaveValue(
    "meeting",
  );
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Satıra tıklanabilen aksiyon",
  );
  await expect(page.locator('#record-form [name="dueDate"]')).toBeHidden();
  await expect(page.locator('#record-form [name="dueDate"]')).toBeDisabled();
  await expect(page.locator('#record-form [name="dueDate"]')).toHaveValue(
    "10.11.2026",
  );
  await expect(page.locator('#record-form [name="priority"]')).toBeHidden();
  await expect(page.locator('#record-form [name="priority"]')).toBeDisabled();
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), RECORDS_KEY),
  ).toBe(beforeMeetingView);
  await page.locator('#nav [data-view="daily"]').click();
  await expect(page.locator(".row-menu")).toHaveCount(0);
  const row = page.locator('tbody tr[data-id="row-daily"]');
  await expect(row.locator(".task-meta-line")).toHaveCount(0);
  await row
    .locator("td")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Satıra tıklanabilen iş",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('#record-form [name="title"]')).toHaveValue(
    "Satıra tıklanabilen iş",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();

  await selectListStatus(page, "transferred");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(
    "Önceki durumunu koruyan iş",
  );
  await page
    .getByRole("button", { name: "Önceki durumunu koruyan iş", exact: true })
    .click();
  const status = page.locator('#record-form [name="status"]');
  await expect(status).toHaveValue("transferred");
  expect((await selectValuesAndLabels(status)).map(([value]) => value)).toEqual(
    [...STATUS_SETS.daily.map(([value]) => value), "transferred"],
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await readRecords(page)).toEqual(records);
  const legacyTrigger = page.locator(
    'tr[data-id="legacy-daily"] .status-trigger',
  );
  await legacyTrigger.click();
  const menu = page.locator("#status-menu");
  await expect(menu.locator('[data-status="transferred"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(
    await menu
      .locator('[data-action="set-status"]')
      .evaluateAll((items) => items.map((item) => item.dataset.status)),
  ).toEqual([
    ...STATUS_SETS.daily
      .filter(([value]) => value !== "completed")
      .map(([value]) => value),
    "transferred",
  ]);
  await expect(page.locator("#editor")).not.toBeVisible();
  await menu.locator('[data-status="waiting"]').click();
  await expect(menu).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await readRecords(page)).find((record) => record.id === "legacy-daily")
          .status,
    )
    .toBe("waiting");
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#waiting-details-dialog")).toBeVisible();
  await page
    .locator("#waiting-details-dialog")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await undoToRecords(page, records);
  await page.reload();
  expect(await readRecords(page)).toEqual(records);
});
