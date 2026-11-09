import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecord,
  validateStore,
  statusForDisplay,
  statusLabel,
} from "../src/model.js";
import { resolveActionSource, syncActionLinks } from "../src/action-links.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

test("linked status projection preserves raw legacy context edits until a lifecycle change and exact reload Undo", () => {
  const stamp = "2026-11-01T09:00:00.000Z";
  const record = (input) =>
    createRecord({ createdAt: stamp, updatedAt: stamp, ...input });
  const source = record({
    id: "alias-source",
    type: "meeting",
    title: "Özgün toplantı kararı",
    status: "partially_completed",
    description: "Özgün bağlam",
    decision: "Gerçek karar korunmalı.",
    dueDate: "2026-11-10",
    owner: "Ben",
    nextAction: "Revizyonu paylaş.",
    sourceFields: { "Özgün kayıt": { value: "Ham kaynak korunmalı" } },
  });
  const target = record({
    id: "alias-target",
    title: "Bağlı günlük iş",
    status: "partially_completed",
    dueDate: "2026-11-10",
    owner: "Ben",
    nextAction: "Revizyonu paylaş.",
    metric: "Özgün ölçü",
    targetValue: 10,
    currentValue: 4,
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
      "Özgün iş": "Korunmalı",
    },
  });
  const records = [source, target];
  const originalRecords = JSON.stringify(records);
  const key = "derived-status-alias";
  const values = new Map([[key, JSON.stringify({ version: 1, records })]]);
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  const originalStore = values.get(key);
  const view = resolveActionSource(source, records);
  assert.deepEqual(view, { ...source, status: "in_progress" });
  assert.equal(view.status, "in_progress");
  assert.equal(statusForDisplay(view.status, view.type), "in_progress");
  assert.equal(statusLabel(view.type, view.status), "Açık");
  assert.equal(JSON.stringify(records), originalRecords);
  assert.equal(values.get(key), originalStore);

  const workspace = createWorkspaceStore({ storage, key });
  assert.equal(values.get(key), originalStore);
  const editedSource = {
    ...source,
    description: "Düzeltilen bağlam",
    updatedAt: "2026-11-07T12:00:00.000Z",
  };
  const transaction = syncActionLinks(records, [editedSource, target]);
  assert.equal(transaction[0], editedSource);
  assert.equal(transaction[0].status, source.status);
  assert.equal(transaction[1], target);
  assert.equal(transaction[1].status, "partially_completed");
  assert.deepEqual(
    {
      ...transaction[0],
      description: source.description,
      updatedAt: source.updatedAt,
    },
    source,
  );
  workspace.saveRecords(transaction, "Toplantı bağlamı");

  let reopened = createWorkspaceStore({ storage, key });
  assert.equal(reopened.records[0].status, "partially_completed");
  assert.equal(reopened.records[1].status, "partially_completed");
  assert.deepEqual(
    validateStore(JSON.parse(values.get(key))).records,
    transaction,
  );
  const completedTarget = { ...reopened.records[1], status: "completed" };
  const completed = syncActionLinks(reopened.records, [
    reopened.records[0],
    completedTarget,
  ]);
  assert.deepEqual(completed[0], { ...editedSource, status: "completed" });
  assert.equal(completed[0].updatedAt, editedSource.updatedAt);
  assert.equal(completed[1], completedTarget);
  reopened.saveRecords(completed, "Bağlı işi tamamla");
  assert.equal(reopened.history.length, 2);
  assert.deepEqual(
    validateStore(JSON.parse(values.get(key))).records,
    completed,
  );

  reopened = createWorkspaceStore({ storage, key });
  assert.deepEqual(reopened.records, completed);
  assert.equal(reopened.undo(), "Bağlı işi tamamla");
  assert.deepEqual(reopened.records, transaction);
  assert.deepEqual(resolveActionSource(reopened.records[0], reopened.records), {
    ...editedSource,
    status: "in_progress",
  });
  assert.equal(reopened.undo(), "Toplantı bağlamı");
  assert.equal(JSON.stringify(reopened.records), originalRecords);
  assert.equal(reopened.canUndo, false);
});
