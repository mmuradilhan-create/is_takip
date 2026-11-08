import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, TYPES, validateStore } from "../src/model.js";
import { buildWorkbook, parseExcelFile } from "../src/excel.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import {
  cleanupMeetingContacts,
  runMeetingContactCleanup,
} from "../src/meeting-contact-cleanup.js";

const KEY = "meeting-cleanup-workspace";
const MARKER = `${KEY}-meeting-contact-cleanup`;
const LABEL = "Toplantı kişi bilgilerini temizleme";
const timestamp = "2026-11-08T09:00:00.000Z";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = [];
    this.beforeSet = null;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.beforeSet?.(key, String(value));
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value) });
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function record(type = "meeting", input = {}) {
  return createRecord({
    id: `record-${type}`,
    type,
    title: `${type} başlığı`,
    owner: "Sorumlu kişi değeri",
    participants: "Katılımcı değeri",
    description: "Sorumlu ve katılımcılar hakkında korunan anlatı",
    decision: "Korunan karar",
    nextAction: "Korunan sonraki adım",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-11-12",
    sourceDate: "2026-11-02",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceFields: {
      Sorumlu: "Kaynak sorumlu",
      Katılımcılar: "Kaynak katılımcılar",
      Not: "Sorumlu: metin içindeki ifade korunur",
      __sheet: "Toplantı",
      __row: 12,
      nested: { owner: "Anlatı içindeki değer", participants: ["Korunur"] },
    },
    ...input,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function setup(records = [record()]) {
  const storage = new MemoryStorage({
    [KEY]: JSON.stringify({
      version: 1,
      records,
      odak: {
        version: 1,
        preferences: { density: "comfortable" },
        history: [],
      },
    }),
  });
  const store = createWorkspaceStore({ storage, key: KEY });
  return { storage, store };
}

function migrate(storage, store, extra = {}) {
  return runMeetingContactCleanup({
    records: store.records,
    storage,
    markerKey: MARKER,
    saveRecords: (records) => store.saveRecords(records, LABEL),
    token: "pending:test-cleanup",
    ...extra,
  });
}

test("cleanup changes only meeting contacts and their dedicated source copies without mutating frozen records", () => {
  const records = deepFreeze(Object.keys(TYPES).map((type) => record(type)));
  const before = JSON.stringify(records);
  const cleaned = cleanupMeetingContacts(records);
  assert.notEqual(cleaned, records);
  for (let index = 0; index < records.length; index++) {
    const original = records[index];
    if (original.type !== "meeting") {
      assert.equal(cleaned[index], original);
      continue;
    }
    const sourceFields = { ...original.sourceFields };
    delete sourceFields.Sorumlu;
    delete sourceFields.Katılımcılar;
    assert.deepEqual(cleaned[index], {
      ...original,
      owner: "",
      participants: "",
      sourceFields,
    });
    assert.equal(
      cleaned[index].sourceFields.nested,
      original.sourceFields.nested,
    );
  }
  assert.equal(JSON.stringify(records), before);
  assert.equal(cleanupMeetingContacts(cleaned), cleaned);
});

test("exact Turkish and English contact headers are removed while similarly named notes and unrelated formulas survive", () => {
  const aliases = [
    "owner",
    " OWNER ",
    "Sorumlu",
    "SORUMLU KİŞİ",
    "Atanan",
    "Kişi",
    "Assignee",
    "participants",
    " KATILIMCILAR ",
    "Katılımcılar",
  ];
  const sourceFields = {
    ...Object.fromEntries(aliases.map((key) => [key, "Silinecek değer"])),
    "Sorumlu açıklaması": "Korunan açıklama",
    "Katılımcılar notu": "Korunan not",
    "Kişi sayısı": 5,
    __row: 3,
    __formulas: {
      ...Object.fromEntries(aliases.map((key) => [key, "A1"])),
      "Katılımcılar notu": "B1",
      Termin: "C1+1",
    },
  };
  const records = deepFreeze([record("meeting", { sourceFields })]);
  const [cleaned] = cleanupMeetingContacts(records);
  assert.deepEqual(cleaned.sourceFields, {
    "Sorumlu açıklaması": "Korunan açıklama",
    "Katılımcılar notu": "Korunan not",
    "Kişi sayısı": 5,
    __row: 3,
    __formulas: { "Katılımcılar notu": "B1", Termin: "C1+1" },
  });
});

test("formula-only contact copies are cleaned even when canonical contacts are already empty", () => {
  const records = deepFreeze([
    record("meeting", {
      owner: "",
      participants: "",
      sourceFields: {
        __row: 8,
        __formulas: { Katılımcılar: "D8", Sorumlu: "C8" },
      },
    }),
  ]);
  const cleaned = cleanupMeetingContacts(records);
  assert.notEqual(cleaned, records);
  assert.deepEqual(cleaned[0].sourceFields, { __row: 8 });
  assert.equal(cleanupMeetingContacts(cleaned), cleaned);
});

test("already clean meetings and non-meeting contacts are a reference-preserving no-op", () => {
  const records = deepFreeze([
    record("meeting", {
      owner: "",
      participants: "",
      sourceFields: { Not: "Korunur" },
    }),
    record("daily"),
    record("waiting"),
  ]);
  assert.equal(cleanupMeetingContacts(records), records);
  const empty = deepFreeze([]);
  assert.equal(cleanupMeetingContacts(empty), empty);
});

test("cleanup is one atomic undoable workspace edit and its separate marker survives Undo and reload", () => {
  const original = [record(), record("daily")];
  const { storage, store } = setup(original);
  const result = migrate(storage, store, {
    saveRecords: (records) => {
      assert.equal(storage.getItem(MARKER), "pending:test-cleanup");
      return store.saveRecords(records, LABEL);
    },
  });
  assert.deepEqual(result, { status: "cleaned", recordsChanged: 1 });
  assert.deepEqual(store.records, cleanupMeetingContacts(original));
  assert.equal(storage.writes.filter(({ key }) => key === KEY).length, 1);
  assert.equal(store.history.length, 1);
  assert.equal(store.undoLabel, LABEL);
  assert.equal(storage.getItem(MARKER), "1");
  assert.equal(store.undo(), LABEL);
  assert.deepEqual(store.records, original);
  const reopened = createWorkspaceStore({ storage, key: KEY });
  const beforeRaw = storage.getItem(KEY);
  assert.deepEqual(
    migrate(storage, reopened, {
      saveRecords: () =>
        assert.fail("Completed migration must not run after Undo"),
    }),
    { status: "skipped", recordsChanged: 0 },
  );
  assert.deepEqual(reopened.records, original);
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.equal(reopened.canUndo, false);
});

test("failed atomic workspace writes retain all contacts and history and release the migration reservation", () => {
  const { storage, store } = setup([record(), record("waiting")]);
  const beforeRaw = storage.getItem(KEY);
  const beforeRecords = store.records;
  storage.beforeSet = (key) => {
    if (key === KEY) {
      const error = new Error("Test storage quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
  };
  assert.throws(() => migrate(storage, store), /quota exceeded/);
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.deepEqual(store.records, beforeRecords);
  assert.equal(store.canUndo, false);
  assert.deepEqual(store.history, []);
  assert.equal(storage.getItem(MARKER), null);
  storage.beforeSet = null;
  assert.equal(migrate(storage, store).status, "cleaned");
});

test("a rejected save releases only its own reservation and leaves the cleanup retryable", () => {
  const { storage, store } = setup();
  assert.deepEqual(migrate(storage, store, { saveRecords: () => false }), {
    status: "failed",
    recordsChanged: 0,
  });
  assert.equal(storage.getItem(MARKER), null);
  assert.equal(store.records[0].participants, "Katılımcı değeri");
  assert.equal(store.canUndo, false);
  assert.equal(migrate(storage, store).status, "cleaned");
});

test("rollback does not erase a marker replaced by another migration attempt", () => {
  const { storage, store } = setup();
  assert.equal(
    migrate(storage, store, {
      saveRecords: () => {
        storage.setItem(MARKER, "pending:other-window");
        return false;
      },
    }).status,
    "failed",
  );
  assert.equal(storage.getItem(MARKER), "pending:other-window");
  assert.equal(store.canUndo, false);
});

test("a workspace conflict keeps external records intact and releases the cleanup reservation", () => {
  const { storage, store } = setup();
  const external = record("waiting", { title: "Diğer penceredeki yeni konu" });
  storage.setItem(KEY, JSON.stringify({ version: 1, records: [external] }));
  const beforeRaw = storage.getItem(KEY);
  assert.throws(() => migrate(storage, store), {
    name: "WorkspaceConflictError",
  });
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.deepEqual(store.records, [external]);
  assert.equal(storage.getItem(MARKER), null);
  assert.equal(store.canUndo, false);
});

test("marker reservation failure prevents the record write", () => {
  const { storage, store } = setup();
  const beforeRaw = storage.getItem(KEY);
  storage.beforeSet = (key) => {
    if (key === MARKER) throw new Error("Marker storage unavailable");
  };
  assert.throws(
    () =>
      migrate(storage, store, {
        saveRecords: () =>
          assert.fail("Records must not be written without a marker"),
      }),
    /Marker storage unavailable/,
  );
  assert.equal(storage.getItem(KEY), beforeRaw);
  assert.equal(store.canUndo, false);
});

test("a failed final marker write keeps a durable reservation so Undo and reload do not reapply cleanup", () => {
  const original = [record()];
  const { storage, store } = setup(original);
  storage.beforeSet = (key, value) => {
    if (key === MARKER && value === "1")
      throw new Error("Finalize unavailable");
  };
  assert.equal(migrate(storage, store).status, "cleaned");
  assert.equal(storage.getItem(MARKER), "pending:test-cleanup");
  assert.equal(store.undo(), LABEL);
  const reopened = createWorkspaceStore({ storage, key: KEY });
  assert.equal(
    migrate(storage, reopened, {
      saveRecords: () => assert.fail("Durable reservation must survive reload"),
    }).status,
    "skipped",
  );
  assert.deepEqual(reopened.records, original);
});

test("a no-op upgrade records completion without creating workspace writes or undo history", () => {
  const clean = cleanupMeetingContacts([record(), record("daily")]);
  const { storage, store } = setup(clean);
  assert.deepEqual(
    migrate(storage, store, {
      saveRecords: () =>
        assert.fail("Already clean records need no transaction"),
    }),
    { status: "unchanged", recordsChanged: 0 },
  );
  assert.equal(storage.getItem(MARKER), "1");
  assert.equal(storage.writes.filter(({ key }) => key === KEY).length, 0);
  assert.equal(store.canUndo, false);
  assert.deepEqual(store.records, clean);
});

test("cleaned JSON and Excel binary roundtrips keep contacts blank and preserve other records, links and narrative fields", async () => {
  const original = [
    record(),
    record("weekly"),
    record("daily", { parentId: "record-weekly" }),
    record("waiting"),
  ];
  const cleaned = cleanupMeetingContacts(original);
  const json = JSON.stringify({ version: 1, records: cleaned });
  assert.deepEqual(validateStore(JSON.parse(json)).records, cleaned);
  const bytes = await buildWorkbook(cleaned).xlsx.writeBuffer();
  const imported = await parseExcelFile(bytes);
  assert.equal(imported.warnings.length, 0);
  assert.equal(imported.records.length, cleaned.length);
  for (const expected of cleaned) {
    assert.deepEqual(
      imported.records.find(({ id }) => id === expected.id),
      expected,
    );
  }
  assert.equal(cleanupMeetingContacts(imported.records), imported.records);
  assert.equal(original[0].participants, "Katılımcı değeri");
  assert.equal(original[0].sourceFields.Katılımcılar, "Kaynak katılımcılar");
});
