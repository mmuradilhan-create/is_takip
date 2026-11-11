import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";
import { readWorkSessionSnapshot } from "../../src/work-session-store.js";
import { appConfirms } from "./app-confirm-support.js";

const KEY = "is-takip-v1";
const SESSION = `${KEY}-work-session`;
const NOW = new Date("2026-11-09T10:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.backupDraftInjected=1">';
const TEXT = `  Tamamlanmamış ilk not\n${UNSAFE}\nSon satır.  `;
const RECOVERY = "Kaydedilen sonuçtan sonra korunan daha yeni taslak.";
const settings = (page) => page.locator("#settings-dialog");
const note = (page) => page.locator("#work-session-note");
const panel = (page) => page.locator("#work-session-panel");
const make = (input) =>
  createRecord({
    createdAt: STAMP,
    updatedAt: STAMP,
    workContext: "ad_hoc",
    ...input,
  });
const paused = (recordId, draftNote, sessionId = `${recordId}-session`) => ({
  recordId,
  sessionId,
  status: "paused",
  elapsedMs: 0,
  trackTime: false,
  startedAt: null,
  ownerId: null,
  updatedAt: NOW.getTime(),
  draftNote,
});

function sourceFixture() {
  const records = [
    make({
      id: "backup-first",
      title: "Taslağı ve özgün geçmişi olan iş",
      status: "in_progress",
      nextAction: "Özgün sonraki adım korunur.",
      description: "Kayıt açıklaması taslakla karışmaz.",
      sourceFields: { original: { value: "HAM-KAYNAK" } },
      workLog: [
        {
          id: "legacy-log",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 65_001,
          note: "Özgün çalışma sonucu.",
          nextAction: "Eski oturumun sonraki adımı.",
        },
      ],
    }),
    make({
      id: "backup-second",
      title: "Kapanmış kayıtta korunan duraklatılmış not",
      status: "completed",
    }),
    make({
      id: "backup-recovery",
      title: "Kaydedilen oturumdan daha yeni taslak",
      workLog: [
        {
          id: "recovery-session",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 30_000,
          note: "Önceden kaydedilen sonuç.",
          nextAction: "Özgün eski adım.",
        },
      ],
    }),
    make({
      id: "backup-recorded",
      title: "Sonucu zaten kaydedilmiş iş",
      workLog: [
        {
          id: "recorded-session",
          date: "2026-11-07",
          endedAt: STAMP,
          durationMs: 0,
          note: "Aynı kaydedilmiş sonuç.",
          nextAction: "",
        },
      ],
    }),
    make({ id: "backup-blank", title: "Boş taslaklı iş" }),
    make({ id: "backup-finished", title: "Bitmiş oturumlu iş" }),
    make({
      id: "backup-weekly",
      type: "weekly",
      title: "Günlük olmayan hedef",
      periodKey: "2026-W46",
    }),
  ];
  const running = {
    ...paused("backup-first", TEXT),
    status: "running",
    startedAt: NOW.getTime(),
    ownerId: "backup-fixture-owner",
  };
  return {
    records,
    sessions: {
      version: 1,
      currentId: running.recordId,
      entries: [
        running,
        paused("backup-second", "İkinci işin ayrı taslağı.\nİkinci satır."),
        paused("backup-recovery", RECOVERY, "recovery-session"),
        paused(
          "backup-recorded",
          " Aynı kaydedilmiş sonuç. ",
          "recorded-session",
        ),
        paused("backup-blank", " \n  "),
        { ...paused("backup-finished", "Bitmiş bağlam"), status: "finished" },
        paused("backup-missing", "Silinmiş kaydın dışarı aktarılmayan notu"),
        paused("backup-weekly", "Hedefe ait geçersiz çalışma bağlamı"),
      ],
    },
  };
}

function receiverFixture({ conflict = false } = {}) {
  const id = conflict ? "backup-first" : "receiver-local";
  return {
    records: [make({ id, title: "Alıcının özgün günlük işi" })],
    sessions: {
      version: 1,
      currentId: id,
      entries: [
        paused(id, "Alıcının korunacak yerel taslağı.", "local-session"),
      ],
    },
  };
}

async function seed(
  page,
  context,
  fixture,
  { canonical = false, allowRecordedRetirement = false } = {},
) {
  const normalizedSessions = readWorkSessionSnapshot(
    JSON.stringify(fixture.sessions),
  );
  const value = {
    version: 1,
    records: fixture.records,
    odak: {
      version: 1,
      preferences: { density: "comfortable", theme: "light" },
      notes: [
        {
          id: "independent-note",
          text: "Bağımsız notun tam metni korunur.",
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
      ...(canonical ? { workSessions: normalizedSessions } : {}),
      history: [],
    },
  };
  const raw = JSON.stringify(value);
  const legacyRaw = JSON.stringify(fixture.sessions);
  await context.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await context.clock.pauseAt(NOW);
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, sessionKey, raw, legacyRaw }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw);
        localStorage.setItem(sessionKey, legacyRaw);
      }
      window.draftBackupQuota = false;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key && window.draftBackupQuota)
          throw new DOMException("Test depolaması dolu", "QuotaExceededError");
        return set.call(this, name, value);
      };
    },
    { key: KEY, sessionKey: SESSION, raw, legacyRaw },
  );
  await page.goto("/");
  await expect(page.locator("#nav")).toBeVisible();
  if (allowRecordedRetirement) {
    const retired = structuredClone(normalizedSessions);
    const matching = retired.entries.find(
      (entry) => entry.recordId === "backup-recorded",
    );
    expect(matching.sessionId).toBe("recorded-session");
    expect(matching.draftNote).toBe(" Aynı kaydedilmiş sonuç. ");
    matching.status = "finished";
    matching.updatedAt = NOW.getTime();
    delete matching.draftNote;
    await expect.poll(() => sessions(page)).toEqual(retired);
    const settled = await bytes(page);
    expect(withoutSessions(settled.primary)).toEqual(withoutSessions(raw));
    expect(settled.legacy).toBe(legacyRaw);
  } else {
    expect(await bytes(page)).toEqual({ primary: raw, legacy: legacyRaw });
  }
  return fixture;
}

const bytes = (page) =>
  page.evaluate(
    ({ key, sessionKey }) => ({
      primary: localStorage.getItem(key),
      legacy: localStorage.getItem(sessionKey),
    }),
    { key: KEY, sessionKey: SESSION },
  );
const stored = async (page) => JSON.parse((await bytes(page)).primary);
function withoutSessions(raw) {
  const value = JSON.parse(raw);
  delete value.odak.workSessions;
  return value;
}
const sessions = async (page) => {
  const raw = await bytes(page);
  return JSON.parse(raw.primary).odak?.workSessions ?? JSON.parse(raw.legacy);
};
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function openSettings(page) {
  if (!(await settings(page).isVisible()))
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  const section = settings(page).locator(".settings-backup");
  if (!(await section.evaluate((element) => element.open)))
    await section.locator("summary").click();
}

async function upload(page, backup) {
  await openSettings(page);
  await settings(page)
    .locator("#restore-file")
    .setInputFiles({
      name: "calisma-taslakli-kayit-yedegi.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
}

async function restore(page, backup, accept = true) {
  const pending = appConfirms(page).waitForEvent("dialog");
  const action = upload(page, backup);
  const confirmation = await pending;
  expect(confirmation.type()).toBe("confirm");
  const message = confirmation.message();
  if (accept) await confirmation.accept();
  else await confirmation.dismiss();
  await action;
  return message;
}

async function download(page) {
  await openSettings(page);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  return JSON.parse(await readFile(await file.path(), "utf8"));
}

function backupFixture() {
  const data = sourceFixture();
  return {
    version: 1,
    records: data.records,
    workDrafts: {
      version: 1,
      entries: data.sessions.entries.slice(0, 3).map((entry) => ({
        recordId: entry.recordId,
        sessionId: entry.sessionId,
        draftNote: entry.draftNote,
        status: entry.status,
      })),
    },
  };
}

async function expectDraft(page, id, text) {
  await expect
    .poll(
      async () =>
        (await sessions(page)).entries.find((entry) => entry.recordId === id)
          ?.draftNote,
    )
    .toBe(text);
}

async function openCurrentNote(page) {
  if ((await panel(page).getAttribute("data-collapsed")) === "true")
    await page.locator("#work-session-title").click();
  await expect(note(page)).toBeVisible();
}

test("JSON export preserves literal unfinished drafts and fresh restore is paused with one exact reload-safe Undo", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const original = await seed(page, context, sourceFixture(), {
    allowRecordedRetirement: true,
  });
  const before = await bytes(page);
  const backup = await download(page);
  expect(backup.records).toEqual(original.records);
  expect(backup.workDrafts).toEqual(backupFixture().workDrafts);
  expect(backup.workDrafts.entries).toHaveLength(3);
  expect(await bytes(page)).toEqual(before);
  const receiverContext = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const receiver = await receiverContext.newPage();
    await seed(receiver, receiverContext, {
      records: [],
      sessions: { version: 1, currentId: null, entries: [] },
    });
    const receiverBefore = await bytes(receiver);
    const message = await restore(receiver, backup, false);
    expect(message).toMatch(/3[^.]*çalışma (?:not|tasla)/i);
    expect(await bytes(receiver)).toEqual(receiverBefore);
    await restore(receiver, backup);
    await expect(settings(receiver)).not.toBeVisible();
    const restored = await stored(receiver);
    expect(restored.records).toEqual(original.records);
    expect(restored.odak.history).toHaveLength(1);
    const imported = await sessions(receiver);
    expect(imported.entries).toHaveLength(3);
    for (const draft of backup.workDrafts.entries) {
      expect(
        imported.entries.find((entry) => entry.recordId === draft.recordId),
      ).toMatchObject({
        ...draft,
        status: "paused",
        elapsedMs: 0,
        trackTime: false,
        startedAt: null,
        ownerId: null,
      });
    }
    expect((await bytes(receiver)).legacy).toBe(receiverBefore.legacy);
    await receiver
      .locator('[data-action="work-paused-open"][data-id="backup-first"]')
      .click();
    await expect(note(receiver)).toHaveValue(TEXT);
    await expect(receiver.locator("#sidebar-work-journal img")).toHaveCount(0);
    expect(
      await receiver.evaluate(() => window.backupDraftInjected),
    ).toBeUndefined();
    expect(await sessions(receiver)).toEqual(imported);
    await receiver.reload();
    await undo(receiver);
    const undone = await bytes(receiver);
    expect(withoutSessions(undone.primary)).toEqual(
      withoutSessions(receiverBefore.primary),
    );
    expect(await sessions(receiver)).toEqual(JSON.parse(receiverBefore.legacy));
    expect(undone.legacy).toBe(receiverBefore.legacy);
  } finally {
    await receiverContext.close();
  }
});

test("invalid or conflicting draft imports do not write, ignored orphans do not attach, and legacy backups preserve local contexts", async ({
  page,
  context,
}) => {
  await seed(page, context, receiverFixture({ conflict: true }), {
    canonical: true,
  });
  const before = await bytes(page);
  const backup = backupFixture();
  let confirmations = 0;
  const reject = async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  };
  appConfirms(page).on("dialog", reject);
  for (const workDrafts of [
    { ...backup.workDrafts, version: 2 },
    {
      version: 1,
      entries: [...backup.workDrafts.entries, backup.workDrafts.entries[0]],
    },
    {
      version: 1,
      entries: [
        { ...backup.workDrafts.entries[0], draftNote: "X".repeat(10_001) },
      ],
    },
  ]) {
    await upload(page, { ...backup, workDrafts });
    await expect(
      settings(page).locator("#settings-backup-error"),
    ).not.toBeEmpty();
    expect(await bytes(page)).toEqual(before);
  }
  appConfirms(page).off("dialog", reject);
  expect(confirmations).toBe(0);
  await restore(page, backup);
  await expect(settings(page).locator("#settings-backup-error")).toContainText(
    /farklı|üzerine/i,
  );
  expect(await bytes(page)).toEqual(before);
  const legacy = { version: 1, records: backup.records };
  expect(await restore(page, legacy)).toContain(
    "Çalışma taslakların korunacak",
  );
  await expect(settings(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual(backup.records);
  expect(await sessions(page)).toEqual(
    JSON.parse(before.primary).odak.workSessions,
  );
  await page.reload();
  await undo(page);
  expect(await bytes(page)).toEqual(before);
  const local = (await sessions(page)).entries[0];
  const equal = {
    ...backup,
    workDrafts: {
      version: 1,
      entries: [
        {
          recordId: local.recordId,
          sessionId: "other-identity",
          status: "running",
          draftNote: local.draftNote,
        },
        {
          recordId: "missing-from-backup",
          sessionId: "orphan-session",
          status: "paused",
          draftNote: "Bağlanmayacak not",
        },
        {
          recordId: "backup-weekly",
          sessionId: "weekly-session",
          status: "paused",
          draftNote: "Günlük olmayan not",
        },
      ],
    },
  };
  const ignoredMessage = await restore(page, equal);
  expect(ignoredMessage).toContain("2 taslak alınmayacak");
  await expect(settings(page)).not.toBeVisible();
  expect(await sessions(page)).toEqual(
    JSON.parse(before.primary).odak.workSessions,
  );
  expect((await stored(page)).records).toEqual(backup.records);
  await undo(page);
  expect(await bytes(page)).toEqual(before);
});

test("a quota failure commits neither records nor drafts and retry commits one undoable primary snapshot", async ({
  page,
  context,
}) => {
  await seed(page, context, receiverFixture(), { canonical: true });
  const before = await bytes(page);
  await page.evaluate(() => {
    window.draftBackupQuota = true;
  });
  await restore(page, backupFixture());
  await expect(settings(page)).toBeVisible();
  await expect(settings(page).locator("#settings-backup-error")).toContainText(
    /depolama|dolu|quota/i,
  );
  expect(await bytes(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.draftBackupQuota = false;
  });
  await restore(page, backupFixture());
  await expect(settings(page)).not.toBeVisible();
  expect((await stored(page)).odak.history).toHaveLength(1);
  expect((await sessions(page)).entries).toHaveLength(4);
  expect((await bytes(page)).legacy).toBe(before.legacy);
  await page.reload();
  await undo(page);
  expect(await bytes(page)).toEqual(before);
});

test("peer changes during confirmation and draft edits after restore block stale restore or Undo without overwriting text", async ({
  page,
  context,
}) => {
  await seed(page, context, receiverFixture(), { canonical: true });
  const backup = backupFixture();
  // Recovery is covered by the export roundtrip. Keep this case focused on
  // consent and Undo conflicts without entering its explicit fork workflow.
  backup.workDrafts.entries = backup.workDrafts.entries.filter(
    (entry) => entry.recordId !== "backup-recovery",
  );
  const peer = await context.newPage();
  try {
    await peer.goto("/");
    await openCurrentNote(peer);
    const pending = appConfirms(page).waitForEvent("dialog");
    const action = upload(page, backup);
    const confirmation = await pending;
    await note(peer).fill(
      "Diğer pencereden onay beklerken kaydedilen güncel taslak.",
    );
    await expectDraft(
      peer,
      "receiver-local",
      "Diğer pencereden onay beklerken kaydedilen güncel taslak.",
    );
    const peerBytes = await bytes(peer);
    await confirmation.accept();
    await action;
    await expect(settings(page)).toBeVisible();
    await expect(
      settings(page).locator("#settings-backup-error"),
    ).toContainText(/başka bir pencerede değişti/i);
    expect(await bytes(page)).toEqual(peerBytes);
    await restore(page, backup);
    await expect(settings(page)).not.toBeVisible();
    const afterRestore = await stored(page);
    await page.locator('#nav [data-view="daily"]').click();
    await page
      .locator('[data-record-row][data-id="backup-first"] .work-start')
      .click();
    await note(page).fill(
      "Geri yüklemeden sonra yazılan yeni çalışma taslağı.",
    );
    await expectDraft(
      page,
      "backup-first",
      "Geri yüklemeden sonra yazılan yeni çalışma taslağı.",
    );
    const afterEdit = await bytes(page);
    const domain = await stored(page);
    expect(domain.records).toEqual(afterRestore.records);
    expect(domain.odak.notes).toEqual(afterRestore.odak.notes);
    expect(domain.odak.preferences).toEqual(afterRestore.odak.preferences);
    expect(domain.odak.history).toEqual(afterRestore.odak.history);
    await undo(page);
    expect(await bytes(page)).toEqual(afterEdit);
    await expectDraft(
      page,
      "backup-first",
      "Geri yüklemeden sonra yazılan yeni çalışma taslağı.",
    );
    await expect(page.locator("#toast")).toContainText(/değiş|geri alınam/i);
    expect(
      (await stored(page)).records.find(
        (record) => record.id === "backup-first",
      ).workLog[0].durationMs,
    ).toBe(65_001);
  } finally {
    await peer.close();
  }
});
