import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { resolveActionSource, syncActionLinks } from "../src/action-links.js";
import { createWorkspaceStore } from "../src/workspace-store.js";

test("a derived meeting may canonicalize on context save while its raw legacy target and reloaded undo remain lossless", () => {
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
  assert.equal(view.status, "in_progress");
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
  assert.equal(transaction[0].status, "in_progress");
  assert.equal(transaction[1], target);
  assert.equal(transaction[1].status, "partially_completed");
  assert.deepEqual(
    {
      ...transaction[0],
      status: source.status,
      description: source.description,
      updatedAt: source.updatedAt,
    },
    source,
  );
  workspace.saveRecords(transaction, "Toplantı bağlamı");

  const reopened = createWorkspaceStore({ storage, key });
  assert.equal(reopened.records[0].status, "in_progress");
  assert.equal(reopened.records[1].status, "partially_completed");
  assert.deepEqual(
    validateStore(JSON.parse(values.get(key))).records,
    transaction,
  );
  assert.equal(reopened.undo(), "Toplantı bağlamı");
  assert.equal(JSON.stringify(reopened.records), originalRecords);
  assert.equal(reopened.canUndo, false);
});
