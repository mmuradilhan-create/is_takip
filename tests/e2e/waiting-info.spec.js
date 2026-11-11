import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const UNSAFE_REASON =
  '<img src=x onerror="window.waitingInfoInjected=1"> Tasarım yanıtı bekleniyor.';
const NEXT = "Yanıt gelince teknik kontrolü tamamla.";

const record = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const popup = (page) => page.locator("#waiting-info-popover");
const reason = (page) => popup(page).locator("#waiting-info-reason");
const detail = (page) => page.locator("#waiting-details-dialog");
const focusButton = (page, id = "waiting-info-primary") =>
  page.locator(`.focus-row[data-id="${id}"] .waiting-info-trigger`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const styles = (locator, properties) =>
  locator.evaluate((node, keys) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(keys.map((key) => [key, style[key]]));
  }, properties);
const bubbleStyle = (locator) =>
  styles(locator, [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderTopStyle",
    "borderTopColor",
    "borderRadius",
    "backgroundColor",
    "color",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "boxShadow",
  ]);
const iconStyle = (locator) =>
  styles(locator, [
    "width",
    "height",
    "paddingTop",
    "paddingRight",
    "borderTopWidth",
    "borderTopColor",
    "borderRadius",
    "backgroundColor",
    "color",
  ]);

async function view(page, type) {
  const menu = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await menu.isVisible()) &&
    (await menu.getAttribute("aria-expanded")) !== "true"
  )
    await menu.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}

async function expectTrailingIcon(surface, titleSelector, withNote = true) {
  const control = surface.locator(".waiting-info-trigger");
  await expect(control).toHaveCount(1);
  const placement = await surface.evaluate(
    (node, { titleSelector, withNote }) => {
      const title = node.querySelector(titleSelector);
      const waiting = node.querySelector(".waiting-info-trigger");
      const note = node.querySelector(".record-note-trigger");
      return {
        afterTitle: Boolean(
          title.compareDocumentPosition(waiting) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        sameTitleGroup: title.parentElement === waiting.parentElement,
        sharesNoteGroup:
          !withNote || note?.parentElement === waiting.parentElement,
      };
    },
    { titleSelector, withNote },
  );
  expect(placement).toEqual({
    afterTitle: true,
    sameTitleGroup: true,
    sharesNoteGroup: true,
  });
  const size = await surface.evaluate((node) =>
    node.matches(".focus-row") ? "18px" : "22px",
  );
  await expect(control).toHaveCSS("width", size);
  await expect(control).toHaveCSS("height", size);
}

function fixture() {
  return [
    record({
      id: "waiting-info-goal",
      type: "weekly",
      title: "Bekleyen günlük adımların hedefi",
      periodKey: "2026-W45",
    }),
    record({
      id: "waiting-info-primary",
      title: "Teknik yanıtı bekleyen günlük iş",
      status: "waiting",
      waitingReason: UNSAFE_REASON,
      nextAction: NEXT,
      parentId: "waiting-info-goal",
      description: "Genel not bu küçük bilgi penceresine taşınmamalı.",
      sourceFields: { "Özgün bilgi": "Korunur" },
    }),
    record({
      id: "waiting-info-empty",
      title: "Henüz nedeni girilmemiş bekleyen iş",
      status: "waiting",
      waitingReason: "",
      blockReason: "Eski alan açıkça boşaltılmış nedenin yerine geçmemeli.",
      nextAction: "",
    }),
    record({
      id: "waiting-info-active",
      title: "Çalışılabilir günlük iş",
      status: "in_progress",
      waitingReason: "Eski bekleme bilgisi korunur ama simge gösterilmez.",
    }),
    record({
      id: "waiting-info-closed",
      title: "Tamamlanmış günlük iş",
      status: "completed",
      waitingReason: "Geçmiş neden.",
    }),
    record({
      id: "waiting-info-meeting",
      title: "Beklemedeki toplantı aksiyonu",
      type: "meeting",
      status: "waiting",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("waiting-info-seeded")) return;
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
      localStorage.setItem(`${key}-waiting-state-migration`, "1");
      sessionStorage.setItem("waiting-info-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

test("waiting symbols share the compact note area and connection bubble style in both themes across daily work surfaces without changing records", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await expect(page.locator(".focus-row .waiting-info-trigger")).toHaveCount(2);
  await expect(
    page.locator(
      '.focus-row[data-id="waiting-info-active"] .waiting-info-trigger',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-overview="meeting"] .waiting-info-trigger'),
  ).toHaveCount(0);

  const overviewRow = page.locator(
    '.focus-row[data-id="waiting-info-primary"]',
  );
  const control = focusButton(page);
  await expectTrailingIcon(overviewRow, ".focus-title");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.mouse.move(1, 1);
    await page.locator("#global-search").focus();
    expect(await iconStyle(control)).toEqual(
      await iconStyle(overviewRow.locator(".record-note-trigger")),
    );
    await overviewRow.locator(".record-parent-link").hover();
    await page.clock.runFor(100);
    const connection = page.locator("#record-link-tooltip");
    await expect(connection).toBeVisible();
    const connectionStyle = await bubbleStyle(connection);
    await page.keyboard.press("Escape");
    await page.mouse.move(1, 1);
    await control.hover();
    await page.clock.runFor(100);
    await expect(popup(page)).toBeVisible();
    expect(await bubbleStyle(popup(page))).toEqual(connectionStyle);
    await expect(popup(page).getByRole("button")).toHaveCount(0);
    await expect(
      popup(page).locator(
        ".waiting-info-heading:visible, h3:visible, .waiting-info-actions:visible",
      ),
    ).toHaveCount(0);
    await expect(popup(page)).not.toContainText(
      "Teknik yanıtı bekleyen günlük iş",
    );
    await expect(reason(page)).toHaveText(UNSAFE_REASON);
    await expect(reason(page)).toHaveCSS("white-space", "pre-wrap");
    await expect(reason(page)).toHaveCSS("border-top-width", "0px");
    await expect(reason(page)).toHaveCSS("padding", "0px");
    await expect(reason(page)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(popup(page)).not.toContainText(NEXT);
    await expect(popup(page)).not.toContainText("Genel not");
    await expect(popup(page).locator("img, script, svg[onload]")).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(() => window.waitingInfoInjected),
    ).toBeUndefined();
    await expect(page.locator("#editor")).not.toBeVisible();
    await expect(detail(page)).not.toBeVisible();
    await popup(page).hover();
    await page.clock.runFor(200);
    await expect(popup(page)).toBeVisible();
    await page.mouse.move(0, 0);
    await page.clock.runFor(150);
    await expect(popup(page)).not.toBeVisible();
    await expect(control).toHaveAttribute("aria-expanded", "false");
    expect(await saved(page)).toBe(before);
  }

  await page.locator('#nav [data-view="daily"]').click();
  const row = page
    .locator('.full-table [data-id="waiting-info-primary"]')
    .first();
  await expectTrailingIcon(row, ".task-name");
  await row.locator(".waiting-info-trigger").hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await page.locator('#nav [data-view="weekly"]').click();
  await page
    .locator(
      '.weekly-goal-row[data-id="waiting-info-goal"] .task-name[data-action="goal-details"]',
    )
    .click();
  const child = page.locator(
    '#goal-detail-panel .goal-child-row[data-id="waiting-info-primary"]',
  );
  await expectTrailingIcon(child, ".goal-child-title", false);
  await child.locator(".waiting-info-trigger").hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("click and keyboard activation open the waiting editor directly while previews and cancelled drafts keep records intact", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  const control = focusButton(page);
  await control.focus();
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  await control.click();
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue(
    UNSAFE_REASON,
  );
  await expect(detail(page).locator('[name="nextAction"]')).toHaveCount(0);
  await detail(page)
    .locator('[name="waitingReason"]')
    .fill("Kaydedilmeyen taslak.");
  await detail(page)
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(detail(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  await page.clock.runFor(250);
  await expect(popup(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);

  // Restored trigger focus must not keep a fresh pointer preview open.
  await page.mouse.move(1, 1);
  await control.hover();
  await page.clock.runFor(100);
  await expect(popup(page)).toBeVisible();
  await expect(control).toBeFocused();
  await popup(page).hover();
  await page.clock.runFor(150);
  await expect(popup(page)).toBeVisible();
  await page.mouse.move(1, 1);
  await page.clock.runFor(150);
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toBeFocused();

  // Real keyboard navigation retains the preview until focus leaves it.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  await expect(popup(page)).toBeVisible();
  await page.clock.runFor(250);
  await expect(popup(page)).toBeVisible();
  await control.hover();
  await page.mouse.move(1, 1);
  await page.clock.runFor(150);
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  expect(await saved(page)).toBe(before);

  const empty = focusButton(page, "waiting-info-empty");
  await empty.focus();
  await expect(empty).toBeFocused();
  await expect(reason(page)).toHaveText("Bekleme nedeni eklenmedi.");
  await expect(popup(page).locator(".waiting-info-next")).toHaveCount(0);
  await empty.press("Space");
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('[name="waitingReason"]')).toHaveValue("");
  await detail(page).locator('[name="waitingReason"]').press("Enter");
  await expect(detail(page)).not.toBeVisible();
  await expect(empty).toBeFocused();
  await page.clock.runFor(250);
  await expect(popup(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);

  await control.focus();
  await control.press("Enter");
  await expect(popup(page)).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  const field = detail(page).getByRole("textbox", {
    name: "Neyi/kimi bekliyorum?",
    exact: true,
  });
  await expect(field).toHaveAccessibleDescription(
    "Enter ile kaydet, Shift+Enter ile alt satıra geç.",
  );
  await expect(detail(page).locator("#waiting-details-shortcuts")).toBeHidden();
  await expect(field).toHaveValue(UNSAFE_REASON);
  await field.fill("Ölçüm sonucu bekleniyor.");
  await field.press("Shift+Enter");
  await field.pressSequentially("Tedarikçi yanıtı da bekleniyor.");
  const updatedReason =
    "Ölçüm sonucu bekleniyor.\nTedarikçi yanıtı da bekleniyor.";
  await expect(field).toHaveValue(updatedReason);
  expect(await saved(page)).toBe(before);
  await field.evaluate((textarea) => {
    for (const options of [
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { prevented: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      if (options.keyCode)
        Object.defineProperty(event, "keyCode", { value: options.keyCode });
      if (options.prevented) event.preventDefault();
      textarea.dispatchEvent(event);
    }
  });
  await expect(detail(page)).toBeVisible();
  await expect(field).toHaveValue(updatedReason);
  expect(await saved(page)).toBe(before);
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    window.restoreWaitingInfoStorage = () => {
      Storage.prototype.setItem = originalSetItem;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test depolaması dolu", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, KEY);
  await field.press("Enter");
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator("#waiting-details-error")).not.toBeEmpty();
  await expect(field).toHaveValue(updatedReason);
  expect(await saved(page)).toBe(before);
  await page.evaluate(() => window.restoreWaitingInfoStorage());
  await field.press("Enter");
  await expect(detail(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  await page.clock.runFor(250);
  await expect(popup(page)).not.toBeVisible();
  const edited = JSON.parse(await saved(page));
  expect(edited.records).toEqual(
    original.map((item) =>
      item.id === "waiting-info-primary"
        ? {
            ...item,
            waitingReason: updatedReason,
            blocked: false,
            updatedAt: NOW.toISOString(),
          }
        : item,
    ),
  );
  expect(edited.odak.history).toHaveLength(1);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await saved(page)).toBe(before);
  await page.mouse.move(1, 1);
  await control.hover();
  await page.clock.runFor(100);
  await control.focus();
  await expect(popup(page)).toBeVisible();
  await expect(reason(page)).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Tab");
  expect(
    await popup(page).evaluate((node) => node.contains(document.activeElement)),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.activeElement.closest(".focus-row")?.dataset.id,
    ),
  ).toBe("waiting-info-primary");
  await page.clock.runFor(150);
  await expect(popup(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});

test("long waiting context stays inside a short modal viewport and Escape closes only the preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 });
  const records = fixture();
  records[1] = record({
    ...records[1],
    title: "Uzun başlık ".repeat(16),
    waitingReason: "Teknik bir açıklama bekleniyor. ".repeat(25),
    nextAction: "Yanıt geldiğinde kontrol edilecek ayrıntılar. ".repeat(70),
  });
  await seed(page, records);
  const before = await saved(page);
  await page
    .locator('.focus-row[data-id="waiting-info-primary"] .focus-title')
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.evaluate(() => {
    const source = document.querySelector(
      '.focus-row[data-id="waiting-info-primary"] .waiting-info-trigger',
    );
    const control = source.cloneNode(true);
    control.id = "modal-waiting-info-test";
    Object.assign(control.style, {
      position: "fixed",
      right: "10px",
      bottom: "10px",
      zIndex: "1",
    });
    document.querySelector("#editor .modal-body").append(control);
  });
  const control = page.locator("#modal-waiting-info-test");
  await control.hover();
  await page.clock.runFor(180);
  await expect(popup(page)).toBeVisible();
  expect(await popup(page).evaluate((node) => node.parentElement.id)).toBe(
    "editor",
  );
  const bounds = await popup(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.y).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(893);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(473);
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("#editor")).toBeVisible();
  await expect(control).toBeFocused();
  expect(await saved(page)).toBe(before);
});

test("long waiting text remains scrollable by keyboard in a narrow compact bubble while Escape returns to its trailing icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  const records = fixture();
  const longReason = `${UNSAFE_REASON}\n${Array.from({ length: 24 }, (_, index) => `${index + 1}. Teknik yanıt ayrıntısı.`).join("\n")}`;
  records[1] = record({ ...records[1], waitingReason: longReason });
  await seed(page, records);
  const before = await saved(page);
  const control = focusButton(page);
  const row = page.locator('.focus-row[data-id="waiting-info-primary"]');
  await expectTrailingIcon(row, ".focus-title");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await control.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    await control.hover();
    await page.clock.runFor(100);
    await control.focus();
    await expect(popup(page)).toBeVisible();
    const bounds = await popup(page).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(412);
    await expect(reason(page)).toHaveText(longReason);
    expect(await reason(page).evaluate((element) => element.scrollTop)).toBe(0);
    await expect(reason(page)).toHaveAttribute("tabindex", "0");
    expect(
      await reason(page).evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(reason(page)).toBeFocused();
    await expect(reason(page)).toHaveCSS("outline-style", "none");
    await expect(reason(page)).toHaveCSS("box-shadow", "none");
    await expect(reason(page)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(popup(page)).toHaveCSS(
      "border-top-color",
      await control.evaluate(
        (element) => getComputedStyle(element).borderTopColor,
      ),
    );
    const pagePosition = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));
    await reason(page).press("PageDown");
    await expect
      .poll(() => reason(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await reason(page).press("End");
    await expect
      .poll(() =>
        reason(page).evaluate(
          (element) =>
            element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThanOrEqual(1);
    const bottom = await reason(page).evaluate((element) => element.scrollTop);
    for (const key of ["PageDown", "End", "ArrowDown", "ArrowRight", "Space"])
      await reason(page).press(key);
    expect(await reason(page).evaluate((element) => element.scrollTop)).toBe(
      bottom,
    );
    await reason(page).press("ArrowUp");
    expect(
      await reason(page).evaluate((element) => element.scrollTop),
    ).toBeLessThan(bottom);
    await reason(page).press("End");
    await reason(page).press("Shift+Space");
    const previousPage = await reason(page).evaluate(
      (element) => element.scrollTop,
    );
    expect(previousPage).toBeGreaterThanOrEqual(0);
    expect(previousPage).toBeLessThan(bottom);
    await reason(page).press("PageUp");
    expect(
      await reason(page).evaluate((element) => element.scrollTop),
    ).toBeLessThanOrEqual(previousPage);
    await reason(page).press("Home");
    for (const key of ["PageUp", "Home", "ArrowUp", "ArrowLeft", "Shift+Space"])
      await reason(page).press(key);
    expect(await reason(page).evaluate((element) => element.scrollTop)).toBe(0);
    const untouchedKeys = await reason(page).evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(element.firstChild, 0);
      range.setEnd(element.firstChild, 12);
      selection.removeAllRanges();
      selection.addRange(range);
      const selected = selection.toString();
      const events = [
        { key: "ArrowDown", shiftKey: true },
        { key: "End", ctrlKey: true },
        { key: "PageDown", altKey: true },
        { key: "Home", metaKey: true },
        { key: "End", isComposing: true },
        { key: "PageDown", keyCode: 229 },
      ].map((init) => {
        const event = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...init,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
      const unchanged = selection.toString() === selected;
      selection.removeAllRanges();
      return { events, unchanged };
    });
    expect(untouchedKeys).toEqual({
      events: [false, false, false, false, false, false],
      unchanged: true,
    });
    await page.clock.runFor(150);
    expect(
      await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
    ).toEqual(pagePosition);
    await expect(reason(page)).toBeFocused();
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).locator("img, script")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.waitingInfoInjected),
    ).toBeUndefined();
    await page.keyboard.press("Escape");
    await expect(control).toBeFocused();
    await page.clock.runFor(250);
    await expect(popup(page)).not.toBeVisible();
    await expect(detail(page)).not.toBeVisible();
    expect(await saved(page)).toBe(before);
    await row.locator(".focus-title").focus();
  }

  await control.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await control.hover();
  await page.clock.runFor(100);
  await control.focus();
  await page.keyboard.press("Tab");
  await expect(reason(page)).toBeFocused();
  await page.evaluate(() =>
    window.scrollTo(0, document.scrollingElement.scrollHeight),
  );
  await expect(popup(page)).not.toBeVisible();
  await expect(control).toBeFocused();
  await expect(detail(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
});
