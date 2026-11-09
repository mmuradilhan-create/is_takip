import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const SESSION = `${KEY}-work-session`;
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-02T09:00:00.000Z";
const ACTIVE_TITLE =
  "Kontrol belgelerini incele ve tasarım değerlendirmesini hazırlayarak teknik ekiple paylaş";
const journal = (page) => page.locator("#sidebar-work-journal");
const panel = (page) => page.locator("#work-session-panel");
const note = (page) => page.locator("#work-session-note");
const rows = (page) => page.locator("#work-paused-list > .work-paused-row");
const row = (page, id) =>
  rows(page).filter({
    has: page.locator(`[data-action="work-paused-open"][data-id="${id}"]`),
  });
const action = (page, name) => journal(page).locator(`[data-action="${name}"]`);
const saved = (page, key = KEY) =>
  page.evaluate((key) => localStorage.getItem(key), key);
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
      window.pausedQuota = false;
      window.pausedPrimaryWrites = 0;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (
          this === window.localStorage &&
          name === sessionKey &&
          window.pausedQuota
        )
          throw new DOMException("Test depolaması dolu", "QuotaExceededError");
        const result = set.call(this, name, value);
        if (this === window.localStorage && name === key)
          window.pausedPrimaryWrites++;
        return result;
      };
    },
    {
      key: KEY,
      sessionKey: SESSION,
      raw,
      sessionRaw: JSON.stringify(data.context),
    },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
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
}

async function unchangedPrimary(page, raw) {
  expect(await saved(page)).toBe(raw);
  expect(await page.evaluate(() => window.pausedPrimaryWrites)).toBe(0);
}

test("only the latest three eligible paused notes are shown and selecting one never resumes or duplicates it before an explicit resume", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const { raw } = await seed(page, context);
  const before = await saved(page, SESSION);
  const beforeEntries = (await session(page)).entries;
  await expect(rows(page)).toHaveCount(3);
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
  await choose(page, "paused-4");
  await expect(note(page)).toHaveValue("4. duraklatılmış işin ayrı notu");
  await expect(rows(page)).toHaveCount(2);
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
  await action(page, "work-pause").click();
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  await expect(note(page)).toHaveValue("4. duraklatılmış işin ayrı notu");
  expect(await rowIds(page)).toEqual(["paused-active", "paused-3"]);
  await expect(page.locator("#work-running-summary")).toBeHidden();
  expect(
    (await session(page)).entries.filter((item) => item.status === "running"),
  ).toHaveLength(0);
  await unchangedPrimary(page, raw);
});

test("failed drafts block paused-note switching and scrolled keyboard selection reveals the right persistent editor without moving fixed navigation", async ({
  page,
  context,
}) => {
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
  let text = (await entry(page, "paused-2")).draftNote;
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1280, height: 400 },
  ]) {
    await page.setViewportSize(viewport);
    if (
      (await page.locator("#work-session-title").getAttribute("data-id")) !==
      "paused-active"
    )
      await action(page, "work-running-open").click();
    const navBefore = await page
      .locator("#nav [data-view]")
      .evaluateAll((nodes) =>
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
    const position = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      nav: document.querySelector("#nav").scrollTop,
    }));
    const area = journal(page).locator(".work-note-area");
    await area.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const button = row(page, "paused-2").locator(
      '[data-action="work-paused-open"]',
    );
    await button.scrollIntoViewIfNeeded();
    if (viewport.height === 400)
      expect(
        await area.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#work-session-title")).toHaveAttribute(
      "data-id",
      "paused-2",
    );
    await expect(note(page)).toBeFocused();
    await expect(note(page)).toBeInViewport({ ratio: 1 });
    await expect(note(page)).toHaveValue(text);
    await expect(page.locator("#work-session-note-label")).toBeHidden();
    await expect(note(page)).toHaveAccessibleName("Çalışma notu");
    await note(page).evaluate((textarea) => {
      window.pausedTextarea = textarea;
      textarea.setSelectionRange(3, 3);
    });
    await note(page).pressSequentially("X");
    text = `${text.slice(0, 3)}X${text.slice(3)}`;
    await expect
      .poll(async () => (await entry(page, "paused-2")).draftNote)
      .toBe(text);
    await context.clock.runFor(1000);
    expect(
      await note(page).evaluate(
        (textarea) => textarea === window.pausedTextarea,
      ),
    ).toBe(true);
    expect(
      await note(page).evaluate((textarea) => [
        textarea.selectionStart,
        textarea.selectionEnd,
      ]),
    ).toEqual([4, 4]);
    expect((await entry(page, "paused-2")).status).toBe("paused");
    expect((await session(page)).currentId).toBe("paused-active");
    expect(await entry(page, "paused-active")).toEqual(active);
    expect(await rowIds(page)).toEqual(["paused-4", "paused-3"]);
    const navAfter = await page
      .locator("#nav [data-view]")
      .evaluateAll((nodes) =>
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
    expect(navAfter).toEqual(navBefore);
    expect(
      await page.evaluate(() => ({
        x: scrollX,
        y: scrollY,
        nav: document.querySelector("#nav").scrollTop,
      })),
    ).toEqual(position);
    expect(
      await page
        .locator("#nav")
        .evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
    ).toBe(true);
    await unchangedPrimary(page, raw);
  }
});
