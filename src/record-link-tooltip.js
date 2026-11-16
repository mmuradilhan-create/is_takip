const CONTROL = "[data-record-link-tooltip]";
const TOOLTIP_ID = "record-link-tooltip";

/** Show full connection names without relying on the browser's title delay. */
export function createRecordLinkTooltip({
  root = document.querySelector("#app"),
} = {}) {
  if (!root)
    throw new TypeError("Bağlantı balonu için uygulama alanı gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const bubble = document.createElement("div");
  bubble.id = TOOLTIP_ID;
  bubble.className = "record-link-tooltip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  root.append(bubble);
  let trigger = null;
  let hovered = null;
  const suppressed = new WeakSet();
  let timer = null;
  let addedDescription = false;
  let destroyed = false;
  let pointerPosition = null;
  let keyboardNavigation = false;

  const controlFor = (target) => {
    const control = target?.closest?.(CONTROL);
    return control && root.contains(control) ? control : null;
  };
  const focused = (control) => control?.contains(document.activeElement);
  const pointerMoved = (event) =>
    !pointerPosition ||
    event.clientX !== pointerPosition.x ||
    event.clientY !== pointerPosition.y;

  function rememberPointer(event) {
    pointerPosition = { x: event.clientX, y: event.clientY };
  }

  function clearTimer() {
    owner.clearTimeout(timer);
    timer = null;
  }

  function close() {
    clearTimer();
    if (trigger && addedDescription) {
      const descriptions = (trigger.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && id !== TOOLTIP_ID);
      if (descriptions.length)
        trigger.setAttribute("aria-describedby", descriptions.join(" "));
      else trigger.removeAttribute("aria-describedby");
    }
    trigger = null;
    addedDescription = false;
    bubble.hidden = true;
    bubble.textContent = "";
  }

  function position() {
    if (!trigger?.isConnected || !root.contains(trigger)) {
      close();
      return;
    }
    const viewport = owner.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || owner.innerWidth;
    const height = viewport?.height || owner.innerHeight;
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
    bubble.style.maxWidth = `${Math.max(1, Math.min(360, width - 16))}px`;
    bubble.style.maxHeight = `${Math.max(1, height - 16)}px`;
    const bounds = bubble.getBoundingClientRect();
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
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.min(top, topEdge + height - bounds.height - 8)}px`;
  }

  function show(control) {
    if (
      destroyed ||
      !control?.isConnected ||
      !root.contains(control) ||
      suppressed.has(control)
    )
      return;
    const caption = control.dataset.recordLinkTooltip?.trim();
    if (!caption) return;
    close();
    trigger = control;
    const descriptions = (control.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean);
    addedDescription = !descriptions.includes(TOOLTIP_ID);
    if (addedDescription)
      control.setAttribute(
        "aria-describedby",
        [...descriptions, TOOLTIP_ID].join(" "),
      );
    const container = control.closest("dialog") || root;
    if (bubble.parentElement !== container) container.append(bubble);
    bubble.textContent = caption;
    bubble.style.left = "8px";
    bubble.style.top = "8px";
    bubble.hidden = false;
    position();
  }

  function schedule(control) {
    clearTimer();
    if (suppressed.has(control) || trigger === control) return;
    timer = owner.setTimeout(() => {
      timer = null;
      if (hovered === control || focused(control)) show(control);
    }, 80);
  }

  function onPointerOver(event) {
    const control = controlFor(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    // Closing a panel can reveal the icon under a stationary pointer. Only a
    // new pointer entry should undo the dismissal from activating that icon.
    const moved = pointerMoved(event);
    rememberPointer(event);
    if (moved) suppressed.delete(control);
    hovered = control;
    schedule(control);
  }

  function onPointerOut(event) {
    const control = controlFor(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    if (hovered === control) hovered = null;
    clearTimer();
    if (trigger === control && !focused(control)) close();
  }

  function onFocusIn(event) {
    const navigation = keyboardNavigation;
    keyboardNavigation = false;
    const control = controlFor(event.target);
    if (!control) return;
    // Panel close restores focus without a new keyboard navigation request.
    if (navigation) suppressed.delete(control);
    show(control);
  }

  function onFocusOut(event) {
    const control = controlFor(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    if (trigger === control && hovered !== control) close();
  }

  function onActivate(event) {
    keyboardNavigation = false;
    if (event.type === "pointerdown") rememberPointer(event);
    const control = controlFor(event.target);
    if (trigger || timer) close();
    if (control) suppressed.add(control);
  }

  function onKeyDown(event) {
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
    if (event.key !== "Escape" || !trigger) return;
    suppressed.add(trigger);
    close();
    event.preventDefault();
    event.stopPropagation();
  }

  function onKeyUp() {
    keyboardNavigation = false;
  }

  function onViewportChange() {
    if (trigger || timer) {
      const control = trigger || hovered;
      if (control) suppressed.add(control);
      close();
    }
  }

  const observer = new owner.MutationObserver(() => {
    if (trigger && (!trigger.isConnected || !root.contains(trigger))) close();
  });
  observer.observe(root, { subtree: true, childList: true });

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    observer.disconnect();
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("pointerdown", onActivate, true);
    document.removeEventListener("pointermove", rememberPointer, true);
    document.removeEventListener("click", onActivate, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    owner.removeEventListener("scroll", onViewportChange, true);
    owner.removeEventListener("resize", onViewportChange);
    owner.visualViewport?.removeEventListener("resize", onViewportChange);
    bubble.remove();
  }

  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("pointerdown", onActivate, true);
  document.addEventListener("pointermove", rememberPointer, true);
  document.addEventListener("click", onActivate, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  owner.addEventListener("scroll", onViewportChange, true);
  owner.addEventListener("resize", onViewportChange);
  owner.visualViewport?.addEventListener("resize", onViewportChange);
  return { close, destroy };
}
