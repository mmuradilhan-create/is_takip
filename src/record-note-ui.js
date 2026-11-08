const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const noteIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><path d="M8 3v18M3 7h4M3 12h4M3 17h4M11 8h6M11 12h6M11 16h4"/></svg>';
const historyIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.7 6.4M3 4v7h7M12 7v5l3 2"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const noteText = (record) => String(record?.description ?? "");
const triggerSelector =
  '[data-action="record-note"], [data-action="waiting-history"]';
const kindFor = (control) =>
  control?.dataset.action === "waiting-history" ? "history" : "note";
const eligible = (record, kind = "note") =>
  kind === "history"
    ? record?.type === "waiting" &&
      Array.isArray(record.followUpLog) &&
      record.followUpLog.length > 0
    : Boolean(record && noteText(record).trim());
const historyFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function historyDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
    ? text
    : historyFormatter.format(date);
}

function historyMarkup(record) {
  const entries = record.followUpLog
    .map((entry, index) => ({ entry, index }))
    .sort(
      (first, second) =>
        String(second.entry.date).localeCompare(String(first.entry.date)) ||
        second.index - first.index,
    );
  return `<ol class="record-history-list">${entries
    .map(
      ({ entry }) =>
        `<li data-followup-id="${escapeHtml(entry.id)}"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(historyDate(entry.date))}</time><p class="record-history-result">${escapeHtml(entry.note || "Sonuç notu eklenmemiş.")}</p>${Object.hasOwn(entry, "previousUpdate") ? `<div class="record-history-previous"><span>Önceki son gelişme</span><p>${escapeHtml(entry.previousUpdate || "")}</p></div>` : ""}${entry.nextFollowUpDate ? `<p class="record-history-planned">Sonraki takip: ${escapeHtml(historyDate(entry.nextFollowUpDate))}</p>` : ""}</li>`,
    )
    .join("")}</ol>`;
}

/** Preview actual notes or saved contacts without editing or creating activity. */
export function createRecordNoteUI({
  root = document.querySelector("#app"),
  getRecord,
} = {}) {
  if (!root || typeof getRecord !== "function")
    throw new TypeError("Kayıt notu için kayıt seçimi gereklidir.");
  const owner = root.ownerDocument;
  const win = owner.defaultView;
  const popup = owner.createElement("div");
  popup.id = "record-note-popover";
  popup.className = "record-note-popover";
  popup.setAttribute("popover", "auto");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Kayıt notu");
  popup.innerHTML = `<div class="record-note-heading"><strong>Not</strong><button type="button" class="record-note-close" data-action="record-note-close" aria-label="Notu kapat">${closeIcon}</button></div><div id="record-note-body" class="record-note-body" tabindex="0" aria-label="Not metni"></div>`;
  root.append(popup);
  const body = popup.querySelector(".record-note-body");
  let trigger = null;
  let recordId = null;
  let contentKey = null;
  let kind = "note";
  let pinned = false;
  let hoverControl = null;
  let hoverPopup = false;
  let openTimer = null;
  let hideTimer = null;
  let destroyed = false;
  let restoringFocus = false;
  let dismissedControl = null;
  const isOpen = () => popup.matches(":popover-open");
  const focusInside = () =>
    trigger?.contains(owner.activeElement) ||
    popup.contains(owner.activeElement);
  const find = (id) => {
    try {
      return getRecord(id);
    } catch {
      return null;
    }
  };

  function button(record) {
    if (!eligible(record)) return "";
    return `<button type="button" class="record-note-trigger" data-action="record-note" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: notu göster" aria-haspopup="dialog" aria-controls="record-note-popover" aria-expanded="false">${noteIcon}</button>`;
  }

  function historyButton(record) {
    if (!eligible(record, "history")) return "";
    const count = record.followUpLog.length;
    return `<button type="button" class="record-history-trigger" data-action="waiting-history" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: takip geçmişi, ${count} kayıt" aria-haspopup="dialog" aria-controls="record-note-popover waiting-followup-dialog" aria-expanded="false" title="Takip geçmişini düzenle (${count} kayıt)">${historyIcon}</button>`;
  }

  function clearTimers() {
    win.clearTimeout(openTimer);
    win.clearTimeout(hideTimer);
    openTimer = null;
    hideTimer = null;
  }

  function reset() {
    clearTimers();
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.removeAttribute("aria-describedby");
    trigger = null;
    recordId = null;
    contentKey = null;
    kind = "note";
    pinned = false;
    hoverPopup = false;
  }

  function close({ restoreFocus = false } = {}) {
    const previous = trigger;
    dismissedControl = restoreFocus ? previous || dismissedControl : null;
    if (isOpen()) popup.hidePopover();
    reset();
    hoverControl = null;
    if (restoreFocus && previous?.isConnected) {
      restoringFocus = true;
      previous.focus({ preventScroll: true });
      restoringFocus = false;
    }
  }

  function render(record) {
    const nextKey = JSON.stringify([
      kind,
      kind === "history" ? record.followUpLog : noteText(record),
    ]);
    if (contentKey === nextKey) return;
    const scroll = contentKey === null ? 0 : body.scrollTop;
    popup.dataset.previewKind = kind;
    popup.setAttribute(
      "aria-label",
      kind === "history" ? "Takip geçmişi" : "Kayıt notu",
    );
    popup.querySelector(".record-note-heading strong").textContent =
      kind === "history"
        ? `Takip geçmişi · ${record.followUpLog.length}`
        : "Not";
    popup
      .querySelector(".record-note-close")
      .setAttribute(
        "aria-label",
        kind === "history" ? "Geçmiş önizlemesini kapat" : "Notu kapat",
      );
    body.setAttribute(
      "aria-label",
      kind === "history" ? "Kaydedilen takipler" : "Not metni",
    );
    if (kind === "history") body.innerHTML = historyMarkup(record);
    else body.textContent = noteText(record);
    body.scrollTop = scroll;
    contentKey = nextKey;
  }

  function position() {
    if (!isOpen()) return;
    if (!trigger?.isConnected) {
      close();
      return;
    }
    const viewport = win.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth;
    const height = viewport?.height || win.innerHeight;
    const anchor = trigger.getBoundingClientRect();
    if (
      anchor.bottom < topEdge ||
      anchor.top > topEdge + height ||
      anchor.right < leftEdge ||
      anchor.left > leftEdge + width
    ) {
      close();
      return;
    }
    popup.style.maxWidth = `${Math.max(1, width - 16)}px`;
    popup.style.maxHeight = `${Math.min(420, Math.max(1, height - 16))}px`;
    const bounds = popup.getBoundingClientRect();
    const left = Math.max(
      leftEdge + 8,
      Math.min(anchor.left, leftEdge + width - bounds.width - 8),
    );
    const below = anchor.bottom + 6;
    const above = anchor.top - bounds.height - 6;
    const top =
      below + bounds.height <= topEdge + height - 8
        ? below
        : Math.max(topEdge + 8, above);
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.min(top, topEdge + height - bounds.height - 8)}px`;
  }

  function show(id, control, persistent) {
    if (destroyed || !control?.isConnected || !root.contains(control)) return;
    const record = find(id);
    const requestedKind = kindFor(control);
    if (!eligible(record, requestedKind)) {
      close();
      return;
    }
    clearTimers();
    if (
      isOpen() &&
      trigger === control &&
      recordId === id &&
      kind === requestedKind
    ) {
      pinned ||= persistent;
      render(record);
      position();
      return;
    }
    const hover = hoverControl;
    close();
    hoverControl = hover;
    dismissedControl = null;
    trigger = control;
    recordId = id;
    kind = requestedKind;
    pinned = persistent;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-describedby", "record-note-body");
    const container = control.closest("dialog") || root;
    if (popup.parentElement !== container) container.append(popup);
    render(record);
    popup.style.left = "8px";
    popup.style.top = "8px";
    popup.showPopover();
    position();
  }

  function open(id, control) {
    show(id, control, true);
  }

  function scheduleOpen(control) {
    win.clearTimeout(hideTimer);
    hideTimer = null;
    if (isOpen() && trigger === control) return;
    win.clearTimeout(openTimer);
    openTimer = win.setTimeout(() => {
      openTimer = null;
      if (hoverControl === control || control.contains(owner.activeElement))
        show(control.dataset.id, control, false);
    }, 150);
  }

  function scheduleHide() {
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      if (!pinned && !hoverPopup && hoverControl !== trigger && !focusInside())
        close();
    }, 100);
  }

  function refresh() {
    if (destroyed || !isOpen()) return;
    const record = find(recordId);
    if (!eligible(record, kind) || !trigger?.isConnected) {
      close();
      return;
    }
    render(record);
    position();
  }

  function onPointerOver(event) {
    if (popup.contains(event.target)) {
      hoverPopup = true;
      win.clearTimeout(hideTimer);
      hideTimer = null;
      return;
    }
    const control = event.target.closest?.(triggerSelector);
    if (
      !control ||
      !root.contains(control) ||
      control.contains(event.relatedTarget) ||
      control === dismissedControl
    )
      return;
    hoverControl = control;
    scheduleOpen(control);
  }

  function onPointerOut(event) {
    if (popup.contains(event.target) && !popup.contains(event.relatedTarget)) {
      hoverPopup = false;
      scheduleHide();
      return;
    }
    const control = event.target.closest?.(triggerSelector);
    if (!control || control.contains(event.relatedTarget)) return;
    if (hoverControl === control) hoverControl = null;
    win.clearTimeout(openTimer);
    openTimer = null;
    scheduleHide();
  }

  function onFocusIn(event) {
    if (restoringFocus) return;
    if (popup.contains(event.target)) {
      win.clearTimeout(hideTimer);
      hideTimer = null;
      return;
    }
    const control = event.target.closest?.(triggerSelector);
    if (control && control !== dismissedControl && root.contains(control))
      scheduleOpen(control);
  }

  function onFocusOut(event) {
    if (
      dismissedControl?.contains(event.target) &&
      !dismissedControl.contains(event.relatedTarget)
    )
      dismissedControl = null;
    if (
      popup.contains(event.relatedTarget) ||
      trigger?.contains(event.relatedTarget)
    )
      return;
    scheduleHide();
  }

  function onPointerMove(event) {
    if (!dismissedControl) return;
    dismissedControl = null;
    const control = event.target.closest?.(triggerSelector);
    if (control && root.contains(control)) {
      hoverControl = control;
      scheduleOpen(control);
    }
  }

  function onClick(event) {
    const control = event.target.closest?.('[data-action="record-note-close"]');
    if (!control || !popup.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }

  function onKeydown(event) {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      const restoreFocus = focusInside();
      close({ restoreFocus });
      return;
    }
    const control = event.target.closest?.(triggerSelector);
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      isOpen() &&
      control === trigger
    ) {
      event.preventDefault();
      popup.querySelector("button")?.focus({ preventScroll: true });
    }
  }

  function onBeforeToggle(event) {
    if (event.newState === "closed") reset();
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown, true);
    popup.removeEventListener("beforetoggle", onBeforeToggle);
    win.removeEventListener("resize", position);
    win.removeEventListener("scroll", position, true);
    win.visualViewport?.removeEventListener("resize", position);
    popup.remove();
  }

  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown, true);
  popup.addEventListener("beforetoggle", onBeforeToggle);
  win.addEventListener("resize", position);
  win.addEventListener("scroll", position, true);
  win.visualViewport?.addEventListener("resize", position);
  return { button, historyButton, open, close, refresh, destroy };
}
