import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { readWorkSessionSnapshot } from "../src/work-session-store.js";
import {
  renderWidgetSession,
  widgetSessionSummary,
} from "../src/widget-session-presenter.js";

const STAMP = "2026-11-09T09:00:00.000Z";
const record = (input = {}) =>
  createRecord({
    id: "active-task",
    title: "Teklifi incele",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...input,
  });
const context = (patch = {}) => ({
  recordId: "active-task",
  sessionId: "current-session",
  status: "running",
  elapsedMs: 1250,
  startedAt: 1000,
  ownerId: "main-owner",
  updatedAt: 1000,
  ...patch,
});
const encoded = (entry = context(), currentId = entry.recordId) =>
  JSON.stringify({ version: 1, currentId, entries: [entry] });
const journal = (id) => ({
  id,
  date: "2026-11-09",
  endedAt: STAMP,
  durationMs: 5000,
  note: "Kaydedildi.",
  nextAction: "",
});
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("the widget observes running time and the current title without taking session ownership or touching storage", () => {
  const records = freeze([record()]);
  const raw = encoded();
  const before = JSON.stringify(records);
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  let storageAccesses = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      storageAccesses++;
      throw new Error("The presenter must never access storage.");
    },
  });
  try {
    assert.deepEqual(widgetSessionSummary(records, raw, 5000), {
      recordId: "active-task",
      title: "Teklifi incele",
      status: "running",
      phase: "Çalışıyor",
      elapsedMs: 5250,
      time: "00:00:05",
      tracked: true,
    });
    const tick = widgetSessionSummary(records, raw, 70000);
    assert.equal(tick.elapsedMs, 70250);
    assert.equal(tick.time, "00:01:10");
    const snapshot = readWorkSessionSnapshot(raw);
    assert.equal(snapshot.entries[0].ownerId, "main-owner");
    assert.equal(snapshot.entries[0].status, "running");
    assert.equal(snapshot.entries[0].elapsedMs, 1250);
    assert.equal(encoded(), raw);
    assert.equal(JSON.stringify(records), before);
    assert.equal(storageAccesses, 0);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("note-only work retains legacy milliseconds without accumulating new time", () => {
  const records = freeze([record()]);
  const raw = encoded(context({ trackTime: false, draftNote: "İlk inceleme" }));
  const first = widgetSessionSummary(records, raw, 5000);
  const later = widgetSessionSummary(records, raw, 70000);
  assert.equal(first.elapsedMs, 1250);
  assert.equal(later.elapsedMs, 1250);
  assert.equal(first.phase, "Çalışıyor");
  assert.equal(first.title, "Teklifi incele");
  assert.equal(
    readWorkSessionSnapshot(raw).entries[0].draftNote,
    "İlk inceleme",
  );
});

test("paused time stays fixed while a future running start is clamped and safe totals cannot overflow", () => {
  const records = freeze([record()]);
  const duration = (99 * 3600 + 5 * 60 + 6) * 1000 + 999;
  const paused = encoded(
    context({
      status: "paused",
      elapsedMs: duration,
      startedAt: null,
      ownerId: null,
    }),
  );
  for (const at of [0, 5000, Number.MAX_SAFE_INTEGER]) {
    const result = widgetSessionSummary(records, paused, at);
    assert.equal(result.status, "paused");
    assert.equal(result.phase, "Duraklatıldı");
    assert.equal(result.elapsedMs, duration);
    assert.equal(result.time, "99:05:06");
  }
  assert.equal(
    widgetSessionSummary(records, encoded(context({ startedAt: 9000 })), 5000)
      .elapsedMs,
    1250,
  );
  const capped = widgetSessionSummary(
    records,
    encoded(context({ elapsedMs: Number.MAX_SAFE_INTEGER, startedAt: 0 })),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(capped.elapsedMs, Number.MAX_SAFE_INTEGER);
  assert.match(capped.time, /^\d+:\d{2}:\d{2}$/);
});

test("only the selected running or paused context is shown and finished or unselected sessions stay hidden", () => {
  const records = freeze([
    record(),
    record({ id: "other-task", title: "Diğer iş" }),
  ]);
  const previous = context({
    status: "paused",
    startedAt: null,
    ownerId: null,
  });
  const current = context({
    recordId: "other-task",
    sessionId: "other-session",
  });
  const raw = JSON.stringify({
    version: 1,
    currentId: "other-task",
    entries: [previous, current],
  });
  assert.equal(widgetSessionSummary(records, raw, 5000).recordId, "other-task");
  assert.equal(widgetSessionSummary(records, raw, 5000).title, "Diğer iş");
  assert.equal(
    widgetSessionSummary(records, encoded(previous, null), 5000),
    null,
  );
  const finished = context({
    status: "finished",
    startedAt: null,
    ownerId: null,
  });
  assert.equal(
    widgetSessionSummary(records, encoded(finished, null), 5000),
    null,
  );
  assert.equal(widgetSessionSummary(records, encoded(finished), 5000), null);
  assert.equal(widgetSessionSummary(records, null, 5000), null);
});

test("missing, non-daily and closed work cannot appear as a current widget session", () => {
  const raw = encoded();
  for (const records of [
    [],
    [record({ id: "unrelated" })],
    ...["weekly", "monthly", "yearly", "meeting", "waiting"].map((type) => [
      record({ type }),
    ]),
    ...["completed", "cancelled", "transferred"].map((status) => [
      record({ status }),
    ]),
    [{ ...record(), title: "   " }],
    [{ ...record(), title: null }],
  ])
    assert.equal(widgetSessionSummary(freeze(records), raw, 5000), null);
  assert.notEqual(
    widgetSessionSummary(
      freeze([record({ status: "partially_completed" })]),
      raw,
      5000,
    ),
    null,
  );
});

test("a journaled exact session is hidden but a different journal entry or another record's session ID does not hide current work", () => {
  const raw = encoded();
  const matching = freeze([record({ workLog: [journal("current-session")] })]);
  assert.equal(widgetSessionSummary(matching, raw, 5000), null);
  const different = freeze([
    record({ workLog: [journal("previous-session")] }),
  ]);
  assert.equal(widgetSessionSummary(different, raw, 5000).elapsedMs, 5250);
  const elsewhere = freeze([
    record(),
    record({ id: "other-task", workLog: [journal("current-session")] }),
  ]);
  assert.equal(
    widgetSessionSummary(elsewhere, raw, 5000).recordId,
    "active-task",
  );
});

test("legacy IDs come from the existing strict parser and independent snapshots never rewrite the legacy raw context", () => {
  const entry = context();
  delete entry.sessionId;
  const raw = encoded(entry);
  const first = readWorkSessionSnapshot(raw);
  const second = readWorkSessionSnapshot(raw);
  const id = first.entries[0].sessionId;
  assert.match(id, /^legacy-/);
  assert.equal(second.entries[0].sessionId, id);
  assert.notEqual(first, second);
  assert.notEqual(first.entries[0], second.entries[0]);
  first.entries[0].sessionId = "caller-change";
  first.entries[0].ownerId = "widget-owner";
  assert.equal(readWorkSessionSnapshot(raw).entries[0].sessionId, id);
  assert.equal(readWorkSessionSnapshot(raw).entries[0].ownerId, "main-owner");
  const records = freeze([record()]);
  const summary = widgetSessionSummary(records, raw, 5000);
  summary.title = "caller change";
  summary.elapsedMs = 0;
  assert.equal(
    widgetSessionSummary(records, raw, 5000).title,
    "Teklifi incele",
  );
  assert.equal(widgetSessionSummary(records, raw, 5000).elapsedMs, 5250);
  assert.equal(
    widgetSessionSummary(
      freeze([record({ workLog: [journal(id)] })]),
      raw,
      5000,
    ),
    null,
  );
  assert.equal(JSON.parse(raw).entries[0].sessionId, undefined);
});

test("corrupt or contradictory session context and invalid clocks fail closed without affecting the agenda records", () => {
  const records = freeze([record()]);
  const before = JSON.stringify(records);
  for (const raw of [
    undefined,
    {},
    "",
    "{broken",
    "null",
    JSON.stringify({ version: 2, currentId: null, entries: [] }),
    JSON.stringify({ version: 1, currentId: "missing", entries: [] }),
    encoded(context({ elapsedMs: -1 })),
    encoded(context({ ownerId: null })),
    encoded(context({ sessionId: "" })),
    encoded(context({ status: "paused", startedAt: null })),
    JSON.stringify({
      version: 1,
      currentId: "active-task",
      entries: [context(), context()],
    }),
    JSON.stringify({
      version: 1,
      currentId: "active-task",
      entries: [context(), context({ recordId: "other-task" })],
    }),
    " ".repeat(500001),
  ])
    assert.equal(widgetSessionSummary(records, raw, 5000), null);
  for (const at of [
    -1,
    NaN,
    Infinity,
    1.5,
    "5000",
    null,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(widgetSessionSummary(records, encoded(), at), null);
  for (const invalid of [null, undefined, {}])
    assert.equal(widgetSessionSummary(invalid, encoded(), 5000), null);
  assert.equal(JSON.stringify(records), before);
});

test("session rendering uses literal text and clears the whole strip when current work disappears", () => {
  const nodes = new Map(
    [
      "widget-session",
      "widget-session-phase",
      "widget-session-title",
      "widget-session-time",
    ].map((id) => [
      id,
      {
        dataset: {},
        textContent: "",
        removeAttribute(name) {
          delete this[name];
        },
        set innerHTML(_) {
          throw new Error("Session titles must remain plain text.");
        },
      },
    ]),
  );
  const document = { getElementById: (id) => nodes.get(id) };
  const title = '<img src=x onerror="alert(1)"> & teklif';
  const summary = freeze(
    widgetSessionSummary(freeze([record({ title })]), encoded(), 5000),
  );
  renderWidgetSession(document, summary);
  assert.equal(nodes.get("widget-session").hidden, false);
  assert.equal(nodes.get("widget-session").dataset.phase, "running");
  assert.equal(nodes.get("widget-session-phase").textContent, "Çalışıyor");
  assert.equal(nodes.get("widget-session-title").textContent, title);
  assert.equal(nodes.get("widget-session-title").title, title);
  assert.equal(nodes.get("widget-session-time").textContent, "00:00:05");
  renderWidgetSession(document, null);
  assert.equal(nodes.get("widget-session").hidden, true);
  assert.equal(nodes.get("widget-session").dataset.phase, undefined);
  for (const id of [
    "widget-session-phase",
    "widget-session-title",
    "widget-session-time",
  ])
    assert.equal(nodes.get(id).textContent, "");
  assert.equal(nodes.get("widget-session-title").title, undefined);
});
