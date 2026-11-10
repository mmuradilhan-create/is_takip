import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  readEffectiveWorkSession,
  readEffectiveWorkSessionRaw,
  workspaceDomainRaw,
} from "./work-session-support.js";
import { appConfirms } from "./app-confirm-support.js";

const KEY = "is-takip-v1";
const PREFERENCES_KEY = `${KEY}-preferences`;
const SESSION_KEY = `${KEY}-work-session`;
const START = new Date("2026-11-07T12:00:00Z");

function fixture() {
  return [
    createRecord({
      id: "work-weekly",
      type: "weekly",
      title: "Çalışma oturumunun haftalık hedefi",
      periodKey: "2026-W45",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      createdAt: "2026-11-01T09:00:00Z",
      updatedAt: "2026-11-01T09:00:00Z",
    }),
    createRecord({
      id: "work-first",
      title: '<img src=x onerror="window.workSessionInjected=1"> İlk çalışma',
      parentId: "work-weekly",
      status: "waiting",
      priority: "high",
      dueDate: "2026-11-10",
      nextAction: "Ölçüm sonuçlarını kontrol et ve raporu paylaş",
      description:
        "<script>window.workSessionInjected=1</script> Özgün çalışma notu",
      waitingReason: "Tasarım yanıtı bekleniyor",
      sourceFields: { "Özgün bilgi": { value: "Kaybolmaması gereken veri" } },
      createdAt: "2026-11-01T09:00:00Z",
      updatedAt: "2026-11-01T09:00:00Z",
    }),
    createRecord({
      id: "work-second",
      title: "İkinci çalışma",
      status: "waiting",
      dueDate: "2026-11-11",
      nextAction: "Yanıtı değerlendir",
      createdAt: "2026-11-01T09:00:00Z",
      updatedAt: "2026-11-01T09:00:00Z",
    }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      createRecord({
        id: `work-${status}`,
        title: `Kapalı çalışma ${status}`,
        status,
        createdAt: "2026-11-01T09:00:00Z",
        updatedAt: "2026-11-01T09:00:00Z",
      }),
    ),
  ];
}

async function clock(page) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START);
}

async function seed(page, records = fixture(), workRaw = null) {
  await clock(page);
  await page.addInitScript(
    ({ key, preferencesKey, sessionKey, records, workRaw }) => {
      if (!sessionStorage.getItem("work-session-test-seeded")) {
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
        localStorage.setItem(
          preferencesKey,
          JSON.stringify({ density: "comfortable" }),
        );
        if (workRaw === null) localStorage.removeItem(sessionKey);
        else localStorage.setItem(sessionKey, workRaw);
        sessionStorage.setItem("work-session-test-seeded", "true");
      }
    },
    {
      key: KEY,
      preferencesKey: PREFERENCES_KEY,
      sessionKey: SESSION_KEY,
      records,
      workRaw,
    },
  );
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return records;
}

const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const workButton = (page, id) => row(page, id).locator(".work-start");
const panel = (page) => page.locator("#work-session-panel");
const draft = (page) => page.locator("#work-session-note");
const finish = (page) => page.locator("#work-finish-form");
const currentEntry = async (page, id = "work-first") =>
  (await currentState(page)).entries.find((entry) => entry.recordId === id);
async function expectFullSidebarControl(control) {
  await expect(control).toBeVisible();
  const geometry = await control.evaluate((element) => {
    const bounds = [
      { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
    ];
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    )
      if (
        parent.matches(
          ".sidebar, #sidebar-work-journal, .work-note-area, #work-session-panel, form",
        )
      )
        bounds.push(parent.getBoundingClientRect().toJSON());
    const caption = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      caption.push(...[...range.getClientRects()].map((rect) => rect.toJSON()));
    }
    return {
      box: element.getBoundingClientRect().toJSON(),
      bounds,
      content: [
        ...caption,
        ...[...element.querySelectorAll("svg")].map((icon) =>
          icon.getBoundingClientRect().toJSON(),
        ),
      ],
    };
  });
  for (const clip of geometry.bounds) {
    expect(geometry.box.left).toBeGreaterThanOrEqual(clip.left - 1);
    expect(geometry.box.top).toBeGreaterThanOrEqual(clip.top - 1);
    expect(geometry.box.right).toBeLessThanOrEqual(clip.right + 1);
    expect(geometry.box.bottom).toBeLessThanOrEqual(clip.bottom + 1);
    for (const content of geometry.content) {
      expect(content.left).toBeGreaterThanOrEqual(clip.left);
      expect(content.top).toBeGreaterThanOrEqual(clip.top);
      expect(content.right).toBeLessThanOrEqual(clip.right);
      expect(content.bottom).toBeLessThanOrEqual(clip.bottom);
    }
  }
}

const noClocks = (page) =>
  expect(
    page.locator(
      "#work-session-time, #sidebar-saved-time, #work-finish-duration",
    ),
  ).toHaveCount(0);
const currentState = (page) => readEffectiveWorkSession(page);
const primaryState = async (page) => {
  const state = await page.evaluate(
    ({ key, preferencesKey }) => ({
      records: localStorage.getItem(key),
      preferences: localStorage.getItem(preferencesKey),
    }),
    { key: KEY, preferencesKey: PREFERENCES_KEY },
  );
  return { ...state, records: workspaceDomainRaw(state.records) };
};

async function start(page, id = "work-first") {
  await workButton(page, id).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#status-menu")).not.toBeVisible();
}

async function chooseStatus(page, id, status) {
  if (status === "completed") {
    await row(page, id).locator(".quick-complete").click();
    await expect(page.locator("#status-menu")).not.toBeVisible();
    return;
  }
  await row(page, id).locator(".status-trigger").click();
  await expect(page.locator("#status-menu")).toBeVisible();
  await page.locator(`#status-menu [data-status="${status}"]`).click();
  await expect(page.locator("#status-menu")).not.toBeVisible();
}

test("inline work notes pause and resume without timing while finishing saves one result and exact journal Undo", async ({
  page,
}) => {
  const records = await seed(page);
  const saved = await primaryState(page);
  await noClocks(page);
  await start(page);
  await expect(draft(page)).toBeFocused();
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  await expect(page.locator("#work-session-title")).toHaveText(
    records[1].title,
  );
  await expect(workButton(page, "work-first")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await draft(page).fill("İlk çalışmanın kaybolmayacak taslağı");
  await expect
    .poll(async () => (await currentEntry(page)).draftNote)
    .toBe("İlk çalışmanın kaybolmayacak taslağı");
  await page.clock.fastForward(65_000);
  await noClocks(page);
  expect(await currentEntry(page)).toMatchObject({
    trackTime: false,
    elapsedMs: 0,
  });
  expect(await primaryState(page)).toEqual(saved);
  const toggle = panel(page).getByRole("button", {
    name: /^(Duraklat|Devam et)$/,
  });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  await expect(panel(page)).toHaveAttribute("data-collapsed", "true");
  await expect(draft(page)).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(finish(page)).not.toBeVisible();
  expect(await currentEntry(page)).toMatchObject({
    status: "paused",
    elapsedMs: 0,
    startedAt: null,
    draftNote: "İlk çalışmanın kaybolmayacak taslağı",
  });
  await page.clock.fastForward(120_000);
  await page.keyboard.press("Space");
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await expect(panel(page)).toHaveAttribute("data-collapsed", "false");
  await expect(draft(page)).toBeFocused();
  await panel(page).locator('[data-action="work-finish"]').click();
  await expect(finish(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-mode", "finish");
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(draft(page)).toHaveValue("İlk çalışmanın kaybolmayacak taslağı");
  await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
  await panel(page).locator('[data-action="work-finish-cancel"]').click();
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  expect(await primaryState(page)).toEqual(saved);
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(draft(page)).toHaveValue("İlk çalışmanın kaybolmayacak taslağı");
  expect(await primaryState(page)).toEqual(saved);
  await start(page, "work-second");
  await draft(page).fill("İkinci işin kaydedilecek sonucu");
  await panel(page).locator('[data-action="work-finish"]').click();
  await finish(page)
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(panel(page)).not.toBeVisible();
  await noClocks(page);
  const stored = JSON.parse((await primaryState(page)).records);
  const shortSession = stored.records.find(
    (record) => record.id === "work-second",
  ).workLog;
  expect(shortSession).toHaveLength(1);
  expect(shortSession[0]).toMatchObject({
    durationMs: 0,
    note: "İkinci işin kaydedilecek sonucu",
  });
  expect(stored.records).toEqual(
    records.map((record) =>
      record.id === "work-second"
        ? {
            ...record,
            workLog: shortSession,
            updatedAt: shortSession[0].endedAt,
          }
        : record,
    ),
  );
  expect(stored.odak.history).toHaveLength(1);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await primaryState(page)).toEqual(saved);
});

test("switching work keeps only one running session and resumes each unfinished draft", async ({
  page,
}) => {
  await seed(page);
  const saved = await primaryState(page);
  await start(page);
  await draft(page).fill("Birinci işe ait ayrı çalışma notu");
  await start(page, "work-second");
  await expect(page.locator("#work-session-title")).toHaveText(
    "İkinci çalışma",
  );
  await expect(draft(page)).toHaveValue("");
  await draft(page).fill("İkinci işe ait ayrı çalışma notu");
  let state = await currentState(page);
  expect(
    state.entries.filter((entry) => entry.status === "running"),
  ).toHaveLength(1);
  expect(await currentEntry(page)).toMatchObject({
    status: "paused",
    elapsedMs: 0,
    draftNote: "Birinci işe ait ayrı çalışma notu",
  });
  await start(page);
  await expect(draft(page)).toHaveValue("Birinci işe ait ayrı çalışma notu");
  state = await currentState(page);
  expect(
    state.entries.filter((entry) => entry.status === "running"),
  ).toHaveLength(1);
  expect(await currentEntry(page, "work-second")).toMatchObject({
    status: "paused",
    elapsedMs: 0,
    draftNote: "İkinci işe ait ayrı çalışma notu",
  });
  expect(await primaryState(page)).toEqual(saved);
  await panel(page).locator('[data-action="work-finish"]').click();
  await panel(page).locator('[data-action="work-finish-cancel"]').click();
  await start(page);
  await expect(draft(page)).toHaveValue("Birinci işe ait ayrı çalışma notu");
  await noClocks(page);
  expect(await primaryState(page)).toEqual(saved);
});

test("only daily work opens a working notepad, including goal panel steps, and a forged goal action is ignored", async ({
  page,
}) => {
  const records = [
    ...fixture(),
    ...["monthly", "yearly", "meeting", "waiting"].map((type) =>
      createRecord({
        id: `no-timer-${type}`,
        type,
        title: `Sayaçsız ${type}`,
      }),
    ),
  ];
  await seed(page, records);
  const saved = await primaryState(page);
  for (const type of ["weekly", "monthly", "yearly", "meeting", "waiting"]) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await expect(
      page.locator(".full-table > tbody > tr[data-record-row] .work-start"),
    ).toHaveCount(0);
  }
  await page.locator('#nav [data-view="weekly"]').click();
  await row(page, "work-weekly")
    .locator('[data-action="goal-details"]')
    .click();
  await expect(
    page.locator(
      '#goal-detail-panel .goal-child-row[data-id="work-first"] .work-start',
    ),
  ).toBeVisible();
  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.dataset.action = "work-start";
    trigger.dataset.id = "work-weekly";
    document.querySelector("#app").append(trigger);
    trigger.click();
    trigger.remove();
  });
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await primaryState(page)).toEqual(saved);
});

test("a legacy running goal session is paused without creating or changing records", async ({
  page,
}) => {
  const records = fixture();
  const legacy = {
    version: 1,
    currentId: "work-weekly",
    entries: [
      {
        recordId: "work-weekly",
        status: "running",
        elapsedMs: 9000,
        startedAt: START.getTime() - 4000,
        ownerId: "old-window",
        updatedAt: START.getTime() - 4000,
      },
    ],
  };
  await seed(page, records, JSON.stringify(legacy));
  await expect(panel(page)).not.toBeVisible();
  const state = await currentState(page);
  expect(
    state.entries.find((entry) => entry.recordId === "work-weekly").status,
  ).toBe("paused");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBe(JSON.stringify(legacy));
  await page.clock.fastForward(60_000);
  expect(
    (await currentState(page)).entries.filter(
      (entry) => entry.status === "running",
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records,
      KEY,
    ),
  ).toEqual(records);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("main windows share one untimed note session and only its owner pauses on page closure", async ({
  page,
  context,
}) => {
  await seed(page);
  const saved = await primaryState(page);
  await start(page);
  await draft(page).fill("Pencereler arasında korunan çalışma notu");
  const other = await context.newPage();
  await other.goto("/");
  await expect(panel(other)).toHaveAttribute("data-phase", "running");
  await expect(draft(other)).toHaveValue(
    "Pencereler arasında korunan çalışma notu",
  );
  await panel(other)
    .getByRole("button", { name: "Duraklat", exact: true })
    .click();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await panel(other)
    .getByRole("button", { name: "Devam et", exact: true })
    .click();
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  await page.close();
  await expect(panel(other)).toHaveAttribute("data-phase", "running");
  await other.reload();
  await expect(panel(other)).toHaveAttribute("data-phase", "paused");
  await expect(draft(other)).toHaveValue(
    "Pencereler arasında korunan çalışma notu",
  );
  await noClocks(other);
  expect(await currentEntry(other)).toMatchObject({
    elapsedMs: 0,
    trackTime: false,
  });
  expect(await primaryState(other)).toEqual(saved);
});

test("the sidebar work notepad stays bounded and escapes real text without moving the task list", async ({
  page,
}, testInfo) => {
  const records = await seed(page);
  const saved = await primaryState(page);
  const before = await row(page, "work-first").boundingBox();
  await start(page);
  const after = await row(page, "work-first").boundingBox();
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  await expect(page.locator("#sidebar-work-journal h2")).toHaveText(
    "Çalışma notu",
  );
  await expect(page.locator("#work-session-title")).toHaveText(
    records[1].title,
  );
  const text =
    '<img src=x onerror="window.workSessionInjected=1">\nKaybolmayan gerçek çalışma notu';
  await draft(page).fill(text);
  await expect(draft(page)).toHaveValue(text);
  await expect(panel(page).locator("img, script")).toHaveCount(0);
  await expect(
    panel(page).getByRole("button", {
      name: "Notlar ve sonraki adım",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.workSessionInjected)).toBeUndefined();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.clock.runFor(32);
    await expect(panel(page)).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await panel(page).boundingBox();
    const sidebar = await page.locator(".sidebar").boundingBox();
    const nav = await page.locator("#nav").boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(sidebar.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      sidebar.x + sidebar.width,
    );
    expect(bounds.y).toBeGreaterThanOrEqual(nav.y + nav.height);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await expect(
      page.locator(".sidebar #sidebar-work-journal #work-session-panel"),
    ).toBeVisible();
    await expect(draft(page)).toBeInViewport({ ratio: 1 });
    for (const action of ["work-pause", "work-finish"])
      await expectFullSidebarControl(
        panel(page).locator(`[data-action="${action}"]`),
      );
  }
  await page.screenshot({
    path: testInfo.outputPath("work-session-notepad.png"),
    fullPage: false,
  });
  await noClocks(page);
  await expect(panel(page)).toHaveAttribute("data-phase", "running");
  expect(await primaryState(page)).toEqual(saved);
});

test("closed and removed work is stopped without changing lifecycle status, and record undo remains intact", async ({
  page,
}) => {
  const records = await seed(page);
  await selectListStatus(page, "all");
  for (const status of ["completed", "cancelled", "transferred"])
    await expect(workButton(page, `work-${status}`)).toBeDisabled();
  await start(page);
  const workingDraft = "Tamamlandıktan sonra geri alınabilen çalışma notu";
  await draft(page).fill(workingDraft);
  await expect
    .poll(async () => (await currentEntry(page)).draftNote)
    .toBe(workingDraft);
  await page.clock.fastForward(9_000);
  await chooseStatus(page, "work-first", "completed");
  await expect(panel(page)).not.toBeVisible();
  expect(
    (await currentState(page)).entries.filter(
      (entry) => entry.status === "running",
    ),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).records,
    KEY,
  );
  expect(saved).toEqual(records);
  await start(page);
  await expect(draft(page)).toHaveValue(workingDraft);
  await row(page, "work-first").locator(".task-name").click();
  appConfirms(page).once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#editor")
    .getByRole("button", { name: "Kaydı sil", exact: true })
    .click();
  await expect(panel(page)).not.toBeVisible();
  expect(
    (await currentState(page)).entries.filter(
      (entry) => entry.status === "running",
    ),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records,
      KEY,
    ),
  ).toEqual(records);
  await start(page);
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const beforeReset = await primaryState(page);
  await page
    .getByRole("button", { name: "Çalışma alanını sıfırla", exact: true })
    .click();
  const resetDialog = page.locator("#workspace-reset-dialog");
  await expect(resetDialog).toBeVisible();
  expect(await primaryState(page)).toEqual(beforeReset);
  expect(
    (await currentState(page)).entries.filter(
      (entry) => entry.status === "running",
    ),
  ).toHaveLength(1);
  await resetDialog.locator('[data-action="confirm-reset-workspace"]').click();
  await expect(resetDialog).not.toBeVisible();
  await expect(panel(page)).not.toBeVisible();
  expect(
    (await currentState(page)).entries.filter(
      (entry) => entry.status === "running",
    ),
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).records,
      KEY,
    ),
  ).toEqual([]);
});

test("corrupt work-session storage does not overwrite session data or prevent the task list from opening", async ({
  page,
}) => {
  await seed(page, fixture(), "broken-work-session-json");
  const saved = await primaryState(page);
  await expect(row(page, "work-first")).toBeVisible();
  if (await workButton(page, "work-first").isEnabled())
    await workButton(page, "work-first").click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#status-menu")).not.toBeVisible();
  await expect(panel(page)).not.toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBe("broken-work-session-json");
  expect(await readEffectiveWorkSessionRaw(page)).toBe(
    "broken-work-session-json",
  );
  expect(await primaryState(page)).toEqual(saved);
});

test("cancelling inline finish keeps its draft and every saved historical session through reload without offering discard", async ({
  page,
}) => {
  const records = fixture();
  records[1].workLog = [
    {
      id: "preserved-saved-session",
      date: "2026-11-07",
      endedAt: START.toISOString(),
      durationMs: 120_789,
      note: "Önceden kaydedilmiş sonuç",
      nextAction: "Önceki kayıt korunur",
    },
  ];
  const otherContext = {
    recordId: "work-second",
    sessionId: "preserved-paused-context",
    status: "paused",
    elapsedMs: 2_345,
    startedAt: null,
    ownerId: null,
    updatedAt: START.getTime(),
  };
  await seed(
    page,
    records,
    JSON.stringify({ version: 1, currentId: null, entries: [otherContext] }),
  );
  const saved = await primaryState(page);
  await start(page);
  await draft(page).fill("Henüz kaydedilmeyen taslak sonuç");
  await panel(page).locator('[data-action="work-finish"]').click();
  await expect(finish(page)).toBeVisible();
  await expect(draft(page)).toHaveValue("Henüz kaydedilmeyen taslak sonuç");
  await expect(
    finish(page).getByRole("button", { name: "Kaydı sil", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
  await noClocks(page);
  expect(await currentEntry(page, "work-second")).toEqual(otherContext);
  expect(await primaryState(page)).toEqual(saved);
  await panel(page).locator('[data-action="work-finish-cancel"]').click();
  await expect(panel(page)).toHaveAttribute("data-mode", "note");
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(draft(page)).toHaveValue("Henüz kaydedilmeyen taslak sonuç");
  expect(await primaryState(page)).toEqual(saved);
  await page.reload();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(draft(page)).toHaveValue("Henüz kaydedilmeyen taslak sonuç");
  expect(await currentEntry(page, "work-second")).toEqual(otherContext);
  expect(await primaryState(page)).toEqual(saved);
  expect(JSON.parse((await primaryState(page)).records).records).toEqual(
    records,
  );
});
