import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecordCreation } from "../src/record-creation.js";
import { createRecord, goalProgress, validateStore } from "../src/model.js";
import { linkedActions, syncActionLinks } from "../src/action-links.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const NOW = "2026-11-07T10:00:00.000Z";
const STAMP = "2026-10-01T09:00:00.000Z";
const record = (id, type = "daily", input = {}) =>
  createRecord({
    id,
    type,
    title: id,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const prepare = (records, input, options = {}) =>
  prepareRecordCreation(records, input, { now: NOW, ...options });

test("all six new forms need only a title and retain predictable defaults without touching existing records", () => {
  const old = record("existing", "weekly", {
    targetValue: 7,
    currentValue: 3,
    metric: "Rapor",
    sourceFields: { retained: { value: [1, 2] } },
  });
  const rows = [old];
  const before = JSON.stringify(rows);
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ]) {
    const built = prepare(rows, {
      id: `new-${type}`,
      type,
      title: "  Yeni kayıt  ",
      metric: "Eski gizli değer",
      targetValue: 10,
      currentValue: 5,
    });
    assert.equal(built.records.length, 2);
    assert.equal(built.records[0], old);
    assert.equal(built.record, built.records[1]);
    assert.equal(built.record.type, type);
    assert.equal(built.record.title, "Yeni kayıt");
    assert.equal(built.record.status, "planned");
    assert.equal(built.record.priority, "normal");
    assert.equal(built.record.sourceDate, "2026-11-07");
    assert.equal(built.record.createdAt, NOW);
    assert.equal(built.record.updatedAt, NOW);
    assert.equal(built.record.dueDate, "");
    if (type === "daily") assert.equal(built.record.workContext, "ad_hoc");
    else assert.equal(Object.hasOwn(built.record, "workContext"), false);
    assert.equal(built.record.metric, "");
    assert.equal(built.record.targetValue, null);
    assert.equal(built.record.currentValue, null);
    for (const field of [
      "focusDate",
      "goalParentId",
      "workLog",
      "followUpLog",
      "nextFollowUpDate",
    ])
      assert.equal(Object.hasOwn(built.record, field), false);
    assert.equal(built.record.lastFollowUpDate, "");
    assert.equal(
      built.record.periodKey,
      { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type] || "",
    );
    assert.deepEqual(built.createdTypes, [type]);
    assert.deepEqual(built.reusedTypes, []);
    assert.equal(built.reused, false);
    assert.deepEqual(
      validateStore({ version: 1, records: built.records }).records,
      built.records,
    );
  }
  assert.equal(JSON.stringify(rows), before);
});

test("new daily contexts default at creation boundaries while explicit planning and reused legacy records stay intact", () => {
  const weekly = record("context-parent", "weekly", { periodKey: "2026-W45" });
  const meeting = record("context-meeting", "meeting");
  const waiting = record("context-waiting", "waiting");
  const originals = [weekly, meeting, waiting];
  const before = JSON.stringify(originals);
  assert.equal(
    prepare(originals, { title: "Haftaya bağlı", parentId: weekly.id }).record
      .workContext,
    "",
  );
  assert.equal(
    prepare(originals, { title: "Açıkça planlı", workContext: "" }).record
      .workContext,
    "",
  );
  for (const source of [meeting, waiting]) {
    const built = prepare(
      originals,
      { title: "Yeni takip adımı" },
      { sourceId: source.id },
    );
    assert.equal(built.record.workContext, "ad_hoc");
    assert.equal(built.record.parentId, null);
    const explicit = prepare(
      originals,
      { title: "Planlı takip", workContext: "" },
      { sourceId: source.id },
    );
    assert.equal(explicit.record.workContext, "");
  }
  for (const meetingRoute of ["daily", "both"]) {
    const built = prepare(
      originals,
      { id: `meeting-${meetingRoute}`, type: "meeting", title: "Yeni karar" },
      {
        meetingRoute,
        routeDrafts: {
          daily: { title: "Benim işim" },
          waiting: { title: "Beklenen yanıt" },
        },
      },
    );
    const routes = linkedActions(built.record.id, built.records);
    assert.equal(
      routes.find((item) => item.type === "daily").workContext,
      "ad_hoc",
    );
    const external = routes.find((item) => item.type === "waiting");
    if (external) assert.equal(Object.hasOwn(external, "workContext"), false);
  }
  const legacy = record("legacy-source-work", "daily", {
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  const current = [...originals, legacy];
  const reused = prepare(
    current,
    { title: "Kaydedilmemesi gereken taslak" },
    { sourceId: meeting.id },
  );
  assert.equal(reused.records, current);
  assert.equal(reused.record, legacy);
  assert.equal(Object.hasOwn(reused.record, "workContext"), false);
  assert.equal(JSON.stringify(originals), before);
});

test("future and leap-calendar goal presets are canonical without inventing a delivery deadline", () => {
  for (const [type, periodKey] of [
    ["weekly", "2027-W01"],
    ["monthly", "2028-02"],
    ["yearly", "2028"],
  ]) {
    const built = prepare([], { id: type, type, title: type, periodKey });
    assert.equal(built.record.periodKey, periodKey);
    assert.equal(built.record.dueDate, "");
    assert.equal(built.record.sourceDate, "2026-11-07");
  }
  for (const [type, periodKey] of [
    ["weekly", "2025-W53"],
    ["monthly", "2026-13"],
    ["yearly", "0000"],
    ["monthly", "all"],
  ])
    assert.throws(() =>
      prepare([], { type, title: "Geçersiz dönem", periodKey }),
    );
  const oldTZ = process.env.TZ;
  try {
    process.env.TZ = "Europe/Istanbul";
    assert.equal(
      prepare([], { title: "Yerel takvim" }, { now: "2026-11-07T22:30:00Z" })
        .record.sourceDate,
      "2026-11-08",
    );
  } finally {
    if (oldTZ === undefined) delete process.env.TZ;
    else process.env.TZ = oldTZ;
  }
});

test("new annual goals ignore deadline presets while preserving their year, numeric progress and every legacy record", () => {
  const legacy = record("legacy-annual", "yearly", {
    periodKey: "2026",
    dueDate: "2026-11-08",
    targetValue: 20,
    currentValue: 7,
    metric: "Rapor",
    sourceFields: { original: { value: "Eski tarih korunur" } },
  });
  const rows = [legacy];
  const before = JSON.stringify(rows);
  Object.freeze(legacy);
  Object.freeze(rows);
  for (const dueDate of ["2027-12-31", "geçersiz-eski-tarih", null, 20271108]) {
    const built = prepare(
      rows,
      {
        type: "yearly",
        title: "Yeni senelik hedef",
        periodKey: "2027",
        dueDate,
        targetValue: 10,
        currentValue: 3,
        metric: "Rapor",
      },
      { numeric: true },
    );
    assert.equal(built.record.dueDate, "");
    assert.equal(built.record.periodKey, "2027");
    assert.equal(built.record.status, "planned");
    assert.equal(goalProgress(built.record, built.records).percent, 30);
    assert.equal(built.records[0], legacy);
    assert.equal(built.records[0].dueDate, "2026-11-08");
    assert.deepEqual(
      validateStore({ version: 1, records: built.records }).records,
      built.records,
    );
  }
  for (const type of ["daily", "weekly", "monthly"])
    assert.equal(
      prepare(rows, { type, title: "Tarihli adım", dueDate: "2026-11-08" })
        .record.dueDate,
      "2026-11-08",
    );
  assert.equal(JSON.stringify(rows), before);
});

test("numeric mode stays optional, defaults current to zero and never imports hidden measurement or auto-completes", () => {
  for (const type of ["weekly", "monthly", "yearly"]) {
    const empty = prepare(
      [],
      { id: type, type, title: type },
      { numeric: true },
    );
    assert.equal(empty.record.targetValue, null);
    assert.equal(empty.record.currentValue, 0);
    assert.equal(goalProgress(empty.record, empty.records).basis, "status");
    const zero = prepare(
      [],
      { type, title: "Sıfır hedef", targetValue: 0 },
      { numeric: true },
    );
    assert.equal(zero.record.targetValue, 0);
    assert.equal(goalProgress(zero.record, zero.records).basis, "status");
    const measured = prepare(
      [],
      { type, title: "Ölçülen", targetValue: "10", metric: " Rapor " },
      { numeric: true },
    );
    assert.equal(measured.record.currentValue, 0);
    assert.equal(measured.record.metric, "Rapor");
    assert.equal(
      goalProgress(measured.record, measured.records).basis,
      "metric",
    );
    const started = prepare(
      [],
      { type, title: "Başlanmış", targetValue: "2,5", currentValue: "3" },
      { numeric: true },
    );
    assert.equal(started.record.currentValue, 3);
    assert.equal(goalProgress(started.record, started.records).percent, 100);
    assert.equal(started.record.status, "planned");
  }
  for (const field of ["targetValue", "currentValue"])
    for (const value of [-1, Infinity, NaN, "sayı değil", true, {}])
      assert.throws(() =>
        prepare(
          [],
          { type: "monthly", title: "Ölçüm", [field]: value },
          { numeric: true },
        ),
      );
  assert.throws(
    () => prepare([], { type: "daily", title: "Günlük" }, { numeric: true }),
    /yalnızca hedefler/,
  );
});

test("explicit goal links preserve completed-parent compatibility and reject missing or wrong parent types atomically", () => {
  const year = record("year", "yearly");
  const month = record("month", "monthly", { goalParentId: year.id });
  const week = record("week", "weekly", {
    status: "completed",
    goalParentId: month.id,
  });
  const rows = [year, month, week];
  const snapshot = structuredClone(rows);
  const daily = prepare(rows, {
    title: "Tamamlanan hedefin yeni adımı",
    parentId: week.id,
  });
  assert.equal(daily.record.parentId, week.id);
  const weekly = prepare(rows, {
    type: "weekly",
    title: "Haftalık",
    goalParentId: month.id,
  });
  assert.equal(weekly.record.goalParentId, month.id);
  const monthly = prepare(rows, {
    type: "monthly",
    title: "Aylık",
    goalParentId: year.id,
  });
  assert.equal(monthly.record.goalParentId, year.id);
  for (const input of [
    { title: "Eksik", parentId: "missing" },
    { title: "Yanlış", parentId: month.id },
    { type: "weekly", title: "Yanlış", goalParentId: year.id },
    { type: "monthly", title: "Eksik", goalParentId: "missing" },
    { type: "yearly", title: "Yanlış", goalParentId: month.id },
    { title: "Anlık", parentId: week.id, workContext: "ad_hoc" },
  ])
    assert.throws(() => prepare(rows, input));
  assert.deepEqual(rows, snapshot);
});

test("waiting creation may plan a follow-up or preserve a real start date without creating a fictitious contact or work history", () => {
  const built = prepare([], {
    type: "waiting",
    title: "Yanıt bekliyorum",
    expectedFrom: "Ahmet",
    sourceDate: "2026-10-15",
    nextFollowUpDate: "2026-11-10",
    latestUpdate: "Yanıt henüz gelmedi",
  });
  assert.equal(built.record.sourceDate, "2026-10-15");
  assert.equal(built.record.nextFollowUpDate, "2026-11-10");
  assert.equal(built.record.lastFollowUpDate, "");
  assert.equal(Object.hasOwn(built.record, "followUpLog"), false);
  assert.equal(Object.hasOwn(built.record, "workLog"), false);
  for (const input of [
    { lastFollowUpDate: "2026-11-06" },
    { followUpLog: [{ id: "invented" }] },
    { workLog: [{ id: "invented" }] },
  ])
    assert.throws(() =>
      prepare([], { type: "waiting", title: "Bekleyen", ...input }),
    );
  assert.throws(() =>
    prepare([], {
      type: "waiting",
      title: "Bekleyen",
      nextFollowUpDate: "2026-02-30",
    }),
  );
});

test("new input rejects invalid type, status, priority, identity and timestamps without normalizing them into other intentions", () => {
  const existing = record("used");
  const rows = [existing];
  for (const input of [
    { title: " " },
    { title: "İş", type: "other" },
    { title: "İş", status: "unknown" },
    { title: "İş", type: "waiting", status: "in_progress" },
    { title: "İş", priority: "highest" },
    { title: "İş", id: "used" },
    { title: "İş", id: 42 },
    { title: "İş", id: "" },
    { title: "İş", sourceFields: [] },
    {
      title: "İş",
      sourceFields: { __followupSource: { recordId: "used", type: "meeting" } },
    },
  ])
    assert.throws(() => prepare(rows, input));
  for (const now of [
    null,
    "invalid",
    "2026-02-30T10:00:00Z",
    "2026-11-07T24:00:00Z",
    new Date(NaN),
  ])
    assert.throws(
      () => prepare(rows, { title: "İş" }, { now }),
      /zamanı geçersiz/,
    );
  assert.deepEqual(rows, [existing]);
});

test("source creation uses current context, fixes origin metadata and reuses an existing typed target without overwriting user work", () => {
  const source = record("meeting", "meeting", {
    title: "Güncel karar",
    status: "waiting",
    priority: "high",
    owner: "Ahmet",
    description: "Karar bağlamı",
    decision: "Planı revize et",
    participants: "Test ekibi",
  });
  const fresh = prepare(
    [source],
    {
      id: "daily",
      type: "daily",
      title: "Benim adımım",
      sourceFields: {
        custom: "Korunur",
        __followupSource: { recordId: "fake" },
      },
    },
    { sourceId: source.id },
  );
  assert.equal(fresh.record.status, "planned");
  assert.equal(fresh.record.priority, "normal");
  assert.equal(fresh.record.owner, "");
  assert.deepEqual(fresh.record.sourceFields.__followupSource, {
    recordId: source.id,
    type: "meeting",
  });
  assert.match(fresh.record.description, /Planı revize et/);
  assert.equal(fresh.records[0].decision, source.decision);
  const snapshot = fresh.records;
  const reused = prepare(
    snapshot,
    { type: "daily", title: "", status: "invalid", id: 42 },
    { sourceId: source.id, now: "unused", numeric: true },
  );
  assert.equal(reused.records, snapshot);
  assert.equal(reused.record, fresh.record);
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.createdTypes, []);
  assert.deepEqual(reused.reusedTypes, ["daily"]);
  const closed = { ...source, status: "completed" };
  assert.equal(
    prepare(
      [closed, fresh.record],
      { type: "daily", title: "Yazılmamalı" },
      { sourceId: source.id },
    ).reused,
    true,
  );
  assert.throws(
    () =>
      prepare([], { type: "daily", title: "Yeni" }, { sourceId: "deleted" }),
    /artık bulunamıyor/,
  );
  assert.throws(
    () =>
      prepare(
        [{ ...source, type: "weekly" }],
        { type: "daily", title: "Yeni" },
        { sourceId: source.id },
      ),
    /türü değişmiş/,
  );
});

test("an external waiting source may create one contact task and its response state remains independent", () => {
  const source = record("expectation", "waiting", {
    status: "waiting_response",
    expectedFrom: "Ahmet",
    lastFollowUpDate: "2026-11-06",
    followUpLog: [
      {
        id: "follow",
        date: "2026-11-06",
        note: "Gerçek görüşme",
        nextFollowUpDate: "2026-11-10",
      },
    ],
  });
  const built = prepare(
    [source],
    { id: "contact", type: "daily", title: "Takip e-postası gönder" },
    { sourceId: source.id },
  );
  assert.equal(built.records[0], source);
  assert.equal(built.record.lastFollowUpDate, "");
  assert.equal(Object.hasOwn(built.record, "followUpLog"), false);
  assert.deepEqual(built.record.sourceFields.__followupSource, {
    recordId: source.id,
    type: "waiting",
  });
  const done = built.records.map((r) =>
    r.id === built.record.id ? { ...r, status: "completed" } : r,
  );
  assert.equal(syncActionLinks(built.records, done)[0], source);
  assert.equal(
    prepare(
      done,
      { type: "daily", title: "Farklı taslak" },
      { sourceId: source.id },
    ).reused,
    true,
  );
  assert.throws(() =>
    prepare(
      [source],
      { type: "waiting", title: "İkinci dış yanıt" },
      { sourceId: source.id },
    ),
  );
});

test("adding a new open direct route reopens the meeting while preserving its completed daily branch", () => {
  const source = record("meeting", "meeting", {
    status: "completed",
    title: "İlk adımı tamamlanan karar",
    decision: "Ayrı sonuçlar izlenecek",
    participants: "Ben ve Ahmet",
    sourceFields: { retained: { value: "Karar bağlamı" } },
  });
  const completed = record("finished-work", "daily", {
    status: "completed",
    description: "Gerçek tamamlanmış iş",
    workLog: [
      {
        id: "real-session",
        date: "2026-10-01",
        endedAt: STAMP,
        durationMs: 1000,
        note: "Biten çalışma",
        nextAction: "Paylaşıldı",
      },
    ],
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  });
  const original = [source, completed];
  const snapshot = structuredClone(original);
  const built = prepare(
    original,
    {
      id: "new-response",
      type: "waiting",
      title: "Ahmet'ten ayrıca beklenen sonuç",
      expectedFrom: "Ahmet",
    },
    { sourceId: source.id },
  );
  assert.equal(built.records.length, 3);
  assert.equal(built.records[1], completed);
  assert.deepEqual(built.records[1], snapshot[1]);
  assert.equal(built.record.status, "waiting_response");
  assert.deepEqual(built.records[0], { ...source, status: "in_progress" });
  assert.equal(built.records[0].decision, source.decision);
  assert.equal(built.records[0].participants, source.participants);
  assert.equal(built.records[0].updatedAt, source.updatedAt);
  assert.equal(linkedActions(source.id, built.records).length, 2);
  assert.deepEqual(original, snapshot);
});

test("a closed external topic can receive a new contact task without reopening or changing its historical response record", () => {
  const source = record("closed-topic", "waiting", {
    status: "completed",
    sourceDate: "2026-09-01",
    lastFollowUpDate: "2026-10-01",
    expectedFrom: "Ahmet",
    description: "Dış yanıt alındı",
    nextAction: "Kapanış bilgisini paylaş",
    followUpLog: [
      {
        id: "actual-followup",
        date: "2026-10-01",
        note: "Gerçek yanıt alındı",
        nextFollowUpDate: "",
      },
    ],
  });
  const snapshot = structuredClone(source);
  const built = prepare(
    [source],
    { id: "final-contact", type: "daily", title: "Sonucu ekibe ilet" },
    { sourceId: source.id },
  );
  assert.equal(built.records[0], source);
  assert.deepEqual(built.records[0], snapshot);
  assert.equal(built.records[0].status, "completed");
  assert.equal(built.record.status, "planned");
  assert.equal(built.record.lastFollowUpDate, "");
  assert.equal(Object.hasOwn(built.record, "followUpLog"), false);
  assert.deepEqual(built.record.sourceFields.__followupSource, {
    recordId: source.id,
    type: "waiting",
  });
});

const meetingInput = () => ({
  id: "new-meeting",
  type: "meeting",
  title: "Mühendislik kararı",
  decision: "Bağımsız iki adım",
  participants: "Ben ve Ahmet",
  description: "Kaynak notu",
});
const routeDrafts = () => ({
  daily: {
    id: "own-work",
    title: "Ben planı hazırlarım",
    dueDate: "2026-11-10",
    nextAction: "Taslağı yaz",
    owner: "Ben",
  },
  waiting: {
    id: "external",
    title: "Ahmet'in ölçüm sonucu",
    dueDate: "2026-11-12",
    nextAction: "Ölçümü bekle",
    expectedFrom: "Ahmet",
  },
});

test("a new meeting optionally creates either route or both in the same prepared transaction with separate editable values", () => {
  for (const route of ["", "daily", "waiting", "both"]) {
    const built = prepare([], meetingInput(), {
      meetingRoute: route,
      routeDrafts: routeDrafts(),
    });
    const targets = linkedActions(built.record.id, built.records);
    assert.equal(built.records.length, route === "both" ? 3 : route ? 2 : 1);
    assert.equal(targets.length, route === "both" ? 2 : route ? 1 : 0);
    assert.deepEqual(built.createdTypes, [
      "meeting",
      ...(route === "both" ? ["daily", "waiting"] : route ? [route] : []),
    ]);
    assert.equal(built.record.title, meetingInput().title);
    assert.equal(built.record.decision, meetingInput().decision);
    assert.equal(built.record.participants, meetingInput().participants);
    assert.equal(built.record.status, route ? "in_progress" : "planned");
    for (const action of targets) {
      assert.equal(action.title, routeDrafts()[action.type].title);
      assert.equal(action.dueDate, routeDrafts()[action.type].dueDate);
      assert.equal(action.createdAt, NOW);
      assert.equal(action.updatedAt, NOW);
      assert.equal(action.sourceDate, "2026-11-07");
      assert.equal(
        action.status,
        action.type === "daily" ? "planned" : "waiting_response",
      );
      assert.equal(Object.hasOwn(action, "workLog"), false);
      assert.equal(Object.hasOwn(action, "followUpLog"), false);
      assert.deepEqual(action.sourceFields.__followupSource, {
        recordId: built.record.id,
        type: "meeting",
      });
    }
    assert.deepEqual(
      validateStore({ version: 1, records: built.records }).records,
      built.records,
    );
  }
  const invalid = { ...routeDrafts(), waiting: { title: " " } };
  assert.throws(() =>
    prepare([], meetingInput(), { meetingRoute: "both", routeDrafts: invalid }),
  );
  assert.throws(() =>
    prepare([], meetingInput(), {
      meetingRoute: "both",
      routeDrafts: {
        ...routeDrafts(),
        waiting: { title: "Bekleyen", followUpLog: [{ id: "invented" }] },
      },
    }),
  );
  assert.throws(() =>
    prepare([], meetingInput(), {
      meetingRoute: "both",
      routeDrafts: {
        ...routeDrafts(),
        waiting: { title: "Bekleyen", status: "in_progress" },
      },
    }),
  );
  assert.throws(() =>
    prepare([], { title: "Günlük" }, { meetingRoute: "both" }),
  );
});

test("new meeting plus both routes commits as one durable Undo step, failed quota writes nothing and repeated source forms reuse the saved route", () => {
  const original = [
    record("legacy", "monthly", {
      targetValue: 10,
      currentValue: 7,
      metric: "Rapor",
      sourceFields: { retained: [1, 2] },
    }),
  ];
  const key = "creation";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: original })],
  ]);
  let fail = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new Error("quota");
      values.set(key, value);
    },
  };
  let store = createWorkspaceStore({ storage, key });
  const originalRaw = values.get(key);
  const prepared = prepare(store.records, meetingInput(), {
    meetingRoute: "both",
    routeDrafts: routeDrafts(),
  });
  assert.equal(values.get(key), originalRaw);
  fail = true;
  assert.throws(
    () => store.saveRecords(prepared.records, "Yeni toplantı ve iki akış"),
    /quota/,
  );
  assert.equal(values.get(key), originalRaw);
  assert.deepEqual(store.records, original);
  fail = false;
  store.saveRecords(prepared.records, "Yeni toplantı ve iki akış");
  assert.equal(store.history.length, 1);
  assert.equal(store.records.length, 4);
  assert.deepEqual(
    validateStore(
      JSON.parse(JSON.stringify({ version: 1, records: store.records })),
    ).records,
    store.records,
  );
  const staleWindow = createWorkspaceStore({ storage, key });
  const current = staleWindow.records;
  const reused = prepare(
    current,
    { type: "daily", title: "Tekrar açılan taslak" },
    { sourceId: "new-meeting" },
  );
  assert.equal(reused.records, current);
  assert.equal(reused.record.id, "own-work");
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.undo(), "Yeni toplantı ve iki akış");
  assert.deepEqual(store.records, original);
});

test("a stale source form cannot overwrite another window's new typed action and a fresh retry reuses it", () => {
  const source = record("source", "meeting");
  const key = "creation-race";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: [source] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = createWorkspaceStore({ storage, key }),
    second = createWorkspaceStore({ storage, key });
  const draftA = prepare(
    first.records,
    { id: "first", type: "daily", title: "İlk pencerenin işi" },
    { sourceId: source.id },
  );
  const draftB = prepare(
    second.records,
    { id: "second", type: "daily", title: "Eski ikinci taslak" },
    { sourceId: source.id },
  );
  first.saveRecords(draftA.records, "Akış oluştur");
  assert.throws(
    () => second.saveRecords(draftB.records, "Akış oluştur"),
    /başka bir pencerede/,
  );
  const current = second.records;
  const retry = prepare(
    current,
    { id: "second", type: "daily", title: "Eski ikinci taslak" },
    { sourceId: source.id },
  );
  assert.equal(retry.records, current);
  assert.equal(retry.reused, true);
  assert.equal(retry.record.id, "first");
  assert.equal(retry.record.title, "İlk pencerenin işi");
  assert.equal(linkedActions(source.id, retry.records).length, 1);
});
