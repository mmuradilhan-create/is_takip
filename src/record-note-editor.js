import { DISCARD_RECORD_CHANGES } from "./record-form-discard.js";
import { isPlainSaveEnter } from "./record-form-shortcuts.js";
import { confirmAction } from "./app-confirm.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const noteText = (record) => String(record?.description ?? "");
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

export function createRecordNoteEditor({
  root,
  getRecord,
  onSave = () => false,
  onError = () => {},
  onRestoreFocus = (target) => target.focus({ preventScroll: true }),
} = {}) {
  const document = root.ownerDocument;
  const dialog = document.createElement("dialog");
  dialog.id = "record-note-editor";
  dialog.className = "modal record-note-editor";
  dialog.setAttribute("aria-label", "Notu düzenle");
  root.append(dialog);
  let selectedId = null;
  let expectedDescription = "";
  let previousTrigger = null;
  let saving = false;
  let destroyed = false;
  let generation = 0;
  let closeRequest = null;
  const textarea = () => dialog.querySelector('[name="description"]');
  const find = () => getRecord(selectedId);

  function setError(message = "") {
    const target = dialog.querySelector("#record-note-edit-error");
    if (!target) return;
    target.textContent = String(message);
    target.hidden = !message;
  }

  function availability(record) {
    if (!record)
      return "Bu kayıt artık bulunamıyor. Yazdığın not burada korunuyor.";
    if (noteText(record) !== expectedDescription)
      return "Not başka bir pencerede değişti. Yazdığın not korunuyor; güncel notu görmek için yeniden aç.";
    return "";
  }

  function refresh() {
    if (destroyed || !dialog.open || saving) return;
    try {
      const record = find();
      const message = availability(record);
      const target = dialog.querySelector(".record-note-edit-availability");
      target.textContent = message;
      target.hidden = !message;
      dialog.querySelector('[type="submit"]').disabled = Boolean(message);
      if (record)
        dialog.querySelector(".record-note-edit-topic").textContent =
          record.title;
    } catch {
      setError("Kayıt okunamadı. Yazdığın not burada korunuyor.");
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  async function requestClose() {
    if (destroyed || saving || !dialog.open || closeRequest) return;
    const value = textarea()?.value;
    if (value === expectedDescription) {
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
        textarea()?.value === request.value
      )
        close();
    } catch (error) {
      if (!destroyed && generation === request.generation)
        onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (closeRequest === request) closeRequest = null;
    }
  }

  function open(id, trigger = null) {
    if (destroyed) return;
    try {
      const record = getRecord(id);
      if (!record) throw new Error("Bu kayıt artık bulunamıyor.");
      if (dialog.open) {
        if (selectedId !== id)
          throw new Error("Açık not taslağını önce kaydet veya kapat.");
        textarea()?.focus({ preventScroll: true });
        return;
      }
      selectedId = id;
      expectedDescription = noteText(record);
      previousTrigger = trigger?.isConnected ? trigger : document.activeElement;
      generation++;
      closeRequest = null;
      saving = false;
      dialog.innerHTML = `<form id="record-note-edit-form"><div class="modal-header"><h2>Notu düzenle</h2><button type="button" class="close-modal" data-action="record-note-edit-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body record-note-edit-body"><p class="record-note-edit-topic">${escapeHtml(record.title)}</p><p class="record-note-edit-availability" role="status" hidden></p><label class="field"><span id="record-note-edit-label">Notlar</span><textarea name="description" maxlength="50000" rows="8" aria-labelledby="record-note-edit-label" aria-describedby="record-note-edit-shortcuts">${escapeHtml(expectedDescription)}</textarea><small id="record-note-edit-shortcuts">Enter ile kaydet, Shift+Enter ile alt satıra geç.</small></label><p id="record-note-edit-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn" data-action="record-note-edit-close">Vazgeç</button><button type="submit" class="btn primary">Kaydet</button></div></form>`;
      dialog.showModal();
      textarea().focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (destroyed || saving) return;
    const attempt = generation;
    try {
      const message = availability(find());
      if (message) throw new Error(message);
      if (!event.target.reportValidity()) return;
      const description = textarea().value.trim();
      if (description === expectedDescription) {
        close();
        return;
      }
      setError();
      saving = true;
      for (const control of dialog.querySelectorAll("button, textarea"))
        control.disabled = true;
      const saved = await onSave(selectedId, description, expectedDescription);
      if (destroyed || generation !== attempt) return;
      if (saved === true) close();
      else
        setError(
          "Not kaydedilemedi. Yazdığın metin korunuyor; yeniden deneyebilirsin.",
        );
    } catch (error) {
      if (!destroyed && generation === attempt)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === attempt) {
        saving = false;
        for (const control of dialog.querySelectorAll("button, textarea"))
          control.disabled = false;
        refresh();
      }
    }
  }

  function onClick(event) {
    const control = event.target.closest?.(
      '[data-action="record-note-edit-close"]',
    );
    if (!control || !dialog.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  }

  function onKeydown(event) {
    if (destroyed || saving || !dialog.open || !isPlainSaveEnter(event)) return;
    const field = textarea();
    if (event.target !== field || field.readOnly || field.matches(":disabled"))
      return;
    const form = field.form;
    const submitter = form?.querySelector('[type="submit"]');
    if (!submitter || typeof form.requestSubmit !== "function") return;
    event.preventDefault();
    event.stopPropagation();
    if (!submitter.matches(":disabled")) form.requestSubmit(submitter);
  }

  function onCancel(event) {
    event.preventDefault();
    requestClose();
  }

  function onClose() {
    if (dialog.open) return;
    const id = selectedId;
    const previous = previousTrigger;
    selectedId = null;
    previousTrigger = null;
    expectedDescription = "";
    saving = false;
    generation++;
    closeRequest = null;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !dialog.contains(active) &&
      active !== previous
    )
      return;
    const target = previous?.isConnected
      ? previous
      : [...root.querySelectorAll('[data-action="record-note"][data-id]')].find(
          (control) => control.dataset.id === id,
        ) ||
        [...root.querySelectorAll("[data-record-row][data-id]")]
          .find((row) => row.dataset.id === id)
          ?.querySelector(".task-name, .focus-title");
    if (target) onRestoreFocus(target);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    generation++;
    closeRequest = null;
    dialog.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("keydown", onKeydown);
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onClose);
    dialog.remove();
  }

  dialog.addEventListener("submit", onSubmit);
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  return { open, refresh, destroy };
}
