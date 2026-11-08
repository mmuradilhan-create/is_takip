const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

const clockIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

const eligible = (record) =>
  record?.type === "daily" && record.status === "waiting";

/** Read waiting context beside a task without opening the record form. */
export function createWaitingInfoUI({
  root = document.querySelector("#app"),
  getRecord,
  onEdit = () => {},
} = {}) {
  if (!root || typeof getRecord !== "function")
    throw new TypeError("Bekleme bilgisi için kayıt seçimi gereklidir.");

  const owner = root.ownerDocument;
  const win = owner.defaultView;
  const popup = owner.createElement("div");
  popup.id = "waiting-info-popover";
  popup.className = "waiting-info-popover";
  popup.setAttribute("popover", "auto");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Bekleme bilgisi");
  root.append(popup);

  let trigger = null;
  let recordId = null;
  let hoverControl = null;
  let hoverPopup = false;
  let openTimer = null;
  let hideTimer = null;
  let contentKey = "";
  let destroyed = false;
  let restoringFocus = false;
  let dismissedControl = null;

  const isOpen = () => popup.matches(":popover-open");
  const focusInside = () =>
    trigger?.contains(owner.activeElement) ||
    popup.contains(owner.activeElement);

  function button(record) {
    if (!eligible(record)) return "";
    return `<button type="button" class="waiting-info-trigger" data-action="waiting-info" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: bekleme bilgisi" aria-haspopup="dialog" aria-controls="waiting-info-popover" aria-expanded="false">${clockIcon}</button>`;
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
    contentKey = "";
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
    const reason = String(
      record.waitingReason ?? record.blockReason ?? "",
    ).trim();
    const nextKey = JSON.stringify(reason);
    if (contentKey === nextKey) return;
    const focusedAction = popup.contains(owner.activeElement)
      ? owner.activeElement.dataset.action
      : null;
    popup.innerHTML = `<div class="waiting-info-heading"><strong>Bekleme bilgisi</strong><button type="button" class="waiting-info-close" data-action="waiting-info-close" aria-label="Bekleme bilgisini kapat">${closeIcon}</button></div><section class="waiting-info-reason"><h3>Neyi/kimi bekliyorum?</h3><p id="waiting-info-reason">${escapeHtml(reason || "Bekleme nedeni eklenmedi.")}</p></section><div class="waiting-info-actions"><button type="button" class="waiting-info-edit" data-action="waiting-info-edit">Düzenle</button></div>`;
    contentKey = nextKey;
    if (focusedAction)
      popup
        .querySelector(`[data-action="${focusedAction}"]`)
        ?.focus({ preventScroll: true });
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
    popup.style.maxWidth = `${Math.max(1, width - 16)}px`;
    popup.style.maxHeight = `${Math.max(1, height - 16)}px`;
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

  function open(control) {
    if (destroyed || !control?.isConnected) return;
    const record = getRecord(control.dataset.id);
    if (!eligible(record)) {
      close();
      return;
    }
    clearTimers();
    if (isOpen() && trigger === control) {
      render(record);
      position();
      return;
    }
    const hover = hoverControl;
    close();
    hoverControl = hover;
    trigger = control;
    recordId = record.id;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-describedby", "waiting-info-reason");
    const container = control.closest("dialog") || root;
    if (popup.parentElement !== container) container.append(popup);
    render(record);
    popup.style.left = "8px";
    popup.style.top = "8px";
    popup.showPopover();
    position();
  }

  function scheduleOpen(control) {
    win.clearTimeout(hideTimer);
    hideTimer = null;
    if (isOpen() && trigger === control) return;
    win.clearTimeout(openTimer);
    openTimer = win.setTimeout(() => {
      openTimer = null;
      if (hoverControl === control || control.contains(owner.activeElement))
        open(control);
    }, 150);
  }

  function scheduleHide() {
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      if (!hoverPopup && hoverControl !== trigger && !focusInside()) close();
    }, 100);
  }

  function refresh() {
    if (destroyed || !isOpen()) return;
    const record = getRecord(recordId);
    if (!eligible(record) || !trigger?.isConnected) {
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
    const control = event.target.closest?.('[data-action="waiting-info"]');
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
    const control = event.target.closest?.('[data-action="waiting-info"]');
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
    const control = event.target.closest?.('[data-action="waiting-info"]');
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
    const control = event.target.closest?.('[data-action="waiting-info"]');
    if (control && root.contains(control)) {
      hoverControl = control;
      scheduleOpen(control);
    }
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    const action = control.dataset.action;
    if (
      !["waiting-info", "waiting-info-close", "waiting-info-edit"].includes(
        action,
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "waiting-info-close") {
      close({ restoreFocus: true });
      return;
    }
    const id = action === "waiting-info-edit" ? recordId : control.dataset.id;
    const record = getRecord(id);
    close();
    if (eligible(record)) onEdit(id);
  }

  function onKeydown(event) {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }
    const control = event.target.closest?.('[data-action="waiting-info"]');
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
  return { button, refresh, close, destroy };
}
