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

/** Focus restoration follows the last real input, not a programmatic focus(). */
export function installInputModality(document = globalThis.document) {
  const root = document.documentElement;
  const owner = document.defaultView;
  const previous = root.getAttribute("data-input-modality");
  let modality = "pointer";
  let destroyed = false;
  let inputGeneration = 0;
  let restoreFrame = null;
  let restoredFocus = null;
  const returnTargets =
    ".task-name, .focus-title, .goal-child-title, .dashboard-goal-title, [data-record-row]";
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
      !event.isComposing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      NAVIGATION_KEYS.has(event.key)
    )
      set("keyboard");
  }

  function onDialogClose(event) {
    if (!event.target.matches?.("dialog")) return;
    const generation = inputGeneration;
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
  return destroy;
}
