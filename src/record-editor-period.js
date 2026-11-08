import { localDate } from "./model.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);
const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const weekCache = new Map();

function weeksInYear(year) {
  if (weekCache.has(year)) return weekCache.get(year);
  const result = [];
  try {
    let week = makePlanningPeriod("weekly", `${year}-01-04`);
    while (week.key.startsWith(`${year}-W`) && result.length < 53) {
      result.push(week);
      try {
        week = shiftPlanningPeriod(week, 1);
      } catch {
        break;
      }
    }
  } catch {
    // A legacy value is displayed as a hint rather than silently normalized.
  }
  weekCache.set(year, result);
  return result;
}

function selectedPeriod(type, raw) {
  try {
    if (type === "weekly" && /^\d{4}-W\d{2}$/.test(raw))
      return (
        weeksInYear(raw.slice(0, 4)).find((week) => week.key === raw) || null
      );
    const anchor =
      type === "monthly" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(raw)
        ? `${raw}-01`
        : type === "yearly" && /^\d{4}$/.test(raw)
          ? `${raw}-01-01`
          : null;
    if (anchor) {
      const period = makePlanningPeriod(type, anchor);
      if (period.key === raw) return period;
    }
  } catch {
    // Keep imported period text unchanged until a selector is explicitly used.
  }
  return null;
}

function currentYear(today) {
  const date = typeof today === "function" ? today() : today || localDate();
  const year = Number(String(date).slice(0, 4));
  return Number.isInteger(year) && year >= 1 && year <= 9999
    ? year
    : new Date().getFullYear();
}

function controlsMarkup(type, raw, today) {
  if (!GOALS.has(type)) return "";
  const selected = selectedPeriod(type, raw);
  const year = selected?.key.slice(0, 4) || "";
  const present = currentYear(today);
  const years = [
    ...new Set([
      ...Array.from({ length: 16 }, (_, index) => present - 5 + index).filter(
        (value) => value >= 1900 && value <= 9999,
      ),
      ...(year ? [Number(year)] : []),
    ]),
  ].sort((a, b) => a - b);
  const yearField = `<label class="record-editor-period-choice">Yıl<select name="editorPeriodYear" aria-label="Dönem yılı"><option value="" ${year ? "" : "selected"}>Yıl seç</option>${years.map((value) => `<option value="${String(value).padStart(4, "0")}" ${Number(year) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>`;
  const second =
    type === "weekly"
      ? `<label class="record-editor-period-choice">Hafta<select name="editorPeriodWeek" aria-label="Hafta" ${year ? "" : "disabled"}><option value="" ${selected ? "" : "selected"} disabled>Hafta seç</option>${(year ? weeksInYear(year) : []).map((week) => `<option value="${week.key.slice(-2)}" ${week.key === selected?.key ? "selected" : ""}>${escapeHtml(week.label)}</option>`).join("")}</select></label>`
      : type === "monthly"
        ? `<label class="record-editor-period-choice">Ay<select name="editorPeriodMonth" aria-label="Ay" ${year ? "" : "disabled"}><option value="" ${selected ? "" : "selected"} disabled>Ay seç</option>${MONTHS.map((month, index) => `<option value="${String(index + 1).padStart(2, "0")}" ${Number(selected?.key.slice(-2)) === index + 1 ? "selected" : ""}>${month}</option>`).join("")}</select></label>`
        : "";
  return `<div class="record-editor-period-selects${type === "yearly" ? " is-yearly" : ""}">${yearField}${second}</div>${raw && !selected ? `<span class="field-help record-editor-period-legacy">Kayıtlı dönem: ${escapeHtml(raw)}</span>` : ""}`;
}

/** The hidden value remains exact; friendly selectors only describe it. */
export function renderEditorPeriodMarkup({
  type,
  periodKey = "",
  today = localDate(),
} = {}) {
  const raw = String(periodKey ?? "");
  return `<div class="field full record-editor-period-field" data-editor-period-field><input type="hidden" name="periodKey" value="${escapeHtml(raw)}"><div data-editor-period-controls>${controlsMarkup(type, raw, today)}</div></div>`;
}

/** Only an explicit period selector change writes a new period form value. */
export function syncEditorPeriod(
  form,
  type,
  today = localDate(),
  target = null,
) {
  const input = form?.elements?.periodKey;
  const field = input?.closest?.("[data-editor-period-field]");
  const controls = field?.querySelector("[data-editor-period-controls]");
  if (!controls) return false;
  const goal = GOALS.has(type);
  const explicit =
    goal &&
    target?.closest?.("[data-editor-period-controls]") === controls &&
    ["editorPeriodYear", "editorPeriodWeek", "editorPeriodMonth"].includes(
      target.name,
    );
  if (explicit) {
    const year = form.elements.editorPeriodYear?.value || "";
    if (!year) input.value = "";
    else if (type === "yearly") input.value = year;
    else if (type === "monthly") {
      const month = form.elements.editorPeriodMonth?.value || "01";
      input.value = `${year}-${month}`;
    } else {
      const weeks = weeksInYear(year);
      const requested = Number(form.elements.editorPeriodWeek?.value || 1);
      if (weeks.length)
        input.value =
          weeks[Math.max(0, Math.min(requested, weeks.length) - 1)].key;
    }
  }
  const key = JSON.stringify([type, input.value, currentYear(today)]);
  if (field.dataset.editorPeriodRender !== key) {
    controls.innerHTML = controlsMarkup(type, input.value, today);
    field.dataset.editorPeriodRender = key;
    if (explicit) form.elements[target.name]?.focus({ preventScroll: true });
  }
  input.disabled = !goal;
  const selectedYear = form.elements.editorPeriodYear?.value || "";
  for (const control of controls.querySelectorAll("select"))
    control.disabled =
      !goal || (control.name !== "editorPeriodYear" && !selectedYear);
  return explicit;
}
