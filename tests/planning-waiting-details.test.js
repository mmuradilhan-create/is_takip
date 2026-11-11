import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { selectPlanningPrompts } from "../src/planning-prompts.js";

const TODAY = "2026-11-07";
const STAMP = "2026-11-07T10:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({
    id,
    title: id,
    type: "waiting",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const select = (records, options = {}) =>
  selectPlanningPrompts(records, { today: TODAY, ...options }).waitingDetails;
const ids = (records) => records.map((record) => record.id);

test("external waiting suggestions cover either or both blank details, including whitespace, without inventing contact context from other fields", () => {
  const records = [
    record("both-missing"),
    record("person-missing", { latestUpdate: "Yanıt cuma günü gelecek." }),
    record("update-missing", { expectedFrom: "Tedarik birimi" }),
    {
      ...record("spaces-person", { latestUpdate: "Yanıt istendi." }),
      expectedFrom: " \t\n ",
    },
    {
      ...record("spaces-update", { expectedFrom: "Tedarik birimi" }),
      latestUpdate: " \n\t ",
    },
    record("other-fields", {
      sourceDate: "2026-11-01",
      nextFollowUpDate: "2026-11-10",
      description: "Gerçek not",
      nextAction: "Tekrar sor.",
    }),
    // 1.3.0: a complete topic also has its next follow-up date.
    record("complete", {
      expectedFrom: "Tedarik birimi",
      latestUpdate: "Yanıt cuma günü gelecek.",
      nextFollowUpDate: "2026-11-10",
    }),
  ];
  const before = JSON.stringify(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  assert.deepEqual(ids(select(records)), [
    "both-missing",
    "person-missing",
    "update-missing",
    "spaces-person",
    "spaces-update",
    "other-fields",
  ]);
  assert.equal(JSON.stringify(records), before);
});

test("every open waiting lifecycle can need context while closed topics never receive this suggestion", () => {
  const open = [
    "planned",
    "in_progress",
    "waiting",
    "follow_up",
    "waiting_response",
    "partially_completed",
  ];
  const closed = ["completed", "cancelled", "transferred"];
  const records = [...open, ...closed].map((status) =>
    record(status, { status }),
  );
  assert.deepEqual(ids(select(records)), open);
  assert.ok(select(records).every((record) => record.type === "waiting"));
});

test("daily waiting reason stays separate from hidden next steps and external topic contact fields", () => {
  const records = [
    record("daily-missing", {
      type: "daily",
      status: "waiting",
      expectedFrom: "Kişi",
      latestUpdate: "Gelişme",
    }),
    record("daily-clear", {
      type: "daily",
      status: "waiting",
      waitingReason: "Yanıt bekleniyor.",
      nextAction: "Cuma günü tekrar sor.",
    }),
    record("daily-legacy-clear", {
      type: "daily",
      status: "waiting",
      blockReason: "Malzeme bekleniyor.",
      nextAction: "Malzeme gelince kontrol et.",
    }),
    record("daily-reason-only", {
      type: "daily",
      status: "waiting",
      waitingReason: "Yanıt bekleniyor.",
      nextAction: "",
    }),
    record("daily-legacy-reason-only", {
      type: "daily",
      status: "waiting",
      blockReason: "Malzeme bekleniyor.",
      nextAction: "",
    }),
    record("daily-hidden-step-only", {
      type: "daily",
      status: "waiting",
      nextAction: "Eski sonraki adım neden yerine geçmez.",
    }),
    record("daily-explicitly-cleared-reason", {
      type: "daily",
      status: "waiting",
      waitingReason: "",
      blockReason: "Eski neden açıkça temizlenmiş.",
      nextAction: "Eski sonraki adım korunur.",
    }),
    record("daily-active", { type: "daily", status: "in_progress" }),
    ...["weekly", "monthly", "yearly", "meeting"].map((type) =>
      record(type, { type, status: "waiting" }),
    ),
  ];
  const before = JSON.stringify(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  assert.deepEqual(ids(select(records)), [
    "daily-missing",
    "daily-hidden-step-only",
    "daily-explicitly-cleared-reason",
  ]);
  assert.equal(JSON.stringify(records), before);
});

test("Turkish search limits context suggestions without mutating source values or replacing saved record references", () => {
  const records = [
    record("person-match", { expectedFrom: "İPEK", latestUpdate: "" }),
    record("update-match", {
      expectedFrom: "",
      latestUpdate: "İPEK ile görüşüldü.",
    }),
    record("title-match", { title: "İPEK için sonuç bekle" }),
    record("complete-match", {
      expectedFrom: "İPEK",
      latestUpdate: "Bilgi tamam.",
      nextFollowUpDate: "2026-11-10",
    }),
    record("closed-match", { expectedFrom: "İPEK", status: "completed" }),
    record("other", { expectedFrom: "Başka kişi" }),
    {
      ...record("non-text"),
      expectedFrom: 42,
      latestUpdate: { text: "Değiştirilmez" },
    },
  ];
  const before = JSON.stringify(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = select(records, { query: " ipek " });
  assert.deepEqual(ids(result), [
    "person-match",
    "update-match",
    "title-match",
  ]);
  for (const found of result)
    assert.equal(
      found,
      records.find((record) => record.id === found.id),
    );
  assert.deepEqual(select(records, { query: "eşleşme yok" }), []);
  assert.ok(select(records).includes(records.at(-1)));
  assert.equal(records.at(-1).expectedFrom, 42);
  assert.equal(JSON.stringify(records), before);
});
