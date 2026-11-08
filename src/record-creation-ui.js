import {
  TYPES,
  PRIORITIES,
  statusesForType,
  statusLabel,
  localDate,
} from "./model.js";
import { dateInput, dateValue as readDateValue } from "./date-picker.js";
import { DAILY_CONTEXTS, isDailyInboxGoal } from "./daily-context.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";
import { linkedAction } from "./action-links.js";
import {
  DISCARD_RECORD_CHANGES,
  recordFormValues,
} from "./record-form-discard.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const GOALS = new Set(["weekly", "monthly", "yearly"]);
const DATE_FIELDS = [
  "dueDate",
  "sourceDate",
  "nextFollowUpDate",
  "dailyDueDate",
  "waitingDueDate",
];
const FIELDS = [
  "title",
  "status",
  "priority",
  "dueDate",
  "sourceDate",
  "owner",
  "description",
  "nextAction",
  "workContext",
  "parentId",
  "goalParentId",
  "waitingReason",
  "projectCode",
  "workType",
  "category",
  "targetValue",
  "currentValue",
  "metric",
  "variance",
  "participants",
  "decision",
  "expectedFrom",
  "nextFollowUpDate",
  "latestUpdate",
  "dailyTitle",
  "dailyPriority",
  "dailyOwner",
  "dailyDueDate",
  "dailyNextAction",
  "waitingTitle",
  "waitingDueDate",
  "waitingNextAction",
];
const monthNames = [
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
const options = (items, selected) =>
  Object.entries(items)
    .map(
      ([value, item]) =>
        `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(typeof item === "string" ? item : item.label)}</option>`,
    )
    .join("");
const textField = (name, label, value, attributes = "") =>
  `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${attributes}></label>`;
const textArea = (name, label, value, maxLength = 10000) =>
  `<label class="field creation-full">${label}<textarea name="${name}" maxlength="${maxLength}" rows="3">${esc(value)}</textarea></label>`;
const dateField = (name, label, value) =>
  `<label class="field">${label}${dateInput({ name, id: `creation-${name}`, value: /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : "", label })}</label>`;
const selectField = (name, label, items, value) =>
  `<label class="field">${label}<select name="${name}">${options(items, value)}</select></label>`;

function weeksInYear(year) {
  const result = [];
  let week = makePlanningPeriod("weekly", `${year}-01-04`);
  while (week.key.startsWith(`${year}-W`) && result.length < 53) {
    result.push(week);
    try {
      week = shiftPlanningPeriod(week, 1);
    } catch {
      break;
    }
  }
  return result;
}

function periodFromKey(type, key, today) {
  try {
    const text = String(key || "");
    let period;
    if (type === "weekly" && /^\d{4}-W\d{2}$/.test(text))
      period = weeksInYear(text.slice(0, 4)).find((week) => week.key === text);
    else if (type === "monthly" && /^\d{4}-\d{2}$/.test(text))
      period = makePlanningPeriod(type, `${text}-01`);
    else if (type === "yearly" && /^\d{4}$/.test(text))
      period = makePlanningPeriod(type, `${text}-01-01`);
    if (period?.key === text) return period;
  } catch {
    /* Invalid external presets fall back to the current calendar period. */
  }
  return makePlanningPeriod(type, today);
}

/** A compact, type-specific creation form; existing record editing stays separate. */
export function createRecordCreationUI({
  root = document.querySelector("#app"),
  dialog = root?.querySelector("#editor"),
  getRecords,
  today = () => localDate(),
  onSave,
  onOpenRecord = () => {},
  onError = () => {},
  onMessage = () => {},
} = {}) {
  if (
    !root ||
    !dialog ||
    typeof getRecords !== "function" ||
    typeof onSave !== "function"
  )
    throw new TypeError(
      "Yeni kayıt için pencere, kayıt listesi ve kaydetme işlevi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const drafts = new Map();
  const initialValues = new Map();
  const draftValues = new Map();
  const renderedOptions = new WeakMap();
  let context = null;
  let currentType = "daily";
  let previousTrigger = null;
  let saving = false;
  let replacingForm = false;
  let destroyed = false;
  let generation = 0;
  const currentDay = () => (typeof today === "function" ? today() : today);
  const form = () => dialog.querySelector('#record-form[data-creation="true"]');
  const draft = () => drafts.get(currentType);

  function releasePopovers() {
    for (const id of ["odak-date-picker", "record-choice-menu"]) {
      const popup = dialog.querySelector(`#${id}`);
      if (!popup) continue;
      if (popup.matches(":popover-open")) popup.hidePopover();
      root.append(popup);
    }
  }

  function setError(message = "") {
    const target = form()?.querySelector("#form-error");
    if (!target) return;
    target.textContent = String(message).trim();
    target.hidden = !target.textContent;
  }

  function makeDraft(type, values = {}) {
    const initial = {
      title: "",
      status: "planned",
      priority: "normal",
      dueDate: "",
      sourceDate: currentDay(),
      owner: "",
      description: "",
      nextAction: "",
      workContext: type === "daily" ? "ad_hoc" : "",
      parentId: "",
      goalParentId: "",
      waitingReason: "",
      projectCode: "",
      workType: "",
      category: "",
      targetValue: "",
      currentValue: 0,
      metric: "",
      variance: "",
      participants: "",
      decision: "",
      expectedFrom: "",
      nextFollowUpDate: "",
      latestUpdate: "",
      dailyTitle: "",
      dailyPriority: "normal",
      dailyOwner: "",
      dailyDueDate: "",
      dailyNextAction: "",
      waitingTitle: "",
      waitingDueDate: "",
      waitingNextAction: "",
      _numeric: false,
      _advanced: true,
      _meetingRoute: "",
      ...values,
    };
    initial.status = Object.hasOwn(statusesForType(type), initial.status)
      ? initial.status
      : "planned";
    if (type === "daily") {
      // Defaults apply to this new draft only; choosing a weekly goal is planned.
      if (initial.parentId) initial.workContext = "";
      else if (!Object.hasOwn(DAILY_CONTEXTS, initial.workContext))
        initial.workContext = "ad_hoc";
    }
    if (GOALS.has(type)) {
      initial.periodKey = periodFromKey(
        type,
        values.periodKey,
        currentDay(),
      ).key;
      initial._numeric = Boolean(
        values.numeric ??
          ((values.targetValue != null &&
            String(values.targetValue).trim() !== "") ||
            String(values.metric || "").trim()),
      );
    }
    return initial;
  }

  function capture() {
    const current = form();
    if (!current || !draft()) return;
    draftValues.set(
      currentType,
      recordFormValues(current, { exclude: ["type"] }),
    );
    for (const name of FIELDS)
      if (current.elements[name]) draft()[name] = current.elements[name].value;
    draft()._numeric = Boolean(current.elements.numeric?.checked);
    draft()._advanced = Boolean(
      current.querySelector(".creation-advanced")?.open,
    );
    if (current.elements.periodKey)
      draft().periodKey = current.elements.periodKey.value;
  }

  function periodMarkup(values) {
    const period = periodFromKey(currentType, values.periodKey, currentDay());
    const year = Number(period.key.slice(0, 4));
    const presentYear = Number(currentDay().slice(0, 4));
    const years = [
      ...new Set([
        year,
        ...Array.from({ length: 16 }, (_, index) => presentYear - 5 + index),
      ]),
    ]
      .filter((value) => value >= 1900 && value <= 9999)
      .sort((a, b) => a - b);
    const yearSelect = `<label class="field">Yıl<select name="periodYear">${years.map((value) => `<option value="${value}" ${value === year ? "selected" : ""}>${value}</option>`).join("")}</select></label>`;
    const second =
      currentType === "weekly"
        ? `<label class="field creation-period-choice">Hafta<select name="periodWeek">${weeksInYear(
            String(year),
          )
            .map(
              (week) =>
                `<option value="${week.key.slice(-2)}" ${week.key === period.key ? "selected" : ""}>${esc(week.label)}</option>`,
            )
            .join("")}</select></label>`
        : currentType === "monthly"
          ? `<label class="field creation-period-choice">Ay<select name="periodMonth">${monthNames.map((name, index) => `<option value="${String(index + 1).padStart(2, "0")}" ${Number(period.key.slice(-2)) === index + 1 ? "selected" : ""}>${name}</option>`).join("")}</select></label>`
          : "";
    return `<div class="creation-period creation-full">${yearSelect}${second}<input type="hidden" name="periodKey" value="${esc(period.key)}"></div>`;
  }

  function parentMarkup() {
    if (currentType === "daily")
      return `<div class="field creation-full" id="parent-field"><div class="creation-parent-heading"><label for="weekly-parent-select">Bağlı haftalık hedef <small>İsteğe bağlı</small></label></div><select name="parentId" id="weekly-parent-select"><option value="">Bağlantı yok</option></select><span class="field-help creation-parent-hint" hidden></span></div>`;
    if (["weekly", "monthly"].includes(currentType))
      return `<label class="field creation-full" id="higher-goal-field">${currentType === "weekly" ? "Bağlı aylık hedef" : "Bağlı senelik hedef"} <small>İsteğe bağlı</small><select name="goalParentId" id="higher-goal-select"><option value="">Bağlantı yok</option></select><span class="field-help creation-parent-hint" hidden></span></label>`;
    return "";
  }

  function numericMarkup(values) {
    return `<div class="creation-full creation-numeric"><label class="creation-check"><input type="checkbox" name="numeric" ${values._numeric ? "checked" : ""}>Adetle takip et</label><fieldset class="creation-numeric-fields" ${values._numeric ? "" : "hidden disabled"}>${textField("targetValue", "Hedef adet", values.targetValue, 'type="number" min="0" step="any" placeholder="Örn. 10"')}${textField("metric", "Birim", values.metric, 'maxlength="120" placeholder="Örn. Rapor, parça"')}</fieldset></div>`;
  }

  function meetingMarkup(values) {
    const selected = values._meetingRoute;
    return `<section class="creation-meeting-routes creation-full"><div class="creation-route-buttons" role="group" aria-label="Toplantı aksiyonunu planla">${[
      ["daily", "Ben yapacağım"],
      ["waiting", "Başkasından bekliyorum"],
      ["both", "Her ikisi de"],
    ]
      .map(
        ([route, title]) =>
          `<button type="button" class="btn" data-action="creation-meeting-route" data-route="${route}" aria-pressed="${selected === route}">${title}</button>`,
      )
      .join(
        "",
      )}</div><div class="creation-route-fields"><fieldset data-creation-route="daily" ${["daily", "both"].includes(selected) ? "" : "hidden"}><legend>Ben yapacağım</legend>${textField("dailyTitle", "İş başlığı", values.dailyTitle, 'maxlength="500" placeholder="Toplantı başlığı kullanılır"')}${selectField("dailyPriority", "Öncelik", PRIORITIES, values.dailyPriority)}<input type="hidden" name="dailyOwner" value="${esc(values.dailyOwner)}">${dateField("dailyDueDate", "İşin teslim tarihi", values.dailyDueDate)}<input type="hidden" name="dailyNextAction" value="${esc(values.dailyNextAction)}"></fieldset><fieldset data-creation-route="waiting" ${["waiting", "both"].includes(selected) ? "" : "hidden"}><legend>Başkasından bekliyorum</legend>${textField("waitingTitle", "Beklediğim sonuç", values.waitingTitle, 'maxlength="500" placeholder="Toplantı başlığı kullanılır"')}${textField("expectedFrom", "Kimden bekliyorum?", values.expectedFrom, 'maxlength="120"')}${dateField("nextFollowUpDate", "Sonraki takip tarihi", values.nextFollowUpDate)}${textArea("latestUpdate", "Son gelişme", values.latestUpdate)}</fieldset></div></section>`;
  }

  function advancedMarkup(values) {
    const fields = [
      selectField(
        "status",
        "Durum",
        statusesForType(currentType),
        values.status,
      ),
    ];
    if (GOALS.has(currentType))
      fields.push(
        selectField("priority", "Öncelik", PRIORITIES, values.priority),
      );
    else if (currentType === "waiting")
      fields.push(
        `<input type="hidden" name="priority" value="${esc(values.priority)}">`,
      );
    fields.push(
      dateField(
        "sourceDate",
        currentType === "waiting"
          ? "Beklemeye başlama tarihi"
          : currentType === "meeting"
            ? "Toplantı tarihi"
            : "Kayıt tarihi",
        values.sourceDate,
      ),
    );
    if (["weekly", "monthly"].includes(currentType))
      fields.push(dateField("dueDate", "Teslim tarihi", values.dueDate));
    fields.push(
      `<input type="hidden" name="owner" value="${esc(values.owner)}">`,
    );
    if (currentType === "waiting")
      fields.push(
        `<input type="hidden" name="dueDate" value="${esc(values.dueDate)}">`,
      );
    if (currentType === "daily") {
      fields.push(
        selectField(
          "workContext",
          "Çalışma bağlamı",
          DAILY_CONTEXTS,
          values.workContext,
        ),
      );
      fields.push(
        `<label class="field creation-full" id="waiting-reason-field" ${values.status === "waiting" ? "" : "hidden"}>Neyi/kimi bekliyorum?<textarea name="waitingReason" maxlength="1000" rows="2">${esc(values.waitingReason)}</textarea></label>`,
      );
      fields.push(
        `<input type="hidden" name="projectCode" value="${esc(values.projectCode)}">`,
        `<input type="hidden" name="workType" value="${esc(values.workType)}">`,
        `<input type="hidden" name="category" value="${esc(values.category)}">`,
      );
    }
    fields.push(
      `<input type="hidden" name="nextAction" value="${esc(values.nextAction)}">`,
    );
    fields.push(textArea("description", "Notlar", values.description, 50000));
    if (GOALS.has(currentType))
      fields.push(
        `<label class="field creation-current-value" ${values._numeric ? "" : "hidden"}>Mevcut adet<input type="number" name="currentValue" min="0" step="any" value="${esc(values.currentValue)}"></label>`,
        `<input type="hidden" name="variance" value="${esc(values.variance)}">`,
      );
    if (currentType === "meeting")
      fields.push(
        `<input type="hidden" name="participants" value="${esc(values.participants)}">`,
      );
    if (currentType === "waiting")
      fields.push(textArea("latestUpdate", "Son gelişme", values.latestUpdate));
    return `<details class="creation-advanced record-editor-details" ${values._advanced ? "open" : ""}><summary>Ek bilgiler</summary><div class="creation-advanced-fields record-editor-details-grid">${fields.join("")}</div></details>`;
  }

  function render() {
    const values = draft();
    releasePopovers();
    dialog.classList.add("record-creation-dialog");
    const titleLabel = GOALS.has(currentType)
      ? "Hedef"
      : currentType === "meeting"
        ? "Aksiyon"
        : currentType === "waiting"
          ? "Beklenen konu"
          : "Başlık";
    const titlePlaceholder = GOALS.has(currentType)
      ? "Neye ulaşmak istiyorsun?"
      : currentType === "meeting"
        ? "Toplantıda hangi aksiyon kararlaştırıldı?"
        : currentType === "waiting"
          ? "Neyi bekliyorsun?"
          : "Ne yapacaksın?";
    const main = [
      textField(
        "title",
        `${titleLabel} *`,
        values.title,
        `required maxlength="500" placeholder="${titlePlaceholder}"`,
      ),
    ];
    if (currentType === "daily")
      main.push(dateField("dueDate", "Teslim tarihi", values.dueDate));
    if (currentType === "daily")
      main.push(
        selectField("priority", "Öncelik", PRIORITIES, values.priority),
        parentMarkup(),
      );
    if (GOALS.has(currentType))
      main.push(periodMarkup(values), parentMarkup(), numericMarkup(values));
    if (currentType === "meeting")
      main.push(
        textArea("decision", "Alınan karar", values.decision),
        meetingMarkup(values),
      );
    if (currentType === "waiting")
      main.push(
        textField(
          "expectedFrom",
          "Kimden bekliyorum?",
          values.expectedFrom,
          'maxlength="120"',
        ),
        dateField(
          "nextFollowUpDate",
          "Sonraki takip tarihi",
          values.nextFollowUpDate,
        ),
      );
    // Removing a focused field can synchronously emit change from the old form.
    replacingForm = true;
    try {
      dialog.innerHTML = `<form id="record-form" data-creation="true"><div class="modal-header"><h2>Yeni kayıt</h2><label class="creation-type-switch"><span>Liste</span><select name="type" id="creation-type" ${context.locked ? "disabled" : ""}>${options(TYPES, currentType)}</select></label><button type="button" class="close-modal" data-action="creation-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body creation-body"><input type="hidden" name="id" value=""><p class="creation-source-context" hidden></p><p class="creation-availability" aria-live="polite" hidden></p><div class="creation-main-fields">${main.join("")}</div>${advancedMarkup(values)}<p id="form-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn" data-action="creation-close">Vazgeç</button><button type="submit" class="btn primary">Kaydı ekle</button></div></form>`;
    } finally {
      replacingForm = false;
    }
    for (const name of DATE_FIELDS) {
      const input = form().elements[name];
      if (input && !/^\d{4}-\d{2}-\d{2}$/.test(String(values[name] || "")))
        input.value = values[name] || "";
    }
    refresh();
    if (!initialValues.has(currentType))
      initialValues.set(
        currentType,
        recordFormValues(form(), { exclude: ["type"] }),
      );
  }

  function updateParentOptions() {
    const current = form();
    if (!current) return;
    const daily = currentType === "daily";
    const parentType = daily
      ? "weekly"
      : currentType === "weekly"
        ? "monthly"
        : currentType === "monthly"
          ? "yearly"
          : null;
    const select = daily
      ? current.elements.parentId
      : current.elements.goalParentId;
    if (!select || !parentType) return;
    const selected =
      select.value || draft()[daily ? "parentId" : "goalParentId"] || "";
    const fixed = daily ? context.parentId : context.goalParentId;
    const candidates = getRecords().filter(
      (record) =>
        record.type === parentType &&
        (!daily || !isDailyInboxGoal(record) || record.id === selected),
    );
    const shown = candidates.filter(
      (record) =>
        !CLOSED.has(record.status) ||
        record.id === fixed ||
        record.id === selected,
    );
    const missing = selected && !shown.some((record) => record.id === selected);
    const markup = `<option value="">Bağlantı yok</option>${missing ? `<option value="${esc(selected)}" selected>Seçili hedef artık bulunamıyor</option>` : ""}${shown.map((record) => `<option value="${esc(record.id)}" ${record.id === selected ? "selected" : ""}>${record.periodKey ? `${esc(record.periodKey)} · ` : ""}${esc(record.title)}${CLOSED.has(record.status) ? ` (${esc(statusLabel(parentType, record.status))})` : ""}</option>`).join("")}`;
    if (renderedOptions.get(select) !== markup) {
      select.innerHTML = markup;
      renderedOptions.set(select, markup);
    }
    current.querySelector(
      daily ? "#parent-field" : "#higher-goal-field",
    ).hidden = false;
    select.disabled = saving;
    const hint = select
      .closest(".field")
      .querySelector(".creation-parent-hint");
    hint.hidden = !missing;
    hint.textContent = missing
      ? "Başka bir hedef seçebilir veya bağlantıyı kaldırabilirsin."
      : "";
  }

  function refresh() {
    const current = form();
    if (destroyed || !current || !dialog.open) return;
    let unavailable = "";
    let reusedTarget = null;
    try {
      updateParentOptions();
      if (context.sourceId) {
        const source = getRecords().find(
          (record) => record.id === context.sourceId,
        );
        const valid =
          source &&
          ((source.type === "meeting" &&
            ["daily", "waiting"].includes(currentType)) ||
            (source.type === "waiting" && currentType === "daily"));
        if (!valid)
          unavailable =
            "Kaynak kayıt artık bulunamıyor. Taslağın burada korunuyor.";
        else {
          reusedTarget = linkedAction(source.id, getRecords(), currentType);
        }
        const banner = current.querySelector(".creation-source-context");
        if (valid) {
          banner.hidden = false;
          banner.textContent = `${TYPES[source.type].label}: ${source.title}${reusedTarget ? " · Bu akış zaten var; mevcut kayıt açılacak." : ""}`;
        }
      }
    } catch (error) {
      unavailable =
        error instanceof Error
          ? error.message
          : "Kayıtlar okunamadı. Taslağın korunuyor.";
    }
    const availability = current.querySelector(".creation-availability");
    availability.hidden = !unavailable;
    availability.textContent = unavailable;
    const save = current.querySelector('[type="submit"]');
    save.disabled = saving || Boolean(unavailable);
    save.formNoValidate = Boolean(reusedTarget);
    save.textContent = saving
      ? "Kaydediliyor…"
      : reusedTarget
        ? "Mevcut kaydı aç"
        : "Kaydı ekle";
    current.elements.title.required = !reusedTarget;
    current.setAttribute("aria-busy", String(saving));
    current.elements.type.disabled = saving || context.locked;
    for (const control of current.querySelectorAll(
      '[data-action="creation-close"], [data-action="creation-meeting-route"]',
    ))
      control.disabled = saving;
    const numeric = Boolean(current.elements.numeric?.checked);
    const numericFields = current.querySelector(".creation-numeric-fields");
    if (numericFields) {
      numericFields.hidden = !numeric;
      numericFields.disabled = saving || !numeric;
    }
    const count = current.querySelector(".creation-current-value");
    if (count) {
      count.hidden = !numeric;
      current.elements.currentValue.disabled = saving || !numeric;
    }
    const reason = current.querySelector("#waiting-reason-field");
    if (reason) reason.hidden = current.elements.status.value !== "waiting";
    if (currentType === "meeting") {
      for (const route of ["daily", "waiting"]) {
        const fields = current.querySelector(
          `[data-creation-route="${route}"]`,
        );
        const selected = [route, "both"].includes(draft()._meetingRoute);
        fields.hidden = !selected;
        fields.disabled = saving || !selected;
      }
      for (const button of current.querySelectorAll(
        '[data-action="creation-meeting-route"]',
      ))
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.route === draft()._meetingRoute),
        );
    }
  }

  function open({
    type = "daily",
    periodKey = "",
    parentId = "",
    goalParentId = "",
    sourceId = "",
    values = {},
  } = {}) {
    if (destroyed) return;
    try {
      if (!Object.hasOwn(TYPES, type))
        throw new Error("Geçerli bir kayıt türü seç.");
      previousTrigger = document.activeElement;
      releasePopovers();
      context = {
        parentId,
        goalParentId,
        sourceId,
        locked: Boolean(parentId || goalParentId || sourceId),
      };
      currentType = type;
      drafts.clear();
      initialValues.clear();
      draftValues.clear();
      drafts.set(
        type,
        makeDraft(type, {
          ...values,
          ...(periodKey ? { periodKey } : {}),
          ...(parentId ? { parentId } : {}),
          ...(goalParentId ? { goalParentId } : {}),
        }),
      );
      saving = false;
      generation++;
      if (!dialog.open) dialog.showModal();
      render();
      dialog.querySelector(".modal-body").scrollTop = 0;
      form().elements.title.focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function close() {
    if (!form()) return;
    releasePopovers();
    const previous = previousTrigger;
    context = null;
    previousTrigger = null;
    saving = false;
    generation++;
    dialog.classList.remove("record-creation-dialog");
    if (dialog.open) dialog.close();
    const active = document.activeElement;
    if (
      (!active ||
        active === document.body ||
        active === document.documentElement ||
        dialog.contains(active)) &&
      previous?.isConnected
    )
      previous.focus({ preventScroll: true });
  }

  function requestClose() {
    if (saving) return;
    capture();
    const dirty = [...draftValues].some(
      ([type, values]) => values !== initialValues.get(type),
    );
    if (!dirty || owner.confirm(DISCARD_RECORD_CHANGES)) close();
  }

  function updatePeriod() {
    const current = form();
    const year = String(current.elements.periodYear.value);
    let key;
    if (currentType === "weekly") {
      const weeks = weeksInYear(year);
      const selected = Math.min(
        Number(current.elements.periodWeek.value),
        weeks.length,
      );
      key = weeks[Math.max(0, selected - 1)].key;
    } else
      key =
        currentType === "monthly"
          ? `${year}-${current.elements.periodMonth.value}`
          : year;
    draft().periodKey = key;
    const activeName = document.activeElement?.name;
    current.querySelector(".creation-period").outerHTML = periodMarkup(draft());
    current.elements[activeName]?.focus({ preventScroll: true });
  }

  function onChange(event) {
    const current = form();
    if (
      replacingForm ||
      !current ||
      event.target.closest?.('#record-form[data-creation="true"]') !== current
    )
      return;
    const field = event.target;
    if (field.name === "type" && !context.locked) {
      const nextType = field.value;
      capture();
      const previous = draft();
      currentType = nextType;
      if (!drafts.has(nextType))
        drafts.set(
          nextType,
          makeDraft(
            nextType,
            Object.fromEntries(
              [
                "title",
                "priority",
                "sourceDate",
                "owner",
                "description",
                "nextAction",
              ].map((name) => [name, previous[name]]),
            ),
          ),
        );
      render();
      form().elements.type.focus({ preventScroll: true });
      return;
    }
    if (["periodYear", "periodWeek", "periodMonth"].includes(field.name)) {
      capture();
      updatePeriod();
      return;
    }
    if (field.name === "workContext" && field.value === "ad_hoc") {
      current.elements.parentId.value = "";
      draft().parentId = "";
    }
    if (currentType === "daily" && field.name === "parentId")
      current.elements.workContext.value = field.value ? "" : "ad_hoc";
    capture();
    refresh();
  }

  function onClick(event) {
    const current = form();
    const control = event.target.closest?.("[data-action]");
    if (!current || !current.contains(control)) return;
    if (control.dataset.action === "creation-close") {
      event.preventDefault();
      requestClose();
    }
    if (control.dataset.action === "creation-meeting-route") {
      event.preventDefault();
      capture();
      draft()._meetingRoute =
        draft()._meetingRoute === control.dataset.route
          ? ""
          : control.dataset.route;
      capture();
      refresh();
    }
  }

  function payload() {
    const current = form();
    const input = { type: currentType };
    for (const name of FIELDS)
      if (
        current.elements[name] &&
        ![
          "dailyTitle",
          "dailyPriority",
          "dailyOwner",
          "dailyDueDate",
          "dailyNextAction",
          "waitingTitle",
          "waitingDueDate",
          "waitingNextAction",
        ].includes(name)
      )
        input[name] = current.elements[name].value.trim();
    for (const name of ["dueDate", "sourceDate", "nextFollowUpDate"])
      if (
        current.elements[name] &&
        !(currentType === "meeting" && name === "nextFollowUpDate")
      )
        input[name] = readDateValue(current.elements[name]);
    if (currentType === "daily" && input.workContext === "ad_hoc")
      input.parentId = "";
    if (GOALS.has(currentType))
      input.periodKey = current.elements.periodKey.value;
    const meetingRoute = currentType === "meeting" ? draft()._meetingRoute : "";
    const routeDrafts = {};
    if (currentType === "meeting") {
      delete input.expectedFrom;
      delete input.nextFollowUpDate;
      delete input.latestUpdate;
      for (const route of ["daily", "waiting"])
        if ([route, "both"].includes(meetingRoute))
          routeDrafts[route] = {
            title:
              current.elements[`${route}Title`].value.trim() || input.title,
            status: route === "daily" ? "planned" : "waiting_response",
            ...(route === "daily"
              ? {
                  priority: current.elements.dailyPriority.value,
                  dueDate: readDateValue(current.elements.dailyDueDate),
                  nextAction: current.elements.dailyNextAction.value.trim(),
                  owner: current.elements.dailyOwner.value.trim(),
                }
              : {
                  dueDate: "",
                  nextAction: "",
                  expectedFrom: current.elements.expectedFrom.value.trim(),
                  nextFollowUpDate: readDateValue(
                    current.elements.nextFollowUpDate,
                  ),
                  latestUpdate: current.elements.latestUpdate.value.trim(),
                }),
          };
    }
    return {
      input,
      options: {
        sourceId: context.sourceId,
        numeric: Boolean(current.elements.numeric?.checked),
        meetingRoute,
        routeDrafts,
      },
    };
  }

  async function onSubmit(event) {
    if (!event.target.matches('#record-form[data-creation="true"]')) return;
    event.preventDefault();
    if (destroyed || saving) return;
    const attempt = generation;
    try {
      capture();
      refresh();
      if (form().querySelector('[type="submit"]').disabled) return;
      const existing = context.sourceId
        ? linkedAction(context.sourceId, getRecords(), currentType)
        : null;
      if (!existing && !form().reportValidity()) return;
      const { input, options } = existing
        ? {
            input: { type: currentType },
            options: {
              sourceId: context.sourceId,
              numeric: false,
              meetingRoute: "",
              routeDrafts: {},
            },
          }
        : payload();
      setError();
      saving = true;
      refresh();
      const result = await onSave(input, options);
      if (destroyed || attempt !== generation) return;
      if (!result)
        throw new Error(
          "Kayıt kaydedilemedi. Taslağın burada korunuyor; yeniden deneyebilirsin.",
        );
      close();
      if (result.reused && result.record?.id) onOpenRecord(result.record.id);
      onMessage(result.reused ? "Mevcut kayıt açıldı." : "Yeni kayıt eklendi.");
    } catch (error) {
      if (!destroyed && attempt === generation)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!destroyed && attempt === generation) {
        saving = false;
        refresh();
      }
    }
  }

  function onCancel(event) {
    if (!form()) return;
    event.preventDefault();
    requestClose();
  }
  function onClose() {
    if (dialog.open || !context) return;
    releasePopovers();
    const previous = previousTrigger;
    context = null;
    previousTrigger = null;
    saving = false;
    generation++;
    dialog.classList.remove("record-creation-dialog");
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !dialog.contains(active) &&
      active !== previous
    )
      return;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    generation++;
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
    root.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onClose);
    owner.removeEventListener("pagehide", destroy);
  }
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, refresh, close, destroy };
}
