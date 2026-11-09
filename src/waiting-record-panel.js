import { localDate, statusForDisplay, statusLabel } from "./model.js";
import { waitingAgePresentation } from "./waiting-followup.js";
import { linkedActions } from "./action-links.js";
import { createRecordPanelHandoff } from "./record-panel-handoff.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
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
const checkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
const plusIcon =
  '<svg class="waiting-record-create-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const historyFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function historyDate(value) {
  if (!value) return "Tarih belirtilmemiş";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : historyFormatter.format(date);
}

function latestEntries(record) {
  return (Array.isArray(record.followUpLog) ? record.followUpLog : [])
    .map((entry, index) => ({ entry, index }))
    .sort(
      (first, second) =>
        String(second.entry.date).localeCompare(String(first.entry.date)) ||
        second.index - first.index,
    )
    .map(({ entry }) => entry);
}

/** Read the current waiting facts and actual recorded contacts without editing. */
export function createWaitingRecordPanel({
  root = document.querySelector("#app"),
  getRecords,
  formatDate = historyDate,
  renderStatus = null,
  onEdit = () => {},
  onFollowUp = () => {},
  onRoute = () => {},
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError(
      "Bekleyen konu ayrıntıları için kayıt listesi gereklidir.",
    );
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const panel = document.createElement("dialog");
  panel.id = "waiting-record-panel";
  panel.className = "modal waiting-record-panel";
  panel.setAttribute("aria-label", "Bekleyen konu ayrıntıları");
  root.append(panel);
  let selectedId = null;
  let previousTrigger = null;
  let renderKey = "";
  let destroyed = false;
  const find = (id) => getRecords().find((record) => record.id === id);
  const handoff = createRecordPanelHandoff({
    document,
    panel,
    getId: () => selectedId,
    bodySelector: ".waiting-record-body",
    onRefresh: refresh,
    onError,
  });

  function canActivate() {
    return !destroyed && !handoff.isBusy();
  }

  function canOpen(id) {
    return canActivate() && find(id)?.type === "waiting";
  }

  function close({ restoreFocus = true } = {}) {
    const trigger = previousTrigger;
    const recordId = selectedId;
    handoff.clear();
    selectedId = null;
    previousTrigger = null;
    renderKey = "";
    delete panel.dataset.recordId;
    if (panel.open) panel.close();
    if (restoreFocus) {
      const target = trigger?.isConnected
        ? trigger
        : [
            ...root.querySelectorAll('[data-action="waiting-record-details"]'),
          ].find((card) => card.dataset.id === recordId);
      target?.focus({ preventScroll: true });
    }
  }

  function dateMarkup(value, empty) {
    return value
      ? `<time datetime="${esc(value)}">${esc(formatDate(value))}</time>`
      : `<span class="waiting-record-muted">${esc(empty)}</span>`;
  }

  function historyMarkup(record, entries) {
    return `<section class="waiting-record-history" aria-label="Takip geçmişi"><div class="waiting-record-section-heading"><div class="waiting-record-section-title"><h3>Takip geçmişi</h3><span class="waiting-record-history-count" aria-label="${entries.length} kayıt">${entries.length}</span></div>${CLOSED.has(record.status) ? "" : `<button type="button" class="btn small waiting-record-followup" data-action="waiting-record-followup" data-id="${esc(record.id)}">${checkIcon}<span>Takip ettim</span></button>`}</div>${
      entries.length
        ? `<ol>${entries.map((entry) => `<li data-followup-id="${esc(entry.id)}"><time datetime="${esc(entry.date)}">${esc(historyDate(entry.date))}</time><p class="waiting-record-history-note${entry.note ? "" : " waiting-record-muted"}">${esc(entry.note || "Sonuç notu eklenmemiş.")}</p>${entry.nextFollowUpDate ? `<p class="waiting-record-planned">Sonraki takip: ${esc(historyDate(entry.nextFollowUpDate))}</p>` : ""}</li>`).join("")}</ol>`
        : '<p class="waiting-record-muted waiting-record-empty">Henüz takip kaydı yok.</p>'
    }</section>`;
  }

  function routeMarkup(record, targets) {
    const target = targets.find((item) => item.type === "daily");
    if (!target && CLOSED.has(record.status)) return "";
    const status =
      target &&
      (typeof renderStatus === "function"
        ? renderStatus(target)
        : `<span class="badge status-${esc(statusForDisplay(target.status))}"><span class="dot"></span>${esc(statusLabel("daily", target.status))}</span>`);
    return `<section class="waiting-record-route" data-waiting-route="daily"><h3>Bağlı iş</h3>${target ? `<p class="waiting-record-linked-title">${esc(target.title)}</p><div class="waiting-record-route-facts">${status}${target.dueDate ? `<span>Teslim: <time datetime="${esc(target.dueDate)}">${esc(formatDate(target.dueDate))}</time></span>` : ""}</div>` : ""}<button type="button" class="btn small" data-action="waiting-record-route" data-id="${esc(record.id)}" data-route="daily">${target ? "İşi aç" : `${plusIcon}<span>İş oluştur</span>`}</button></section>`;
  }

  function render(record, { resetScroll = false } = {}) {
    const targets = linkedActions(record.id, getRecords());
    const currentDay = localDate();
    const age = waitingAgePresentation(record, currentDay, { formatDate });
    const nextKey = JSON.stringify([
      record.id,
      record.title,
      record.status,
      record.expectedFrom,
      record.latestUpdate,
      record.sourceDate,
      record.nextFollowUpDate,
      record.lastFollowUpDate,
      record.description,
      record.followUpLog,
      record.sourceFields?.__waitingClosure,
      record.sourceFields?.["Kaç Gün Bekledi"],
      currentDay,
      age,
      targets,
    ]);
    if (renderKey === nextKey) return;
    const scrollTop = resetScroll
      ? 0
      : panel.querySelector(".waiting-record-body")?.scrollTop || 0;
    const active = document.activeElement;
    const focusedAction = panel.contains(active) ? active.dataset.action : null;
    const bodyFocused = active?.classList?.contains("waiting-record-body");
    const entries = latestEntries(record);
    const status =
      typeof renderStatus === "function"
        ? renderStatus(record)
        : `<span class="badge status-${esc(statusForDisplay(record.status))}"><span class="dot"></span>${esc(statusLabel("waiting", record.status))}</span>`;
    panel.dataset.recordId = record.id;
    panel.innerHTML = `<div class="modal-header"><div class="waiting-record-heading"><p>Bekleyen konu</p><h2 class="waiting-record-title" title="${esc(record.title)}">${esc(record.title)}</h2><div class="waiting-record-summary">${status}${record.sourceDate ? `<span>Başlangıç: ${dateMarkup(record.sourceDate, "")}</span>` : ""}</div></div><button type="button" class="close-modal" data-action="waiting-record-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body waiting-record-body" tabindex="0" aria-label="Konu ve takip ayrıntıları"><dl class="waiting-record-facts"><div data-waiting-fact="expectedFrom"><dt>Kimden / nereden bekleniyor?</dt><dd>${esc(record.expectedFrom || "Belirtilmedi.")}</dd></div><div data-waiting-fact="latestUpdate"><dt>Son gelişme</dt><dd>${esc(record.latestUpdate || "Son gelişme eklenmedi.")}</dd></div><div data-waiting-fact="nextFollowUpDate"><dt>Sonraki takip</dt><dd>${dateMarkup(record.nextFollowUpDate, "Planlanmadı.")}</dd></div><div data-waiting-fact="lastFollowUpDate"><dt>Son takip</dt><dd>${dateMarkup(record.lastFollowUpDate, entries.length ? "Son takip tarihi yok." : "Henüz takip edilmedi.")}</dd></div><div data-waiting-fact="age"><dt>Bekleme</dt><dd data-waiting-age-kind="${esc(age.kind)}" title="${esc(age.title)}" aria-label="${esc(age.ariaLabel)}">${esc(age.description)}</dd></div></dl>${routeMarkup(record, targets)}${historyMarkup(record, entries)}${String(record.description || "").trim() ? `<section class="waiting-record-note"><h3>Notlar</h3><p>${esc(record.description)}</p></section>` : ""}</div><div class="modal-footer"><button type="button" class="btn" data-action="waiting-record-edit" data-id="${esc(record.id)}">Kaydı düzenle</button><button type="button" class="btn primary" data-action="waiting-record-close">Kapat</button></div>`;
    const body = panel.querySelector(".waiting-record-body");
    body.scrollTop = scrollTop;
    renderKey = nextKey;
    if (focusedAction) {
      const target =
        panel.querySelector(`[data-action="${focusedAction}"]`) ||
        panel.querySelector('[data-action="waiting-record-close"]');
      target?.focus({ preventScroll: true });
    } else if (bodyFocused) body.focus({ preventScroll: true });
  }

  function open(id, { trigger = null } = {}) {
    if (!canActivate()) return;
    try {
      const record = find(id);
      if (record?.type !== "waiting") {
        close();
        onError("Bu bekleyen konu artık bulunamıyor.");
        return;
      }
      const sameRecord = panel.open && selectedId === id;
      if (!sameRecord) {
        previousTrigger = trigger?.isConnected
          ? trigger
          : document.activeElement;
        selectedId = id;
        renderKey = "";
      }
      render(record, { resetScroll: !sameRecord });
      if (!panel.open) {
        panel.show();
        panel
          .querySelector('[data-action="waiting-record-close"]')
          ?.focus({ preventScroll: true });
      }
    } catch (error) {
      close();
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function refresh() {
    if (destroyed || !panel.open) return;
    try {
      const record = find(selectedId);
      if (record?.type !== "waiting") close();
      else render(record);
    } catch (error) {
      close();
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !panel.contains(control)) return;
    const action = control.dataset.action;
    if (
      ![
        "waiting-record-close",
        "waiting-record-edit",
        "waiting-record-followup",
        "waiting-record-route",
      ].includes(action)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!canActivate()) return;
    if (action === "waiting-record-close") {
      close();
      return;
    }
    try {
      const record = find(selectedId);
      if (
        record?.type !== "waiting" ||
        (action === "waiting-record-followup" && CLOSED.has(record.status))
      ) {
        refresh();
        return;
      }
      if (action === "waiting-record-route") {
        const target = linkedActions(record.id, getRecords()).find(
          (item) => item.type === "daily",
        );
        if (!target && CLOSED.has(record.status)) {
          refresh();
          return;
        }
      }
      handoff.run(control, () =>
        action === "waiting-record-edit"
          ? onEdit(record.id)
          : action === "waiting-record-route"
            ? onRoute(record.id, "daily")
            : onFollowUp(record.id),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function onEscape(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !panel.open) return;
    if (document.querySelector("dialog:modal, :popover-open")) return;
    event.preventDefault();
    close();
  }

  function onCancel(event) {
    event.preventDefault();
    if (canActivate()) close();
  }

  function onClose() {
    // A delayed native close event must not reset a newly opened record.
    if (panel.open) return;
    handoff.clear();
    selectedId = null;
    previousTrigger = null;
    renderKey = "";
    delete panel.dataset.recordId;
  }

  function destroy() {
    if (destroyed) return;
    close({ restoreFocus: false });
    destroyed = true;
    panel.removeEventListener("click", onClick);
    panel.removeEventListener("cancel", onCancel);
    panel.removeEventListener("close", onClose);
    owner.removeEventListener("keydown", onEscape);
    owner.removeEventListener("pagehide", destroy);
    panel.remove();
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("cancel", onCancel);
  panel.addEventListener("close", onClose);
  owner.addEventListener("keydown", onEscape);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, canOpen, canActivate, close, refresh, destroy };
}
