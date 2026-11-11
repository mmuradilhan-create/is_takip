/**
 * An icon that opened a panel, popup or window closes it when pressed again.
 * Overlays usually close on an outside press and the icon then opens them
 * again; this catches the press first. It only acts when the icon is still
 * visible beside the overlay (a press on the overlay itself is left alone),
 * and it closes through the overlay's own cancel path, so unsaved changes
 * still ask first.
 */
export function trackTriggerToggle({
  doc = globalThis.document,
  close = null,
} = {}) {
  const win = doc?.defaultView;
  if (!win) return () => {};
  const openedBy = new WeakMap();
  let swallowUntil = 0;
  let pressed = null;
  let interaction = 0;
  const nextInteraction = () => {
    interaction += 1;
  };
  const overlays = () =>
    [...doc.querySelectorAll("dialog[open], [popover]")].filter(
      (item) => !item.matches("[popover]") || item.matches(":popover-open"),
    );
  const iconOnly = (button) =>
    button.matches("button, [role='button']") &&
    !button.disabled &&
    !String(button.innerText ?? button.textContent ?? "").trim() &&
    Boolean(button.querySelector("svg"));
  const inside = (rect, x, y) =>
    rect.width > 0 &&
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom;

  // Lists re-render while a window opens, so keep how to find the icon again.
  const describe = (trigger) => ({
    element: trigger,
    action: trigger.dataset?.action || "",
    id: trigger.dataset?.id || "",
    className: trigger.className,
  });
  function locate(saved) {
    if (saved.element.isConnected) return saved.element;
    if (!saved.action) return null;
    return (
      [...doc.querySelectorAll("[data-action]")].find(
        (item) =>
          item.dataset.action === saved.action &&
          (item.dataset.id || "") === saved.id &&
          item.className === saved.className,
      ) || null
    );
  }
  function remember(trigger, before) {
    for (const overlay of overlays())
      if (!before.has(overlay) && !overlay.contains(trigger))
        openedBy.set(overlay, describe(trigger));
  }

  function onClick(event) {
    if (swallowUntil && win.performance.now() < swallowUntil) {
      swallowUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    swallowUntil = 0;
    const trigger = event.target.closest?.("button, [role='button']");
    if (!trigger || !iconOnly(trigger)) return;
    // Some icons open their window on press; use what was open before it.
    const before =
      pressed?.trigger === trigger ? pressed.before : new Set(overlays());
    pressed = null;
    remember(trigger, before);
    // A window that opens late still belongs to this icon, but only until
    // the next press or key: then it was opened by something else.
    const turn = ++interaction;
    const later = () => {
      if (turn === interaction) remember(trigger, before);
    };
    win.setTimeout(later, 0);
    win.setTimeout(later, 250);
  }

  function shut(overlay) {
    if (typeof close === "function" && close(overlay) === true) return;
    if (overlay.matches("[popover]")) {
      overlay.hidePopover();
      return;
    }
    const cancel = new Event("cancel", { cancelable: true });
    if (overlay.dispatchEvent(cancel)) overlay.close();
  }

  function onPointerdown(event) {
    nextInteraction();
    if (event.button !== 0) return;
    const open = overlays().reverse();
    const pressedIcon = event.target.closest?.("button, [role='button']");
    pressed =
      pressedIcon && iconOnly(pressedIcon)
        ? { trigger: pressedIcon, before: new Set(open) }
        : null;
    for (const overlay of open) {
      const saved = openedBy.get(overlay);
      const trigger = saved && locate(saved);
      if (!trigger) continue;
      const { clientX: x, clientY: y } = event;
      if (
        !inside(trigger.getBoundingClientRect(), x, y) ||
        inside(overlay.getBoundingClientRect(), x, y)
      )
        continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      // The click that follows this press must not open it again.
      swallowUntil = win.performance.now() + 800;
      openedBy.delete(overlay);
      shut(overlay);
      return;
    }
  }

  win.addEventListener("click", onClick, true);
  win.addEventListener("pointerdown", onPointerdown, true);
  win.addEventListener("keydown", nextInteraction, true);
  return () => {
    win.removeEventListener("click", onClick, true);
    win.removeEventListener("pointerdown", onPointerdown, true);
    win.removeEventListener("keydown", nextInteraction, true);
  };
}
