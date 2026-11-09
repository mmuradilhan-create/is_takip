import { statusLabel, statusForDisplay } from "./model.js";
import { linkedActions, resolveActionSource } from "./action-links.js";
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
const plusIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/** Keep the original decision and the real linked work in one read-only panel. */
export function createMeetingRecordPanel({
  root = document.querySelector("#app"),
  getRecords,
  formatDate = (value) => value,
  renderStatus = null,
  onEdit = () => {},
  onRoute = () => {},
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError("Toplantı ayrıntıları için kayıt listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const panel = document.createElement("dialog");
  panel.id = "meeting-record-panel";
  panel.className = "modal meeting-record-panel";
  panel.setAttribute("aria-label", "Toplantı ayrıntıları");
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
    bodySelector: ".meeting-record-body",
    onRefresh: refresh,
    onError,
  });

  function canActivate() {
    return !destroyed && !handoff.isBusy();
  }

  function canOpen(id) {
    return canActivate() && find(id)?.type === "meeting";
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
            ...root.querySelectorAll('[data-action="meeting-record-details"]'),
          ].find((control) => control.dataset.id === recordId);
      target?.focus({ preventScroll: true });
    }
  }

  function statusMarkup(record) {
    if (typeof renderStatus === "function") return renderStatus(record);
    return `<span class="badge status-${esc(statusForDisplay(record.status, record.type))}"><span class="dot"></span>${esc(statusLabel(record.type, record.status))}</span>`;
  }

  function routeMarkup(record, type, targets) {
    const target = targets.find((item) => item.type === type);
    if (!target && CLOSED.has(record.status)) return "";
    const daily = type === "daily";
    const label = target
      ? daily
        ? "İşi aç"
        : "Takibi aç"
      : daily
        ? "İş oluştur"
        : "Takip oluştur";
    const date = target && (daily ? target.dueDate : target.nextFollowUpDate);
    const routeAttributes = `data-action="meeting-record-route" data-id="${esc(record.id)}" data-route="${type}"`;
    return `<section class="meeting-record-route" data-meeting-route="${type}"><div class="meeting-record-section-heading"><h3>${daily ? "Bağlı günlük iş" : "Bağlı takip"} <small aria-label="${target ? 1 : 0} kayıt">${target ? 1 : 0}</small></h3>${target ? "" : `<button type="button" class="text-btn meeting-record-create" ${routeAttributes}>${plusIcon}<span>${label}</span></button>`}</div>${target ? `<ul class="meeting-record-linked-list"><li class="meeting-record-linked-row"><div class="meeting-record-linked-copy"><p class="meeting-record-linked-title">${esc(target.title)}</p><div class="meeting-record-route-facts">${statusMarkup(target)}${date ? `<span>${daily ? "Teslim" : "Sonraki takip"}: <time datetime="${esc(date)}">${esc(formatDate(date))}</time></span>` : ""}</div></div><button type="button" class="text-btn meeting-record-open" ${routeAttributes}>${label}</button></li></ul>` : `<p class="meeting-record-muted meeting-record-empty">${daily ? "Henüz bağlı günlük iş yok." : "Henüz bağlı takip yok."}</p>`}</section>`;
  }

  function render(record, { resetScroll = false } = {}) {
    const records = getRecords();
    const targets = linkedActions(record.id, records);
    record = resolveActionSource(record, records);
    const nextKey = JSON.stringify([record, targets]);
    if (renderKey === nextKey) return;
    const scrollTop = resetScroll
      ? 0
      : panel.querySelector(".meeting-record-body")?.scrollTop || 0;
    const active = document.activeElement;
    const action = panel.contains(active) ? active.dataset.action : null;
    const route = panel.contains(active) ? active.dataset.route : null;
    const bodyFocused = active?.classList?.contains("meeting-record-body");
    const routes = ["daily", "waiting"]
      .map((type) => routeMarkup(record, type, targets))
      .join("");
    panel.dataset.recordId = record.id;
    panel.innerHTML = `<div class="modal-header"><div class="meeting-record-heading"><p>Toplantı${record.sourceDate ? ` · <time datetime="${esc(record.sourceDate)}">${esc(formatDate(record.sourceDate))}</time>` : ""}</p><h2 class="meeting-record-title">${esc(record.title)}</h2><div class="meeting-record-summary">${statusMarkup(record)}</div></div><button type="button" class="close-modal" data-action="meeting-record-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body meeting-record-body" tabindex="0" aria-label="Karar ve bağlantılar"><section class="meeting-record-decision"><h3>Alınan karar</h3><p>${esc(record.decision || "Karar eklenmemiş.")}</p></section>${String(record.description || "").trim() ? `<section class="meeting-record-note"><h3>Notlar</h3><p>${esc(record.description)}</p></section>` : ""}${routes ? `<div class="meeting-record-routes">${routes}</div>` : ""}</div><div class="modal-footer"><button type="button" class="btn" data-action="meeting-record-edit" data-id="${esc(record.id)}">Kaydı düzenle</button><button type="button" class="btn primary" data-action="meeting-record-close">Kapat</button></div>`;
    const body = panel.querySelector(".meeting-record-body");
    body.scrollTop = scrollTop;
    renderKey = nextKey;
    if (action) {
      const control = [...panel.querySelectorAll("[data-action]")].find(
        (candidate) =>
          candidate.dataset.action === action &&
          (candidate.dataset.route || null) === route,
      );
      (control || panel.querySelector(".close-modal"))?.focus({
        preventScroll: true,
      });
    } else if (bodyFocused) body.focus({ preventScroll: true });
  }

  function open(id, { trigger = null } = {}) {
    if (!canActivate()) return;
    try {
      const record = find(id);
      if (record?.type !== "meeting") {
        close();
        onError("Bu toplantı artık bulunamıyor.");
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
        panel.querySelector(".close-modal")?.focus({ preventScroll: true });
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
      if (record?.type !== "meeting") close();
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
        "meeting-record-close",
        "meeting-record-edit",
        "meeting-record-route",
      ].includes(action)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!canActivate()) return;
    if (action === "meeting-record-close") {
      close();
      return;
    }
    const record = find(selectedId);
    if (record?.type !== "meeting") {
      refresh();
      return;
    }
    if (action === "meeting-record-edit") {
      handoff.run(control, () => onEdit(record.id));
      return;
    }
    const type = control.dataset.route;
    if (!["daily", "waiting"].includes(type)) return;
    const target = linkedActions(record.id, getRecords()).find(
      (item) => item.type === type,
    );
    if (
      !target &&
      CLOSED.has(resolveActionSource(record, getRecords()).status)
    ) {
      refresh();
      return;
    }
    handoff.run(control, () => onRoute(record.id, type));
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
