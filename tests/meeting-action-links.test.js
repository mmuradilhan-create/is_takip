import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { normalizePreferences } from "../src/preferences.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import {
  attachMeetingAction,
  meetingActionCandidates,
  linkedActions,
  resolveActionSource,
} from "../src/action-links.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-10T10:00:00.000Z";
const make = (id, input = {}) =>
  createRecord({ id, title: id, createdAt: STAMP, updatedAt: STAMP, ...input });
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const byId = (records, id) => records.find((record) => record.id === id);
function fixture() {
  return [
    make("meeting", {
      type: "meeting",
      title: "Teknik karar",
      decision: "Özgün karar.",
      description: "Toplantının notları.",
      sourceDate: "2026-11-01",
      owner: "Karar sorumlusu",
      participants: "Toplantı katılımcısı",
      sourceFields: { retained: { decision: [1, "iki"] } },
    }),
    make("weekly", { type: "weekly", periodKey: "2026-W46" }),
    make("daily", {
      title: "Günlük teknik iş",
      parentId: "weekly",
      workContext: "",
      status: "in_progress",
      priority: "high",
      sourceDate: "2026-11-01",
      dueDate: "2026-11-12",
      focusDate: "2026-11-10",
      description: "Özgün günlük iş notu.",
      nextAction: "Özgün sonraki adım.",
      waitingReason: "Özgün bekleme nedeni.",
      owner: "İşi yapan",
      projectCode: "PR-42",
      sourceFields: { retained: { literal: [1, "iki", { mixed: true }] } },
      workLog: [
        {
          id: "old-session",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 65001,
          note: "Özgün çalışma sonucu.",
          nextAction: "Sonraki oturum.",
        },
      ],
    }),
    make("waiting", {
      type: "waiting",
      title: "Beklenen teknik yanıt",
      status: "waiting_response",
      expectedFrom: "Teknik ekip",
      sourceDate: "2026-11-01",
      nextFollowUpDate: "2026-11-12",
      lastFollowUpDate: "2026-11-01",
      latestUpdate: "Özgün gelişme.",
      description: "Bekleyen konunun notları.",
      sourceFields: { retained: { waiting: "bağlantısız kaynak alanı" } },
      followUpLog: [
        {
          id: "follow-log",
          date: "2026-11-01",
          note: "Telefonla soruldu.",
          nextFollowUpDate: "2026-11-12",
        },
      ],
    }),
    make("waiting-step", {
      sourceFields: {
        retained: "Bekleyen konunun günlük adımı.",
        __followupSource: { recordId: "waiting", type: "waiting" },
      },
    }),
    make("other", { title: "Bağımsız günlük iş", workContext: "ad_hoc" }),
  ];
}

test("meeting candidates are pure sorted references and exclude closed, owned and malformed historical markers", () => {
  const rows = fixture();
  for (const [id, value] of [
    ["orphan", { recordId: "gone", type: "meeting" }],
    ["malformed", null],
    ["empty", {}],
    ["undefined", undefined],
  ]) {
    const row = make(id);
    row.sourceFields.__followupSource = value;
    rows.push(row);
  }
  for (const status of ["completed", "cancelled", "transferred"])
    rows.push(make(`closed-${status}`, { status }));
  freeze(rows);
  const before = JSON.stringify(rows);
  assert.deepEqual(
    meetingActionCandidates(rows, "meeting", "daily").map((row) => row.id),
    ["other", "daily"],
  );
  assert.deepEqual(meetingActionCandidates(rows, "meeting", "waiting"), [
    byId(rows, "waiting"),
  ]);
  assert.equal(
    meetingActionCandidates(rows, "meeting", "daily")[1],
    byId(rows, "daily"),
  );
  assert.equal(JSON.stringify(rows), before);
  assert(
    Object.hasOwn(byId(rows, "undefined").sourceFields, "__followupSource"),
  );
});

test("attaching an existing daily preserves all raw work fields, goal links and unrelated objects while projecting the meeting", () => {
  const rows = fixture();
  const original = byId(rows, "daily");
  original.description = "  Ham not\r\nsonunda boşluk  ";
  original.legacyExtra = { values: [1, null, "korunur"] };
  freeze(rows);
  const before = JSON.stringify(rows);
  const result = attachMeetingAction(rows, "meeting", "daily", "daily", {
    now: NOW,
  });
  assert.deepEqual(byId(result, "daily"), {
    ...original,
    sourceFields: {
      ...original.sourceFields,
      __followupSource: { recordId: "meeting", type: "meeting" },
    },
    updatedAt: NOW,
  });
  assert.deepEqual(result[0], { ...rows[0], status: "in_progress" });
  for (const id of ["weekly", "waiting", "waiting-step", "other"])
    assert.equal(byId(result, id), byId(rows, id));
  assert.equal(byId(result, "daily").workLog, original.workLog);
  assert.equal(byId(result, "daily").legacyExtra, original.legacyExtra);
  assert.equal(
    byId(result, "daily").sourceFields.retained,
    original.sourceFields.retained,
  );
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(linkedActions("meeting", result), [byId(result, "daily")]);
  assert.deepEqual(meetingActionCandidates(result, "meeting", "daily"), []);
});

test("attaching existing waiting keeps its own daily steps, follow-up log and raw source context exact", () => {
  const rows = freeze(fixture());
  const result = attachMeetingAction(rows, "meeting", "waiting", "waiting", {
    now: new Date(NOW),
  });
  const original = byId(rows, "waiting");
  assert.deepEqual(byId(result, "waiting"), {
    ...original,
    sourceFields: {
      ...original.sourceFields,
      __followupSource: { recordId: "meeting", type: "meeting" },
    },
    updatedAt: NOW,
  });
  assert.equal(byId(result, "waiting").followUpLog, original.followUpLog);
  assert.equal(byId(result, "waiting-step"), byId(rows, "waiting-step"));
  assert.deepEqual(linkedActions("waiting", result), [
    byId(rows, "waiting-step"),
  ]);
  assert.equal(byId(result, "meeting").status, "in_progress");
  assert.deepEqual(meetingActionCandidates(result, "meeting", "waiting"), []);
  assert.deepEqual(
    validateStore({ version: 1, records: result }).records,
    result,
  );
});

test("each meeting accepts one daily and one waiting route and rejects replacement without changing either", () => {
  const rows = fixture();
  rows.push(make("other-waiting", { type: "waiting", status: "follow_up" }));
  const first = attachMeetingAction(rows, "meeting", "daily", "daily", {
    now: NOW,
  });
  const both = freeze(
    attachMeetingAction(first, "meeting", "waiting", "waiting", {
      now: NOW,
    }),
  );
  const before = JSON.stringify(both);
  assert.deepEqual(
    linkedActions("meeting", both).map((row) => row.id),
    ["daily", "waiting"],
  );
  for (const [id, type] of [
    ["other", "daily"],
    ["other-waiting", "waiting"],
  ]) {
    assert.throws(
      () => attachMeetingAction(both, "meeting", id, type, { now: NOW }),
      /zaten bir kayıt bağlı/,
    );
    assert.deepEqual(meetingActionCandidates(both, "meeting", type), []);
  }
  assert.equal(JSON.stringify(both), before);
});

test("already attached records are exact no-ops after closure and do not need a valid new timestamp", () => {
  for (const [id, type] of [
    ["daily", "daily"],
    ["waiting", "waiting"],
  ]) {
    const linked = attachMeetingAction(fixture(), "meeting", id, type, {
      now: NOW,
    });
    const closed = freeze(
      linked.map((row) =>
        row.id === id || row.id === "meeting"
          ? { ...row, status: "completed" }
          : row,
      ),
    );
    assert.equal(
      attachMeetingAction(closed, "meeting", id, type, { now: "unused" }),
      closed,
    );
    assert.deepEqual(meetingActionCandidates(closed, "meeting", type), []);
  }
});

test("effective meeting status governs eligibility without rewriting stale saved source status", () => {
  const rows = fixture();
  rows[0].status = "cancelled";
  const source = rows[0];
  const activeTarget = {
    ...byId(rows, "daily"),
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  };
  const active = rows.map((row) =>
    row.id === activeTarget.id ? activeTarget : row,
  );
  freeze(active);
  assert.equal(resolveActionSource(source, active).status, "in_progress");
  assert.equal(source.status, "cancelled");
  assert.deepEqual(meetingActionCandidates(active, "meeting", "waiting"), [
    byId(active, "waiting"),
  ]);
  const result = attachMeetingAction(active, "meeting", "waiting", "waiting", {
    now: NOW,
  });
  assert.equal(byId(result, "meeting").status, "in_progress");
  const closed = active.map((row) =>
    row.id === "daily" ? { ...row, status: "completed" } : row,
  );
  assert.equal(resolveActionSource(source, closed).status, "completed");
  assert.deepEqual(meetingActionCandidates(closed, "meeting", "waiting"), []);
  assert.throws(
    () => attachMeetingAction(closed, "meeting", "waiting", "waiting"),
    /Kapalı toplantıya/,
  );
});

test("closed sources and closed targets reject new attachments for every closed lifecycle", () => {
  for (const status of ["completed", "cancelled", "transferred"]) {
    const rows = fixture();
    rows[0].status = status;
    freeze(rows);
    assert.deepEqual(meetingActionCandidates(rows, "meeting", "daily"), []);
    assert.throws(
      () => attachMeetingAction(rows, "meeting", "daily", "daily"),
      /Kapalı toplantıya/,
    );
    const closedTarget = fixture().map((row) =>
      row.id === "daily" ? { ...row, status } : row,
    );
    assert.throws(
      () => attachMeetingAction(closedTarget, "meeting", "daily", "daily"),
      /açık kayıtlar/,
    );
  }
});

test("existing source markers are never overwritten even when orphaned or malformed", () => {
  for (const marker of [
    { recordId: "gone", type: "waiting" },
    null,
    {},
    undefined,
    "legacy",
  ]) {
    const rows = fixture();
    byId(rows, "daily").sourceFields.__followupSource = marker;
    freeze(rows);
    const before = JSON.stringify(rows);
    assert.throws(
      () =>
        attachMeetingAction(rows, "meeting", "daily", "daily", { now: NOW }),
      /zaten bir kaynağa bağlı/,
    );
    assert.equal(JSON.stringify(rows), before);
    assert(Object.hasOwn(byId(rows, "daily").sourceFields, "__followupSource"));
  }
});

test("typed route and fresh schema validation reject missing, retyped and malformed records before changes", () => {
  const rows = freeze(fixture());
  for (const args of [
    ["gone", "daily", "daily"],
    ["weekly", "daily", "daily"],
    ["meeting", "gone", "daily"],
    ["meeting", "waiting", "daily"],
    ["meeting", "daily", "waiting"],
    ["meeting", "daily", "weekly"],
  ])
    assert.throws(() => attachMeetingAction(rows, ...args, { now: NOW }));
  assert.throws(() => meetingActionCandidates(rows, "gone", "daily"));
  assert.throws(() => meetingActionCandidates(rows, "meeting", "weekly"));
  assert.throws(() =>
    attachMeetingAction([...rows, rows[0]], "meeting", "daily", "daily"),
  );
  const invalidGoal = rows.map((row) =>
    row.id === "daily" ? { ...row, parentId: "missing-goal" } : row,
  );
  assert.throws(
    () => meetingActionCandidates(invalidGoal, "meeting", "daily"),
    /haftalık plan bulunamadı/,
  );
  assert.throws(
    () => attachMeetingAction(invalidGoal, "meeting", "daily", "daily"),
    /haftalık plan bulunamadı/,
  );
});

test("ambiguous routes and cyclic or invalid live origins are rejected rather than repaired", () => {
  const linked = attachMeetingAction(fixture(), "meeting", "daily", "daily", {
    now: NOW,
  });
  const ambiguous = linked.map((row) =>
    row.id === "other"
      ? {
          ...row,
          sourceFields: {
            __followupSource: { recordId: "meeting", type: "meeting" },
          },
        }
      : row,
  );
  assert.throws(
    () => meetingActionCandidates(ambiguous, "meeting", "waiting"),
    /birden fazla/,
  );
  assert.throws(
    () => attachMeetingAction(ambiguous, "meeting", "waiting", "waiting"),
    /birden fazla/,
  );
  const cyclic = fixture().map((row) =>
    ["meeting", "waiting"].includes(row.id)
      ? {
          ...row,
          sourceFields: {
            __followupSource: {
              recordId: row.id === "meeting" ? "waiting" : "meeting",
              type: row.id === "meeting" ? "waiting" : "meeting",
            },
          },
        }
      : row,
  );
  assert.throws(
    () => meetingActionCandidates(cyclic, "meeting", "daily"),
    /döngü/,
  );
  const liveInvalidOrigin = fixture();
  liveInvalidOrigin[0].sourceFields.__followupSource = {
    recordId: "waiting",
    type: "waiting",
  };
  assert.throws(
    () =>
      attachMeetingAction(liveInvalidOrigin, "meeting", "waiting", "waiting"),
    /kayıt türü geçersiz/,
  );
});

test("attachment timestamps use the existing strict action calendar validation", () => {
  const rows = freeze(fixture());
  for (const now of [null, "2026-02-30T09:00:00Z", "invalid", new Date(NaN)])
    assert.throws(
      () => attachMeetingAction(rows, "meeting", "daily", "daily", { now }),
      /kayıt zamanı geçersiz/,
    );
  const result = attachMeetingAction(rows, "meeting", "daily", "daily", {
    now: "2026-11-10T13:00:00+03:00",
  });
  assert.equal(byId(result, "daily").updatedAt, NOW);
});

function storageFixture() {
  const key = "meeting-links";
  const sessions = {
    version: 1,
    currentId: null,
    entries: [
      {
        recordId: "daily",
        sessionId: "unfinished",
        status: "paused",
        elapsedMs: 65001,
        startedAt: null,
        ownerId: null,
        updatedAt: Date.parse(STAMP),
        draftNote: "Özgün bitmemiş çalışma notu.",
        trackTime: false,
      },
    ],
  };
  const original = JSON.stringify({
    version: 1,
    records: fixture(),
    odak: {
      version: 1,
      preferences: normalizePreferences({ theme: "dark" }),
      history: [],
      workSessions: sessions,
      retained: { value: "metadata korunur" },
    },
  });
  const values = new Map([[key, original]]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  return { key, values, storage, original, sessions };
}

test("attach is one atomic Undo transaction; quota failure and reload preserve the exact primary context", () => {
  const { key, values, storage, original, sessions } = storageFixture();
  let fail = false;
  let primaryAttempts = 0;
  const realWrite = storage.setItem;
  storage.setItem = (name, value) => {
    if (name === key) {
      primaryAttempts++;
      if (fail) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
    }
    realWrite(name, value);
  };
  const store = createWorkspaceStore({ storage, key });
  const prepared = attachMeetingAction(
    store.records,
    "meeting",
    "daily",
    "daily",
    { now: NOW },
  );
  assert.equal(values.get(key), original);
  assert.equal(primaryAttempts, 0);
  fail = true;
  assert.throws(
    () => store.saveRecords(prepared, "Toplantıya iş bağla"),
    /quota/,
  );
  assert.equal(primaryAttempts, 1);
  assert.equal(values.get(key), original);
  assert.equal(store.canUndo, false);
  fail = false;
  store.saveRecords(prepared, "Toplantıya iş bağla");
  assert.equal(primaryAttempts, 2);
  assert.equal(store.history.length, 1);
  assert.deepEqual(JSON.parse(values.get(key)).odak.workSessions, sessions);
  assert.equal(byId(store.records, "meeting").status, "in_progress");
  const reopened = createWorkspaceStore({ storage, key });
  assert.equal(reopened.undo(), "Toplantıya iş bağla");
  assert.equal(values.get(key), original);
});

test("a concurrent route attachment wins over stale state and each explicit fresh attachment has one exact Undo", () => {
  const { key, values, storage, original, sessions } = storageFixture();
  const first = createWorkspaceStore({ storage, key });
  const peer = createWorkspaceStore({ storage, key });
  const stale = attachMeetingAction(
    first.records,
    "meeting",
    "daily",
    "daily",
    { now: NOW },
  );
  const peerAttachment = attachMeetingAction(
    peer.records,
    "meeting",
    "waiting",
    "waiting",
    { now: NOW },
  );
  peer.saveRecords(peerAttachment, "Toplantıya takip bağla");
  const peerRaw = values.get(key);
  assert.throws(
    () => first.saveRecords(stale, "Toplantıya iş bağla"),
    (error) => error.name === "WorkspaceConflictError",
  );
  assert.equal(values.get(key), peerRaw);
  assert.deepEqual(first.records, peer.records);
  const fresh = attachMeetingAction(
    first.records,
    "meeting",
    "daily",
    "daily",
    { now: NOW },
  );
  first.saveRecords(fresh, "Toplantıya iş bağla");
  assert.equal(first.history.length, 2);
  assert.deepEqual(JSON.parse(values.get(key)).odak.workSessions, sessions);
  const reopened = createWorkspaceStore({ storage, key });
  assert.equal(reopened.undo(), "Toplantıya iş bağla");
  assert.equal(values.get(key), peerRaw);
  assert.equal(reopened.undo(), "Toplantıya takip bağla");
  assert.equal(values.get(key), original);
});
