/**
 * Focus underlines are for keyboard navigation. Tab and arrow keys outside
 * text fields turn them on; any pointer press turns them off, so focus that
 * returns to a clicked button after a dialog closes stays plain.
 */
export function trackKeyboardFocus(doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root) return () => {};
  const typing = (target) =>
    target?.matches?.("input, textarea, select, [contenteditable='true']");
  const onKeydown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      event.key === "Tab" ||
      (/^Arrow/.test(event.key) && !typing(event.target))
    )
      root.dataset.focusSource = "keyboard";
  };
  const onPointerdown = () => {
    delete root.dataset.focusSource;
  };
  doc.addEventListener("keydown", onKeydown, true);
  doc.addEventListener("pointerdown", onPointerdown, true);
  return () => {
    doc.removeEventListener("keydown", onKeydown, true);
    doc.removeEventListener("pointerdown", onPointerdown, true);
    delete root.dataset.focusSource;
  };
}
