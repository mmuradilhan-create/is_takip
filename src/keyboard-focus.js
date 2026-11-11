/**
 * Focus cues are for keyboard use. When a panel or form closes, focus goes
 * back to the button that opened it and browsers often draw that button's
 * keyboard cue even after a mouse click, or after Enter or Escape in a text
 * field. A pointer press and Enter or Escape in a text field quiet the cue;
 * Tab, arrows, or Enter, Space or Escape on a control bring it back.
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
    root.dataset.focusQuiet = "";
  };
  doc.addEventListener("keydown", onKeydown, true);
  doc.addEventListener("pointerdown", onPointerdown, true);
  return () => {
    doc.removeEventListener("keydown", onKeydown, true);
    doc.removeEventListener("pointerdown", onPointerdown, true);
    delete root.dataset.focusQuiet;
  };
}
