import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  readEffectiveWorkSessionRaw,
  readWorkspaceDomainRaw,
  sessionAwareStorageHooks,
} from "./work-session-support.js";

const KEY = "is-takip-v1";
const SESSION = `${KEY}-work-session`;
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-02T09:00:00.000Z";
const ACTIVE_TITLE =
  "Kontrol belgelerini incele ve tasarım değerlendirmesini hazırlayarak teknik ekiple paylaş";
const journal = (page) => page.locator("#sidebar-work-journal");
const panel = (page) => page.locator("#work-session-panel");
const note = (page) => page.locator("#work-session-note");
const rows = (page) =>
  page.locator("#work-paused-list > .work-paused-row:visible");
const row = (page, id) =>
  rows(page).filter({
    has: page.locator(`[data-action="work-paused-open"][data-id="${id}"]`),
  });
const action = (page, name) => journal(page).locator(`[data-action="${name}"]`);
const saved = (page, key = KEY) =>
  key === SESSION
    ? readEffectiveWorkSessionRaw(page)
    : readWorkspaceDomainRaw(page);
const session = async (page) => JSON.parse(await saved(page, SESSION));
const entry = async (page, id) =>
  (await session(page)).entries.find((item) => item.recordId === id);
const rowIds = (page) =>
  rows(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.recordId));

function fixture() {
  const make = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  const titles = [
    "Plastik taşıma sandığı markalama teknik resmini ve etiket detaylarını incele",
    "KABUK ARAYÜZ GK KB, R94153502 güncellemesi için firma revizyon yanıtını değerlendir",
    "Salgı ölçümünün ömür uzatım kapsamına eklenmesi için tasarım yanıtını kontrol et",
    'DYRK Test Planlaması eksik dokümanlarını tamamla ve toplantı kararını güncelle <img src=x onerror="window.pausedInjected=1">',
  ];
  const records = [
    make({
      id: "paused-active",
      title: ACTIVE_TITLE,
      status: "in_progress",
      description: "Özgün kayıt notu değişmez.",
    }),
    ...[1, 2, 3, 4].map((index) =>
      make({
        id: `paused-${index}`,
        title: titles[index - 1],
        status: "planned",
        dueDate: `2026-11-${12 + index}`,
        nextAction: `${index}. işin özgün sonraki adımı`,
        sourceFields: { original: { value: `HAM-${index}` } },
      }),
    ),
    make({
      id: "paused-closed",
      title: "Kapalı işin korunacak taslağı",
      status: "completed",
    }),
    make({
      id: "paused-recorded",
      title: "Önceden kaydedilmiş çalışma",
      workLog: [
        {
          id: "recorded-session",
          date: "2026-11-02",
          endedAt: STAMP,
          durationMs: 65_001,
          note: "Kaydedilmiş gerçek sonuç",
          nextAction: "Eski oturum adımı",
        },
      ],
    }),
  ];
  const paused = (id, updatedAt, draftNote, sessionId = `${id}-session`) => ({
    recordId: id,
    sessionId,
    status: "paused",
    elapsedMs: 0,
    trackTime: false,
    startedAt: null,
    ownerId: null,
    updatedAt,
    draftNote,
  });
  return {
    records,
    context: {
      version: 1,
      currentId: "paused-active",
      entries: [
        {
          recordId: "paused-active",
          sessionId: "active-session",
          status: "running",
          elapsedMs: 0,
          trackTime: false,
          startedAt: NOW.getTime(),
          ownerId: "fixture-owner",
          updatedAt: NOW.getTime(),
          draftNote: "Aktif işin korunacak notu",
        },
        ...[1, 2, 3, 4].map((index) =>
          paused(
            `paused-${index}`,
            NOW.getTime() - (5 - index) * 1000,
            `${index}. duraklatılmış işin ayrı notu`,
          ),
        ),
        paused("paused-closed", NOW.getTime(), "Kapalı kaydın notu korunur"),
        paused("paused-missing", NOW.getTime(), "Eksik kaydın bağlamı korunur"),
        paused(
          "paused-recorded",
          NOW.getTime(),
          "Kaydedilmiş gerçek sonuç",
          "recorded-session",
        ),
      ],
    },
  };
}

async function seed(page, context) {
  const data = fixture();
  const raw = JSON.stringify({
    version: 1,
    records: data.records,
    odak: {
      version: 1,
      preferences: { density: "comfortable", theme: "light" },
      notes: [
        {
          id: "separate-note",
          text: "Bağımsız not korunur.",
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
      history: [],
    },
  });
  await context.clock.install({ time: NOW });
  await context.clock.pauseAt(NOW);
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, sessionKey, raw, sessionRaw }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw);
        localStorage.setItem(sessionKey, sessionRaw);
      }
    },
    {
      key: KEY,
      sessionKey: SESSION,
      raw,
      sessionRaw: JSON.stringify(data.context),
    },
  );
  await context.addInitScript(sessionAwareStorageHooks, {
    baselineRaw: raw,
    sessionQuotaFlag: "pausedQuota",
    domainWriteCounter: "pausedPrimaryWrites",
  });
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await page.clock.runFor(32);
  await expect
    .poll(() => rowIds(page))
    .toEqual(["paused-4", "paused-3", "paused-2"]);
  await context.clock.runFor(1000);
  return { ...data, raw };
}

async function choose(page, id, keyboard = false) {
  const button = row(page, id).locator('[data-action="work-paused-open"]');
  if (keyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else await button.click();
  await expect(page.locator("#work-session-title")).toHaveAttribute(
    "data-id",
    id,
  );
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(note(page)).toBeFocused();
  await page.clock.runFor(32);
}

async function unchangedPrimary(page, raw) {
  expect(await saved(page)).toBe(raw);
  expect(await page.evaluate(() => window.pausedPrimaryWrites)).toBe(0);
}

async function noCardScroll(page) {
  const geometry = await page.evaluate(() =>
    [
      ".sidebar",
      "#nav",
      "#sidebar-work-journal",
      ".work-note-area",
      "#work-session-panel",
      "#work-session-panel form",
      "#work-paused-list",
    ].flatMap((selector) => {
      const element = document.querySelector(selector);
      if (!element || !element.getClientRects().length) return [];
      return [
        {
          selector,
          height: element.clientHeight,
          contentHeight: element.scrollHeight,
          width: element.clientWidth,
          contentWidth: element.scrollWidth,
          top: element.scrollTop,
          left: element.scrollLeft,
        },
      ];
    }),
  );
  for (const box of geometry) {
    expect(box.contentHeight, box.selector).toBeLessThanOrEqual(box.height + 1);
    expect(box.contentWidth, box.selector).toBeLessThanOrEqual(box.width + 1);
    expect(box.top, box.selector).toBe(0);
    expect(box.left, box.selector).toBe(0);
  }
  for (const pausedRow of await rows(page).all()) {
    await expect(pausedRow).toBeInViewport({ ratio: 1 });
    await expect(
      pausedRow.locator('[data-action="work-paused-open"]'),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      pausedRow.locator('[data-action="work-paused-resume"]'),
    ).toBeInViewport({ ratio: 1 });
  }
  for (const control of await panel(page)
    .locator("button:visible, textarea:visible")
    .all())
    await expect(control).toBeInViewport({ ratio: 1 });
}

const navRects = (page) =>
  page.locator("#nav [data-view]").evaluateAll((nodes) =>
    nodes.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.view,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
const documentPosition = (page) =>
  page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
    nav: document.querySelector("#nav").scrollTop,
  }));
const rawStorage = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
  );

test("paused note title and blank card toggle preserve empty and literal drafts and caret without resuming another running job", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  const { raw } = await seed(page, context);
  const active = await entry(page, "paused-active");
  const title = page.locator("#work-session-title");
  await choose(page, "paused-4");
  await note(page).fill("");
  await expect
    .poll(async () => (await entry(page, "paused-4")).draftNote)
    .toBe("");
  const emptyStorage = await rawStorage(page);
  await title.click();
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await expect(note(page)).toBeHidden();
  await expect(title).toBeFocused();
  expect(await rawStorage(page)).toEqual(emptyStorage);
  await page.keyboard.press("Enter");
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveValue("");
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await rawStorage(page)).toEqual(emptyStorage);

  const literal =
    '  Özgün çalışma notu: 0024594\n\t<img src=x onerror="window.pausedInjected=1"> & sonuç  ';
  await note(page).fill(literal);
  await expect
    .poll(async () => (await entry(page, "paused-4")).draftNote)
    .toBe(literal);
  await note(page).click();
  await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
  await page.locator("#sidebar-saved-count").click();
  await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
  await note(page).evaluate((textarea) => {
    window.pausedTextarea = textarea;
    textarea.setSelectionRange(7, 18);
  });
  const persisted = await rawStorage(page);
  const nav = await navRects(page);
  const position = await documentPosition(page);
  for (const toggle of [
    () => title.click(),
    () => journal(page).click({ position: { x: 5, y: 15 } }),
    () => journal(page).locator(".sidebar-journal-heading").click(),
  ]) {
    await toggle();
    await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
    await expect(title).toHaveAttribute("aria-expanded", "false");
    await expect(note(page)).toBeHidden();
    await expect(note(page)).toHaveValue(literal);
    await expect(title).toHaveAttribute("data-action", "work-note-open");
    await page.clock.runFor(32);
    await noCardScroll(page);
    await toggle();
    await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
    await expect(title).toHaveAttribute("aria-expanded", "true");
    await expect(note(page)).toBeFocused();
    await expect(note(page)).toHaveValue(literal);
    expect(
      await note(page).evaluate((textarea) => ({
        same: textarea === window.pausedTextarea,
        selection: [textarea.selectionStart, textarea.selectionEnd],
      })),
    ).toEqual({ same: true, selection: [7, 18] });
    expect(await rawStorage(page)).toEqual(persisted);
    expect(await navRects(page)).toEqual(nav);
    expect(await documentPosition(page)).toEqual(position);
    await page.clock.runFor(32);
    await noCardScroll(page);
  }
  expect((await session(page)).currentId).toBe("paused-active");
  expect(await entry(page, "paused-active")).toEqual(active);
  await expect(page.locator("#work-running-summary")).toBeVisible();
  await expect(journal(page).getByText(/^Notu (aç|küçült)$/)).toHaveCount(0);
  await expect(journal(page).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.pausedInjected)).toBeUndefined();
  await unchangedPrimary(page, raw);

  await page.reload();
  await page.clock.runFor(32);
  await choose(page, "paused-4", true);
  await expect(note(page)).toHaveValue(literal);
  const reloaded = await rawStorage(page);
  await title.focus();
  await page.keyboard.press("Enter");
  await expect(note(page)).toBeHidden();
  await expect(title).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveValue(literal);
  expect(await rawStorage(page)).toEqual(reloaded);
  expect(await entry(page, "paused-active")).toEqual(active);
  expect((await session(page)).currentId).toBe("paused-active");
  await unchangedPrimary(page, raw);
});

test("failed paused drafts stay expanded through title and blank card clicks until an explicit successful retry", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  const { raw } = await seed(page, context);
  const active = await entry(page, "paused-active");
  await choose(page, "paused-4");
  const title = page.locator("#work-session-title");
  const durable = await rawStorage(page);
  const local = "  Kaydedilemeyen yerel not\nİkinci satır & değişiklik  ";
  await page.evaluate(() => {
    window.pausedQuota = true;
  });
  await note(page).fill(local);
  await note(page).evaluate((textarea) => textarea.setSelectionRange(5, 16));
  await expect(action(page, "work-draft-retry")).toBeVisible();
  for (const quota of [true, false]) {
    await page.evaluate((value) => {
      window.pausedQuota = value;
    }, quota);
    for (const toggle of [
      () => title.click(),
      () => journal(page).click({ position: { x: 5, y: 15 } }),
      async () => {
        await title.focus();
        await page.keyboard.press("Enter");
      },
    ]) {
      await toggle();
      await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
      await expect(title).toHaveAttribute("aria-expanded", "true");
      await expect(note(page)).toBeFocused();
      await expect(note(page)).toHaveValue(local);
      await expect(page.locator("#work-note-error")).toBeVisible();
      await expect(action(page, "work-draft-retry")).toBeVisible();
      expect(
        await note(page).evaluate((textarea) => [
          textarea.selectionStart,
          textarea.selectionEnd,
        ]),
      ).toEqual([5, 16]);
      expect(await rawStorage(page)).toEqual(durable);
    }
  }
  await action(page, "work-draft-retry").click();
  await expect
    .poll(async () => (await entry(page, "paused-4")).draftNote)
    .toBe(local);
  await expect(action(page, "work-draft-retry")).toBeHidden();
  const recovered = await rawStorage(page);
  await title.click();
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  await journal(page).click({ position: { x: 5, y: 15 } });
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveValue(local);
  expect(await rawStorage(page)).toEqual(recovered);
  expect(await entry(page, "paused-active")).toEqual(active);
  expect((await session(page)).currentId).toBe("paused-active");
  await unchangedPrimary(page, raw);
});

test("only the latest three eligible paused notes are shown and selecting one never resumes or duplicates it before an explicit resume", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const { raw } = await seed(page, context);
  const before = await saved(page, SESSION);
  const beforeEntries = (await session(page)).entries;
  await expect(rows(page)).toHaveCount(3);
  await noCardScroll(page);
  for (const pausedRow of await rows(page).all()) {
    await expect(pausedRow).toBeInViewport({ ratio: 1 });
    const title = pausedRow.locator('[data-action="work-paused-open"]');
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(
      pausedRow.locator('[data-action="work-paused-resume"]'),
    ).toBeInViewport({ ratio: 1 });
    const lines = await title.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(lines.height).toBeGreaterThan(lines.lineHeight * 1.5);
    expect(lines.height).toBeLessThanOrEqual(lines.lineHeight * 2 + 1);
  }
  await expect(rows(page).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.pausedInjected)).toBeUndefined();
  await expect(note(page)).toHaveAccessibleName("Çalışma notu");
  await expect(page.locator("#work-session-note-label")).toBeHidden();
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.clock.runFor(32);
  await choose(page, "paused-4");
  await expect(note(page)).toHaveValue("4. duraklatılmış işin ayrı notu");
  await expect(rows(page)).toHaveCount(2);
  await noCardScroll(page);
  expect(await rowIds(page)).toEqual(["paused-3", "paused-2"]);
  for (const pausedRow of await rows(page).all()) {
    await expect(pausedRow).toBeInViewport({ ratio: 1 });
    await expect(
      pausedRow.locator('[data-action="work-paused-open"]'),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      pausedRow.locator('[data-action="work-paused-resume"]'),
    ).toBeInViewport({ ratio: 1 });
  }
  expect(await session(page)).toMatchObject({ currentId: "paused-active" });
  expect(await saved(page, SESSION)).toBe(before);
  await expect(page.locator("#work-running-summary")).toBeVisible();
  await expect(page.locator(".work-running-title")).toHaveText(ACTIVE_TITLE);
  await action(page, "work-running-open").click();
  await expect(note(page)).toHaveValue("Aktif işin korunacak notu");
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await page.clock.runFor(32);
  expect(await rowIds(page)).toEqual(["paused-4", "paused-3", "paused-2"]);
  expect(await saved(page, SESSION)).toBe(before);
  await choose(page, "paused-3", true);
  expect(await rowIds(page)).toEqual(["paused-4", "paused-2"]);
  expect(await saved(page, SESSION)).toBe(before);
  await row(page, "paused-4")
    .locator('[data-action="work-paused-resume"]')
    .click();
  await expect(page.locator("#work-session-title")).toHaveAttribute(
    "data-id",
    "paused-4",
  );
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveValue("4. duraklatılmış işin ayrı notu");
  await page.clock.runFor(32);
  await noCardScroll(page);
  const resumed = await session(page);
  const selected = resumed.entries.find((item) => item.recordId === "paused-4");
  expect(selected).toMatchObject({
    status: "running",
    startedAt: NOW.getTime(),
    trackTime: false,
    elapsedMs: 0,
  });
  expect(selected.ownerId).toEqual(expect.any(String));
  expect(selected.ownerId).not.toBe("");
  expect(resumed.currentId).toBe("paused-4");
  expect(resumed.entries).toEqual(
    beforeEntries.map((item) =>
      item.recordId === "paused-active"
        ? {
            ...item,
            status: "paused",
            startedAt: null,
            ownerId: null,
            updatedAt: NOW.getTime(),
          }
        : item.recordId === "paused-4"
          ? {
              ...item,
              status: "running",
              startedAt: NOW.getTime(),
              ownerId: selected.ownerId,
              updatedAt: NOW.getTime(),
            }
          : item,
    ),
  );
  expect(await rowIds(page)).toEqual(["paused-active", "paused-3", "paused-2"]);
  await note(page).evaluate((textarea) =>
    textarea.setSelectionRange(textarea.value.length, textarea.value.length),
  );
  const beforeDraftEnter = await saved(page, SESSION);
  await note(page).press("Enter");
  await expect(note(page)).toHaveValue("4. duraklatılmış işin ayrı notu");
  await expect(note(page)).toBeFocused();
  expect(await saved(page, SESSION)).toBe(beforeDraftEnter);
  await note(page).press("Shift+Enter");
  let multiline = "4. duraklatılmış işin ayrı notu\n";
  await expect(note(page)).toHaveValue(multiline);
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await expect
    .poll(async () => (await entry(page, "paused-4")).draftNote)
    .toBe(multiline);
  const beforeIgnoredKeys = await saved(page, SESSION);
  for (const ignored of [
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
    { keyCode: 229 },
  ]) {
    await page.locator("html").dispatchEvent("keydown", {
      key: "p",
      code: "KeyP",
      ctrlKey: true,
      ...ignored,
    });
    await expect(panel(page)).toHaveAttribute("data-phase", "running");
    await expect(note(page)).toHaveValue(multiline);
    expect(await saved(page, SESSION)).toBe(beforeIgnoredKeys);
  }
  await page.evaluate(() => {
    window.pausedQuota = true;
  });
  multiline += "Enter ile yeniden kaydedilecek yerel taslak";
  await note(page).fill(multiline);
  await expect(action(page, "work-draft-retry")).toBeVisible();
  await note(page).press("Enter");
  await expect(note(page)).toHaveValue(multiline);
  await expect(note(page)).toBeFocused();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  expect(await saved(page, SESSION)).toBe(beforeIgnoredKeys);
  await page.evaluate(() => {
    window.pausedQuota = false;
  });
  await note(page).press("Enter");
  await expect(note(page)).toHaveValue(multiline);
  expect(await saved(page, SESSION)).toBe(beforeIgnoredKeys);
  await expect(action(page, "work-draft-retry")).toBeVisible();
  await action(page, "work-draft-retry").click();
  await expect
    .poll(async () => (await entry(page, "paused-4")).draftNote)
    .toBe(multiline);
  await expect(action(page, "work-draft-retry")).toBeHidden();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  const outsideNote = page.locator('#nav [data-view="daily"]');
  await outsideNote.focus();
  await page.keyboard.press("Control+p");
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  await page.clock.runFor(32);
  await noCardScroll(page);
  await expect(note(page)).toHaveValue(multiline);
  expect(await rowIds(page)).toEqual(["paused-active", "paused-3"]);
  await expect(page.locator("#work-running-summary")).toBeHidden();
  expect(
    (await session(page)).entries.filter((item) => item.status === "running"),
  ).toHaveLength(0);
  await action(page, "work-resume").focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await expect(note(page)).toBeFocused();
  await outsideNote.focus();
  await page.keyboard.press("Control+p");
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  const beforeTitleOpen = await saved(page, SESSION);
  await page.locator("#work-session-title").focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
  await expect(note(page)).toBeFocused();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await saved(page, SESSION)).toBe(beforeTitleOpen);
  await outsideNote.focus();
  await page.keyboard.press("Control+p");
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await expect(note(page)).toHaveValue(multiline);
  await page.clock.runFor(32);
  await noCardScroll(page);

  const beforeForeignForm = await saved(page, SESSION);
  await page
    .locator('.full-table [data-action="edit"][data-id="paused-1"]')
    .first()
    .click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.keyboard.press("Control+p");
  expect(await saved(page, SESSION)).toBe(beforeForeignForm);
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#editor")).toBeVisible();
  expect(await saved(page, SESSION)).toBe(beforeForeignForm);
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await saved(page, SESSION)).toBe(beforeForeignForm);
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  await unchangedPrimary(page, raw);
  await outsideNote.focus();
  await page.keyboard.press("Control+Enter");
  await expect(panel(page)).toHaveAttribute("data-mode", "finish");
  await expect(page.locator("#work-finish-form")).toBeVisible();
  await expect(note(page)).toHaveValue(multiline);
  await note(page).fill(" \n ");
  await note(page).press("Control+Enter");
  await expect
    .poll(async () => (await entry(page, "paused-4")).status)
    .toBe("finished");
  expect(
    (await session(page)).entries.filter(
      (item) => item.sessionId === selected.sessionId,
    ),
  ).toHaveLength(1);
  await unchangedPrimary(page, raw);
});

test("failed drafts block paused-note switching and keyboard selection keeps the persistent editor visible without card or navigation scrolling", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  const { raw } = await seed(page, context);
  const before = await saved(page, SESSION);
  await page.evaluate(() => {
    window.pausedQuota = true;
  });
  await note(page).fill("Kaydedilemeyen aktif notun kaybolmayacak yerel metni");
  await expect(action(page, "work-draft-retry")).toBeVisible();
  await row(page, "paused-4")
    .locator('[data-action="work-paused-open"]')
    .click();
  await expect(page.locator("#work-session-title")).toHaveAttribute(
    "data-id",
    "paused-active",
  );
  await expect(note(page)).toHaveValue(
    "Kaydedilemeyen aktif notun kaybolmayacak yerel metni",
  );
  expect(await saved(page, SESSION)).toBe(before);
  await page.evaluate(() => {
    window.pausedQuota = false;
  });
  await action(page, "work-draft-retry").click();
  await expect
    .poll(async () => (await entry(page, "paused-active")).draftNote)
    .toBe("Kaydedilemeyen aktif notun kaybolmayacak yerel metni");
  const active = await entry(page, "paused-active");
  const initialText = (await entry(page, "paused-2")).draftNote;
  const wideNav = await navRects(page);
  const position = await documentPosition(page);
  await choose(page, "paused-2", true);
  await expect(note(page)).toBeInViewport({ ratio: 1 });
  await expect(note(page)).toHaveValue(initialText);
  await expect(page.locator("#work-session-note-label")).toBeHidden();
  await expect(note(page)).toHaveAccessibleName("Çalışma notu");
  await note(page).evaluate((textarea) => {
    window.pausedTextarea = textarea;
    textarea.setSelectionRange(3, 3);
  });
  await note(page).pressSequentially("X");
  const editedText = `${initialText.slice(0, 3)}X${initialText.slice(3)}`;
  await expect
    .poll(async () => (await entry(page, "paused-2")).draftNote)
    .toBe(editedText);
  await context.clock.runFor(1000);
  expect(
    await note(page).evaluate((textarea) => textarea === window.pausedTextarea),
  ).toBe(true);
  expect(
    await note(page).evaluate((textarea) => [
      textarea.selectionStart,
      textarea.selectionEnd,
    ]),
  ).toEqual([4, 4]);
  expect(await rowIds(page)).toEqual(["paused-4", "paused-3"]);
  expect(await navRects(page)).toEqual(wideNav);
  expect(await documentPosition(page)).toEqual(position);
  await noCardScroll(page);

  const longText = Array.from(
    { length: 80 },
    (_, index) => `${index + 1}. satır: ${editedText}`,
  ).join("\n");
  await note(page).fill(longText);
  await expect
    .poll(async () => (await entry(page, "paused-2")).draftNote)
    .toBe(longText);
  await note(page).evaluate((textarea) => {
    textarea.setSelectionRange(7, 7);
    textarea.scrollTop = textarea.scrollHeight;
  });
  await page.setViewportSize({ width: 1280, height: 400 });
  await context.clock.runFor(32);
  const shortNav = await navRects(page);
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toBeInViewport({ ratio: 1 });
  await expect(note(page)).toHaveValue(longText);
  expect(
    await note(page).evaluate((textarea) => textarea === window.pausedTextarea),
  ).toBe(true);
  expect(
    await note(page).evaluate((textarea) => [
      textarea.selectionStart,
      textarea.selectionEnd,
    ]),
  ).toEqual([7, 7]);
  expect(await rows(page).count()).toBeLessThanOrEqual(2);
  await noCardScroll(page);
  await note(page).evaluate((textarea) => {
    textarea.scrollTop = textarea.scrollHeight;
  });
  const textareaScroll = await note(page).evaluate((textarea) => ({
    top: textarea.scrollTop,
    content: textarea.scrollHeight,
    height: textarea.clientHeight,
  }));
  expect(textareaScroll.content).toBeGreaterThan(textareaScroll.height);
  expect(textareaScroll.top).toBeGreaterThan(0);
  expect(await navRects(page)).toEqual(shortNav);
  expect(await documentPosition(page)).toEqual(position);
  await noCardScroll(page);
  expect((await entry(page, "paused-2")).status).toBe("paused");
  expect((await session(page)).currentId).toBe("paused-active");
  expect(await entry(page, "paused-active")).toEqual(active);
  await unchangedPrimary(page, raw);
});
