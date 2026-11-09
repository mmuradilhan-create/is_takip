import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

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
const elapsed = (page) => page.locator("#work-session-time");
const currentState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
const primaryState = (page) =>
  page.evaluate(
    ({ key, preferencesKey }) => ({
      records: localStorage.getItem(key),
      preferences: localStorage.getItem(preferencesKey),
    }),
    { key: KEY, preferencesKey: PREFERENCES_KEY },
  );

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

test("live work seconds tick, pause and resume while minute summaries, raw timing and exact journal Undo remain intact", async ({
  page,
}) => {
  const records = await seed(page);
  const saved = await primaryState(page);
  await expect(page.locator("#sidebar-saved-time")).toHaveText("0 dk");
  await expect(page.locator(".sidebar-journal-idle")).toHaveCount(0);
  await expect(
    workButton(page, "work-first").locator('[data-work-symbol="play"]'),
  ).toHaveCount(1);
  await start(page);
  await expect(
    workButton(page, "work-first").locator('[data-work-symbol="pause"]'),
  ).toHaveCount(1);
  await expect(page.locator("#work-session-title")).toHaveText(
    records[1].title,
  );
  await expect(workButton(page, "work-first")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(elapsed(page)).toHaveText("00:00:00");
  await expect(elapsed(page)).toHaveAttribute(
    "aria-label",
    "Bu oturumda geçen süre, saat, dakika ve saniye",
  );
  await expect(page.locator(".sidebar-journal-phase")).toHaveText("Çalışıyor");
  await page.clock.fastForward(1_000);
  await expect(elapsed(page)).toHaveText("00:00:01");
  await expect(page.locator("#sidebar-saved-time")).toHaveText("0 dk");
  expect(await primaryState(page)).toEqual(saved);
  await page.clock.fastForward(64_000);
  await expect(elapsed(page)).toHaveText("00:01:05");
  const toggle = panel(page).locator(".work-session-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await expect(toggle).toHaveAttribute("data-action", "work-resume");
  await expect(toggle).toBeFocused();
  expect(
    (await currentState(page)).entries.find(
      (entry) => entry.recordId === "work-first",
    ),
  ).toMatchObject({ status: "paused", elapsedMs: 65_000, startedAt: null });
  await expect(workButton(page, "work-first")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(workButton(page, "work-first")).toHaveClass(/is-paused/);
  await expect(workButton(page, "work-first")).toHaveAttribute(
    "title",
    /^Duraklatıldı · Devam et/,
  );
  await expect(
    workButton(page, "work-first").locator(
      '[data-work-symbol="resume"] circle',
    ),
  ).toHaveCount(1);
  await page.clock.fastForward(120_000);
  await expect(elapsed(page)).toHaveText("00:01:05");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("data-action", "work-pause");
  await expect(toggle).toBeFocused();
  await expect(workButton(page, "work-first")).not.toHaveClass(/is-paused/);
  await expect(
    workButton(page, "work-first").locator('[data-work-symbol="pause"]'),
  ).toHaveCount(1);
  await page.clock.fastForward(5_000);
  await expect(elapsed(page)).toHaveText("00:01:10");
  expect(await primaryState(page)).toEqual(saved);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await panel(page)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  const finish = page.locator("#work-finish-dialog");
  await expect(finish).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await page.clock.fastForward(60_000);
  await expect(elapsed(page)).toHaveText("00:01:10");
  await expect(finish.locator("#work-finish-duration")).toHaveText("00:01:10");
  await finish.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(finish).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  const state = await currentState(page);
  expect(state.currentId).toBe("work-first");
  expect(
    state.entries.find((entry) => entry.recordId === "work-first"),
  ).toMatchObject({ status: "paused", elapsedMs: 70_000, startedAt: null });
  expect(await primaryState(page)).toEqual(saved);
  await page.reload();
  await page.locator('#nav [data-view="daily"]').click();
  await expect(workButton(page, "work-first")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(
    workButton(page, "work-first").locator(
      '[data-work-symbol="resume"] circle',
    ),
  ).toHaveCount(1);
  expect(await primaryState(page)).toEqual(saved);
  await start(page, "work-second");
  await page.clock.fastForward(35_789);
  await expect(elapsed(page)).toHaveText("00:00:35");
  await panel(page)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  await page
    .locator("#work-finish-form")
    .getByRole("button", { name: "Kaydet ve bitir", exact: true })
    .click();
  await expect(panel(page)).not.toBeVisible();
  await expect(page.locator("#sidebar-saved-time")).toHaveText("1 dk");
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 oturum");
  const stored = JSON.parse((await primaryState(page)).records);
  const shortSession = stored.records.find(
    (record) => record.id === "work-second",
  ).workLog;
  expect(shortSession).toHaveLength(1);
  expect(shortSession[0].durationMs).toBe(35_789);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  expect(await primaryState(page)).toEqual(saved);
  await expect(page.locator("#sidebar-saved-time")).toHaveText("0 dk");
});

test("switching work keeps only one running session and resumes each unfinished task", async ({
  page,
}) => {
  await seed(page);
  const saved = await primaryState(page);
  await start(page);
  await page.clock.fastForward(12_000);
  await start(page, "work-second");
  await expect(page.locator("#work-session-title")).toHaveText(
    "İkinci çalışma",
  );
  await expect(elapsed(page)).toHaveText("00:00:00");
  await page.clock.fastForward(7_000);
  let state = await currentState(page);
  expect(
    state.entries.filter((entry) => entry.status === "running"),
  ).toHaveLength(1);
  expect(
    state.entries.find((entry) => entry.recordId === "work-first"),
  ).toMatchObject({ status: "paused", elapsedMs: 12_000 });
  await start(page);
  await expect(elapsed(page)).toHaveText("00:00:12");
  await page.clock.fastForward(3_000);
  await expect(elapsed(page)).toHaveText("00:00:15");
  state = await currentState(page);
  expect(
    state.entries.filter((entry) => entry.status === "running"),
  ).toHaveLength(1);
  expect(
    state.entries.find((entry) => entry.recordId === "work-second"),
  ).toMatchObject({ status: "paused", elapsedMs: 7_000 });
  expect(await primaryState(page)).toEqual(saved);
  await panel(page)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  await page
    .locator("#work-finish-dialog")
    .getByRole("button", {
      name: "Vazgeç",
      exact: true,
    })
    .click();
  await start(page);
  await expect(elapsed(page)).toHaveText("00:00:15");
  expect(await primaryState(page)).toEqual(saved);
});

test("only daily work has a timer, including goal panel steps, and a forged goal action is ignored", async ({
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

test("main windows share one session without double counting and only its owner pauses on page closure", async ({
  page,
  context,
}) => {
  await seed(page);
  const saved = await primaryState(page);
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(panel(other)).toHaveAttribute("data-phase", "running");
  await page.clock.fastForward(5_000);
  await expect(elapsed(page)).toHaveText("00:00:05");
  await expect(elapsed(other)).toHaveText("00:00:05");
  await panel(other)
    .getByRole("button", { name: "Duraklat", exact: true })
    .click();
  await expect(panel(page)).toHaveAttribute("data-phase", "paused");
  await page.clock.fastForward(10_000);
  await expect(elapsed(other)).toHaveText("00:00:05");
  await panel(other)
    .getByRole("button", { name: "Devam et", exact: true })
    .click();
  await page.clock.fastForward(3_000);
  await expect(elapsed(page)).toHaveText("00:00:08");
  await expect(elapsed(other)).toHaveText("00:00:08");
  await page.close();
  await expect(panel(other)).toHaveAttribute("data-phase", "running");
  await other.clock.fastForward(2_000);
  await expect(elapsed(other)).toHaveText("00:00:10");
  await other.reload();
  await expect(panel(other)).toHaveAttribute("data-phase", "paused");
  await expect(elapsed(other)).toHaveText("00:00:10");
  await other.clock.fastForward(60_000);
  await expect(elapsed(other)).toHaveText("00:00:10");
  expect(await primaryState(other)).toEqual(saved);
});

test("the sidebar session keeps notes in a separate bounded modal without moving the task list", async ({
  page,
}, testInfo) => {
  const records = await seed(page);
  const saved = await primaryState(page);
  await start(page);
  await expect(page.locator("#work-session-time")).toHaveText("00:00:00");
  await expect(page.locator(".sidebar-journal-phase")).toHaveText("Çalışıyor");
  await panel(page)
    .getByRole("button", { name: "Notlar ve sonraki adım", exact: true })
    .click();
  const context = page.locator("#work-session-context");
  await expect(context).toBeVisible();
  await expect(context).toContainText(records[1].nextAction);
  await expect(context).toContainText(records[1].description);
  await expect(context).toContainText(records[1].waitingReason);
  await expect(context.locator("img, script")).toHaveCount(0);
  expect(await context.evaluate((element) => element.matches(":modal"))).toBe(
    true,
  );
  expect(await page.evaluate(() => window.workSessionInjected)).toBeUndefined();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
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
    await expect(context).toBeInViewport({ ratio: 1 });
    await expect(context.locator(".modal-footer")).toBeInViewport({
      ratio: 1,
    });
    for (const action of ["work-pause", "work-finish"])
      await expect(
        panel(page).locator(`[data-action="${action}"]`),
      ).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({
    path: testInfo.outputPath("work-session-context.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(context).not.toBeVisible();
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
  await row(page, "work-first").locator(".task-name").click();
  page.once("dialog", (dialog) => dialog.accept());
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
  expect(await primaryState(page)).toEqual(saved);
});

test("finish dialog discards only its unsaved session after confirmation and preserves saved history through refusal, storage failure and reload", async ({
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
  await expect(page.locator("#sidebar-saved-time")).toHaveText("2 dk");
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 oturum");
  await start(page);
  await page.clock.fastForward(35_789);
  await panel(page)
    .getByRole("button", { name: "Oturumu bitir", exact: true })
    .click();
  const finish = page.locator("#work-finish-dialog");
  const discard = finish.getByRole("button", {
    name: "Kaydı sil",
    exact: true,
  });
  const result = finish.locator('[name="resultNote"]');
  await result.fill("Henüz kaydedilmeyen taslak sonuç");
  const pending = await currentState(page);
  const pendingRaw = await page.evaluate(
    (key) => localStorage.getItem(key),
    SESSION_KEY,
  );
  const deleteBounds = await discard.boundingBox();
  const cancelBounds = await finish
    .getByRole("button", { name: "Vazgeç", exact: true })
    .boundingBox();
  expect(deleteBounds.x).toBeLessThan(cancelBounds.x);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(
      "Bu çalışma oturumu kaydedilmeden silinsin mi?",
    );
    await dialog.dismiss();
  });
  await discard.click();
  await expect(finish).toBeVisible();
  await expect(result).toHaveValue("Henüz kaydedilmeyen taslak sonuç");
  expect(await currentState(page)).toEqual(pending);
  expect(await primaryState(page)).toEqual(saved);

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.failSessionDiscard = true;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && window.failSessionDiscard)
        throw new DOMException(
          "Sentetik depolama hatası",
          "QuotaExceededError",
        );
      return original.call(this, name, value);
    };
  }, SESSION_KEY);
  page.once("dialog", (dialog) => dialog.accept());
  await discard.click();
  await expect(finish.locator("#work-finish-error")).toContainText(
    "silinemedi",
  );
  await expect(finish).toBeVisible();
  await expect(result).toHaveValue("Henüz kaydedilmeyen taslak sonuç");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBe(pendingRaw);
  expect(await primaryState(page)).toEqual(saved);

  await page.evaluate(() => {
    window.failSessionDiscard = false;
  });
  await page.setViewportSize({ width: 390, height: 700 });
  expect(
    await finish.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  for (const name of ["Kaydı sil", "Vazgeç", "Kaydet ve bitir"])
    await expect(
      finish.getByRole("button", { name, exact: true }),
    ).toBeInViewport({ ratio: 1 });
  page.once("dialog", (dialog) => dialog.accept());
  await discard.click();
  await expect(finish).not.toBeVisible();
  await expect(panel(page)).not.toBeVisible();
  expect(await currentState(page)).toEqual({
    version: 1,
    currentId: null,
    entries: [otherContext],
  });
  expect(await primaryState(page)).toEqual(saved);
  await expect(page.locator("#sidebar-saved-time")).toHaveText("2 dk");
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 oturum");
  await page.reload();
  await expect(panel(page)).not.toBeVisible();
  expect(await primaryState(page)).toEqual(saved);
  expect(await currentState(page)).toEqual({
    version: 1,
    currentId: null,
    entries: [otherContext],
  });
});
