import test from "node:test";
import assert from "node:assert/strict";
import {
  CHOICE_LIMITS,
  availableChoices,
  addChoice,
  renameChoice,
  removeChoice,
  restoreChoice,
  normalizeChoiceLists,
  validChoiceLists,
} from "../src/choice-catalogs.js";
import { learnedChoices, DEFAULT_WORK_TYPES } from "../src/record-details.js";
import { normalizePreferences, validPreferences } from "../src/preferences.js";

const records = () => [
  {
    id: "one",
    projectCode: "PRJ-10",
    workType: "TASARIM",
    status: "completed",
  },
  { id: "two", projectCode: "prj-10", workType: "Özel kontrol" },
  { id: "three", projectCode: "ＰＲＪ-2", workType: "ÖZEL KONTROL" },
  { id: "four", projectCode: "İŞ-3", workType: "İzleme" },
];
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test("absent catalog overrides preserve learned choices and all built-in work types without changing records", () => {
  const source = freeze(records());
  const before = JSON.stringify(source);
  for (const kind of ["projectCode", "workType"])
    assert.deepEqual(
      availableChoices(kind, source),
      learnedChoices(source, kind),
    );
  assert.deepEqual(availableChoices("projectCode", []), []);
  assert.deepEqual(
    new Set(availableChoices("workType", [])),
    new Set(DEFAULT_WORK_TYPES),
  );
  assert.equal(JSON.stringify(source), before);
});

test("adding uses normalized Turkish identity, rejects visible duplicates, and keeps captions independent of saved tasks", () => {
  const source = freeze(records());
  const before = JSON.stringify(source);
  const lists = addChoice("projectCode", "  ＰＲＪ-1  ", source);
  assert.equal(validChoiceLists(lists), true);
  assert.deepEqual(lists.projectCode.added, ["PRJ-1"]);
  assert.deepEqual(
    availableChoices("projectCode", source, lists),
    ["PRJ-1", "ＰＲＪ-2", "İŞ-3", "PRJ-10"].sort((a, b) =>
      a.localeCompare(b, "tr", { sensitivity: "base", numeric: true }),
    ),
  );
  assert.throws(
    () => addChoice("projectCode", "PRJ-2", source, lists),
    /zaten var/,
  );
  assert.throws(
    () => addChoice("projectCode", "iş-3", source, lists),
    /zaten var/,
  );
  assert.throws(
    () => addChoice("workType", "tasarım", source, lists),
    /zaten var/,
  );
  const distinct = addChoice("projectCode", "IS-3", source, lists);
  assert.ok(availableChoices("projectCode", source, distinct).includes("IS-3"));
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(lists.workType, { added: [], hidden: [] });
});

test("renaming a learned value hides its old identity without touching any old record and case-only renames override its spelling", () => {
  const source = freeze(records());
  const before = JSON.stringify(source);
  const renamed = renameChoice("projectCode", "prj-10", "YENİ-42", source);
  assert.deepEqual(renamed.projectCode.hidden, ["PRJ-10"]);
  assert.deepEqual(renamed.projectCode.added, ["YENİ-42"]);
  assert.ok(
    !availableChoices(
      "projectCode",
      [...source, { projectCode: "Prj-10" }],
      renamed,
    ).some((value) => /prj-10/i.test(value)),
  );
  assert.ok(
    availableChoices("projectCode", source, renamed).includes("YENİ-42"),
  );
  const spelling = renameChoice("projectCode", "PRJ-10", "Prj-10", source);
  assert.deepEqual(spelling.projectCode.hidden, []);
  assert.deepEqual(spelling.projectCode.added, ["Prj-10"]);
  assert.ok(
    availableChoices("projectCode", source, spelling).includes("Prj-10"),
  );
  assert.ok(
    !availableChoices("projectCode", source, spelling).includes("PRJ-10"),
  );
  const builtIn = renameChoice("workType", "Tasarım", "TASARIM", source);
  assert.deepEqual(builtIn.workType.hidden, []);
  assert.ok(availableChoices("workType", source, builtIn).includes("TASARIM"));
  assert.equal(JSON.stringify(source), before);
});

test("removed defaults, learned values and manual values stay hidden until explicitly added again", () => {
  const source = freeze(records());
  let lists = addChoice("workType", "Özel rapor", source);
  lists = removeChoice("workType", "Özel rapor", source, lists);
  lists = removeChoice("workType", "Tasarım", source, lists);
  lists = removeChoice("projectCode", "PRJ-10", source, lists);
  const expanded = [...source, { workType: "TASARIM", projectCode: "prj-10" }];
  assert.ok(!availableChoices("workType", expanded, lists).includes("Tasarım"));
  assert.ok(
    !availableChoices("workType", expanded, lists).includes("Özel rapor"),
  );
  assert.ok(
    !availableChoices("projectCode", expanded, lists).includes("PRJ-10"),
  );
  assert.throws(
    () => removeChoice("projectCode", "PRJ-10", source, lists),
    /artık listede yok/,
  );
  const restored = addChoice("projectCode", "prj-10", source, freeze(lists));
  assert.deepEqual(restored.projectCode.hidden, []);
  assert.ok(
    availableChoices("projectCode", source, restored).includes("prj-10"),
  );
  assert.deepEqual(lists.projectCode.hidden, ["PRJ-10"]);
  const restoredManual = restoreChoice("workType", "Özel rapor", source, lists);
  assert.ok(
    availableChoices("workType", source, restoredManual).includes("Özel rapor"),
  );
  assert.throws(
    () => restoreChoice("projectCode", "Olmayan", source, lists),
    /gizlenenler/,
  );
});

test("rename duplicate and invalid manual input fail without changing either catalog or source records", () => {
  const source = freeze(records());
  const lists = freeze(addChoice("projectCode", "Yeni", source));
  const before = JSON.stringify({ source, lists });
  assert.throws(
    () => renameChoice("projectCode", "Yeni", "PRJ-10", source, lists),
    /zaten var/,
  );
  assert.throws(
    () => renameChoice("projectCode", "Olmayan", "Yeni ad", source, lists),
    /artık listede yok/,
  );
  for (const kind of Object.keys(CHOICE_LIMITS)) {
    for (const value of ["", "   ", null, 10, {}, "a".repeat(121)])
      assert.throws(
        () => addChoice(kind, value, source, lists),
        /boş|120 karakter/,
      );
    assert.equal(
      addChoice(kind, "a".repeat(120), source, lists)[kind].added.at(-1).length,
      120,
    );
  }
  assert.throws(() => availableChoices("category", source, lists), /Geçerli/);
  assert.throws(
    () => availableChoices("projectCode", null, lists),
    /seçim listesi/,
  );
  assert.equal(JSON.stringify({ source, lists }), before);
});

test("catalog validation rejects malformed, ambiguous and noncanonical nested structures", () => {
  const empty = normalizeChoiceLists();
  assert.equal(validChoiceLists(empty), true);
  const invalid = [null, [], {}, { projectCode: { added: [], hidden: [] } }];
  for (const added of [
    [""],
    [" a "],
    ["ＰＲＪ"],
    ["İŞ", "iş"],
    ["PRJ", "ＰＲＪ"],
    [null],
    Array(1),
    ["a".repeat(121)],
  ])
    invalid.push({ ...empty, projectCode: { added, hidden: [] } });
  invalid.push(
    { ...empty, unknown: { added: [], hidden: [] } },
    { ...empty, projectCode: { added: [], hidden: [], extra: true } },
    { ...empty, projectCode: { added: ["A"], hidden: ["a"] } },
    { ...empty, workType: { added: [], hidden: ["Test", "test"] } },
  );
  for (const value of invalid) {
    assert.equal(validChoiceLists(value), false);
    assert.throws(() => normalizeChoiceLists(value), /listeleri geçersiz/);
  }
});

test("catalog and preference copies detach nested arrays while old preferences stay byte-compatible and absent", () => {
  const lists = freeze(addChoice("projectCode", "PRJ-1", []));
  const copy = normalizeChoiceLists(lists);
  copy.projectCode.added.push("PRJ-2");
  assert.deepEqual(lists.projectCode.added, ["PRJ-1"]);
  for (const old of [
    { density: "comfortable" },
    { density: "compact", theme: "dark" },
  ]) {
    assert.equal(
      JSON.stringify(normalizePreferences(old)),
      JSON.stringify(old),
    );
    assert.equal(
      Object.hasOwn(normalizePreferences(old), "choiceLists"),
      false,
    );
  }
  const preferences = normalizePreferences({
    density: "compact",
    theme: "system",
    choiceLists: lists,
  });
  assert.equal(validPreferences(preferences, { strict: true }), true);
  preferences.choiceLists.projectCode.added.push("PRJ-3");
  assert.deepEqual(lists.projectCode.added, ["PRJ-1"]);
  assert.equal(
    validPreferences({ density: "compact", choiceLists: {} }),
    false,
  );
  assert.deepEqual(
    normalizePreferences({ density: "compact", choiceLists: {} }),
    { density: "compact" },
  );
});

test("hiding a longer legacy imported work type preserves the original value and can rename it to a valid current caption", () => {
  const legacy = "Eski ".repeat(30).trim();
  const source = freeze([{ workType: legacy }]);
  const hidden = removeChoice("workType", legacy, source);
  assert.equal(validChoiceLists(hidden), true);
  assert.ok(!availableChoices("workType", source, hidden).includes(legacy));
  const restored = restoreChoice("workType", legacy, source, freeze(hidden));
  assert.equal(validChoiceLists(restored), true);
  assert.deepEqual(restored.workType.added, []);
  assert.deepEqual(restored.workType.hidden, []);
  assert.ok(availableChoices("workType", source, restored).includes(legacy));
  assert.throws(
    () => restoreChoice("workType", legacy, [], hidden),
    /artık kayıtlarda yok/,
  );
  const renamed = renameChoice("workType", legacy, "Kısa iş türü", source);
  assert.ok(
    availableChoices("workType", source, renamed).includes("Kısa iş türü"),
  );
  assert.equal(source[0].workType, legacy);
});
