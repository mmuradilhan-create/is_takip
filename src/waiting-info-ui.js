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
  popup.innerHTML =
    '<div id="waiting-info-reason" tabindex="-1" aria-label="Bekleme nedeni"></div>';
  root.append(popup);
  const body = popup.querySelector("#waiting-info-reason");

  let trigger = null;
  let recordId = null;
  let hoverControl = null;
  let hoverPopup = false;
  let openTimer = null;
  let hideTimer = null;
  let contentKey = "";
  let destroyed = false;
  let restoringFocus = false;
  const dismissed = new Set();
  let pointerPosition = null;
  let keyboardNavigation = false;

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
    if (restoreFocus && previous) dismissed.add(previous.dataset.id);
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
    const scrollTop = contentKey ? body.scrollTop : 0;
    body.textContent = reason || "Bekleme nedeni eklenmedi.";
    body.scrollTop = scrollTop;
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
    popup.style.maxWidth = `${Math.min(360, Math.max(1, width - 16))}px`;
    popup.style.maxHeight = `${Math.min(420, Math.max(1, height - 16))}px`;
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
    body.tabIndex = body.scrollHeight > body.clientHeight + 1 ? 0 : -1;
  }

  function open(control) {
    if (destroyed || !control?.isConnected || dismissed.has(control.dataset.id))
      return;
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
    body.scrollTop = 0;
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
    }, 80);
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
      control.contains(event.relatedTarget)
    )
      return;
    if (pointerMoved(event)) dismissed.delete(control.dataset.id);
    rememberPointer(event);
    hoverControl = control;
    if (!dismissed.has(control.dataset.id)) scheduleOpen(control);
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
    const navigation = keyboardNavigation;
    keyboardNavigation = false;
    if (restoringFocus) return;
    if (popup.contains(event.target)) {
      win.clearTimeout(hideTimer);
      hideTimer = null;
      return;
    }
    const control = event.target.closest?.('[data-action="waiting-info"]');
    if (control && root.contains(control)) {
      if (navigation) dismissed.delete(control.dataset.id);
      if (!dismissed.has(control.dataset.id)) open(control);
    }
  }

  function onFocusOut(event) {
    if (
      popup.contains(event.relatedTarget) ||
      trigger?.contains(event.relatedTarget)
    )
      return;
    scheduleHide();
  }

  function pointerMoved(event) {
    return (
      !pointerPosition ||
      pointerPosition.x !== event.clientX ||
      pointerPosition.y !== event.clientY
    );
  }

  function rememberPointer(event) {
    pointerPosition = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event) {
    const moved = pointerMoved(event);
    rememberPointer(event);
    const control = event.target.closest?.('[data-action="waiting-info"]');
    if (
      moved &&
      control &&
      root.contains(control) &&
      dismissed.has(control.dataset.id)
    ) {
      dismissed.delete(control.dataset.id);
      hoverControl = control;
      scheduleOpen(control);
    }
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    if (control.dataset.action !== "waiting-info") return;
    event.preventDefault();
    event.stopPropagation();
    keyboardNavigation = false;
    const id = control.dataset.id;
    const record = getRecord(id);
    close();
    dismissed.add(control.dataset.id);
    if (eligible(record)) onEdit(id);
  }

  function onNavigation(event) {
    keyboardNavigation =
      [
        "Tab",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key) &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey;
  }

  function onKeyup() {
    keyboardNavigation = false;
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
      if (body.scrollHeight > body.clientHeight + 1) {
        event.preventDefault();
        body.focus({ preventScroll: true });
      }
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
    owner.removeEventListener("pointermove", onPointerMove, true);
    owner.removeEventListener("keydown", onNavigation, true);
    owner.removeEventListener("keyup", onKeyup, true);
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
  owner.addEventListener("pointermove", onPointerMove, true);
  owner.addEventListener("keydown", onNavigation, true);
  owner.addEventListener("keyup", onKeyup, true);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown, true);
  popup.addEventListener("beforetoggle", onBeforeToggle);
  win.addEventListener("resize", position);
  win.addEventListener("scroll", position, true);
  win.visualViewport?.addEventListener("resize", position);
  return { button, refresh, close, destroy };
}
