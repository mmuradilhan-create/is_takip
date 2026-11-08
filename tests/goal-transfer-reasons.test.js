import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, validateStore } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import { weeklyPeriodFromKey, moveWeeklyGoal } from "../src/weekly-flow.js";
import { monthlyPeriodFromKey, moveMonthlyGoal } from "../src/monthly-flow.js";

const stamp = "2026-10-20T09:00:00.000Z";
const movedAt = "2026-11-07T12:00:00.000Z";

for (const [type, sourceKey, targetKey, parse, move, historyKey] of [
  [
    "weekly",
    "2026-W44",
    "2026-W45",
    weeklyPeriodFromKey,
    moveWeeklyGoal,
    "__weeklyMoves",
  ],
  [
    "monthly",
    "2026-10",
    "2026-11",
    monthlyPeriodFromKey,
    moveMonthlyGoal,
    "__monthlyMoves",
  ],
]) {
  const fixture = () => [
    createRecord({
      id: "goal",
      type,
      title: "Gerçek hedef",
      periodKey: sourceKey,
      status: "in_progress",
      dueDate: "2026-10-30",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
      nextAction: "Korunacak eski adım",
      variance: "Korunacak eski sapma",
      description: "Özgün not",
      createdAt: stamp,
      updatedAt: stamp,
      sourceFields: {
        original: { value: "Kaynak" },
        [historyKey]: [{ legacy: "Aynen korunur", reason: "Önceki gerekçe" }],
      },
    }),
    createRecord({
      id: "child",
      type: type === "weekly" ? "daily" : "weekly",
      title: "Bağlı kayıt",
      parentId: type === "weekly" ? "goal" : "",
      goalParentId: type === "monthly" ? "goal" : "",
      periodKey: type === "monthly" ? "2026-W44" : "",
      createdAt: stamp,
      updatedAt: stamp,
    }),
  ];

  test(`${type} moves retain only a nonblank reason and preserve every other saved fact`, () => {
    const original = fixture();
    const before = structuredClone(original);
    const next = move(
      original,
      "goal",
      parse(targetKey),
      movedAt,
      "  Yanıt gecikti.\nYeni dönemde devam.  ",
    );
    const entry = next[0].sourceFields[historyKey].at(-1);
    assert.deepEqual(entry, {
      from: sourceKey,
      to: targetKey,
      movedAt,
      previousPeriodKey: sourceKey,
      reason: "Yanıt gecikti.\nYeni dönemde devam.",
    });
    assert.deepEqual(
      next[0].sourceFields[historyKey][0],
      before[0].sourceFields[historyKey][0],
    );
    assert.equal(next[1], original[1]);
    assert.deepEqual(
      {
        ...next[0],
        periodKey: original[0].periodKey,
        updatedAt: original[0].updatedAt,
        sourceFields: original[0].sourceFields,
      },
      original[0],
    );
    assert.deepEqual(original, before);
    assert.deepEqual(
      validateStore(JSON.parse(JSON.stringify({ version: 1, records: next })))
        .records,
      next,
    );
  });

  test(`${type} blank reasons retain the old entry shape and same-period requests never append history`, () => {
    const original = fixture();
    const before = structuredClone(original);
    for (const reason of [undefined, "", " \n\t "]) {
      const next = move(original, "goal", parse(targetKey), movedAt, reason);
      assert.deepEqual(next[0].sourceFields[historyKey].at(-1), {
        from: sourceKey,
        to: targetKey,
        movedAt,
        previousPeriodKey: sourceKey,
      });
      assert.equal(
        move(next, "goal", parse(targetKey), "unused", "Yeni gerekçe"),
        next,
      );
    }
    for (const reason of [null, 7, {}, "x".repeat(1001)])
      assert.throws(
        () => move(original, "goal", parse(targetKey), movedAt, reason),
        /gerekçesi/,
      );
    assert.deepEqual(original, before);
  });

  test(`${type} reason and period persist together in one transaction and reload Undo restores the original goal`, () => {
    const original = fixture();
    const key = `goal-transfer-${type}`;
    const values = new Map([
      [key, JSON.stringify({ version: 1, records: original })],
    ]);
    const storage = {
      getItem: (name) => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value),
      removeItem: (name) => values.delete(name),
    };
    let store = createWorkspaceStore({ storage, key });
    store.saveRecords(
      move(
        store.records,
        "goal",
        parse(targetKey),
        movedAt,
        "Kaydedilmiş gerekçe",
      ),
      "Hedefi taşıma",
    );
    assert.equal(store.history.length, 1);
    store = createWorkspaceStore({ storage, key });
    assert.equal(
      store.records[0].sourceFields[historyKey].at(-1).reason,
      "Kaydedilmiş gerekçe",
    );
    assert.equal(store.records[0].periodKey, targetKey);
    assert.equal(store.undo(), "Hedefi taşıma");
    assert.deepEqual(store.records, original);
    assert.equal(store.history.length, 0);
  });
}
