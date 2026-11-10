import "./app-confirm.css";

const pending = new WeakMap();
let sequence = 0;

/** Keep confirmations in the app's top layer without closing the caller. */
export function confirmAction({
  root,
  title,
  message,
  confirmLabel = "Onayla",
  danger = false,
  trigger = null,
}) {
  const document = root?.ownerDocument || globalThis.document;
  if (!document?.body || pending.has(document)) return Promise.resolve(false);
  const owner = document.defaultView;
  const previous = trigger?.isConnected ? trigger : document.activeElement;
  const parent = previous?.closest?.("dialog[open]");
  const dialog = document.createElement("dialog");
  const id = `app-confirm-${++sequence}`;
  dialog.className = "modal app-confirm-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-message`);
  dialog.innerHTML = `<div class="modal-header"><h2 id="${id}-title"></h2><button type="button" class="close-modal" data-confirm="cancel" aria-label="Pencereyi kapat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="modal-body"><p id="${id}-message"></p></div><div class="modal-footer"><button type="button" class="btn" data-confirm="cancel" autofocus>Vazgeç</button><button type="button" class="btn ${danger ? "danger" : "primary"}" data-confirm="accept"></button></div>`;
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = message;
  dialog.querySelector('[data-confirm="accept"]').textContent = confirmLabel;

  return new Promise((resolve) => {
    let settled = false;
    let observer;
    function finish(accepted = false) {
      if (settled) return;
      settled = true;
      pending.delete(document);
      observer?.disconnect();
      owner?.removeEventListener("pagehide", cancel);
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previous?.isConnected && (!parent || parent.open))
        previous.focus?.({ preventScroll: true });
      resolve(accepted);
    }
    function cancel() {
      finish(false);
    }
    pending.set(document, cancel);
    dialog.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = event.target.closest?.("[data-confirm]");
      if (!button || !dialog.contains(button)) return;
      finish(button.dataset.confirm === "accept");
    });
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("close", cancel);
    owner?.addEventListener("pagehide", cancel, { once: true });
    if (parent) {
      observer = new owner.MutationObserver(() => {
        if (!parent.open || !parent.isConnected) finish(false);
      });
      observer.observe(parent, { attributes: true, attributeFilter: ["open"] });
    }
    document.body.append(dialog);
    try {
      dialog.showModal();
      dialog.querySelector("[autofocus]").focus({ preventScroll: true });
    } catch {
      finish(false);
    }
  });
}
