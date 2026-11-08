import { localDate } from "./model.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const calendarIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>';
const previousIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
const nextIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
const months = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];
const spokenDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "long",
  timeZone: "UTC",
});

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && key(date) === value ? date : null;
}

function key(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function partsDate(year, month, day = 1) {
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}

/** Persist ISO dates while always presenting day, month and year in that order. */
export function formatDateInput(value) {
  return calendarDate(String(value || ""))
    ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
    : "";
}

export function dateValue(input) {
  const text = String(
    typeof input === "string" ? input : input?.value || "",
  ).trim();
  if (!text) return "";
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const value = match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : text;
  const min =
    typeof input === "string"
      ? "1900-01-01"
      : input?.dataset?.dateMin || "1900-01-01";
  const max =
    typeof input === "string"
      ? "9999-12-31"
      : input?.dataset?.dateMax || "9999-12-31";
  if (!calendarDate(value) || value < min || value > max)
    throw new Error("Geçerli bir tarihi GG.AA.YYYY biçiminde yaz (1900–9999).");
  return value;
}

export function dateInput({
  name,
  id = name,
  value = "",
  label = "Tarih",
  min = "1900-01-01",
  max = "9999-12-31",
} = {}) {
  return `<span class="date-input-wrap"><input type="text" id="${escapeHtml(id)}" name="${escapeHtml(name)}" data-date-input data-date-min="${escapeHtml(min)}" data-date-max="${escapeHtml(max)}" value="${escapeHtml(formatDateInput(value))}" inputmode="numeric" autocomplete="off" placeholder="GG.AA.YYYY" maxlength="10" aria-label="${escapeHtml(label)}" title="Gün.Ay.Yıl (GG.AA.YYYY)"><button type="button" class="date-picker-toggle" data-action="date-picker-open" aria-label="${escapeHtml(label)}: takvimi aç" aria-haspopup="dialog" aria-controls="odak-date-picker" aria-expanded="false" title="Takvimden seç">${calendarIcon}</button></span>`;
}

/** A shared Turkish calendar in the top layer, bounded by the visible viewport. */
export function createDatePicker({
  root = document.querySelector("#app"),
  today = () => localDate(),
} = {}) {
  if (!root) throw new TypeError("Takvim için çalışma alanı gereklidir.");
  const document = root.ownerDocument;
  const win = document.defaultView;
  const picker = document.createElement("div");
  picker.id = "odak-date-picker";
  picker.className = "odak-date-picker";
  picker.setAttribute("popover", "auto");
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Tarih seç");
  root.append(picker);
  let activeInput = null;
  let activeTrigger = null;
  let viewed = calendarDate(localDate());
  let focusDate = "";
  let destroyed = false;
  const currentDay = () => (typeof today === "function" ? today() : today);
  const isOpen = () => picker.matches(":popover-open");

  function resetTrigger() {
    activeTrigger?.setAttribute("aria-expanded", "false");
  }

  function close({ restoreFocus = false } = {}) {
    const input = activeInput;
    if (isOpen()) picker.hidePopover();
    resetTrigger();
    if (restoreFocus && input?.isConnected)
      input.focus({ preventScroll: true });
  }

  function position() {
    if (!isOpen()) return;
    if (!activeInput?.isConnected) {
      close();
      return;
    }
    const anchor = activeInput.closest(".date-input-wrap") || activeInput;
    const rect = anchor.getBoundingClientRect();
    const viewport = win.visualViewport;
    let leftEdge = viewport?.offsetLeft || 0;
    let topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth;
    const height = viewport?.height || win.innerHeight;
    let rightEdge = leftEdge + width;
    let bottom = topEdge + height;
    const dialog = activeInput.closest("dialog");
    if (dialog) {
      if (!dialog.open) {
        close();
        return;
      }
      const body = activeInput.closest(".modal-body");
      const bodyBounds = body?.getBoundingClientRect();
      const dialogBounds = dialog.getBoundingClientRect();
      const header = dialog
        .querySelector(".modal-header")
        ?.getBoundingClientRect();
      const footer = dialog
        .querySelector(".modal-footer")
        ?.getBoundingClientRect();
      topEdge = Math.max(topEdge, bodyBounds?.top || header?.bottom || topEdge);
      bottom = Math.min(bottom, bodyBounds?.bottom || footer?.top || bottom);
      leftEdge = Math.max(leftEdge, bodyBounds?.left || dialogBounds.left);
      rightEdge = Math.min(rightEdge, bodyBounds?.right || dialogBounds.right);
    }
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom <= topEdge ||
      rect.top >= bottom ||
      rect.right <= leftEdge ||
      rect.left >= rightEdge
    ) {
      close();
      return;
    }
    picker.style.maxHeight = `${Math.max(1, bottom - topEdge - 16)}px`;
    picker.style.maxWidth = `${Math.max(1, rightEdge - leftEdge - 16)}px`;
    const bounds = picker.getBoundingClientRect();
    const below = rect.bottom + 6;
    const top =
      below + bounds.height <= bottom - 8
        ? below
        : rect.top - bounds.height - 6;
    picker.style.left = `${Math.max(leftEdge + 8, Math.min(rect.left, rightEdge - bounds.width - 8))}px`;
    picker.style.top = `${Math.max(topEdge + 8, Math.min(top, bottom - bounds.height - 8))}px`;
  }

  function selectedValue() {
    try {
      return dateValue(activeInput);
    } catch {
      return "";
    }
  }

  function render() {
    const year = viewed.getUTCFullYear();
    const month = viewed.getUTCMonth();
    const selected = selectedValue();
    const min = activeInput?.dataset.dateMin || "1900-01-01";
    const max = activeInput?.dataset.dateMax || "9999-12-31";
    const start = partsDate(year, month);
    const offset = (start.getUTCDay() + 6) % 7;
    const days = partsDate(year, month + 1, 0).getUTCDate();
    const cells = Array.from(
      { length: offset },
      () => '<span class="date-picker-blank" aria-hidden="true"></span>',
    );
    for (let day = 1; day <= days; day++) {
      const date = partsDate(year, month, day);
      const value = key(date);
      cells.push(
        `<button type="button" class="date-picker-day${value === selected ? " is-selected" : ""}${value === currentDay() ? " is-today" : ""}" data-date-day="${value}" aria-label="${escapeHtml(spokenDate.format(date))}" aria-pressed="${value === selected}" ${value === currentDay() ? 'aria-current="date"' : ""} ${value < min || value > max ? "disabled" : ""}>${day}</button>`,
      );
    }
    picker.innerHTML = `<div class="date-picker-header"><button type="button" class="date-picker-nav" data-date-nav="-1" aria-label="Önceki ay" ${year === Number(min.slice(0, 4)) && month === Number(min.slice(5, 7)) - 1 ? "disabled" : ""}>${previousIcon}</button><label class="date-picker-month-label"><span class="visually-hidden">Ay</span><select data-date-month aria-label="Ay">${months.map((name, index) => `<option value="${index}" ${index === month ? "selected" : ""}>${name}</option>`).join("")}</select></label><label class="date-picker-year-label"><span class="visually-hidden">Yıl</span><input type="number" data-date-year aria-label="Yıl" min="${min.slice(0, 4)}" max="${max.slice(0, 4)}" value="${year}" inputmode="numeric"></label><button type="button" class="date-picker-nav" data-date-nav="1" aria-label="Sonraki ay" ${year === Number(max.slice(0, 4)) && month === Number(max.slice(5, 7)) - 1 ? "disabled" : ""}>${nextIcon}</button></div><div class="date-picker-weekdays" aria-hidden="true">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div><div class="date-picker-days" role="group" aria-label="${months[month]} ${year}">${cells.join("")}</div><div class="date-picker-footer"><button type="button" data-date-shortcut="today">Bugün</button><button type="button" data-date-shortcut="clear">Temizle</button><button type="button" data-date-shortcut="cancel">Vazgeç</button></div>`;
    position();
  }

  function open(input, trigger) {
    if (!input) return;
    if (isOpen() && input === activeInput) {
      close();
      return;
    }
    close();
    activeInput = input;
    activeTrigger = trigger;
    const date = selectedValue() || currentDay();
    const min = input.dataset.dateMin || "1900-01-01";
    const max = input.dataset.dateMax || "9999-12-31";
    focusDate = date >= min && date <= max ? date : min;
    viewed = calendarDate(focusDate) || calendarDate(localDate());
    // A child popover keeps its parent quick editor open and remains interactive
    // when the field belongs to a modal dialog.
    (input.closest("[popover], dialog") || root).append(picker);
    picker.style.left = "8px";
    picker.style.top = "8px";
    render();
    picker.showPopover();
    activeTrigger?.setAttribute("aria-expanded", "true");
    position();
    picker
      .querySelector(`[data-date-day="${focusDate}"]`)
      ?.focus({ preventScroll: true });
  }

  function openFor(input) {
    if (
      destroyed ||
      !input?.matches?.("[data-date-input]") ||
      !input.isConnected ||
      !root.contains(input) ||
      input.readOnly ||
      input.matches(":disabled")
    )
      return false;
    const trigger = input
      .closest(".date-input-wrap")
      ?.querySelector(".date-picker-toggle");
    if (!trigger || trigger.matches(":disabled")) return false;
    if (isOpen() && activeInput === input) {
      position();
      return isOpen();
    }
    open(input, trigger);
    return isOpen();
  }

  function setValue(value) {
    if (!activeInput) return;
    activeInput.value = formatDateInput(value);
    activeInput.setCustomValidity("");
    activeInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    activeInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    close({ restoreFocus: true });
  }

  function updateInput(input, normalize = false) {
    try {
      const value = dateValue(input);
      input.setCustomValidity("");
      if (normalize) input.value = formatDateInput(value);
    } catch (error) {
      input.setCustomValidity(error.message);
    }
  }

  function changeMonth(month, year) {
    const min = activeInput?.dataset.dateMin || "1900-01-01";
    const max = activeInput?.dataset.dateMax || "9999-12-31";
    const next = partsDate(year, month);
    if (
      next.getUTCFullYear() < Number(min.slice(0, 4)) ||
      next.getUTCFullYear() > Number(max.slice(0, 4))
    )
      return;
    viewed = next;
    render();
  }

  function onClick(event) {
    const toggle = event.target.closest?.('[data-action="date-picker-open"]');
    if (toggle && root.contains(toggle)) {
      event.preventDefault();
      open(
        toggle.closest(".date-input-wrap")?.querySelector("[data-date-input]"),
        toggle,
      );
      return;
    }
    const control = event.target.closest?.(
      "[data-date-day], [data-date-nav], [data-date-shortcut]",
    );
    if (!control || !picker.contains(control)) return;
    event.preventDefault();
    if (control.dataset.dateDay) setValue(control.dataset.dateDay);
    else if (control.dataset.dateNav) {
      changeMonth(
        viewed.getUTCMonth() + Number(control.dataset.dateNav),
        viewed.getUTCFullYear(),
      );
      picker
        .querySelector(`[data-date-nav="${control.dataset.dateNav}"]`)
        ?.focus({ preventScroll: true });
    } else if (control.dataset.dateShortcut === "today") setValue(currentDay());
    else if (control.dataset.dateShortcut === "clear") setValue("");
    else close({ restoreFocus: true });
  }

  function onInput(event) {
    if (event.target.matches?.("[data-date-input]")) updateInput(event.target);
  }

  function onChange(event) {
    const input = event.target;
    if (input.matches?.("[data-date-input]")) updateInput(input, true);
    else if (
      picker.contains(input) &&
      input.matches?.("[data-date-month], [data-date-year]")
    ) {
      const month = Number(picker.querySelector("[data-date-month]").value);
      const year = Number(picker.querySelector("[data-date-year]").value);
      changeMonth(month, year);
      picker
        .querySelector(
          input.matches("[data-date-month]")
            ? "[data-date-month]"
            : "[data-date-year]",
        )
        ?.focus({ preventScroll: true });
    }
  }

  function onKeydown(event) {
    if (
      event.target.matches?.("[data-date-input]") &&
      event.altKey &&
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      open(
        event.target,
        event.target
          .closest(".date-input-wrap")
          ?.querySelector(".date-picker-toggle"),
      );
      return;
    }
    if (!picker.contains(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }
    if (event.target.matches("[data-date-year]") && event.key === "Enter") {
      event.preventDefault();
      onChange(event);
      return;
    }
    const day = event.target.closest("[data-date-day]");
    const amount = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (!day || !amount) return;
    event.preventDefault();
    const date = calendarDate(day.dataset.dateDay);
    date.setUTCDate(date.getUTCDate() + amount);
    const value = key(date);
    if (
      value < (activeInput.dataset.dateMin || "1900-01-01") ||
      value > (activeInput.dataset.dateMax || "9999-12-31")
    )
      return;
    viewed = date;
    render();
    picker
      .querySelector(`[data-date-day="${value}"]`)
      ?.focus({ preventScroll: true });
  }

  function onToggle(event) {
    if (event.newState === "closed" && !isOpen()) resetTrigger();
  }
  function onResize() {
    position();
  }
  function onScroll(event) {
    if (isOpen() && event.target !== picker && !picker.contains(event.target))
      position();
  }
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("keydown", onKeydown);
  picker.addEventListener("toggle", onToggle);
  win.addEventListener("resize", onResize);
  win.addEventListener("scroll", onScroll, true);
  win.visualViewport?.addEventListener("resize", onResize);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    close();
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("keydown", onKeydown);
    picker.removeEventListener("toggle", onToggle);
    win.removeEventListener("resize", onResize);
    win.removeEventListener("scroll", onScroll, true);
    win.visualViewport?.removeEventListener("resize", onResize);
    picker.remove();
  }
  return { openFor, close, destroy };
}
