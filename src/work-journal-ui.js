import { localDate } from "./model.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";
import { weekWorkSummary } from "./work-journal.js";
import { dateInput, dateValue } from "./date-picker.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const journalIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v13h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 3h8v4H8zM8 12h8M8 16h5"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const previousIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
const nextIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
const editIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-13 13H3v-5L16 3Zm-2 2 5 5"/></svg>';
const trashIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "long",
});

export function formatWorkDuration(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  const seconds = Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  if (hours) return `${hours} sa${minutes ? ` ${minutes} dk` : ""}`;
  if (minutes)
    return `${minutes} dk${seconds % 60 ? ` ${seconds % 60} sn` : ""}`;
  if (seconds) return `${seconds} sn`;
  return value ? "1 sn’den az" : "0 dk";
}

function dateLabel(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? String(date || "")
    : dateFormatter.format(parsed);
}

function savedEntries(record) {
  return Array.isArray(record?.workLog) ? record.workLog : [];
}

function latestFirst(entries) {
  return [...entries].sort(
    (first, second) =>
      String(second.date).localeCompare(String(first.date)) ||
      String(second.endedAt).localeCompare(String(first.endedAt)) ||
      String(second.id).localeCompare(String(first.id)),
  );
}

function recentRecords(records) {
  return [...records].sort((first, second) => {
    const firstEntry = latestFirst(first.entries)[0];
    const secondEntry = latestFirst(second.entries)[0];
    return (
      String(secondEntry?.date).localeCompare(String(firstEntry?.date)) ||
      String(secondEntry?.endedAt).localeCompare(String(firstEntry?.endedAt)) ||
      first.title.localeCompare(second.title, "tr") ||
      first.recordId.localeCompare(second.recordId)
    );
  });
}

function entryMarkup(entry, actions = "") {
  return `<li><article class="work-journal-entry" data-log-id="${escapeHtml(entry.id)}"><div class="work-journal-entry-heading"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(dateLabel(entry.date))}</time><div class="work-journal-entry-tools">${actions}</div></div>${entry.note ? `<section class="work-journal-field"><h3>Sonuç</h3><p>${escapeHtml(entry.note)}</p></section>` : '<p class="work-journal-hint">Sonuç notu eklenmemiş.</p>'}${entry.nextAction ? `<section class="work-journal-field"><h3>Sonraki adım</h3><p>${escapeHtml(entry.nextAction)}</p></section>` : ""}</article></li>`;
}

function emptyMarkup(title, text) {
  return `<div class="work-journal-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
}

/** Saved daily work sessions, with explicit corrections and deletions. */
export function createWorkJournalUI({
  root = document.querySelector("#app"),
  getRecords,
  onUpdateEntry,
  onDeleteEntry,
  onBeforeOpen = () => {},
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError("İş günlüğü için kayıt listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const journalDialog = document.createElement("dialog");
  journalDialog.id = "work-journal-dialog";
  journalDialog.className = "modal work-journal-modal work-history-panel";
  journalDialog.setAttribute("aria-label", "Çalışma geçmişi");
  const weekDialog = document.createElement("dialog");
  weekDialog.id = "work-week-dialog";
  weekDialog.className = "modal work-week-modal work-history-panel";
  weekDialog.setAttribute("aria-label", "Haftalık yapılanlar");
  const editDialog = document.createElement("dialog");
  editDialog.id = "work-log-edit-dialog";
  editDialog.className = "modal work-log-edit-modal";
  editDialog.setAttribute("aria-label", "Çalışma kaydını düzenle");
  root.append(journalDialog, weekDialog, editDialog);
  let recordId = null;
  let selectedWeek = makePlanningPeriod("weekly", localDate());
  let journalKey = "";
  let weekKey = "";
  let destroyed = false;
  let editing = null;
  let deleting = null;
  let saving = false;
  let deletionError = "";
  const historyTriggers = new WeakMap();
  const skipRestore = new WeakSet();
  let editOrigin = null;

  function canActivate() {
    return !destroyed && !saving && !editDialog.open;
  }

  function closeHistory(dialog, restoreFocus = true) {
    if (!dialog.open) return;
    if (!restoreFocus) skipRestore.add(dialog);
    dialog.close();
  }

  function restoreHistoryFocus(event) {
    const dialog = event.currentTarget;
    if (dialog.open) return;
    if (skipRestore.has(dialog)) {
      skipRestore.delete(dialog);
      return;
    }
    if (destroyed || document.querySelector("dialog:modal")) return;
    const previous = historyTriggers.get(dialog);
    const fallback =
      dialog === journalDialog
        ? [...root.querySelectorAll('[data-action="work-journal"]')].find(
            (control) => control.dataset.id === recordId,
          )
        : root.querySelector('[data-action="work-session-history"]');
    (previous?.isConnected ? previous : fallback)?.focus({
      preventScroll: true,
    });
  }

  function onHistoryCancel(event) {
    if (saving) event.preventDefault();
  }

  function find(id) {
    return getRecords().find((record) => record.id === id);
  }

  function findEntry(id, entryId) {
    const record = find(id);
    return record?.type === "daily"
      ? savedEntries(record).find((entry) => entry.id === entryId)
      : null;
  }

  function entryActions(id, entry) {
    const values = `data-record-id="${escapeHtml(id)}" data-entry-id="${escapeHtml(entry.id)}"`;
    if (deleting?.recordId === id && deleting.entryId === entry.id)
      return `<span class="work-log-delete-confirm" role="group" aria-label="Oturumu silme"><span>Bu oturum silinsin mi?</span><button type="button" data-action="work-log-delete-confirm" ${values} ${saving ? "disabled" : ""}>Sil</button><button type="button" data-action="work-log-delete-cancel" ${saving ? "disabled" : ""}>Vazgeç</button>${deletionError ? `<span class="work-log-delete-error" role="alert">${escapeHtml(deletionError)}</span>` : ""}</span>`;
    return `${typeof onUpdateEntry === "function" ? `<button type="button" class="work-log-action" data-action="work-log-edit" ${values} aria-label="${escapeHtml(dateLabel(entry.date))}: oturumu düzenle" title="Oturumu düzenle">${editIcon}<span>Düzenle</span></button>` : ""}${typeof onDeleteEntry === "function" ? `<button type="button" class="work-log-action work-log-delete" data-action="work-log-delete" ${values} aria-label="${escapeHtml(dateLabel(entry.date))}: oturumu sil" title="Oturumu sil">${trashIcon}<span>Sil</span></button>` : ""}`;
  }

  function buttonContent(record) {
    const count = savedEntries(record).length;
    return `${journalIcon}<span>Çalışma geçmişi</span><small>${count} kayıt</small>`;
  }

  function buttonLabel(record, count) {
    return `${record.title}: çalışma geçmişini gör · ${count} kayıt`;
  }

  function buttonTitle(record, count) {
    return `Çalışma geçmişi: ${count} kayıt`;
  }

  function button(record, { compact = false } = {}) {
    if (record?.type !== "daily") return "";
    const count = savedEntries(record).length;
    return `<button type="button" class="${compact ? "row-icon-action " : ""}work-journal-trigger${count ? " has-entries" : ""}" data-action="work-journal" data-id="${escapeHtml(record.id)}" data-session-count="${count}" aria-label="${escapeHtml(buttonLabel(record, count))}" title="${escapeHtml(buttonTitle(record, count))}">${compact ? journalIcon : buttonContent(record)}</button>`;
  }

  function weeklyButton() {
    return `<button type="button" class="btn secondary work-week-trigger" data-action="work-week-report">${journalIcon}<span>Haftalık özet</span></button>`;
  }

  function shell(title, body, closeAction, count, subtitle = "") {
    return `<div class="work-journal-shell"><div class="modal-header"><div class="work-history-heading"><div class="work-history-heading-line"><h2>${escapeHtml(title)}</h2><span class="work-history-count">${escapeHtml(count)}</span></div>${subtitle ? `<p class="work-journal-subtitle">${escapeHtml(subtitle)}</p>` : ""}</div><button type="button" class="close-modal" data-action="${closeAction}" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body work-journal-body" tabindex="0" aria-label="Çalışma kayıtları">${body}</div><div class="modal-footer"><button type="button" class="btn primary" data-action="${closeAction}">Tamam</button></div></div>`;
  }

  function replaceContent(dialog, markup) {
    const scrollTop = dialog.querySelector(".modal-body")?.scrollTop || 0;
    const active = document.activeElement;
    const action = dialog.contains(active) ? active?.dataset?.action : null;
    dialog.innerHTML = markup;
    const body = dialog.querySelector(".modal-body");
    if (body) body.scrollTop = scrollTop;
    if (action)
      [...dialog.querySelectorAll("[data-action]")]
        .find((element) => element.dataset.action === action)
        ?.focus({ preventScroll: true });
  }

  function renderJournal(force = false) {
    const record = find(recordId);
    const entries = savedEntries(record);
    const nextKey = JSON.stringify([
      recordId,
      record?.type,
      record?.title,
      entries,
    ]);
    if (!force && nextKey === journalKey) return;
    let body;
    if (!record || record.type !== "daily") {
      body = emptyMarkup(
        "Bu günlük iş bulunamadı",
        "Kayıt silinmiş veya başka bir listeye taşınmış olabilir.",
      );
    } else {
      body = `${
        entries.length
          ? `<ol class="work-journal-list">${latestFirst(entries)
              .map((entry) =>
                entryMarkup(entry, entryActions(record.id, entry)),
              )
              .join("")}</ol>`
          : emptyMarkup(
              "Henüz çalışma kaydı yok",
              "Bu işte çalışmayı bitirip sonucu kaydettiğinde burada görünür.",
            )
      }`;
    }
    replaceContent(
      journalDialog,
      shell(
        "Çalışma geçmişi",
        body,
        "work-journal-close",
        `${entries.length} kayıt`,
        record?.type === "daily" ? record.title : "",
      ),
    );
    journalKey = nextKey;
  }

  function renderWeek(force = false) {
    const summary = weekWorkSummary(getRecords(), selectedWeek);
    const nextKey = JSON.stringify([selectedWeek.key, summary]);
    if (!force && nextKey === weekKey) return;
    const isCurrent =
      selectedWeek.key === makePlanningPeriod("weekly", localDate()).key;
    const navigation = `<div class="work-week-navigation"><button type="button" class="btn secondary small" data-action="work-week-prev" aria-label="Önceki hafta">${previousIcon}</button><strong class="work-week-period">${escapeHtml(selectedWeek.label)}</strong><button type="button" class="btn secondary small" data-action="work-week-next" aria-label="Sonraki hafta">${nextIcon}</button><button type="button" class="btn secondary small" data-action="work-week-current" ${isCurrent ? "disabled" : ""}>Bu hafta</button></div>`;
    const content = summary.sessionCount
      ? `<div class="work-week-records">${recentRecords(summary.byRecord)
          .map(
            (record) =>
              `<section class="work-week-record" data-record-id="${escapeHtml(record.recordId)}"><header><h3>${escapeHtml(record.title)}</h3><span>${record.sessionCount} kayıt</span></header><ol class="work-journal-list">${latestFirst(
                record.entries,
              )
                .map((entry) =>
                  entryMarkup(entry, entryActions(record.recordId, entry)),
                )
                .join("")}</ol></section>`,
          )
          .join("")}</div>`
      : emptyMarkup(
          "Bu hafta çalışma kaydı yok",
          "Günlük işlerde bitirip kaydettiğin sonuçlar burada toplanır. Önceki haftaları da inceleyebilirsin.",
        );
    const body = `${navigation}${content}`;
    replaceContent(
      weekDialog,
      shell(
        "Haftalık yapılanlar",
        body,
        "work-week-close",
        `${summary.recordCount} iş · ${summary.sessionCount} kayıt`,
      ),
    );
    weekKey = nextKey;
  }

  function refreshReports() {
    if (journalDialog.open) renderJournal(true);
    if (weekDialog.open) renderWeek(true);
  }

  function releaseCalendar() {
    const calendar = editDialog.querySelector("#odak-date-picker");
    if (!calendar) return;
    if (calendar.matches(":popover-open")) calendar.hidePopover();
    root.append(calendar);
  }

  function editError(message) {
    const error = editDialog.querySelector("#work-log-edit-error");
    if (!error) return;
    const text = String(message ?? "").trim();
    error.textContent = text;
    error.hidden = !text;
  }

  function refreshEditor() {
    if (!editDialog.open || !editing) return;
    const current = findEntry(editing.recordId, editing.entryId);
    const unavailable =
      !current || JSON.stringify(current) !== editing.baseline;
    const fieldset = editDialog.querySelector("fieldset");
    const save = editDialog.querySelector(".work-log-edit-save");
    fieldset.disabled = unavailable || saving;
    save.disabled = unavailable || saving;
    if (unavailable)
      editError(
        current
          ? "Bu oturum başka bir pencerede değişti. Yazdıkların korunuyor; güncel kaydı açmak için pencereyi kapat."
          : "Bu oturum artık bulunamıyor. Yazdıkların bu pencereyi kapatana kadar korunur.",
      );
  }

  function openEditor(id, entryId) {
    if (typeof onUpdateEntry !== "function") return;
    const record = find(id);
    const entry = findEntry(id, entryId);
    if (!entry) throw new Error("Düzenlenecek çalışma oturumu bulunamadı.");
    if (editDialog.open) return;
    editOrigin = {
      parent: journalDialog.open ? journalDialog : weekDialog,
      recordId: id,
      entryId,
    };
    deleting = null;
    deletionError = "";
    refreshReports();
    editing = {
      recordId: id,
      entryId,
      baseline: JSON.stringify(entry),
    };
    releaseCalendar();
    editDialog.innerHTML = `<form id="work-log-edit-form"><div class="modal-header"><h2>Çalışma kaydını düzenle</h2><button type="button" class="close-modal" data-action="work-log-edit-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body work-log-edit-body"><p class="work-journal-subtitle">${escapeHtml(record.title)}</p><fieldset class="work-log-edit-fields"><label class="field">Kayıt tarihi${dateInput({ name: "workLogDate", id: "work-log-edit-date", value: entry.date, label: "Kayıt tarihi", max: localDate() })}</label><label class="field">Sonuç<textarea name="workLogNote" maxlength="10000" rows="3" aria-describedby="work-log-edit-shortcuts">${escapeHtml(entry.note)}</textarea></label><p id="work-log-edit-shortcuts" class="field-help">Enter ile kaydet, Shift+Enter ile alt satıra geç.</p></fieldset><p id="work-log-edit-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="work-log-edit-close">Vazgeç</button><button type="submit" class="btn primary work-log-edit-save">Değişiklikleri kaydet</button></div></form>`;
    editDialog.showModal();
    editDialog
      .querySelector('[name="workLogNote"]')
      .focus({ preventScroll: true });
  }

  async function saveEdit(event) {
    if (!event.target.matches("#work-log-edit-form")) return;
    event.preventDefault();
    if (saving || !editing) return;
    try {
      const current = findEntry(editing.recordId, editing.entryId);
      if (!current || JSON.stringify(current) !== editing.baseline)
        throw new Error(
          "Oturum değişmiş veya silinmiş. Yazdıkların korunuyor; güncel kaydı yeniden aç.",
        );
      const form = event.target;
      const date = dateValue(form.elements.workLogDate);
      if (!date) throw new Error("Kayıt tarihini seç.");
      if (!form.reportValidity()) return;
      const patch = {
        date,
        note: form.elements.workLogNote.value,
      };
      editError("");
      saving = true;
      refreshEditor();
      if (await onUpdateEntry(editing.recordId, editing.entryId, patch)) {
        releaseCalendar();
        editDialog.close();
        refreshReports();
      } else
        editError(
          "Oturum kaydedilemedi. Yazdıkların korunuyor; yeniden deneyebilirsin.",
        );
    } catch (error) {
      editError(error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
      refreshEditor();
    }
  }

  async function deleteEntry(id, entryId) {
    if (saving || !deleting || typeof onDeleteEntry !== "function") return;
    try {
      const current = findEntry(id, entryId);
      if (!current || JSON.stringify(current) !== deleting.baseline)
        throw new Error(
          "Oturum değişmiş veya silinmiş. Güncel kaydı yeniden aç.",
        );
      saving = true;
      deletionError = "";
      refreshReports();
      if (await onDeleteEntry(id, entryId)) deleting = null;
      else
        deletionError =
          "Oturum silinemedi. Kayıt korunuyor; yeniden deneyebilirsin.";
    } catch (error) {
      deletionError = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
      refreshReports();
    }
  }

  function close() {
    if (editDialog.open) editDialog.close();
    closeHistory(journalDialog, false);
    closeHistory(weekDialog, false);
  }

  function openWeek(trigger = document.activeElement) {
    if (!canActivate()) return;
    try {
      onBeforeOpen();
      closeHistory(journalDialog, false);
      if (!weekDialog.open) historyTriggers.set(weekDialog, trigger);
      selectedWeek = makePlanningPeriod("weekly", localDate());
      renderWeek(true);
      if (!weekDialog.open) weekDialog.show();
      weekDialog.querySelector(".modal-body").scrollTop = 0;
      weekDialog.querySelector(".close-modal")?.focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function refresh() {
    if (destroyed) return;
    for (const control of root.querySelectorAll(
      ".work-journal-trigger[data-id]",
    )) {
      const record = find(control.dataset.id);
      control.hidden = record?.type !== "daily";
      const count = control.hidden ? 0 : savedEntries(record).length;
      control.classList.toggle("has-entries", count > 0);
      control.dataset.sessionCount = String(count);
      if (control.hidden) continue;
      const iconOnly = control.classList.contains("row-icon-action");
      control.innerHTML = iconOnly ? journalIcon : buttonContent(record);
      control.title = buttonTitle(record, count);
      control.setAttribute("aria-label", buttonLabel(record, count));
    }
    if (journalDialog.open) renderJournal();
    if (weekDialog.open) renderWeek();
    refreshEditor();
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    const { action, id } = control.dataset;
    if (
      ![
        "work-journal",
        "work-week-report",
        "work-journal-close",
        "work-week-close",
        "work-week-prev",
        "work-week-next",
        "work-week-current",
        "work-log-edit",
        "work-log-edit-close",
        "work-log-delete",
        "work-log-delete-confirm",
        "work-log-delete-cancel",
      ].includes(action)
    )
      return;
    event.preventDefault();
    try {
      if (action === "work-log-edit")
        openEditor(control.dataset.recordId, control.dataset.entryId);
      else if (action === "work-log-edit-close") editDialog.close();
      else if (action === "work-log-delete") {
        const entry = findEntry(
          control.dataset.recordId,
          control.dataset.entryId,
        );
        if (!entry || typeof onDeleteEntry !== "function") return;
        deleting = {
          recordId: control.dataset.recordId,
          entryId: control.dataset.entryId,
          baseline: JSON.stringify(entry),
        };
        deletionError = "";
        refreshReports();
      } else if (action === "work-log-delete-confirm") {
        void deleteEntry(control.dataset.recordId, control.dataset.entryId);
      } else if (action === "work-log-delete-cancel") {
        deleting = null;
        deletionError = "";
        refreshReports();
      } else if (action === "work-journal-close") {
        if (!saving) closeHistory(journalDialog);
      } else if (action === "work-week-close") {
        if (!saving) closeHistory(weekDialog);
      } else if (action === "work-journal") {
        if (!canActivate() || find(id)?.type !== "daily") return;
        onBeforeOpen();
        recordId = id;
        closeHistory(weekDialog, false);
        historyTriggers.set(journalDialog, control);
        renderJournal(true);
        if (!journalDialog.open) journalDialog.show();
        journalDialog.querySelector(".modal-body").scrollTop = 0;
        journalDialog
          .querySelector(".close-modal")
          ?.focus({ preventScroll: true });
      } else if (action === "work-week-report") {
        openWeek(control);
      } else if (weekDialog.open) {
        selectedWeek =
          action === "work-week-current"
            ? makePlanningPeriod("weekly", localDate())
            : shiftPlanningPeriod(
                selectedWeek,
                action === "work-week-prev" ? -1 : 1,
              );
        renderWeek(true);
        weekDialog.querySelector(".modal-body").scrollTop = 0;
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function onEscape(event) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      saving ||
      document.querySelector("dialog:modal, :popover-open")
    )
      return;
    const dialog = weekDialog.open
      ? weekDialog
      : journalDialog.open
        ? journalDialog
        : null;
    if (!dialog) return;
    const focusedPanel = document.activeElement?.closest?.("dialog[open]");
    if (focusedPanel && focusedPanel !== dialog) return;
    event.preventDefault();
    closeHistory(dialog);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    close();
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", saveEdit);
    owner.removeEventListener("pagehide", destroy);
    owner.removeEventListener("keydown", onEscape);
    journalDialog.remove();
    weekDialog.remove();
    editDialog.remove();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", saveEdit);
  editDialog.addEventListener("close", () => {
    if (editDialog.open) return;
    releaseCalendar();
    editing = null;
    const origin = editOrigin;
    editOrigin = null;
    if (destroyed || !origin?.parent.open) return;
    const trigger = [
      ...origin.parent.querySelectorAll('[data-action="work-log-edit"]'),
    ].find(
      (control) =>
        control.dataset.recordId === origin.recordId &&
        control.dataset.entryId === origin.entryId,
    );
    (trigger || origin.parent.querySelector(".close-modal"))?.focus({
      preventScroll: true,
    });
  });
  for (const dialog of [journalDialog, weekDialog]) {
    dialog.addEventListener("close", restoreHistoryFocus);
    dialog.addEventListener("cancel", onHistoryCancel);
  }
  owner.addEventListener("keydown", onEscape);
  owner.addEventListener("pagehide", destroy, { once: true });
  return {
    button,
    weeklyButton,
    openWeek,
    refresh,
    close,
    canActivate,
    destroy,
  };
}
