import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
const UNSAFE = '<img src=x onerror="window.notePreviewInjected=1"> Gerçek not';
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const row = (page, id) =>
  page.locator(`.full-table tr[data-record-row][data-id="${id}"]`);
const note = (page, id) => row(page, id).locator('[data-action="record-note"]');
const popup = (page) => page.locator("#record-note-popover");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const closeEditor = (page) =>
  page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();

function fixture() {
  return TYPES.map((type) =>
    createRecord({
      id: `shortcut-${type}`,
      type,
      title: `Korunacak ${type} kaydı`,
      description: `${UNSAFE}\nİkinci satır ${type}.\nÜçüncü satır.`,
      nextAction: "Gizlenen veya isteğe bağlı eski adım korunur.",
      periodKey:
        { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] || "",
      sourceDate: "2026-11-01",
      dueDate: "2026-11-14",
      sourceFields: { original: { value: "Ham kayıt bilgisi korunmalı" } },
      ...(type === "daily"
        ? {
            workContext: "ad_hoc",
            projectCode: "GK-42",
            workType: "Teknik inceleme",
            workLog: [
              {
                id: "shortcut-old-work",
                date: "2026-11-07",
                endedAt: STAMP,
                durationMs: 60_000,
                note: "Gerçek iş günlüğü sonucu.",
                nextAction: "Tarihsel adım korunmalı.",
              },
            ],
          }
        : {}),
      ...(type === "waiting"
        ? {
            expectedFrom: "Dış ekip",
            latestUpdate: "Gerçek son gelişme.",
            nextFollowUpDate: "2026-11-15",
            followUpLog: [
              {
                id: "shortcut-old-followup",
                date: "2026-11-03",
                note: "Gerçek takip sonucu.",
                nextFollowUpDate: "2026-11-15",
              },
            ],
          }
        : {}),
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
}

async function seed(page, items = fixture()) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, items }) => {
      if (sessionStorage.getItem("record-shortcuts-notes-0217-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: items,
          odak: {
            version: 1,
            preferences: { density: "compact" },
            history: [],
          },
        }),
      );
      sessionStorage.setItem("record-shortcuts-notes-0217-seeded", "1");
    },
    { key: KEY, items },
  );
  await page.goto("/");
  return items;
}

async function view(page, type) {
  const menu = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await menu.isVisible()) &&
    (await menu.getAttribute("aria-expanded")) !== "true"
  )
    await menu.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

test("all six new and existing record forms keep Shift Enter as a newline and save unmodified textarea Enter without changing unrelated data", async ({
  page,
}) => {
  const items = await seed(page);
  const before = await saved(page);
  for (const type of TYPES) {
    await view(page, type);
    await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
    await field(page, "title").fill(`Klavye ile oluşturulan ${type}`);
    await openCreationExtras(page);
    if (type === "daily")
      for (const name of ["projectCode", "workType"])
        await expect(field(page, name)).not.toBeVisible();
    const description = field(page, "description");
    await description.fill("İlk satır");
    await description.press("Shift+Enter");
    await page.keyboard.insertText("İkinci satır");
    await expect(description).toHaveValue("İlk satır\nİkinci satır");
    await expect(form(page)).toBeVisible();
    expect(await saved(page)).toBe(before);
    await description.press("Enter");
    await expect(page.locator("#editor")).not.toBeVisible();
    const created = (await stored(page)).records.find(
      (item) => item.title === `Klavye ile oluşturulan ${type}`,
    );
    expect(created).toMatchObject({
      type,
      description: "İlk satır\nİkinci satır",
    });
    expect(
      (await stored(page)).records.filter((item) => item.id !== created.id),
    ).toEqual(items);
    await undo(page);
    expect(await saved(page)).toBe(before);
    const original = items.find((item) => item.type === type);
    await row(page, original.id)
      .locator(
        ["weekly", "monthly", "yearly"].includes(type)
          ? ".goal-edit-trigger"
          : ".task-name",
      )
      .click();
    await openCreationExtras(page);
    if (type === "daily")
      for (const name of ["projectCode", "workType"]) {
        await expect(field(page, name)).not.toBeVisible();
        await expect(field(page, name)).toBeDisabled();
        await expect(field(page, name)).toHaveValue(original[name]);
      }
    await field(page, "description").fill("Düzenlenen ilk satır");
    await field(page, "description").press("Shift+Enter");
    await page.keyboard.insertText("Düzenlenen ikinci satır");
    expect(await saved(page)).toBe(before);
    await field(page, "description").press("Enter");
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(
      (await stored(page)).records.find((item) => item.id === original.id),
    ).toEqual({
      ...original,
      description: "Düzenlenen ilk satır\nDüzenlenen ikinci satır",
      updatedAt: NOW.toISOString(),
    });
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
});

test("composition, held Enter and prevented events never submit while native input Enter and rejected validation or stale saves retain the right draft", async ({
  page,
  context,
}) => {
  await seed(page);
  const before = await saved(page);
  await view(page, "daily");
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  await openCreationExtras(page);
  await field(page, "description").fill(
    "Eksik başlık nedeniyle korunacak taslak.",
  );
  await field(page, "description").press("Enter");
  await expect(form(page)).toBeVisible();
  expect(
    await field(page, "title").evaluate((input) => input.checkValidity()),
  ).toBe(false);
  expect(await saved(page)).toBe(before);
  await field(page, "title").fill("Geçerli ama henüz kaydedilmeyen başlık");
  await field(page, "description").evaluate((input) => {
    for (const options of [
      { isComposing: true },
      { repeat: true },
      { prevented: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      if (options.prevented) event.preventDefault();
      input.dispatchEvent(event);
    }
  });
  await expect(form(page)).toBeVisible();
  expect(await saved(page)).toBe(before);
  await field(page, "title").press("Enter");
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    (await stored(page)).records.some(
      (item) => item.title === "Geçerli ama henüz kaydedilmeyen başlık",
    ),
  ).toBe(true);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await row(page, "shortcut-daily").locator(".task-name").click();
  await openCreationExtras(page);
  await field(page, "description").fill("Korunacak yerel not taslağı.");
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto("/");
  await view(other, "daily");
  await row(other, "shortcut-daily").locator(".task-name").click();
  await openCreationExtras(other);
  await field(other, "description").fill("Diğer pencereden kaydedilen not.");
  await field(other, "description").press("Enter");
  await expect(other.locator("#editor")).not.toBeVisible();
  const external = await saved(other);
  await expect.poll(() => saved(page)).toBe(external);
  await field(page, "description").press("Enter");
  await expect(form(page)).toBeVisible();
  await expect(form(page).locator("#form-error")).toContainText(
    /değiş|güncel/i,
  );
  await expect(field(page, "description")).toHaveValue(
    "Korunacak yerel not taslağı.",
  );
  expect(await saved(page)).toBe(external);
  await closeEditor(page);
  await other.close();
});

test("each list exposes only genuine nonblank notes and previews escaped multiline text through hover, focus and click without opening editing or writing data", async ({
  page,
}) => {
  const items = fixture();
  items.push(
    createRecord({
      id: "blank-note",
      title: "Boş notlu günlük iş",
      description: "   ",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
    createRecord({
      id: "latest-only",
      type: "waiting",
      title: "Yalnız gelişme özeti bulunan konu",
      latestUpdate: "Bu metin genel not değildir.",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  await seed(page, items);
  const before = await saved(page);
  for (const type of TYPES) {
    await view(page, type);
    const original = items.find((item) => item.id === `shortcut-${type}`);
    const trigger = note(page, original.id);
    await expect(trigger).toBeVisible();
    await row(page, original.id).locator(".task-name").focus();
    const focusBeforeHover = await page.evaluateHandle(
      () => document.activeElement,
    );
    await trigger.hover();
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).locator(".record-note-body")).toHaveText(
      original.description,
    );
    await expect(popup(page).locator(".record-note-body")).toHaveCSS(
      "white-space",
      "pre-wrap",
    );
    await expect(popup(page).locator("img")).toHaveCount(0);
    await expect(
      popup(page).locator(
        'input, textarea, select, [data-action="edit"], button[type="submit"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator("#editor")).not.toBeVisible();
    expect(
      await page.evaluate(() => window.notePreviewInjected),
    ).toBeUndefined();
    await page.keyboard.press("Escape");
    await expect(popup(page)).not.toBeVisible();
    expect(
      await page.evaluate(
        (previous) => document.activeElement === previous,
        focusBeforeHover,
      ),
    ).toBe(true);
    await focusBeforeHover.dispose();
    await row(page, original.id).locator(".task-name").focus();
    await trigger.focus();
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup(page)).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      popup(page).locator('[data-action="record-note-close"]'),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await saved(page)).toBe(before);
  }
  await view(page, "daily");
  await expect(note(page, "blank-note")).toHaveCount(0);
  await view(page, "waiting");
  await expect(note(page, "latest-only")).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});

test("touch and keyboard users can scroll a long note inside a narrow preview and clearing it follows reload and exact Undo", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 700 },
    isMobile: true,
    hasTouch: true,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const page = await context.newPage();
    const original = fixture()[0];
    original.description = `${UNSAFE}\n${Array.from({ length: 180 }, (_, index) => `${index + 1}. Uzun not satırı ve korunacak gerçek açıklama.`).join("\n")}`;
    await seed(page, [original]);
    const before = await saved(page);
    await view(page, "daily");
    await note(page, original.id).tap();
    await expect(popup(page)).toBeVisible();
    const text = popup(page).locator(".record-note-body");
    const heading = popup(page).locator(".record-note-heading");
    const initialHeading = await heading.boundingBox();
    const bounds = await popup(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
    expect(
      await text.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await text.focus();
    await text.press("PageDown");
    await expect
      .poll(() => text.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await heading.boundingBox()).toEqual(initialHeading);
    expect(await popup(page).evaluate((element) => element.scrollTop)).toBe(0);
    expect(await saved(page)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(popup(page)).not.toBeVisible();
    await row(page, original.id).locator(".task-name").tap();
    await openCreationExtras(page);
    await field(page, "description").fill("   ");
    await field(page, "description").press("Enter");
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(note(page, original.id)).toHaveCount(0);
    expect((await stored(page)).records[0]).toEqual({
      ...original,
      description: "",
      updatedAt: NOW.toISOString(),
    });
    await page.reload();
    await view(page, "daily");
    await expect(note(page, original.id)).toHaveCount(0);
    await undo(page);
    expect(await saved(page)).toBe(before);
    await expect(note(page, original.id)).toHaveCount(1);
    await note(page, original.id).tap();
    await expect(popup(page).locator(".record-note-body")).toHaveText(
      original.description,
    );
    await expect(popup(page).locator("img")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.notePreviewInjected),
    ).toBeUndefined();
  } finally {
    await context.close();
  }
});

test("waiting history icons preview only actual saved contacts and open their existing editor while note previews remain separate and read-only", async ({
  page,
}, testInfo) => {
  const items = fixture();
  const topic = items.find((item) => item.id === "shortcut-waiting");
  topic.title =
    "ÖRNEK arayüz revizyonu için dış tasarım ekibinden ayrıntılı teknik değerlendirme, üretim uygunluğu ve güncel ölçüm sonuçlarını içeren yanıtı beklediğim uzun başlıklı konu";
  topic.latestUpdate = "Bu özet tarihli bir takip kaydı değildir.";
  topic.followUpLog.push({
    id: "shortcut-new-followup",
    date: "2026-11-07",
    note: `${UNSAFE}\nSon gerçek temas sonucu.`,
    previousUpdate: "Tarih atanmamış önceki gerçek gelişme.",
    nextFollowUpDate: "2026-11-15",
  });
  items.push(
    createRecord({
      id: "history-summary-only",
      type: "waiting",
      title: "Geçmişi olmayan beklenen konu",
      latestUpdate: "Yalnız güncel özet mevcut.",
      sourceDate: "2026-11-01",
      lastFollowUpDate: "2026-11-07",
      nextFollowUpDate: "2026-11-15",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  );
  await seed(page, items);
  const before = await saved(page);
  await view(page, "waiting");
  const title = row(page, topic.id).locator("a.task-name");
  await expect(title).toHaveAttribute("href", "#editor");
  await expect(title).toHaveAttribute("role", "button");
  const geometry = await row(page, topic.id).evaluate((record) => {
    const title = record.querySelector("a.task-name");
    const range = document.createRange();
    range.selectNodeContents(title);
    const fragments = [...range.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    };
    const last = fragments.at(-1);
    return {
      lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
      last: {
        left: last.left,
        right: last.right,
        top: last.top,
        bottom: last.bottom,
        height: last.height,
      },
      icons: ["record-note", "waiting-history"].map((action) =>
        bounds(record.querySelector(`[data-action="${action}"]`)),
      ),
      cell: bounds(record.querySelector("td")),
      row: bounds(record),
    };
  });
  expect(geometry.lines).toBeGreaterThanOrEqual(2);
  let previous = geometry.last;
  for (const icon of geometry.icons) {
    const sameLine =
      Math.abs(
        icon.top + icon.height / 2 - previous.top - previous.height / 2,
      ) <= 8;
    if (sameLine) expect(icon.left).toBeGreaterThanOrEqual(previous.right - 1);
    else expect(icon.top).toBeGreaterThanOrEqual(previous.bottom - 2);
    expect(icon.left).toBeGreaterThanOrEqual(geometry.cell.left);
    expect(icon.right).toBeLessThanOrEqual(geometry.cell.right);
    expect(icon.top).toBeGreaterThanOrEqual(geometry.row.top);
    expect(icon.bottom).toBeLessThanOrEqual(geometry.row.bottom);
    previous = icon;
  }
  await page.screenshot({
    path: testInfo.outputPath("waiting-inline-note-history-icons.png"),
    fullPage: false,
  });
  const originalUrl = page.url();
  for (const key of ["Enter", "Space"]) {
    await title.focus();
    await title.press(key);
    await expect(page.locator("#editor")).toBeVisible();
    await expect(field(page, "id")).toHaveValue(topic.id);
    await expect(field(page, "title")).toHaveValue(topic.title);
    await expect(page).toHaveURL(originalUrl);
    await closeEditor(page);
    await expect(page).toHaveURL(originalUrl);
    expect(await saved(page)).toBe(before);
  }
  await expect(
    row(page, "history-summary-only").locator(
      '[data-action="waiting-history"]',
    ),
  ).toHaveCount(0);
  const trigger = row(page, topic.id).locator(
    '[data-action="waiting-history"]',
  );
  await expect(trigger).toHaveClass("record-history-trigger");
  await expect(trigger).toHaveAttribute(
    "aria-label",
    /takip geçmişi, 2 kayıt$/,
  );
  await row(page, topic.id).locator(".task-name").focus();
  await trigger.hover();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page)).toHaveAttribute("data-preview-kind", "history");
  const entries = popup(page).locator(".record-history-list > li");
  expect(
    await entries.evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.followupId),
    ),
  ).toEqual(["shortcut-new-followup", "shortcut-old-followup"]);
  await expect(entries.first().locator("time")).toHaveText("7 Kasım 2026");
  await expect(entries.first().locator(".record-history-result")).toHaveText(
    topic.followUpLog[1].note,
  );
  await expect(
    entries.first().locator(".record-history-previous"),
  ).toContainText(topic.followUpLog[1].previousUpdate);
  await expect(entries.first().locator(".record-history-planned")).toHaveText(
    "Sonraki takip: 15 Kasım 2026",
  );
  await expect(popup(page)).not.toContainText(topic.latestUpdate);
  await expect(popup(page).locator("img,input,textarea,select")).toHaveCount(0);
  expect(await page.evaluate(() => window.notePreviewInjected)).toBeUndefined();
  await expect(row(page, topic.id).locator(".task-name")).toBeFocused();
  expect(await saved(page)).toBe(before);
  await page.screenshot({
    path: testInfo.outputPath("waiting-history-preview.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(popup(page)).not.toBeVisible();
  await trigger.focus();
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  const history = page.locator("#waiting-followup-dialog");
  await expect(history).toBeVisible();
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  const latestEdit = history.locator(
    '[data-followup-id="shortcut-new-followup"] [data-action="waiting-followup-edit"]',
  );
  await expect(latestEdit).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("waiting-history-cards.png"),
    fullPage: false,
  });
  await page.keyboard.press("Enter");
  await expect(
    history.locator('[data-followup-edit="shortcut-new-followup"]'),
  ).toBeVisible();
  await expect(history.locator('[name="editFollowUpNote"]')).toHaveValue(
    topic.followUpLog[1].note,
  );
  await history.locator('[data-action="waiting-followup-edit-cancel"]').click();
  await history
    .locator('.modal-footer [data-action="waiting-followup-close"]')
    .click();
  expect(await saved(page)).toBe(before);
  await note(page, topic.id).click();
  await expect(popup(page)).toHaveAttribute("data-preview-kind", "note");
  await expect(popup(page).locator(".record-note-body")).toHaveText(
    topic.description,
  );
  await expect(popup(page).locator(".record-history-list")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
});
