import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultReminder,
  dueReminders,
  formatReminder,
  localMinute,
  reminderTime,
  snoozedMinute,
  upcomingReminders,
  withNoteReminder,
} from "../src/note-reminders.js";
import { normalizeNotes, validNotes } from "../src/workspace-notes.js";
import { createRecord } from "../src/model.js";
import {
  hiddenPlanningPrompts,
  isPromptDismissed,
  selectPlanningPrompts,
  withPromptDismissal,
} from "../src/planning-prompts.js";

const stamp = "2026-11-11T08:00:00.000Z";
const note = (id, input = {}) => ({
  id,
  text: `Not ${id}`,
  createdAt: stamp,
  updatedAt: stamp,
  ...input,
});

test("notes accept an optional local reminder minute and keep it exactly", () => {
  const notes = [
    note("plain"),
    note("timed", { remindAt: "2026-11-12T14:30" }),
  ];
  assert.equal(validNotes(notes), true);
  assert.deepEqual(normalizeNotes(notes), notes);
  assert.equal(Object.hasOwn(normalizeNotes(notes)[0], "remindAt"), false);
  for (const remindAt of [
    "2026-11-12 14:30",
    "2026-02-30T10:00",
    "2026-11-12T24:00",
    "2026-11-12T14:60",
    "",
    42,
  ])
    assert.equal(validNotes([note("bad", { remindAt })]), false, remindAt);
});

test("due and upcoming reminders split at the current minute in order", () => {
  const now = new Date(2026, 10, 11, 14, 30).getTime();
  const notes = [
    note("later", { remindAt: "2026-11-12T09:00" }),
    note("now", { remindAt: "2026-11-11T14:30" }),
    note("earlier", { remindAt: "2026-11-10T09:00" }),
    note("soon", { remindAt: "2026-11-11T14:31" }),
    note("none"),
  ];
  assert.deepEqual(
    dueReminders(notes, now).map((item) => item.id),
    ["earlier", "now"],
  );
  assert.deepEqual(
    upcomingReminders(notes, now).map((item) => item.id),
    ["soon", "later"],
  );
  assert.equal(
    reminderTime("2026-11-11T14:30"),
    new Date(2026, 10, 11, 14, 30).getTime(),
  );
});

test("reminder labels, snoozes and defaults use the local calendar", () => {
  const now = new Date(2026, 10, 11, 8, 20);
  assert.equal(formatReminder("2026-11-11T14:00", now), "Bugün 14:00");
  assert.equal(formatReminder("2026-11-12T09:00", now), "Yarın 09:00");
  assert.equal(formatReminder("2026-11-10T17:45", now), "Dün 17:45");
  assert.match(formatReminder("2026-12-02T09:30", now), /^2 Ara 09:30$/);
  assert.match(formatReminder("2027-01-05T10:00", now), /2027 10:00$/);
  assert.equal(localMinute(now), "2026-11-11T08:20");
  assert.equal(
    snoozedMinute("hour", new Date(2026, 10, 11, 23, 30)),
    "2026-11-12T00:30",
  );
  assert.equal(snoozedMinute("tomorrow", now), "2026-11-12T09:00");
  assert.throws(() => snoozedMinute("later", now));
  assert.equal(defaultReminder(now), "2026-11-11T09:00");
  assert.equal(
    defaultReminder(new Date(2026, 10, 11, 14, 5)),
    "2026-11-11T15:00",
  );
  assert.equal(
    defaultReminder(new Date(2026, 10, 11, 21, 30)),
    "2026-11-12T09:00",
  );
});

test("changing one note's reminder leaves every other note exact", () => {
  const notes = [
    note("a", { remindAt: "2026-11-11T09:00" }),
    note("b", { remindAt: "2026-11-11T10:00" }),
  ];
  const later = "2026-11-11T12:00:00.000Z";
  const done = withNoteReminder(notes, "a", null, later);
  assert.deepEqual(done[0], {
    id: "a",
    text: "Not a",
    createdAt: stamp,
    updatedAt: later,
  });
  assert.equal(done[1], notes[1]);
  assert.equal(
    withNoteReminder(notes, "b", "2026-11-12T09:00", later)[1].remindAt,
    "2026-11-12T09:00",
  );
  assert.throws(() => withNoteReminder(notes, "missing", null, later));
  assert.throws(() => withNoteReminder(notes, "a", "yarın", later));
});

test("postponed or hidden planning suggestions leave their list and stay reachable", () => {
  const today = "2026-11-07";
  const waiting = (id, input = {}) =>
    createRecord({
      id,
      title: id,
      type: "waiting",
      status: "waiting_response",
      createdAt: stamp,
      updatedAt: stamp,
      ...input,
    });
  const postponed = withPromptDismissal(
    waiting("postponed"),
    "waiting",
    "2026-11-10",
  );
  const hidden = withPromptDismissal(waiting("hidden"), "waiting", "never");
  const returned = withPromptDismissal(
    waiting("returned"),
    "waiting",
    "2026-11-07",
  );
  const otherKind = withPromptDismissal(
    waiting("other-kind"),
    "review",
    "never",
  );
  const records = [postponed, hidden, returned, otherKind, waiting("plain")];
  assert.deepEqual(
    selectPlanningPrompts(records, { today }).waitingDetails.map(
      (item) => item.id,
    ),
    ["returned", "other-kind", "plain"],
  );
  assert.deepEqual(
    hiddenPlanningPrompts(records, "waiting", { today }).map((item) => item.id),
    ["postponed", "hidden"],
  );
  assert.equal(isPromptDismissed(postponed, "waiting", "2026-11-09"), true);
  assert.equal(isPromptDismissed(postponed, "waiting", "2026-11-10"), false);
  const restored = withPromptDismissal(hidden, "waiting", null);
  assert.equal(
    Object.hasOwn(restored.sourceFields, "__planningPrompts"),
    false,
  );
  assert.equal(restored.updatedAt, hidden.updatedAt);
  assert.throws(() => withPromptDismissal(hidden, "unknown", "never"));
  assert.throws(() => withPromptDismissal(hidden, "waiting", "sonra"));
});
