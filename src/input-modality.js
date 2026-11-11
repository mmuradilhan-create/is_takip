const NAVIGATION_KEYS = new Set([
  "Tab",
  "Enter",
  " ",
  "Spacebar",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const typing = (target) =>
  target?.matches?.("input, textarea, select, [contenteditable='true']");

/**
 * Focus restoration follows the last real input, not a programmatic focus().
 *
 * Two marks are kept on the root:
 * - data-input-modality: "pointer" or "keyboard", from the last real input.
 * - data-focus-quiet: set by a pointer press, or by Enter or Escape inside a
 *   text field (saving or cancelling a form), and cleared by Tab, arrows or
 *   Enter, Space or Escape on a control. When a window closes, focus returns
 *   to the button that opened it and browsers often draw its keyboard cue;
 *   while quiet, the app's focus underline and darker icon states stay off.
 */
export function installInputModality(document = globalThis.document) {
  const root = document.documentElement;
  const owner = document.defaultView;
  const previous = root.getAttribute("data-input-modality");
  let modality = "pointer";
  let destroyed = false;
  let inputGeneration = 0;
  let restoreFrame = null;
  let restoredFocus = null;
  // The input generation when each dialog actually closed. Its "close" event
  // arrives later, after the user may have pressed another key.
  const closedAt = new WeakMap();
  const quiet = (value) => {
    if (value) root.setAttribute("data-focus-quiet", "");
    else root.removeAttribute("data-focus-quiet");
  };
  const returnTargets =
    ".task-name, .focus-title, .goal-child-title, .dashboard-goal-title, .followup-title, .dashboard-detail-card, [data-record-row]";
  const set = (value) => {
    modality = value;
    if (root.getAttribute("data-input-modality") !== value)
      root.setAttribute("data-input-modality", value);
  };
  set(modality);

  function clearRestoredFocus() {
    restoredFocus?.removeAttribute("data-focus-restored");
    restoredFocus = null;
    if (restoreFrame !== null) owner.cancelAnimationFrame(restoreFrame);
    restoreFrame = null;
  }

  function newInput() {
    inputGeneration++;
    clearRestoredFocus();
  }

  function onPointerDown(event) {
    if (event.isPrimary !== false) {
      newInput();
      set("pointer");
      quiet(true);
    }
  }

  function onPointerMove(event) {
    if (event.isPrimary !== false && (event.movementX || event.movementY)) {
      newInput();
      set("pointer");
    }
  }

  function onKeyDown(event) {
    newInput();
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !NAVIGATION_KEYS.has(event.key)
    )
      return;
    set("keyboard");
    if (typing(event.target)) {
      // Arrows inside a text field edit it; Enter or Escape there submits or
      // cancels a form and hands focus back to the button that opened it.
      if (event.key === "Enter" || event.key === "Escape") quiet(true);
      else if (event.key === "Tab") quiet(false);
      return;
    }
    quiet(false);
  }

  const observer =
    typeof owner.MutationObserver === "function"
      ? new owner.MutationObserver((records) => {
          for (const record of records)
            if (record.target.matches?.("dialog") && !record.target.open)
              closedAt.set(record.target, inputGeneration);
        })
      : null;

  function onDialogClose(event) {
    if (!event.target.matches?.("dialog")) return;
    // Only focus that returned before any newer input counts as restored.
    const generation = closedAt.has(event.target)
      ? closedAt.get(event.target)
      : inputGeneration;
    closedAt.delete(event.target);
    const markReturnedFocus = () => {
      if (destroyed || generation !== inputGeneration) return;
      const active = document.activeElement;
      if (!active?.matches?.(returnTargets)) return;
      clearRestoredFocus();
      restoredFocus = active;
      restoredFocus.setAttribute("data-focus-restored", "");
    };
    // Close handlers may restore a replaced row after the native dialog return.
    queueMicrotask(() => {
      markReturnedFocus();
      if (destroyed || generation !== inputGeneration) return;
      restoreFrame = owner.requestAnimationFrame(() => {
        restoreFrame = null;
        markReturnedFocus();
      });
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    quiet(false);
    clearRestoredFocus();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("close", onDialogClose, true);
    if (root.getAttribute("data-input-modality") === modality) {
      if (previous === null) root.removeAttribute("data-input-modality");
      else root.setAttribute("data-input-modality", previous);
    }
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("close", onDialogClose, true);
  observer?.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  return destroy;
}
