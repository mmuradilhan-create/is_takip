import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupWaitingImportNotes,
  waitingImportNoteCleanupInfo,
} from "../src/waiting-notes.js";

function record(input = {}) {
  return {
    id: "waiting-one",
    type: "waiting",
    title: "Tedarik yanıtını bekle",
    status: "waiting_response",
    sourceDate: "2026-07-17",
    lastFollowUpDate: "2026-08-03",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
    description:
      "Sipariş bağlantısını bekliyorum.\nSon Durum: Teknik talep iletildi\nKaç Gün Bekledi: 113",
    sourceFields: {
      Not: "Sipariş bağlantısını bekliyorum.",
      "Son Durum": "Teknik talep iletildi",
      "Kaç Gün Bekledi": 113,
      __formulas: { "Kaç Gün Bekledi": "TODAY()-A2" },
    },
    ...input,
  };
}

test("waiting cleanup promotes the proven last update and removes stale counters without changing any other field", () => {
  const records = [record(), record({ id: "two", type: "daily" })];
  const original = structuredClone(records);
  const cleaned = cleanupWaitingImportNotes(records);
  assert.notEqual(cleaned, records);
  assert.deepEqual(records, original);
  assert.equal(cleaned[0].description, records[0].sourceFields.Not);
  assert.equal(cleaned[0].latestUpdate, "Teknik talep iletildi");
  const { latestUpdate, ...withoutUpdate } = cleaned[0];
  assert.equal(latestUpdate, "Teknik talep iletildi");
  assert.deepEqual(
    { ...withoutUpdate, description: records[0].description },
    records[0],
  );
  assert.equal(cleaned[0].sourceFields, records[0].sourceFields);
  assert.equal(cleaned[1], records[1]);
  assert.equal(cleanupWaitingImportNotes(cleaned), cleaned);
  assert.deepEqual(waitingImportNoteCleanupInfo(records), {
    recordsChanged: 1,
    linesRemoved: 2,
    promotedUpdates: 1,
  });
});

test("genuine source notes that resemble metadata remain and only the appended copies are removed", () => {
  const input = record({
    description:
      "Son Durum: Teknik talep iletildi\nKaç Gün Bekledi: 113\nSon Durum: Teknik talep iletildi\nKaç Gün Bekledi: 113",
    sourceFields: {
      Not: "Son Durum: Teknik talep iletildi\nKaç Gün Bekledi: 113",
      "Son Durum": "Teknik talep iletildi",
      "Kaç Gün Bekledi": 113,
    },
  });
  const [cleaned] = cleanupWaitingImportNotes([input]);
  assert.equal(cleaned.description, input.sourceFields.Not);
  assert.equal(cleaned.latestUpdate, "Teknik talep iletildi");
  assert.equal(cleanupWaitingImportNotes([cleaned])[0], cleaned);

  const genuineOnly = { ...input, description: input.sourceFields.Not };
  const genuineRecords = [genuineOnly];
  assert.equal(cleanupWaitingImportNotes(genuineRecords), genuineRecords);
});

test("unknown, changed, rich-text and ambiguous copied note lines are untouched", () => {
  const records = [
    record({ id: "no-source", sourceFields: {} }),
    record({
      id: "changed-text",
      description: "Son Durum: Yanıt alındı\nKaç Gün Bekledi: 114",
    }),
    record({
      id: "rich-note",
      sourceFields: {
        Not: { richText: [{ text: "Son Durum: Teknik talep iletildi" }] },
        "Son Durum": "Teknik talep iletildi",
        "Kaç Gün Bekledi": 113,
      },
    }),
    record({
      id: "extra-copy",
      description:
        "Son Durum: Teknik talep iletildi\nSon Durum: Teknik talep iletildi\nKaç Gün Bekledi: 113\nKaç Gün Bekledi: 113",
    }),
    record({
      id: "formula-values",
      description: "Son Durum: [object Object]\nKaç Gün Bekledi: 113",
      sourceFields: {
        "Son Durum": { formula: "B2", result: "Teknik talep iletildi" },
        "Kaç Gün Bekledi": { formula: "TODAY()-A2", result: 113 },
      },
    }),
  ];
  assert.equal(cleanupWaitingImportNotes(records), records);
  assert.deepEqual(waitingImportNoteCleanupInfo(records), {
    recordsChanged: 0,
    linesRemoved: 0,
    promotedUpdates: 0,
  });
});

test("an edited latest update is not overwritten and its older source note remains available", () => {
  const input = record({ latestUpdate: "Tedarikçi yanıtı alındı" });
  const [cleaned] = cleanupWaitingImportNotes([input]);
  assert.equal(cleaned.latestUpdate, input.latestUpdate);
  assert.equal(
    cleaned.description,
    "Sipariş bağlantısını bekliyorum.\nSon Durum: Teknik talep iletildi",
  );
  const records = [cleaned];
  assert.equal(cleanupWaitingImportNotes(records), records);

  const matching = record({ latestUpdate: "Teknik talep iletildi" });
  const [sameUpdate] = cleanupWaitingImportNotes([matching]);
  assert.equal(sameUpdate.description, matching.sourceFields.Not);
  assert.equal(sameUpdate.latestUpdate, matching.latestUpdate);
  assert.equal(waitingImportNoteCleanupInfo([matching]).promotedUpdates, 0);
});

test("promotion requires an existing proven line, a safe single value and the supported text limit", () => {
  const records = [
    record({
      id: "deleted-line",
      description: "Kullanıcı eski bilgiyi kaldırdı.",
    }),
    record({
      id: "conflicting-updates",
      description: "Son Durum: İlk yanıt\nSonDurum: Başka yanıt",
      sourceFields: { "Son Durum": "İlk yanıt", SonDurum: "Başka yanıt" },
    }),
    record({
      id: "multiline-value",
      description: "Son Durum: İlk satır\nİkinci satır",
      sourceFields: { "Son Durum": "İlk satır\nİkinci satır" },
    }),
    record({
      id: "too-long",
      description: `Son Durum: ${"a".repeat(10001)}`,
      sourceFields: { "Son Durum": "a".repeat(10001) },
    }),
  ];
  assert.equal(cleanupWaitingImportNotes(records), records);
});

test("Turkish headers, zero-valued counters and CRLF lines are handled without regenerating metadata", () => {
  const input = record({
    description:
      "Kendi notum.\r\nSON DURUM: Yanıt bekleniyor\r\nKAÇ GÜN BEKLEDİ: 0",
    latestUpdate: "",
    sourceFields: {
      Not: "Kendi notum.",
      "SON DURUM": "Yanıt bekleniyor",
      "KAÇ GÜN BEKLEDİ": 0,
    },
  });
  const [cleaned] = cleanupWaitingImportNotes([input]);
  assert.equal(cleaned.description, "Kendi notum.");
  assert.equal(cleaned.latestUpdate, "Yanıt bekleniyor");
  const cleanedRecords = [cleaned];
  assert.equal(cleanupWaitingImportNotes(cleanedRecords), cleanedRecords);
  assert.throws(() => cleanupWaitingImportNotes(null), /kayıt listesi/);
  assert.throws(() => waitingImportNoteCleanupInfo({}), /kayıt listesi/);
});
