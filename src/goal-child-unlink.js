import { parentGoalType } from "./goal-hierarchy.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);
const validId = (value) => typeof value === "string" && Boolean(value.trim());

/** Detach one current relationship without changing the work or its lifecycle. */
export function unlinkGoalChild(
  records,
  parentId,
  childId,
  { updatedAt } = {},
) {
  if (
    !Array.isArray(records) ||
    !validId(parentId) ||
    !validId(childId) ||
    parentId === childId
  )
    throw new Error("Hedef bağlantısı doğrulanamadı.");
  if (
    typeof updatedAt !== "string" ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    new Date(updatedAt).toISOString() !== updatedAt
  )
    throw new Error("Bağlantı değişikliği için geçerli bir zaman gereklidir.");
  const parents = records.filter((record) => record?.id === parentId);
  const children = records.filter((record) => record?.id === childId);
  if (parents.length !== 1 || children.length !== 1)
    throw new Error("Bu hedef veya bağlı kayıt artık bulunamıyor.");
  const parent = parents[0];
  const child = children[0];
  if (!GOALS.has(parent.type) || parentGoalType(child.type) !== parent.type)
    throw new Error("Bu kayıt bu hedefe bağlanamaz.");
  const field = child.type === "daily" ? "parentId" : "goalParentId";
  if (!child[field]) {
    if (child.type !== "daily" || child.workContext === "ad_hoc")
      return records;
    throw new Error(
      "Bu kaydın hedef bağlantısı değişti. Güncel kaydı kontrol et.",
    );
  }
  if (child[field] !== parentId)
    throw new Error(
      "Bu kaydın hedef bağlantısı değişti. Güncel kaydı kontrol et.",
    );
  const detached = {
    ...child,
    [field]: null,
    ...(child.type === "daily" ? { workContext: "ad_hoc" } : {}),
    updatedAt,
  };
  return records.map((record) => (record === child ? detached : record));
}
