/** Save shortcuts leave composition, modifiers, repeats and native actions alone. */
export function isPlainSaveEnter(event) {
  return (
    event.key === "Enter" &&
    !event.defaultPrevented &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    !event.repeat &&
    event.keyCode !== 229
  );
}

/** Enter saves record and journal textareas; Shift+Enter keeps the newline. */
export function installRecordFormShortcuts(root) {
  if (!root?.addEventListener)
    throw new TypeError("Kayıt kısayolları için bir ekran kökü gereklidir.");

  function onKeydown(event) {
    if (!isPlainSaveEnter(event)) return;
    const field = event.target;
    if (
      !field?.matches?.("textarea") ||
      field.disabled ||
      field.readOnly ||
      field.matches(":disabled")
    )
      return;
    const form = field.closest(
      "form#record-form, form#work-log-edit-form, form#work-finish-form",
    );
    if (!form || typeof form.requestSubmit !== "function") return;
    const submitter = [
      ...form.querySelectorAll('button[type="submit"], input[type="submit"]'),
    ].find((control) => control.form === form && !control.matches(":disabled"));
    if (!submitter) return;
    event.preventDefault();
    form.requestSubmit(submitter);
  }

  root.addEventListener("keydown", onKeydown);
  return () => root.removeEventListener("keydown", onKeydown);
}
