import ExcelJS from "exceljs";
import {
  createRecord,
  TYPES,
  STATUSES,
  PRIORITIES,
  statusForDisplay,
} from "./model.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 20000;
const MAX_COLUMNS = 500;
const MAX_CELLS = 500000;

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");
}

const SHEETS = {
  daily: ["Günlük işler", "Günlük iş", "Günlük", "Daily"],
  weekly: [
    "Haftalık plan",
    "Haftalık hedefler",
    "Haftalık hedef",
    "Haftalık",
    "Weekly",
  ],
  monthly: ["Aylık hedefler", "Aylık hedef", "Aylık plan", "Monthly"],
  yearly: [
    "Senelik hedefler",
    "Yıllık hedefler",
    "Yıllık hedef",
    "Senelik hedef",
    "Yearly",
  ],
  meeting: [
    "Toplantı aksiyon",
    "Toplantı & Aksiyon",
    "Toplantı aksiyonları",
    "Toplantı aksiyonlar",
    "Toplantılar",
    "Meeting",
  ],
  waiting: ["Bekleyen konular", "Bekleyen konu", "Bekleyenler", "Waiting"],
};

const COLUMNS = {
  title: [
    "Başlık",
    "İş / Görev",
    "Toplantı / Aksiyon",
    "Aylık Hedef",
    "Senelik Hedef",
    "Haftalık Hedef",
    "İş adı",
    "Görev adı",
    "İş",
    "Görev",
    "Konu",
    "Aksiyon",
    "Hedef",
    "Hedef adı",
    "Yapılacak iş",
    "Yapılacaklar",
    "Title",
    "Task",
    "Açıklama",
  ],
  description: [
    "Notlar",
    "Not",
    "Detay",
    "Detaylar",
    "İş açıklaması",
    "Görev açıklaması",
    "Açıklama",
    "Description",
  ],
  status: ["Durum", "Durumu", "İş durumu", "Görev durumu", "Status"],
  priority: ["Öncelik", "Önceliği", "Öncelik durumu", "Priority"],
  dueDate: [
    "Teslim tarihi",
    "Bitiş tarihi",
    "Son tarih",
    "Hedef tarih",
    "Termin",
    "Termin tarihi",
    "Deadline",
    "Due date",
  ],
  sourceDate: ["Kayıt Tarihi", "Açılış Tarihi", "Tarih", "Source Date"],
  periodKey: ["Dönem", "Hafta", "Ay", "Yıl", "Period Key"],
  parentId: [
    "Haftalık hedef ID",
    "Haftalık plan ID",
    "Bağlı haftalık ID",
    "Parent ID",
    "ParentId",
  ],
  parentTitle: [
    "İlgili Haftalık Hedef",
    "Bağlı haftalık hedef",
    "Haftalık hedef",
    "Haftalık plan",
    "Bağlı hedef",
    "Weekly goal",
  ],
  owner: ["Sorumlu", "Sorumlu kişi", "Atanan", "Kişi", "Owner", "Assignee"],
  nextAction: ["Sonraki Aksiyon", "Bana Düşen Aksiyon", "Next Action"],
  category: ["Kategori", "Hedef Alanı", "Category"],
  workType: ["İş Tipi", "Work Type"],
  blocked: ["Engel", "Blocked"],
  metric: ["Ölçülebilir Çıktı", "Ölçüt", "Metric"],
  targetValue: ["Hedef Değer", "Target Value"],
  currentValue: ["Mevcut Değer", "Current Value"],
  carryForward: [
    "Devret",
    "Sonraki Haftaya Aktar?",
    "Sonraki Aya Aktar?",
    "Carry Forward",
  ],
  variance: ["Sapma / Neden", "Sapma", "Variance"],
  participants: ["Katılımcılar", "Participants"],
  decision: ["Alınan Karar", "Decision"],
  expectedFrom: ["Kimden Bekleniyor?", "Kimden Bekleniyor", "Expected From"],
  lastFollowUpDate: ["Son Takip Tarihi", "Last Follow Up Date"],
  sourceFields: ["Kaynak Alanlar JSON"],
  id: ["ID", "Kayıt ID", "Kimlik"],
  createdAt: ["Oluşturulma", "Oluşturulma tarihi", "Created at", "CreatedAt"],
  updatedAt: ["Güncelleme", "Güncelleme tarihi", "Updated at", "UpdatedAt"],
};

const STATUS_ALIASES = {
  planned: [
    "Planlandı",
    "Planlanan",
    "Planlı",
    "Başlamadı",
    "Başlanmadı",
    "Yapılacak",
    "Açık",
    "Yeni",
    "Not started",
    "Planned",
    "Todo",
  ],
  in_progress: [
    "Devam ediyor",
    "Devam",
    "Devam etmekte",
    "Sürüyor",
    "İşlemde",
    "Çalışılıyor",
    "In progress",
    "In_progress",
  ],
  waiting: [
    "Bekliyor",
    "Beklemede",
    "Bekleyen",
    "Bloke",
    "Waiting",
    "On hold",
    "Blocked",
  ],
  completed: [
    "Tamamlandı",
    "Tamam",
    "Tamamlanan",
    "Bitti",
    "Biten",
    "Yapıldı",
    "Kapandı",
    "Kapalı",
    "Completed",
    "Done",
  ],
  partially_completed: [
    "Kısmi tamamlandı",
    "Kısmen tamamlandı",
    "Partially Completed",
  ],
  transferred: ["Aktarıldı", "Devredildi", "Transferred"],
  follow_up: ["Takipte", "Takip ediliyor", "Follow Up"],
  waiting_response: [
    "Cevap bekleniyor",
    "Yanıt bekleniyor",
    "Waiting Response",
  ],
  cancelled: [
    "İptal",
    "Iptal",
    "İptal/Ertelendi",
    "İptal edildi",
    "Vazgeçildi",
    "Cancelled",
    "Canceled",
  ],
};

const PRIORITY_ALIASES = {
  low: ["Düşük", "Az", "Low", "4"],
  normal: ["Normal", "Orta", "Medium", "3"],
  high: ["Yüksek", "Önemli", "High", "2"],
  urgent: ["Acil", "Kritik", "Çok yüksek", "Urgent", "Critical", "1"],
};

function resolveAlias(value, aliases) {
  const normalized = normalize(value);
  return Object.entries(aliases).find(
    ([key, values]) =>
      normalize(key) === normalized ||
      values.some((alias) => normalize(alias) === normalized),
  )?.[0];
}

function columnMap(row, type) {
  const normalized = row.map(normalize);
  const result = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    if (key === "parentTitle" && type !== "daily") continue;
    for (const alias of aliases) {
      const index = normalized.indexOf(normalize(alias));
      if (index !== -1) {
        result[key] = index;
        break;
      }
    }
  }
  if (result.description === result.title) delete result.description;
  return result;
}

function parseDate(value, date1904 = false) {
  if (value == null || value === "") return "";
  let year, month, day;
  if (value instanceof Date) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      value < (date1904 ? 0 : 1) ||
      value > (date1904 ? 2957003 : 2958465)
    )
      return null;
    if (!date1904 && Math.floor(value) === 60) return null;
    const days = Math.floor(value) + (!date1904 && value < 60 ? 1 : 0);
    const date = new Date(
      Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) +
        days * 86400000,
    );
    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
  } else {
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    const turkish = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (iso) [, year, month, day] = iso.map(Number);
    else if (turkish) [, day, month, year] = turkish.map(Number);
    else return null;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cellValue(value) {
  if (!value || typeof value !== "object" || value instanceof Date)
    return value;
  if ("result" in value) return cellValue(value.result);
  if ("formula" in value || "sharedFormula" in value) return "";
  if (Array.isArray(value.richText))
    return value.richText.map((part) => part.text || "").join("");
  if ("text" in value) return value.text;
  if ("error" in value) return value.error;
  return "";
}

function isFormula(value) {
  return (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  );
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function worksheetRows(sheet, budget, report) {
  const rows = [];
  sheet.eachRow((row) => {
    const values = [],
      rawValues = [],
      formulas = {};
    let hasLiteral = false,
      hasFormula = false;
    row.eachCell((cell, column) => {
      const raw = cell.value;
      const value = cellValue(raw);
      if (isFormula(raw)) {
        hasFormula = true;
        formulas[column - 1] = jsonSafe(raw);
      } else if (value != null && String(value).trim()) hasLiteral = true;
      if (value == null || String(value).trim() === "") return;
      if (column > MAX_COLUMNS)
        throw new Error(
          `“${sheet.name}” sekmesinde ${MAX_COLUMNS}. sütunun ötesinde veri var. Aktarılacak alanı sadeleştirip yeniden deneyin.`,
        );
      if (++budget.cells > MAX_CELLS)
        throw new Error(
          "Dosya çok fazla dolu hücre içeriyor. Dosyayı daha küçük parçalara ayırarak aktarın.",
        );
      values[column - 1] = value;
      rawValues[column - 1] = jsonSafe(value);
    });
    if (!hasLiteral && hasFormula) {
      report.formulaOnlyRows++;
      return;
    }
    if (!hasLiteral) return;
    if (++budget.rows > MAX_ROWS)
      throw new Error(
        "Bir aktarımda en fazla 20.000 dolu satır desteklenir. Dosyayı daha küçük parçalara ayırın.",
      );
    rows.push({ number: row.number, values, rawValues, formulas });
  });
  return rows;
}

function parseTimestamp(value, date1904) {
  if (value == null || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const date = parseDate(value, date1904);
  return date ? `${date}T00:00:00.000Z` : null;
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/\s/g, "").replace(/%$/, "");
  if (text.includes(",") && text.includes("."))
    text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(",", ".");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    ["evet", "var", "true", "yes", "1", "x", "engelvar"].includes(
      normalize(value),
    )
  );
}

function periodKey(value, type) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const week = text.match(/^(\d{4})\s*[-/]?\s*[WwHh]\s*(\d{1,2})$/);
  if (week) return `${week[1]}-W${week[2].padStart(2, "0")}`;
  const month = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (month) return `${month[1]}-${month[2].padStart(2, "0")}`;
  if (value instanceof Date && type === "monthly")
    return value.toISOString().slice(0, 7);
  return text;
}

function isoWeek(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date - start) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

function weekTime(period) {
  const match = period.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const start = new Date(Date.UTC(Number(match[1]), 0, 4));
  start.setUTCDate(
    start.getUTCDate() -
      ((start.getUTCDay() + 6) % 7) +
      (Number(match[2]) - 1) * 7,
  );
  return start.getTime();
}

function stableId(parts) {
  const text = parts.join("\u001f");
  let first = 2166136261,
    second = 5381;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `excel-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function fieldsForRow(row, header, sheetName) {
  const fields = { __sheet: sheetName, __row: row.number };
  for (let col = 0; col < row.rawValues.length; col++) {
    if (row.rawValues[col] !== undefined)
      fields[String(header[col] || `Sütun ${col + 1}`)] = row.rawValues[col];
  }
  if (Object.keys(row.formulas).length)
    fields.__formulas = Object.fromEntries(
      Object.entries(row.formulas).map(([col, formula]) => [
        header[Number(col)] || `Sütun ${Number(col) + 1}`,
        formula,
      ]),
    );
  return fields;
}

export function parseWorkbook(workbook) {
  const records = [],
    warnings = [],
    sheets = [],
    pendingParents = [],
    ids = new Set();
  const budget = { rows: 0, cells: 0 };
  const report = {
    formulaOnlyRows: 0,
    unresolvedLinks: 0,
    unresolvedLinkDetails: [],
    linkedDailyRows: 0,
    referenceSheets: [],
    sheetNotes: 0,
  };
  let skippedRows = 0;
  for (const sheet of workbook.worksheets) {
    const name = sheet.name;
    if (
      ["dashboard", "pano", "ozet", "listeler", "lists"].includes(
        normalize(name),
      )
    ) {
      const type = ["listeler", "lists"].includes(normalize(name))
        ? "reference"
        : "dashboard";
      sheets.push({ name, type, importedRows: 0 });
      if (type === "reference") report.referenceSheets.push(name);
      continue;
    }
    const rows = worksheetRows(sheet, budget, report);
    const type = resolveAlias(name, SHEETS);
    if (!type) {
      warnings.push(`“${name}” sekmesi tanınmadığı için aktarılmadı.`);
      skippedRows += rows.length;
      sheets.push({ name, type: null, importedRows: 0 });
      continue;
    }
    let headerIndex = -1,
      columns,
      bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const candidate = columnMap(rows[i].values, type);
      const score = Object.keys(candidate).length;
      if (candidate.title !== undefined && score > bestScore) {
        headerIndex = i;
        columns = candidate;
        bestScore = score;
      }
    }
    if (headerIndex === -1) {
      warnings.push(
        `“${name}” sekmesinde Başlık, İş, Görev, Konu veya Hedef sütunu bulunamadı; sekme aktarılmadı.`,
      );
      skippedRows += rows.length;
      sheets.push({ name, type, importedRows: 0 });
      continue;
    }
    const header = rows[headerIndex].values;
    const sheetRecords = [],
      sheetNotes = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const source = rows[i],
        row = source.values;
      const get = (key) =>
        columns[key] === undefined ? "" : (row[columns[key]] ?? "");
      const location = `${name}, satır ${source.number}`;
      const title = String(get("title")).trim();
      if (!title) {
        skippedRows++;
        sheetNotes.push({
          row: source.number,
          fields: fieldsForRow(source, header, name),
        });
        continue;
      }
      const notes = [];
      const statusValue = get("status"),
        priorityValue = get("priority");
      const status = resolveAlias(statusValue, STATUS_ALIASES) || "planned";
      const priority =
        resolveAlias(priorityValue, PRIORITY_ALIASES) || "normal";
      if (statusValue && !resolveAlias(statusValue, STATUS_ALIASES)) {
        warnings.push(
          `${location}: “${statusValue}” durumu tanınmadı; Planlandı seçildi.`,
        );
        notes.push(`Excel durum bilgisi: ${statusValue}`);
      }
      if (priorityValue && !resolveAlias(priorityValue, PRIORITY_ALIASES)) {
        warnings.push(
          `${location}: “${priorityValue}” önceliği tanınmadı; Normal seçildi.`,
        );
        notes.push(`Excel öncelik bilgisi: ${priorityValue}`);
      }
      const dates = {};
      for (const key of ["dueDate", "sourceDate", "lastFollowUpDate"]) {
        dates[key] = parseDate(get(key), workbook.properties.date1904 === true);
        if (dates[key] === null) {
          warnings.push(
            `${location}: “${get(key)}” tarihi tanınmadı; kaynak alanlarında korundu.`,
          );
          notes.push(
            `Excel ${key === "dueDate" ? "teslim tarihi" : key === "sourceDate" ? "kayıt tarihi" : "son takip tarihi"}: ${get(key)}`,
          );
        }
        dates[key] ||= "";
      }
      const mappedIndices = new Set(Object.values(columns));
      for (let col = 0; col < Math.max(header.length, row.length); col++) {
        if (
          !mappedIndices.has(col) &&
          row[col] != null &&
          String(row[col]).trim()
        )
          notes.push(`${header[col] || `Sütun ${col + 1}`}: ${row[col]}`);
      }
      const timestamps = {};
      for (const key of ["createdAt", "updatedAt"]) {
        timestamps[key] = parseTimestamp(
          get(key),
          workbook.properties.date1904 === true,
        );
        if (timestamps[key] === null) {
          warnings.push(
            `${location}: “${get(key)}” zaman bilgisi tanınmadı; açıklamada korundu.`,
          );
          notes.push(
            `${key === "createdAt" ? "Excel oluşturulma bilgisi" : "Excel güncelleme bilgisi"}: ${get(key)}`,
          );
        }
      }
      let sourceFields = fieldsForRow(source, header, name);
      if (get("sourceFields")) {
        try {
          const parsed = JSON.parse(String(get("sourceFields")));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error();
          sourceFields = parsed;
        } catch {
          warnings.push(
            `${location}: Kaynak Alanlar JSON okunamadı; ham hücre korundu.`,
          );
        }
      }
      const period = periodKey(get("periodKey"), type);
      const numeric = {};
      for (const key of ["targetValue", "currentValue"]) {
        numeric[key] = parseNumber(get(key));
        if (get(key) !== "" && numeric[key] === null)
          warnings.push(
            `${location}: Sayısal hedef bilgisi tanınmadı; kaynak alanlarında korundu.`,
          );
      }
      const record = createRecord({
        id:
          get("id") ||
          stableId([
            normalize(name),
            source.number,
            title,
            period,
            dates.sourceDate,
          ]),
        type,
        title,
        status,
        priority,
        ...dates,
        ...timestamps,
        ...numeric,
        periodKey: period,
        owner: get("owner"),
        description: [get("description"), ...notes].filter(Boolean).join("\n"),
        nextAction: get("nextAction"),
        category: get("category"),
        workType: get("workType"),
        blocked: parseBoolean(get("blocked")),
        metric: get("metric"),
        carryForward: parseBoolean(get("carryForward")),
        variance: get("variance"),
        participants: get("participants"),
        decision: get("decision"),
        expectedFrom: get("expectedFrom"),
        sourceFields,
      });
      if (ids.has(record.id))
        throw new Error(
          `${location}: Tekrarlanan kayıt kimliği (${record.id}). Dosyadaki ID sütunlarını kontrol edin.`,
        );
      ids.add(record.id);
      records.push(record);
      sheetRecords.push(record);
      const parentReference =
        get("parentId") ||
        get("parentTitle") ||
        record.sourceFields.__unresolvedParent;
      if (record.type === "daily" && parentReference)
        pendingParents.push({
          record,
          ref: String(parentReference).trim(),
          location,
          sheet: name,
          row: source.number,
        });
    }
    if (sheetNotes.length) {
      report.sheetNotes += sheetNotes.length;
      if (sheetRecords.length)
        sheetRecords[0].sourceFields.__sheetNotes = sheetNotes;
      warnings.push(
        `${name}: Başlığı olmayan ${sheetNotes.length} not satırı ${sheetRecords.length ? "ilk kaydın kaynak alanlarında korundu" : "aktarılmadı"}.`,
      );
    }
    sheets.push({ name, type, importedRows: sheetRecords.length });
  }
  const weeklyRecords = records.filter((record) => record.type === "weekly");
  for (const { record, ref, sheet, row } of pendingParents) {
    const exactId = weeklyRecords.find((weekly) => weekly.id === ref);
    const matches = weeklyRecords.filter(
      (weekly) => normalize(weekly.title) === normalize(ref),
    );
    let parent = exactId || (matches.length === 1 ? matches[0] : null);
    if (!parent && matches.length > 1 && record.sourceDate) {
      const week = isoWeek(record.sourceDate);
      const exactWeek = matches.filter((weekly) => weekly.periodKey === week);
      if (exactWeek.length === 1) parent = exactWeek[0];
      else if (!exactWeek.length) {
        const date = weekTime(week);
        const distances = matches
          .filter((weekly) => weekTime(weekly.periodKey) != null)
          .map((weekly) => ({
            weekly,
            distance: Math.abs(weekTime(weekly.periodKey) - date),
          }))
          .sort((a, b) => a.distance - b.distance);
        if (
          distances[0]?.distance <= 7 * 86400000 &&
          (distances.length === 1 ||
            distances[0].distance < distances[1].distance)
        )
          parent = distances[0].weekly;
      }
    }
    if (parent) {
      record.parentId = parent.id;
      report.linkedDailyRows++;
    } else {
      const reason = matches.length
        ? "Birden fazla dönemle eşleşti; doğru dönem kesinleştirilemedi."
        : "Eşleşen haftalık hedef bulunamadı.";
      report.unresolvedLinks++;
      report.unresolvedLinkDetails.push({ sheet, row, reference: ref, reason });
      record.sourceFields.__unresolvedParent = ref;
      const note = `Excel haftalık bağlantısı: ${ref}`;
      if (!record.description.split("\n").includes(note))
        record.description = [record.description, note]
          .filter(Boolean)
          .join("\n");
    }
  }
  if (report.unresolvedLinks)
    warnings.push(
      `${report.unresolvedLinks} günlük işin haftalık hedef bağlantısı kesinleştirilemedi. Asıl bağlantı metinleri notlarda ve kaynak alanlarında korundu; bu işleri düzenleyerek hedef seçebilirsiniz.`,
    );
  if (!records.length)
    throw new Error(
      `Aktarılabilir kayıt bulunamadı. Excel'de Günlük işler, Haftalık plan veya diğer takip sekmelerinden biri ve Başlık / İş / Görev / Konu / Hedef sütunu bulunmalıdır.${warnings.length ? ` ${warnings.join(" ")}` : ""}`,
    );
  return { records, warnings, sheets, skippedRows, report };
}

export async function parseExcelFile(file) {
  if (file?.name && /\.xls$/i.test(file.name))
    throw new Error(
      "Eski .xls biçimi desteklenmiyor. Dosyayı Excel’de .xlsx olarak kaydedip yeniden seçin.",
    );
  if (file?.size > MAX_FILE_BYTES)
    throw new Error(
      "Excel dosyası en fazla 20 MB olabilir. Dosyayı daha küçük parçalara ayırarak aktarın.",
    );
  let data;
  if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) data = file;
  else if (file && typeof file.arrayBuffer === "function")
    data = await file.arrayBuffer();
  else throw new Error("Bir Excel dosyası seçin (.xlsx veya .xlsm).");
  if (data.byteLength > MAX_FILE_BYTES)
    throw new Error(
      "Excel dosyası en fazla 20 MB olabilir. Dosyayı daha küçük parçalara ayırarak aktarın.",
    );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new Error(
      "Excel dosyası okunamadı. Geçerli ve şifresiz bir .xlsx veya .xlsm dosyası seçin. Eski .xls dosyalarını önce Excel’de .xlsx olarak kaydedin.",
    );
  }
  return parseWorkbook(workbook);
}

const EXPORT_COLUMNS = [
  ["ID", "id"],
  ["Başlık", "title"],
  ["Açıklama", "description"],
  ["Durum", "status"],
  ["Öncelik", "priority"],
  ["Teslim tarihi", "dueDate"],
  ["Kayıt Tarihi", "sourceDate"],
  ["Dönem", "periodKey"],
  ["Sorumlu", "owner"],
  ["Haftalık hedef ID", "parentId"],
  ["Sonraki Aksiyon", "nextAction"],
  ["Kategori", "category"],
  ["İş Tipi", "workType"],
  ["Engel", "blocked"],
  ["Ölçülebilir Çıktı", "metric"],
  ["Hedef Değer", "targetValue"],
  ["Mevcut Değer", "currentValue"],
  ["Devret", "carryForward"],
  ["Sapma / Neden", "variance"],
  ["Katılımcılar", "participants"],
  ["Alınan Karar", "decision"],
  ["Kimden Bekleniyor?", "expectedFrom"],
  ["Son Takip Tarihi", "lastFollowUpDate"],
  ["Oluşturulma", "createdAt"],
  ["Güncelleme", "updatedAt"],
  ["Kaynak Alanlar JSON", "sourceFields"],
];

export function buildWorkbook(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "İş Takip";
  for (const [type, meta] of Object.entries(TYPES)) {
    const worksheet = workbook.addWorksheet(meta.label);
    worksheet.addRow(EXPORT_COLUMNS.map(([label]) => label));
    for (const record of records.filter((item) => item.type === type)) {
      worksheet.addRow(
        EXPORT_COLUMNS.map(([, key]) => {
          if (key === "status")
            return (
              STATUSES[statusForDisplay(record.status)]?.label || record.status
            );
          if (key === "priority")
            return PRIORITIES[record.priority]?.label || record.priority;
          if (key === "sourceFields")
            return JSON.stringify(record.sourceFields || {});
          if (key === "blocked" || key === "carryForward")
            return record[key] ? "Evet" : "Hayır";
          return record[key] ?? "";
        }),
      );
    }
    EXPORT_COLUMNS.forEach(([, key], index) => {
      worksheet.getColumn(index + 1).width = [
        "title",
        "description",
        "sourceFields",
      ].includes(key)
        ? 45
        : 22;
    });
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  return workbook;
}

export async function exportExcel(records) {
  const data = await buildWorkbook(records).xlsx.writeBuffer();
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `is-takip-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
