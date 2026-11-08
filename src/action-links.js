const SOURCE_TYPES = new Set(["meeting", "waiting"]);
const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function relation(record) {
  const link = record?.sourceFields?.__followupSource;
  return link && typeof link.recordId === "string" && link.recordId.trim()
    ? link
    : null;
}

function indexRecords(records) {
  if (!Array.isArray(records))
    throw new TypeError("Bağlı aksiyonlar için kayıt listesi gereklidir.");
  const byId = new Map();
  const bySource = new Map();
  for (const record of records) {
    if (!record || typeof record.id !== "string") continue;
    if (byId.has(record.id))
      throw new Error("Tekrarlanan aksiyon kimliği var.");
    byId.set(record.id, record);
    const link = relation(record);
    if (!link) continue;
    if (!bySource.has(link.recordId)) bySource.set(link.recordId, []);
    bySource.get(link.recordId).push(record);
  }
  return { byId, bySource };
}

function directTargets(sourceId, index) {
  // Deleting an origin keeps its marker on historical targets. It no longer
  // defines a live route or constrains a later change of target type.
  if (!index.byId.has(sourceId)) return [];
  const targets = index.bySource.get(sourceId) || [];
  const types = new Set();
  const source = index.byId.get(sourceId);
  for (const target of targets) {
    if (target.id === sourceId)
      throw new Error("Bir aksiyon kendisine bağlanamaz.");
    if (!["daily", "waiting"].includes(target.type))
      throw new Error(
        "Bağlı aksiyonun kayıt türü geçersiz. Önce bağlantıyı düzenle.",
      );
    if (source?.type === "waiting" && target.type !== "daily")
      throw new Error(
        "Bekleyen konuya yalnızca bir günlük temas işi bağlanabilir.",
      );
    if (types.has(target.type))
      throw new Error(
        "Bu aksiyona aynı türde birden fazla kayıt bağlı. Önce bağlantıları düzenle.",
      );
    types.add(target.type);
  }
  return targets
    .slice()
    .sort(
      (first, second) =>
        Number(first.type === "waiting") - Number(second.type === "waiting"),
    );
}

function checkPath(sourceId, index) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (!index.byId.has(id)) return;
    if (visiting.has(id))
      throw new Error("Aksiyon bağlantıları bir döngü oluşturuyor.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of index.bySource.get(id) || []) {
      if (target.id === id)
        throw new Error("Bir aksiyon kendisine bağlanamaz.");
      visit(target.id);
    }
    visiting.delete(id);
    visited.add(id);
    directTargets(id, index);
  }
  visit(sourceId);
}

/** A meeting may have one daily action and one separate external expectation. */
export function linkedActions(sourceId, records) {
  const index = indexRecords(records);
  checkPath(sourceId, index);
  return directTargets(sourceId, index);
}

/** Typed lookup never substitutes an existing target of the other route. */
export function linkedAction(sourceId, records, type) {
  const targets = linkedActions(sourceId, records);
  if (type !== undefined) {
    if (!["daily", "waiting"].includes(type))
      throw new Error("Geçerli bir aksiyon türü seçin.");
    return targets.find((target) => target.type === type) || null;
  }
  return targets.length === 1 ? targets[0] : null;
}

/** An orphaned historical origin remains metadata, never a new source record. */
export function sourceForTarget(target, records) {
  const link = relation(target);
  if (!link) return null;
  const index = indexRecords(records);
  const source = index.byId.get(link.recordId);
  if (!source || !SOURCE_TYPES.has(source.type)) return null;
  checkPath(source.id, index);
  return source;
}

function sourceStatus(target) {
  if (target.status === "cancelled") return "cancelled";
  if (CLOSED.has(target.status)) return "completed";
  return ["follow_up", "waiting_response"].includes(target.status)
    ? "waiting"
    : statusForDisplay(target.status);
}

function aggregateStatus(targets) {
  const open = targets.filter((target) => !CLOSED.has(target.status));
  if (!open.length)
    return targets.every((target) => target.status === "cancelled")
      ? "cancelled"
      : "completed";
  if (
    open.some(
      (target) =>
        target.type === "daily" &&
        statusForDisplay(target.status) === "in_progress",
    )
  )
    return "in_progress";
  if (targets.every((target) => target.status === "planned")) return "planned";
  if (
    open.some(
      (target) => target.type === "waiting" || target.status === "waiting",
    )
  )
    return "waiting";
  if (
    open.some((target) => target.status === "partially_completed") ||
    targets.some((target) =>
      ["completed", "transferred"].includes(target.status),
    )
  )
    return "in_progress";
  return sourceStatus(open[0]);
}

function projectSource(source, targets) {
  const status =
    targets.length > 1 ? aggregateStatus(targets) : sourceStatus(targets[0]);
  // The meeting owns its decision context; dates and next steps live on routes.
  return source.status === status ? source : { ...source, status };
}

function resolveSource(source, index) {
  if (!source || source.type !== "meeting") return source;
  const targets = directTargets(source.id, index);
  if (!targets.length) return source;
  return projectSource(source, targets);
}

/** View-only lifecycle projection. Loading, filtering and undo never write it. */
export function resolveActionSource(source, records) {
  if (!source || source.type !== "meeting") return source;
  const index = indexRecords(records);
  checkPath(source.id, index);
  return resolveSource(source, index);
}

function sameRecord(first, second) {
  return first === second || JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Apply the target lifecycle status to affected meeting contexts in one save.
 * Undo, backup restore and loading must bypass this explicit edit operation.
 */
export function syncActionLinks(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after))
    throw new TypeError(
      "Aksiyon eşitlemesi için iki kayıt listesi gereklidir.",
    );
  const index = indexRecords(after);
  const previous = new Map(before.map((record) => [record.id, record]));
  const changed = new Set();
  for (const record of after)
    if (!sameRecord(previous.get(record.id), record)) changed.add(record.id);
  for (const record of before)
    if (!index.byId.has(record.id)) changed.add(record.id);
  if (!changed.size) return after;

  const affected = new Set();
  const validate = new Set();
  for (const id of changed) {
    const current = index.byId.get(id);
    if (index.bySource.has(id)) validate.add(id);
    if (current?.type === "meeting" && index.bySource.has(id)) affected.add(id);
    for (const record of [current, previous.get(id)]) {
      const parentId = relation(record)?.recordId;
      if (parentId) validate.add(parentId);
      const parent = index.byId.get(parentId);
      if (parent?.type === "meeting") affected.add(parent.id);
    }
  }

  for (const id of validate) checkPath(id, index);
  const replacements = new Map();
  for (const id of affected) {
    const source = index.byId.get(id);
    checkPath(id, index);
    const resolved = resolveSource(source, index);
    if (resolved !== source) replacements.set(id, resolved);
  }
  if (!replacements.size) return after;
  return after.map((record) => replacements.get(record.id) || record);
}
import {
  createRecord,
  localDate,
  validateStore,
  statusForDisplay,
} from "./model.js";
import { normalizeFollowUpDate } from "./waiting-followup.js";

function actionTimestamp(value) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString();
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60
  ) {
    try {
      normalizeFollowUpDate(value.slice(0, 10), "Aksiyon kayıt tarihi");
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      /* An impossible calendar day must not normalize into another date. */
    }
  }
  throw new Error("Aksiyonların kayıt zamanı geçersiz.");
}

/** Build both routes only on Save; existing routes are reused without edits. */
export function buildMeetingActions(
  records,
  sourceId,
  drafts,
  { now = new Date(), idFactory } = {},
) {
  const existing = linkedActions(sourceId, records);
  const source = records.find((record) => record.id === sourceId);
  if (source?.type !== "meeting")
    throw new Error("Aksiyonlar için toplantı kaydı bulunamadı.");
  const types = ["daily", "waiting"];
  const reusedTypes = existing.map((record) => record.type);
  const createdTypes = types.filter((type) => !reusedTypes.includes(type));
  if (!createdTypes.length)
    return {
      records,
      daily: existing.find((record) => record.type === "daily"),
      waiting: existing.find((record) => record.type === "waiting"),
      createdTypes,
      reusedTypes,
    };
  const timestamp = actionTimestamp(now);
  const sourceDate = localDate(new Date(timestamp));
  const description = [
    source.description,
    source.decision ? `Toplantı kararı: ${source.decision}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const created = createdTypes.map((type) => {
    const draft = drafts?.[type];
    if (!draft || typeof draft !== "object" || Array.isArray(draft))
      throw new Error(
        `${type === "daily" ? "Günlük iş" : "Bekleyen konu"} taslağı gereklidir.`,
      );
    if (Object.hasOwn(draft, "type") && draft.type !== type)
      throw new Error("Aksiyon taslağının kayıt türü geçersiz.");
    if (
      draft.sourceFields != null &&
      (typeof draft.sourceFields !== "object" ||
        Array.isArray(draft.sourceFields))
    )
      throw new Error("Aksiyonun kaynak alanları geçersiz.");
    const id = idFactory === undefined ? draft.id : idFactory(type);
    if (id !== undefined && (typeof id !== "string" || !id.trim()))
      throw new Error("Aksiyon kimliği geçersiz.");
    return createRecord({
      title: source.title,
      priority: "normal",
      dueDate: "",
      nextAction: "",
      description,
      sourceDate,
      owner: "",
      expectedFrom: "",
      status: type === "daily" ? "planned" : "waiting_response",
      ...draft,
      ...(type === "daily" && !Object.hasOwn(draft, "workContext")
        ? { workContext: draft.parentId ? "" : "ad_hoc" }
        : {}),
      ...(id === undefined ? {} : { id }),
      type,
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceFields: {
        ...draft.sourceFields,
        __followupSource: { recordId: source.id, type: "meeting" },
      },
    });
  });
  const result = syncActionLinks(records, [...records, ...created]);
  // Check ordinary goal links too, without replacing canonical legacy objects.
  validateStore({ version: 1, records: result });
  const targets = linkedActions(source.id, result);
  return {
    records: result,
    daily: targets.find((record) => record.type === "daily"),
    waiting: targets.find((record) => record.type === "waiting"),
    createdTypes,
    reusedTypes,
  };
}
