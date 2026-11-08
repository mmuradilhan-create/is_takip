import { parentGoalType } from "./goal-hierarchy.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);
const PARENT_LABELS = {
  weekly: "Haftalık hedef",
  monthly: "Aylık hedef",
  yearly: "Senelik hedef",
};
const text = (value) => (typeof value === "string" ? value.trim() : "");
const identity = (value) =>
  text(value).normalize("NFKC").toLocaleLowerCase("tr-TR");

function humanPeriod(record) {
  try {
    return shiftPlanningPeriod({ type: record.type, key: record.periodKey }, 0)
      .label;
  } catch {
    if (record.type !== "yearly" && text(record.dueDate)) {
      try {
        return makePlanningPeriod(record.type, record.dueDate).label;
      } catch {
        // Invalid legacy dates do not supply a display period.
      }
    }
    return "";
  }
}

function recordIndex(records) {
  const index = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !text(record.id)) continue;
    // Ambiguous IDs must never produce a link to an arbitrary record.
    index.set(record.id, index.has(record.id) ? null : record);
  }
  return index;
}

/** Display actual connections and optional goal periods without changing records. */
export function recordContextParts(
  record,
  records = [],
  { showPeriod = true } = {},
) {
  if (!record) return [];
  const parts = [];
  const index = recordIndex(records);
  if (GOALS.has(record.type) && showPeriod) {
    const period = humanPeriod(record);
    if (period) parts.push({ kind: "period", text: period });
  }
  const adHoc = record.type === "daily" && record.workContext === "ad_hoc";
  const expectedParentType = parentGoalType(record.type);
  const parentId =
    record.type === "daily" ? record.parentId : record.goalParentId;
  const parent = !adHoc && expectedParentType && index.get(parentId);
  if (parent && parent.id !== record.id && parent.type === expectedParentType) {
    const role = PARENT_LABELS[parent.type];
    const title = text(parent.title);
    const context =
      !title || identity(title) === identity(record.title)
        ? humanPeriod(parent)
        : title;
    parts.push({
      kind: "parent",
      text: context ? `${role}: ${context}` : role,
      targetId: parent.id,
      targetType: parent.type,
    });
  }
  if (["daily", "waiting"].includes(record.type)) {
    const reference = record.sourceFields?.__followupSource;
    const source =
      reference && !Array.isArray(reference) && index.get(reference.recordId);
    if (
      source &&
      source.id !== record.id &&
      (source.type === "meeting" ||
        (record.type === "daily" && source.type === "waiting")) &&
      (!Object.hasOwn(reference, "type") || reference.type === source.type)
    ) {
      const title = text(source.title);
      const sameTitle = !title || identity(title) === identity(record.title);
      const phrase =
        source.type === "meeting"
          ? `Toplantıdan gelen ${record.type === "waiting" ? "takip" : "iş"}`
          : "Bekleyen konudan gelen iş";
      parts.push({
        kind: "source",
        text: sameTitle
          ? phrase
          : `${source.type === "meeting" ? "Toplantı" : "Bekleyen konu"}: ${title}`,
        targetId: source.id,
        targetType: source.type,
      });
    }
  }
  if (record.type === "meeting") {
    for (const [kind, caption] of [
      ["owner", "Sorumlu"],
      ["participants", "Katılımcılar"],
    ]) {
      const value = text(record[kind]);
      if (value) parts.push({ kind, text: `${caption}: ${value}` });
    }
  }
  return parts;
}
