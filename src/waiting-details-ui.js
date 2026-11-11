import { isPlainSaveEnter } from "./record-form-shortcuts.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function details(record) {
  return {
    waitingReason: String(record?.waitingReason ?? record?.blockReason ?? ""),
  };
}

function canEdit(record) {
  return record?.type === "daily" && record.status === "waiting";
}

/** Optional waiting context; the task's status is managed by its normal control. */
export function createWaitingDetailsUI({
  root = document.querySelector("#app"),
  getRecords,
  onSave,
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function" || typeof onSave !== "function")
    throw new TypeError(
      "Bekleme bilgisi için kayıt listesi ve kaydetme işlevi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const dialog = document.createElement("dialog");
  dialog.id = "waiting-details-dialog";
  dialog.className = "modal waiting-details-modal";
  dialog.setAttribute("aria-label", "Bekleme bilgisi");
  root.append(dialog);
  let recordId = null;
  let baseline = "";
  let saving = false;
  let destroyed = false;
  let generation = 0;
  let previousTrigger = null;
  const find = (id) => getRecords().find((record) => record.id === id);

  function setError(message = "") {
    const target = dialog.querySelector("#waiting-details-error");
    if (!target) return;
    const text = String(message).trim();
    target.textContent = text;
    target.hidden = !text;
  }

  function unavailableMessage(record) {
    if (!record || record.type !== "daily")
      return "Bu iş artık bulunamıyor. Taslağın burada korunuyor.";
    if (record.status !== "waiting")
      return "İş artık Beklemede değil. Taslağın burada korunuyor.";
    if (JSON.stringify(details(record)) !== baseline)
      return "Bekleme bilgisi değişmiş. Taslağın burada korunuyor.";
    return "";
  }

  function refresh() {
    if (destroyed || !dialog.open) return;
    let record;
    let message;
    try {
      record = find(recordId);
      message = unavailableMessage(record);
    } catch {
      message = "Kayıt okunamadı. Taslağın burada korunuyor.";
    }
    const fields = dialog.querySelector(".waiting-details-fields");
    const save = dialog.querySelector(".waiting-details-save");
    const availability = dialog.querySelector(".waiting-details-availability");
    fields.disabled = saving || Boolean(message);
    save.disabled = saving || Boolean(message);
    availability.textContent = message;
    availability.hidden = !message;
    if (record)
      dialog.querySelector(".waiting-details-topic").textContent = record.title;
  }

  function open(id) {
    if (destroyed) return;
    try {
      const record = find(id);
      if (!canEdit(record))
        throw new Error(
          "Bekleme bilgisi yalnızca Beklemede olan günlük işlerde düzenlenebilir.",
        );
      if (dialog.open) {
        if (recordId !== id)
          throw new Error("Açık bekleme taslağını önce kaydet veya kapat.");
        dialog
          .querySelector('[name="waitingReason"]')
          ?.focus({ preventScroll: true });
        return;
      }
      previousTrigger = document.activeElement;
      const menu = document.querySelector("#status-menu");
      if (menu?.matches(":popover-open")) menu.hidePopover();
      const values = details(record);
      recordId = id;
      baseline = JSON.stringify(values);
      generation++;
      saving = false;
      dialog.innerHTML = `<form id="waiting-details-form"><div class="modal-header"><h2>Bekleme bilgisi</h2><button type="button" class="close-modal" data-action="waiting-details-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body waiting-details-body"><p class="waiting-details-topic">${escapeHtml(record.title)}</p><p class="waiting-details-availability" aria-live="polite" hidden></p><fieldset class="waiting-details-fields"><label class="field"><span id="waiting-details-label">Neyi/kimi bekliyorum?</span><textarea name="waitingReason" maxlength="1000" rows="3" aria-labelledby="waiting-details-label" aria-describedby="waiting-details-shortcuts" placeholder="Örn. Tasarım yanıtı veya malzeme bekleniyor.">${escapeHtml(values.waitingReason)}</textarea><small id="waiting-details-shortcuts" hidden>Enter ile kaydet, Shift+Enter ile alt satıra geç.</small></label></fieldset><p id="waiting-details-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="waiting-details-close">Vazgeç</button><button type="submit" class="btn primary waiting-details-save">Bekleme bilgisini kaydet</button></div></form>`;
      dialog.showModal();
      dialog.querySelector(".modal-body").scrollTop = 0;
      dialog
        .querySelector('[name="waitingReason"]')
        .focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    if (control.dataset.action === "waiting-details") {
      event.preventDefault();
      open(control.dataset.id);
    } else if (control.dataset.action === "waiting-details-close") {
      event.preventDefault();
      close();
    }
  }

  async function onSubmit(event) {
    if (!event.target.matches("#waiting-details-form")) return;
    event.preventDefault();
    if (destroyed || saving) return;
    const attempt = generation;
    try {
      const record = find(recordId);
      const unavailable = unavailableMessage(record);
      if (unavailable) throw new Error(unavailable);
      const form = event.target;
      if (!form.reportValidity()) return;
      const patch = {
        waitingReason: form.elements.waitingReason.value.trim(),
      };
      if (patch.waitingReason.length > 1000)
        throw new Error("Bekleme bilgisi izin verilen uzunluğu aşıyor.");
      setError();
      saving = true;
      refresh();
      const saved = await onSave(recordId, patch);
      if (destroyed || generation !== attempt) return;
      if (saved) close();
      else
        setError(
          "Kaydedilemedi. Bilgilerin burada duruyor; yeniden deneyebilirsin.",
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

  function onKeydown(event) {
    if (destroyed || saving || !dialog.open || !isPlainSaveEnter(event)) return;
    const field = dialog.querySelector('[name="waitingReason"]');
    if (event.target !== field || field.readOnly || field.matches(":disabled"))
      return;
    const form = field.form;
    const submitter = form?.querySelector('[type="submit"]');
    if (!submitter || typeof form.requestSubmit !== "function") return;
    event.preventDefault();
    event.stopPropagation();
    if (!submitter.matches(":disabled")) form.requestSubmit(submitter);
  }

  function onClose() {
    // A queued close event can arrive after another waiting form is opened.
    if (dialog.open) return;
    const previousId = recordId;
    const previous = previousTrigger;
    recordId = null;
    baseline = "";
    saving = false;
    generation++;
    previousTrigger = null;
    const active = document.activeElement;
    const neutralFocus =
      !active ||
      active === document.body ||
      active === document.documentElement ||
      dialog.contains(active);
    // Closing a modal must not undo the user's next focus choice.
    if (!neutralFocus && active.isConnected && active !== previous) return;
    const trigger =
      previous?.isConnected &&
      previous.matches?.(".waiting-info-trigger, .status-trigger")
        ? previous
        : neutralFocus
          ? [
              ...root.querySelectorAll(
                ".waiting-info-trigger[data-id], .status-trigger[data-id]",
              ),
            ].find((item) => item.dataset.id === previousId)
          : null;
    trigger?.focus({ preventScroll: true });
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    generation++;
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("keydown", onKeydown);
    owner.removeEventListener("pagehide", destroy);
    dialog.removeEventListener("close", onClose);
    dialog.remove();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, close, refresh, destroy };
}
