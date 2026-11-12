import { DISCARD_RECORD_CHANGES } from "./record-form-discard.js";
import { isPlainSaveEnter } from "./record-form-shortcuts.js";
import { confirmAction } from "./app-confirm.js";
import {
  MAX_WORKSPACE_NOTES,
  MAX_WORKSPACE_NOTE_LENGTH,
  normalizeNotes,
  validRemindAt,
} from "./workspace-notes.js";
import { dateInput, dateValue, formatDateInput } from "./date-picker.js";
import {
  defaultReminder,
  formatReminder,
  parseReminderTime,
  reminderTime,
  stepReminder,
} from "./note-reminders.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const plusIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const editIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12H4v-5L16 3Zm-3 3 5 5"/></svg>';
const deleteIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const chevron = (path) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
/** A small ‹ or › button that moves the reminder by days or minutes. */
const stepButton = (unit, amount, label) =>
  `<button type="button" class="reminder-step" data-reminder-step="${unit}" data-amount="${amount}" aria-label="${label}" title="${label}">${chevron(amount < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6")}</button>`;
export const bellIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0"/></svg>';

/** Independent bullet notes share the workspace's atomic save and Undo path. */
export function createWorkspaceNotesUI({
  root,
  getNotes,
  onSaveNotes = () => false,
  onError = () => {},
} = {}) {
  if (!root || typeof getNotes !== "function")
    throw new TypeError("Not alanı için çalışma alanı gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const dialog = document.createElement("dialog");
  dialog.id = "workspace-note-editor";
  dialog.className = "modal workspace-note-editor";
  dialog.setAttribute("aria-label", "Not ekle");
  root.append(dialog);
  let selectedId = null;
  let baselineNotes = [];
  let initialText = "";
  let initialState = "";
  let previousTrigger = null;
  let newNoteId = null;
  let saving = false;
  let deleting = false;
  let destroyed = false;
  let generation = 0;
  let closeRequest = null;
  let panelError = "";
  let scrollTop = 0;
  let scrollElement = null;
  const readNotes = () => normalizeNotes(getNotes());
  const field = () => dialog.querySelector('[name="text"]');
  const remindToggle = () => dialog.querySelector('[name="remind"]');

  /** The editor's comparable state: text plus the reminder as typed. */
  function formState() {
    const toggle = remindToggle();
    return JSON.stringify({
      text: field()?.value ?? "",
      remind: toggle?.checked
        ? `${dialog.querySelector('[name="remindDate"]').value}|${dialog.querySelector('[name="remindTime"]').value}`
        : null,
    });
  }

  /** The validated reminder minute, null when off; throws on bad input. */
  function formReminder() {
    if (!remindToggle()?.checked) return null;
    const date = dateValue(dialog.querySelector('[name="remindDate"]'));
    if (!date) throw new Error("Hatırlatma için bir tarih seç.");
    const time = parseReminderTime(
      dialog.querySelector('[name="remindTime"]').value,
    );
    const remindAt = `${date}T${time}`;
    if (!time || !validRemindAt(remindAt))
      throw new Error(
        "Hatırlatma için 24 saat biçiminde bir saat yaz (14:30).",
      );
    return remindAt;
  }

  function setPanelError(message = "") {
    panelError = String(message);
    const target = root.querySelector("#workspace-notes-panel-error");
    if (target) {
      target.textContent = panelError;
      target.hidden = !panelError;
    }
  }

  function setError(message = "") {
    const target = dialog.querySelector("#workspace-note-error");
    if (target) {
      target.textContent = String(message);
      target.hidden = !message;
    }
  }

  function availability(notes) {
    if (selectedId && !notes.some((note) => note.id === selectedId))
      return "Bu not artık bulunamıyor. Yazdığın metin burada korunuyor.";
    if (JSON.stringify(notes) !== JSON.stringify(baselineNotes))
      return "Notlar başka bir pencerede değişti. Yazdığın metin korunuyor; güncel notları görmek için yeniden aç.";
    return "";
  }

  function render() {
    const previousContent = root.querySelector(".workspace-notes-content");
    if (previousContent) scrollTop = previousContent.scrollTop;
    let notes = [];
    let readError = "";
    try {
      notes = readNotes();
    } catch {
      readError = "Notlar okunamadı. Kayıtlı bilgiler değiştirilmedi.";
    }
    const disabled =
      readError || saving || deleting || notes.length >= MAX_WORKSPACE_NOTES;
    return `<section class="panel dashboard-notes-panel" aria-label="Bağımsız notlar"><div class="panel-header dashboard-panel-header"><div class="dashboard-panel-heading"><h2>Notlar<span class="dashboard-panel-count">${notes.length}</span></h2></div><button type="button" class="text-btn workspace-note-add" data-action="workspace-note-new" aria-haspopup="dialog" aria-controls="workspace-note-editor"${disabled ? " disabled" : ""}${notes.length >= MAX_WORKSPACE_NOTES ? ` title="En fazla ${MAX_WORKSPACE_NOTES} not tutulabilir"` : ""}>${plusIcon}<span>Not ekle</span></button></div><div class="workspace-notes-content" tabindex="0" aria-label="Not maddeleri">${notes.length ? `<ul class="workspace-notes-list">${notes.map((note) => `<li data-note-id="${escapeHtml(note.id)}"><div class="workspace-note-row"><div class="workspace-note-copy"><p class="workspace-note-text">${escapeHtml(note.text)}</p>${note.remindAt ? `<button type="button" class="workspace-note-reminder${reminderTime(note.remindAt) <= Date.now() ? " is-due" : ""}" data-action="workspace-note-reminder" data-note-id="${escapeHtml(note.id)}" data-remind-at="${escapeHtml(note.remindAt)}" aria-haspopup="dialog" aria-controls="workspace-note-editor" aria-label="Hatırlatma ${escapeHtml(formatReminder(note.remindAt))}: hatırlatmayı düzenle" title="Hatırlatmayı düzenle">${bellIcon}${escapeHtml(formatReminder(note.remindAt))}</button>` : ""}</div><div class="workspace-note-actions"><button type="button" class="workspace-note-control" data-action="workspace-note-edit" data-note-id="${escapeHtml(note.id)}" aria-label="Notu düzenle: ${escapeHtml(note.text.slice(0, 80))}" aria-haspopup="dialog" aria-controls="workspace-note-editor" title="Notu düzenle">${editIcon}</button><button type="button" class="workspace-note-control" data-action="workspace-note-delete" data-note-id="${escapeHtml(note.id)}" aria-label="Notu sil: ${escapeHtml(note.text.slice(0, 80))}" title="Notu sil">${deleteIcon}</button></div></div></li>`).join("")}</ul>` : '<p class="workspace-notes-empty">Henüz not yok.</p>'}<p id="workspace-notes-panel-error" class="error-message" role="alert"${readError || panelError ? "" : " hidden"}>${escapeHtml(readError || panelError)}</p></div></section>`;
  }

  function refresh() {
    if (destroyed) return;
    const content = root.querySelector(".workspace-notes-content");
    if (content && content !== scrollElement) {
      content.scrollTop = scrollTop;
      scrollElement = content;
    }
    for (const button of root.querySelectorAll(".workspace-note-control"))
      button.disabled = saving || deleting;
    const add = root.querySelector(".workspace-note-add");
    try {
      const notes = readNotes();
      if (add)
        add.disabled =
          saving || deleting || notes.length >= MAX_WORKSPACE_NOTES;
      if (!dialog.open) return;
      const message = saving ? "" : availability(notes);
      const target = dialog.querySelector(".workspace-note-availability");
      target.textContent = message;
      target.hidden = !message;
      for (const button of dialog.querySelectorAll("button"))
        button.disabled = saving;
      dialog.querySelector('[type="submit"]').disabled =
        saving || Boolean(message);
      field().disabled = saving;
    } catch {
      if (add) add.disabled = true;
      if (dialog.open) {
        setError("Notlar okunamadı. Yazdığın metin burada korunuyor.");
        dialog.querySelector('[type="submit"]').disabled = true;
      }
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  async function requestClose() {
    if (destroyed || saving || !dialog.open || closeRequest) return;
    const value = formState();
    if (value === initialState) {
      close();
      return;
    }
    const request = { generation, value };
    closeRequest = request;
    try {
      const confirmed = await confirmAction({
        root,
        title: "Değişiklikler kaydedilmedi",
        message: DISCARD_RECORD_CHANGES,
        confirmLabel: "Kaydetmeden kapat",
        danger: true,
      });
      if (
        confirmed &&
        !destroyed &&
        !saving &&
        dialog.open &&
        generation === request.generation &&
        formState() === request.value
      )
        close();
    } catch (error) {
      if (!destroyed && generation === request.generation)
        onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (closeRequest === request) closeRequest = null;
    }
  }

  function open(id, control, { focusReminder = false } = {}) {
    if (destroyed || saving || deleting) return;
    try {
      if (dialog.open) {
        field()?.focus({ preventScroll: true });
        return;
      }
      baselineNotes = readNotes();
      const note = id ? baselineNotes.find((item) => item.id === id) : null;
      if (id && !note) throw new Error("Bu not artık bulunamıyor.");
      if (!id && baselineNotes.length >= MAX_WORKSPACE_NOTES)
        throw new Error(`En fazla ${MAX_WORKSPACE_NOTES} not tutulabilir.`);
      selectedId = id || null;
      initialText = note?.text || "";
      previousTrigger = control;
      newNoteId = null;
      generation++;
      closeRequest = null;
      setPanelError();
      const title = note ? "Notu düzenle" : "Not ekle";
      dialog.setAttribute("aria-label", title);
      const reminder = note?.remindAt || defaultReminder();
      const reminding = Boolean(note?.remindAt);
      dialog.innerHTML = `<form id="workspace-note-form"><div class="modal-header"><h2>${title}</h2><button type="button" class="close-modal" data-action="workspace-note-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body workspace-note-editor-body"><p class="workspace-note-availability" role="status" hidden></p><label class="field"><span id="workspace-note-label">Not</span><textarea name="text" rows="6" maxlength="${MAX_WORKSPACE_NOTE_LENGTH}" required aria-labelledby="workspace-note-label" aria-describedby="workspace-note-shortcuts" placeholder="Aklında kalmasını istediğin bir not yaz.">${escapeHtml(initialText)}</textarea><small id="workspace-note-shortcuts" hidden>Enter ile kaydet, Shift+Enter ile alt satıra geç.</small></label><fieldset class="workspace-note-reminder-fields" aria-label="Hatırlatma"><label class="workspace-note-remind-toggle"><input type="checkbox" name="remind"${reminding ? " checked" : ""}>${bellIcon}<span>Hatırlat</span></label><div class="workspace-note-remind-when"${reminding ? "" : " hidden"}><div class="field"><span>Tarih</span><div class="reminder-stepper">${stepButton("days", -1, "Önceki gün")}${dateInput({ name: "remindDate", id: "workspace-note-remind-date", value: reminder.slice(0, 10), label: "Hatırlatma tarihi" })}${stepButton("days", 1, "Sonraki gün")}</div></div><div class="field"><span>Saat</span><div class="reminder-stepper">${stepButton("minutes", -15, "15 dakika önce")}<input type="text" name="remindTime" class="reminder-time-input" value="${escapeHtml(reminder.slice(11))}" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="SS:DD" aria-label="Hatırlatma saati (24 saat)" title="24 saat biçimi. Saat üzerinde ↑↓ 1 saat, dakika üzerinde ↑↓ 15 dakika değiştirir.">${stepButton("minutes", 15, "15 dakika sonra")}</div></div></div></fieldset><p id="workspace-note-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn" data-action="workspace-note-close">Vazgeç</button><button type="submit" class="btn primary">Kaydet</button></div></form>`;
      dialog.showModal();
      initialState = formState();
      const reminderField = dialog.querySelector('[name="remindDate"]');
      if (focusReminder && reminderField) {
        reminderField.focus({ preventScroll: true });
        // The caret waits at the end; nothing is highlighted.
        const end = reminderField.value.length;
        reminderField.setSelectionRange(end, end);
      } else field().focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function revealNote(id) {
    const content = root.querySelector(".workspace-notes-content");
    const row = [...root.querySelectorAll(".workspace-notes-list > li")].find(
      (item) => item.dataset.noteId === id,
    );
    if (!content || !row) return;
    const bounds = row.getBoundingClientRect();
    const viewport = content.getBoundingClientRect();
    if (bounds.bottom > viewport.bottom)
      content.scrollTop += bounds.bottom - viewport.bottom;
    else if (bounds.top < viewport.top)
      content.scrollTop -= viewport.top - bounds.top;
    scrollTop = content.scrollTop;
  }

  async function onSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (destroyed || saving) return;
    const attempt = generation;
    try {
      const message = availability(readNotes());
      if (message) throw new Error(message);
      const text = field().value;
      if (selectedId && formState() === initialState) {
        close();
        return;
      }
      if (!text.trim()) throw new Error("Bir not yaz.");
      if (text.length > MAX_WORKSPACE_NOTE_LENGTH)
        throw new Error(
          `Not en fazla ${MAX_WORKSPACE_NOTE_LENGTH} karakter olabilir.`,
        );
      if (!event.target.reportValidity()) return;
      const remindAt = formReminder();
      const timestamp = new Date().toISOString();
      const id = selectedId || (newNoteId ||= owner.crypto.randomUUID());
      const withReminder = (note) => {
        const { remindAt: _previous, ...rest } = note;
        return remindAt ? { ...rest, remindAt } : rest;
      };
      const next = selectedId
        ? baselineNotes.map((note) =>
            note.id === id
              ? withReminder({ ...note, text, updatedAt: timestamp })
              : note,
          )
        : [
            ...baselineNotes,
            withReminder({
              id,
              text,
              createdAt: timestamp,
              updatedAt: timestamp,
            }),
          ];
      setError();
      saving = true;
      refresh();
      const saved = await onSaveNotes(
        normalizeNotes(next),
        baselineNotes,
        selectedId ? "Not düzenleme" : "Not ekleme",
      );
      if (destroyed || generation !== attempt) return;
      if (saved === true) {
        revealNote(id);
        close();
      } else
        setError(
          "Not kaydedilemedi. Yazdığın metin korunuyor; yeniden deneyebilirsin.",
        );
    } catch (error) {
      if (!destroyed && generation === attempt)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === attempt) {
        saving = false;
        refresh();
      }
    }
  }

  async function deleteNote(id, control) {
    if (destroyed || saving || deleting || dialog.open) return;
    let focusIndex = null;
    try {
      const expected = readNotes();
      const index = expected.findIndex((note) => note.id === id);
      if (index < 0) throw new Error("Bu not artık bulunamıyor.");
      setPanelError();
      deleting = true;
      refresh();
      const saved = await onSaveNotes(
        expected.filter((note) => note.id !== id),
        expected,
        "Not silme",
      );
      if (destroyed) return;
      if (saved !== true) {
        setPanelError("Not silinemedi. Yeniden deneyebilirsin.");
        return;
      }
      const active = document.activeElement;
      if (active && active !== document.body && active !== control) return;
      focusIndex = index;
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    } finally {
      deleting = false;
      refresh();
      if (focusIndex !== null && !destroyed) {
        const controls = root.querySelectorAll(
          '[data-action="workspace-note-edit"]',
        );
        (
          controls[Math.min(focusIndex, controls.length - 1)] ||
          root.querySelector(".workspace-note-add")
        )?.focus({ preventScroll: true });
      }
    }
  }

  function onRootClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control) || dialog.contains(control)) return;
    const action = control.dataset.action;
    if (
      ![
        "workspace-note-new",
        "workspace-note-edit",
        "workspace-note-delete",
        "workspace-note-reminder",
      ].includes(action)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "workspace-note-delete")
      deleteNote(control.dataset.noteId, control);
    else if (action === "workspace-note-reminder")
      open(control.dataset.noteId, control, { focusReminder: true });
    else
      open(
        action === "workspace-note-edit" ? control.dataset.noteId : null,
        control,
      );
  }

  function onDialogChange(event) {
    if (event.target.matches?.('[name="remindTime"]')) {
      const time = parseReminderTime(event.target.value);
      if (time) event.target.value = time;
      return;
    }
    if (event.target !== remindToggle()) return;
    const when = dialog.querySelector(".workspace-note-remind-when");
    when.hidden = !event.target.checked;
  }

  /** Move the reminder by days, hours or minutes; bad input restarts from the default. */
  function stepReminderFields(step) {
    const dateField = dialog.querySelector('[name="remindDate"]');
    const timeField = dialog.querySelector('[name="remindTime"]');
    if (!dateField || !timeField) return;
    const fallback = defaultReminder();
    const date = dateValue(dateField) || fallback.slice(0, 10);
    const time = parseReminderTime(timeField.value) || fallback.slice(11);
    const next = stepReminder(date, time, step);
    dateField.value = formatDateInput(next.date);
    timeField.value = next.time;
    for (const target of [dateField, timeField])
      target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function onReminderKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    const direction = { ArrowUp: 1, ArrowDown: -1 }[event.key];
    if (!direction) return false;
    const target = event.target;
    if (target.matches?.('[name="remindDate"]')) {
      event.preventDefault();
      stepReminderFields({ days: direction });
      return true;
    }
    if (!target.matches?.('[name="remindTime"]')) return false;
    event.preventDefault();
    // Like a clock field: the hour part moves hours, the minute part quarters.
    const onHour = (target.selectionStart ?? 0) <= 2;
    stepReminderFields(
      onHour ? { hours: direction } : { minutes: 15 * direction },
    );
    if (onHour) target.setSelectionRange(0, 2);
    else target.setSelectionRange(3, 5);
    return true;
  }

  function onDialogClick(event) {
    const step = event.target.closest?.("[data-reminder-step]");
    if (step && dialog.contains(step) && !step.disabled) {
      event.preventDefault();
      stepReminderFields({
        [step.dataset.reminderStep]: Number(step.dataset.amount),
      });
      return;
    }
    const control = event.target.closest?.(
      '[data-action="workspace-note-close"]',
    );
    if (!control || !dialog.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  }

  function onKeydown(event) {
    if (destroyed || saving || !dialog.open) return;
    if (onReminderKeydown(event)) return;
    if (!isPlainSaveEnter(event)) return;
    const textarea = field();
    if (
      event.target !== textarea ||
      textarea.readOnly ||
      textarea.matches(":disabled")
    )
      return;
    const submitter = textarea.form?.querySelector('[type="submit"]');
    if (!submitter || typeof textarea.form.requestSubmit !== "function") return;
    event.preventDefault();
    event.stopPropagation();
    if (!submitter.matches(":disabled")) textarea.form.requestSubmit(submitter);
  }

  function onCancel(event) {
    event.preventDefault();
    requestClose();
  }

  function onClose() {
    if (dialog.open) return;
    const previous = previousTrigger;
    const id = selectedId || newNoteId;
    selectedId = null;
    initialText = "";
    initialState = "";
    baselineNotes = [];
    previousTrigger = null;
    newNoteId = null;
    saving = false;
    generation++;
    closeRequest = null;
    if (destroyed) return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !dialog.contains(active) &&
      active !== previous
    )
      return;
    const available = (control) =>
      control?.isConnected &&
      !control.matches(":disabled") &&
      control.getClientRects().length > 0;
    const add = root.querySelector(".workspace-note-add");
    const edited = id
      ? [...root.querySelectorAll('[data-action="workspace-note-edit"]')].find(
          (control) => control.dataset.noteId === id && available(control),
        )
      : null;
    const target = available(previous)
      ? previous
      : previous?.dataset.action === "workspace-note-new" && available(add)
        ? add
        : edited || (available(add) ? add : null);
    target?.focus({ preventScroll: true });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    generation++;
    closeRequest = null;
    root.removeEventListener("click", onRootClick);
    dialog.removeEventListener("click", onDialogClick);
    dialog.removeEventListener("change", onDialogChange);
    dialog.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("keydown", onKeydown);
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onClose);
    owner.removeEventListener("pagehide", destroy);
    dialog.remove();
  }

  root.addEventListener("click", onRootClick);
  dialog.addEventListener("click", onDialogClick);
  dialog.addEventListener("change", onDialogChange);
  dialog.addEventListener("submit", onSubmit);
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  return {
    render,
    refresh,
    destroy,
    /** Open a note's editor, e.g. from the reminder panel. */
    edit: (id, control = null) => open(id, control),
  };
}
