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

/** A read-only explanation beside the task's blocker symbol. */
export function createBlockerPopover({
  root = document.querySelector("#app"),
  getRecords,
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError("Engel bilgisi için kayıt listesi gereklidir.");

  const owner = root.ownerDocument;
  const win = owner.defaultView;
  const popover = owner.createElement("div");
  popover.id = "blocker-details-popover";
  popover.className = "blocker-popover";
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Engel ve sonraki adım");
  root.append(popover);

  let trigger = null;
  let recordId = null;
  let contentKey = "";
  let collapseOnClick = null;
  let destroyed = false;

  const isOpen = () => popover.matches(":popover-open");
  const find = (id) => getRecords().find((record) => record.id === id);
  const eligible = (record) => record?.type === "daily" && record.blocked;

  function resetTrigger() {
    trigger?.setAttribute("aria-expanded", "false");
    trigger = null;
    recordId = null;
    contentKey = "";
  }

  function close({ restoreFocus = false } = {}) {
    const previous = trigger;
    if (isOpen()) popover.hidePopover();
    resetTrigger();
    collapseOnClick = null;
    if (restoreFocus && previous?.isConnected)
      previous.focus({ preventScroll: true });
  }

  function render(record) {
    const nextKey = JSON.stringify([
      record.title,
      record.blockReason,
      record.nextAction,
    ]);
    if (nextKey === contentKey) return;
    const hadFocus = popover.contains(owner.activeElement);
    popover.innerHTML = `<div class="blocker-popover-heading"><strong title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</strong><button type="button" class="blocker-popover-close" data-action="blocker-details-close" aria-label="Engel bilgisini kapat">${closeIcon}</button></div><section class="blocker-popover-reason"><h3>Engel nedeni</h3><p>${escapeHtml(record.blockReason || "Neden eklenmemiş.")}</p></section><section class="blocker-popover-next"><h3>Sonraki adım</h3><p>${escapeHtml(record.nextAction || "Henüz eklenmedi.")}</p></section>`;
    contentKey = nextKey;
    if (hadFocus)
      popover.querySelector("button")?.focus({ preventScroll: true });
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
    popover.style.maxWidth = `${Math.max(1, width - 16)}px`;
    popover.style.maxHeight = `${Math.max(1, height - 16)}px`;
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
    const bounds = popover.getBoundingClientRect();
    const left = Math.max(
      leftEdge + 8,
      Math.min(anchor.left, leftEdge + width - bounds.width - 8),
    );
    const below = anchor.bottom + 7;
    const above = anchor.top - bounds.height - 7;
    const top =
      below + bounds.height <= topEdge + height - 8
        ? below
        : Math.max(topEdge + 8, above);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(top, topEdge + height - bounds.height - 8)}px`;
  }

  function open(id, control) {
    if (destroyed) return;
    const record = find(id);
    if (!eligible(record)) {
      close();
      return;
    }
    if (isOpen() && trigger === control) {
      close({ restoreFocus: true });
      return;
    }
    close();
    trigger = control;
    recordId = id;
    trigger.setAttribute("aria-expanded", "true");
    const container = control.closest("dialog") || root;
    if (popover.parentElement !== container) container.append(popover);
    render(record);
    popover.style.left = "8px";
    popover.style.top = "8px";
    popover.showPopover();
    position();
    popover.querySelector("button")?.focus({ preventScroll: true });
  }

  function refresh() {
    if (destroyed || !isOpen()) return;
    try {
      const record = find(recordId);
      if (!eligible(record) || !trigger?.isConnected) {
        close();
        return;
      }
      render(record);
      position();
    } catch (error) {
      close();
      onError(
        error instanceof Error ? error.message : "Engel bilgisi açılamadı.",
      );
    }
  }

  function onPointerDown(event) {
    const control = event.target.closest?.('[data-action="blocker-details"]');
    collapseOnClick = control === trigger && isOpen() ? control : null;
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    const action = control.dataset.action;
    if (!["blocker-details", "blocker-details-close"].includes(action)) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "blocker-details-close" || collapseOnClick === control) {
      collapseOnClick = null;
      close({ restoreFocus: true });
      return;
    }
    try {
      open(control.dataset.id, control);
    } catch (error) {
      close();
      onError(
        error instanceof Error ? error.message : "Engel bilgisi açılamadı.",
      );
    }
  }

  function onKeydown(event) {
    if (event.key !== "Escape" || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }

  function onToggle(event) {
    if (event.newState === "closed" && !isOpen()) resetTrigger();
  }

  function onBeforeToggle(event) {
    if (event.newState === "closed") resetTrigger();
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    popover.removeEventListener("toggle", onToggle);
    popover.removeEventListener("beforetoggle", onBeforeToggle);
    win.removeEventListener("resize", position);
    win.removeEventListener("scroll", position, true);
    win.visualViewport?.removeEventListener("resize", position);
    popover.remove();
  }

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  popover.addEventListener("toggle", onToggle);
  popover.addEventListener("beforetoggle", onBeforeToggle);
  win.addEventListener("resize", position);
  win.addEventListener("scroll", position, true);
  win.visualViewport?.addEventListener("resize", position);
  return { close, refresh, destroy };
}
