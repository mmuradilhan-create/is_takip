import { linkedActions } from "./action-links.js";
import {
  dateInput,
  dateValue as readDateValue,
  formatDateInput,
} from "./date-picker.js";
import { PRIORITIES, statusLabel } from "./model.js";

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
const ROUTES = ["daily", "waiting"];
const captions = { daily: "Ben yapacağım", waiting: "Başkasından bekliyorum" };

/** Plan both meeting outcomes together while preserving any existing route. */
export function createMeetingBothUI({
  root = document.querySelector("#app"),
  getRecords,
  onSave,
  onOpenTarget = () => {},
  onError = () => {},
  onMessage = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function" || typeof onSave !== "function")
    throw new TypeError(
      "İki akış için kayıt listesi ve kaydetme işlevi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const dialog = document.createElement("dialog");
  dialog.id = "meeting-both-dialog";
  dialog.className = "modal meeting-both-modal";
  dialog.setAttribute("aria-label", "Her iki akışı planla");
  root.append(dialog);
  let sourceId = null;
  let previousTrigger = null;
  let saving = false;
  let destroyed = false;
  let generation = 0;
  const renderedSummaries = new WeakMap();

  function sourceAndTargets() {
    const records = getRecords();
    const source = records.find((record) => record.id === sourceId);
    return {
      source,
      targets:
        source?.type === "meeting" ? linkedActions(sourceId, records) : [],
    };
  }

  function releaseCalendar() {
    const calendar = dialog.querySelector("#odak-date-picker");
    if (!calendar) return;
    if (calendar.matches(":popover-open")) calendar.hidePopover();
    root.append(calendar);
  }

  function setError(message = "") {
    const target = dialog.querySelector("#meeting-both-error");
    if (!target) return;
    target.textContent = String(message).trim();
    target.hidden = !target.textContent;
  }

  function branchMarkup(type, source) {
    const daily = type === "daily";
    const fields = daily
      ? `<input type="hidden" name="dailyOwner" value=""><div class="meeting-both-field-row"><label class="field">Öncelik<select name="dailyPriority">${Object.entries(
          PRIORITIES,
        )
          .map(
            ([value, item]) =>
              `<option value="${escapeHtml(value)}" ${value === "normal" ? "selected" : ""}>${escapeHtml(item.label)}</option>`,
          )
          .join(
            "",
          )}</select></label><label class="field">İşin teslim tarihi${dateInput({ name: "dailyDueDate", id: "meeting-both-daily-date", value: "", label: "İşin teslim tarihi" })}</label></div><input type="hidden" name="dailyNextAction" value="">`
      : `<div class="meeting-both-field-row"><label class="field">Kimden bekliyorum?<input name="waitingExpectedFrom" maxlength="120" value="" placeholder="İsteğe bağlı"></label><label class="field">Sonraki takip tarihi${dateInput({ name: "waitingNextFollowUpDate", id: "meeting-both-waiting-date", value: "", label: "Sonraki takip tarihi" })}</label></div><label class="field">Son gelişme<textarea name="waitingLatestUpdate" maxlength="10000" rows="3" placeholder="İsteğe bağlı"></textarea></label>`;
    return `<fieldset class="meeting-both-branch" data-route="${type}"><legend>${captions[type]}</legend><fieldset class="meeting-both-draft"><label class="field">${daily ? "Yapacağım iş" : "Beklediğim sonuç"} *<input name="${type}Title" required maxlength="500" value="${escapeHtml(source.title)}"></label>${fields}</fieldset><section class="meeting-both-existing" hidden></section></fieldset>`;
  }

  function existingMarkup(target) {
    const daily = target.type === "daily";
    const date = daily ? target.dueDate : target.nextFollowUpDate;
    const context = daily ? "" : target.latestUpdate;
    return `<p class="meeting-both-existing-label">Bu akış zaten var</p><h3>${escapeHtml(target.title)}</h3><dl><div><dt>Durum</dt><dd>${escapeHtml(statusLabel(target.type, target.status))}</dd></div>${daily ? `<div><dt>Öncelik</dt><dd>${escapeHtml(PRIORITIES[target.priority]?.label || "Normal")}</dd></div>` : target.expectedFrom ? `<div><dt>Beklenen kişi</dt><dd>${escapeHtml(target.expectedFrom)}</dd></div>` : ""}<div><dt>${daily ? "Teslim tarihi" : "Sonraki takip"}</dt><dd>${escapeHtml(formatDateInput(date) || "Tarih yok")}</dd></div></dl>${context ? `<p class="meeting-both-existing-next">${escapeHtml(context)}</p>` : ""}<button type="button" class="btn small" data-action="meeting-both-open-target" data-route="${target.type}">${daily ? "İşi aç" : "Takibi aç"} →</button>`;
  }

  function refresh() {
    if (destroyed || !dialog.open) return;
    let source;
    let targets = [];
    let message = "";
    try {
      ({ source, targets } = sourceAndTargets());
      if (source?.type !== "meeting")
        message =
          "Kaynak toplantı artık bulunamıyor. Taslakların burada korunuyor.";
    } catch (error) {
      message =
        error instanceof Error
          ? error.message
          : "Kayıtlar okunamadı. Taslakların burada korunuyor.";
    }
    const available = !message;
    const availability = dialog.querySelector(".meeting-both-availability");
    availability.textContent = message;
    availability.hidden = !message;
    if (source)
      dialog.querySelector(".meeting-both-source").textContent = source.title;
    for (const type of ROUTES) {
      const branch = dialog.querySelector(
        `.meeting-both-branch[data-route="${type}"]`,
      );
      const draft = branch.querySelector(".meeting-both-draft");
      const summary = branch.querySelector(".meeting-both-existing");
      const target = targets.find((item) => item.type === type);
      // Keep every draft input in place, including when another window creates
      // its route. Undoing that creation can reveal the untouched draft again.
      draft.disabled = saving || !available || Boolean(target);
      if (available) {
        draft.hidden = Boolean(target);
        summary.hidden = !target;
        if (target) {
          const markup = existingMarkup(target);
          if (renderedSummaries.get(summary) !== markup) {
            summary.innerHTML = markup;
            renderedSummaries.set(summary, markup);
          }
        }
      }
      for (const button of summary.querySelectorAll("button"))
        button.disabled = saving || !available;
    }
    const missing = ROUTES.filter(
      (type) => !targets.some((target) => target.type === type),
    );
    const save = dialog.querySelector('[type="submit"]');
    save.disabled = saving || !available || !missing.length;
    save.textContent = saving
      ? "Kaydediliyor…"
      : missing.length === 2
        ? "İki akışı kaydet"
        : missing.length === 1
          ? "Eksik akışı ekle"
          : "İki akış da hazır";
    for (const control of dialog.querySelectorAll(
      '[data-action="meeting-both-close"]',
    ))
      control.disabled = saving;
    dialog.querySelector("form").setAttribute("aria-busy", String(saving));
  }

  function open(id) {
    if (destroyed) return;
    try {
      if (dialog.open) {
        if (sourceId !== id)
          throw new Error("Açık iki akış taslağını önce kaydet veya kapat.");
        refresh();
        return;
      }
      sourceId = id;
      const { source } = sourceAndTargets();
      if (source?.type !== "meeting")
        throw new Error("Kaynak toplantı artık bulunamıyor.");
      previousTrigger = document.activeElement;
      generation++;
      saving = false;
      releaseCalendar();
      dialog.innerHTML = `<form id="meeting-both-form"><div class="modal-header"><h2>Her iki akışı planla</h2><button type="button" class="close-modal" data-action="meeting-both-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body meeting-both-body"><p class="meeting-both-source"></p><p class="field-help meeting-both-help">Yapacağın işi ve beklediğin yanıtı ayrı ayrı planla.</p><p class="meeting-both-availability" aria-live="polite" hidden></p><div class="meeting-both-branches">${ROUTES.map((type) => branchMarkup(type, source)).join("")}</div><p id="meeting-both-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="meeting-both-close">Vazgeç</button><button type="submit" class="btn primary">İki akışı kaydet</button></div></form>`;
      dialog.showModal();
      refresh();
      dialog.querySelector(".modal-body").scrollTop = 0;
      dialog
        .querySelector(".meeting-both-draft:not([hidden]) input")
        ?.focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function close() {
    releaseCalendar();
    if (dialog.open) dialog.close();
  }

  async function onSubmit(event) {
    if (!event.target.matches("#meeting-both-form")) return;
    event.preventDefault();
    if (destroyed || saving) return;
    const attempt = generation;
    try {
      const { source, targets } = sourceAndTargets();
      if (source?.type !== "meeting")
        throw new Error(
          "Kaynak toplantı artık bulunamıyor. Taslakların burada korunuyor.",
        );
      const form = event.target;
      refresh();
      if (!form.reportValidity()) return;
      const drafts = {};
      for (const type of ROUTES) {
        if (targets.some((target) => target.type === type)) continue;
        const title = form.elements[`${type}Title`].value.trim();
        if (!title) throw new Error(`${captions[type]} akışı için başlık yaz.`);
        drafts[type] = {
          title,
          status: type === "daily" ? "planned" : "waiting_response",
          ...(type === "daily"
            ? {
                priority: form.elements.dailyPriority.value,
                dueDate: readDateValue(form.elements.dailyDueDate),
                nextAction: form.elements.dailyNextAction.value.trim(),
                owner: form.elements.dailyOwner.value.trim(),
              }
            : {
                expectedFrom: form.elements.waitingExpectedFrom.value.trim(),
                nextFollowUpDate: readDateValue(
                  form.elements.waitingNextFollowUpDate,
                ),
                latestUpdate: form.elements.waitingLatestUpdate.value.trim(),
              }),
        };
      }
      if (!Object.keys(drafts).length) {
        refresh();
        return;
      }
      setError();
      saving = true;
      refresh();
      const result = await onSave(sourceId, drafts);
      if (destroyed || attempt !== generation) return;
      if (!result)
        throw new Error(
          "Akışlar kaydedilemedi. Taslakların burada korunuyor; yeniden deneyebilirsin.",
        );
      const created = result.createdTypes?.length ?? Object.keys(drafts).length;
      close();
      onMessage(
        created === 2
          ? "İki akış kaydedildi."
          : created === 1
            ? "Eksik akış eklendi."
            : "İki akış da zaten var; mevcut kayıtlar korundu.",
      );
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

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !dialog.contains(control)) return;
    if (control.dataset.action === "meeting-both-close") {
      event.preventDefault();
      if (!saving) close();
    }
    if (control.dataset.action === "meeting-both-open-target") {
      event.preventDefault();
      if (saving) return;
      try {
        const target = sourceAndTargets().targets.find(
          (item) => item.type === control.dataset.route,
        );
        if (!target)
          throw new Error(
            "Bağlı kayıt artık bulunamıyor. Akışları yeniden kontrol et.",
          );
        const originId = sourceId;
        close();
        onOpenTarget(target.id, target.type, originId);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        refresh();
      }
    }
  }

  function onCancel(event) {
    if (saving) event.preventDefault();
  }

  function onClose() {
    if (dialog.open) return;
    releaseCalendar();
    const previous = previousTrigger;
    sourceId = null;
    previousTrigger = null;
    saving = false;
    generation++;
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
    root.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onClose);
    owner.removeEventListener("pagehide", destroy);
    dialog.remove();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, close, refresh, destroy };
}
