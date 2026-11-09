import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import {
  makeHistoryEntry,
  workspaceSignature,
} from "../src/workspace-history.js";
import {
  MAX_WORKSPACE_NOTES,
  MAX_WORKSPACE_NOTE_LENGTH,
  normalizeNotes,
  notesFromBackup,
  validNotes,
} from "../src/workspace-notes.js";

const KEY = "workspace-note-test";
const FIRST = "2026-11-09T09:00:00.000Z";
const SECOND = "2026-11-09T10:00:00.000Z";
const THIRD = "2026-11-09T11:00:00.000Z";
const copy = (value) => JSON.parse(JSON.stringify(value));
const note = (
  id = "independent-one",
  text = "Hatırlanacak madde",
  extra = {},
) => ({
  id,
  text,
  createdAt: FIRST,
  updatedAt: FIRST,
  ...extra,
});
const record = (extra = {}) =>
  createRecord({
    id: "existing-daily",
    title: "Bağımsız nottan etkilenmeyecek iş",
    description: "Özgün iş notu",
    nextAction: "Eski sonraki adım korunur",
    createdAt: FIRST,
    updatedAt: FIRST,
    sourceFields: { original: { rows: [1, "Özgün değer"] } },
    workLog: [
      {
        id: "old-log",
        date: "2026-11-09",
        endedAt: FIRST,
        durationMs: 6717,
        note: "Eski oturum sonucu",
        nextAction: "Oturumdaki tarihsel metin",
      },
    ],
    ...extra,
  });

class MemoryStorage {
  constructor(value) {
    this.values = new Map([[KEY, JSON.stringify(value)]]);
    this.writes = [];
    this.failPrimary = false;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (key === KEY && this.failPrimary) {
      const error = new Error("Test depolaması dolu");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value) });
  }
}
function setup(value = { version: 1, records: [record()] }) {
  const storage = new MemoryStorage(value);
  return {
    storage,
    store: createWorkspaceStore({ storage, key: KEY }),
  };
}
const reopen = (storage) => createWorkspaceStore({ storage, key: KEY });
const envelope = (storage) => JSON.parse(storage.getItem(KEY));
const snapshot = (store) => ({
  records: store.records,
  preferences: store.preferences,
  ...(store.hasNotes ? { notes: store.notes } : {}),
});

test("independent bullet notes preserve complete literal text while validating bounded, detached JSON data", () => {
  const text =
    '  İlk madde • Ölçüm\n<img src=x onerror="alert(1)"> & ikinci satır  ';
  const original = [note("literal-note", text)];
  const normalized = normalizeNotes(original);
  assert.deepEqual(normalized, original);
  assert.notEqual(normalized, original);
  assert.notEqual(normalized[0], original[0]);
  normalized[0].text = "Yalnız ayrık kopya değişir";
  assert.equal(original[0].text, text);
  assert.equal(MAX_WORKSPACE_NOTES, 100);
  assert.equal(MAX_WORKSPACE_NOTE_LENGTH, 2000);
  assert.equal(validNotes([]), true);
  assert.equal(validNotes([note("limit", "x".repeat(2000))]), true);
  assert.equal(
    validNotes(
      Array.from({ length: 100 }, (_, index) => note(`limit-${index}`)),
    ),
    true,
  );
  for (const invalid of [
    null,
    {},
    [null],
    [note("blank", " \n ")],
    [note("oversized", "x".repeat(2001))],
    [note("same"), note("same")],
    [note(" ")],
    [note("x".repeat(201))],
    [note("missing-time", "Madde", { createdAt: undefined })],
    [note("bad-date", "Madde", { updatedAt: "2026-02-30T10:00:00.000Z" })],
    Array.from({ length: 101 }, (_, index) => note(`extra-${index}`)),
  ]) {
    assert.equal(validNotes(invalid), false);
    assert.throws(() => normalizeNotes(invalid));
  }
});

test("opening older workspaces does not write notes or invalidate their existing undo signatures", () => {
  const before = {
    records: [record()],
    preferences: { density: "comfortable" },
  };
  const after = {
    records: [{ ...before.records[0], priority: "high" }],
    preferences: { density: "comfortable" },
  };
  const legacyEntry = makeHistoryEntry(before, after, "Eski öncelik değişimi");
  assert.equal(
    workspaceSignature({
      records: [],
      preferences: { density: "comfortable" },
    }),
    "w1:54:a8ad0a11:cd732a53",
  );
  assert.equal(Object.hasOwn(legacyEntry, "beforeNotes"), false);
  assert.equal(Object.hasOwn(legacyEntry, "afterNotes"), false);
  const { store, storage } = setup({
    version: 1,
    records: after.records,
    odak: {
      version: 1,
      preferences: after.preferences,
      history: [legacyEntry],
    },
  });
  const raw = storage.getItem(KEY);
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(store.notes, []);
  assert.equal(store.hasNotes, false);
  assert.equal(store.canUndo, true);
  assert.equal(storage.getItem(KEY), raw);
  assert.equal(store.saveNotes([], "Boş not alanı"), true);
  assert.equal(storage.getItem(KEY), raw);
  assert.equal(storage.writes.length, 0);
  assert.equal(store.history.length, 1);
  assert.equal(store.undo(), "Eski öncelik değişimi");
  assert.deepEqual(snapshot(store), before);
  assert.equal(Object.hasOwn(envelope(storage).odak, "notes"), false);
});

test("notes, records and theme changes survive reload and undo exactly through last-note deletion and reset", () => {
  const original = record();
  const edited = { ...original, priority: "high" };
  const firstNote = note();
  const editedNote = note("independent-one", "Güncellenmiş bağımsız madde", {
    updatedAt: SECOND,
  });
  const secondNote = note("independent-two", "İkinci madde");
  const initial = {
    records: [original],
    preferences: { density: "comfortable" },
  };
  const states = [
    initial,
    { ...initial, records: [edited] },
    { ...initial, records: [edited], notes: [firstNote] },
    {
      records: [edited],
      preferences: { density: "compact", theme: "dark" },
      notes: [firstNote],
    },
    {
      records: [edited],
      preferences: { density: "compact", theme: "dark" },
      notes: [editedNote, secondNote],
    },
    {
      records: [edited],
      preferences: { density: "compact", theme: "dark" },
      notes: [editedNote],
    },
    {
      records: [edited],
      preferences: { density: "compact", theme: "dark" },
      notes: [],
    },
    {
      records: [],
      preferences: { density: "compact", theme: "dark" },
      notes: [],
    },
  ];
  const { storage, store } = setup();
  store.saveRecords([edited], "Öncelik");
  assert.deepEqual(snapshot(store), states[1]);
  store.saveNotes([firstNote], "Madde ekle");
  assert.deepEqual(snapshot(store), states[2]);
  store.savePreferences(states[3].preferences, "Tema");
  assert.deepEqual(snapshot(store), states[3]);
  store.saveNotes([editedNote, secondNote], "Maddeleri düzenle");
  assert.deepEqual(snapshot(store), states[4]);
  store.saveNotes([editedNote], "İkinci maddeyi sil");
  assert.deepEqual(snapshot(store), states[5]);
  store.saveNotes([], "Son maddeyi sil");
  assert.deepEqual(snapshot(store), states[6]);
  store.saveWorkspace({ records: [], notes: [] }, "Çalışma alanını sıfırla");
  assert.deepEqual(snapshot(store), states[7]);
  let current = reopen(storage);
  assert.equal(current.history.length, states.length - 1);
  for (let index = states.length - 2; index >= 0; index--) {
    assert.ok(current.undo());
    current = reopen(storage);
    assert.deepEqual(snapshot(current), states[index]);
  }
  assert.equal(current.canUndo, false);
  assert.equal(Object.hasOwn(envelope(storage).odak, "notes"), false);
  assert.deepEqual(current.records[0].workLog, original.workLog);
});

test("record-only restores retain local notes while explicit notes restore and invalid restores remain atomic", () => {
  const { store, storage } = setup();
  const original = store.records;
  const localNotes = [note("local", "Alıcıdaki bağımsız madde")];
  store.saveNotes(localNotes, "Yerel madde");
  store.savePreferences({ density: "compact", theme: "dark" }, "Koyu tema");
  const received = record({ id: "received", title: "Eski kayıt yedeği" });
  store.saveWorkspace({ records: [received] }, "Eski yedek");
  assert.deepEqual(store.notes, localNotes);
  assert.deepEqual(store.records, [received]);
  assert.deepEqual(store.preferences, { density: "compact", theme: "dark" });
  const prior = storage.getItem(KEY);
  const priorHistory = store.history;
  assert.throws(() => store.saveWorkspace({ records: original, notes: null }));
  assert.equal(storage.getItem(KEY), prior);
  assert.deepEqual(store.history, priorHistory);
  const incomingNotes = [note("incoming", "Yedekteki yeni madde")];
  store.saveWorkspace(
    { records: original, notes: incomingNotes },
    "Notlu yedek",
  );
  assert.deepEqual(store.records, original);
  assert.deepEqual(store.notes, incomingNotes);
  assert.deepEqual(store.preferences, { density: "compact", theme: "dark" });
  assert.ok(store.undo());
  assert.equal(storage.getItem(KEY), prior);
  store.saveWorkspace({ records: [received], notes: [] }, "Boş not listesi");
  assert.deepEqual(store.notes, []);
  assert.ok(store.undo());
  assert.deepEqual(store.notes, localNotes);
});

test("a failed note write preserves all primary data and retry creates only one undo step without losing raw journal values", () => {
  const { store, storage } = setup();
  const beforeRaw = storage.getItem(KEY);
  const beforeState = snapshot(store);
  assert.throws(() => store.saveNotes([note("same"), note("same")]));
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.deepEqual(store.history, []);
  assert.equal(storage.writes.length, 0);
  storage.failPrimary = true;
  assert.throws(() => store.saveNotes([note()], "Madde ekle"), /dolu/);
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.deepEqual(snapshot(store), beforeState);
  assert.deepEqual(store.history, []);
  assert.equal(storage.writes.length, 0);
  storage.failPrimary = false;
  assert.equal(store.saveNotes([note()], "Madde ekle"), true);
  const withNote = storage.getItem(KEY);
  const exactHistory = store.history;
  const exposed = store.notes;
  exposed[0].text = "Bu kopya kaydı değiştiremez";
  assert.equal(store.notes[0].text, "Hatırlanacak madde");
  storage.failPrimary = true;
  const edited = note("independent-one", "Düzenlenmiş metin", {
    updatedAt: SECOND,
  });
  assert.throws(() => store.saveNotes([edited], "Madde düzenle"), /dolu/);
  assert.equal(storage.getItem(KEY), withNote);
  assert.deepEqual(store.history, exactHistory);
  assert.deepEqual(store.records, beforeState.records);
  storage.failPrimary = false;
  assert.equal(store.saveNotes([edited], "Madde düzenle"), true);
  assert.equal(store.history.length, 2);
  const reopened = reopen(storage);
  assert.ok(reopened.undo());
  assert.deepEqual(reopened.notes, [note()]);
  assert.ok(reopened.undo());
  assert.deepEqual(snapshot(reopened), beforeState);
  assert.deepEqual(reopened.records[0].workLog[0].durationMs, 6717);
});

test("concurrent note and record edits reject stale snapshots and retries retain the other window's latest data", () => {
  const { store: first, storage } = setup();
  const second = reopen(storage);
  const originalRecords = first.records;
  first.saveNotes([note()], "İlk pencere maddesi");
  const firstRaw = storage.getItem(KEY);
  const updatedRecords = originalRecords.map((item) => ({
    ...item,
    priority: "high",
  }));
  assert.throws(
    () => second.saveRecords(updatedRecords, "İkinci pencere işi"),
    { name: "WorkspaceConflictError" },
  );
  assert.equal(storage.getItem(KEY), firstRaw);
  assert.deepEqual(second.notes, [note()]);
  second.saveRecords(updatedRecords, "İkinci pencere işi");
  const secondRaw = storage.getItem(KEY);
  const edited = note("independent-one", "İlk pencere düzeltmesi", {
    updatedAt: THIRD,
  });
  assert.throws(() => first.saveNotes([edited], "Madde düzelt"), {
    name: "WorkspaceConflictError",
  });
  assert.equal(storage.getItem(KEY), secondRaw);
  assert.deepEqual(first.records, updatedRecords);
  first.saveNotes([edited], "Madde düzelt");
  second.synchronize(storage.getItem(KEY));
  assert.deepEqual(second.notes, [edited]);
  assert.deepEqual(second.records, updatedRecords);
  assert.ok(second.undo());
  assert.deepEqual(second.notes, [note()]);
  assert.deepEqual(second.records, updatedRecords);
  assert.ok(second.undo());
  assert.deepEqual(second.records, originalRecords);
  assert.deepEqual(second.notes, [note()]);
  assert.ok(second.undo());
  assert.equal(second.hasNotes, false);
  assert.deepEqual(second.notes, []);
});

test("malformed persisted notes block writes rather than silently discarding personal content", () => {
  const records = [record()];
  for (const notes of [
    null,
    [note("empty", " ")],
    [note("same"), note("same")],
  ]) {
    const broken = {
      version: 1,
      records,
      odak: {
        version: 1,
        preferences: { density: "comfortable" },
        notes,
        history: [],
      },
    };
    const storage = new MemoryStorage(broken);
    const raw = storage.getItem(KEY);
    const store = createWorkspaceStore({
      storage,
      key: KEY,
      initialRecords: records,
    });
    assert.equal(store.readOnly, true);
    assert.throws(() => store.saveNotes([note()], "Bozuk alanın üstüne yazma"));
    assert.throws(() => store.saveRecords(records));
    assert.equal(storage.getItem(KEY), raw);
    assert.equal(storage.writes.length, 0);
    const recovered = {
      version: 1,
      records,
      odak: {
        version: 1,
        preferences: { density: "comfortable" },
        notes: [note("recovered", "Kurtarılan madde")],
        history: [],
      },
    };
    const recoveredRaw = JSON.stringify(recovered);
    storage.values.set(KEY, recoveredRaw);
    assert.equal(store.synchronize(recoveredRaw), true);
    assert.equal(store.readOnly, false);
    assert.deepEqual(store.notes, recovered.odak.notes);
  }
});

test("native and full-workspace note backups distinguish absence from an intentional empty list and reject contradictory content", () => {
  const notes = [note("backup-note", "Yedekte aynen korunacak\nİkinci satır")];
  const native = { version: 1, records: [record()], notes };
  const full = {
    version: 1,
    records: native.records,
    odak: {
      version: 1,
      preferences: { density: "comfortable" },
      notes,
      history: [],
    },
  };
  const nativeBefore = copy(native);
  const fullBefore = copy(full);
  assert.deepEqual(notesFromBackup({ version: 1, records: [] }), {
    present: false,
    notes: [],
  });
  assert.deepEqual(notesFromBackup({ version: 1, records: [], notes: [] }), {
    present: true,
    notes: [],
  });
  assert.deepEqual(notesFromBackup(native), { present: true, notes });
  assert.deepEqual(notesFromBackup(full), { present: true, notes });
  assert.deepEqual(notesFromBackup({ ...full, notes: copy(notes) }), {
    present: true,
    notes,
  });
  const extracted = notesFromBackup(full);
  extracted.notes[0].text = "Çıkartılan kopya değişir";
  assert.deepEqual(native, nativeBefore);
  assert.deepEqual(full, fullBefore);
  for (const invalid of [
    { ...native, notes: null },
    { ...full, notes: [] },
    { ...full, odak: { ...full.odak, version: 2 } },
    { ...full, odak: { ...full.odak, notes: [note("empty", " ")] } },
  ])
    assert.throws(() => notesFromBackup(invalid));

  const opened = setup(native);
  const nativeRaw = opened.storage.getItem(KEY);
  assert.equal(opened.store.hasNotes, true);
  assert.deepEqual(opened.store.notes, notes);
  assert.equal(opened.storage.writes.length, 0);
  assert.equal(opened.storage.getItem(KEY), nativeRaw);
  const changedRecords = native.records.map((item) => ({
    ...item,
    description: "Notlar korunurken düzenlenen iş açıklaması",
  }));
  opened.store.saveRecords(changedRecords, "İş açıklaması");
  assert.deepEqual(envelope(opened.storage).odak.notes, notes);
  assert.deepEqual(opened.store.notes, notes);
  const reopened = reopen(opened.storage);
  assert.equal(reopened.undo(), "İş açıklaması");
  assert.deepEqual(snapshot(reopened), {
    records: native.records,
    preferences: { density: "comfortable" },
    notes,
  });

  const contradictory = setup({ ...full, notes: [] });
  const contradictoryRaw = contradictory.storage.getItem(KEY);
  assert.equal(contradictory.store.readOnly, true);
  assert.throws(() => contradictory.store.saveRecords(native.records));
  assert.throws(() => contradictory.store.saveNotes(notes));
  assert.equal(contradictory.storage.getItem(KEY), contradictoryRaw);
  assert.equal(contradictory.storage.writes.length, 0);
});
