import { localDate } from "./model.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";
import {
  calendarEntries,
  buildCalendarMonth,
  buildCalendarWeek,
} from "./calendar-model.js";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TYPES = {
  daily: "Günlük iş",
  weekly: "Haftalık hedef",
  monthly: "Aylık hedef",
  yearly: "Senelik hedef",
  meeting: "Toplantı aksiyonu",
  waiting: "Bekleyen konu",
};
const FORMAT = {
  full: new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  day: new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }),
  short: new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }),
  date: new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }),
};
const PATHS = {
  calendar: "M8 2v4m8-4v4M3 10h18M4 4h16a1 1 0 0 1 1 1v16H3V5a1 1 0 0 1 1-1Z",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  chevron: "m9 5 7 7-7 7",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || PATHS.calendar}"/></svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ],
  );
const dateObject = (date) => new Date(`${date}T12:00:00Z`);
const format = (date, style = "day") => FORMAT[style].format(dateObject(date));
let instances = 0;

function shiftedDay(date, amount) {
  const parsed = dateObject(date);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  if (parsed.getUTCFullYear() < 1 || parsed.getUTCFullYear() > 9999)
    return null;
  return parsed.toISOString().slice(0, 10);
}

function shiftedMonth(date, amount) {
  try {
    const month = shiftPlanningPeriod(
      makePlanningPeriod("monthly", date),
      amount,
    );
    const day = Math.min(Number(date.slice(8)), Number(month.end.slice(8)));
    return `${month.key}-${String(day).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/** One persistent, read-only calendar shared by the compact rail and its dialog. */
export function createDashboardCalendar({
  root,
  getRecords = () => [],
  today = localDate,
  getQuery = () => "",
  onOpenRecord = () => {},
  onNewRecord = () => {},
}) {
  if (!root?.addEventListener)
    throw new TypeError("Takvim için bir ekran kökü gereklidir.");
  const document = root.ownerDocument || root;
  const owner = `calendar-${++instances}`;
  const readToday = () => (typeof today === "function" ? today() : today);
  const readQuery = () =>
    typeof getQuery === "function" ? getQuery() : getQuery;
  let selectedDay = readToday();
  let month = makePlanningPeriod("monthly", selectedDay);
  let mode = "month";
  let newType = "daily";
  let destroyed = false;
  let restoreOnClose = true;
  let expandedTrigger = null;
  let editorReturnFocus = null;
  let editorHandoff = false;
  let expandedDirty = false;
  const dialog = document.createElement("dialog");
  dialog.id =
    instances === 1
      ? "dashboard-calendar-dialog"
      : `dashboard-calendar-dialog-${instances}`;
  dialog.className = "calendar-dialog";
  dialog.dataset.calendarOwner = owner;
  dialog.setAttribute("aria-label", "Takvim");
  document.body.append(dialog);

  const allEntries = () =>
    calendarEntries(getRecords(), { query: readQuery() });
  const byDay = (entries, date) =>
    entries.filter((entry) => entry.date === date);
  const dayCount = (entries, date) => {
    const values = byDay(entries, date);
    return {
      due: values.filter((entry) => entry.kind === "due").length,
      followup: values.filter((entry) => entry.kind === "followup").length,
    };
  };
  const caption = (counts) =>
    [
      counts.due ? `${counts.due} teslim` : "",
      counts.followup ? `${counts.followup} takip` : "",
    ]
      .filter(Boolean)
      .join(", ");
  const dayClasses = (date) =>
    [
      date === selectedDay ? "is-selected" : "",
      date === readToday() ? "is-today" : "",
      date.slice(0, 7) !== month.key ? "is-adjacent" : "",
    ]
      .filter(Boolean)
      .join(" ");

  function countMarkup(counts) {
    return `<span class="calendar-counts">${counts.due ? `<span class="calendar-date-count calendar-due" aria-hidden="true"><i></i>${counts.due}</span>` : ""}${counts.followup ? `<span class="calendar-date-count calendar-followup" aria-hidden="true"><i></i>${counts.followup}</span>` : ""}</span>`;
  }

  function navigation(expanded = false) {
    const weekly = expanded && mode === "week";
    const label = weekly
      ? buildCalendarWeek(selectedDay).period.label
      : month.label;
    const previous = weekly
      ? shiftedDay(selectedDay, -7)
      : shiftedMonth(month.start, -1);
    const next = weekly
      ? shiftedDay(selectedDay, 7)
      : shiftedMonth(month.start, 1);
    return `<div class="calendar-navigation"><button type="button" class="calendar-nav calendar-prev" data-calendar-action="prev" aria-label="Önceki ${weekly ? "hafta" : "ay"}" ${previous ? "" : "disabled"}>${icon("chevron")}</button><strong class="calendar-month-title" aria-live="polite">${esc(label)}</strong><button type="button" class="calendar-nav" data-calendar-action="next" aria-label="Sonraki ${weekly ? "hafta" : "ay"}" ${next ? "" : "disabled"}>${icon("chevron")}</button><button type="button" class="calendar-today" data-calendar-action="today">Bugün</button></div>`;
  }

  function compactGrid(entries) {
    return `<div class="calendar-weekdays" aria-hidden="true">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-month-grid" role="group" aria-label="${esc(month.label)} günleri">${buildCalendarMonth(
      month.start,
    )
      .days.map((date) => {
        if (!date) return '<span class="calendar-day-placeholder"></span>';
        const counts = dayCount(entries, date);
        return `<button type="button" class="calendar-day ${dayClasses(date)}" data-calendar-action="select-day" data-calendar-date="${date}" aria-label="${esc(`${format(date, "full")}${caption(counts) ? `, ${caption(counts)}` : ""}`)}" aria-pressed="${date === selectedDay}" ${date === readToday() ? 'aria-current="date"' : ""} tabindex="${date === selectedDay ? "0" : "-1"}"><span>${Number(date.slice(8))}</span>${countMarkup(counts)}</button>`;
      })
      .join("")}</div>`;
  }

  function legend() {
    return `<div class="calendar-legend"><span class="calendar-due">${icon("calendar")}Teslim</span><span class="calendar-followup">${icon("clock")}Takip</span></div>`;
  }

  function entryMarkup(entry, small = false, fullDetails = true) {
    return `<button type="button" class="${small ? "calendar-cell-entry" : "calendar-entry"} calendar-${entry.kind === "due" ? "due" : "followup"}" data-calendar-action="open-record" data-calendar-record-id="${esc(entry.record.id)}" title="${esc(`${entry.record.title} · ${TYPES[entry.record.type] || entry.record.type} · ${entry.kind === "due" ? "Teslim" : "Takip"}: ${format(entry.date, "short")}`)}">${small ? '<i aria-hidden="true"></i>' : icon(entry.kind === "due" ? "calendar" : "clock")}<span><strong>${esc(entry.record.title)}</strong>${small ? "" : `<small class="calendar-entry-kind">${esc(TYPES[entry.record.type] || entry.record.type)}${fullDetails ? ` · ${entry.kind === "due" ? "Teslim" : "Takip"} ${esc(format(entry.date, "short"))}` : ""}</small>`}</span></button>`;
  }

  function agenda(entries, expanded = false) {
    const records = byDay(entries, selectedDay);
    return `<section class="calendar-day-agenda" aria-label="Seçili günün kayıtları"><div class="calendar-selected-header"><h3 class="calendar-selected-label"><time datetime="${selectedDay}">${esc(format(selectedDay, expanded ? "day" : "date"))}</time><span>${records.length} kayıt</span></h3>${addControl()}</div><div class="calendar-agenda-entries" data-calendar-selected="${selectedDay}" tabindex="0" role="region" aria-label="${esc(format(selectedDay, "full"))} kayıtları">${
      records.length
        ? ["due", "followup"]
            .map((kind) => {
              const values = records.filter((entry) => entry.kind === kind);
              if (!values.length) return "";
              return `<div class="calendar-agenda-group"><h4>${kind === "due" ? "Teslimler" : "Takipler"}</h4><ul>${values.map((entry) => `<li>${entryMarkup(entry, false, expanded)}</li>`).join("")}</ul></div>`;
            })
            .join("")
        : `<p class="calendar-empty">${readQuery() ? "Bu gün aramanla eşleşen kayıt yok." : "Bu güne planlı teslim veya takip yok."}</p>`
    }</div></section>`;
  }

  function addControl() {
    const label = `${format(selectedDay, "full")}: ${newType === "waiting" ? "takip tarihli bekleyen konu ekle" : "teslim tarihli günlük iş ekle"}`;
    return `<div class="calendar-add-controls"><select class="calendar-new-type" aria-label="Eklenecek kayıt türü"><option value="daily" ${newType === "daily" ? "selected" : ""}>Günlük iş</option><option value="waiting" ${newType === "waiting" ? "selected" : ""}>Bekleyen konu</option></select><button type="button" class="calendar-new-record" data-calendar-action="new-record" aria-label="${esc(label)}" title="${esc(label)}">${icon("plus")}Ekle</button></div>`;
  }

  function render() {
    if (destroyed) return "";
    const entries = allEntries();
    return `<section class="panel dashboard-calendar" data-calendar-owner="${owner}"><div class="calendar-heading"><h2>Takvim</h2>${navigation()}<button type="button" class="calendar-expand" data-calendar-action="expand" aria-label="Takvimi büyüt" title="Takvimi büyüt">${icon("expand")}<span>Büyüt</span></button></div>${compactGrid(entries)}${legend()}${agenda(entries)}</section>`;
  }

  function expandedCells(entries) {
    const previewLimit = mode === "week" ? 4 : 2;
    const days =
      mode === "week"
        ? buildCalendarWeek(selectedDay).days
        : buildCalendarMonth(month.start).days;
    return `<div class="calendar-weekdays" aria-hidden="true">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="${mode === "week" ? "calendar-expanded-week" : "calendar-expanded-grid"}" role="group" aria-label="${mode === "week" ? "Haftanın" : "Ayın"} kayıtları">${days
      .map((date) => {
        if (!date) return '<div class="calendar-expanded-cell is-empty"></div>';
        const values = byDay(entries, date);
        const counts = dayCount(entries, date);
        return `<div class="calendar-expanded-cell ${dayClasses(date)}" data-calendar-date="${date}"><button type="button" class="calendar-cell-date" data-calendar-action="select-day" data-calendar-date="${date}" aria-label="${esc(`${format(date, "full")}${caption(counts) ? `, ${caption(counts)}` : ""}`)}" aria-pressed="${date === selectedDay}" ${date === readToday() ? 'aria-current="date"' : ""} tabindex="${date === selectedDay ? "0" : "-1"}"><span>${mode === "week" ? `${WEEKDAYS[(dateObject(date).getUTCDay() + 6) % 7]} ` : ""}${Number(date.slice(8))}</span>${countMarkup(counts)}</button><ul>${values
          .slice(0, previewLimit)
          .map((entry) => `<li>${entryMarkup(entry, true)}</li>`)
          .join(
            "",
          )}</ul>${values.length > previewLimit ? `<button type="button" class="calendar-cell-more" data-calendar-action="select-day" data-calendar-date="${date}">+${values.length - previewLimit} kayıt</button>` : ""}</div>`;
      })
      .join("")}</div>`;
  }

  function paintDialog() {
    const entries = allEntries();
    const gridScroll =
      dialog.querySelector(".calendar-grid-scroll")?.scrollTop || 0;
    const previousEntries = dialog.querySelector(".calendar-agenda-entries");
    const entriesScroll =
      previousEntries?.dataset.calendarSelected === selectedDay
        ? previousEntries.scrollTop
        : 0;
    dialog.innerHTML = `<div class="calendar-dialog-header"><h2>Takvim</h2><div class="calendar-mode" role="group" aria-label="Takvim görünümü">${[
      ["month", "Ay"],
      ["week", "Hafta"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-calendar-action="mode" data-calendar-mode="${value}" aria-pressed="${mode === value}">${label}</button>`,
      )
      .join(
        "",
      )}</div><button type="button" class="calendar-dialog-close" data-calendar-action="close" aria-label="Takvimi kapat">${icon("close")}</button></div><div class="calendar-dialog-body">${navigation(true)}${legend()}<div class="calendar-expanded-workspace"><div class="calendar-grid-scroll">${expandedCells(entries)}</div>${agenda(entries, true)}</div></div>`;
    dialog.querySelector(".calendar-grid-scroll").scrollTop = gridScroll;
    dialog.querySelector(".calendar-agenda-entries").scrollTop = entriesScroll;
  }

  function belongs(element) {
    return element?.closest?.(`[data-calendar-owner="${owner}"]`);
  }

  function focusDescriptor() {
    const element = document.activeElement;
    if (!belongs(element)) return null;
    const button = element.closest("[data-calendar-action]");
    return {
      expanded: dialog.contains(element),
      agenda: Boolean(element.closest(".calendar-day-agenda")),
      select: element.matches(".calendar-new-type"),
      entries: element.matches(".calendar-agenda-entries"),
      action: button?.dataset.calendarAction,
      date: button?.dataset.calendarDate,
      id: button?.dataset.calendarRecordId,
      mode: button?.dataset.calendarMode,
    };
  }

  function restoreFocus(descriptor) {
    if (!descriptor) return false;
    const container =
      descriptor.expanded && dialog.open
        ? dialog
        : root.querySelector(
            `.dashboard-calendar[data-calendar-owner="${owner}"]`,
          );
    if (!container) return false;
    const control = descriptor.entries
      ? container.querySelector(".calendar-agenda-entries")
      : descriptor.select
        ? container.querySelector(".calendar-new-type")
        : [...container.querySelectorAll("[data-calendar-action]")].find(
            (element) =>
              element.dataset.calendarAction === descriptor.action &&
              (!descriptor.date ||
                element.dataset.calendarDate === descriptor.date) &&
              (!descriptor.id ||
                element.dataset.calendarRecordId === descriptor.id) &&
              (!descriptor.mode ||
                element.dataset.calendarMode === descriptor.mode) &&
              (!descriptor.agenda || element.closest(".calendar-day-agenda")),
          );
    if (!control) return false;
    control.focus({ preventScroll: true });
    return true;
  }

  const coveredByModal = () =>
    [...document.querySelectorAll("dialog:modal")].some(
      (element) => element !== dialog,
    );

  let entriesScrollTop = 0;
  function onScroll(event) {
    const entries = event.target;
    if (
      entries?.classList?.contains("calendar-agenda-entries") &&
      entries.closest(`[data-calendar-owner="${owner}"]`) &&
      root.contains(entries)
    )
      entriesScrollTop = entries.scrollTop;
  }

  function refresh() {
    if (destroyed) return;
    const focused = focusDescriptor();
    const compact = root.querySelector(
      `.dashboard-calendar[data-calendar-owner="${owner}"]`,
    );
    const previousEntries = compact?.querySelector(".calendar-agenda-entries");
    // The scroll position is remembered as it changes: reading it here, right
    // after the page was rewritten, forced a whole extra page layout.
    const entriesScroll =
      previousEntries?.dataset.calendarSelected === selectedDay
        ? entriesScrollTop
        : 0;
    if (compact) {
      compact.outerHTML = render();
      entriesScrollTop = entriesScroll;
      if (entriesScroll)
        root.querySelector(
          `[data-calendar-owner="${owner}"] .calendar-agenda-entries`,
        ).scrollTop = entriesScroll;
    }
    const covered = coveredByModal();
    if (dialog.open) {
      if (editorHandoff || covered) expandedDirty = true;
      else {
        paintDialog();
        expandedDirty = false;
      }
    }
    if (!editorHandoff && !covered) restoreFocus(focused);
  }

  function selectDay(date, focus = false, expanded = false) {
    if (!date) return;
    const selectedMonth = makePlanningPeriod("monthly", date);
    selectedDay = date;
    month = selectedMonth;
    refresh();
    if (focus) {
      const container = expanded && dialog.open ? dialog : root;
      revealSelectedDay(container, true);
    }
  }

  function revealSelectedDay(container, focus = false) {
    const button = container.querySelector(
      `[data-calendar-action="select-day"][data-calendar-date="${selectedDay}"]`,
    );
    if (!button) return;
    if (focus) button.focus({ preventScroll: true });
    if (dialog.contains(button))
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function closeExpanded(restore = true) {
    restoreOnClose = restore;
    editorReturnFocus = null;
    editorHandoff = false;
    expandedDirty = false;
    if (dialog.open) dialog.close();
  }

  function open(trigger = null) {
    if (destroyed) return;
    expandedTrigger = trigger;
    restoreOnClose = true;
    paintDialog();
    if (!dialog.open) dialog.showModal();
    revealSelectedDay(dialog, true);
  }

  function resumeExpanded() {
    if (!dialog.open || coveredByModal()) return;
    const focused = editorReturnFocus || focusDescriptor();
    editorReturnFocus = null;
    editorHandoff = false;
    refresh();
    if (!restoreFocus(focused)) revealSelectedDay(dialog, true);
  }

  function openCalendarEditor(callback, expanded) {
    if (!expanded) {
      callback();
      return;
    }
    editorReturnFocus = focusDescriptor();
    editorHandoff = true;
    try {
      callback();
    } finally {
      // A missing record or a rejected opening must not leave refresh suspended.
      if (!coveredByModal()) resumeExpanded();
    }
  }

  function onClick(event) {
    const button = event.target.closest?.("[data-calendar-action]");
    if (!button) {
      const cell = event.target.closest?.(
        ".calendar-expanded-cell[data-calendar-date]",
      );
      if (
        !cell ||
        !dialog.contains(cell) ||
        !belongs(cell) ||
        event.target.closest?.(
          'button, a[href], input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="link"]',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      selectDay(cell.dataset.calendarDate, true, true);
      return;
    }
    if (!belongs(button) || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const expanded = dialog.contains(button);
    const action = button.dataset.calendarAction;
    if (action === "select-day")
      selectDay(button.dataset.calendarDate, true, expanded);
    else if (action === "prev" || action === "next") {
      const amount = action === "prev" ? -1 : 1;
      const next =
        expanded && mode === "week"
          ? shiftedDay(selectedDay, amount * 7)
          : shiftedMonth(selectedDay, amount);
      if (next) selectDay(next);
    } else if (action === "today") selectDay(readToday());
    else if (action === "mode") {
      mode = button.dataset.calendarMode === "week" ? "week" : "month";
      refresh();
      revealSelectedDay(dialog);
    } else if (action === "expand") open(button);
    else if (action === "close") closeExpanded();
    else if (action === "open-record") {
      const id = button.dataset.calendarRecordId;
      const entry = allEntries().find((item) => item.record.id === id);
      if (entry && entry.date !== selectedDay) selectDay(entry.date);
      openCalendarEditor(() => onOpenRecord(id), expanded);
    } else if (action === "new-record") {
      const date = selectedDay;
      const type = newType;
      openCalendarEditor(
        () =>
          onNewRecord({
            type,
            values:
              type === "waiting"
                ? { nextFollowUpDate: date }
                : { dueDate: date },
          }),
        expanded,
      );
    }
  }

  function onChange(event) {
    if (!event.target.matches?.(".calendar-new-type") || !belongs(event.target))
      return;
    newType = event.target.value === "waiting" ? "waiting" : "daily";
    refresh();
  }

  function onKeyDown(event) {
    const button = event.target.closest?.(
      '[data-calendar-action="select-day"][data-calendar-date]',
    );
    if (
      !button ||
      !belongs(button) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const date = button.dataset.calendarDate;
    const offset = (dateObject(date).getUTCDay() + 6) % 7;
    const dates = {
      ArrowLeft: () => shiftedDay(date, -1),
      ArrowRight: () => shiftedDay(date, 1),
      ArrowUp: () => shiftedDay(date, -7),
      ArrowDown: () => shiftedDay(date, 7),
      Home: () => shiftedDay(date, -offset),
      End: () => shiftedDay(date, 6 - offset),
      PageUp: () => shiftedMonth(date, -1),
      PageDown: () => shiftedMonth(date, 1),
    };
    if (!dates[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    selectDay(dates[event.key](), true, dialog.contains(button));
  }

  function onClose() {
    if (dialog.open) return;
    editorReturnFocus = null;
    editorHandoff = false;
    expandedDirty = false;
    if (restoreOnClose && !document.querySelector("dialog:modal")) {
      const trigger = expandedTrigger?.isConnected
        ? expandedTrigger
        : root.querySelector(
            `[data-calendar-owner="${owner}"] [data-calendar-action="expand"]`,
          ) || root.querySelector('[data-action="open-calendar"]');
      trigger?.focus({ preventScroll: true });
    }
    restoreOnClose = true;
  }

  function onOverlayClose(event) {
    if (
      destroyed ||
      !dialog.open ||
      event.target === dialog ||
      event.target.open ||
      (!editorHandoff && !expandedDirty) ||
      coveredByModal()
    )
      return;
    resumeExpanded();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("scroll", onScroll, true);
  root.addEventListener("change", onChange);
  root.addEventListener("keydown", onKeyDown);
  const separateDialog = !root.contains(dialog);
  if (separateDialog) {
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("change", onChange);
    dialog.addEventListener("keydown", onKeyDown);
  }
  dialog.addEventListener("close", onClose);
  document.addEventListener("close", onOverlayClose, true);

  function destroy() {
    destroyed = true;
    root.removeEventListener("click", onClick);
    root.removeEventListener("scroll", onScroll, true);
    root.removeEventListener("change", onChange);
    root.removeEventListener("keydown", onKeyDown);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("change", onChange);
    dialog.removeEventListener("keydown", onKeyDown);
    dialog.removeEventListener("close", onClose);
    document.removeEventListener("close", onOverlayClose, true);
    dialog.remove();
  }

  return { render, refresh, open, destroy };
}
