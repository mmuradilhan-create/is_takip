/**
 * Saving or cancelling a form with Enter or Escape inside a text field hands
 * focus back to the button that opened it. Browsers then draw that button's
 * keyboard cue as if it had been reached with Tab. Keep it quiet until the
 * next navigation key or pointer press.
 */
export function trackKeyboardFocus(doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root) return () => {};
  const typing = (target) =>
    target?.matches?.("input, textarea, select, [contenteditable='true']");
  const onKeydown = (event) => {
    if (typing(event.target) && ["Enter", "Escape"].includes(event.key)) {
      root.dataset.focusQuiet = "";
      return;
    }
    if (
      event.key === "Tab" ||
      (!typing(event.target) && /^(Arrow|Enter$| $|Escape$)/.test(event.key))
    )
      delete root.dataset.focusQuiet;
  };
  const onPointerdown = () => {
    delete root.dataset.focusQuiet;
  };
  doc.addEventListener("keydown", onKeydown, true);
  doc.addEventListener("pointerdown", onPointerdown, true);
  return () => {
    doc.removeEventListener("keydown", onKeydown, true);
    doc.removeEventListener("pointerdown", onPointerdown, true);
    delete root.dataset.focusQuiet;
  };
}
