import { PRIORITIES, localDate } from "./model.js";
import {
  deadlineChipContent,
  deadlinePresentation,
} from "./deadline-presentation.js";
import { formatDateInput } from "./date-picker.js";
import { followUpPresentation } from "./waiting-followup.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const checkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const flagIcon =
  '<svg class="priority-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22V3m0 0c5-4 10 4 16 0v11c-6 4-11-4-16 0"/></svg>';
const followUpIcons = {
  overdue: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  soon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  missing: "M12 5v14M5 12h14",
};

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

/** Quick list edits use the existing workspace save/undo path supplied by the app. */
export function createInlineFields({
  root = document.querySelector("#app"),
  getRecords,
  onSave,
  onError = () => {},
  formatDate = (date) => (date ? formatDateInput(date) : "Tarih yok"),
  today = () => localDate(),
  onOpenDatePicker = () => {},
  onCloseDatePicker = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function" || typeof onSave !== "function")
    throw new TypeError(
      "Hızlı düzenleme için kayıt ve kaydetme işlevleri gereklidir.",
    );

  const owner = root.ownerDocument;
  const win = owner.defaultView;
  const priorityMenu = owner.createElement("div");
  priorityMenu.id = "priority-menu";
  priorityMenu.className = "quick-field-menu quick-priority-menu";
  priorityMenu.setAttribute("popover", "auto");
  priorityMenu.setAttribute("role", "menu");
  priorityMenu.setAttribute("aria-label", "Öncelik seç");
  root.append(priorityMenu);
  const triggers = new Map();
  let saving = false;

  const find = (id) => getRecords().find((record) => record.id === id);
  const currentDay = () => (typeof today === "function" ? today() : today);

  function priorityControl(record) {
    const priority = Object.hasOwn(PRIORITIES, record.priority)
      ? record.priority
      : "normal";
    return `<button type="button" class="inline-priority priority priority-${escapeHtml(priority)}" data-action="edit-priority" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: önceliğini değiştir" aria-haspopup="menu" aria-controls="priority-menu" aria-expanded="false" title="Önceliği değiştir">${flagIcon}${escapeHtml(PRIORITIES[priority].label)}</button>`;
  }

  function dateControl(record) {
    const presentation = deadlinePresentation(record, currentDay());
    const title = `${record.dueDate ? formatDateInput(record.dueDate) : presentation.label} · ${presentation.status} · Tarihi değiştir`;
    return `<button type="button" class="inline-date date-cell deadline-tag ${presentation.tone}" data-deadline-state="${presentation.state}" data-action="edit-date" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: teslim tarihini değiştir" aria-description="${escapeHtml(presentation.status)}" aria-haspopup="dialog" aria-controls="odak-date-picker" aria-expanded="false" title="${escapeHtml(title)}">${deadlineChipContent(record, { label: formatDate(record.dueDate), today: currentDay() })}</button>`;
  }

  function followUpDateControl(record) {
    if (record?.type !== "waiting") return "";
    const presentation = followUpPresentation(record, currentDay());
    const label = record.nextFollowUpDate
      ? formatDate(record.nextFollowUpDate)
      : "Takip planla";
    const symbol = !record.nextFollowUpDate
      ? "missing"
      : presentation.tone === "overdue"
        ? "overdue"
        : presentation.tone === "due-soon"
          ? "soon"
          : "calendar";
    const title = `${record.nextFollowUpDate ? formatDateInput(record.nextFollowUpDate) : label} · ${presentation.status} · Takip tarihini değiştir`;
    return `<button type="button" class="waiting-next-date deadline-tag ${escapeHtml(presentation.tone)}" data-followup-state="${escapeHtml(presentation.state)}" data-action="edit-next-followup" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: sonraki takip tarihini değiştir" aria-description="${escapeHtml(presentation.status)}" aria-haspopup="dialog" aria-controls="odak-date-picker" aria-expanded="false" title="${escapeHtml(title)}"><svg class="deadline-symbol" data-followup-icon="${symbol}" viewBox="0 0 24 24" aria-hidden="true"><path d="${followUpIcons[symbol]}"/></svg><span class="deadline-label">${escapeHtml(label)}</span></button>`;
  }

  function resetTrigger(menu) {
    triggers.get(menu)?.setAttribute("aria-expanded", "false");
    triggers.delete(menu);
  }

  function close() {
    if (priorityMenu.matches(":popover-open")) priorityMenu.hidePopover();
    resetTrigger(priorityMenu);
    onCloseDatePicker();
  }

  function show(menu, trigger) {
    const isSame =
      menu.matches(":popover-open") && triggers.get(menu) === trigger;
    close();
    if (isSame) return false;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = "8px";
    menu.style.top = "8px";
    triggers.set(menu, trigger);
    trigger.setAttribute("aria-expanded", "true");
    menu.showPopover();
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, win.innerHeight - bounds.height - 8))}px`;
    return true;
  }

  function openPriority(id, trigger) {
    if (saving) return;
    const record = find(id);
    if (!record) return;
    priorityMenu.innerHTML = `<div class="quick-field-heading"><strong>Öncelik</strong><span>${escapeHtml(record.title)}</span></div>${Object.entries(
      PRIORITIES,
    )
      .map(
        ([priority, item]) =>
          `<button type="button" class="quick-priority-option" role="menuitemradio" aria-checked="${priority === record.priority}" data-action="set-priority" data-id="${escapeHtml(id)}" data-priority="${priority}"><span class="priority-option-label">${escapeHtml(item.label)}</span><span class="quick-field-check">${priority === record.priority ? checkIcon : ""}</span></button>`,
      )
      .join("")}`;
    if (show(priorityMenu, trigger))
      priorityMenu
        .querySelector('[aria-checked="true"]')
        ?.focus({ preventScroll: true });
  }

  function openDate(id, trigger, field = "dueDate") {
    if (saving || trigger?.disabled) return;
    const record = find(id);
    if (!record || (field === "nextFollowUpDate" && record.type !== "waiting"))
      return;
    const followUp = field === "nextFollowUpDate";
    const action = followUp ? "edit-next-followup" : "edit-date";
    const context = trigger.closest("dialog, [popover]") || root;
    const resolveAnchor = () => {
      if (trigger.isConnected) return trigger;
      const scope = context.isConnected ? context : root;
      return [...scope.querySelectorAll(`[data-action="${action}"]`)].find(
        (candidate) => candidate.dataset.id === id && !candidate.disabled,
      );
    };
    close();
    onOpenDatePicker({
      anchor: trigger,
      value: record[field] || "",
      label: followUp
        ? "Sonraki takip tarihini değiştir"
        : "Teslim tarihini değiştir",
      resolveAnchor,
      onSelect: (value) => save(id, field, value),
    });
  }

  async function save(id, field, value) {
    if (saving) return false;
    if (!["priority", "dueDate", "nextFollowUpDate"].includes(field))
      return false;
    const record = find(id);
    if (
      !record ||
      (field === "nextFollowUpDate" && record.type !== "waiting")
    ) {
      onError("Bu kayıt artık düzenlenemiyor.");
      return false;
    }
    if ((record[field] || "") === value) {
      if (field === "priority") close();
      return true;
    }
    if (field === "priority" && !Object.hasOwn(PRIORITIES, value)) return false;
    if (field !== "priority" && value && !validDate(value)) {
      onError(
        field === "nextFollowUpDate"
          ? "Geçerli bir takip tarihi seç."
          : "Geçerli bir teslim tarihi seç.",
      );
      return false;
    }
    saving = true;
    if (field === "priority") close();
    try {
      const saved = await onSave(
        id,
        { [field]: value, updatedAt: new Date().toISOString() },
        field === "priority"
          ? "Öncelik güncelleme"
          : field === "nextFollowUpDate"
            ? "Takip tarihi güncelleme"
            : "Teslim tarihi güncelleme",
      );
      return saved !== false;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Değişiklik kaydedilemedi.",
      );
      return false;
    } finally {
      saving = false;
    }
  }

  function onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !root.contains(button)) return;
    const { action, id } = button.dataset;
    if (
      ![
        "edit-priority",
        "edit-date",
        "edit-next-followup",
        "set-priority",
        "cancel-inline",
      ].includes(action)
    )
      return;
    event.preventDefault();
    if (action === "edit-priority") openPriority(id, button);
    else if (action === "edit-date") openDate(id, button);
    else if (action === "edit-next-followup")
      openDate(id, button, "nextFollowUpDate");
    else if (action === "set-priority")
      void save(id, "priority", button.dataset.priority);
    else close();
  }

  function onKeydown(event) {
    const option = event.target.closest(
      "#priority-menu .quick-priority-option",
    );
    if (!option || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const items = [...priorityMenu.querySelectorAll(".quick-priority-option")];
    const index = items.indexOf(option);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next].focus();
  }

  const onToggle = (event) => {
    if (event.newState === "closed") resetTrigger(event.currentTarget);
  };
  priorityMenu.addEventListener("toggle", onToggle);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  win.addEventListener("resize", close);

  function destroy() {
    close();
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    win.removeEventListener("resize", close);
    priorityMenu.remove();
  }

  return { priorityControl, dateControl, followUpDateControl, close, destroy };
}
