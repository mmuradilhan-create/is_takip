import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const STAMP = "2026-11-07T09:00:00.000Z";
const UNSAFE = '<img src=x onerror="window.workspaceNoteInjected=1">';
const SOURCE_LISTS = {
  projectCode: { added: ["KORUNAN-1"], hidden: ["ESKİ-1"] },
  workType: { added: ["Özel inceleme"], hidden: ["Test"] },
};
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const note = (id, text) => ({
  id,
  text,
  createdAt: STAMP,
  updatedAt: STAMP,
});
const existingNotes = () => [
  note("notes-first", "  Bağımsız ilk not\nİkinci satır korunur.  "),
  note("notes-second", "Diğer not kendi sırasını korur."),
];
const recordsFixture = () => [
  ...["urgent", "high", "normal"].map((priority, index) =>
    make({
      id: `notes-week-${index + 1}`,
      type: "weekly",
      title: `Haftalık hedef ${index + 1}`,
      periodKey: "2026-W46",
      dueDate: `2026-11-${10 + index}`,
      priority,
      targetValue: index ? null : 10,
      currentValue: index ? null : 3,
      metric: index ? "" : "Rapor",
      description: "Hedefin kendi notu bağımsız notlara dönüşmez.",
    }),
  ),
  ...["2026-11-08", "2026-11-09", "2026-11-10"].map((date, index) =>
    make({
      id: `notes-waiting-${index + 1}`,
      type: "waiting",
      title: `Beklenen yanıt ${index + 1}`,
      status: "waiting_response",
      sourceDate: "2026-11-01",
      nextFollowUpDate: date,
      latestUpdate: "Konunun kendi gelişmesi korunur.",
    }),
  ),
  make({
    id: "notes-daily",
    title: "Özgün günlük iş",
    parentId: "notes-week-1",
    status: "in_progress",
    dueDate: "2026-11-12",
    projectCode: "KORUNAN-1",
    workType: "Özel inceleme",
    description: "İşin notu korunur.",
    nextAction: "Eski sonraki adım korunur.",
    sourceFields: { original: { value: "Özgün kaynak alanı" } },
    workLog: [
      {
        id: "notes-work-log",
        date: "2026-11-07",
        endedAt: STAMP,
        durationMs: 65_001,
        note: "Gerçek çalışma sonucu.",
        nextAction: "Oturumun eski sonraki adımı.",
      },
    ],
  }),
];

const panel = (page) => page.locator(".dashboard-notes-panel");
const items = (page) =>
  panel(page).locator(".workspace-notes-list > li[data-note-id]");
const dialog = (page) => page.locator("#workspace-note-editor");
const field = (page) =>
  dialog(page).getByRole("textbox", { name: "Not", exact: true });
const submit = (page) =>
  dialog(page).getByRole("button", { name: "Kaydet", exact: true });
const settings = (page) => page.locator("#settings-dialog");
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function seed(
  page,
  {
    records = recordsFixture(),
    notes,
    preferences = {
      density: "comfortable",
      theme: "light",
      choiceLists: SOURCE_LISTS,
    },
  } = {},
) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("workspace-notes-02121-seeded")) return;
      localStorage.setItem(key, value);
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("workspace-notes-02121-seeded", "1");
    },
    {
      key: KEY,
      value: JSON.stringify({
        version: 1,
        records,
        odak: {
          version: 1,
          preferences,
          ...(notes === undefined ? {} : { notes }),
          history: [],
        },
      }),
    },
  );
  await page.goto("/");
  await expect(panel(page)).toBeVisible();
  return { records, notes, preferences };
}

async function add(page) {
  await panel(page).locator('[data-action="workspace-note-new"]').click();
  await expect(dialog(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
}

async function edit(page, id) {
  await panel(page)
    .locator(`[data-action="workspace-note-edit"][data-note-id="${id}"]`)
    .click();
  await expect(dialog(page)).toBeVisible();
}

async function confirmAction(page, action, accept = true) {
  const pendingDialog = page.waitForEvent("dialog");
  const pendingAction = action();
  const confirmation = await pendingDialog;
  expect(confirmation.type()).toBe("confirm");
  if (accept) await confirmation.accept();
  else await confirmation.dismiss();
  await pendingAction;
  return confirmation.message();
}

async function closeSettings(page) {
  await settings(page)
    .getByRole("button", { name: "Tamam", exact: true })
    .click();
  await expect(settings(page)).not.toBeVisible();
}

async function openSettings(page) {
  if (!(await settings(page).isVisible()))
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
}

async function upload(page, backup) {
  await openSettings(page);
  const section = settings(page).locator(".settings-backup");
  if (!(await section.evaluate((element) => element.open)))
    await section.locator("summary").click();
  await settings(page)
    .locator("#restore-file")
    .setInputFiles({
      name: "notlu-kayit-yedegi.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
}

async function restore(page, backup, accept = true) {
  return confirmAction(page, () => upload(page, backup), accept);
}

test("two-card previews retain access to every record while independent escaped bullet notes save with Enter and exact Undo", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  expect((await stored(page)).records).toEqual(original.records);
  expect(Object.hasOwn((await stored(page)).odak, "notes")).toBe(false);
  await expect(items(page)).toHaveCount(0);
  await expect(page.locator(".dashboard-bottom-row > .panel")).toHaveCount(3);
  await expect(page.locator(".attention-list .followup-row")).toHaveCount(2);
  await expect(
    page.locator(".dashboard-goals .dashboard-goal-row"),
  ).toHaveCount(2);
  expect(
    await page
      .locator(".attention-list .followup-row")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id)),
  ).toEqual(["notes-waiting-1", "notes-waiting-2"]);
  await page
    .getByRole("button", { name: "Sonraki takipler", exact: true })
    .click();
  await expect(page.locator(".attention-list .followup-row")).toHaveCount(1);
  await expect(
    page.locator('.attention-list .followup-row[data-id="notes-waiting-3"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Önceki takipler", exact: true })
    .click();
  await page
    .locator('.weekly-dashboard-panel [data-action="dashboard-weekly"]')
    .click();
  await expect(page.locator("#page-title")).toHaveText("Haftalık plan");
  await expect(page.locator(".full-table tr[data-record-row]")).toHaveCount(3);
  await page.locator('#nav [data-view="dashboard"]').click();
  expect(await saved(page)).toBe(before);

  await add(page);
  await expect(field(page)).toHaveAccessibleDescription(
    "Enter ile kaydet, Shift+Enter ile alt satıra geç.",
  );
  await expect(dialog(page).locator("#workspace-note-shortcuts")).toBeVisible();
  await field(page).fill(UNSAFE);
  await field(page).press("Shift+Enter");
  await field(page).pressSequentially("  Bağımsız ikinci satır.  ");
  const text = `${UNSAFE}\n  Bağımsız ikinci satır.  `;
  await expect(field(page)).toHaveValue(text);
  expect(await saved(page)).toBe(before);
  await field(page).press("Enter");
  await expect(dialog(page)).not.toBeVisible();
  const addedRaw = await saved(page);
  const added = JSON.parse(addedRaw);
  expect(added.records).toEqual(original.records);
  expect(added.odak.preferences).toEqual(original.preferences);
  expect(added.odak.notes).toEqual([
    {
      id: expect.any(String),
      text,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
  ]);
  expect(added.odak.history).toHaveLength(1);
  await expect(items(page)).toHaveCount(1);
  await expect(panel(page).locator(".workspace-note-text")).toHaveText(text);
  await expect(
    panel(page).locator(
      "img, script, .quick-complete, .status-trigger, .work-start",
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => window.workspaceNoteInjected),
  ).toBeUndefined();
  await page.reload();
  expect(await saved(page)).toBe(addedRaw);
  await expect(panel(page).locator(".workspace-note-text")).toHaveText(text);
  await page.locator("#global-search").fill("Eşleşmeyen kayıt araması");
  await expect(page.locator(".attention-list .followup-row")).toHaveCount(0);
  await expect(
    page.locator(".dashboard-goals .dashboard-goal-row"),
  ).toHaveCount(0);
  await expect(panel(page).locator(".workspace-note-text")).toHaveText(text);
  expect(await saved(page)).toBe(addedRaw);
  await page.locator("#global-search").fill("");

  const later = new Date(NOW.getTime() + 60_000);
  await page.clock.setFixedTime(later);
  await edit(page, added.odak.notes[0].id);
  await field(page).fill("Düzenlenmiş bağımsız madde");
  await field(page).press("Enter");
  await expect(dialog(page)).not.toBeVisible();
  expect((await stored(page)).odak.notes).toEqual([
    {
      ...added.odak.notes[0],
      text: "Düzenlenmiş bağımsız madde",
      updatedAt: later.toISOString(),
    },
  ]);
  expect((await stored(page)).records).toEqual(original.records);
  await undo(page);
  expect(await saved(page)).toBe(addedRaw);
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(items(page)).toHaveCount(0);
});

test("unchanged and cancelled note drafts never write while confirmed deletion is one reload-safe exact Undo", async ({
  page,
}) => {
  const notes = existingNotes();
  const original = await seed(page, { notes });
  const before = await saved(page);
  await edit(page, notes[0].id);
  await expect(field(page)).toHaveValue(notes[0].text);
  await field(page).press("Enter");
  await expect(dialog(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await edit(page, notes[0].id);
  await field(page).fill("Kaydedilmemiş bağımsız taslak");
  for (const action of [
    () => page.keyboard.press("Escape"),
    () =>
      dialog(page).getByRole("button", { name: "Vazgeç", exact: true }).click(),
    () => page.mouse.click(4, 4),
  ]) {
    expect(await confirmAction(page, action, false)).toContain("Kaydedilmemiş");
    await expect(dialog(page)).toBeVisible();
    await expect(field(page)).toHaveValue("Kaydedilmemiş bağımsız taslak");
    expect(await saved(page)).toBe(before);
  }
  await confirmAction(page, () => page.keyboard.press("Escape"));
  await expect(dialog(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  const remove = () =>
    panel(page)
      .locator(
        `[data-action="workspace-note-delete"][data-note-id="${notes[0].id}"]`,
      )
      .click();
  expect(await confirmAction(page, remove, false)).toContain("notu silmek");
  expect(await saved(page)).toBe(before);
  await confirmAction(page, remove);
  await expect(items(page)).toHaveCount(1);
  expect((await stored(page)).odak.notes).toEqual([notes[1]]);
  expect((await stored(page)).records).toEqual(original.records);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(panel(page).locator(".workspace-note-text")).toHaveText(
    notes.map((entry) => entry.text),
  );
});

test("guarded Enter and failed storage retain a note draft and retry creates one note transaction without touching records", async ({
  page,
}) => {
  const original = await seed(page, { notes: existingNotes() });
  const before = await saved(page);
  await add(page);
  await field(page).fill("Kaydetme denemesi");
  await field(page).evaluate((textarea) => {
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
  await expect(dialog(page)).toBeVisible();
  expect(await saved(page)).toBe(before);
  await field(page).press("Shift+Enter");
  await field(page).pressSequentially("Sonuç metni korunur.");
  const draft = "Kaydetme denemesi\nSonuç metni korunur.";
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    window.restoreWorkspaceNotesStorage = () => {
      Storage.prototype.setItem = originalSetItem;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test depolaması dolu", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, KEY);
  await field(page).press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator("#workspace-note-error")).not.toBeEmpty();
  await expect(field(page)).toHaveValue(draft);
  expect(await saved(page)).toBe(before);
  await page.evaluate(() => window.restoreWorkspaceNotesStorage());
  await field(page).press("Enter");
  await expect(dialog(page)).not.toBeVisible();
  const after = await stored(page);
  expect(after.records).toEqual(original.records);
  expect(after.odak.preferences).toEqual(original.preferences);
  expect(after.odak.notes.filter((entry) => entry.text === draft)).toHaveLength(
    1,
  );
  expect(
    after.odak.notes.filter((entry) =>
      original.notes.some((old) => old.id === entry.id),
    ),
  ).toEqual(original.notes);
  expect(after.odak.history).toHaveLength(1);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(before);
});

test("another window's note change preserves the local draft and cannot be overwritten by a stale full-list save", async ({
  page,
  context,
}) => {
  const notes = existingNotes();
  const original = await seed(page, { notes });
  const peer = await context.newPage();
  const changedAt = new Date(NOW.getTime() + 60_000).toISOString();
  try {
    await peer.clock.setFixedTime(new Date(changedAt));
    await peer.goto("/");
    await expect(panel(peer)).toBeVisible();
    await edit(page, notes[0].id);
    await field(page).fill("Yerel pencerenin henüz kaydedilmemiş notu");
    await edit(peer, notes[1].id);
    await field(peer).fill("Diğer pencereden kaydedilen ikinci not");
    await field(peer).press("Enter");
    await expect(dialog(peer)).not.toBeVisible();
    const peerRaw = await saved(peer);
    const peerNotes = (await stored(peer)).odak.notes;
    await expect(
      dialog(page).locator(".workspace-note-availability"),
    ).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await expect(field(page)).toHaveValue(
      "Yerel pencerenin henüz kaydedilmemiş notu",
    );
    await field(page).press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(field(page)).toHaveValue(
      "Yerel pencerenin henüz kaydedilmemiş notu",
    );
    expect(await saved(page)).toBe(peerRaw);
    expect((await stored(page)).records).toEqual(original.records);
    await confirmAction(page, () =>
      dialog(page).getByRole("button", { name: "Vazgeç", exact: true }).click(),
    );
    await edit(page, notes[0].id);
    await field(page).fill("Güncel liste üzerinden yeniden kaydedildi");
    await field(page).press("Enter");
    await expect(dialog(page)).not.toBeVisible();
    expect((await stored(page)).odak.notes).toEqual(
      peerNotes.map((entry) =>
        entry.id === notes[0].id
          ? {
              ...entry,
              text: "Güncel liste üzerinden yeniden kaydedildi",
              updatedAt: changedAt,
            }
          : entry,
      ),
    );
    await undo(page);
    expect(await saved(page)).toBe(peerRaw);
  } finally {
    await peer.close();
  }
});

test("native backups restore notes and records atomically while old record-only backups preserve independent notes and preferences", async ({
  page,
  browser,
  baseURL,
}) => {
  const notes = [
    note("backup-note", `${UNSAFE}\nYedekte korunacak bağımsız not`),
    ...existingNotes(),
  ];
  const original = await seed(page, { notes });
  const sourceRaw = await saved(page);
  await openSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings(page)
      .getByRole("button", { name: "Kayıt yedeğini indir", exact: true })
      .click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.records).toEqual(original.records);
  expect(backup.notes).toEqual(notes);
  expect(backup.choiceLists).toEqual(SOURCE_LISTS);
  expect(await saved(page)).toBe(sourceRaw);
  const receiverContext = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  });
  try {
    const receiver = await receiverContext.newPage();
    const receiverNotes = [note("receiver-note", "Alıcının bağımsız notu")];
    const receiverPreferences = {
      density: "compact",
      theme: "dark",
      choiceLists: {
        projectCode: { added: ["ALICI-9"], hidden: [] },
        workType: { added: ["Yerel iş"], hidden: [] },
      },
    };
    await seed(receiver, {
      records: [
        make({
          id: "receiver-record",
          title: "Alıcının özgün işi",
          workContext: "ad_hoc",
        }),
      ],
      notes: receiverNotes,
      preferences: receiverPreferences,
    });
    const before = await saved(receiver);
    let confirmations = 0;
    const rejectUnexpected = async (confirmation) => {
      confirmations++;
      await confirmation.dismiss();
    };
    receiver.on("dialog", rejectUnexpected);
    for (const invalid of [
      [...notes, { ...notes[0] }],
      [{ ...notes[0], text: "X".repeat(2001) }],
    ]) {
      await upload(receiver, { ...backup, notes: invalid });
      await expect(
        settings(receiver).locator("#settings-backup-error"),
      ).not.toBeEmpty();
      await expect(settings(receiver).locator("#restore-file")).toBeEnabled();
      expect(await saved(receiver)).toBe(before);
    }
    expect(confirmations).toBe(0);
    receiver.off("dialog", rejectUnexpected);
    await restore(receiver, backup, false);
    expect(await saved(receiver)).toBe(before);
    await restore(receiver, backup);
    await expect(settings(receiver)).not.toBeVisible();
    const restored = await stored(receiver);
    expect(restored.records).toEqual(original.records);
    expect(restored.odak.notes).toEqual(notes);
    expect(restored.odak.preferences).toEqual({
      ...receiverPreferences,
      choiceLists: SOURCE_LISTS,
    });
    expect(restored.odak.history).toHaveLength(1);
    await expect(receiver.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expect(panel(receiver).locator("img, script")).toHaveCount(0);
    expect(
      await receiver.evaluate(() => window.workspaceNoteInjected),
    ).toBeUndefined();
    await receiver.reload();
    expect((await stored(receiver)).odak.notes).toEqual(notes);
    await undo(receiver);
    expect(await saved(receiver)).toBe(before);

    const legacy = [
      make({
        id: "legacy-record",
        title: "Eski yedekten gelen iş",
        workContext: "ad_hoc",
      }),
    ];
    await restore(receiver, { version: 1, records: legacy });
    expect((await stored(receiver)).records).toEqual(legacy);
    expect((await stored(receiver)).odak.notes).toEqual(receiverNotes);
    expect((await stored(receiver)).odak.preferences).toEqual(
      receiverPreferences,
    );
    await receiver.reload();
    await undo(receiver);
    expect(await saved(receiver)).toBe(before);
    await restore(receiver, { version: 1, records: legacy, notes: [] });
    expect((await stored(receiver)).odak.notes).toEqual([]);
    expect((await stored(receiver)).records).toEqual(legacy);
    await undo(receiver);
    expect(await saved(receiver)).toBe(before);
  } finally {
    await receiverContext.close();
  }
});

test("note, theme and record changes keep a single exact reload-safe Undo chain without rewriting unrelated content", async ({
  page,
}) => {
  const records = [
    make({
      id: "notes-mixed-daily",
      title: "Ayrı kaydın başlığı",
      workContext: "ad_hoc",
      description: "Kayıt notu korunur.",
    }),
  ];
  const original = await seed(page, { records, notes: existingNotes() });
  const snapshots = [await saved(page)];
  await add(page);
  await field(page).fill("Sadece bağımsız not eklendi");
  await field(page).press("Enter");
  await expect(dialog(page)).not.toBeVisible();
  snapshots.push(await saved(page));
  const addedNotes = (await stored(page)).odak.notes;
  expect((await stored(page)).records).toEqual(records);
  await openSettings(page);
  await settings(page).locator('input[name="theme"][value="dark"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await closeSettings(page);
  snapshots.push(await saved(page));
  expect((await stored(page)).odak.notes).toEqual(addedNotes);
  expect((await stored(page)).records).toEqual(records);
  await page.locator('#nav [data-view="daily"]').click();
  await page
    .locator('[data-record-row][data-id="notes-mixed-daily"] .task-name')
    .click();
  const title = page.locator('#record-form [name="title"]');
  await title.fill("Kaydın bağımsız başlık düzeltmesi");
  await page
    .locator("#record-form")
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
  snapshots.push(await saved(page));
  expect((await stored(page)).records).toEqual([
    {
      ...records[0],
      title: "Kaydın bağımsız başlık düzeltmesi",
      updatedAt: NOW.toISOString(),
    },
  ]);
  expect((await stored(page)).odak.notes).toEqual(addedNotes);
  expect((await stored(page)).odak.history).toHaveLength(3);
  for (let index = snapshots.length - 2; index >= 0; index--) {
    await page.reload();
    await undo(page);
    expect(await saved(page)).toBe(snapshots[index]);
  }
  expect((await stored(page)).odak.preferences).toEqual(original.preferences);
  expect((await stored(page)).odak.notes).toEqual(original.notes);
});

test("a notes-only workspace can be reset after confirmation and exact Undo restores every independent note", async ({
  page,
}) => {
  const notes = existingNotes();
  const original = await seed(page, { records: [], notes });
  const before = await saved(page);
  await openSettings(page);
  const reset = () =>
    settings(page)
      .getByRole("button", { name: "Çalışma alanını sıfırla", exact: true })
      .click();
  await expect(
    settings(page).getByRole("button", {
      name: "Çalışma alanını sıfırla",
      exact: true,
    }),
  ).toBeEnabled();
  expect(await confirmAction(page, reset, false)).toContain("not");
  expect(await saved(page)).toBe(before);
  await confirmAction(page, reset);
  await expect(settings(page)).not.toBeVisible();
  expect((await stored(page)).records).toEqual([]);
  expect((await stored(page)).odak.notes).toEqual([]);
  expect((await stored(page)).odak.preferences).toEqual(original.preferences);
  expect((await stored(page)).odak.history).toHaveLength(1);
  await expect(items(page)).toHaveCount(0);
  await page.reload();
  await undo(page);
  expect(await saved(page)).toBe(before);
  await expect(items(page)).toHaveCount(notes.length);
});
