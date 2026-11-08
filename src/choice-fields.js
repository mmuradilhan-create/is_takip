const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const chevronIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const checkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const choiceIdentity = (value) =>
  String(value).normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
const searchKey = (value) =>
  String(value)
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");

/** A saved record supplies the value; free text is always accepted. */
export function choiceField({
  name,
  label,
  value = "",
  placeholder = "Yaz veya listeden seç",
  kind = name,
  maxLength = 120,
} = {}) {
  const id = `choice-${name}`;
  const limit =
    Number.isSafeInteger(maxLength) && maxLength > 0 ? maxLength : 120;
  return `<label class="field choice-field" for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><span class="choice-input-wrap"><input type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" data-choice-kind="${escapeHtml(kind)}" data-choice-label="${escapeHtml(label)}" placeholder="${escapeHtml(placeholder)}" maxlength="${limit}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="record-choice-menu" aria-expanded="false"><button type="button" class="choice-toggle" data-action="choice-open" aria-label="${escapeHtml(label)}: seçenekleri göster" aria-controls="record-choice-menu" aria-haspopup="listbox" aria-expanded="false" title="Seçenekleri göster">${chevronIcon}</button></span></label>`;
}

/** Editable suggestions are derived from saved data by the caller, never saved here. */
export function createChoiceFields({
  root = document.querySelector("#app"),
  getChoices,
  onError = () => {},
} = {}) {
  if (!root || typeof getChoices !== "function")
    throw new TypeError("Seçim alanları için seçenek listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const menu = document.createElement("div");
  menu.id = "record-choice-menu";
  menu.className = "choice-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "listbox");
  root.append(menu);
  let activeInput = null;
  let activeTrigger = null;
  let items = [];
  let activeIndex = -1;
  let showAll = true;
  let applying = false;
  let destroyed = false;
  const isOpen = () => menu.matches(":popover-open");

  function report(error) {
    try {
      onError(error instanceof Error ? error.message : String(error));
    } catch {
      /* Feedback must never remove entered text. */
    }
  }

  function resetExpanded() {
    activeInput?.setAttribute("aria-expanded", "false");
    activeInput?.removeAttribute("aria-activedescendant");
    activeTrigger?.setAttribute("aria-expanded", "false");
  }

  function close({ restoreFocus = false } = {}) {
    const input = activeInput;
    if (isOpen()) menu.hidePopover();
    resetExpanded();
    // The editor replaces its inner HTML when another record is opened. Keep
    // this single shared list outside that replacement when it is not in use.
    if (menu.parentElement !== root) root.append(menu);
    activeInput = null;
    activeTrigger = null;
    activeIndex = -1;
    items = [];
    if (restoreFocus && input?.isConnected)
      input.focus({ preventScroll: true });
  }

  function position() {
    if (!activeInput?.isConnected || !isOpen()) {
      if (isOpen()) close();
      return;
    }
    const anchor = activeInput.closest(".choice-input-wrap") || activeInput;
    const rect = anchor.getBoundingClientRect();
    const viewport = owner.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const width = viewport?.width || owner.innerWidth;
    const height = viewport?.height || owner.innerHeight;
    const dialog = activeInput.closest("dialog");
    const header = dialog
      ?.querySelector(".modal-header")
      ?.getBoundingClientRect();
    const footer = dialog
      ?.querySelector(".modal-footer")
      ?.getBoundingClientRect();
    const topEdge = Math.max(viewportTop, header?.bottom || viewportTop);
    const bottomEdge = Math.min(
      viewportTop + height,
      footer?.top || viewportTop + height,
    );
    if (rect.bottom <= topEdge || rect.top >= bottomEdge) {
      close();
      return;
    }
    const below = Math.max(0, bottomEdge - rect.bottom - 14);
    const above = Math.max(0, rect.top - topEdge - 14);
    const openBelow = below >= above;
    const available = Math.max(below, above);
    menu.style.width = `${Math.min(Math.max(rect.width, 224), width - 16)}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(320, available, height - 16))}px`;
    const bounds = menu.getBoundingClientRect();
    const top = openBelow ? rect.bottom + 6 : rect.top - bounds.height - 6;
    menu.style.left = `${Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(topEdge + 8, Math.min(top, bottomEdge - bounds.height - 8))}px`;
  }

  function setActive(index, { scroll = true } = {}) {
    activeIndex = items.length
      ? Math.max(0, Math.min(index, items.length - 1))
      : -1;
    for (const option of menu.querySelectorAll("[data-choice-index]")) {
      const selected = Number(option.dataset.choiceIndex) === activeIndex;
      option.classList.toggle("is-highlighted", selected);
      option.setAttribute("aria-selected", String(selected));
    }
    const option = menu.querySelector(`[data-choice-index="${activeIndex}"]`);
    if (option) {
      activeInput?.setAttribute("aria-activedescendant", option.id);
      if (scroll) {
        const top = option.offsetTop;
        const bottom = top + option.offsetHeight;
        if (top < menu.scrollTop) menu.scrollTop = top;
        else if (bottom > menu.scrollTop + menu.clientHeight)
          menu.scrollTop = bottom - menu.clientHeight;
      }
    } else activeInput?.removeAttribute("aria-activedescendant");
  }

  function render({ preserveActive = false } = {}) {
    if (!activeInput?.isConnected) return;
    const previous = preserveActive ? items[activeIndex]?.value : null;
    const query = activeInput.value.trim();
    const normalized = searchKey(query);
    const identity = choiceIdentity(query);
    const source = getChoices(activeInput.dataset.choiceKind);
    const choices = [];
    const seen = new Set();
    for (const value of Array.isArray(source) ? source : []) {
      if (typeof value !== "string" || !value.trim()) continue;
      const key = choiceIdentity(value);
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push(value.trim());
    }
    const exact = choices.find((value) => choiceIdentity(value) === identity);
    items = choices
      .filter((value) => showAll || searchKey(value).includes(normalized))
      .map((value) => ({ value, custom: false }));
    if (query && !exact) items.push({ value: query, custom: true });
    menu.setAttribute(
      "aria-label",
      `${activeInput.dataset.choiceLabel} seçenekleri`,
    );
    menu.innerHTML = items.length
      ? items
          .map(
            (item, index) =>
              `<button type="button" class="choice-option${item.custom ? " choice-custom" : ""}" id="record-choice-option-${index}" role="option" tabindex="-1" aria-selected="false" data-choice-index="${index}"${item.custom ? ' data-choice-custom="true"' : ""}><span>${item.custom ? `<strong>${escapeHtml(item.value)}</strong><small>Bu değeri kullan</small>` : escapeHtml(item.value)}</span><span class="choice-check" aria-hidden="true">${!item.custom && choiceIdentity(item.value) === identity ? checkIcon : ""}</span></button>`,
          )
          .join("")
      : '<p class="choice-empty">Henüz seçenek yok. Bir değer yazabilirsin.</p>';
    const previousIndex =
      previous === null
        ? -1
        : items.findIndex(
            (item) => choiceIdentity(item.value) === choiceIdentity(previous),
          );
    const exactIndex = items.findIndex(
      (item) => !item.custom && choiceIdentity(item.value) === identity,
    );
    setActive(
      previousIndex >= 0 ? previousIndex : exactIndex >= 0 ? exactIndex : 0,
      { scroll: false },
    );
    position();
  }

  function open(input, { all = true } = {}) {
    if (destroyed || !input?.isConnected || input.disabled) return;
    if (activeInput !== input) close();
    activeInput = input;
    activeTrigger = input
      .closest(".choice-input-wrap")
      ?.querySelector(".choice-toggle");
    showAll = all;
    // A popover must be a child of a modal dialog to stay interactive there.
    (input.closest("[popover], dialog") || root).append(menu);
    render();
    if (!isOpen()) menu.showPopover();
    input.setAttribute("aria-expanded", "true");
    activeTrigger?.setAttribute("aria-expanded", "true");
    position();
  }

  function choose(index) {
    const item = items[index];
    const input = activeInput;
    if (!item || !input?.isConnected) return;
    applying = true;
    try {
      input.value = item.value;
      input.dispatchEvent(new owner.Event("input", { bubbles: true }));
      input.dispatchEvent(new owner.Event("change", { bubbles: true }));
    } finally {
      applying = false;
    }
    close({ restoreFocus: true });
  }

  function onClick(event) {
    const toggle = event.target.closest?.('[data-action="choice-open"]');
    if (toggle && root.contains(toggle)) {
      event.preventDefault();
      const input = toggle
        .closest(".choice-input-wrap")
        ?.querySelector("[data-choice-kind]");
      if (isOpen() && activeInput === input) close({ restoreFocus: true });
      else {
        input?.focus({ preventScroll: true });
        try {
          open(input);
        } catch (error) {
          close();
          report(error);
        }
      }
      return;
    }
    const option = event.target.closest?.("[data-choice-index]");
    if (option && menu.contains(option)) {
      event.preventDefault();
      choose(Number(option.dataset.choiceIndex));
      return;
    }
    const input = event.target.closest?.("input[data-choice-kind]");
    if (input && root.contains(input) && (!isOpen() || activeInput !== input)) {
      try {
        open(input);
      } catch (error) {
        close();
        report(error);
      }
    }
  }

  function onInput(event) {
    const input = event.target;
    if (applying || !input.matches?.("input[data-choice-kind]")) return;
    try {
      open(input, { all: false });
    } catch (error) {
      close();
      report(error);
    }
  }

  function onKeyDown(event) {
    const input = event.target.matches?.("input[data-choice-kind]")
      ? event.target
      : menu.contains(event.target)
        ? activeInput
        : null;
    if (!input || !root.contains(input)) return;
    if (event.key === "Tab") {
      if (isOpen()) close();
      return;
    }
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!isOpen() || activeInput !== input) {
        try {
          open(input);
          if (event.key === "ArrowUp") setActive(items.length - 1);
        } catch (error) {
          close();
          report(error);
        }
      } else
        setActive(
          (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            (items.length || 1),
        );
      return;
    }
    if (!isOpen() || activeInput !== input) return;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) choose(activeIndex);
      else close({ restoreFocus: true });
    }
  }

  const onMouseDown = (event) => {
    if (
      event.target.closest?.("[data-choice-index]") &&
      menu.contains(event.target)
    )
      event.preventDefault();
  };
  const onToggle = (event) => {
    if (event.newState === "closed" && !isOpen()) close();
  };
  const onScroll = (event) => {
    if (isOpen() && event.target !== menu && !menu.contains(event.target))
      position();
  };
  const refresh = () => {
    if (destroyed || !isOpen()) return;
    try {
      render({ preserveActive: true });
    } catch (error) {
      close();
      report(error);
    }
  };

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
    root.removeEventListener("keydown", onKeyDown);
    menu.removeEventListener("mousedown", onMouseDown);
    menu.removeEventListener("toggle", onToggle);
    owner.removeEventListener("resize", position);
    owner.removeEventListener("scroll", onScroll, true);
    owner.removeEventListener("pagehide", destroy);
    menu.remove();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeyDown);
  menu.addEventListener("mousedown", onMouseDown);
  menu.addEventListener("toggle", onToggle);
  owner.addEventListener("resize", position);
  owner.addEventListener("scroll", onScroll, true);
  owner.addEventListener("pagehide", destroy, { once: true });
  return { close, destroy, refresh };
}
