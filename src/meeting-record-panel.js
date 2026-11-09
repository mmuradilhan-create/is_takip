import { statusLabel, statusForDisplay } from "./model.js";
import {
  linkedActions,
  meetingActionCandidates,
  resolveActionSource,
} from "./action-links.js";
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
  onLinkAction = null,
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
  let linking = null;
  const linkDraftIds = { daily: "", waiting: "" };
  const linkErrors = { daily: "", waiting: "" };
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
    return !destroyed && !handoff.isBusy() && !linking;
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
    for (const type of ["daily", "waiting"]) {
      linkDraftIds[type] = "";
      linkErrors[type] = "";
    }
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

  function routeMarkup(record, type, targets, candidates) {
    const target = targets.find((item) => item.type === type);
    if (!target && CLOSED.has(record.status)) return "";
    const daily = type === "daily";
    const label = target
      ? daily
        ? "İşi aç"
        : "Takibi aç"
      : daily
        ? "Yeni adım ekle"
        : "Yeni takip ekle";
    const date = target && (daily ? target.dueDate : target.nextFollowUpDate);
    const routeAttributes = `data-action="meeting-record-route" data-id="${esc(record.id)}" data-route="${type}"`;
    const caption = daily ? "Mevcut günlük işi bağla" : "Mevcut takibi bağla";
    const attach =
      !target && typeof onLinkAction === "function"
        ? `<form id="meeting-link-${type}-form" class="goal-link-child-form" data-id="${esc(record.id)}" data-route="${type}"><label for="meeting-link-${type}">${caption}</label><div class="goal-link-child-controls"><select id="meeting-link-${type}" name="childId" data-route="${type}" aria-label="${caption}"${candidates.length ? "" : " disabled"}><option value="">${candidates.length ? "Kayıt seç" : daily ? "Uygun günlük iş yok" : "Uygun takip yok"}</option>${candidates.map((child) => `<option value="${esc(child.id)}"${child.id === linkDraftIds[type] ? " selected" : ""}>${esc(child.title)}</option>`).join("")}</select><button type="submit" class="btn"${linkDraftIds[type] ? "" : " disabled"}>Bağla</button></div><p id="meeting-link-${type}-error" class="meeting-record-link-error" role="alert"${linkErrors[type] ? "" : " hidden"}>${esc(linkErrors[type])}</p></form>`
        : "";
    return `<section class="meeting-record-route" data-meeting-route="${type}"><div class="meeting-record-section-heading"><h3 tabindex="-1" data-meeting-section-heading="${type}">${daily ? "Bağlı günlük işler" : "Bağlı takipler"} <small aria-label="${target ? 1 : 0} kayıt">${target ? 1 : 0}</small></h3>${target ? "" : `<button type="button" class="text-btn meeting-record-create" ${routeAttributes}>${plusIcon}<span>${label}</span></button>`}</div>${target ? `<ul class="meeting-record-linked-list"><li class="meeting-record-linked-row"><div class="meeting-record-linked-copy"><p class="meeting-record-linked-title">${esc(target.title)}</p><div class="meeting-record-route-facts">${statusMarkup(target)}${date ? `<span>${daily ? "Teslim" : "Sonraki takip"}: <time datetime="${esc(date)}">${esc(formatDate(date))}</time></span>` : ""}</div></div><button type="button" class="text-btn meeting-record-open" ${routeAttributes}>${label}</button></li></ul>` : `<p class="meeting-record-muted meeting-record-empty">${daily ? "Henüz bağlı günlük iş yok." : "Henüz bağlı takip yok."}</p>`}${attach}</section>`;
  }

  function updateBusyState() {
    for (const control of panel.querySelectorAll(
      "[data-meeting-link-disabled]",
    )) {
      control.disabled = false;
      delete control.dataset.meetingLinkDisabled;
    }
    for (const type of ["daily", "waiting"]) {
      const select = panel.querySelector(`#meeting-link-${type}`);
      const submit = panel.querySelector(
        `#meeting-link-${type}-form button[type="submit"]`,
      );
      if (select)
        select.disabled = !meetingActionCandidates(
          getRecords(),
          selectedId,
          type,
        ).length;
      if (submit) submit.disabled = !linkDraftIds[type];
    }
    if (linking)
      for (const control of panel.querySelectorAll("button, select")) {
        if (!control.disabled) control.dataset.meetingLinkDisabled = "true";
        control.disabled = true;
      }
    panel.setAttribute("aria-busy", String(Boolean(linking)));
  }

  function render(record, { resetScroll = false } = {}) {
    const records = getRecords();
    const targets = linkedActions(record.id, records);
    record = resolveActionSource(record, records);
    const candidates = Object.fromEntries(
      ["daily", "waiting"].map((type) => [
        type,
        meetingActionCandidates(records, record.id, type),
      ]),
    );
    for (const type of ["daily", "waiting"])
      if (!candidates[type].some((item) => item.id === linkDraftIds[type]))
        linkDraftIds[type] = "";
    const nextKey = JSON.stringify([
      record,
      targets,
      candidates,
      linkDraftIds,
      linkErrors,
      linking,
    ]);
    if (renderKey === nextKey) return;
    const scrollTop = resetScroll
      ? 0
      : panel.querySelector(".meeting-record-body")?.scrollTop || 0;
    const active = document.activeElement;
    const action = panel.contains(active) ? active.dataset.action : null;
    const route = panel.contains(active) ? active.dataset.route : null;
    const elementId = panel.contains(active) ? active.id : null;
    const bodyFocused = active?.classList?.contains("meeting-record-body");
    const routes = ["daily", "waiting"]
      .map((type) => routeMarkup(record, type, targets, candidates[type]))
      .join("");
    panel.dataset.recordId = record.id;
    panel.innerHTML = `<div class="modal-header"><div class="meeting-record-heading"><p>Toplantı${record.sourceDate ? ` · <time datetime="${esc(record.sourceDate)}">${esc(formatDate(record.sourceDate))}</time>` : ""}</p><h2 class="meeting-record-title">${esc(record.title)}</h2><div class="meeting-record-summary">${statusMarkup(record)}</div></div><button type="button" class="close-modal" data-action="meeting-record-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body meeting-record-body" tabindex="0" aria-label="Karar ve bağlantılar"><section class="meeting-record-decision"><h3>Alınan karar</h3><p>${esc(record.decision || "Karar eklenmemiş.")}</p></section>${routes ? `<div class="meeting-record-routes">${routes}</div>` : ""}${String(record.description || "").trim() ? `<section class="meeting-record-note"><h3>Notlar</h3><p>${esc(record.description)}</p></section>` : ""}</div><div class="modal-footer"><button type="button" class="btn" data-action="meeting-record-edit" data-id="${esc(record.id)}">Kaydı düzenle</button><button type="button" class="btn primary" data-action="meeting-record-close">Kapat</button></div>`;
    const body = panel.querySelector(".meeting-record-body");
    body.scrollTop = scrollTop;
    renderKey = nextKey;
    updateBusyState();
    if (action || elementId) {
      const control =
        (elementId && panel.querySelector(`#${elementId}`)) ||
        [...panel.querySelectorAll("[data-action]")].find(
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
        for (const type of ["daily", "waiting"]) {
          linkDraftIds[type] = "";
          linkErrors[type] = "";
        }
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

  async function linkAction(type, childId) {
    if (!canActivate() || typeof onLinkAction !== "function") return;
    const record = find(selectedId);
    if (record?.type !== "meeting") return;
    if (
      !meetingActionCandidates(getRecords(), record.id, type).some(
        (candidate) => candidate.id === childId,
      )
    ) {
      linkErrors[type] =
        "Bu kayıt artık bağlanmaya uygun değil. Listeyi yeniden kontrol et.";
      renderKey = "";
      refresh();
      onError(linkErrors[type]);
      return;
    }
    linking = type;
    linkErrors[type] = "";
    updateBusyState();
    let saved = false;
    try {
      saved = (await onLinkAction(record.id, childId, type)) === true;
      if (saved) linkDraftIds[type] = "";
      else linkErrors[type] = "Bağlantı kaydedilemedi. Yeniden deneyebilirsin.";
    } catch (error) {
      linkErrors[type] =
        (error instanceof Error ? error.message : String(error)) ||
        "Bağlantı kaydedilemedi. Yeniden deneyebilirsin.";
    } finally {
      linking = null;
      renderKey = "";
      if (!destroyed && panel.open && selectedId === record.id) {
        refresh();
        const target = saved
          ? panel.querySelector(`.meeting-record-open[data-route="${type}"]`)
          : panel.querySelector(`#meeting-link-${type}`);
        (
          target ||
          panel.querySelector(`[data-meeting-section-heading="${type}"]`) ||
          panel.querySelector(".close-modal")
        )?.focus({ preventScroll: true });
        if (!saved)
          panel
            .querySelector(`#meeting-link-${type}-error`)
            ?.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function onLinkDraft(event) {
    const select = event.target;
    if (
      !select.matches?.("#meeting-link-daily, #meeting-link-waiting") ||
      !canActivate()
    )
      return;
    const type = select.dataset.route;
    linkDraftIds[type] = select.value;
    linkErrors[type] = "";
    const error = panel.querySelector(`#meeting-link-${type}-error`);
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
    updateBusyState();
  }

  function onSubmit(event) {
    if (
      !event.target.matches?.(
        "#meeting-link-daily-form, #meeting-link-waiting-form",
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.target.dataset.id !== selectedId) return;
    void linkAction(
      event.target.dataset.route,
      event.target.elements.childId.value,
    ).catch((error) =>
      onError(error instanceof Error ? error.message : String(error)),
    );
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
    if (!canActivate()) return;
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
    for (const type of ["daily", "waiting"]) {
      linkDraftIds[type] = "";
      linkErrors[type] = "";
    }
    delete panel.dataset.recordId;
  }

  function destroy() {
    if (destroyed) return;
    close({ restoreFocus: false });
    destroyed = true;
    panel.removeEventListener("click", onClick);
    panel.removeEventListener("submit", onSubmit);
    panel.removeEventListener("input", onLinkDraft);
    panel.removeEventListener("change", onLinkDraft);
    panel.removeEventListener("cancel", onCancel);
    panel.removeEventListener("close", onClose);
    owner.removeEventListener("keydown", onEscape);
    owner.removeEventListener("pagehide", destroy);
    panel.remove();
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("submit", onSubmit);
  panel.addEventListener("input", onLinkDraft);
  panel.addEventListener("change", onLinkDraft);
  panel.addEventListener("cancel", onCancel);
  panel.addEventListener("close", onClose);
  owner.addEventListener("keydown", onEscape);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, canOpen, canActivate, close, refresh, destroy };
}
