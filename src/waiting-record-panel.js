import { localDate, statusForDisplay, statusLabel } from "./model.js";
import { waitingAgePresentation } from "./waiting-followup.js";
import { linkedActions } from "./action-links.js";
import { createRecordPanelHandoff } from "./record-panel-handoff.js";
import { renderDeadlineChip } from "./deadline-presentation.js";

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

function sortChildren(first, second) {
  return (
    Number(CLOSED.has(first.status)) - Number(CLOSED.has(second.status)) ||
    (first.dueDate || "9999").localeCompare(second.dueDate || "9999") ||
    first.title.localeCompare(second.title, "tr") ||
    first.id.localeCompare(second.id)
  );
}

/** Read the current waiting facts and actual recorded contacts without editing. */
export function createWaitingRecordPanel({
  root = document.querySelector("#app"),
  getRecords,
  formatDate = historyDate,
  renderStatus = null,
  renderComplete = () => "",
  renderWork = () => "",
  renderJournal = () => "",
  renderNote = () => "",
  renderBlocked = () => "",
  renderDateControl = null,
  onEdit = () => {},
  onFollowUp = () => {},
  onRoute = () => {},
  onCreateDaily = null,
  onOpenDaily = () => {},
  onLinkDaily = null,
  onUnlinkDaily = null,
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
  let linking = false;
  let unlinking = null;
  let linkDraftId = "";
  let linkError = "";
  let unlinkError = "";
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
    return !destroyed && !handoff.isBusy() && !linking && !unlinking;
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
    linkDraftId = "";
    linkError = "";
    unlinkError = "";
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

  function statusMarkup(record) {
    return typeof renderStatus === "function"
      ? renderStatus(record)
      : `<span class="badge status-${esc(statusForDisplay(record.status))}"><span class="dot"></span>${esc(statusLabel(record.type, record.status))}</span>`;
  }

  function linkCandidates(records) {
    return records
      .filter(
        (record) =>
          record.type === "daily" &&
          !CLOSED.has(record.status) &&
          !Object.hasOwn(record.sourceFields || {}, "__followupSource"),
      )
      .sort(sortChildren);
  }

  function childMarkup(record) {
    const date =
      (typeof renderDateControl === "function" && renderDateControl(record)) ||
      renderDeadlineChip(record, {
        label: record.dueDate ? formatDate(record.dueDate) : "Tarih yok",
        className: "goal-child-date",
      });
    const titleClass = ["completed", "cancelled"].includes(record.status)
      ? ` ${record.status}`
      : "";
    const unlink =
      typeof onUnlinkDaily === "function"
        ? `<button type="button" class="goal-child-unlink" data-action="waiting-record-unlink-daily" data-id="${esc(record.id)}" data-route="${esc(record.id)}" aria-label="${esc(record.title)}: bekleyen konu bağını kaldır" data-record-link-tooltip="Bekleyen konu bağını kaldır"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15-1 1a4 4 0 0 1-6-6l3-3a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-3 3a4 4 0 0 1-6 0M3 21 21 3"/></svg></button>`
        : "";
    return `<li class="goal-child-row waiting-record-child" data-id="${esc(record.id)}"><span class="waiting-record-child-complete">${renderComplete(record)}</span><div class="goal-child-main"><div class="goal-child-title-line"><button type="button" class="goal-child-title${titleClass}" data-action="waiting-record-open-daily" data-id="${esc(record.id)}" data-route="${esc(record.id)}">${esc(record.title)}</button>${renderNote(record)}${renderBlocked(record)}</div><div class="goal-child-meta">${statusMarkup(record)}${date}${renderJournal(record)}</div></div><div class="goal-child-action goal-child-actions">${unlink}${renderWork(record)}</div></li>`;
  }

  function childrenMarkup(record, children, candidates) {
    const open = !CLOSED.has(record.status);
    const attach =
      open && typeof onLinkDaily === "function"
        ? `<form id="waiting-link-daily-form" class="goal-link-child-form" data-id="${esc(record.id)}"><label for="waiting-link-daily">Mevcut günlük işi bağla</label><div class="goal-link-child-controls"><select id="waiting-link-daily" name="childId" aria-label="Mevcut günlük işi bağla" ${candidates.length ? "" : "disabled"}><option value="">${candidates.length ? "Kayıt seç" : "Uygun günlük iş yok"}</option>${candidates.map((child) => `<option value="${esc(child.id)}" ${child.id === linkDraftId ? "selected" : ""}>${esc(child.title)}</option>`).join("")}</select><button type="submit" class="btn" ${linkDraftId ? "" : "disabled"}>Bağla</button></div><p id="waiting-link-daily-error" class="waiting-record-link-error" role="alert">${esc(linkError)}</p></form>`
        : "";
    return `<section class="waiting-record-children" data-waiting-section="children"><div class="waiting-record-section-heading"><h3 tabindex="-1" data-waiting-section-heading="children">Bağlı günlük işler <small>${children.length}</small></h3>${open && typeof onCreateDaily === "function" ? `<button type="button" class="text-btn waiting-record-new-step" data-action="waiting-record-create-daily" data-id="${esc(record.id)}">${plusIcon}<span>Yeni adım ekle</span></button>` : ""}</div>${children.length ? `<ul class="goal-child-list">${children.map(childMarkup).join("")}</ul>` : '<p class="waiting-record-muted waiting-record-empty">Henüz bağlı günlük iş yok.</p>'}<p id="waiting-unlink-daily-error" class="waiting-record-link-error" role="alert">${esc(unlinkError)}</p>${attach}</section>`;
  }

  function updateBusyState() {
    const busy = linking || Boolean(unlinking);
    for (const control of panel.querySelectorAll(
      '[data-action^="waiting-record-"], #waiting-link-daily-form button, #waiting-link-daily',
    )) {
      if (control.matches("#waiting-link-daily")) {
        control.disabled = busy || !linkCandidates(getRecords()).length;
      } else if (
        control.matches('#waiting-link-daily-form button[type="submit"]')
      ) {
        control.disabled = busy || !linkDraftId;
      } else control.disabled = busy;
    }
    panel.setAttribute("aria-busy", String(busy));
  }

  function focusChildren() {
    const body = panel.querySelector(".waiting-record-body");
    const section = panel.querySelector('[data-waiting-section="children"]');
    if (!body || !section) return;
    body.scrollTop +=
      section.getBoundingClientRect().top -
      body.getBoundingClientRect().top -
      12;
    section.querySelector("h3")?.focus({ preventScroll: true });
  }

  function render(record, { resetScroll = false } = {}) {
    const records = getRecords();
    const targets = linkedActions(record.id, records)
      .filter((item) => item.type === "daily")
      .sort(sortChildren);
    const candidates = linkCandidates(records);
    if (!candidates.some((item) => item.id === linkDraftId)) linkDraftId = "";
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
      candidates.map((item) => [item.id, item.title]),
      linkDraftId,
      linkError,
      unlinkError,
      linking,
      unlinking,
    ]);
    if (renderKey === nextKey) return;
    const scrollTop = resetScroll
      ? 0
      : panel.querySelector(".waiting-record-body")?.scrollTop || 0;
    const active = document.activeElement;
    const focus = panel.contains(active)
      ? {
          action: active.dataset.action,
          id: active.dataset.id,
          route: active.dataset.route,
          elementId: active.id,
          section: active.dataset.waitingSectionHeading,
        }
      : null;
    const bodyFocused = active?.classList?.contains("waiting-record-body");
    const entries = latestEntries(record);
    const status = statusMarkup(record);
    panel.dataset.recordId = record.id;
    panel.innerHTML = `<div class="modal-header"><div class="waiting-record-heading"><p>Bekleyen konu</p><h2 class="waiting-record-title" title="${esc(record.title)}">${esc(record.title)}</h2><div class="waiting-record-summary">${status}${record.sourceDate ? `<span>Başlangıç: ${dateMarkup(record.sourceDate, "")}</span>` : ""}</div></div><button type="button" class="close-modal" data-action="waiting-record-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body waiting-record-body" tabindex="0" aria-label="Konu ve takip ayrıntıları"><dl class="waiting-record-facts"><div data-waiting-fact="expectedFrom"><dt>Kimden / nereden bekleniyor?</dt><dd>${esc(record.expectedFrom || "Belirtilmedi.")}</dd></div>${record.status === "cancelled" && record.cancelReason ? `<div data-waiting-fact="cancelReason"><dt>İptal nedeni</dt><dd>${esc(record.cancelReason)}</dd></div>` : ""}<div data-waiting-fact="latestUpdate"><dt>Son gelişme</dt><dd>${esc(record.latestUpdate || "Son gelişme eklenmedi.")}</dd></div><div data-waiting-fact="nextFollowUpDate"><dt>Sonraki takip</dt><dd>${dateMarkup(record.nextFollowUpDate, "Planlanmadı.")}</dd></div><div data-waiting-fact="lastFollowUpDate"><dt>Son takip</dt><dd>${dateMarkup(record.lastFollowUpDate, entries.length ? "Son takip tarihi yok." : "Henüz takip edilmedi.")}</dd></div><div data-waiting-fact="age"><dt>Bekleme</dt><dd data-waiting-age-kind="${esc(age.kind)}" title="${esc(age.title)}" aria-label="${esc(age.ariaLabel)}">${esc(age.description)}</dd></div></dl>${childrenMarkup(record, targets, candidates)}${historyMarkup(record, entries)}${String(record.description || "").trim() ? `<section class="waiting-record-note"><h3>Notlar</h3><p>${esc(record.description)}</p></section>` : ""}</div><div class="modal-footer"><button type="button" class="btn" data-action="waiting-record-edit" data-id="${esc(record.id)}">Kaydı düzenle</button><button type="button" class="btn primary" data-action="waiting-record-close">Kapat</button></div>`;
    const body = panel.querySelector(".waiting-record-body");
    body.scrollTop = scrollTop;
    renderKey = nextKey;
    updateBusyState();
    if (focus?.action) {
      const target =
        [...panel.querySelectorAll("[data-action]")].find(
          (item) =>
            item.dataset.action === focus.action &&
            item.dataset.id === focus.id &&
            item.dataset.route === focus.route,
        ) || panel.querySelector('[data-waiting-section-heading="children"]');
      target?.focus({ preventScroll: true });
    } else if (focus?.elementId === "waiting-link-daily") {
      panel
        .querySelector("#waiting-link-daily")
        ?.focus({ preventScroll: true });
    } else if (focus?.section === "children") {
      panel
        .querySelector('[data-waiting-section-heading="children"]')
        ?.focus({ preventScroll: true });
    } else if (bodyFocused) body.focus({ preventScroll: true });
  }

  function open(id, { trigger = null, section = null } = {}) {
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
        linkDraftId = "";
        linkError = "";
        unlinkError = "";
      } else if (trigger?.isConnected) previousTrigger = trigger;
      render(record, { resetScroll: section !== "children" });
      if (!panel.open) {
        panel.show();
        panel
          .querySelector('[data-action="waiting-record-close"]')
          ?.focus({ preventScroll: true });
      }
      if (section === "children") focusChildren();
      else panel.querySelector(".waiting-record-body").scrollTop = 0;
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

  async function changeDailyLink(kind, childId) {
    if (!canActivate()) return;
    const source = find(selectedId);
    const records = getRecords();
    if (source?.type !== "waiting") return;
    const attach = kind === "link";
    const callback = attach ? onLinkDaily : onUnlinkDaily;
    if (typeof callback !== "function") return;
    const children = linkedActions(source.id, records)
      .filter((item) => item.type === "daily")
      .sort(sortChildren);
    if (
      attach
        ? CLOSED.has(source.status) ||
          !linkCandidates(records).some((item) => item.id === childId)
        : !children.some((item) => item.id === childId)
    ) {
      if (attach)
        linkError =
          "Bu kayıt artık bağlanmaya uygun değil. Listeyi yeniden kontrol et.";
      else unlinkError = "Bu günlük iş artık bu konuya bağlı değil.";
      if (attach && CLOSED.has(source.status)) onError(linkError);
      renderKey = "";
      refresh();
      return;
    }
    const index = children.findIndex((item) => item.id === childId);
    const nextChildId = children[index + 1]?.id || children[index - 1]?.id;
    if (attach) {
      linking = true;
      linkError = "";
    } else {
      unlinking = childId;
      unlinkError = "";
    }
    updateBusyState();
    let saved = false;
    try {
      saved = (await callback(source.id, childId)) === true;
      if (saved && attach) linkDraftId = "";
      else if (!saved) {
        if (attach)
          linkError = "Bağlantı kaydedilemedi. Yeniden deneyebilirsin.";
        else unlinkError = "Bağlantı kaldırılamadı. Yeniden deneyebilirsin.";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attach) linkError = message || "Bağlantı kaydedilemedi.";
      else unlinkError = message || "Bağlantı kaldırılamadı.";
    } finally {
      linking = false;
      unlinking = null;
      renderKey = "";
      if (!destroyed && panel.open && selectedId === source.id) {
        refresh();
        const target = attach
          ? panel.querySelector("#waiting-link-daily")
          : [
              ...panel.querySelectorAll(
                '[data-action="waiting-record-unlink-daily"]',
              ),
            ].find(
              (item) => item.dataset.id === (saved ? nextChildId : childId),
            );
        (
          target ||
          panel.querySelector('[data-waiting-section-heading="children"]')
        )?.focus({ preventScroll: true });
        if (!saved)
          panel
            .querySelector(
              attach
                ? "#waiting-link-daily-error"
                : "#waiting-unlink-daily-error",
            )
            ?.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function onLinkDraft(event) {
    if (!event.target.matches?.("#waiting-link-daily") || linking || unlinking)
      return;
    linkDraftId = event.target.value;
    linkError = "";
    panel.querySelector("#waiting-link-daily-error").textContent = "";
    updateBusyState();
  }

  function onSubmit(event) {
    if (!event.target.matches?.("#waiting-link-daily-form")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.target.dataset.id !== selectedId) return;
    void changeDailyLink("link", event.target.elements.childId.value).catch(
      (error) =>
        onError(error instanceof Error ? error.message : String(error)),
    );
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
        "waiting-record-create-daily",
        "waiting-record-open-daily",
        "waiting-record-unlink-daily",
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
    if (action === "waiting-record-unlink-daily") {
      void changeDailyLink("unlink", control.dataset.id).catch((error) =>
        onError(error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    try {
      const record = find(selectedId);
      if (
        record?.type !== "waiting" ||
        (["waiting-record-followup", "waiting-record-create-daily"].includes(
          action,
        ) &&
          CLOSED.has(record.status))
      ) {
        refresh();
        return;
      }
      if (
        action === "waiting-record-open-daily" &&
        !linkedActions(record.id, getRecords()).some(
          (item) => item.type === "daily" && item.id === control.dataset.id,
        )
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
          : action === "waiting-record-create-daily"
            ? onCreateDaily?.(record.id)
            : action === "waiting-record-open-daily"
              ? onOpenDaily(control.dataset.id, record.id)
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
    if (canActivate()) close();
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
    linkDraftId = "";
    linkError = "";
    unlinkError = "";
    delete panel.dataset.recordId;
  }

  function destroy() {
    if (destroyed) return;
    close({ restoreFocus: false });
    destroyed = true;
    panel.removeEventListener("click", onClick);
    panel.removeEventListener("input", onLinkDraft);
    panel.removeEventListener("change", onLinkDraft);
    panel.removeEventListener("submit", onSubmit);
    panel.removeEventListener("cancel", onCancel);
    panel.removeEventListener("close", onClose);
    owner.removeEventListener("keydown", onEscape);
    owner.removeEventListener("pagehide", destroy);
    panel.remove();
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", onLinkDraft);
  panel.addEventListener("change", onLinkDraft);
  panel.addEventListener("submit", onSubmit);
  panel.addEventListener("cancel", onCancel);
  panel.addEventListener("close", onClose);
  owner.addEventListener("keydown", onEscape);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { open, canOpen, canActivate, close, refresh, destroy };
}
