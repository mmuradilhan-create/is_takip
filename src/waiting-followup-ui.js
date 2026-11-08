import { localDate } from "./model.js";
import { dateInput, dateValue, formatDateInput } from "./date-picker.js";
import { isPlainSaveEnter } from "./record-form-shortcuts.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const followUpIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const calendarIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M4 4h16a1 1 0 0 1 1 1v15H3V5a1 1 0 0 1 1-1Z"/></svg>';
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const CLOSED = new Set(["completed", "cancelled", "transferred"]);

function dateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : dateFormatter.format(date);
}

function latestEntries(record) {
  if (!Array.isArray(record?.followUpLog)) return [];
  return record.followUpLog
    .map((entry, index) => ({ entry, index }))
    .sort(
      (first, second) =>
        String(second.entry.date).localeCompare(String(first.entry.date)) ||
        second.index - first.index,
    )
    .map(({ entry }) => entry);
}

/** Save one deliberate follow-up without changing the waiting topic's status. */
export function createWaitingFollowUpUI({
  root = document.querySelector("#app"),
  getRecords,
  onSave,
  onEdit,
  today = () => localDate(),
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function" || typeof onSave !== "function")
    throw new TypeError(
      "Takip kaydı için kayıt listesi ve kaydetme işlevi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const dialog = document.createElement("dialog");
  dialog.id = "waiting-followup-dialog";
  dialog.className = "modal waiting-followup-modal";
  dialog.setAttribute("aria-label", "Konu takibi");
  root.append(dialog);
  let recordId = null;
  let entryId = null;
  let initialNextFollowUpDate = "";
  let destroyed = false;
  let saving = false;
  let editingSaving = false;
  let generation = 0;
  let lastRecord = null;
  const editDrafts = new Map();
  const currentDay = () => (typeof today === "function" ? today() : today);
  const find = (id) => getRecords().find((record) => record.id === id);

  function makeId() {
    return (
      owner.crypto?.randomUUID?.() ||
      `follow-up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    );
  }

  function button(record, { compact = false } = {}) {
    if (record?.type !== "waiting") return "";
    const closed = CLOSED.has(record.status);
    const label = closed ? "Takip geçmişi" : "Takip ettim";
    return `<button type="button" class="waiting-followup-trigger${compact ? " is-compact" : ""}" data-action="waiting-followup" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: ${label.toLocaleLowerCase("tr-TR")}" aria-haspopup="dialog" aria-controls="waiting-followup-dialog" title="${closed ? "Kaydedilen takipleri gör" : "Yaptığın takibi ve sonraki takip tarihini kaydet"}">${followUpIcon}<span>${label}</span></button>`;
  }

  function editMarkup(entry, draft, unavailable = false) {
    const input = (name, value, label, max) =>
      dateInput({
        name,
        id: `waiting-${name}-${entry.id}`,
        value: "",
        label,
        ...(max ? { max } : {}),
      }).replace('value=""', `value="${escapeHtml(value)}"`);
    return `<fieldset class="waiting-followup-entry-fields" data-followup-edit="${escapeHtml(entry.id)}"${unavailable || editingSaving || saving ? " disabled" : ""}><legend>Takip kaydını düzenle</legend><div class="form-grid"><label class="field">Takip tarihi${input("editFollowUpDate", draft.values.date, "Takip tarihi", currentDay())}</label><label class="field">Sonraki takip tarihi${input("editNextFollowUpDate", draft.values.nextFollowUpDate, "Sonraki takip tarihi")}</label><label class="field full">Kısa sonuç (isteğe bağlı)<textarea name="editFollowUpNote" maxlength="10000" rows="3">${escapeHtml(draft.values.note)}</textarea></label>${Object.hasOwn(draft.expectedEntry, "previousUpdate") ? `<label class="field full">Önceki son gelişme<textarea name="editPreviousUpdate" maxlength="10000" rows="3">${escapeHtml(draft.values.previousUpdate)}</textarea></label>` : ""}</div></fieldset><p class="waiting-followup-edit-error" data-followup-edit-error role="alert"${draft.error ? "" : " hidden"}>${escapeHtml(draft.error)}</p><div class="waiting-followup-entry-actions"><button type="button" class="btn small" data-action="waiting-followup-edit-cancel"${editingSaving || saving ? " disabled" : ""}>Vazgeç</button><button type="button" class="btn small primary" data-action="waiting-followup-edit-save"${unavailable || editingSaving || saving ? " disabled" : ""}>Değişiklikleri kaydet</button></div>`;
  }

  function historyMarkup(record, unavailable = false) {
    const entries = latestEntries(record);
    const currentIds = new Set(entries.map((entry) => entry.id));
    const displayed = [
      ...entries,
      ...[...editDrafts]
        .filter(([id]) => !currentIds.has(id))
        .map(([, draft]) => draft.expectedEntry),
    ];
    return `<div class="waiting-followup-history-heading"><h3 tabindex="-1" data-followup-history-heading>Takip geçmişi</h3><span>${entries.length}</span></div>${
      displayed.length
        ? `<ol>${displayed
            .map((entry) => {
              const draft = editDrafts.get(entry.id);
              const missing = !currentIds.has(entry.id);
              if (draft && !editingSaving) {
                if (unavailable)
                  draft.error =
                    "Bu konu artık bulunamıyor. Taslağın korunuyor.";
                else if (missing)
                  draft.error =
                    "Bu takip kaydı artık bulunamıyor. Taslağın korunuyor.";
                else if (
                  JSON.stringify(entry) !== JSON.stringify(draft.expectedEntry)
                )
                  draft.error =
                    "Bu takip kaydı başka bir pencerede değişti. Taslağın korunuyor; güncel kaydı yeniden açarak devam et.";
              }
              return `<li data-followup-id="${escapeHtml(entry.id)}"><div class="waiting-followup-entry-heading"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(dateLabel(entry.date))}</time>${typeof onEdit === "function" ? `<button type="button" class="waiting-followup-edit" data-action="waiting-followup-edit"${draft ? " hidden" : ""}${unavailable || saving || editingSaving ? " disabled" : ""}>Düzenle</button>` : ""}</div>${draft ? editMarkup(entry, draft, unavailable || missing) : `<p class="waiting-followup-result${entry.note ? "" : " waiting-followup-muted"}">${escapeHtml(entry.note || "Sonuç notu eklenmemiş.")}</p>${Object.hasOwn(entry, "previousUpdate") ? `<div class="waiting-followup-previous"><span>Önceki son gelişme</span><p>${escapeHtml(entry.previousUpdate || "")}</p></div>` : ""}${entry.nextFollowUpDate ? `<span class="waiting-followup-planned">${calendarIcon}Sonraki takip: ${escapeHtml(dateLabel(entry.nextFollowUpDate))}</span>` : ""}`}</li>`;
            })
            .join("")}</ol>`
        : '<p class="waiting-followup-muted waiting-followup-empty">Henüz takip kaydı yok.</p>'
    }`;
  }

  const editFields = {
    editFollowUpDate: "date",
    editNextFollowUpDate: "nextFollowUpDate",
    editFollowUpNote: "note",
    editPreviousUpdate: "previousUpdate",
  };

  function captureEditDrafts() {
    for (const fields of dialog.querySelectorAll("[data-followup-edit]")) {
      const draft = editDrafts.get(fields.dataset.followupEdit);
      if (!draft) continue;
      for (const control of fields.querySelectorAll("[name]"))
        if (Object.hasOwn(editFields, control.name))
          draft.values[editFields[control.name]] = control.value;
    }
  }

  function entryNode(id) {
    return [...dialog.querySelectorAll("li[data-followup-id]")].find(
      (node) => node.dataset.followupId === id,
    );
  }

  function focusEntry(id) {
    const control = entryNode(id)?.querySelector(
      '[data-action="waiting-followup-edit"]',
    );
    if (control && !control.disabled && !control.hidden) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else
      dialog
        .querySelector('.modal-header [data-action="waiting-followup-close"]')
        ?.focus({ preventScroll: true });
  }

  function releaseCalendar() {
    // The shared calendar is temporarily hosted by its active modal. Keep it
    // alive when this dialog closes or replaces its own contents.
    const calendar = dialog.querySelector("#odak-date-picker");
    if (!calendar) return;
    if (calendar.matches(":popover-open")) calendar.hidePopover();
    root.append(calendar);
  }

  function setError(message) {
    const target = dialog.querySelector("#waiting-followup-error");
    if (target) target.textContent = message;
  }

  function reminderChanged(record) {
    return (record?.nextFollowUpDate || "") !== initialNextFollowUpDate;
  }

  const reminderConflict =
    "Sonraki takip tarihi başka bir pencerede değişti. Taslağın korunuyor; güncel planı görmek için pencereyi kapatıp yeniden aç.";

  function render(record) {
    releaseCalendar();
    lastRecord = record;
    const closed = CLOSED.has(record.status);
    dialog.innerHTML = `<form id="waiting-followup-form"><div class="modal-header"><h2>${closed ? "Takip geçmişi" : "Takip ettim"}</h2><button type="button" class="close-modal" data-action="waiting-followup-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body waiting-followup-body"><p class="waiting-followup-topic">${escapeHtml(record.title)}</p><div class="waiting-followup-latest" ${record.latestUpdate ? "" : "hidden"}><span>Son gelişme</span><p>${escapeHtml(record.latestUpdate || "")}</p></div><p class="waiting-followup-availability" hidden></p><fieldset class="waiting-followup-fields" ${closed ? "disabled hidden" : ""}><div class="form-grid"><label class="field">Takip tarihi${dateInput({ name: "followUpDate", id: "waiting-followup-date", value: currentDay(), label: "Takip tarihi", max: currentDay() })}</label><label class="field">Sonraki takip tarihi${dateInput({ name: "nextFollowUpDate", id: "waiting-followup-next-date", value: record.nextFollowUpDate || "", label: "Sonraki takip tarihi" })}</label><label class="field full">Kısa sonuç (isteğe bağlı)<textarea name="followUpNote" maxlength="10000" rows="3" placeholder="Örn. Hatırlatma gönderdim; cuma günü yanıt bekliyorum."></textarea></label></div></fieldset><div id="waiting-followup-error" class="error-message" role="alert"></div><section class="waiting-followup-history">${historyMarkup(record)}</section></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="waiting-followup-close">${closed ? "Kapat" : "Vazgeç"}</button><button type="submit" class="btn primary waiting-followup-save" ${closed ? "hidden disabled" : ""}>${followUpIcon}Takibi kaydet</button></div></form>`;
  }

  function focusField(focusNextDate) {
    const input = dialog.querySelector(
      focusNextDate ? '[name="nextFollowUpDate"]' : '[name="followUpNote"]',
    );
    if (input && !input.closest("fieldset")?.disabled)
      input.focus({ preventScroll: true });
  }

  function focusHistorySection() {
    const history = dialog.querySelector(".waiting-followup-history");
    const target =
      history?.querySelector(
        '[data-action="waiting-followup-edit"]:not([hidden]):not(:disabled)',
      ) || history?.querySelector("[data-followup-history-heading]");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function open(id, { focusNextDate = false, focusHistory = false } = {}) {
    if (destroyed) return;
    try {
      const record = find(id);
      if (record?.type !== "waiting")
        throw new Error("Takip edilecek konu artık bulunamıyor.");
      if (dialog.open) {
        if (recordId !== id)
          throw new Error("Açık takip taslağını önce kaydet veya kapat.");
        if (focusHistory) focusHistorySection();
        else focusField(focusNextDate);
        return;
      }
      generation++;
      saving = false;
      editingSaving = false;
      recordId = id;
      entryId = makeId();
      editDrafts.clear();
      initialNextFollowUpDate = record.nextFollowUpDate || "";
      render(record);
      dialog.showModal();
      dialog.querySelector(".modal-body").scrollTop = 0;
      if (focusHistory) focusHistorySection();
      else if (!CLOSED.has(record.status)) focusField(focusNextDate);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function close() {
    generation++;
    saving = false;
    editingSaving = false;
    releaseCalendar();
    if (dialog.open) dialog.close();
  }

  function refresh() {
    if (destroyed || !dialog.open) return;
    captureEditDrafts();
    const record = find(recordId);
    const unavailable = record?.type !== "waiting";
    const closed = !unavailable && CLOSED.has(record.status);
    const changed = !unavailable && reminderChanged(record);
    const fields = dialog.querySelector(".waiting-followup-fields");
    const save = dialog.querySelector(".waiting-followup-save");
    const availability = dialog.querySelector(".waiting-followup-availability");
    fields.disabled =
      unavailable || closed || changed || saving || editingSaving;
    save.disabled =
      unavailable ||
      closed ||
      changed ||
      saving ||
      editingSaving ||
      editDrafts.size > 0;
    if (unavailable || closed || changed) {
      availability.hidden = false;
      availability.textContent = unavailable
        ? "Bu konu silinmiş veya başka bir listeye taşınmış. Yazdıkların bu pencereyi kapatana kadar korunur."
        : closed
          ? "Bu konu kapandı. Yeni takip kaydedilemez; açık taslağın korunur."
          : reminderConflict;
    } else {
      availability.hidden = true;
    }
    if (unavailable) {
      if (lastRecord) refreshHistory(lastRecord, true);
      return;
    }
    lastRecord = record;
    dialog.querySelector(".waiting-followup-topic").textContent = record.title;
    const latest = dialog.querySelector(".waiting-followup-latest");
    latest.hidden = !record.latestUpdate;
    latest.querySelector("p").textContent = record.latestUpdate || "";
    refreshHistory(record);
  }

  function refreshHistory(record, unavailable = false) {
    const history = dialog.querySelector(".waiting-followup-history");
    const active = history.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focus = active && {
      id: active.closest("[data-followup-id]")?.dataset.followupId,
      name: active.name,
      action: active.dataset.action,
      start: active.selectionStart,
      end: active.selectionEnd,
    };
    const body = dialog.querySelector(".modal-body");
    const scrollTop = body.scrollTop;
    releaseCalendar();
    history.innerHTML = historyMarkup(record, unavailable);
    body.scrollTop = scrollTop;
    if (focus?.id) {
      const row = entryNode(focus.id);
      const control = focus.name
        ? row?.querySelector(`[name="${focus.name}"]`)
        : focus.action
          ? row?.querySelector(`[data-action="${focus.action}"]`)
          : null;
      if (
        control &&
        !control.disabled &&
        !control.closest("fieldset")?.disabled
      ) {
        control.focus({ preventScroll: true });
        if (focus.start !== undefined && focus.start !== null)
          control.setSelectionRange?.(focus.start, focus.end);
      }
    }
  }

  function startEdit(id) {
    if (saving || editingSaving || typeof onEdit !== "function") return;
    const entry = find(recordId)?.followUpLog?.find((entry) => entry.id === id);
    if (!entry || editDrafts.has(id)) return;
    editDrafts.set(id, {
      expectedEntry: JSON.parse(JSON.stringify(entry)),
      values: {
        date: formatDateInput(entry.date),
        nextFollowUpDate: formatDateInput(entry.nextFollowUpDate),
        note: entry.note || "",
        ...(Object.hasOwn(entry, "previousUpdate")
          ? { previousUpdate: entry.previousUpdate }
          : {}),
      },
      error: "",
    });
    refresh();
    entryNode(id)
      ?.querySelector('[name="editFollowUpDate"]')
      ?.focus({ preventScroll: true });
  }

  async function saveEdit(id) {
    if (saving || editingSaving || destroyed || typeof onEdit !== "function")
      return;
    captureEditDrafts();
    const draft = editDrafts.get(id);
    if (!draft) return;
    const attempt = generation;
    const targetRecordId = recordId;
    try {
      const record = find(recordId);
      if (record?.type !== "waiting")
        throw new Error("Bu konu artık bulunamıyor. Taslağın korunuyor.");
      const entry = record.followUpLog?.find((entry) => entry.id === id);
      if (!entry)
        throw new Error(
          "Bu takip kaydı artık bulunamıyor. Taslağın korunuyor.",
        );
      if (JSON.stringify(entry) !== JSON.stringify(draft.expectedEntry))
        throw new Error(
          "Bu takip kaydı başka bir pencerede değişti. Taslağın korunuyor; güncel kaydı yeniden açarak devam et.",
        );
      const date = dateValue(draft.values.date);
      if (!date) throw new Error("Takip tarihini seç.");
      const patch = {
        date,
        nextFollowUpDate: dateValue(draft.values.nextFollowUpDate),
        note: draft.values.note.trim(),
        ...(Object.hasOwn(draft.expectedEntry, "previousUpdate")
          ? { previousUpdate: draft.values.previousUpdate.trim() }
          : {}),
      };
      const reminderWasUnchanged = !reminderChanged(record);
      draft.error = "";
      editingSaving = true;
      refresh();
      const saved = await onEdit(
        targetRecordId,
        id,
        patch,
        draft.expectedEntry,
      );
      if (destroyed || generation !== attempt || !dialog.open) return;
      if (saved !== true)
        throw new Error(
          "Geçmiş kaydedilemedi. Taslağın korunuyor; yeniden deneyebilirsin.",
        );
      editDrafts.delete(id);
      if (reminderWasUnchanged)
        initialNextFollowUpDate = find(recordId)?.nextFollowUpDate || "";
    } catch (error) {
      if (!destroyed && generation === attempt)
        draft.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (generation === attempt) {
        editingSaving = false;
        refresh();
        if (dialog.open && !editDrafts.has(id)) focusEntry(id);
      }
    }
  }

  function onInput(event) {
    const fields = event.target.closest?.("[data-followup-edit]");
    if (!fields || !dialog.contains(fields)) return;
    const draft = editDrafts.get(fields.dataset.followupEdit);
    if (draft && Object.hasOwn(editFields, event.target.name))
      draft.values[editFields[event.target.name]] = event.target.value;
  }

  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    const fields = event.target.closest?.("[data-followup-edit]");
    if (
      fields &&
      dialog.contains(fields) &&
      event.key === "Escape" &&
      !saving &&
      !editingSaving
    ) {
      event.preventDefault();
      event.stopPropagation();
      editDrafts.delete(fields.dataset.followupEdit);
      refresh();
      focusEntry(fields.dataset.followupEdit);
      return;
    }
    if (!isPlainSaveEnter(event)) return;
    const field = event.target;
    if (
      !field?.matches?.('textarea, input[type="text"], input:not([type])') ||
      field.readOnly ||
      field.matches(":disabled") ||
      !dialog.contains(field) ||
      field.closest("#odak-date-picker")
    )
      return;
    if (fields) {
      event.preventDefault();
      event.stopPropagation();
      saveEdit(fields.dataset.followupEdit);
      return;
    }
    const form = field.closest("#waiting-followup-form");
    const submitter = form?.querySelector(
      ".waiting-followup-save:not(:disabled)",
    );
    if (!submitter || typeof form.requestSubmit !== "function") return;
    event.preventDefault();
    form.requestSubmit(submitter);
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    if (control.dataset.action === "waiting-followup") {
      event.preventDefault();
      open(control.dataset.id);
    } else if (control.dataset.action === "waiting-followup-close") {
      event.preventDefault();
      close();
    } else if (control.dataset.action === "waiting-followup-edit") {
      event.preventDefault();
      startEdit(control.closest("[data-followup-id]")?.dataset.followupId);
    } else if (control.dataset.action === "waiting-followup-edit-save") {
      event.preventDefault();
      saveEdit(control.closest("[data-followup-id]")?.dataset.followupId);
    } else if (control.dataset.action === "waiting-followup-edit-cancel") {
      event.preventDefault();
      if (saving || editingSaving) return;
      const id = control.closest("[data-followup-id]")?.dataset.followupId;
      editDrafts.delete(id);
      refresh();
      focusEntry(id);
    }
  }

  async function onSubmit(event) {
    if (!event.target.matches("#waiting-followup-form")) return;
    event.preventDefault();
    if (saving || editingSaving || destroyed) return;
    const attempt = generation;
    const targetRecordId = recordId;
    try {
      if (editDrafts.size)
        throw new Error(
          "Yeni takip eklemeden önce açık geçmiş düzenlemesini kaydet veya vazgeç.",
        );
      const record = find(recordId);
      if (record?.type !== "waiting")
        throw new Error(
          "Takip edilecek konu artık bulunamıyor. Yazdıkların korunuyor.",
        );
      if (CLOSED.has(record.status))
        throw new Error("Kapalı bir konuya yeni takip kaydedilemez.");
      if (reminderChanged(record)) throw new Error(reminderConflict);
      const form = event.target;
      const date = dateValue(form.elements.followUpDate);
      if (!date) throw new Error("Takip tarihini seç.");
      const patch = {
        id: entryId,
        date,
        note: form.elements.followUpNote.value.trim(),
        nextFollowUpDate: dateValue(form.elements.nextFollowUpDate),
      };
      setError("");
      saving = true;
      form.querySelector(".waiting-followup-save").disabled = true;
      refresh();
      const saved = await onSave(targetRecordId, patch);
      if (destroyed || generation !== attempt || !dialog.open) return;
      if (saved) close();
      else
        setError(
          "Takip kaydedilemedi. Bilgilerin burada duruyor; yeniden deneyebilirsin.",
        );
    } catch (error) {
      if (!destroyed && generation === attempt)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === attempt) {
        saving = false;
        if (dialog.open) refresh();
      }
    }
  }

  function onClose() {
    if (dialog.open) return;
    generation++;
    saving = false;
    editingSaving = false;
    const previousId = recordId;
    releaseCalendar();
    recordId = null;
    entryId = null;
    initialNextFollowUpDate = "";
    lastRecord = null;
    editDrafts.clear();
    const control = [
      ...root.querySelectorAll(".waiting-followup-trigger[data-id]"),
    ].find((item) => item.dataset.id === previousId);
    control?.focus({ preventScroll: true });
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
    root.removeEventListener("input", onInput);
    root.removeEventListener("keydown", onKeyDown);
    dialog.removeEventListener("close", onClose);
    owner.removeEventListener("pagehide", destroy);
    dialog.remove();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeyDown);
  dialog.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { button, open, close, refresh, destroy };
}
