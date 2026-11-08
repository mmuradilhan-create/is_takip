// Use each dialog's normal cancel path so drafts, saving guards, and caller
// restoration behave the same way as a native dismissal request.
export function installDialogLightDismiss(
  document = globalThis.document,
  { allowOutsideActivation = () => false } = {},
) {
  const owner = document.defaultView;
  const opened = [];
  const versions = new WeakMap();
  let gesture = null;

  function forget(dialog) {
    const index = opened.indexOf(dialog);
    if (index !== -1) opened.splice(index, 1);
  }

  function remember(dialog) {
    forget(dialog);
    opened.push(dialog);
    versions.set(dialog, (versions.get(dialog) || 0) + 1);
  }

  function onBeforeToggle(event) {
    if (event.target.localName !== "dialog") return;
    if (event.newState === "open") remember(event.target);
    else forget(event.target);
  }

  function observeChanges(changes) {
    for (const change of changes) {
      const dialog = change.target;
      if (dialog.localName !== "dialog") continue;
      if (change.oldValue === null && dialog.open) remember(dialog);
      else if (!dialog.open) forget(dialog);
    }
  }

  // Attribute observation also covers browsers without dialog toggle events.
  // Reading pending records before each gesture keeps synchronous open/close
  // changes in order, even when the DOM order differs from the top layer.
  const observer = new owner.MutationObserver(observeChanges);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
    attributeOldValue: true,
  });

  function topDialog() {
    observeChanges(observer.takeRecords());
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      if (!opened.includes(dialog)) remember(dialog);
    }
    const available = opened.filter(
      (dialog) => dialog.open && dialog.isConnected,
    );
    return (
      available.findLast((dialog) => dialog.matches(":modal")) ||
      available.at(-1) ||
      null
    );
  }

  function outside(event, dialog) {
    // Backdrop clicks are retargeted to the modal dialog itself. A nonmodal
    // panel instead receives an ordinary click on the surrounding page.
    if (dialog.matches(":modal") && event.target !== dialog) return false;
    if (event.target !== dialog && dialog.contains(event.target)) return false;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))
      return false;
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }

  function onPointerDown(event) {
    gesture = null;
    if (event.button !== 0 || event.isPrimary === false) return;
    // Native popover light dismissal can happen before click. Remember that
    // layer at pointerdown so the same gesture never dismisses its parent.
    if (document.querySelector(":popover-open")) return;
    const dialog = topDialog();
    if (!dialog || !outside(event, dialog)) return;
    gesture = {
      dialog,
      version: versions.get(dialog),
      pointerId: event.pointerId,
    };
  }

  function onClick(event) {
    const started = gesture;
    gesture = null;
    if (!started || event.button !== 0 || event.detail === 0) return;
    if (
      event.pointerId != null &&
      started.pointerId != null &&
      event.pointerId !== started.pointerId
    )
      return;
    if (document.querySelector(":popover-open")) return;
    const dialog = topDialog();
    if (
      dialog !== started.dialog ||
      versions.get(dialog) !== started.version ||
      !outside(event, dialog)
    )
      return;

    // A nonmodal preview may handle a deliberate switch to another item in
    // place. Modal backdrops and every other outside click still dismiss only
    // one layer, including when a saving guard refuses dismissal.
    if (!dialog.matches(":modal") && allowOutsideActivation(event, dialog))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof dialog.requestClose === "function") dialog.requestClose();
    else {
      const cancel = new owner.Event("cancel", { cancelable: true });
      if (dialog.dispatchEvent(cancel) && dialog.open) dialog.close();
    }
  }

  function clearGesture() {
    gesture = null;
  }

  function destroy() {
    observer.disconnect();
    document.removeEventListener("beforetoggle", onBeforeToggle, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointercancel", clearGesture, true);
    document.removeEventListener("click", onClick, true);
    owner.removeEventListener("pagehide", destroy);
    clearGesture();
    opened.length = 0;
  }

  document.addEventListener("beforetoggle", onBeforeToggle, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointercancel", clearGesture, true);
  document.addEventListener("click", onClick, true);
  owner.addEventListener("pagehide", destroy, { once: true });
  return destroy;
}
