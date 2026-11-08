import test from "node:test";
import assert from "node:assert/strict";
import { recordContextParts } from "../src/record-context.js";

const item = (id, type = "daily", values = {}) => ({
  id,
  type,
  title: `Kayıt ${id}`,
  ...values,
});
const texts = (record, records = [], options) =>
  recordContextParts(record, records, options).map((part) => part.text);
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

test("empty context has no module, period, note, metric or next-action filler", () => {
  for (const type of [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "meeting",
    "waiting",
  ])
    assert.deepEqual(
      recordContextParts(
        item("empty", type, {
          category: "Eski kategori",
          description: "Bir not",
          nextAction: "Sonraki iş",
          metric: "Parça",
          periodKey: "bilinmeyen",
          dueDate: "2026-02-30",
        }),
      ),
      [],
    );
  assert.deepEqual(recordContextParts(null), []);
});

test("daily context preserves a real weekly parent and independent follow-up origin without mutation", () => {
  const parent = item("week", "weekly", {
    title: "Doğrulama",
    periodKey: "2026-W45",
    status: "transferred",
  });
  const source = item("meeting", "meeting", { title: "Tasarım kararı" });
  const daily = item("daily", "daily", {
    title: "Çizimi güncelle",
    projectCode: "PRJ-42",
    workType: "Tasarım",
    parentId: parent.id,
    sourceFields: {
      __followupSource: { recordId: source.id, type: "meeting" },
      raw: { value: "Korunacak" },
    },
  });
  const records = freeze([daily, parent, source]);
  const original = JSON.stringify(records);
  assert.deepEqual(recordContextParts(daily, records), [
    {
      kind: "parent",
      text: "Haftalık hedef: Doğrulama",
      targetId: "week",
      targetType: "weekly",
    },
    {
      kind: "source",
      text: "Toplantı: Tasarım kararı",
      targetId: "meeting",
      targetType: "meeting",
    },
  ]);
  assert.equal(JSON.stringify(records), original);
});

test("unlinked daily subtitles omit saved choices, work context and unresolved hints without changing those fields", () => {
  for (const values of [
    { projectCode: "PRJ-42", workType: "Tasarım" },
    { projectCode: "Ölçüm", workType: "Olcum", workContext: "ad_hoc" },
    {
      projectCode: "ＰＲＪ",
      workType: "Rutin iş",
      sourceFields: { __unresolvedParent: "Eski hedef" },
    },
    { parentId: "missing", projectCode: "I", workType: "İ" },
  ]) {
    const daily = freeze(item("unlinked", "daily", values));
    const original = JSON.stringify(daily);
    assert.deepEqual(recordContextParts(daily), []);
    assert.equal(JSON.stringify(daily), original);
  }
});

test("equal parent and source titles describe their roles without repeating the row title", () => {
  const parent = item("week", "weekly", {
    title: " İŞ ",
    periodKey: "2026-W45",
  });
  const source = item("source", "waiting", { title: "İş" });
  const daily = item("daily", "daily", {
    title: "iş",
    parentId: parent.id,
    sourceFields: { __followupSource: { recordId: source.id } },
  });
  assert.deepEqual(texts(daily, [parent, source]), [
    "Haftalık hedef: 2 – 8 Kasım 2026",
    "Bekleyen konudan gelen iş",
  ]);
  assert.equal(
    recordContextParts(daily, [{ ...parent, periodKey: "bad" }, source])[0]
      .text,
    "Haftalık hedef",
  );
  const meeting = item("meeting", "meeting", { title: "İŞ" });
  assert.deepEqual(
    texts(
      {
        ...daily,
        parentId: "",
        sourceFields: { __followupSource: { recordId: meeting.id } },
      },
      [meeting],
    ),
    ["Toplantıdan gelen iş"],
  );
});

test("ad-hoc work suppresses stale weekly and unresolved links while retaining its actual origin", () => {
  const parent = item("week", "weekly");
  const source = item("source", "meeting");
  const daily = item("daily", "daily", {
    workContext: "ad_hoc",
    parentId: parent.id,
    sourceFields: {
      __unresolvedParent: "Eski hedef",
      __followupSource: { recordId: source.id },
    },
  });
  assert.deepEqual(texts(daily, [parent, source]), ["Toplantı: Kayıt source"]);
  const unresolved = item("unresolved", "daily", {
    sourceFields: { __unresolvedParent: "Eski hedef" },
  });
  assert.deepEqual(recordContextParts(unresolved), []);
  assert.deepEqual(
    recordContextParts({ ...unresolved, parentId: "missing" }),
    [],
  );
});

test("parent and source links require the correct existing target types and unambiguous IDs", () => {
  const monthly = item("month", "monthly", { title: "Ürün hazırlığı" });
  const yearly = item("year", "yearly", { title: "Yıllık plan" });
  const source = item("meeting", "meeting");
  assert.deepEqual(
    texts(item("week", "weekly", { goalParentId: monthly.id }), [monthly]),
    ["Aylık hedef: Ürün hazırlığı"],
  );
  assert.deepEqual(
    texts(item("month", "monthly", { goalParentId: yearly.id }), [yearly]),
    ["Senelik hedef: Yıllık plan"],
  );
  for (const badParent of [
    undefined,
    item("target", "daily"),
    item("target", "monthly"),
  ])
    assert.deepEqual(
      recordContextParts(
        item("daily", "daily", { parentId: "target" }),
        badParent ? [badParent] : [],
      ),
      [],
    );
  for (const reference of [
    { recordId: "missing" },
    { recordId: source.id, type: "waiting" },
    { recordId: "wrong" },
    { recordId: "self" },
  ])
    assert.deepEqual(
      recordContextParts(
        item("self", "daily", {
          sourceFields: { __followupSource: reference },
        }),
        [source, item("wrong", "weekly"), item("self")],
      ),
      [],
    );
  assert.deepEqual(
    recordContextParts(item("daily", "daily", { parentId: "duplicate" }), [
      item("duplicate", "weekly"),
      item("duplicate", "weekly"),
    ]),
    [],
  );
});

test("goal periods are human, explicit-first, optional and strict across year and leap boundaries", () => {
  assert.deepEqual(
    texts(
      item("week", "weekly", { periodKey: "2020-W53", dueDate: "2026-11-07" }),
    ),
    ["28 Aralık 2020 – 3 Ocak 2021"],
  );
  assert.deepEqual(
    texts(
      item("month", "monthly", { periodKey: "2024-02", dueDate: "2026-11-07" }),
    ),
    ["Şubat 2024"],
  );
  assert.deepEqual(
    texts(
      item("fallback", "monthly", {
        periodKey: "2026-13",
        dueDate: "2024-02-29",
      }),
    ),
    ["Şubat 2024"],
  );
  assert.deepEqual(
    texts(
      item("fallback", "weekly", {
        periodKey: "2021-W53",
        dueDate: "2026-11-07",
      }),
    ),
    ["2 – 8 Kasım 2026"],
  );
  assert.deepEqual(
    texts(
      item("bad", "monthly", { periodKey: "2026-00", dueDate: "2025-02-29" }),
    ),
    [],
  );
  assert.deepEqual(texts(item("year", "yearly", { periodKey: "2026" })), [
    "2026",
  ]);
  assert.deepEqual(
    texts(item("year", "yearly", { periodKey: "bad", dueDate: "2026-11-07" })),
    [],
  );
  assert.deepEqual(
    texts(item("year", "yearly", { dueDate: "2026-11-07" })),
    [],
  );
  assert.deepEqual(
    texts(
      item("month", "monthly", { periodKey: "2026-11", projectCode: "PRJ" }),
      [],
      { showPeriod: false },
    ),
    [],
  );
});

test("meeting captions use only actual people and waiting origins keep the correct workflow role", () => {
  const meeting = item("meeting", "meeting", {
    title: "Karar",
    owner: "  Ayşe  ",
    participants: "Ali, Ece",
    description: "Not",
    nextAction: "Ara",
  });
  assert.deepEqual(recordContextParts(meeting), [
    { kind: "owner", text: "Sorumlu: Ayşe" },
    { kind: "participants", text: "Katılımcılar: Ali, Ece" },
  ]);
  const waiting = item("waiting", "waiting", {
    title: "Karar",
    expectedFrom: "Ayşe",
    latestUpdate: "Yanıt yok",
    sourceFields: {
      __followupSource: { recordId: meeting.id, type: "meeting" },
    },
  });
  assert.deepEqual(recordContextParts(waiting, [meeting]), [
    {
      kind: "source",
      text: "Toplantıdan gelen takip",
      targetId: meeting.id,
      targetType: "meeting",
    },
  ]);
  assert.deepEqual(
    recordContextParts({ ...meeting, owner: " ", participants: "" }),
    [],
  );
  assert.deepEqual(recordContextParts({ ...waiting, sourceFields: {} }), []);
});
