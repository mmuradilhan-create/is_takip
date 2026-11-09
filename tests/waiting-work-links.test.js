import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import {
  attachWaitingWork,
  unlinkWaitingWork,
  linkedAction,
  linkedActions,
  resolveActionSource,
  sourceForTarget,
  syncActionLinks,
} from "../src/action-links.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-09T10:00:00.000Z";
const make = (id, input = {}) =>
  createRecord({ id, title: id, createdAt: STAMP, updatedAt: STAMP, ...input });
const waiting = (input = {}) =>
  make("waiting", {
    type: "waiting",
    status: "waiting_response",
    expectedFrom: "Ahmet",
    nextFollowUpDate: "2026-11-12",
    lastFollowUpDate: "2026-11-01",
    latestUpdate: "Yanıt bekleniyor.",
    followUpLog: [
      {
        id: "follow",
        date: "2026-11-01",
        note: "Telefonla soruldu.",
        nextFollowUpDate: "2026-11-12",
      },
    ],
    ...input,
  });
function fixture() {
  return [
    make("weekly", { type: "weekly", periodKey: "2026-W46" }),
    waiting(),
    make("work", {
      parentId: "weekly",
      workContext: "",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-11-10",
      sourceDate: "2026-11-01",
      description: "Özgün not korunur.",
      nextAction: "Eski sonraki adım",
      owner: "Ben",
      waitingReason: "Özgün bekleme",
      focusDate: "2026-11-09",
      sourceFields: { retained: { values: [1, "iki", { nested: true }] } },
      workLog: [
        {
          id: "worked-session",
          date: "2026-11-01",
          endedAt: STAMP,
          durationMs: 35789,
          note: "Gerçek çalışma",
          nextAction: "Oturum adımı",
        },
      ],
    }),
    make("second", { workContext: "ad_hoc", dueDate: "2026-11-11" }),
    make("unrelated", { description: "Başka kayıt" }),
  ];
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("attaching several daily steps is immutable and preserves every goal, work, lifecycle and waiting field", () => {
  const rows = freeze(fixture());
  const before = JSON.stringify(rows);
  const first = attachWaitingWork(rows, "waiting", "work", { now: NOW });
  const second = attachWaitingWork(first, "waiting", "second", {
    now: new Date(NOW),
  });
  assert.deepEqual(second[2], {
    ...rows[2],
    sourceFields: {
      ...rows[2].sourceFields,
      __followupSource: { recordId: "waiting", type: "waiting" },
    },
    updatedAt: NOW,
  });
  assert.equal(second[2], first[2]);
  assert.equal(second[2].sourceFields.retained, rows[2].sourceFields.retained);
  assert.equal(second[2].workLog, rows[2].workLog);
  for (const index of [0, 1, 4]) assert.equal(second[index], rows[index]);
  assert.equal(second[3].parentId, null);
  assert.equal(second[3].workContext, "ad_hoc");
  assert.deepEqual(linkedActions("waiting", second), [second[2], second[3]]);
  assert.equal(linkedAction("waiting", second, "daily"), second[2]);
  assert.equal(linkedAction("waiting", second), null);
  assert.equal(sourceForTarget(second[3], second), rows[1]);
  assert.equal(resolveActionSource(rows[1], second), rows[1]);
  assert.equal(syncActionLinks(rows, second), second);
  assert.deepEqual(
    validateStore({ version: 1, records: second }).records,
    second,
  );
  assert.equal(JSON.stringify(rows), before);
});

test("an already attached step is an exact no-op even for a subsequently closed source and does not need a new timestamp", () => {
  const linked = attachWaitingWork(fixture(), "waiting", "work", { now: NOW });
  assert.equal(
    attachWaitingWork(linked, "waiting", "work", { now: "unused" }),
    linked,
  );
  for (const status of ["completed", "cancelled", "transferred"]) {
    const closed = freeze(
      linked.map((row) => (row.id === "waiting" ? { ...row, status } : row)),
    );
    assert.equal(
      attachWaitingWork(closed, "waiting", "work", { now: null }),
      closed,
    );
    assert.throws(
      () => attachWaitingWork(closed, "waiting", "second", { now: NOW }),
      /Kapalı/,
    );
  }
});

test("unlinking removes only that source marker, including the final closed step, and never removes records or ordinary goal links", () => {
  const rows = freeze(fixture());
  const attached = attachWaitingWork(rows, "waiting", "work", { now: NOW });
  const closedSource = freeze(
    attached.map((row) =>
      row.id === "waiting" ? { ...row, status: "completed" } : row,
    ),
  );
  const before = JSON.stringify(closedSource);
  const unlinked = unlinkWaitingWork(closedSource, "waiting", "work", {
    now: "2026-11-10T13:00:00+03:00",
  });
  assert.equal(unlinked.length, rows.length);
  assert.deepEqual(unlinked[2], {
    ...rows[2],
    updatedAt: "2026-11-10T10:00:00.000Z",
  });
  assert.equal(unlinked[2].workLog, rows[2].workLog);
  assert.equal(
    unlinked[2].sourceFields.retained,
    rows[2].sourceFields.retained,
  );
  assert.equal(unlinked[1], closedSource[1]);
  assert.equal(unlinked[1].status, "completed");
  assert.deepEqual(linkedActions("waiting", unlinked), []);
  assert.equal(
    unlinkWaitingWork(unlinked, "waiting", "work", { now: "unused" }),
    unlinked,
  );
  assert.equal(JSON.stringify(closedSource), before);
});

test("unlinking one of several steps leaves siblings and the source untouched and refuses to erase a different source marker", () => {
  let rows = attachWaitingWork(fixture(), "waiting", "work", { now: NOW });
  rows = freeze(attachWaitingWork(rows, "waiting", "second", { now: NOW }));
  const unlinked = unlinkWaitingWork(rows, "waiting", "work", { now: NOW });
  assert.deepEqual(linkedActions("waiting", unlinked), [rows[3]]);
  assert.equal(unlinked[1], rows[1]);
  assert.equal(unlinked[3], rows[3]);
  const foreign = freeze(
    fixture().map((row) =>
      row.id === "work"
        ? {
            ...row,
            sourceFields: {
              ...row.sourceFields,
              __followupSource: { recordId: "other", type: "meeting" },
            },
          }
        : row,
    ),
  );
  assert.equal(
    unlinkWaitingWork(foreign, "waiting", "work", { now: null }),
    foreign,
  );
});

test("new attachments reject missing or invalid types, all foreign or malformed source markers, duplicate IDs and cycles", () => {
  const rows = freeze(fixture());
  const before = JSON.stringify(rows);
  for (const [source, target] of [
    ["missing", "work"],
    ["weekly", "work"],
    ["waiting", "missing"],
    ["waiting", "weekly"],
    ["waiting", "waiting"],
  ]) {
    assert.throws(
      () => attachWaitingWork(rows, source, target, { now: NOW }),
      /bulunamadı/,
    );
    assert.throws(
      () => unlinkWaitingWork(rows, source, target, { now: NOW }),
      /bulunamadı/,
    );
  }
  for (const marker of [
    null,
    undefined,
    false,
    "origin",
    {},
    { recordId: "" },
    { recordId: "removed", type: "waiting" },
    { recordId: "unrelated", type: "meeting" },
  ]) {
    const marked = freeze(
      rows.map((row) =>
        row.id === "work"
          ? {
              ...row,
              sourceFields: { ...row.sourceFields, __followupSource: marker },
            }
          : row,
      ),
    );
    assert.throws(
      () => attachWaitingWork(marked, "waiting", "work", { now: NOW }),
      /zaten bir kaynağa/,
    );
  }
  const duplicates = [...rows, rows[2]];
  assert.throws(
    () => attachWaitingWork(duplicates, "waiting", "work", { now: NOW }),
    /Tekrarlanan/,
  );
  assert.throws(
    () => unlinkWaitingWork(duplicates, "waiting", "work", { now: NOW }),
    /Tekrarlanan/,
  );
  const cycle = freeze(
    rows.map((row) =>
      row.id === "waiting"
        ? {
            ...row,
            sourceFields: {
              __followupSource: { recordId: "work", type: "meeting" },
            },
          }
        : row,
    ),
  );
  assert.throws(
    () => attachWaitingWork(cycle, "waiting", "work", { now: NOW }),
    /döngü/,
  );
  const invalidBranch = [
    ...rows,
    make("invalid-child", {
      type: "waiting",
      sourceFields: {
        __followupSource: { recordId: "waiting", type: "waiting" },
      },
    }),
  ];
  assert.throws(
    () => attachWaitingWork(invalidBranch, "waiting", "work", { now: NOW }),
    /yalnızca günlük/,
  );
  assert.equal(JSON.stringify(rows), before);
});

test("the model preserves a closed daily's state and rejects invalid timestamps for real changes", () => {
  for (const status of ["completed", "cancelled", "transferred"]) {
    const rows = freeze(
      fixture().map((row) => (row.id === "work" ? { ...row, status } : row)),
    );
    const attached = attachWaitingWork(rows, "waiting", "work", { now: NOW });
    assert.equal(attached[2].status, status);
    assert.equal(attached[1], rows[1]);
    assert.equal(resolveActionSource(attached[1], attached), rows[1]);
  }
  for (const now of [null, "invalid", "2026-02-30T10:00:00Z", new Date(NaN)]) {
    const rows = freeze(fixture());
    assert.throws(
      () => attachWaitingWork(rows, "waiting", "work", { now }),
      /zamanı geçersiz/,
    );
    const attached = attachWaitingWork(rows, "waiting", "work", { now: NOW });
    assert.throws(
      () => unlinkWaitingWork(attached, "waiting", "work", { now }),
      /zamanı geçersiz/,
    );
  }
});

test("completing several contact tasks cannot close their waiting source or its meeting ancestor", () => {
  const source = make("meeting", { type: "meeting", status: "in_progress" });
  const expectation = waiting({
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
    },
  });
  let rows = [source, expectation, make("first"), make("second")];
  rows = attachWaitingWork(rows, expectation.id, "first", { now: NOW });
  rows = attachWaitingWork(rows, expectation.id, "second", { now: NOW });
  const after = rows.map((row) =>
    row.type === "daily" ? { ...row, status: "completed" } : row,
  );
  assert.equal(syncActionLinks(rows, after), after);
  assert.equal(after[0], source);
  assert.equal(after[1], expectation);
  assert.equal(resolveActionSource(source, after), source);
  assert.equal(expectation.status, "waiting_response");
  const received = after.map((row) =>
    row.id === expectation.id ? { ...row, status: "completed" } : row,
  );
  assert.equal(syncActionLinks(after, received)[0].status, "completed");
});

test("attach and unlink prepare one atomic undoable transaction without touching storage, with quota failure and exact reload Undo", () => {
  const original = fixture();
  const key = "waiting-workspace";
  const values = new Map([
    [key, JSON.stringify({ version: 1, records: original })],
  ]);
  const originalRaw = values.get(key);
  let writes = 0;
  let fail = false;
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      if (fail) throw new Error("quota");
      writes++;
      values.set(name, value);
    },
  };
  let store = createWorkspaceStore({ storage, key });
  const attached = attachWaitingWork(store.records, "waiting", "work", {
    now: NOW,
  });
  assert.equal(values.get(key), originalRaw);
  assert.equal(writes, 0);
  fail = true;
  assert.throws(() => store.saveRecords(attached, "İşi bağla"), /quota/);
  assert.equal(values.get(key), originalRaw);
  assert.equal(store.canUndo, false);
  fail = false;
  store.saveRecords(attached, "İşi bağla");
  assert.equal(store.history.length, 1);
  assert.deepEqual(
    validateStore(
      JSON.parse(JSON.stringify({ version: 1, records: store.records })),
    ).records,
    attached,
  );
  const unlinked = unlinkWaitingWork(store.records, "waiting", "work", {
    now: "2026-11-10T10:00:00.000Z",
  });
  store.saveRecords(unlinked, "İş bağlantısını kaldır");
  store = createWorkspaceStore({ storage, key });
  assert.equal(store.undo(), "İş bağlantısını kaldır");
  assert.deepEqual(store.records, attached);
  assert.equal(store.undo(), "İşi bağla");
  assert.deepEqual(store.records, original);
});
