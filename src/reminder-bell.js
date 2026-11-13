import { normalizeNotes } from "./workspace-notes.js";
import {
  dueReminders,
  formatReminder,
  reminderTime,
  snoozedMinute,
  upcomingReminders,
  withNoteReminder,
} from "./note-reminders.js";
import { bellIcon } from "./bell-icon.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const TICK = 20000;

/**
 * The top bar bell: a badge for reminders that are due, a quiet dot and a
 * tooltip for ones set for later, a panel to finish or snooze them, and one in-app alert per reminder while this window is open.
 * Every change goes through the notes save path, so it is one Undo step.
 */
export function createReminderBell({
  root,
  button,
  getNotes,
  onSaveNotes,
  onEditNote = null,
  onAlert = () => {},
  onError = () => {},
  now = () => Date.now(),
} = {}) {
  if (!root || !button || typeof getNotes !== "function")
    throw new TypeError("Hatırlatmalar için not kaynağı gereklidir.");
  const document = root.ownerDocument;
  const win = document.defaultView;
  const panel = document.createElement("div");
  panel.id = "reminder-panel";
  panel.className = "reminder-panel";
  panel.setAttribute("popover", "auto");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Hatırlatmalar");
  root.append(panel);
  const count = button.querySelector(".reminder-count");
  const alerted = new Set();
  let saving = false;
  let destroyed = false;
  let firstTick = true;

  const readNotes = () => {
    try {
      return normalizeNotes(getNotes());
    } catch {
      return [];
    }
  };
  const key = (note) => `${note.id}|${note.remindAt}`;

  function row(note, due) {
    const when = formatReminder(note.remindAt, new Date(now()));
    const actions = due
      ? `<button type="button" class="btn small primary" data-reminder="done" data-note-id="${escapeHtml(note.id)}">Tamam</button><button type="button" class="btn small" data-reminder="hour" data-note-id="${escapeHtml(note.id)}" title="1 saat sonra, çeyrek saate yuvarlanarak yeniden hatırlat">1 saat</button><button type="button" class="btn small" data-reminder="tomorrow" data-note-id="${escapeHtml(note.id)}" title="Yarın 09:00’da yeniden hatırlat">Yarın 09:00</button>`
      : onEditNote
        ? `<button type="button" class="btn small" data-reminder="edit" data-note-id="${escapeHtml(note.id)}">Düzenle</button>`
        : "";
    // Without a note editor (the widget), a reminder set for later is only shown.
    return `<li class="reminder-row${due ? " is-due" : ""}" data-note-id="${escapeHtml(note.id)}"><div class="reminder-copy"><span class="reminder-when">${bellIcon}${escapeHtml(when)}</span><p class="reminder-text">${escapeHtml(note.text)}</p></div>${actions ? `<div class="reminder-actions">${actions}</div>` : ""}</li>`;
  }

  function renderPanel() {
    const notes = readNotes();
    const at = now();
    const due = dueReminders(notes, at);
    const upcoming = upcomingReminders(notes, at);
    panel.innerHTML = `<div class="reminder-panel-header"><h2>Hatırlatmalar</h2><button type="button" class="close-modal" data-reminder="close" aria-label="Hatırlatmaları kapat">${closeIcon}</button></div>${
      due.length || upcoming.length
        ? `${due.length ? `<section aria-label="Zamanı gelenler"><ul class="reminder-list">${due.map((note) => row(note, true)).join("")}</ul></section>` : ""}${upcoming.length ? `<section aria-label="Yaklaşanlar"><h3>Yaklaşanlar</h3><ul class="reminder-list">${upcoming.map((note) => row(note, false)).join("")}</ul></section>` : ""}`
        : '<p class="reminder-empty">Hatırlatma yok. Notlar kartında bir notu ekleyip veya düzenleyip <strong>Hatırlat</strong>’ı seçebilirsin.</p>'
    }`;
    for (const control of panel.querySelectorAll("[data-reminder]"))
      if (control.dataset.reminder !== "close") control.disabled = saving;
  }

  function position() {
    const rect = button.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, win.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, win.innerHeight - bounds.height - 8))}px`;
  }

  function refresh() {
    if (destroyed) return;
    const notes = readNotes();
    const at = now();
    const due = dueReminders(notes, at);
    const upcoming = upcomingReminders(notes, at);
    count.textContent = String(due.length);
    count.hidden = !due.length;
    button.classList.toggle("is-due", due.length > 0);
    // Reminders set for later only leave a quiet dot; the count is for due ones.
    button.classList.toggle("has-upcoming", !due.length && upcoming.length > 0);
    const parts = [];
    if (due.length) parts.push(`${due.length} hatırlatmanın zamanı geldi`);
    if (upcoming.length)
      parts.push(
        `${upcoming.length} yaklaşan hatırlatma · sıradaki: ${formatReminder(upcoming[0].remindAt, new Date(at))}`,
      );
    const summary = parts.join(" · ");
    button.setAttribute(
      "aria-label",
      summary ? `Hatırlatmalar: ${summary}` : "Hatırlatmalar",
    );
    button.title = summary || "Hatırlatmalar";
    // Note tags turn amber as their minute passes, without a full render.
    for (const tag of root.querySelectorAll(
      ".workspace-note-reminder[data-remind-at]",
    )) {
      const time = reminderTime(tag.dataset.remindAt);
      tag.classList.toggle("is-due", time !== null && time <= at);
    }
    const fresh = due.filter((note) => !alerted.has(key(note)));
    for (const note of fresh) alerted.add(key(note));
    if (fresh.length)
      try {
        onAlert(
          fresh.length === 1
            ? `Hatırlatma: ${fresh[0].text.split("\n")[0].slice(0, 120)}`
            : firstTick
              ? `${fresh.length} hatırlatmanın zamanı geldi. Zil simgesinden görebilirsin.`
              : `${fresh.length} hatırlatmanın zamanı geldi.`,
        );
      } catch {
        /* An alert never blocks the badge. */
      }
    firstTick = false;
    if (panel.matches(":popover-open")) {
      const focused = panel.contains(document.activeElement)
        ? `${document.activeElement.dataset.reminder}|${document.activeElement.dataset.noteId}`
        : null;
      renderPanel();
      if (focused)
        [...panel.querySelectorAll("[data-reminder]")]
          .find(
            (item) =>
              `${item.dataset.reminder}|${item.dataset.noteId}` === focused,
          )
          ?.focus({ preventScroll: true });
    }
  }

  function toggle() {
    if (panel.matches(":popover-open")) {
      panel.hidePopover();
      return;
    }
    renderPanel();
    panel.style.left = "8px";
    panel.style.top = "8px";
    panel.showPopover();
    button.setAttribute("aria-expanded", "true");
    position();
    (
      panel.querySelector(".reminder-actions button") ||
      panel.querySelector('[data-reminder="close"]')
    )?.focus({ preventScroll: true });
  }

  async function act(action, id) {
    if (saving) return;
    if (action === "edit") {
      panel.hidePopover();
      onEditNote?.(id, button);
      return;
    }
    const expected = readNotes();
    const rows = [...panel.querySelectorAll(".reminder-row")];
    const index = rows.findIndex((item) => item.dataset.noteId === id);
    const neighbour = (rows[index + 1] || rows[index - 1])?.dataset.noteId;
    try {
      const remindAt =
        action === "done" ? null : snoozedMinute(action, new Date(now()));
      const next = withNoteReminder(
        expected,
        id,
        remindAt,
        new Date(now()).toISOString(),
      );
      saving = true;
      renderPanel();
      const saved = await onSaveNotes(
        next,
        expected,
        action === "done" ? "Hatırlatmayı kapatma" : "Hatırlatmayı erteleme",
      );
      if (saved !== true) throw new Error("Hatırlatma kaydedilemedi.");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
      refresh();
      if (panel.matches(":popover-open")) {
        renderPanel();
        (
          (neighbour &&
            panel.querySelector(
              `.reminder-row[data-note-id="${CSS.escape(neighbour)}"] button`,
            )) ||
          panel.querySelector(".reminder-actions button") ||
          panel.querySelector('[data-reminder="close"]')
        )?.focus({ preventScroll: true });
      }
    }
  }

  function onButtonClick(event) {
    event.preventDefault();
    toggle();
  }

  function onPanelClick(event) {
    const control = event.target.closest?.("[data-reminder]");
    if (!control || !panel.contains(control) || control.disabled) return;
    if (control.dataset.reminder === "close") {
      panel.hidePopover();
      button.focus({ preventScroll: true });
      return;
    }
    void act(control.dataset.reminder, control.dataset.noteId);
  }

  function onToggle(event) {
    if (event.newState === "closed")
      button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", onButtonClick);
  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("toggle", onToggle);
  const onResize = () => {
    if (panel.matches(":popover-open")) position();
  };
  win.addEventListener("resize", onResize);
  const timer = win.setInterval(refresh, TICK);
  const onFocus = () => refresh();
  win.addEventListener("focus", onFocus);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    win.clearInterval(timer);
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("resize", onResize);
    button.removeEventListener("click", onButtonClick);
    panel.removeEventListener("click", onPanelClick);
    panel.removeEventListener("toggle", onToggle);
    panel.remove();
  }

  refresh();
  return { refresh, destroy, toggle };
}
