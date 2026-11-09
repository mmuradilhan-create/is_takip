import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbook, parseExcelFile, buildWorkbook } from "../src/excel.js";
import { createRecord, validateStore } from "../src/model.js";

function workbook(sheets) {
  const result = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets))
    result.addWorksheet(name).addRows(rows);
  return result;
}

test("Turkish sheets import dates, priorities, statuses, and link daily work to weekly goals", () => {
  const result = parseWorkbook(
    workbook({
      Dashboard: [["Sayı", 99]],
      "Günlük işler": [
        ["Eski takip listesi"],
        ["İş", "Durum", "Öncelik", "Teslim tarihi", "Haftalık hedef", "Ek not"],
        [
          "Görüşme",
          "Devam Ediyor",
          "Yüksek",
          "06.11.2026",
          "Teklif hazırlığı",
          "Özel bilgi",
        ],
        ["Rapor", "Tamamlandı", "Acil", 46332, "Teklif hazırlığı"],
      ],
      "Haftalık plan": [
        ["Hedef", "Durum"],
        ["Teklif hazırlığı", "Bekliyor"],
      ],
    }),
  );
  assert.equal(result.records.length, 3);
  assert.equal(result.records[0].dueDate, "2026-11-06");
  assert.equal(result.records[0].status, "in_progress");
  assert.equal(result.records[0].priority, "high");
  assert.equal(result.records[0].parentId, result.records[2].id);
  assert.match(result.records[0].description, /Ek not: Özel bilgi/);
  assert.equal(result.records[1].dueDate, "2026-11-06");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.sheets[0].type, "dashboard");
});

test("plain workbooks recognize meeting state captions while Açık keeps its existing meaning in other modules", async () => {
  const plain = workbook({
    "Toplantı aksiyonları": [
      ["ID", "Başlık", "Durum"],
      ["meeting-planned", "Planlanacak toplantı", "Planlanacak"],
      ["meeting-open", "Açık toplantı", "Açık"],
      ["meeting-closed", "Kapalı toplantı", "Kapandı"],
    ],
    "Günlük işler": [
      ["ID", "Başlık", "Durum"],
      ["daily-open", "Açık günlük iş", "Açık"],
    ],
    "Bekleyen konular": [
      ["ID", "Başlık", "Durum"],
      ["waiting-open", "Açık bekleyen konu", "Açık"],
    ],
  });
  const result = await parseExcelFile(await plain.xlsx.writeBuffer());
  assert.deepEqual(result.warnings, []);
  assert.equal(result.records.length, 5);
  for (const [id, type, status, originalCaption] of [
    ["meeting-planned", "meeting", "planned", "Planlanacak"],
    ["meeting-open", "meeting", "in_progress", "Açık"],
    ["meeting-closed", "meeting", "completed", "Kapandı"],
    ["daily-open", "daily", "planned", "Açık"],
    ["waiting-open", "waiting", "planned", "Açık"],
  ]) {
    const imported = result.records.find((record) => record.id === id);
    assert.equal(imported.type, type);
    assert.equal(imported.status, status);
    assert.equal(imported.sourceFields.Durum, originalCaption);
    assert.equal(imported.description, "");
  }
  assert.deepEqual(
    validateStore({ version: 1, records: result.records }).records,
    result.records,
  );
});

test("unmapped sheets and malformed fields produce visible warnings without losing raw details", () => {
  const result = parseWorkbook(
    workbook({
      "Günlük işler": [
        ["Başlık", "Durum", "Öncelik", "Tarih", "Haftalık hedef"],
        ["İş", "Bilinmiyor", "Özel", "30.02.2026", "Kayıp"],
        ["", "Bekliyor"],
      ],
      "Eski notlar": [["Not"], ["Bilgi"]],
    }),
  );
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].dueDate, "");
  assert.equal(result.records[0].parentId, null);
  assert.match(result.records[0].description, /30.02.2026/);
  assert.match(result.records[0].description, /Kayıp/);
  assert.match(result.records[0].description, /Bilinmiyor/);
  assert.equal(result.skippedRows, 3);
  assert.equal(result.warnings.length, 6);
});

test("Excel binary export roundtrip preserves all fields and links", async () => {
  const weekly = createRecord({
    type: "weekly",
    title: "Plan",
    owner: "Ali",
    dueDate: "2026-11-10",
    status: "waiting",
    priority: "high",
  });
  const daily = createRecord({
    title: "Görev",
    description: "Detay\nİkinci satır",
    parentId: weekly.id,
    status: "in_progress",
    priority: "urgent",
  });
  const bytes = await buildWorkbook([weekly, daily]).xlsx.writeBuffer();
  const result = await parseExcelFile(bytes);
  assert.equal(result.warnings.length, 0);
  const store = validateStore({ version: 1, records: result.records });
  assert.deepEqual(
    store.records.find((record) => record.id === weekly.id),
    weekly,
  );
  assert.deepEqual(
    store.records.find((record) => record.id === daily.id),
    daily,
  );
});

test("Excel exports retired partial statuses with the current caption without rewriting saved legacy records", () => {
  const types = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
  const records = types.map((type) =>
    createRecord({
      id: `export-partial-${type}`,
      type,
      title: `Korunan ${type}`,
      status: "partially_completed",
      targetValue: 10,
      currentValue: 4,
    }),
  );
  const before = JSON.stringify(records);
  const exported = buildWorkbook(records);
  for (const sheet of exported.worksheets)
    assert.equal(sheet.getCell(2, 4).value, "Devam ediyor");
  const imported = parseWorkbook(exported);
  assert.equal(imported.records.length, types.length);
  for (const record of imported.records) {
    assert.equal(record.status, "in_progress");
    assert.equal(record.targetValue, 10);
    assert.equal(record.currentValue, 4);
  }
  assert.equal(JSON.stringify(records), before);
  assert.ok(records.every((record) => record.status === "partially_completed"));
});

test("invalid or empty workbooks fail with actionable errors and duplicate IDs are rejected", () => {
  assert.throws(
    () => parseWorkbook(workbook({ Dashboard: [["Sayı", 3]] })),
    /Aktarılabilir kayıt/,
  );
  assert.throws(
    () =>
      parseWorkbook(
        workbook({
          "Günlük işler": [
            ["X", "Y"],
            [1, 2],
          ],
        }),
      ),
    /sütunu bulunamadı/,
  );
  assert.throws(
    () =>
      parseWorkbook(
        workbook({
          "Günlük işler": [
            ["ID", "İş"],
            ["same", "A"],
            ["same", "B"],
          ],
        }),
      ),
    /Tekrarlanan/,
  );
});

test("ambiguous weekly titles are not linked arbitrarily", () => {
  const result = parseWorkbook(
    workbook({
      "Haftalık plan": [["Hedef"], ["Teklif"], ["Teklif"]],
      "Günlük işler": [
        ["İş", "Haftalık hedef"],
        ["Ara", "Teklif"],
      ],
    }),
  );
  assert.equal(result.records[2].parentId, null);
  assert.match(result.report.unresolvedLinkDetails[0].reason, /Birden fazla/);
  assert.equal(result.records[2].sourceFields.__unresolvedParent, "Teklif");
});

test("Excel date systems respect the 1900 leap-day quirk and the 1904 epoch", () => {
  const old = parseWorkbook(
    workbook({
      "Günlük işler": [
        ["İş", "Teslim tarihi"],
        ["İlk gün", 1],
        ["Şubat", 59],
        ["Hayali gün", 60],
        ["Mart", 61],
      ],
    }),
  );
  assert.deepEqual(
    old.records.map((record) => record.dueDate),
    ["1900-01-01", "1900-02-28", "", "1900-03-01"],
  );
  const mac = workbook({
    "Günlük işler": [
      ["İş", "Teslim tarihi"],
      ["İkinci gün", 1],
    ],
  });
  mac.properties.date1904 = true;
  assert.equal(parseWorkbook(mac).records[0].dueDate, "1904-01-02");
});

test("old xls files and unreadable files are rejected with next-step guidance", async () => {
  await assert.rejects(
    () => parseExcelFile({ name: "eski.xls" }),
    /xlsx olarak kaydedip/,
  );
  await assert.rejects(
    () => parseExcelFile(new Uint8Array([1, 2, 3])),
    /şifresiz bir .xlsx/,
  );
});

test("timestamp cells are normalized and invalid values retained with warnings", () => {
  const result = parseWorkbook(
    workbook({
      "Günlük işler": [
        ["İş", "Oluşturulma", "Güncelleme"],
        ["İş", 46332, "Özel not"],
      ],
    }),
  );
  assert.equal(result.records[0].createdAt, "2026-11-06T00:00:00.000Z");
  assert.equal(typeof result.records[0].updatedAt, "string");
  assert.match(result.records[0].description, /Özel not/);
  assert.equal(result.warnings.length, 1);
});

test("sparse formatting is ignored and resource limits reject large actual inputs", async () => {
  const book = workbook({ "Günlük işler": [["İş"], ["Görev"]] });
  book.worksheets[0].getCell("XFD1000000").font = { bold: true };
  assert.equal(parseWorkbook(book).records.length, 1);
  await assert.rejects(
    () => parseExcelFile({ name: "large.xlsx", size: 21 * 1024 * 1024 }),
    /20 MB/,
  );
  book.worksheets[0].getCell("SG3").value = "Çok uzakta";
  assert.throws(() => parseWorkbook(book), /500. sütunun/);
});

test("tracking workbook schema preserves periods, work metadata, meeting decisions, and waiting follow-ups", () => {
  const book = workbook({
    "Günlük İşler": [
      [],
      [],
      [],
      [
        "Tarih",
        "Gün",
        "Öncelik",
        "İş / Görev",
        "Durum",
        "Teslim Tarihi",
        "Sonraki Aksiyon",
        "Gecikme",
        "Engel",
        "Not",
        "Kategori",
        "İş Tipi",
        "İlgili Haftalık Hedef",
        "Odak Sıra",
      ],
      [
        "02.11.2026",
        "Pazartesi",
        "Orta",
        "Taslak adımı",
        "Devam ediyor",
        "06.11.2026",
        "Kontrol et",
        0,
        "Evet",
        "Not",
        "Araştırma",
        "Proje",
        "Ortak hedef",
        2,
      ],
    ],
    "Haftalık Plan": [
      [],
      [],
      [],
      [
        "Hafta",
        "Öncelik",
        "Haftalık Hedef",
        "Ölçülebilir Çıktı",
        "Durum",
        "Hedef Değer",
        "Mevcut Değer",
        "Kalan",
        "İlerleme %",
        "Sonraki Aksiyon",
        "Sonraki Haftaya Aktar?",
        "Notlar",
        "Sapma / Neden",
      ],
      [
        "2026-W44",
        "Yüksek",
        "Ortak hedef",
        "Adet",
        "Aktarıldı",
        10,
        4,
        6,
        0.4,
        "Devam et",
        "Evet",
        "",
        "Dış etken",
      ],
      [
        "2026-W45",
        "Yüksek",
        "Ortak hedef",
        "Adet",
        "Kısmi tamamlandı",
        10,
        7,
        3,
        0.7,
        "",
        "Hayır",
        "",
        "",
      ],
    ],
    "Toplantı & Aksiyon": [
      [],
      [],
      [],
      [
        "Tarih",
        "Toplantı / Aksiyon",
        "Katılımcılar",
        "Alınan Karar",
        "Bana Düşen Aksiyon",
        "Termin",
        "Durum",
        "Not",
      ],
      [
        "03.11.2026",
        "Plan görüşmesi",
        "Ekip",
        "Yeniden gözden geçir",
        "Taslağı hazırla",
        "06.11.2026",
        "İptal/Ertelendi",
        "Ek not",
      ],
    ],
    "Bekleyen Konular": [
      [],
      [],
      [],
      [
        "Açılış Tarihi",
        "Konu",
        "Kimden Bekleniyor?",
        "Son Durum",
        "Son Takip Tarihi",
        "Durum",
        "Kaç Gün Bekledi",
        "Not",
      ],
      [
        "01.11.2026",
        "Geri dönüş",
        "Destek",
        "Hatırlatma gönderildi",
        "05.11.2026",
        "Cevap bekleniyor",
        4,
        "",
      ],
    ],
    Listeler: [["Durumlar"], ["Aktarıldı"]],
  });
  const result = parseWorkbook(book);
  const daily = result.records.find((record) => record.type === "daily");
  const weekly = result.records.filter((record) => record.type === "weekly");
  const meeting = result.records.find((record) => record.type === "meeting");
  const waiting = result.records.find((record) => record.type === "waiting");
  assert.equal(daily.sourceDate, "2026-11-02");
  assert.equal(daily.dueDate, "2026-11-06");
  assert.equal(daily.parentId, weekly[1].id);
  assert.equal(daily.category, "Araştırma");
  assert.equal(daily.workType, "Proje");
  assert.equal(daily.blocked, true);
  assert.equal(daily.sourceFields["Odak Sıra"], 2);
  assert.equal(weekly[0].status, "transferred");
  assert.equal(weekly[0].carryForward, true);
  assert.equal(weekly[1].status, "partially_completed");
  assert.equal(weekly[1].currentValue, 7);
  assert.equal(meeting.participants, "Ekip");
  assert.equal(meeting.decision, "Yeniden gözden geçir");
  assert.equal(meeting.nextAction, "Taslağı hazırla");
  assert.equal(meeting.status, "cancelled");
  assert.equal(waiting.expectedFrom, "Destek");
  assert.equal(waiting.lastFollowUpDate, "2026-11-05");
  assert.equal(waiting.dueDate, "");
  assert.equal(waiting.status, "waiting_response");
  assert.equal(result.report.linkedDailyRows, 1);
  assert.equal(result.report.unresolvedLinks, 0);
  assert.deepEqual(result.report.referenceSheets, ["Listeler"]);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(
    parseWorkbook(book).records.map((record) => record.id),
    result.records.map((record) => record.id),
  );
});

test("formula-only templates do not create records or warning floods, while sheet notes survive", () => {
  const book = workbook({
    "Senelik Hedefler": [
      ["Yıl", "Hedef Alanı", "Senelik Hedef", "Durum", "Yıl Sonu Yorumu"],
      [2026, "Gelişim", "Yeni beceri", "Takipte", ""],
      ["", "", "", "", "Genel değerlendirme"],
    ],
  });
  for (let row = 4; row <= 20; row++)
    book.worksheets[0].getCell(row, 6).value = {
      formula: `IF(C${row}="","",0)`,
      result: "",
    };
  const result = parseWorkbook(book);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].periodKey, "2026");
  assert.equal(
    result.records[0].sourceFields.__sheetNotes[0].fields["Yıl Sonu Yorumu"],
    "Genel değerlendirme",
  );
  assert.equal(result.report.formulaOnlyRows, 17);
  assert.equal(result.report.sheetNotes, 1);
  assert.equal(result.warnings.length, 1);
});

test("extended fields and unresolved reference metadata roundtrip losslessly through XLSM input and XLSX output", async () => {
  const weekly = createRecord({
    type: "weekly",
    title: "Hedef",
    periodKey: "2026-W45",
    metric: "Adet",
    targetValue: 52,
    currentValue: 42,
    carryForward: true,
    variance: "Açıklama",
    status: "transferred",
  });
  const daily = createRecord({
    title: "İş",
    sourceDate: "2026-11-02",
    nextAction: "Kontrol",
    category: "Kategori",
    workType: "Proje",
    blocked: true,
    participants: "Kişiler",
    decision: "Karar",
    expectedFrom: "Destek",
    lastFollowUpDate: "2026-11-03",
    sourceFields: { __unresolvedParent: "Bulunmayan hedef", "Özel alan": 4 },
    description: "Excel haftalık bağlantısı: Bulunmayan hedef",
    status: "follow_up",
  });
  const bytes = await buildWorkbook([weekly, daily]).xlsx.writeBuffer();
  const result = await parseExcelFile({
    name: "sentetik.xlsm",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  });
  assert.equal(result.report.unresolvedLinks, 1);
  assert.deepEqual(
    result.records.find((record) => record.id === weekly.id),
    weekly,
  );
  assert.deepEqual(
    result.records.find((record) => record.id === daily.id),
    daily,
  );
});
