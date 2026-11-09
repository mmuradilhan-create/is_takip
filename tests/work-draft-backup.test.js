import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkDrafts,
  workDraftsFromBackup,
  exportWorkDrafts,
  mergeWorkDrafts,
} from "../src/work-draft-backup.js";
import { readWorkSessionSnapshot } from "../src/work-session-store.js";

const daily = (id, extra = {}) => ({
  id,
  type: "daily",
  status: "planned",
  ...extra,
});
const draft = (recordId, draftNote = "Korunacak not", extra = {}) => ({
  recordId,
  sessionId: `session-${recordId}`,
  draftNote,
  status: "paused",
  ...extra,
});
const drafts = (...entries) => ({ version: 1, entries });
const context = (recordId, draftNote = "Korunacak not", extra = {}) => ({
  recordId,
  sessionId: `session-${recordId}`,
  status: "paused",
  elapsedMs: 73121,
  startedAt: null,
  ownerId: null,
  updatedAt: 1000,
  ...(draftNote === undefined ? {} : { draftNote }),
  ...extra,
});
const snapshot = (entries = [], currentId = null) => ({
  version: 1,
  currentId,
  entries,
});
function frozen(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

test("draft backup normalization preserves literal bytes in a bounded detached schema", () => {
  const text = '  İlk satır\n<img src=x onerror="bad()"> • sonuç değil  ';
  const input = frozen(drafts(draft("first", text, { status: "running" })));
  const normalized = normalizeWorkDrafts(input);
  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.entries, input.entries);
  assert.notEqual(normalized.entries[0], input.entries[0]);
  normalized.entries[0].draftNote = "Bağımsız kopya";
  assert.equal(input.entries[0].draftNote, text);
  const boundary = drafts(
    ...Array.from({ length: 50 }, (_, index) =>
      draft(`${index}-${"r".repeat(1997)}`, "n".repeat(10000), {
        sessionId: `${index}-${"s".repeat(1997)}`,
      }),
    ),
  );
  assert.equal(normalizeWorkDrafts(boundary).entries.length, 50);
});

test("malformed or duplicate drafts reject the whole value before any eligibility filtering", () => {
  const inherited = Object.create({ recordId: "inherited" });
  Object.assign(inherited, draft("first"));
  delete inherited.recordId;
  for (const invalid of [
    null,
    { version: 2, entries: [] },
    { version: 1, entries: [], ownerId: "foreign" },
    { version: 1, entries: new Array(1) },
    drafts(draft("first", " \n ")),
    drafts(draft("first", "n".repeat(10001))),
    drafts(draft(" ")),
    drafts(draft("r".repeat(2001))),
    drafts(draft("first", "note", { sessionId: "" })),
    drafts(draft("first", "note", { sessionId: "s".repeat(2001) })),
    drafts(draft("first", "note", { status: "finished" })),
    drafts(draft("first", "note", { elapsedMs: 7 })),
    drafts(draft("first"), draft("first", "another")),
    drafts(
      draft("first"),
      draft("second", "note", { sessionId: "session-first" }),
    ),
    drafts(inherited),
    drafts(
      ...Array.from({ length: 51 }, (_, index) => draft(`record-${index}`)),
    ),
  ]) {
    assert.throws(() => normalizeWorkDrafts(invalid));
    assert.throws(() => workDraftsFromBackup({ workDrafts: invalid }, []));
  }
});

test("optional backup drafts ignore missing and non-daily jobs while preserving closed-job notes and journaled recovery", () => {
  const recoveryText = "  Daha yeni çalışma notu\nİkinci satır  ";
  const records = frozen([
    daily("open"),
    daily("closed", { status: "completed" }),
    daily("cancelled", { status: "cancelled" }),
    daily("transferred", { status: "transferred" }),
    daily("goal", { type: "weekly" }),
    daily("recorded", {
      workLog: [{ id: "session-recorded", note: "Sonuç" }],
    }),
    daily("recovery", {
      workLog: [{ id: "session-recovery", note: "Eski kaydedilen sonuç" }],
    }),
  ]);
  assert.deepEqual(workDraftsFromBackup({ version: 1 }, records), {
    present: false,
    drafts: drafts(),
    ignoredCount: 0,
  });
  assert.equal(
    workDraftsFromBackup(
      { odak: { workDrafts: drafts(draft("open")) } },
      records,
    ).present,
    false,
  );
  const input = frozen({
    workDrafts: drafts(
      draft("open"),
      draft("closed"),
      draft("cancelled"),
      draft("transferred"),
      draft("goal"),
      draft("missing"),
      draft("recorded", " \nSonuç  "),
      draft("recovery", recoveryText),
    ),
  });
  assert.deepEqual(workDraftsFromBackup(input, records), {
    present: true,
    drafts: drafts(
      draft("open"),
      draft("closed"),
      draft("cancelled"),
      draft("transferred"),
      draft("recovery", recoveryText),
    ),
    ignoredCount: 3,
  });
});

test("export excludes finished, blank and semantically recorded notes without leaking elapsed or ownership", () => {
  const legacy = context("legacy", "  Eski oturum taslağı  ");
  delete legacy.sessionId;
  const current = frozen(
    snapshot(
      [
        context("running", "Canlı not", {
          status: "running",
          startedAt: 900,
          ownerId: "other-window",
          trackTime: false,
        }),
        legacy,
        context("finished", "Bitmiş", { status: "finished" }),
        context("blank", " \n "),
        context("absent", undefined, { draftNote: undefined }),
        context("closed", "Kapalı iş"),
        context("recorded", " Sonuç "),
        context("recovery", "Yeni taslak"),
      ],
      "running",
    ),
  );
  const records = frozen([
    ...["running", "legacy", "finished", "blank", "absent"].map((id) =>
      daily(id),
    ),
    daily("closed", { status: "completed" }),
    daily("recorded", { workLog: [{ id: "session-recorded", note: "Sonuç" }] }),
    daily("recovery", {
      workLog: [{ id: "session-recovery", note: "Eski sonuç" }],
    }),
  ]);
  const exported = exportWorkDrafts(current, records);
  const canonicalLegacy = readWorkSessionSnapshot(JSON.stringify(current))
    .entries[1];
  assert.deepEqual(
    exported,
    drafts(
      draft("running", "Canlı not", { status: "running" }),
      draft("legacy", "  Eski oturum taslağı  ", {
        sessionId: canonicalLegacy.sessionId,
      }),
      draft("closed", "Kapalı iş"),
      draft("recovery", "Yeni taslak"),
    ),
  );
  assert.deepEqual(exportWorkDrafts(current, records), exported);
  assert.equal(JSON.stringify(exported).includes("other-window"), false);
  assert.equal(JSON.stringify(exported).includes("elapsedMs"), false);
  assert.throws(() =>
    exportWorkDrafts({ ...current, currentId: "missing" }, records),
  );
});

test("merge preserves unmentioned local contexts and equal-text identity while restoring only paused unowned drafts", () => {
  const active = context("active", "Aynı metin", {
    status: "running",
    startedAt: 1000,
    ownerId: "local-owner",
    trackTime: true,
  });
  const current = frozen(
    snapshot(
      [
        active,
        context("untouched", "Yerel taslak"),
        context("blank", "  "),
        context("finished", "Eski bitmiş içerik", { status: "finished" }),
      ],
      "active",
    ),
  );
  const incoming = frozen(
    drafts(
      draft("active", "Aynı metin", { sessionId: "different-equal-id" }),
      draft("blank", "Boş yerelin yerine"),
      draft("finished", "Yeni taslak"),
      draft("new", "  Satır bir\nSatır iki  ", { status: "running" }),
    ),
  );
  const records = frozen(
    ["active", "untouched", "blank", "finished", "new"].map((id) => daily(id)),
  );
  let clockReads = 0;
  const result = mergeWorkDrafts(current, incoming, records, {
    now: () => {
      clockReads++;
      return 7000;
    },
  });
  assert.equal(clockReads, 1);
  assert.equal(result.ignoredCount, 0);
  assert.equal(result.snapshot.currentId, "active");
  assert.deepEqual(
    result.snapshot.entries.slice(0, 2),
    current.entries.slice(0, 2),
  );
  for (const incomingEntry of incoming.entries.slice(1)) {
    assert.deepEqual(
      result.snapshot.entries.find(
        (entry) => entry.recordId === incomingEntry.recordId,
      ),
      {
        recordId: incomingEntry.recordId,
        sessionId: incomingEntry.sessionId,
        status: "paused",
        elapsedMs: 0,
        startedAt: null,
        ownerId: null,
        updatedAt: 7000,
        draftNote: incomingEntry.draftNote,
        trackTime: false,
      },
    );
  }
  result.snapshot.entries[0].draftNote = "Ayrık sonuç";
  assert.equal(current.entries[0].draftNote, "Aynı metin");
  const noChange = mergeWorkDrafts(
    current,
    drafts(draft("active", "Aynı metin")),
    records,
    {
      now: () => {
        throw new Error("No timestamp needed");
      },
    },
  );
  assert.deepEqual(noChange.snapshot, current);
  const blankCurrent = snapshot(
    [
      context("blank", "", {
        status: "running",
        startedAt: 1000,
        ownerId: "owner",
      }),
    ],
    "blank",
  );
  const replaced = mergeWorkDrafts(
    blankCurrent,
    drafts(draft("blank")),
    records,
    { now: () => 8000 },
  ).snapshot;
  assert.equal(replaced.currentId, "blank");
  assert.equal(replaced.entries[0].status, "paused");
});

test("different local drafts or cross-record session identities reject before applying any incoming entry", () => {
  const current = frozen(
    snapshot([
      context("local", "Yerel korunur"),
      context("foreign", "", { status: "finished" }),
    ]),
  );
  const records = frozen(["local", "foreign", "new"].map((id) => daily(id)));
  const before = JSON.stringify(current);
  assert.throws(
    () =>
      mergeWorkDrafts(
        current,
        drafts(draft("new"), draft("local", "Yedek farklı")),
        records,
      ),
    { name: "WorkDraftConflictError" },
  );
  assert.throws(() =>
    mergeWorkDrafts(
      current,
      drafts(draft("new", "note", { sessionId: "session-foreign" })),
      records,
    ),
  );
  assert.throws(() =>
    mergeWorkDrafts(
      current,
      drafts(draft("local", "Yerel korunur", { sessionId: "session-foreign" })),
      records,
    ),
  );
  assert.equal(JSON.stringify(current), before);
});

test("present-draft merge pauses an invalid selected job without discarding any local context", () => {
  for (const invalidRecord of [
    null,
    daily("selected", { type: "weekly" }),
    ...["completed", "cancelled", "transferred"].map((status) =>
      daily("selected", { status }),
    ),
  ]) {
    const selected = context("selected", "  Seçili not\nAynen kalır  ", {
      status: "running",
      startedAt: 700,
      ownerId: "peer-owner",
      trackTime: true,
    });
    const untouched = context("orphan", "İlişkisiz not korunur");
    const current = frozen(snapshot([selected, untouched], "selected"));
    const records = frozen(invalidRecord ? [invalidRecord] : []);
    let clockReads = 0;
    const result = mergeWorkDrafts(current, drafts(), records, {
      now: () => {
        clockReads++;
        return 25000;
      },
    });
    assert.equal(clockReads, 1);
    assert.equal(result.snapshot.currentId, null);
    assert.deepEqual(result.snapshot.entries[0], {
      ...selected,
      status: "paused",
      startedAt: null,
      ownerId: null,
      updatedAt: 25000,
    });
    assert.deepEqual(result.snapshot.entries[1], untouched);
    assert.equal(current.currentId, "selected");
    assert.equal(current.entries[0].status, "running");
  }
});

test("present merge retires already-recorded local contexts before commit while protecting differing recovery text", () => {
  const withoutDraft = context("legacy");
  delete withoutDraft.draftNote;
  const current = frozen(
    snapshot(
      [
        context("recorded", "  Kaydedilmiş sonuç\n", {
          status: "running",
          startedAt: 700,
          ownerId: "old-owner",
          trackTime: true,
        }),
        withoutDraft,
        context("whitespace", " \n ", { trackTime: false }),
        context("recovery", "  Daha yeni not  "),
      ],
      "recorded",
    ),
  );
  const records = frozen(
    current.entries.map((entry) =>
      daily(entry.recordId, {
        workLog: [
          {
            id: entry.sessionId,
            note:
              entry.recordId === "recorded"
                ? "Kaydedilmiş sonuç"
                : "Eski sonuç",
          },
        ],
      }),
    ),
  );
  let clockReads = 0;
  const result = mergeWorkDrafts(current, drafts(), records, {
    now: () => {
      clockReads++;
      return 27000;
    },
  });
  assert.equal(clockReads, 1);
  assert.equal(result.snapshot.currentId, null);
  for (let index = 0; index < 3; index++) {
    const expected = {
      ...current.entries[index],
      status: "finished",
      startedAt: null,
      ownerId: null,
      updatedAt: 27000,
    };
    delete expected.draftNote;
    assert.deepEqual(result.snapshot.entries[index], expected);
  }
  assert.deepEqual(result.snapshot.entries[3], current.entries[3]);
  const incoming = drafts(
    draft("recorded", "Başka bir yarım not", {
      sessionId: "incoming-new-session",
    }),
  );
  const replacement = mergeWorkDrafts(current, incoming, records, {
    now: () => 28000,
  }).snapshot;
  assert.equal(replacement.currentId, null);
  assert.equal(replacement.entries[0].status, "paused");
  assert.equal(replacement.entries[0].sessionId, "incoming-new-session");
  assert.equal(replacement.entries[0].draftNote, "Başka bir yarım not");
  assert.equal(replacement.entries[0].elapsedMs, 0);
});

test("merge never drops local contexts to satisfy capacity and validates the final session storage budget", () => {
  const current = frozen(
    snapshot(
      Array.from({ length: 50 }, (_, index) =>
        context(`local-${index}`, "Yerel"),
      ),
    ),
  );
  const records = [
    ...current.entries.map((entry) => daily(entry.recordId)),
    daily("new"),
  ];
  assert.throws(() => mergeWorkDrafts(current, drafts(draft("new")), records));
  assert.equal(current.entries.length, 50);
  const large = frozen(
    snapshot(
      Array.from({ length: 49 }, (_, index) =>
        context(`large-${index}`, "n".repeat(9900)),
      ),
    ),
  );
  assert.ok(JSON.stringify(large).length < 500000);
  assert.throws(() =>
    mergeWorkDrafts(
      large,
      drafts(draft("new", "n".repeat(10000))),
      [...large.entries.map((entry) => daily(entry.recordId)), daily("new")],
      { now: () => 9000 },
    ),
  );
  assert.throws(() =>
    mergeWorkDrafts(snapshot(), drafts(draft("new")), [daily("new")], {
      now: () => -1,
    }),
  );
});

test("restoring a differing journaled recovery draft keeps its identity and raw text for explicit fork recovery", () => {
  const text = "  Yeni kurtarılacak not\nKaydedilen sonuçtan farklı  ";
  const records = frozen([
    daily("recover", {
      workLog: [{ id: "session-recover", note: "Önceden kaydedilen sonuç" }],
    }),
  ]);
  const incoming = frozen(
    drafts(draft("recover", text, { status: "running" })),
  );
  const restored = mergeWorkDrafts(snapshot(), incoming, records, {
    now: () => 12000,
  });
  assert.equal(restored.ignoredCount, 0);
  assert.equal(restored.snapshot.entries[0].sessionId, "session-recover");
  assert.equal(restored.snapshot.entries[0].draftNote, text);
  assert.equal(restored.snapshot.entries[0].status, "paused");
  assert.deepEqual(
    exportWorkDrafts(restored.snapshot, records),
    drafts(draft("recover", text)),
  );
  const matched = mergeWorkDrafts(
    snapshot(),
    drafts(draft("recover", " Önceden kaydedilen sonuç\n")),
    records,
  );
  assert.equal(matched.ignoredCount, 1);
  assert.deepEqual(matched.snapshot, snapshot());
});
