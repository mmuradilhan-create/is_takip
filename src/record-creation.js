import {
  createRecord,
  localDate,
  TYPES,
  TYPE_STATUSES,
  PRIORITIES,
  validateStore,
} from "./model.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";
import { parentGoalType } from "./goal-hierarchy.js";
import {
  buildMeetingActions,
  linkedAction,
  syncActionLinks,
} from "./action-links.js";
import { normalizeFollowUpDate } from "./waiting-followup.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);

function timestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60
  ) {
    try {
      normalizeFollowUpDate(value.slice(0, 10), "Kayıt tarihi");
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      /* Reject impossible calendar dates before JavaScript normalizes them. */
    }
  }
  throw new Error("Yeni kaydın kayıt zamanı geçersiz.");
}

function optionalNumber(value, label) {
  if (value == null || (typeof value === "string" && !value.trim()))
    return null;
  if (!["string", "number"].includes(typeof value))
    throw new Error(`${label} geçerli bir sayı olmalıdır.`);
  const result =
    typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  if (!Number.isFinite(result) || result < 0)
    throw new Error(`${label} sıfır veya pozitif bir sayı olmalıdır.`);
  return result;
}

function validateParent(records, id, type) {
  if (id == null || id === "") return;
  if (typeof id !== "string") throw new Error("Hedef bağlantısı geçersiz.");
  const parent = records.find((record) => record.id === id);
  if (parent?.type !== type)
    throw new Error(
      "Bağlanacak üst hedef bulunamıyor veya türü değişmiş. Geçerli bir hedef seç.",
    );
}

function cleanNewInput(records, input, { numeric, now, today }) {
  const type = input.type ?? "daily";
  if (!Object.hasOwn(TYPES, type)) throw new Error("Geçersiz yeni kayıt türü.");
  const status = input.status ?? "planned";
  const priority = input.priority ?? "normal";
  if (!Object.hasOwn(TYPE_STATUSES[type], status))
    throw new Error("Yeni kayıt için geçerli bir durum seç.");
  if (!Object.hasOwn(PRIORITIES, priority))
    throw new Error("Yeni kayıt için geçerli bir öncelik seç.");
  if (
    Object.hasOwn(input, "id") &&
    (typeof input.id !== "string" || !input.id.trim())
  )
    throw new Error("Yeni kaydın kimliği geçersiz.");
  if (input.id && records.some((record) => record.id === input.id))
    throw new Error("Bu kayıt kimliği zaten kullanılıyor.");
  if (
    input.sourceFields != null &&
    (typeof input.sourceFields !== "object" ||
      Array.isArray(input.sourceFields))
  )
    throw new Error("Yeni kaydın kaynak alanları geçersiz.");
  const clean = {
    ...input,
    type,
    status,
    priority,
    sourceDate: input.sourceDate ?? today,
    dueDate: type === "yearly" ? "" : (input.dueDate ?? ""),
    createdAt: now,
    updatedAt: now,
  };
  for (const field of ["workLog", "followUpLog"]) {
    if (
      input[field] != null &&
      (!Array.isArray(input[field]) || input[field].length)
    )
      throw new Error(
        "Yeni kayıt oluşturmak gerçekleşmiş çalışma veya takip geçmişi eklemez.",
      );
    delete clean[field];
  }
  if (input.lastFollowUpDate)
    throw new Error(
      "Gerçekleşen takip, kayıt oluşturulduktan sonra Takip ettim ile eklenir.",
    );
  clean.lastFollowUpDate = "";
  if (GOALS.has(type)) {
    const key = input.periodKey;
    const period =
      key == null || key === ""
        ? makePlanningPeriod(type, today)
        : shiftPlanningPeriod({ type, key }, 0);
    clean.periodKey = period.key;
  }
  if (numeric && !GOALS.has(type))
    throw new Error("Sayısal ölçüm yalnızca hedefler için seçilebilir.");
  if (!numeric) {
    clean.metric = "";
    clean.targetValue = null;
    clean.currentValue = null;
  } else {
    clean.metric = String(input.metric ?? "").trim();
    clean.targetValue = optionalNumber(input.targetValue, "Hedef değer");
    clean.currentValue =
      optionalNumber(input.currentValue, "Mevcut değer") ?? 0;
  }
  if (clean.parentId && type !== "daily")
    throw new Error("Yalnızca günlük iş bir haftalık hedefe bağlanabilir.");
  if (type === "daily") {
    validateParent(records, clean.parentId, "weekly");
    if (!Object.hasOwn(input, "workContext"))
      clean.workContext = clean.parentId ? "" : "ad_hoc";
  }
  if (clean.goalParentId) {
    if (!["weekly", "monthly"].includes(type))
      throw new Error("Bu kayıt bir üst hedefe bağlanamaz.");
    validateParent(records, clean.goalParentId, parentGoalType(type));
  }
  return clean;
}

function sourceDefaults(source, type) {
  return {
    type,
    title: source.title,
    priority: source.type === "meeting" ? "normal" : source.priority,
    dueDate: source.type === "meeting" ? "" : source.dueDate,
    nextAction: source.type === "meeting" ? "" : source.nextAction,
    owner: type === "daily" && source.type !== "meeting" ? source.owner : "",
    expectedFrom: "",
    status: type === "waiting" ? "waiting_response" : "planned",
    description: [
      source.description,
      source.decision ? `Toplantı kararı: ${source.decision}` : "",
      source.expectedFrom ? `Beklenen kişi: ${source.expectedFrom}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function objectInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Yeni kayıt bilgileri geçerli bir nesne olmalıdır.");
}

/** Prepare one complete creation transaction; opening a form never calls this. */
export function prepareRecordCreation(
  records,
  input,
  {
    sourceId = "",
    meetingRoute = "",
    routeDrafts = {},
    numeric = false,
    now = new Date(),
  } = {},
) {
  if (!Array.isArray(records))
    throw new TypeError("Yeni kayıt için kayıt listesi gereklidir.");
  objectInput(input);
  const requestedType = input.type ?? "daily";
  let source = null;
  if (sourceId) {
    source = records.find((record) => record.id === sourceId);
    if (!source || !["meeting", "waiting"].includes(source.type))
      throw new Error("Kaynak kayıt artık bulunamıyor veya türü değişmiş.");
    if (
      !["daily", "waiting"].includes(requestedType) ||
      (source.type === "waiting" && requestedType !== "daily")
    )
      throw new Error("Kaynak kayıt için geçerli bir takip akışı seç.");
    const existing = linkedAction(source.id, records, requestedType);
    if (existing)
      return {
        records,
        record: existing,
        createdTypes: [],
        reusedTypes: [existing.type],
        reused: true,
      };
  }
  if (
    !["", "daily", "waiting", "both"].includes(meetingRoute) ||
    (meetingRoute && (source || requestedType !== "meeting"))
  )
    throw new Error("Yeni kayıt için geçerli bir toplantı yönlendirmesi seç.");
  const editedAt = timestamp(now);
  const today = localDate(new Date(editedAt));
  const values = source
    ? { ...sourceDefaults(source, requestedType), ...input }
    : input;
  const clean = cleanNewInput(records, values, {
    numeric,
    now: editedAt,
    today,
  });
  if (!source && clean.sourceFields?.__followupSource)
    throw new Error(
      "Kaynak bağlantısı yalnızca ilgili toplantı veya bekleyen konudan oluşturulabilir.",
    );
  if (source)
    clean.sourceFields = {
      ...clean.sourceFields,
      __followupSource: { recordId: source.id, type: source.type },
    };
  const record = createRecord(clean);
  let result = [...records, record];
  let createdTypes = [record.type];
  if (meetingRoute === "both") {
    const preparedDrafts = {};
    for (const type of ["daily", "waiting"]) {
      const draft = routeDrafts?.[type] ?? {};
      objectInput(draft);
      if (Object.hasOwn(draft, "type") && draft.type !== type)
        throw new Error("Toplantı akışının kayıt türü geçersiz.");
      preparedDrafts[type] = cleanNewInput(
        result,
        { ...sourceDefaults(record, type), ...draft, type },
        { numeric: false, now: editedAt, today },
      );
    }
    const pair = buildMeetingActions(result, record.id, preparedDrafts, {
      now: editedAt,
    });
    result = pair.records;
    createdTypes = [...createdTypes, ...pair.createdTypes];
  } else if (meetingRoute) {
    const draft = routeDrafts?.[meetingRoute] ?? {};
    objectInput(draft);
    if (Object.hasOwn(draft, "type") && draft.type !== meetingRoute)
      throw new Error("Toplantı akışının kayıt türü geçersiz.");
    const routeInput = cleanNewInput(
      result,
      { ...sourceDefaults(record, meetingRoute), ...draft, type: meetingRoute },
      { numeric: false, now: editedAt, today },
    );
    routeInput.sourceFields = {
      ...routeInput.sourceFields,
      __followupSource: { recordId: record.id, type: "meeting" },
    };
    result.push(createRecord(routeInput));
    createdTypes.push(meetingRoute);
  }
  result = syncActionLinks(records, result);
  validateStore({ version: 1, records: result });
  return {
    records: result,
    record: result.find((item) => item.id === record.id),
    createdTypes,
    reusedTypes: [],
    reused: false,
  };
}
