import { shiftPlanningPeriod } from "./planning-periods.js";
import { weeklyPeriodFromKey } from "./weekly-flow.js";
import { monthlyPeriodFromKey } from "./monthly-flow.js";
import { isPlainSaveEnter } from "./record-form-shortcuts.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const parsePeriod = (type, key) =>
  type === "weekly"
    ? weeklyPeriodFromKey(key)
    : type === "monthly"
      ? monthlyPeriodFromKey(key)
      : null;

/** Confirm a period move without changing the goal until its single save. */
export function createGoalTransferUI({
  root = document.querySelector("#app"),
  getRecords,
  onMove,
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function" || typeof onMove !== "function")
    throw new TypeError(
      "Hedef taşımak için kayıtlar ve kaydetme işlemi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const dialog = document.createElement("dialog");
  dialog.id = "goal-transfer-dialog";
  dialog.className = "modal goal-transfer-dialog";
  dialog.setAttribute("aria-label", "Hedefi taşı");
  root.append(dialog);
  const drafts = new Map();
  let active = null;
  let saving = false;
  let destroyed = false;
  const form = () => dialog.querySelector("#goal-transfer-form");
  const find = (id) => getRecords().find((record) => record.id === id);

  function capture() {
    const current = form();
    if (!active || !current) return;
    active.draft.periodKey = current.elements.targetPeriod.value;
    active.draft.reason = current.elements.transferReason.value;
  }

  function updateState() {
    if (!active || !form()) return;
    const record = find(active.id);
    const issue =
      !record || record.type !== active.type || CLOSED.has(record.status)
        ? "Bu hedef artık taşınamıyor. Taslağın korunuyor."
        : JSON.stringify(record) !== JSON.stringify(active.expected)
          ? "Hedef değişti. Taslağın korunuyor; yeniden açıp kontrol et."
          : "";
    const current = form();
    current.setAttribute("aria-busy", String(saving));
    for (const control of current.querySelectorAll(
      "input, select, textarea, button",
    ))
      control.disabled = saving;
    current.querySelector('[type="submit"]').disabled =
      saving || Boolean(issue);
    const error = current.querySelector("#goal-transfer-error");
    error.textContent = issue || active.error || "";
    error.hidden = !error.textContent;
  }

  function refresh() {
    if (destroyed || !dialog.open || saving) return;
    capture();
    updateState();
  }

  function close({ restoreFocus = true } = {}) {
    capture();
    const trigger = active?.trigger;
    if (active) drafts.delete(active.id);
    active = null;
    saving = false;
    if (dialog.open) dialog.close();
    if (restoreFocus && trigger?.isConnected)
      trigger.focus({ preventScroll: true });
  }

  function open(id, { period, trigger = document.activeElement } = {}) {
    if (destroyed) return;
    try {
      if (dialog.open) {
        if (active?.id !== id)
          throw new Error("Önce açık taşıma işlemini tamamla veya kapat.");
        refresh();
        return;
      }
      const record = find(id);
      if (
        !record ||
        !["weekly", "monthly"].includes(record.type) ||
        CLOSED.has(record.status)
      )
        throw new Error("Taşınacak açık hedef bulunamadı.");
      const target =
        period?.type === record.type && parsePeriod(record.type, period.key);
      if (!target) throw new Error("Taşımak için geçerli bir dönem seç.");
      let draft = drafts.get(id);
      if (!draft) {
        draft = { periodKey: target.key, defaultKey: target.key, reason: "" };
        drafts.set(id, draft);
      } else if (draft.defaultKey !== target.key) {
        draft.defaultKey = target.key;
        draft.periodKey = target.key;
      }
      active = {
        id,
        type: record.type,
        expected: JSON.parse(JSON.stringify(record)),
        draft,
        trigger,
        error: "",
      };
      const choices = new Map();
      for (let index = 0; index < (record.type === "weekly" ? 8 : 6); index++) {
        try {
          const option = shiftPlanningPeriod(target, index);
          choices.set(option.key, option);
        } catch {
          break;
        }
      }
      const selected = parsePeriod(record.type, draft.periodKey);
      if (selected) choices.set(selected.key, selected);
      const choiceMarkup = [
        ...(!selected
          ? [
              `<option value="${escapeHtml(draft.periodKey)}" selected>Dönem seç</option>`,
            ]
          : []),
        ...[...choices.values()].map(
          (option) =>
            `<option value="${escapeHtml(option.key)}" ${option.key === draft.periodKey ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
        ),
      ].join("");
      dialog.innerHTML = `<form id="goal-transfer-form"><div class="modal-header"><h2>Hedefi taşı</h2><button type="button" class="close-modal" data-action="goal-transfer-cancel" aria-label="Pencereyi kapat">×</button></div><div class="modal-body goal-transfer-body"><div class="field"><span>Hedef</span><p class="goal-transfer-title">${escapeHtml(record.title)}</p></div><label class="field">Hedef dönem<select name="targetPeriod" required>${choiceMarkup}</select></label><label class="field"><span id="goal-transfer-note-label">Taşıma notu</span><small id="goal-transfer-note-help">İsteğe bağlı · Hedefin yeni dönemdeki durumu veya plan değişikliği hakkında kısa bir not ekleyebilirsin.</small><textarea name="transferReason" rows="2" maxlength="1000" aria-labelledby="goal-transfer-note-label" aria-describedby="goal-transfer-note-help" placeholder="Örn. Test tarihleri değişti; çalışmaya gelecek hafta devam edilecek.">${escapeHtml(draft.reason)}</textarea></label><p id="goal-transfer-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn" data-action="goal-transfer-cancel">Vazgeç</button><button type="submit" class="btn primary">Taşı</button></div></form>`;
      updateState();
      dialog.showModal();
      form().elements.transferReason.focus({ preventScroll: true });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function submit(event) {
    if (event.target !== form()) return;
    event.preventDefault();
    if (!active || saving) return;
    capture();
    updateState();
    if (form().querySelector('[type="submit"]').disabled) return;
    try {
      const period = parsePeriod(active.type, active.draft.periodKey);
      if (!period) throw new Error("Geçerli bir hedef dönem seç.");
      if (active.draft.reason.trim().length > 1000)
        throw new Error("Taşıma notu en fazla 1000 karakter olabilir.");
      saving = true;
      updateState();
      const pending = active;
      const saved = await onMove(
        pending.id,
        period,
        pending.draft.reason,
        pending.expected,
      );
      if (destroyed || active !== pending) return;
      if (saved !== true)
        throw new Error("Taşıma kaydedilemedi. Taslağın korunuyor.");
      close();
    } catch (error) {
      if (active)
        active.error = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
      updateState();
    }
  }

  function onInput(event) {
    if (event.target.closest?.("#goal-transfer-form") !== form() || !active)
      return;
    capture();
    active.error = "";
    updateState();
  }

  function onClick(event) {
    const control = event.target.closest?.(
      '[data-action="goal-transfer-cancel"]',
    );
    if (!control || !dialog.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!saving) close();
  }

  function onKeydown(event) {
    if (
      !event.target.matches?.('textarea[name="transferReason"]') ||
      !isPlainSaveEnter(event)
    )
      return;
    event.preventDefault();
    const submitter = form()?.querySelector('[type="submit"]');
    if (submitter && !submitter.disabled) form().requestSubmit(submitter);
  }

  function onCancel(event) {
    event.preventDefault();
    if (!saving) close();
  }

  function destroy() {
    if (destroyed) return;
    close({ restoreFocus: false });
    destroyed = true;
    dialog.removeEventListener("submit", submit);
    dialog.removeEventListener("input", onInput);
    dialog.removeEventListener("change", onInput);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("keydown", onKeydown);
    dialog.removeEventListener("cancel", onCancel);
    owner.removeEventListener("pagehide", destroy);
    dialog.remove();
    drafts.clear();
  }

  dialog.addEventListener("submit", submit);
  dialog.addEventListener("input", onInput);
  dialog.addEventListener("change", onInput);
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("cancel", onCancel);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, close, refresh, destroy };
}
