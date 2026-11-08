/** Preserve a read-only side panel while one of its actions opens a modal. */
export function createRecordPanelHandoff({
  document,
  panel,
  getId,
  bodySelector,
  onRefresh,
  onError,
}) {
  let current = null;

  function clear() {
    if (current?.modal && current.onClose)
      current.modal.removeEventListener("close", current.onClose);
    current = null;
  }

  function restore(ticket) {
    if (current !== ticket) return;
    clear();
    if (
      !panel.open ||
      getId() !== ticket.id ||
      document.querySelector("dialog:modal")
    )
      return;
    onRefresh();
    if (!panel.open || getId() !== ticket.id) return;
    const body = panel.querySelector(bodySelector);
    if (body) body.scrollTop = ticket.scrollTop;
    const control = [...panel.querySelectorAll("[data-action]")].find(
      (candidate) =>
        candidate.dataset.action === ticket.action &&
        candidate.dataset.route === ticket.route,
    );
    (control || panel.querySelector(".close-modal"))?.focus({
      preventScroll: true,
    });
  }

  function followModal(ticket) {
    if (current !== ticket) return;
    const modal = document.querySelector("dialog:modal");
    if (!modal) {
      restore(ticket);
      return;
    }
    ticket.modal = modal;
    ticket.onClose = () => {
      // A delayed close event may belong to a dialog already reused by a form.
      if (!modal.open) restore(ticket);
    };
    modal.addEventListener("close", ticket.onClose);
  }

  function run(control, callback) {
    if (current) return;
    const ticket = {
      id: getId(),
      action: control.dataset.action,
      route: control.dataset.route,
      scrollTop: panel.querySelector(bodySelector)?.scrollTop || 0,
    };
    current = ticket;
    try {
      const result = callback();
      if (result && typeof result.then === "function")
        Promise.resolve(result).then(
          () => followModal(ticket),
          (error) => {
            restore(ticket);
            onError(error instanceof Error ? error.message : String(error));
          },
        );
      else followModal(ticket);
    } catch (error) {
      restore(ticket);
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  return { run, clear, isBusy: () => Boolean(current) };
}
