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
  const previous = root.getAttribute("data-input-modality");
  let modality = "pointer";
  let destroyed = false;
  const set = (value) => {
    modality = value;
    if (root.getAttribute("data-input-modality") !== value)
      root.setAttribute("data-input-modality", value);
  };
  set(modality);

  function onPointerDown(event) {
    if (event.isPrimary !== false) set("pointer");
  }

  function onKeyDown(event) {
    if (
      !event.isComposing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      NAVIGATION_KEYS.has(event.key)
    )
      set("keyboard");
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (root.getAttribute("data-input-modality") === modality) {
      if (previous === null) root.removeAttribute("data-input-modality");
      else root.setAttribute("data-input-modality", previous);
    }
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return destroy;
}
