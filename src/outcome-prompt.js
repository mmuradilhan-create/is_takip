/**
 * A one-line, optional question shown right under the control that closed a
 * record ("Neden?" when cancelling, "Ne oldu?" when closing a waiting topic).
 * Enter (or the button) goes ahead with whatever was typed, an empty line
 * included; Escape, the × or a click elsewhere backs out and changes nothing.
 * It is a light popover rather than a dialog, so the page stays as it was.
 */
export function createOutcomePrompt({ doc = document } = {}) {
  let popover = null;
  let pending = null;
  let anchor = null;
  let restore = null;

  function build() {
    popover = doc.createElement("div");
    popover.id = "outcome-prompt";
    popover.className = "outcome-prompt";
    popover.setAttribute("popover", "auto");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-labelledby", "outcome-prompt-label");
    popover.innerHTML = `<form class="outcome-prompt-form"><div class="outcome-prompt-heading"><label id="outcome-prompt-label" for="outcome-prompt-input"></label><button type="button" class="outcome-prompt-close" aria-label="Vazgeç" title="Vazgeç"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="outcome-prompt-row"><input id="outcome-prompt-input" type="text" maxlength="1000" autocomplete="off" spellcheck="true" placeholder="İsteğe bağlı"><button type="submit" class="outcome-prompt-confirm"></button></div></form>`;
    popover.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const confirm = pending;
      const text = popover.querySelector("input").value.trim();
      pending = null;
      popover.hidePopover();
      confirm?.(text);
    });
    popover
      .querySelector(".outcome-prompt-close")
      .addEventListener("click", () => close());
    popover.addEventListener("toggle", (event) => {
      if (event.newState !== "closed") return;
      removeWatchers();
      const backedOut = pending !== null;
      pending = null;
      // Backing out leaves the record as it was; the keyboard returns to
      // the control that asked.
      if (backedOut && anchor?.isConnected)
        anchor.focus({ preventScroll: true });
      anchor = null;
    });
  }

  function place() {
    if (!anchor?.isConnected) return close();
    const view = doc.defaultView;
    const rect = anchor.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.left, view.innerWidth - box.width - 8),
    );
    const below = rect.bottom + 6;
    const top =
      below + box.height <= view.innerHeight - 8
        ? below
        : Math.max(8, rect.top - box.height - 6);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function removeWatchers() {
    restore?.();
    restore = null;
  }

  function watch() {
    const view = doc.defaultView;
    const onScroll = (event) => {
      if (!popover.contains(event.target)) close();
    };
    const onResize = () => close();
    view.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", onResize);
    restore = () => {
      view.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", onResize);
    };
  }

  /**
   * Ask, then call `onConfirm(text)`; nothing is called when backed out.
   * `label` is the question, `action` the button's word.
   */
  function open({ anchor: trigger, label, action, onConfirm }) {
    if (!popover) build();
    if (popover.matches(":popover-open")) {
      pending = null;
      popover.hidePopover();
    }
    // Inside a modal dialog everything outside it is inert, so the prompt
    // goes into that dialog.
    const host = trigger?.closest?.("dialog[open]") || doc.body;
    if (popover.parentElement !== host) host.append(popover);
    anchor = trigger || null;
    pending = onConfirm;
    popover.querySelector("label").textContent = label;
    popover.querySelector(".outcome-prompt-confirm").textContent = action;
    const input = popover.querySelector("input");
    input.value = "";
    popover.style.left = "0px";
    popover.style.top = "0px";
    popover.showPopover();
    if (anchor) place();
    watch();
    input.focus({ preventScroll: true });
  }

  function close() {
    if (popover?.matches(":popover-open")) popover.hidePopover();
  }

  return {
    open,
    close,
    isOpen: () => Boolean(popover?.matches(":popover-open")),
  };
}
