import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupImportedNotes,
  importedNoteCleanupInfo,
  learnedChoices,
  normalizeDetailText,
} from "../src/record-details.js";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const stamp = "2026-11-07T09:00:00.000Z";
function record(input = {}) {
  return createRecord({
    id: "one",
    title: "İncelenecek iş",
    createdAt: stamp,
    updatedAt: stamp,
    ...input,
  });
}

test("cleanup removes only exact known imported metadata and preserves every other record field", () => {
  const records = [
    record({
      description:
        "Kendi inceleme notum.\nGün: Perşembe\nGecikme: Gecikti\nOdak Sıra: 6\nKarar için tasarım yanıtını bekle.",
      category: "Teknik",
      workType: "İnceleme",
      nextAction: "Yanıtı değerlendir.",
      sourceFields: {
        Gün: "Perşembe",
        Gecikme: "Gecikti",
        "Odak Sıra": 6,
        Notlar: "Kendi inceleme notum.",
        nested: { keep: true },
      },
      workLog: [
        {
          id: "session",
          date: "2026-11-07",
          endedAt: stamp,
          durationMs: 5000,
          note: "Özgün çalışma sonucu.",
          nextAction: "Yanıtı değerlendir.",
        },
      ],
    }),
    record({ id: "two", description: "Serbest kullanıcı notu." }),
  ];
  const original = structuredClone(records);
  const cleaned = cleanupImportedNotes(records);
  assert.notEqual(cleaned, records);
  assert.deepEqual(records, original);
  assert.equal(
    cleaned[0].description,
    "Kendi inceleme notum.\nKarar için tasarım yanıtını bekle.",
  );
  assert.deepEqual(
    { ...cleaned[0], description: original[0].description },
    original[0],
  );
  assert.equal(cleaned[0].sourceFields, records[0].sourceFields);
  assert.equal(cleaned[0].workLog, records[0].workLog);
  assert.equal(cleaned[1], records[1]);
  assert.equal(cleanupImportedNotes(cleaned), cleaned);
  assert.deepEqual(importedNoteCleanupInfo(records), {
    recordsChanged: 1,
    linesRemoved: 3,
  });
});

test("source note text is protected even when it matches generated metadata", () => {
  const inputs = [
    record({
      id: "original-only",
      description: "Gün: Perşembe",
      sourceFields: { Gün: "Perşembe", Notlar: "Gün: Perşembe" },
    }),
    record({
      id: "original-plus-generated",
      description: "Gün: Perşembe\nGün: Perşembe\nGecikme: Gecikti",
      sourceFields: {
        Gün: "Perşembe",
        Gecikme: "Gecikti",
        "İş Açıklaması": "Gün: Perşembe",
      },
    }),
    record({
      id: "ambiguous-extra-copy",
      description: "Gün: Perşembe\nGün: Perşembe",
      sourceFields: { Gün: "Perşembe" },
    }),
    record({
      id: "rich-source-note",
      description: "Gün: Perşembe",
      sourceFields: {
        Gün: "Perşembe",
        Notlar: { richText: [{ text: "Gün: Perşembe" }] },
      },
    }),
  ];
  const cleaned = cleanupImportedNotes(inputs);
  assert.equal(cleaned[0], inputs[0]);
  assert.equal(cleaned[1].description, "Gün: Perşembe");
  assert.equal(cleaned[2], inputs[2]);
  assert.equal(cleaned[3], inputs[3]);
  assert.equal(cleanupImportedNotes(cleaned), cleaned);
});

test("metadata-like user notes are untouched without matching original source evidence", () => {
  const records = [
    record({ description: "Gün: Perşembe\nGecikme: Gecikti\nOdak Sıra: 6" }),
    record({
      id: "different-value",
      description: "Gün: Salı\nGecikme: Kendi yorumum\nOdak Sıra: 8",
      sourceFields: { Gün: "Perşembe", Gecikme: "Gecikti", "Odak Sıra": 6 },
    }),
    record({
      id: "other-heading",
      description: "Gün notu: Perşembe\nSorumlu: Ben\nBilinmeyen: Değer",
      sourceFields: {
        "Gün notu": "Perşembe",
        Sorumlu: "Ben",
        Bilinmeyen: "Değer",
      },
    }),
    record({
      id: "complex-value",
      description: "Gün: [object Object]",
      sourceFields: { Gün: { value: "Perşembe" } },
    }),
  ];
  assert.equal(cleanupImportedNotes(records), records);
  assert.deepEqual(importedNoteCleanupInfo(records), {
    recordsChanged: 0,
    linesRemoved: 0,
  });
  assert.throws(() => cleanupImportedNotes(null), /liste/);
});

test("new project and blocker detail fields are optional, validated and preserved through backups and type changes", () => {
  const legacy = record();
  assert.equal(Object.hasOwn(legacy, "projectCode"), false);
  assert.equal(Object.hasOwn(legacy, "blockReason"), false);
  assert.deepEqual(createRecord(legacy), legacy);
  const detailed = record({
    projectCode: "  PRJ-42  ",
    blocked: true,
    blockReason: "  Tasarım yanıtı bekleniyor.  ",
    category: "Özgün kategori",
  });
  assert.equal(detailed.projectCode, "PRJ-42");
  assert.equal(detailed.blockReason, "Tasarım yanıtı bekleniyor.");
  assert.equal(detailed.category, "Özgün kategori");
  const backup = JSON.parse(
    JSON.stringify({ version: 1, records: [detailed] }),
  );
  assert.deepEqual(validateStore(backup).records, [detailed]);
  const retyped = createRecord({ ...detailed, type: "meeting" });
  assert.equal(retyped.projectCode, detailed.projectCode);
  assert.equal(retyped.blockReason, detailed.blockReason);
  assert.equal(createRecord({ ...detailed, projectCode: "" }).projectCode, "");
  assert.equal(normalizeDetailText(" PRJ-42 ", "projectCode"), "PRJ-42");
  for (const value of [undefined, null, 42, {}, "x".repeat(121)])
    assert.throws(() => record({ projectCode: value }), /Proje kodu/);
  for (const value of [null, false, [], "x".repeat(1001)])
    assert.throws(() => record({ blockReason: value }), /Engel açıklaması/);
});

test("learned choices include completed work, deduplicate Turkish case and supply no invented project codes", () => {
  assert.deepEqual(learnedChoices([], "projectCode"), []);
  const records = [
    record({
      projectCode: "PRJ-10",
      workType: "Özel kontrol",
      status: "completed",
    }),
    record({ id: "two", projectCode: "prj-10", workType: "ÖZEL KONTROL" }),
    record({ id: "three", projectCode: " PRJ-2 ", workType: "TASARIM" }),
    record({ id: "four", projectCode: "İŞ-3", workType: "İZLEME" }),
    record({ id: "five", projectCode: "iş-3", workType: "izleme" }),
  ];
  const original = structuredClone(records);
  const projects = learnedChoices(records, "projectCode");
  assert.deepEqual(projects, ["İŞ-3", "PRJ-2", "PRJ-10"]);
  const types = learnedChoices(records, "workType");
  assert.equal(
    types.filter((value) => value.toLocaleLowerCase("tr-TR") === "özel kontrol")
      .length,
    1,
  );
  assert.equal(
    types.filter((value) => value.toLocaleLowerCase("tr-TR") === "tasarım")
      .length,
    1,
  );
  assert.ok(types.includes("Tasarım"));
  assert.ok(types.includes("İZLEME"));
  assert.deepEqual(records, original);
  assert.throws(() => learnedChoices(records, "category"), /seçim listesi/);
});

test("cleanup and optional details each remain one undo transaction while old canonical history survives reload", () => {
  const key = "detail-workspace";
  const initial = [
    record({
      description: "Kullanıcı notu.\nGün: Perşembe\nGecikme: Gecikti",
      sourceFields: {
        Gün: "Perşembe",
        Gecikme: "Gecikti",
        Notlar: "Kullanıcı notu.",
      },
    }),
  ];
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: initial })],
  ]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  let store = createWorkspaceStore({ storage, key });
  store.saveRecords(
    [createRecord({ ...initial[0], priority: "high" })],
    "Öncelik",
  );
  const beforeCleanup = store.records;
  store.saveRecords(cleanupImportedNotes(store.records), "Aktarım notları");
  assert.equal(store.history.length, 2);
  const clean = store.records;
  store.saveRecords(
    [
      createRecord({
        ...clean[0],
        projectCode: "PRJ-42",
        blockReason: "Yanıt",
        blocked: true,
      }),
    ],
    "İş ayrıntıları",
  );
  const detailed = store.records;
  assert.deepEqual(
    validateStore(JSON.parse(JSON.stringify({ version: 1, records: detailed })))
      .records,
    detailed,
  );
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.undo(), "İş ayrıntıları");
  assert.deepEqual(store.records, clean);
  assert.equal(Object.hasOwn(store.records[0], "projectCode"), false);
  assert.equal(store.undo(), "Aktarım notları");
  assert.deepEqual(store.records, beforeCleanup);
  assert.equal(store.undo(), "Öncelik");
  assert.deepEqual(store.records, initial);
});
