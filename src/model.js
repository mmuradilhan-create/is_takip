import { normalizeWorkLog } from "./work-journal.js";
import { normalizeDetailText } from "./record-details.js";
import { normalizeDailyWorkContext } from "./daily-context.js";
import { normalizeWaitingReason } from "./waiting-state.js";
import { goalHierarchyProgress, parentGoalType } from "./goal-hierarchy.js";
import {
  normalizeFollowUpDate,
  normalizeFollowUpLog,
  normalizeLatestUpdate,
} from "./waiting-followup.js";

export const TYPES = {
  daily: { label: "Günlük işler" },
  weekly: { label: "Haftalık plan" },
  monthly: { label: "Aylık hedefler" },
  yearly: { label: "Senelik hedefler" },
  meeting: { label: "Toplantı aksiyonları" },
  waiting: { label: "Bekleyen konular" },
};

export const STATUSES = {
  planned: { label: "Planlandı" },
  in_progress: { label: "Devam ediyor" },
  waiting: { label: "Bekliyor" },
  completed: { label: "Tamamlandı" },
  partially_completed: { label: "Kısmi tamamlandı" },
  transferred: { label: "Aktarıldı" },
  follow_up: { label: "Takipte" },
  waiting_response: { label: "Cevap bekleniyor" },
  cancelled: { label: "İptal edildi" },
};

const GOAL_TYPES = new Set(["weekly", "monthly", "yearly"]);

// Current UI choices stay separate from historical keys accepted by backups.
export const TYPE_STATUSES = {
  daily: {
    planned: { label: "Yapılacak" },
    in_progress: { label: "Devam ediyor" },
    waiting: { label: "Beklemede" },
    completed: { label: "Tamamlandı" },
    cancelled: { label: "İptal" },
  },
  weekly: {
    planned: { label: "Yapılacak" },
    in_progress: { label: "Devam ediyor" },
    completed: { label: "Tamamlandı" },
    cancelled: { label: "İptal" },
  },
  monthly: {
    planned: { label: "Yapılacak" },
    in_progress: { label: "Devam ediyor" },
    completed: { label: "Tamamlandı" },
    cancelled: { label: "İptal" },
  },
  yearly: {
    planned: { label: "Yapılacak" },
    in_progress: { label: "Devam ediyor" },
    completed: { label: "Tamamlandı" },
    cancelled: { label: "İptal" },
  },
  meeting: {
    planned: { label: "Planlanacak" },
    in_progress: { label: "Açık" },
    completed: { label: "Kapandı" },
  },
  waiting: {
    planned: { label: "Açık" },
    follow_up: { label: "Takipte" },
    waiting_response: { label: "Cevap bekleniyor" },
    completed: { label: "Kapandı" },
  },
};

/** Fold a retired display state without rewriting a saved record's raw key. */
export function statusForDisplay(status, type) {
  if (type === "meeting") {
    if (status === "planned") return "planned";
    return ["completed", "cancelled", "transferred"].includes(status)
      ? "completed"
      : "in_progress";
  }
  return status === "partially_completed" ? "in_progress" : status;
}

export function statusLabel(type, status) {
  status = statusForDisplay(status, type);
  if (type === "weekly" && status === "transferred") return "Arşivlendi";
  if ((GOAL_TYPES.has(type) || type === "meeting") && status === "waiting")
    return "Beklemede";
  return (
    TYPE_STATUSES[type]?.[status]?.label || STATUSES[status]?.label || status
  );
}

/** Historical and derived states stay readable without becoming UI choices. */
export function isStatusSelectable(type, status) {
  if (type === "meeting") return Object.hasOwn(TYPE_STATUSES.meeting, status);
  const displayed = statusForDisplay(status);
  return (
    Object.hasOwn(TYPE_STATUSES, type) &&
    Object.hasOwn(STATUSES, displayed) &&
    !(GOAL_TYPES.has(type) && displayed === "waiting")
  );
}

export function statusesForType(type, extraStatuses = []) {
  const statuses = Object.fromEntries(
    Object.entries(TYPE_STATUSES[type] || {}).map(([key, value]) => [
      key,
      { ...value },
    ]),
  );
  if (type === "meeting") return statuses;
  // Older records can expose a current alias while keeping their stored key.
  // Historical keys remain readable/filterable for existing records. Assignment
  // controls must also apply isStatusSelectable before offering a transition.
  for (const rawStatus of extraStatuses) {
    const status = statusForDisplay(rawStatus);
    if (Object.hasOwn(STATUSES, status) && !Object.hasOwn(statuses, status)) {
      statuses[status] = { label: statusLabel(type, status) };
    }
  }
  return statuses;
}

export const PRIORITIES = {
  low: { label: "Düşük" },
  normal: { label: "Normal" },
  high: { label: "Yüksek" },
  urgent: { label: "Acil" },
};

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
}

function timestamp(value, fallback) {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string" && value.trim()
        ? new Date(value)
        : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : fallback;
}

function optionalNumber(value, label) {
  if (value == null || value === "") return null;
  const number =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number))
    throw new Error(`${label} geçerli bir sayı olmalıdır.`);
  return number;
}

function boolean(value) {
  return (
    value === true ||
    value === 1 ||
    ["true", "1", "evet", "yes"].includes(
      String(value).trim().toLocaleLowerCase("tr-TR"),
    )
  );
}

export function createRecord(input = {}) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("İş veya hedef başlığı boş bırakılamaz.");
  const type = input.type || "daily";
  if (!Object.hasOwn(TYPES, type)) throw new Error("Geçersiz kayıt türü.");
  const dueDate = input.dueDate ? String(input.dueDate) : "";
  if (dueDate && !validDate(dueDate))
    throw new Error("Teslim tarihi geçerli bir tarih olmalıdır.");
  const now = new Date().toISOString();
  for (const key of ["sourceDate", "lastFollowUpDate"]) {
    if (input[key] && !validDate(String(input[key])))
      throw new Error("Kayıt ve takip tarihleri geçerli bir tarih olmalıdır.");
  }
  if (
    input.sourceFields != null &&
    (typeof input.sourceFields !== "object" ||
      Array.isArray(input.sourceFields))
  )
    throw new Error("Excel kaynak alanları geçerli bir nesne olmalıdır.");
  const record = {
    id: input.id ? String(input.id) : crypto.randomUUID(),
    type,
    title,
    description: String(input.description ?? "").trim(),
    status: Object.hasOwn(STATUSES, input.status) ? input.status : "planned",
    priority: Object.hasOwn(PRIORITIES, input.priority)
      ? input.priority
      : "normal",
    dueDate,
    parentId: input.parentId ? String(input.parentId) : null,
    owner: String(input.owner ?? "").trim(),
    createdAt: timestamp(input.createdAt, now),
    updatedAt: timestamp(input.updatedAt, now),
    sourceDate: input.sourceDate ? String(input.sourceDate) : "",
    periodKey: String(input.periodKey ?? "").trim(),
    nextAction: String(input.nextAction ?? "").trim(),
    category: String(input.category ?? "").trim(),
    workType: String(input.workType ?? "").trim(),
    blocked: boolean(input.blocked),
    metric: String(input.metric ?? "").trim(),
    targetValue: optionalNumber(input.targetValue, "Hedef değer"),
    currentValue: optionalNumber(input.currentValue, "Mevcut değer"),
    carryForward: boolean(input.carryForward),
    variance: String(input.variance ?? "").trim(),
    participants: String(input.participants ?? "").trim(),
    decision: String(input.decision ?? "").trim(),
    expectedFrom: String(input.expectedFrom ?? "").trim(),
    lastFollowUpDate: input.lastFollowUpDate
      ? String(input.lastFollowUpDate)
      : "",
    sourceFields: input.sourceFields
      ? JSON.parse(JSON.stringify(input.sourceFields))
      : {},
  };
  // Keep legacy records byte-for-byte canonical so their undo signatures stay
  // valid. A historical journal also survives a later change of record type.
  if (Object.hasOwn(input, "workLog"))
    record.workLog = normalizeWorkLog(input.workLog);
  if (Object.hasOwn(input, "workContext")) {
    record.workContext = normalizeDailyWorkContext(input.workContext);
    if (type === "daily" && record.workContext === "ad_hoc" && record.parentId)
      throw new Error("Anlık iş bir haftalık hedefe bağlanamaz.");
  }
  for (const key of ["projectCode", "blockReason", "cancelReason"])
    if (Object.hasOwn(input, key))
      record[key] = normalizeDetailText(input[key], key);
  if (Object.hasOwn(input, "waitingReason"))
    record.waitingReason = normalizeWaitingReason(input.waitingReason);
  if (Object.hasOwn(input, "nextFollowUpDate"))
    record.nextFollowUpDate = normalizeFollowUpDate(
      input.nextFollowUpDate,
      "Sonraki takip tarihi",
    );
  if (Object.hasOwn(input, "latestUpdate"))
    record.latestUpdate = normalizeLatestUpdate(input.latestUpdate);
  if (Object.hasOwn(input, "followUpLog"))
    record.followUpLog = normalizeFollowUpLog(input.followUpLog);
  if (Object.hasOwn(input, "goalParentId")) {
    if (input.goalParentId !== null && typeof input.goalParentId !== "string")
      throw new Error("Üst hedef bağlantısı geçerli bir kimlik olmalıdır.");
    record.goalParentId = input.goalParentId?.trim() || null;
    if (record.goalParentId) {
      if (!["weekly", "monthly"].includes(type))
        throw new Error(
          "Yalnızca haftalık ve aylık hedefler üst hedefe bağlanabilir.",
        );
      if (record.goalParentId === record.id)
        throw new Error("Bir hedef kendisine bağlanamaz.");
    }
  }
  if (Object.hasOwn(input, "focusDate")) {
    if (input.focusDate !== null && typeof input.focusDate !== "string")
      throw new Error("Odak tarihi geçerli bir tarih veya boş olmalıdır.");
    const date = input.focusDate?.trim() || null;
    record.focusDate = date ? normalizeFollowUpDate(date, "Odak tarihi") : null;
  }
  return record;
}

export function emptyStore() {
  return { version: 1, records: [] };
}

export function validateStore(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.records)) {
    throw new Error("Geçerli bir iş takip yedeği seçin (sürüm 1).");
  }
  const seen = new Set();
  const records = data.records.map((record, index) => {
    const row = index + 1;
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.id !== "string" ||
      !record.id.trim()
    ) {
      throw new Error(`${row}. kaydın kimliği eksik veya geçersiz.`);
    }
    if (seen.has(record.id))
      throw new Error(`Tekrarlanan kayıt kimliği: ${record.id}`);
    seen.add(record.id);
    if (
      !Object.hasOwn(TYPES, record.type) ||
      !Object.hasOwn(STATUSES, record.status) ||
      !Object.hasOwn(PRIORITIES, record.priority)
    ) {
      throw new Error(`${row}. kayıtta geçersiz tür, durum veya öncelik var.`);
    }
    if (typeof record.title !== "string" || !record.title.trim())
      throw new Error(`${row}. kaydın başlığı eksik.`);
    if (record.parentId != null && typeof record.parentId !== "string")
      throw new Error(`${row}. kaydın haftalık bağlantısı geçersiz.`);
    return createRecord(record);
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) {
    if (
      record.parentId &&
      (record.type !== "daily" || byId.get(record.parentId)?.type !== "weekly")
    ) {
      throw new Error(
        `“${record.title}” kaydının bağlı olduğu haftalık plan bulunamadı.`,
      );
    }
    if (
      record.goalParentId &&
      byId.get(record.goalParentId)?.type !== parentGoalType(record.type)
    )
      throw new Error(
        `“${record.title}” kaydının bağlı olduğu üst hedef bulunamadı veya türü geçersiz.`,
      );
  }
  return { version: 1, records };
}

export function isOverdue(record, today = localDate()) {
  return Boolean(
    record.dueDate &&
      record.dueDate < today &&
      !["completed", "cancelled", "transferred"].includes(record.status),
  );
}

export function dashboardStats(records, today = localDate()) {
  const completed = records.filter(
    (record) => record.status === "completed",
  ).length;
  return {
    total: records.length,
    active: records.filter(
      (record) =>
        !["completed", "cancelled", "transferred"].includes(record.status),
    ).length,
    completed,
    overdue: records.filter((record) => isOverdue(record, today)).length,
    completionRate: records.length
      ? Math.round((completed / records.length) * 100)
      : 0,
  };
}

export function getWeeklyProgress(weeklyId, records) {
  const children = records.filter(
    (record) =>
      record.type === "daily" &&
      record.parentId === weeklyId &&
      !["cancelled", "transferred"].includes(record.status),
  );
  const completed = children.filter(
    (record) => record.status === "completed",
  ).length;
  return {
    total: children.length,
    completed,
    percent: children.length
      ? Math.round((completed / children.length) * 100)
      : 0,
  };
}

export function goalProgress(record, records = []) {
  return goalHierarchyProgress(record, records);
}
