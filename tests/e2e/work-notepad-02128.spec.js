import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import {
  readEffectiveWorkSessionRaw,
  readWorkspaceDomainRaw,
  sessionAwareStorageHooks,
  workspaceWithSessionRaw,
} from "./work-session-support.js";

const KEY = "is-takip-v1";
const SESSION = `${KEY}-work-session`;
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-02T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.notepadInjected=1">';
const pad = (page) => page.locator("#work-session-panel");
const note = (page) => page.locator("#work-session-note");
const finish = (page) => pad(page).locator("#work-finish-form");
const work = (page, id = "pad-first") =>
  page.locator(`.full-table [data-record-row][data-id="${id}"] .work-start`);
const saved = (page, key = KEY) =>
  key === SESSION
    ? readEffectiveWorkSessionRaw(page)
    : readWorkspaceDomainRaw(page);
const stored = async (page) => JSON.parse(await saved(page));
const sessions = async (page) => JSON.parse(await saved(page, SESSION));
const entry = async (page, id = "pad-first") =>
  (await sessions(page))?.entries.find((item) => item.recordId === id);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const action = (page, name) => pad(page).locator(`[data-action="${name}"]`);

function fixture() {
  const make = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    make({
      id: "pad-goal",
      type: "weekly",
      title: "Özgün haftalık hedef",
      periodKey: "2026-W46",
      targetValue: 10,
      currentValue: 2,
      metric: "Rapor",
    }),
    make({
      id: "pad-first",
      title: "Not alınacak ilk gerçek iş",
      status: "waiting",
      parentId: "pad-goal",
      workContext: "",
      dueDate: "2026-11-12",
      sourceDate: "2026-10-20",
      priority: "high",
      nextAction: "Korunacak eski sonraki adım",
      description: "İşin kayıt notu çalışma taslağına dönüşmez.",
      waitingReason: "Dış tasarım yanıtı bekleniyor",
      projectCode: "HAM-28",
      workType: "Özgün inceleme",
      sourceFields: { original: { value: "Kaynak ham değeri" } },
      workLog: [
        {
          id: "legacy-log",
          date: "2026-11-02",
          endedAt: STAMP,
          durationMs: 90_123,
          note: "Özgün geçmiş sonuç",
          nextAction: "Eski oturum adımı",
        },
      ],
    }),
    make({
      id: "pad-second",
      title: "Not alınacak ikinci gerçek iş",
      status: "in_progress",
      dueDate: "2026-11-13",
      nextAction: "İkinci işin adımı",
    }),
  ];
}

async function seed(page, context, { sessionRaw = null } = {}) {
  const records = fixture();
  const raw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "comfortable", theme: "light" },
      notes: [
        {
          id: "independent-note",
          text: "Bağımsız not da aynen korunur.",
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
      history: [],
    },
  });
  await context.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await context.clock.pauseAt(NOW);
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, sessionKey, raw, sessionRaw }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw);
        if (sessionRaw === null) localStorage.removeItem(sessionKey);
        else localStorage.setItem(sessionKey, sessionRaw);
      }
    },
    { key: KEY, sessionKey: SESSION, raw, sessionRaw },
  );
  await context.addInitScript(sessionAwareStorageHooks, {
    baselineRaw: raw,
    sessionQuotaFlag: "notepadQuota",
    sessionWriteCounter: "notepadSessionWrites",
  });
  await page.goto("/");
  await page.locator('#nav [data-view="daily"]').click();
  return { records, raw };
}

async function start(page, id = "pad-first") {
  await work(page, id).click();
  await expect(pad(page)).toBeVisible();
  await expect(pad(page)).toHaveAttribute("data-phase", "running");
  await expect(note(page)).toBeFocused();
  for (const selector of ["#work-session-time", "#sidebar-saved-time"])
    await expect(page.locator(selector)).toBeHidden();
  await expect(
    page.locator("#sidebar-work-journal").getByRole("timer"),
  ).toHaveCount(0);
}

async function expectDraft(page, text, id = "pad-first") {
  await expect.poll(async () => (await entry(page, id))?.draftNote).toBe(text);
  await expect(note(page)).toHaveValue(text);
}

test("starting work opens a focused untimed notepad whose durable drafts survive pause, reload, task switches and unrelated renders", async ({
  page,
  context,
}) => {
  const { raw } = await seed(page, context);
  await start(page);
  await expect(pad(page)).toHaveAttribute("data-mode", "note");
  await expect(note(page)).toHaveAccessibleName("Çalışma notu");
  await expect(note(page)).toHaveValue("");
  expect(await entry(page)).toMatchObject({
    status: "running",
    elapsedMs: 0,
    trackTime: false,
  });
  const text = `${UNSAFE}\nÇalışırken yazılan gerçek taslak.`;
  await note(page).fill(text);
  await note(page).press("Shift+Enter");
  await note(page).pressSequentially("Yeni satır kaybolmaz.");
  const draft = `${text}\nYeni satır kaybolmaz.`;
  await expectDraft(page, draft);
  await note(page).evaluate((textarea) => {
    window.originalNotepad = textarea;
    textarea.setSelectionRange(7, 7);
  });
  await context.clock.runFor(5000);
  await page.locator("#list-sort").selectOption("created-asc");
  expect(
    await note(page).evaluate(
      (textarea) => textarea === window.originalNotepad,
    ),
  ).toBe(true);
  expect(
    await note(page).evaluate((textarea) => [
      textarea.selectionStart,
      textarea.selectionEnd,
    ]),
  ).toEqual([7, 7]);
  await expect(note(page)).toHaveValue(draft);
  await expect(pad(page).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.notepadInjected)).toBeUndefined();
  expect(await saved(page)).toBe(raw);
  await action(page, "work-pause").click();
  await expect(pad(page)).toHaveAttribute("data-phase", "paused");
  await expectDraft(page, draft);
  await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
  await expect(finish(page)).toHaveCount(0);
  expect(await entry(page)).toMatchObject({
    status: "paused",
    elapsedMs: 0,
    trackTime: false,
  });
  await action(page, "work-resume").click();
  await expect(pad(page)).toHaveAttribute("data-phase", "running");
  await expectDraft(page, draft);
  await page.reload();
  await expect(pad(page)).toBeVisible();
  await expectDraft(page, draft);
  await page.locator('#nav [data-view="daily"]').click();
  await work(page, "pad-second").click();
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveValue("");
  expect(await entry(page)).toMatchObject({
    status: "paused",
    draftNote: draft,
    elapsedMs: 0,
  });
  await note(page).fill("İkinci işin ayrı taslağı");
  await expectDraft(page, "İkinci işin ayrı taslağı", "pad-second");
  await work(page).click();
  await expect(note(page)).toBeFocused();
  await expectDraft(page, draft);
  expect(await entry(page, "pad-second")).toMatchObject({
    status: "paused",
    draftNote: "İkinci işin ayrı taslağı",
    elapsedMs: 0,
  });
  expect(await saved(page)).toBe(raw);
});

test("Bitir keeps a draft inline and permits an empty finish without changing saved work, planning or Undo history", async ({
  page,
  context,
}) => {
  const { raw } = await seed(page, context);
  await start(page);
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 kayıt");
  await note(page).fill("Taslak çalışma sonucu\nİkinci gerçek satır.");
  await expectDraft(page, "Taslak çalışma sonucu\nİkinci gerçek satır.");
  const sessionId = (await entry(page)).sessionId;
  await action(page, "work-finish").click();
  await expect(pad(page)).toHaveAttribute("data-mode", "finish");
  await expect(finish(page)).toBeVisible();
  await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
  await expect(note(page)).toHaveAccessibleName("Sonuç (isteğe bağlı)");
  await expect(note(page)).toHaveJSProperty("required", false);
  await expect(pad(page).locator("#work-finish-shortcuts")).toHaveCount(0);
  expect(
    (await note(page).getAttribute("aria-describedby")) || "",
  ).not.toContain("work-finish-shortcuts");
  await expect(note(page)).toHaveValue(
    "Taslak çalışma sonucu\nİkinci gerçek satır.",
  );
  await expect(
    finish(page).locator(
      '[name="nextAction"], [name="hours"], [name="minutes"]',
    ),
  ).toHaveCount(0);
  await action(page, "work-finish-cancel").click();
  await expect(pad(page)).toHaveAttribute("data-mode", "note");
  await expectDraft(page, "Taslak çalışma sonucu\nİkinci gerçek satır.");
  expect(await saved(page)).toBe(raw);
  await action(page, "work-finish").click();
  await note(page).fill("  \n ");
  await expect(note(page)).toHaveJSProperty("required", false);
  expect(
    await note(page).evaluate((textarea) => textarea.validationMessage),
  ).toBe("");
  await note(page).press("Enter");
  await expect(pad(page)).not.toBeVisible();
  const after = await stored(page);
  expect(await saved(page)).toBe(raw);
  expect(after.odak.history).toHaveLength(0);
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 kayıt");
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  expect(await entry(page)).toMatchObject({
    sessionId,
    status: "finished",
    elapsedMs: 0,
  });
  expect(Object.hasOwn(await entry(page), "draftNote")).toBe(false);
  await page.reload();
  expect((await stored(page)).records).toEqual(after.records);
  expect(await saved(page)).toBe(raw);
  await expect(page.locator("#sidebar-saved-count")).toHaveText("1 kayıt");
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
});

test("draft storage failure keeps the exact local text and caret until one explicit retry succeeds without changing records or history", async ({
  page,
  context,
}) => {
  const { raw } = await seed(page, context);
  await start(page);
  await note(page).fill("Kaydedilmiş ilk taslak");
  await expectDraft(page, "Kaydedilmiş ilk taslak");
  const before = await saved(page, SESSION);
  await page.evaluate(() => {
    window.notepadQuota = true;
  });
  await note(page).fill("Kaydedilemeyen yerel metin\nİkinci satır.");
  await note(page).evaluate((textarea) => {
    window.originalNotepad = textarea;
    textarea.setSelectionRange(8, 8);
  });
  await note(page).pressSequentially("yeni");
  const local = await note(page).inputValue();
  const caret = await note(page).evaluate((textarea) => [
    textarea.selectionStart,
    textarea.selectionEnd,
  ]);
  await expect(pad(page).locator("#work-note-error")).not.toBeEmpty();
  await expect(action(page, "work-draft-retry")).toBeVisible();
  await context.clock.runFor(2000);
  await expect(note(page)).toHaveValue(local);
  expect(
    await note(page).evaluate(
      (textarea) => textarea === window.originalNotepad,
    ),
  ).toBe(true);
  expect(
    await note(page).evaluate((textarea) => [
      textarea.selectionStart,
      textarea.selectionEnd,
    ]),
  ).toEqual(caret);
  expect(await saved(page, SESSION)).toBe(before);
  expect(await saved(page)).toBe(raw);
  await page.evaluate(() => {
    window.notepadQuota = false;
  });
  await action(page, "work-draft-retry").click();
  await expectDraft(page, local);
  await expect(pad(page).locator("#work-note-error")).toBeHidden();
  expect((await sessions(page)).entries).toHaveLength(1);
  expect(await saved(page)).toBe(raw);
  await page.reload();
  await expectDraft(page, local);
  expect(await saved(page)).toBe(raw);
});

test("a peer draft conflict preserves both texts until explicit load or overwrite chooses the current note", async ({
  page,
  context,
}) => {
  const { raw } = await seed(page, context);
  await start(page);
  await note(page).fill("Ortak başlangıç notu");
  await expectDraft(page, "Ortak başlangıç notu");
  const firstSessionId = (await entry(page)).sessionId;
  await note(page).evaluate((textarea) => textarea.setSelectionRange(6, 6));
  const peer = await context.newPage();
  try {
    await peer.goto("/");
    await expect(note(peer)).toHaveValue("Ortak başlangıç notu");
    await peer.locator('#nav [data-view="daily"]').click();
    await work(peer, "pad-second").click();
    await note(peer).fill("Başka işin korunacak ayrı notu");
    await expectDraft(peer, "Başka işin korunacak ayrı notu", "pad-second");
    const secondRunning = await entry(peer, "pad-second");
    await expect(page.locator("#work-session-title")).toHaveAttribute(
      "data-id",
      "pad-first",
    );
    await expect(pad(page)).toHaveAttribute("data-phase", "paused");
    await expect(pad(page)).toHaveAttribute("data-collapsed", "false");
    await expect(note(page)).toHaveValue("Ortak başlangıç notu");
    expect(
      await note(page).evaluate((textarea) => [
        textarea.selectionStart,
        textarea.selectionEnd,
      ]),
    ).toEqual([6, 6]);
    await note(page).pressSequentially("X");
    await expectDraft(page, "Ortak Xbaşlangıç notu");
    expect((await entry(page)).sessionId).toBe(firstSessionId);
    expect((await sessions(page)).currentId).toBe("pad-second");
    expect(await entry(page, "pad-second")).toEqual(secondRunning);
    expect(await saved(page)).toBe(raw);
    await work(peer).click();
    await expectDraft(peer, "Ortak Xbaşlangıç notu");
    const secondPaused = await entry(peer, "pad-second");
    await page.evaluate(() => {
      window.notepadQuota = true;
    });
    await note(page).fill("Korunacak henüz kaydedilmemiş yerel not");
    await expect(action(page, "work-draft-retry")).toBeVisible();
    await note(peer).fill("Diğer pencereden kaydedilen güncel not");
    await expectDraft(peer, "Diğer pencereden kaydedilen güncel not");
    const remote = await saved(peer, SESSION);
    await expect(pad(page).locator("#work-note-peer")).toContainText(
      "Diğer pencereden kaydedilen güncel not",
    );
    await expect(note(page)).toHaveValue(
      "Korunacak henüz kaydedilmemiş yerel not",
    );
    expect(await saved(page, SESSION)).toBe(remote);
    await page.evaluate(() => {
      window.notepadQuota = false;
    });
    await action(page, "work-draft-use-current").click();
    await expectDraft(page, "Diğer pencereden kaydedilen güncel not");
    expect(await saved(page, SESSION)).toBe(remote);
    await page.evaluate(() => {
      window.notepadQuota = true;
    });
    await note(page).fill("Kullanıcının açıkça kaydetmeyi seçtiği yerel sonuç");
    await note(peer).fill("İkinci gerçek uzak not");
    await expectDraft(peer, "İkinci gerçek uzak not");
    const newer = await saved(peer, SESSION);
    await expect(pad(page).locator("#work-note-peer")).toContainText(
      "İkinci gerçek uzak not",
    );
    await expect(note(page)).toHaveValue(
      "Kullanıcının açıkça kaydetmeyi seçtiği yerel sonuç",
    );
    expect(await saved(page, SESSION)).toBe(newer);
    await page.evaluate(() => {
      window.notepadQuota = false;
    });
    await action(page, "work-draft-save-local").click();
    await expectDraft(
      page,
      "Kullanıcının açıkça kaydetmeyi seçtiği yerel sonuç",
    );
    expect((await sessions(page)).entries).toHaveLength(2);
    expect(await entry(page, "pad-second")).toEqual(secondPaused);
    expect(await saved(page)).toBe(raw);
  } finally {
    await peer.close();
  }
});

test("a newer draft beside an already saved result survives reload and explicitly continues as a fresh working note before one new result Undo", async ({
  page,
  context,
}) => {
  const text =
    "İlk sonuç kaydedildikten sonra yazılmış korunacak yeni çalışma notu";
  const oldResult = "Diğer pencerede kaydedilmiş ilk çalışma sonucu";
  const savedSessionId = "already-saved-working-note";
  const contextRaw = (draftNote) =>
    JSON.stringify({
      version: 1,
      currentId: "pad-first",
      entries: [
        {
          recordId: "pad-first",
          sessionId: savedSessionId,
          status: "paused",
          elapsedMs: 0,
          trackTime: false,
          startedAt: null,
          ownerId: null,
          updatedAt: NOW.getTime(),
          draftNote,
        },
      ],
    });
  const sessionRaw = contextRaw(text);
  const initial = await seed(page, context, {
    sessionRaw: contextRaw(oldResult),
  });
  await expect(note(page)).toHaveValue(oldResult);
  await action(page, "work-finish").click();
  await expect(pad(page)).toHaveAttribute("data-mode", "finish");
  const records = initial.records.map((record) =>
    record.id === "pad-first"
      ? {
          ...record,
          updatedAt: NOW.toISOString(),
          workLog: [
            ...record.workLog,
            {
              id: savedSessionId,
              date: "2026-11-09",
              endedAt: NOW.toISOString(),
              durationMs: 0,
              note: oldResult,
              nextAction: "",
            },
          ],
        }
      : record,
  );
  const raw = JSON.stringify({ ...JSON.parse(initial.raw), records });
  const peer = await context.newPage();
  try {
    await peer.route("**/notepad-recovery-peer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Working-note recovery peer</title>",
      }),
    );
    await peer.goto("/notepad-recovery-peer.html");
    await peer.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: KEY,
      value: workspaceWithSessionRaw(raw, sessionRaw),
    });
    await expect(note(page)).toHaveJSProperty("readOnly", true);
    await expect(note(page)).toHaveValue(oldResult);
    await expect(pad(page)).toHaveAttribute("data-mode", "finish");
    await expect(pad(page).locator("#work-note-error")).not.toBeEmpty();
  } finally {
    await peer.close();
  }
  expect(await saved(page)).toBe(raw);
  expect(await saved(page, SESSION)).toBe(sessionRaw);
  await action(page, "work-draft-use-current").click();
  await expect(pad(page)).toHaveAttribute("data-mode", "note");
  await expect(
    pad(page).getByRole("button", { name: "Kaydet ve bitir", exact: true }),
  ).toHaveCount(0);
  await expect(note(page)).toHaveValue(text);
  await expect(action(page, "work-draft-fork")).toBeVisible();
  expect(await saved(page)).toBe(raw);
  expect(await saved(page, SESSION)).toBe(sessionRaw);
  expect(await page.evaluate(() => window.notepadSessionWrites)).toBe(0);
  await page.reload();
  await expect(note(page)).toHaveValue(text);
  await expect(note(page)).toHaveJSProperty("readOnly", true);
  await expect(pad(page)).toHaveAttribute("data-mode", "note");
  await expect(pad(page).locator("#work-note-peer")).toContainText(oldResult);
  await expect(action(page, "work-draft-fork")).toBeEnabled();
  expect(await saved(page)).toBe(raw);
  expect(await saved(page, SESSION)).toBe(sessionRaw);
  expect(await page.evaluate(() => window.notepadSessionWrites)).toBe(0);
  await pad(page)
    .getByRole("button", {
      name: "Yeni çalışma notu olarak devam et",
      exact: true,
    })
    .click();
  await expect(note(page)).toBeFocused();
  await expectDraft(page, text);
  const recovered = await entry(page);
  expect(recovered.sessionId).not.toBe(savedSessionId);
  expect(recovered).toMatchObject({ trackTime: false, elapsedMs: 0 });
  expect((await sessions(page)).currentId).toBe("pad-first");
  expect(await page.evaluate(() => window.notepadSessionWrites)).toBe(1);
  expect(await saved(page)).toBe(raw);
  await action(page, "work-finish").click();
  await expect(pad(page)).toHaveAttribute("data-mode", "finish");
  await expect(note(page)).toHaveValue(text);
  await note(page).press("Enter");
  await expect(pad(page)).not.toBeVisible();
  const after = await stored(page);
  const original = records.find((record) => record.id === "pad-first");
  const changed = after.records.find((record) => record.id === original.id);
  expect(changed.workLog).toEqual([
    ...original.workLog,
    {
      id: recovered.sessionId,
      date: "2026-11-09",
      endedAt: NOW.toISOString(),
      durationMs: 0,
      note: text,
      nextAction: "",
    },
  ]);
  expect(after.records).toEqual(
    records.map((record) =>
      record.id === original.id
        ? {
            ...record,
            workLog: changed.workLog,
            updatedAt: NOW.toISOString(),
          }
        : record,
    ),
  );
  expect(after.odak.history).toHaveLength(1);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(raw);
});
