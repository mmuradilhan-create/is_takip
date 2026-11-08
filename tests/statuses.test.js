import test from "node:test";
import assert from "node:assert/strict";
import {
  TYPES,
  STATUSES,
  createRecord,
  validateStore,
  statusesForType,
  isStatusSelectable,
  statusLabel,
  statusForDisplay,
  TYPE_STATUSES,
  goalProgress,
} from "../src/model.js";
import { prepareRecordCreation } from "../src/record-creation.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import { syncActionLinks } from "../src/action-links.js";

test("daily work retains waiting while goal choices omit waiting and the retired partial state", () => {
  for (const type of ["daily", "weekly", "monthly", "yearly"]) {
    const statuses = statusesForType(type);
    const waiting = type === "daily";
    assert.deepEqual(Object.keys(statuses), [
      "planned",
      "in_progress",
      ...(waiting ? ["waiting"] : []),
      "completed",
      "cancelled",
    ]);
    assert.deepEqual(
      Object.values(statuses).map(({ label }) => label),
      [
        "Yapılacak",
        "Devam ediyor",
        ...(waiting ? ["Beklemede"] : []),
        "Tamamlandı",
        "İptal",
      ],
    );
  }
});

test("old waiting goals remain readable, filterable and lossless through edits, backup and Undo without being assignable or creatable", () => {
  const stamp = "2026-11-07T12:00:00.000Z";
  const records = ["yearly", "monthly", "weekly"].map((type) =>
    createRecord({
      id: `legacy-waiting-${type}`,
      type,
      title: `Eski bekleyen ${type} hedefi`,
      status: "waiting",
      periodKey: { yearly: "2026", monthly: "2026-11", weekly: "2026-W45" }[
        type
      ],
      ...({
        monthly: { goalParentId: "legacy-waiting-yearly" },
        weekly: { goalParentId: "legacy-waiting-monthly" },
      }[type] || {}),
      targetValue: 10,
      currentValue: 4,
      metric: "Parça",
      waitingReason: "Eski açıklama korunur.",
      nextAction: "Özgün hedef adımı.",
      sourceFields: { original: { status: "Beklemede", retained: [1, 2] } },
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );
  const before = JSON.stringify(records);
  const backup = validateStore(
    JSON.parse(JSON.stringify({ version: 1, records })),
  );
  assert.equal(JSON.stringify(backup.records), before);
  for (const record of records) {
    assert.equal(statusLabel(record.type, record.status), "Beklemede");
    assert.equal(statusesForType(record.type).waiting, undefined);
    const historical = statusesForType(record.type, [record.status]);
    assert.equal(historical.waiting.label, "Beklemede");
    assert.equal(isStatusSelectable(record.type, "waiting"), false);
    assert.ok(
      Object.keys(historical)
        .filter((status) => isStatusSelectable(record.type, status))
        .every((status) => status !== "waiting"),
    );
    assert.equal(isStatusSelectable(record.type, "in_progress"), true);
    assert.equal(goalProgress(record, records).percent, 40);
    assert.throws(
      () =>
        prepareRecordCreation(
          [],
          {
            type: record.type,
            title: "Yeni bekleyen hedef",
            status: "waiting",
          },
          { now: stamp },
        ),
      /Yeni kayıt için geçerli bir durum/,
    );
    assert.equal(
      createRecord({ ...record, title: "Düzeltilen hedef" }).status,
      "waiting",
    );
  }
  assert.equal(isStatusSelectable("daily", "waiting"), true);
  assert.equal(isStatusSelectable("meeting", "waiting"), false);
  assert.equal(isStatusSelectable("weekly", "partially_completed"), true);
  assert.equal(isStatusSelectable("weekly", "not-a-status"), false);
  assert.equal(isStatusSelectable("not-a-type", "waiting"), false);
  const values = new Map([["old-waiting-goals", JSON.stringify(backup)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = createWorkspaceStore({ storage, key: "old-waiting-goals" });
  assert.equal(JSON.stringify(store.records), before);
  store.saveRecords(
    store.records.map((record, index) =>
      index === 0 ? createRecord({ ...record, status: "in_progress" }) : record,
    ),
    "Eski durumdan çık",
  );
  assert.equal(store.records[0].status, "in_progress");
  assert.equal(store.undo(), "Eski durumdan çık");
  assert.equal(JSON.stringify(store.records), before);
  assert.equal(
    JSON.stringify(
      createWorkspaceStore({ storage, key: "old-waiting-goals" }).records,
    ),
    before,
  );
  assert.equal(JSON.stringify(records), before);
});

test("meeting actions offer only planning or closure while waiting subjects retain their own vocabulary", () => {
  const meetings = statusesForType("meeting");
  assert.deepEqual(Object.keys(meetings), [
    "planned",
    "completed",
    "cancelled",
  ]);
  assert.deepEqual(
    Object.values(meetings).map(({ label }) => label),
    ["Planlanacak", "Tamamlandı", "İptal"],
  );
  const waiting = statusesForType("waiting");
  assert.deepEqual(Object.keys(waiting), [
    "planned",
    "follow_up",
    "waiting_response",
    "completed",
  ]);
  assert.deepEqual(
    Object.values(waiting).map(({ label }) => label),
    ["Açık", "Takipte", "Cevap bekleniyor", "Kapandı"],
  );
  assert.equal(statusLabel("daily", "planned"), "Yapılacak");
  assert.equal(statusLabel("meeting", "planned"), "Planlanacak");
  assert.equal(statusLabel("meeting", "waiting"), "Beklemede");
  assert.equal(statusLabel("waiting", "completed"), "Kapandı");
});

test("legacy statuses remain available only when supplied for existing records", () => {
  const options = statusesForType("daily", [
    "transferred",
    "transferred",
    "completed",
    "follow_up",
    "not-a-status",
  ]);
  assert.deepEqual(Object.keys(options).slice(5), ["transferred", "follow_up"]);
  assert.equal(options.transferred.label, "Aktarıldı");
  assert.equal(options.follow_up.label, "Takipte");
  assert.equal(statusesForType("daily").transferred, undefined);
  assert.equal(statusesForType("daily").follow_up, undefined);
  assert.equal(statusLabel("waiting", "waiting"), "Bekliyor");
  const copy = statusesForType("meeting");
  copy.planned.label = "Changed";
  delete copy.completed;
  assert.equal(statusesForType("meeting").planned.label, "Planlanacak");
  assert.ok(statusesForType("meeting").completed);
});

test("meeting manual choices exclude derived and historical states without changing legacy records through edits, backups or Undo", () => {
  const stamp = "2026-11-07T12:00:00.000Z";
  const manual = ["planned", "completed", "cancelled"];
  const historical = Object.keys(STATUSES).filter(
    (status) => !manual.includes(status),
  );
  for (const status of Object.keys(STATUSES)) {
    assert.equal(isStatusSelectable("meeting", status), manual.includes(status));
    const input = { type: "meeting", title: `Toplantı ${status}`, status };
    if (manual.includes(status))
      assert.equal(
        prepareRecordCreation([], input, { now: stamp }).record.status,
        status,
      );
    else
      assert.throws(
        () => prepareRecordCreation([], input, { now: stamp }),
        /Yeni kayıt için geçerli bir durum/,
      );
  }
  const records = historical.map((status) =>
    createRecord({
      id: `old-meeting-${status}`,
      type: "meeting",
      title: `Özgün karar ${status}`,
      status,
      decision: "Özgün toplantı kararı.",
      dueDate: "2026-11-10",
      priority: "high",
      owner: "Özgün sorumlu",
      nextAction: "Özgün sonraki adım.",
      sourceFields: { original: { status, retained: [1, 2] } },
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );
  const original = JSON.stringify(records);
  const choices = statusesForType("meeting", historical);
  assert.deepEqual(
    Object.keys(choices).filter((status) => isStatusSelectable("meeting", status)),
    manual,
  );
  for (const record of records)
    assert.ok(choices[statusForDisplay(record.status)]);
  const key = "old-meeting-statuses";
  const values = new Map([[key, JSON.stringify({ version: 1, records })]]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  const workspace = createWorkspaceStore({ storage, key });
  assert.equal(JSON.stringify(workspace.records), original);
  const edited = syncActionLinks(
    workspace.records,
    workspace.records.map((record) =>
      createRecord({ ...record, title: `${record.title} düzeltildi` }),
    ),
  );
  for (const [index, record] of edited.entries())
    assert.deepEqual({ ...record, title: records[index].title }, records[index]);
  workspace.saveRecords(edited, "Karar başlığını düzelt");
  const restored = createWorkspaceStore({ storage, key });
  assert.deepEqual(restored.records, edited);
  assert.deepEqual(validateStore(JSON.parse(values.get(key))).records, edited);
  assert.equal(restored.undo(), "Karar başlığını düzelt");
  assert.equal(JSON.stringify(restored.records), original);
  assert.equal(JSON.stringify(records), original);
});

test("type-specific UI catalogs do not rewrite any valid stored status", () => {
  const records = Object.keys(TYPES).flatMap((type) =>
    Object.keys(STATUSES).map((status) =>
      createRecord({ type, status, title: `${type} ${status}` }),
    ),
  );
  assert.deepEqual(validateStore({ version: 1, records }).records, records);
  for (const record of records) {
    assert.ok(
      statusesForType(record.type, [record.status])[
        statusForDisplay(record.status)
      ],
    );
  }
});

test("partial legacy keys display and filter through in-progress choices for every type without adding duplicate options", () => {
  assert.equal(statusForDisplay("partially_completed"), "in_progress");
  for (const status of Object.keys(STATUSES).filter(
    (status) => status !== "partially_completed",
  ))
    assert.equal(statusForDisplay(status), status);
  for (const type of Object.keys(TYPES)) {
    const choices = statusesForType(type, [
      "partially_completed",
      "partially_completed",
      "in_progress",
    ]);
    assert.equal(TYPE_STATUSES[type].partially_completed, undefined);
    assert.equal(choices.partially_completed, undefined);
    assert.equal(choices.in_progress.label, "Devam ediyor");
    assert.equal(
      Object.keys(choices).filter((status) => status === "in_progress").length,
      1,
    );
    assert.equal(statusLabel(type, "partially_completed"), "Devam ediyor");
    assert.ok(
      Object.values(choices).every(({ label }) => label !== "Kısmi tamamlandı"),
    );
  }
  assert.equal(statusesForType("waiting").in_progress, undefined);
  assert.equal(statusLabel("weekly", "transferred"), "Arşivlendi");
});

test("reading legacy partial records preserves their raw keys, hierarchy, measurements and saved histories exactly", () => {
  const stamp = "2026-11-07T12:00:00.000Z";
  const records = Object.keys(TYPES).map((type) =>
    createRecord({
      id: `partial-${type}`,
      type,
      title: `Korunan ${type}`,
      status: "partially_completed",
      createdAt: stamp,
      updatedAt: stamp,
      metric: "Parça",
      targetValue: 10,
      currentValue: 4,
      ...(type === "daily" ? { parentId: "partial-weekly" } : {}),
      ...(["weekly", "monthly"].includes(type)
        ? {
            goalParentId: `partial-${type === "weekly" ? "monthly" : "yearly"}`,
          }
        : {}),
      sourceFields: { original: { status: "Kısmi tamamlandı", value: 4 } },
      workLog: [
        {
          id: `session-${type}`,
          date: "2026-11-07",
          endedAt: stamp,
          durationMs: 45000,
          note: "Kaydedilmiş sonuç.",
          nextAction: "Kaydedilmiş adım.",
        },
      ],
      ...(type === "waiting"
        ? {
            nextFollowUpDate: "2026-11-10",
            followUpLog: [
              {
                id: "follow-up-partial",
                date: "2026-11-07",
                note: "Yanıt soruldu.",
                nextFollowUpDate: "2026-11-10",
              },
            ],
          }
        : {}),
    }),
  );
  const before = JSON.stringify(records);
  const parsed = validateStore({ version: 1, records });
  assert.equal(JSON.stringify(parsed.records), before);
  assert.equal(JSON.stringify(records), before);
  for (const record of parsed.records) {
    assert.equal(record.status, "partially_completed");
    assert.equal(statusLabel(record.type, record.status), "Devam ediyor");
    if (["weekly", "monthly", "yearly"].includes(record.type))
      assert.equal(goalProgress(record, parsed.records).percent, 40);
  }
});

test("the new-record path rejects the retired status while the legacy reader still accepts it", () => {
  for (const type of Object.keys(TYPES)) {
    const input = {
      type,
      title: `Yeni ${type}`,
      status: "partially_completed",
    };
    assert.throws(
      () =>
        prepareRecordCreation([], input, { now: "2026-11-07T12:00:00.000Z" }),
      /Yeni kayıt için geçerli bir durum/,
    );
    assert.equal(createRecord(input).status, "partially_completed");
  }
});
