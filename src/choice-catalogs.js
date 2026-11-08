import { learnedChoices } from "./record-details.js";

export const CHOICE_LIMITS = Object.freeze({ projectCode: 120, workType: 120 });
const LABELS = { projectCode: "Proje kodu", workType: "İş türü" };
const KINDS = Object.keys(CHOICE_LIMITS);
const key = (value) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
const caption = (value) => value.normalize("NFKC").trim();

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validValues(values, limit = Infinity) {
  if (!Array.isArray(values)) return false;
  const seen = new Set();
  for (let index = 0; index < values.length; index++) {
    if (!Object.hasOwn(values, index)) return false;
    const value = values[index];
    if (
      typeof value !== "string" ||
      !value ||
      value !== caption(value) ||
      value.length > limit ||
      seen.has(key(value))
    )
      return false;
    seen.add(key(value));
  }
  return true;
}

/** Explicit catalogs are strict; absent catalogs remain absent in preferences. */
export function validChoiceLists(value) {
  if (
    !plainObject(value) ||
    Object.keys(value).length !== KINDS.length ||
    !KINDS.every((kind) => Object.hasOwn(value, kind))
  )
    return false;
  return KINDS.every((kind) => {
    const list = value[kind];
    if (
      !plainObject(list) ||
      Object.keys(list).length !== 2 ||
      !Object.hasOwn(list, "added") ||
      !Object.hasOwn(list, "hidden") ||
      !validValues(list.added, CHOICE_LIMITS[kind]) ||
      !validValues(list.hidden)
    )
      return false;
    const hidden = new Set(list.hidden.map(key));
    return list.added.every((value) => !hidden.has(key(value)));
  });
}

export function normalizeChoiceLists(value) {
  if (value === undefined)
    return Object.fromEntries(
      KINDS.map((kind) => [kind, { added: [], hidden: [] }]),
    );
  if (!validChoiceLists(value))
    throw new Error("Proje ve iş türü listeleri geçersiz.");
  return Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      { added: [...value[kind].added], hidden: [...value[kind].hidden] },
    ]),
  );
}

function assertKind(kind) {
  if (!Object.hasOwn(CHOICE_LIMITS, kind))
    throw new Error("Geçerli bir proje veya iş türü listesi seç.");
}

function newValue(kind, value) {
  assertKind(kind);
  if (typeof value !== "string" || !caption(value))
    throw new Error(`${LABELS[kind]} boş bırakılamaz.`);
  const clean = caption(value);
  if (clean.length > CHOICE_LIMITS[kind])
    throw new Error(
      `${LABELS[kind]} en fazla ${CHOICE_LIMITS[kind]} karakter olabilir.`,
    );
  return clean;
}

/** Manual captions override learned spelling; hidden values stay hidden. */
export function availableChoices(kind, records, choiceLists) {
  assertKind(kind);
  const list = normalizeChoiceLists(choiceLists)[kind];
  const hidden = new Set(list.hidden.map(key));
  const values = new Map();
  for (const value of learnedChoices(records, kind))
    values.set(key(value), value);
  for (const value of list.added) values.set(key(value), value);
  return [...values]
    .filter(([identity]) => !hidden.has(identity))
    .map(([, value]) => value)
    .sort((a, b) =>
      a.localeCompare(b, "tr", { sensitivity: "base", numeric: true }),
    );
}

function existingValue(kind, value, records, choiceLists) {
  assertKind(kind);
  const found =
    typeof value === "string" &&
    availableChoices(kind, records, choiceLists).find(
      (current) => key(current) === key(value),
    );
  if (!found)
    throw new Error("Seçenek artık listede yok. Güncel listeyi kontrol et.");
  return caption(found);
}

/** Catalog edits never rename, clear, or otherwise modify saved task fields. */
export function addChoice(kind, value, records, choiceLists) {
  const clean = newValue(kind, value);
  if (
    availableChoices(kind, records, choiceLists).some(
      (item) => key(item) === key(clean),
    )
  )
    throw new Error("Bu seçenek listede zaten var.");
  const next = normalizeChoiceLists(choiceLists);
  next[kind].hidden = next[kind].hidden.filter(
    (item) => key(item) !== key(clean),
  );
  next[kind].added.push(clean);
  return next;
}

export function renameChoice(kind, value, replacement, records, choiceLists) {
  const oldValue = existingValue(kind, value, records, choiceLists);
  const clean = newValue(kind, replacement);
  const oldKey = key(oldValue);
  const nextKey = key(clean);
  if (
    oldKey !== nextKey &&
    availableChoices(kind, records, choiceLists).some(
      (item) => key(item) === nextKey,
    )
  )
    throw new Error("Bu adla bir seçenek zaten var.");
  const next = normalizeChoiceLists(choiceLists);
  const list = next[kind];
  list.added = list.added.filter((item) => key(item) !== oldKey);
  list.hidden = list.hidden.filter((item) => key(item) !== nextKey);
  if (oldKey !== nextKey) list.hidden.push(oldValue);
  list.added.push(clean);
  return next;
}

export function removeChoice(kind, value, records, choiceLists) {
  const oldValue = existingValue(kind, value, records, choiceLists);
  const next = normalizeChoiceLists(choiceLists);
  next[kind].added = next[kind].added.filter(
    (item) => key(item) !== key(oldValue),
  );
  next[kind].hidden.push(oldValue);
  return next;
}

/** Restore a hidden legacy name without creating an overlong manual value. */
export function restoreChoice(kind, value, records, choiceLists) {
  assertKind(kind);
  const next = normalizeChoiceLists(choiceLists);
  const hidden =
    typeof value === "string" &&
    next[kind].hidden.find((item) => key(item) === key(value));
  if (!hidden) throw new Error("Seçenek gizlenenler listesinde bulunamadı.");
  if (hidden.length <= CHOICE_LIMITS[kind])
    return addChoice(kind, hidden, records, choiceLists);
  if (!learnedChoices(records, kind).some((item) => key(item) === key(hidden)))
    throw new Error(
      `Bu eski seçenek artık kayıtlarda yok. En fazla ${CHOICE_LIMITS[kind]} karakterlik bir adla yeniden ekleyebilirsin.`,
    );
  next[kind].hidden = next[kind].hidden.filter(
    (item) => key(item) !== key(hidden),
  );
  return next;
}
