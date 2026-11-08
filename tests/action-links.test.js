import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import {
  linkedAction,
  linkedActions,
  sourceForTarget,
  resolveActionSource,
  syncActionLinks,
  buildMeetingActions,
} from "../src/action-links.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const record = (id, input = {}) =>
  createRecord({ id, title: id, createdAt: STAMP, updatedAt: STAMP, ...input });
const meeting = (id = "meeting", input = {}) =>
  record(id, {
    type: "meeting",
    title: "Test planı revizyon kararı",
    decision: "Ölçümden sonra revizyon hazırlanacak.",
    participants: "Tasarım ve test ekibi",
    owner: "Özgün sorumlu",
    dueDate: "2026-11-06",
    nextAction: "Özgün karar adımı",
    sourceFields: { "Özgün bilgi": { value: "Korunacak kaynak" } },
    ...input,
  });
const target = (id = "work", sourceId = "meeting", input = {}) =>
  record(id, {
    type: "daily",
    status: "in_progress",
    dueDate: "2026-11-10",
    nextAction: "Revizyonu paylaş",
    owner: "Ben",
    ...input,
    sourceFields: {
      ...input.sourceFields,
      __followupSource: {
        recordId: sourceId,
        type: "meeting",
      },
    },
  });

test("typed source lookup reuses only its chosen route and old daily origins remain readable", () => {
  const source = meeting();
  const waiting = target("waiting", source.id, {
    type: "waiting",
    expectedFrom: "Ahmet",
  });
  const rows = [source, waiting];
  assert.equal(linkedAction(source.id, rows), waiting);
  assert.deepEqual(linkedActions(source.id, rows), [waiting]);
  assert.equal(linkedAction(source.id, rows, "waiting"), waiting);
  assert.equal(linkedAction(source.id, rows, "daily"), null);
  assert.equal(sourceForTarget(waiting, rows), source);
  assert.equal(linkedAction("unrouted", rows), null);
  const standalone = record("waiting-source", { type: "waiting" });
  const oldDaily = target("old-daily", standalone.id);
  oldDaily.sourceFields.__followupSource.type = "waiting";
  assert.equal(sourceForTarget(oldDaily, [standalone, oldDaily]), standalone);
  assert.equal(linkedAction(standalone.id, [standalone, oldDaily]), oldDaily);
  assert.equal(sourceForTarget(oldDaily, [oldDaily]), null);
});

test("meeting projections read target lifecycle without changing saved decision context or timestamps", () => {
  for (const [type, status, expected] of [
    ["daily", "in_progress", "in_progress"],
    ["daily", "partially_completed", "in_progress"],
    ["daily", "waiting", "waiting"],
    ["waiting", "follow_up", "waiting"],
    ["waiting", "waiting_response", "waiting"],
    ["waiting", "planned", "planned"],
    ["daily", "completed", "completed"],
    ["waiting", "completed", "completed"],
    ["daily", "transferred", "completed"],
    ["waiting", "cancelled", "cancelled"],
  ]) {
    const source = meeting();
    const action = target("target", source.id, {
      type,
      status,
      expectedFrom: "Ahmet",
    });
    const rows = [source, action];
    const before = JSON.stringify(rows);
    const projected = resolveActionSource(source, rows);
    assert.equal(projected.status, expected);
    assert.equal(projected.dueDate, source.dueDate);
    assert.equal(projected.nextAction, source.nextAction);
    assert.equal(projected.owner, source.owner);
    for (const key of [
      "id",
      "title",
      "participants",
      "decision",
      "sourceFields",
      "createdAt",
      "updatedAt",
    ])
      assert.deepEqual(projected[key], source[key]);
    assert.equal(JSON.stringify(rows), before);
    assert.equal(
      validateStore({ version: 1, records: rows }).records[0].status,
      "planned",
    );
    const synced = syncActionLinks([source], rows);
    assert.equal(synced[0].status, expected);
    assert.equal(
      validateStore({ version: 1, records: synced }).records[0].status,
      expected,
    );
  }
});

test("legacy partial routes remain byte-stable when read and only explicit affected saves derive an in-progress meeting", () => {
  const source = meeting("legacy-partial-source", {
    status: "partially_completed",
  });
  const work = target("legacy-partial-work", source.id, {
    status: "partially_completed",
    targetValue: 10,
    currentValue: 4,
  });
  const rows = [source, work];
  const before = JSON.stringify(rows);
  assert.equal(resolveActionSource(source, rows).status, "in_progress");
  assert.equal(syncActionLinks(rows, rows), rows);
  assert.equal(
    JSON.stringify(validateStore({ version: 1, records: rows }).records),
    before,
  );
  assert.equal(JSON.stringify(rows), before);
  const edited = { ...work, nextAction: "Kaydedilen açık adım." };
  const result = syncActionLinks(rows, [source, edited]);
  assert.equal(result[0].status, "in_progress");
  assert.equal(result[0].decision, source.decision);
  assert.equal(result[1], edited);
  assert.equal(result[1].status, "partially_completed");
  assert.equal(result[1].currentValue, 4);
  assert.equal(result[1].targetValue, 10);
  assert.equal(JSON.stringify(rows), before);
});

test("creating or editing one target mirrors only its meeting source and leaves unrelated stale links untouched", () => {
  const source = meeting();
  const unrelatedSource = meeting("unrelated", { status: "waiting" });
  const unrelatedAction = target("unrelated-work", unrelatedSource.id, {
    status: "completed",
  });
  const before = [source, unrelatedSource, unrelatedAction];
  const action = target();
  const after = [...before, action];
  const synced = syncActionLinks(before, after);
  assert.deepEqual(synced[0], resolveActionSource(source, after));
  assert.equal(synced[1], unrelatedSource);
  assert.equal(synced[2], unrelatedAction);
  assert.equal(synced[3], action);
  assert.equal(syncActionLinks(synced, synced), synced);
  const completed = {
    ...action,
    status: "completed",
    dueDate: "",
    nextAction: "",
    owner: "",
  };
  const edited = synced.map((row) => (row.id === action.id ? completed : row));
  const closed = syncActionLinks(synced, edited);
  assert.equal(closed[0].status, "completed");
  assert.equal(closed[0].dueDate, source.dueDate);
  assert.equal(closed[0].nextAction, source.nextAction);
  assert.equal(closed[0].owner, source.owner);
  assert.equal(closed[1], unrelatedSource);
  assert.deepEqual(before, [source, unrelatedSource, unrelatedAction]);
});

test("source context edits preserve the context while target lifecycle remains authoritative", () => {
  const source = meeting();
  const action = target();
  const before = [source, action];
  const contextEdit = {
    ...source,
    title: "Düzeltilen karar",
    decision: "Yeni açıklama",
    dueDate: "2026-12-01",
  };
  const after = [contextEdit, action];
  const synced = syncActionLinks(before, after);
  assert.equal(synced[0].title, contextEdit.title);
  assert.equal(synced[0].decision, contextEdit.decision);
  assert.equal(synced[0].dueDate, contextEdit.dueDate);
  assert.equal(synced[1], action);
});

test("finishing contact work never closes an external expectation or the meeting waiting for that expectation", () => {
  const source = meeting();
  const expectation = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
    expectedFrom: "Ahmet",
    dueDate: "2026-11-14",
    nextAction: "Ölçüm sonucunu bekle",
    nextFollowUpDate: "2026-11-12",
    lastFollowUpDate: "2026-11-06",
    latestUpdate: "Ölçüm sürüyor.",
    followUpLog: [
      {
        id: "follow",
        date: "2026-11-06",
        note: "Telefonla soruldu",
        nextFollowUpDate: "2026-11-12",
      },
    ],
  });
  const contact = target("contact", expectation.id, {
    title: "Ahmet'e takip maili gönder",
    status: "in_progress",
  });
  contact.sourceFields.__followupSource.type = "waiting";
  const before = [source, expectation, contact];
  const projected = resolveActionSource(source, before);
  assert.equal(projected.status, "waiting");
  assert.equal(projected.dueDate, source.dueDate);
  assert.equal(projected.owner, source.owner);
  assert.equal(resolveActionSource(expectation, before), expectation);
  const afterContact = [
    source,
    expectation,
    { ...contact, status: "completed" },
  ];
  assert.equal(syncActionLinks(before, afterContact), afterContact);
  assert.equal(resolveActionSource(source, afterContact).status, "waiting");
  assert.equal(resolveActionSource(expectation, afterContact), expectation);
  const responseReceived = [
    source,
    { ...expectation, status: "completed" },
    afterContact[2],
  ];
  const synced = syncActionLinks(afterContact, responseReceived);
  assert.equal(synced[0].status, "completed");
  assert.deepEqual(synced[1].followUpLog, expectation.followUpLog);
  assert.equal(synced[1].expectedFrom, "Ahmet");
  assert.equal(synced[1].nextFollowUpDate, expectation.nextFollowUpDate);
  assert.equal(synced[2], afterContact[2]);
});

test("ambiguous targets and cycles reject affected edits without choosing or deleting any record", () => {
  const source = meeting();
  const first = target("first");
  const second = target("second", source.id);
  const ambiguous = [source, first, second];
  const snapshot = structuredClone(ambiguous);
  assert.throws(() => linkedAction(source.id, ambiguous), /birden fazla/);
  assert.throws(() => resolveActionSource(source, ambiguous), /birden fazla/);
  assert.throws(
    () => syncActionLinks([source, first], ambiguous),
    /birden fazla/,
  );
  assert.deepEqual(ambiguous, snapshot);
  const independent = record("other");
  const before = [...ambiguous, independent];
  const after = [
    ...ambiguous,
    { ...independent, description: "Başka kayıt düzenlendi" },
  ];
  assert.equal(syncActionLinks(before, after), after);
  const cycleSource = {
    ...source,
    sourceFields: { __followupSource: { recordId: first.id, type: "waiting" } },
  };
  assert.throws(() => linkedAction(source.id, [cycleSource, first]), /döngü/);
  assert.throws(
    () => syncActionLinks([source, first], [cycleSource, first]),
    /döngü/,
  );
});

test("deleting a target keeps its meeting context, and deleting a source keeps the target and its historical origin", () => {
  const source = meeting();
  const action = target();
  const before = [source, action];
  const removedAction = [source];
  assert.equal(syncActionLinks(before, removedAction), removedAction);
  assert.equal(linkedAction(source.id, removedAction), null);
  const removedSource = [action];
  assert.equal(syncActionLinks(before, removedSource), removedSource);
  assert.equal(sourceForTarget(action, removedSource), null);
  assert.equal(action.sourceFields.__followupSource.recordId, source.id);
});

test("one native workspace transaction persists target and meeting changes with exact reload undo and failed-write safety", () => {
  const source = meeting();
  const action = target();
  const original = [source, action];
  const values = new Map([
    ["actions", JSON.stringify({ version: 1, records: original })],
  ]);
  let fail = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new Error("quota");
      values.set(key, value);
    },
  };
  let store = createWorkspaceStore({ storage, key: "actions" });
  assert.deepEqual(store.records, original);
  const completed = [source, { ...action, status: "completed" }];
  const synced = syncActionLinks(store.records, completed);
  fail = true;
  assert.throws(() => store.saveRecords(synced, "Aksiyonu tamamla"), /quota/);
  assert.deepEqual(store.records, original);
  assert.equal(store.canUndo, false);
  fail = false;
  store.saveRecords(synced, "Aksiyonu tamamla");
  assert.equal(store.records[0].status, "completed");
  assert.equal(store.records[1].status, "completed");
  store = createWorkspaceStore({ storage, key: "actions" });
  store.undo();
  assert.deepEqual(store.records, original);
  assert.deepEqual(
    validateStore(JSON.parse(values.get("actions"))).records,
    original,
  );
});

test("a meeting has one target per route with stable typed lookups and original record references", () => {
  const source = meeting();
  const work = target("daily", source.id);
  const waiting = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
  });
  const rows = [source, waiting, work];
  const snapshot = structuredClone(rows);
  assert.deepEqual(linkedActions(source.id, rows), [work, waiting]);
  assert.equal(linkedAction(source.id, rows), null);
  assert.equal(linkedAction(source.id, rows, "daily"), work);
  assert.equal(linkedAction(source.id, rows, "waiting"), waiting);
  assert.equal(sourceForTarget(work, rows), source);
  assert.equal(sourceForTarget(waiting, rows), source);
  assert.deepEqual(linkedActions("unrouted", rows), []);
  assert.throws(() => linkedAction(source.id, rows, "weekly"), /aksiyon türü/);
  assert.deepEqual(rows, snapshot);
});

test("dual-route status follows all outcomes and does not complete the expectation when own work finishes", () => {
  for (const [dailyStatus, waitingStatus, expected] of [
    ["planned", "planned", "planned"],
    ["in_progress", "planned", "in_progress"],
    ["in_progress", "waiting_response", "in_progress"],
    ["completed", "waiting_response", "waiting"],
    ["completed", "planned", "waiting"],
    ["waiting", "completed", "waiting"],
    ["planned", "completed", "in_progress"],
    ["partially_completed", "cancelled", "in_progress"],
    ["partially_completed", "waiting_response", "in_progress"],
    ["cancelled", "planned", "waiting"],
    ["cancelled", "completed", "completed"],
    ["completed", "completed", "completed"],
    ["transferred", "completed", "completed"],
    ["cancelled", "cancelled", "cancelled"],
  ]) {
    const source = meeting();
    const work = target("work", source.id, { status: dailyStatus });
    const waiting = target("expectation", source.id, {
      type: "waiting",
      status: waitingStatus,
    });
    const rows = [source, work, waiting];
    const snapshot = JSON.stringify(rows);
    assert.equal(
      resolveActionSource(source, rows).status,
      expected,
      `${dailyStatus}/${waitingStatus}`,
    );
    assert.equal(JSON.stringify(rows), snapshot);
  }
});

test("dual summaries derive only status while route dates, owners and next steps never replace historical meeting context", () => {
  const source = meeting();
  const work = target("work", source.id, {
    status: "completed",
    dueDate: "2026-11-04",
    owner: "Ben",
  });
  const waiting = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
    dueDate: "2026-11-14",
    expectedFrom: "Ahmet",
    nextAction: "Ölçümü bekle",
  });
  const rows = [source, waiting, work];
  const projected = resolveActionSource(source, rows);
  assert.deepEqual(projected, { ...source, status: "waiting" });
  for (const key of [
    "id",
    "title",
    "decision",
    "participants",
    "description",
    "createdAt",
    "updatedAt",
    "sourceFields",
  ])
    assert.deepEqual(projected[key], source[key]);
  assert.equal(
    resolveActionSource(source, [source, work, { ...waiting, dueDate: "" }])
      .dueDate,
    source.dueDate,
  );
  assert.equal(
    resolveActionSource(source, [
      source,
      work,
      { ...waiting, status: "completed" },
    ]).dueDate,
    source.dueDate,
  );
  const sameOwner = resolveActionSource(source, [
    source,
    { ...work, owner: "Ahmet", nextAction: "" },
    waiting,
  ]);
  assert.equal(sameOwner.owner, source.owner);
  assert.equal(sameOwner.nextAction, source.nextAction);
  assert.equal(
    validateStore({ version: 1, records: rows }).records[0].status,
    source.status,
  );
});

test("external waiting contact steps remain independent even alongside a direct meeting daily action", () => {
  const source = meeting();
  const ownWork = target("own", source.id, { status: "completed" });
  const waiting = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
    expectedFrom: "Ahmet",
    nextAction: "Dış yanıtı bekle",
  });
  const contact = target("contact", waiting.id, { status: "in_progress" });
  contact.sourceFields.__followupSource.type = "waiting";
  const before = syncActionLinks([source], [source, ownWork, waiting, contact]);
  assert.equal(before[0].status, "waiting");
  assert.equal(resolveActionSource(waiting, before), waiting);
  const after = before.map((row) =>
    row.id === contact.id ? { ...row, status: "completed" } : row,
  );
  assert.equal(syncActionLinks(before, after), after);
  assert.equal(after[0], before[0]);
  assert.equal(resolveActionSource(after[0], after).status, "waiting");
  assert.equal(after[2], waiting);
  const response = after.map((row) =>
    row.id === waiting.id ? { ...row, status: "completed" } : row,
  );
  assert.equal(syncActionLinks(after, response)[0].status, "completed");
});

test("same-type duplicate routes, invalid waiting branches and cycles reject only affected transactions", () => {
  const source = meeting();
  const work = target("work", source.id);
  const waiting = target("expectation", source.id, { type: "waiting" });
  const before = [source, work, waiting];
  const snapshot = structuredClone(before);
  for (const duplicate of [
    target("extra-work", source.id),
    target("extra-wait", source.id, { type: "waiting" }),
  ]) {
    const after = [...before, duplicate];
    assert.throws(
      () => linkedActions(source.id, after),
      /aynı türde birden fazla/,
    );
    assert.throws(
      () => syncActionLinks(before, after),
      /aynı türde birden fazla/,
    );
  }
  const firstContact = target("contact-1", waiting.id);
  const secondContact = target("contact-2", waiting.id);
  assert.throws(
    () =>
      syncActionLinks(
        [...before, firstContact],
        [...before, firstContact, secondContact],
      ),
    /aynı türde birden fazla/,
  );
  const wrongBranch = target("nested-waiting", waiting.id, { type: "waiting" });
  assert.throws(
    () => linkedActions(waiting.id, [...before, wrongBranch]),
    /yalnızca bir günlük/,
  );
  assert.throws(
    () => syncActionLinks(before, [...before, wrongBranch]),
    /yalnızca bir günlük/,
  );
  const self = {
    ...work,
    sourceFields: { __followupSource: { recordId: work.id, type: "meeting" } },
  };
  assert.throws(() => linkedActions(work.id, [self]), /kendisine/);
  const cycle = {
    ...source,
    sourceFields: {
      __followupSource: { recordId: firstContact.id, type: "waiting" },
    },
  };
  assert.throws(
    () => linkedActions(source.id, [cycle, work, waiting, firstContact]),
    /döngü/,
  );
  assert.deepEqual(before, snapshot);
});

test("deleting one dual target projects the remaining branch without deleting sources, other targets or history", () => {
  const source = meeting();
  const work = target("work", source.id);
  const waiting = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
    expectedFrom: "Ahmet",
  });
  const before = syncActionLinks([source], [source, work, waiting]);
  const removedWork = syncActionLinks(
    before,
    before.filter((row) => row.id !== work.id),
  );
  assert.equal(removedWork[0].status, "waiting");
  assert.equal(removedWork[0].nextAction, source.nextAction);
  assert.equal(removedWork[0].owner, source.owner);
  assert.equal(removedWork[1], waiting);
  const removedWait = syncActionLinks(
    before,
    before.filter((row) => row.id !== waiting.id),
  );
  assert.equal(removedWait[0].status, work.status);
  assert.equal(removedWait[0].nextAction, source.nextAction);
  assert.equal(removedWait[1], work);
  const removedSource = before.filter((row) => row.id !== source.id);
  assert.equal(syncActionLinks(before, removedSource), removedSource);
  assert.equal(sourceForTarget(work, removedSource), null);
  assert.equal(sourceForTarget(waiting, removedSource), null);
  assert.equal(work.sourceFields.__followupSource.recordId, source.id);
});

test("concurrent route drafts require a fresh snapshot, preserve the other route and undo the dual transaction exactly", () => {
  const source = meeting();
  const work = target("work", source.id);
  const waiting = target("expectation", source.id, {
    type: "waiting",
    status: "waiting_response",
    expectedFrom: "Ahmet",
  });
  const values = new Map([
    ["dual-actions", JSON.stringify({ version: 1, records: [source] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = createWorkspaceStore({ storage, key: "dual-actions" });
  const second = createWorkspaceStore({ storage, key: "dual-actions" });
  first.saveRecords(
    syncActionLinks(first.records, [source, work]),
    "Ben yapacağım",
  );
  const firstSaved = first.records;
  assert.throws(
    () =>
      second.saveRecords(
        syncActionLinks(second.records, [source, waiting]),
        "Başkasından bekliyorum",
      ),
    /başka bir pencerede/,
  );
  assert.deepEqual(second.records, firstSaved);
  second.saveRecords(
    syncActionLinks(second.records, [...second.records, waiting]),
    "Başkasından bekliyorum",
  );
  assert.equal(second.records.length, 3);
  assert.equal(linkedActions(source.id, second.records).length, 2);
  assert.equal(second.records[0].status, "in_progress");
  const savedRaw = values.get("dual-actions");
  assert.throws(
    () =>
      syncActionLinks(second.records, [
        ...second.records,
        target("duplicate", source.id),
      ]),
    /birden fazla/,
  );
  assert.equal(values.get("dual-actions"), savedRaw);
  let reopened = createWorkspaceStore({ storage, key: "dual-actions" });
  assert.equal(reopened.undo(), "Başkasından bekliyorum");
  assert.deepEqual(reopened.records, firstSaved);
  assert.equal(reopened.undo(), "Ben yapacağım");
  assert.deepEqual(reopened.records, [source]);
  const nativeBackup = validateStore(JSON.parse(savedRaw));
  assert.equal(nativeBackup.records.length, 3);
  assert.equal(
    resolveActionSource(nativeBackup.records[0], nativeBackup.records).status,
    "in_progress",
  );
});

test("an orphaned origin marker remains history when its surviving target is reclassified", () => {
  const source = meeting();
  const work = target("work", source.id, {
    description: "Kaynak silinse de korunacak bağlam",
  });
  const removedSource = syncActionLinks([source, work], [work]);
  const reclassified = createRecord({
    ...work,
    type: "monthly",
    metric: "Rapor",
    targetValue: 4,
    currentValue: 1,
    updatedAt: "2026-11-07T10:00:00Z",
  });
  const proposed = [reclassified];
  assert.equal(syncActionLinks(removedSource, proposed), proposed);
  assert.deepEqual(linkedActions(source.id, proposed), []);
  assert.equal(linkedAction(source.id, proposed, "daily"), null);
  assert.equal(sourceForTarget(reclassified, proposed), null);
  assert.deepEqual(reclassified.sourceFields, work.sourceFields);
  assert.equal(reclassified.description, work.description);
  assert.equal(reclassified.sourceFields.__followupSource.recordId, source.id);
  assert.deepEqual(
    validateStore({ version: 1, records: proposed }).records,
    proposed,
  );
  // A live origin still rejects this unsupported route instead of hiding it.
  assert.throws(
    () => linkedActions(source.id, [source, reclassified]),
    /kayıt türü geçersiz/,
  );
  assert.throws(
    () => syncActionLinks([source, work], [source, reclassified]),
    /kayıt türü geçersiz/,
  );
  assert.deepEqual(removedSource, [work]);
});

const pairDrafts = () => ({
  daily: {
    title: "Test planını revize et",
    owner: "Ben",
    dueDate: "2026-11-10",
    nextAction: "Taslağı hazırla",
  },
  waiting: {
    title: "Ahmet'in ölçüm sonucunu bekle",
    expectedFrom: "Ahmet",
    dueDate: "2026-11-12",
    nextAction: "Ölçüm sonucunu iste",
  },
});
const PAIR_NOW = "2026-11-07T10:00:00.000Z";
const pairOptions = () => ({
  now: PAIR_NOW,
  idFactory: (type) => `pair-${type}`,
});

test("new meeting routes keep independent work priority and follow-up facts without inheriting obsolete meeting fields", () => {
  const source = meeting("independent-source", {
    priority: "urgent",
    dueDate: "2026-11-06",
    owner: "Toplantının eski sorumlusu",
    nextAction: "Eski toplantı adımı.",
  });
  const sourceBefore = JSON.stringify(source);
  const built = buildMeetingActions(
    [source],
    source.id,
    {
      daily: {},
      waiting: {
        title: "Test ekibinin plan onayı",
        expectedFrom: "Test ekibi",
        nextFollowUpDate: "2026-11-09",
        latestUpdate: "Planın ilk sürümü paylaşıldı.",
      },
    },
    pairOptions(),
  );
  for (const route of [built.daily, built.waiting]) {
    assert.equal(route.priority, "normal");
    assert.equal(route.dueDate, "");
    assert.equal(route.nextAction, "");
    assert.equal(route.owner, "");
    assert.equal(route.lastFollowUpDate, "");
    assert.equal(Object.hasOwn(route, "followUpLog"), false);
  }
  assert.equal(built.waiting.nextFollowUpDate, "2026-11-09");
  assert.equal(built.waiting.latestUpdate, "Planın ilk sürümü paylaşıldı.");
  assert.equal(built.waiting.expectedFrom, "Test ekibi");
  assert.deepEqual(built.records[0], { ...source, status: "waiting" });
  assert.equal(JSON.stringify(source), sourceBefore);

  const own = buildMeetingActions(
    [source],
    source.id,
    {
      daily: {
        title: "Test planını hazırla",
        priority: "high",
        dueDate: "2026-11-13",
        owner: "Ben",
        nextAction: "İlgili kişilere ulaş.",
      },
      waiting: {
        nextFollowUpDate: "2026-11-09",
        latestUpdate: "Yanıt bekleniyor.",
      },
    },
    pairOptions(),
  );
  assert.equal(own.daily.priority, "high");
  assert.equal(own.daily.dueDate, "2026-11-13");
  assert.equal(own.daily.owner, "Ben");
  assert.equal(own.daily.nextAction, "İlgili kişilere ulaş.");
  assert.equal(own.waiting.nextFollowUpDate, "2026-11-09");
  assert.deepEqual(own.records[0], { ...source, status: "waiting" });
  const reused = buildMeetingActions(own.records, source.id, {}, pairOptions());
  assert.equal(reused.records, own.records);
  assert.equal(reused.daily, own.daily);
  assert.equal(reused.waiting, own.waiting);
});

test("new paired daily work defaults to unlinked context without rewriting explicit, parent-linked or reused work", () => {
  const source = meeting();
  const weekly = record("pair-weekly", {
    type: "weekly",
    periodKey: "2026-W45",
  });
  const originals = [source, weekly];
  const before = JSON.stringify(originals);
  for (const [patch, expected] of [
    [{}, "ad_hoc"],
    [{ workContext: "" }, ""],
    [{ parentId: weekly.id }, ""],
  ]) {
    const drafts = pairDrafts();
    Object.assign(drafts.daily, patch);
    const built = buildMeetingActions(
      originals,
      source.id,
      drafts,
      pairOptions(),
    );
    assert.equal(built.daily.workContext, expected);
    assert.equal(built.daily.parentId, patch.parentId || null);
    assert.equal(Object.hasOwn(built.waiting, "workContext"), false);
    assert.equal(JSON.stringify(originals), before);
  }
  const invalid = pairDrafts();
  Object.assign(invalid.daily, { parentId: weekly.id, workContext: "ad_hoc" });
  assert.throws(
    () => buildMeetingActions(originals, source.id, invalid, pairOptions()),
    /Anlık/,
  );
  assert.equal(JSON.stringify(originals), before);

  const legacy = target("legacy-context-free", source.id, {
    status: "completed",
  });
  const current = [...originals, legacy];
  const legacySnapshot = JSON.stringify(legacy);
  const reused = buildMeetingActions(
    current,
    source.id,
    pairDrafts(),
    pairOptions(),
  );
  assert.equal(reused.daily, legacy);
  assert.equal(Object.hasOwn(reused.daily, "workContext"), false);
  assert.equal(JSON.stringify(legacy), legacySnapshot);
  assert.equal(Object.hasOwn(reused.waiting, "workContext"), false);
});

test("the Save-time pair builder creates separate editable routes in one derived snapshot without mutating source context", () => {
  const source = meeting("meeting", { priority: "urgent" });
  const original = [source];
  const snapshot = structuredClone(original);
  const drafts = pairDrafts();
  const draftSnapshot = structuredClone(drafts);
  const built = buildMeetingActions(original, source.id, drafts, pairOptions());
  assert.deepEqual(built.createdTypes, ["daily", "waiting"]);
  assert.deepEqual(built.reusedTypes, []);
  assert.equal(built.records.length, 3);
  assert.equal(built.daily, built.records[1]);
  assert.equal(built.waiting, built.records[2]);
  assert.equal(built.daily.title, drafts.daily.title);
  assert.equal(built.daily.status, "planned");
  assert.equal(built.waiting.title, drafts.waiting.title);
  assert.equal(built.waiting.status, "waiting_response");
  assert.equal(built.waiting.expectedFrom, "Ahmet");
  for (const row of [built.daily, built.waiting]) {
    assert.equal(row.createdAt, PAIR_NOW);
    assert.equal(row.updatedAt, PAIR_NOW);
    assert.equal(row.sourceDate, "2026-11-07");
    assert.equal(row.priority, "normal");
    assert.match(row.description, /Toplantı kararı:/);
    assert.deepEqual(row.sourceFields.__followupSource, {
      recordId: source.id,
      type: "meeting",
    });
  }
  const projected = built.records[0];
  assert.equal(projected.status, "waiting");
  assert.equal(projected.owner, source.owner);
  assert.equal(projected.dueDate, source.dueDate);
  assert.equal(projected.nextAction, source.nextAction);
  assert.equal(projected.priority, source.priority);
  assert.equal(projected.title, source.title);
  assert.equal(projected.decision, source.decision);
  assert.equal(projected.participants, source.participants);
  assert.equal(projected.updatedAt, source.updatedAt);
  assert.deepEqual(
    validateStore({ version: 1, records: built.records }).records,
    built.records,
  );
  assert.deepEqual(original, snapshot);
  assert.deepEqual(drafts, draftSnapshot);
});

test("the pair builder creates only a missing route and never overwrites an existing route's user work", () => {
  const source = meeting();
  const work = target("existing", source.id, {
    description: "Kaydedilmiş özel not",
    nextAction: "Mevcut kullanıcı adımı",
  });
  const original = [source, work];
  const drafts = pairDrafts();
  drafts.daily = { title: "", type: "waiting", description: "Yazılmamalı" };
  const allocated = [];
  const built = buildMeetingActions(original, source.id, drafts, {
    now: PAIR_NOW,
    idFactory: (type) => {
      allocated.push(type);
      return `new-${type}`;
    },
  });
  assert.deepEqual(allocated, ["waiting"]);
  assert.deepEqual(built.createdTypes, ["waiting"]);
  assert.deepEqual(built.reusedTypes, ["daily"]);
  assert.equal(built.daily, work);
  assert.equal(built.records[1], work);
  assert.equal(work.nextAction, "Mevcut kullanıcı adımı");
  const noOp = buildMeetingActions(built.records, source.id, null, {
    now: "unused",
    idFactory: () => {
      throw new Error("Must not allocate");
    },
  });
  assert.equal(noOp.records, built.records);
  assert.equal(noOp.daily, work);
  assert.equal(noOp.waiting, built.waiting);
  assert.deepEqual(noOp.createdTypes, []);
  assert.deepEqual(noOp.reusedTypes, ["daily", "waiting"]);
});

test("a malformed missing branch, invalid goal link or duplicate identifier rejects the whole pair without writes", () => {
  const source = meeting();
  const original = [source];
  const snapshot = structuredClone(original);
  for (const drafts of [
    { daily: pairDrafts().daily },
    { daily: pairDrafts().daily, waiting: [] },
    { ...pairDrafts(), waiting: { title: "" } },
    { ...pairDrafts(), waiting: { title: "Yeni takip", type: "daily" } },
    {
      ...pairDrafts(),
      waiting: { title: "Yeni takip", dueDate: "2026-02-30" },
    },
    { ...pairDrafts(), waiting: { title: "Yeni takip", sourceFields: [] } },
    {
      ...pairDrafts(),
      daily: { title: "Günlük iş", parentId: "missing-goal" },
    },
  ])
    assert.throws(() =>
      buildMeetingActions(original, source.id, drafts, pairOptions()),
    );
  assert.throws(
    () =>
      buildMeetingActions(original, source.id, pairDrafts(), {
        now: PAIR_NOW,
        idFactory: () => "same-id",
      }),
    /Tekrarlanan/,
  );
  assert.throws(
    () =>
      buildMeetingActions(original, source.id, pairDrafts(), {
        now: PAIR_NOW,
        idFactory: () => source.id,
      }),
    /Tekrarlanan/,
  );
  assert.throws(
    () =>
      buildMeetingActions(original, source.id, pairDrafts(), {
        now: PAIR_NOW,
        idFactory: () => "",
      }),
    /kimliği geçersiz/,
  );
  for (const now of [
    null,
    "invalid",
    "2026-02-30T10:00:00Z",
    "2026-11-07T24:00:00Z",
    new Date(NaN),
  ])
    assert.throws(
      () => buildMeetingActions(original, source.id, pairDrafts(), { now }),
      /zamanı geçersiz/,
    );
  assert.throws(
    () => buildMeetingActions(original, "missing", pairDrafts(), pairOptions()),
    /toplantı kaydı/,
  );
  assert.throws(
    () =>
      buildMeetingActions(
        [record("waiting-source", { type: "waiting" })],
        "waiting-source",
        pairDrafts(),
        pairOptions(),
      ),
    /toplantı kaydı/,
  );
  const ambiguous = [source, target("one"), target("two")];
  assert.throws(
    () =>
      buildMeetingActions(ambiguous, source.id, pairDrafts(), pairOptions()),
    /birden fazla/,
  );
  assert.deepEqual(original, snapshot);
});

test("new target metadata cannot redirect the pair away from its meeting and explicit blank fields remain blank", () => {
  const source = meeting();
  const drafts = pairDrafts();
  drafts.daily = {
    ...drafts.daily,
    dueDate: "",
    nextAction: "",
    sourceFields: {
      retained: { value: 1 },
      __followupSource: { recordId: "other", type: "waiting" },
    },
  };
  drafts.waiting = {
    ...drafts.waiting,
    expectedFrom: "",
    description: "",
    sourceDate: "2026-11-06",
  };
  const built = buildMeetingActions([source], source.id, drafts, pairOptions());
  assert.equal(built.daily.dueDate, "");
  assert.equal(built.daily.nextAction, "");
  assert.deepEqual(built.daily.sourceFields.retained, { value: 1 });
  assert.deepEqual(built.daily.sourceFields.__followupSource, {
    recordId: source.id,
    type: "meeting",
  });
  assert.equal(built.waiting.expectedFrom, "");
  assert.equal(built.waiting.description, "");
  assert.equal(built.waiting.sourceDate, "2026-11-06");
  assert.equal(built.records[0].nextAction, source.nextAction);
});

test("both new routes and aggregate source save as one transaction with quota safety, native backup and exact reload Undo", () => {
  const source = meeting();
  const values = new Map([
    ["pair", JSON.stringify({ version: 1, records: [source] })],
  ]);
  let fail = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new Error("quota");
      values.set(key, value);
    },
  };
  let store = createWorkspaceStore({ storage, key: "pair" });
  const originalRaw = values.get("pair");
  const built = buildMeetingActions(
    store.records,
    source.id,
    pairDrafts(),
    pairOptions(),
  );
  assert.equal(values.get("pair"), originalRaw);
  assert.deepEqual(store.records, [source]);
  fail = true;
  assert.throws(
    () => store.saveRecords(built.records, "Her ikisi de"),
    /quota/,
  );
  assert.equal(values.get("pair"), originalRaw);
  assert.deepEqual(store.records, [source]);
  assert.equal(store.canUndo, false);
  fail = false;
  store.saveRecords(built.records, "Her ikisi de");
  assert.equal(store.history.length, 1);
  assert.equal(store.records.length, 3);
  assert.deepEqual(
    validateStore({
      version: 1,
      records: JSON.parse(JSON.stringify(store.records)),
    }).records,
    built.records,
  );
  store = createWorkspaceStore({ storage, key: "pair" });
  assert.equal(store.undo(), "Her ikisi de");
  assert.deepEqual(store.records, [source]);
});

test("a stale both-route form retries against current data and reuses a concurrently created branch without overwriting it", () => {
  const source = meeting();
  const work = target("concurrent-work", source.id, {
    title: "Diğer penceredeki iş",
    nextAction: "İlk kaydedilen gerçek adım",
  });
  const values = new Map([
    ["pair-race", JSON.stringify({ version: 1, records: [source] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = createWorkspaceStore({ storage, key: "pair-race" });
  const second = createWorkspaceStore({ storage, key: "pair-race" });
  const stalePair = buildMeetingActions(
    second.records,
    source.id,
    pairDrafts(),
    pairOptions(),
  );
  first.saveRecords(
    syncActionLinks(first.records, [source, work]),
    "Günlük işi aç",
  );
  const concurrentSnapshot = first.records;
  assert.throws(
    () => second.saveRecords(stalePair.records, "Her ikisi de"),
    /başka bir pencerede/,
  );
  assert.deepEqual(second.records, concurrentSnapshot);
  const fresh = buildMeetingActions(
    second.records,
    source.id,
    pairDrafts(),
    pairOptions(),
  );
  assert.deepEqual(fresh.createdTypes, ["waiting"]);
  assert.deepEqual(fresh.reusedTypes, ["daily"]);
  assert.deepEqual(fresh.daily, work);
  second.saveRecords(fresh.records, "Her ikisi de");
  assert.equal(second.records.length, 3);
  assert.equal(
    second.records.find((r) => r.id === work.id).nextAction,
    work.nextAction,
  );
  const savedSnapshot = second.records;
  const repeated = buildMeetingActions(
    savedSnapshot,
    source.id,
    pairDrafts(),
    pairOptions(),
  );
  assert.equal(repeated.records.length, 3);
  assert.equal(repeated.records, savedSnapshot);
  const reload = createWorkspaceStore({ storage, key: "pair-race" });
  reload.undo();
  assert.deepEqual(reload.records, concurrentSnapshot);
});
