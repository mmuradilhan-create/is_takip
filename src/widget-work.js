import { localDate } from "./model.js";
import { appendWorkLog } from "./work-journal.js";
import { createWorkSessionStore } from "./work-session-store.js";
import { createWorkspaceStore } from "./workspace-store.js";
import { syncActionLinks } from "./action-links.js";
import { stampWaitingClosures } from "./waiting-age.js";
import { cleanupMeetingContacts } from "./meeting-contact-cleanup.js";
import {
  dueReminders,
  formatReminder,
  snoozedMinute,
  withNoteReminder,
} from "./note-reminders.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const MAX_UPCOMING = 30;
const SAVE_DELAY = 500;

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const icons = {
  journal:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v13h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 3h8v4H8zM8 12h8M8 16h5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  resume:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
};
const shortDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});
const journalDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const savedLog = (record) =>
  Array.isArray(record?.workLog) ? record.workLog : [];

/** The same journal entry point as the daily list and the sidebar work card. */
function journalButton(record) {
  const count = savedLog(record).length;
  return `<button type="button" class="wb-journal-trigger${count ? " has-entries" : ""}" data-wb="journal" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: çalışma geçmişini gör · ${count} kayıt" title="Çalışma geçmişi: ${count} kayıt">${icons.journal}</button>`;
}

const openDaily = (record) =>
  record?.type === "daily" &&
  typeof record.title === "string" &&
  !CLOSED.has(record.status);
const journaled = (record, sessionId) =>
  Array.isArray(record?.workLog) &&
  record.workLog.some((entry) => entry.id === sessionId);
const draftText = (entry) => entry?.draftNote ?? "";

/** Order open daily work the way a person picks the next job to start. */
export function upcomingWork(
  records,
  busyIds = new Set(),
  today = localDate(),
) {
  const dueRank = (record) =>
    !record.dueDate ? 2 : record.dueDate <= today ? 0 : 1;
  return records
    .filter((record) => openDaily(record) && !busyIds.has(record.id))
    .sort(
      (a, b) =>
        Number(b.focusDate === today) - Number(a.focusDate === today) ||
        Number(b.status === "in_progress") -
          Number(a.status === "in_progress") ||
        dueRank(a) - dueRank(b) ||
        (a.dueDate || "").localeCompare(b.dueDate || "") ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
        a.title.localeCompare(b.title, "tr"),
    )
    .slice(0, MAX_UPCOMING);
}

/**
 * The widget's work view: the selected work's note, its pause/resume/finish
 * controls, paused work and the next open daily work. Every write goes through
 * the same workspace and session stores as the main window, with the same
 * conflict checks, so both windows share one note and one undo history.
 */
export function createWidgetWork({
  document,
  window,
  storageKey,
  preferencesKey,
  onOpenRecord = () => {},
  onMessage = () => {},
}) {
  const root = document.getElementById("widget-workbench");
  const active = root.querySelector(".wb-active");
  const phase = root.querySelector(".wb-phase");
  const title = root.querySelector(".wb-title");
  const label = root.querySelector(".wb-note-label");
  const note = root.querySelector("#widget-work-note");
  const error = root.querySelector(".wb-error");
  const conflict = root.querySelector(".wb-conflict");
  const controls = root.querySelector(".wb-controls");
  const toggle = root.querySelector('[data-wb="toggle"]');
  const finishButton = root.querySelector('[data-wb="finish"]');
  const finishControls = root.querySelector(".wb-finish-controls");
  const saveButton = root.querySelector('[data-wb="finish-save"]');
  const idle = root.querySelector(".wb-idle");
  const pausedSection = root.querySelector(".wb-paused");
  const pausedList = root.querySelector("#wb-paused-list");
  const upcomingSection = root.querySelector(".wb-upcoming");
  const upcomingList = root.querySelector("#wb-upcoming-list");
  const headingJournal = root.querySelector(".wb-heading-journal");
  const journalPanel = root.querySelector(".wb-journal");
  const journalTitle = root.querySelector(".wb-journal-title");
  const journalList = root.querySelector(".wb-journal-list");
  const reminderStrip = document.getElementById("widget-reminders");
  const reminderList = document.getElementById("widget-reminder-list");
  let reminderSaving = false;
  const storage = window.localStorage;

  let workspace = null;
  let store = null;
  let records = [];
  let lastRaw;
  let unavailable = "";
  let editor = null;
  let finish = null;
  let finishing = false;
  let saveTimer = null;
  let destroyed = false;
  let journalId = null;
  const listMarkup = new WeakMap();

  function setup() {
    try {
      const raw = storage.getItem(storageKey);
      workspace = createWorkspaceStore({
        storage,
        key: storageKey,
        preferencesKey,
      });
      store = createWorkSessionStore({
        storage: workspace.sessionStorage,
        onChange: () => render(),
        onError: (message) => {
          if (editor) editor.error = message;
          onMessage(message, "error");
          render();
        },
      });
      lastRaw = raw;
      records = workspace.records;
      unavailable =
        raw === null
          ? "Çalışmaya başlamak için ODAK’ı bir kez açıp kayıtlarını kaydet."
          : workspace.readOnly
            ? "Kayıtlar okunamadığı için çalışma notu değiştirilemiyor."
            : "";
    } catch {
      unavailable = "Kayıtlar okunamadığı için çalışma notu değiştirilemiyor.";
    }
  }

  function synchronize() {
    if (!workspace || !store) return;
    try {
      const raw = storage.getItem(storageKey);
      if (raw !== lastRaw) {
        if (raw === null) {
          unavailable =
            "Çalışmaya başlamak için ODAK’ı bir kez açıp kayıtlarını kaydet.";
        } else {
          workspace.synchronize(raw);
          records = workspace.records;
          unavailable = workspace.readOnly
            ? "Kayıtlar okunamadığı için çalışma notu değiştirilemiyor."
            : "";
        }
        lastRaw = raw;
      }
      store.synchronize();
    } catch {
      unavailable = "Kayıtlar okunamadığı için çalışma notu değiştirilemiyor.";
    }
  }

  const find = (id) => records.find((record) => record.id === id);

  function selected() {
    if (!store) return null;
    const entry = store.current;
    if (!entry || !["running", "paused"].includes(entry.status)) return null;
    const record = find(entry.recordId);
    if (!openDaily(record) || journaled(record, entry.sessionId)) return null;
    return { entry, record };
  }

  function adoptEditor(entry) {
    if (
      editor &&
      editor.recordId === entry.recordId &&
      editor.sessionId === entry.sessionId
    ) {
      const remote = draftText(entry);
      if (!editor.dirty && !editor.conflict && remote !== editor.expected) {
        editor.text = remote;
        editor.expected = remote;
      }
      return;
    }
    if (editor?.dirty) flush();
    editor = {
      recordId: entry.recordId,
      sessionId: entry.sessionId,
      text: draftText(entry),
      expected: draftText(entry),
      dirty: false,
      conflict: false,
      remote: null,
      error: "",
    };
    finish = null;
  }

  function flush() {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    if (!editor?.dirty || !store) return true;
    if (editor.conflict) return false;
    store.synchronize();
    const latest = store.get(editor.recordId);
    if (
      !latest ||
      latest.sessionId !== editor.sessionId ||
      latest.status === "finished"
    ) {
      editor.conflict = true;
      editor.remote = draftText(latest);
      editor.error =
        "Bu çalışma artık değiştirilemiyor. Yazdıkların burada korunuyor.";
      render();
      return false;
    }
    const saved = store.saveDraft(
      editor.recordId,
      editor.sessionId,
      editor.text,
      editor.expected,
    );
    const current = store.get(editor.recordId);
    if (saved && draftText(current) === editor.text) {
      editor.expected = editor.text;
      editor.dirty = false;
      editor.error = "";
    } else if (draftText(current) !== editor.expected) {
      editor.conflict = true;
      editor.remote = draftText(current);
      editor.error =
        "Çalışma notu başka bir pencerede değişti. Yazdıkların korunuyor.";
    } else {
      editor.error =
        "Not kaydedilemedi. Yazdıkların burada korunuyor; yeniden dene.";
    }
    render();
    return saved && !editor.dirty;
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      flush();
    }, SAVE_DELAY);
  }

  function start(recordId) {
    if (unavailable || finishing || !store) return;
    if (!flush() && editor?.dirty) return;
    store.synchronize();
    if (!openDaily(find(recordId))) {
      onMessage("Bu iş artık açık değil. Güncel listeyi kontrol et.", "error");
      return;
    }
    finish = null;
    if (store.start(recordId, { trackTime: false })) {
      render();
      note.focus({ preventScroll: true });
    }
  }

  function toggleRunning() {
    const current = selected();
    if (!current || finish || finishing || unavailable) return;
    if (!flush() && editor?.dirty) return;
    if (current.entry.status === "running")
      store.pause(current.entry.recordId, current.entry.sessionId);
    else if (store.start(current.entry.recordId, { trackTime: false })) {
      render();
      note.focus({ preventScroll: true });
      return;
    }
    render();
  }

  function beginFinish() {
    const current = selected();
    if (!current || finish || finishing || unavailable) return;
    if (!flush() && editor?.dirty) return;
    store.synchronize();
    const entry = store.current;
    if (entry?.recordId !== current.entry.recordId) return;
    if (
      entry.status === "running" &&
      !store.pause(entry.recordId, entry.sessionId)
    )
      return;
    const paused = store.current;
    if (
      paused?.recordId !== entry.recordId ||
      paused.sessionId !== entry.sessionId ||
      paused.status !== "paused"
    )
      return;
    const ended = new Date();
    finish = {
      recordId: paused.recordId,
      sessionId: paused.sessionId,
      endedAt: ended.toISOString(),
      date: localDate(ended),
      durationMs: paused.elapsedMs,
    };
    if (editor) editor.error = "";
    render();
    note.focus({ preventScroll: true });
  }

  function cancelFinish() {
    if (finishing) return;
    finish = null;
    if (editor) editor.error = "";
    render();
  }

  function saveLog(pending) {
    const before = workspace.records;
    const record = before.find((item) => item.id === pending.recordId);
    if (!openDaily(record))
      throw new Error("Bu günlük iş kapanmış. Güncel kaydı kontrol et.");
    const updated = appendWorkLog(
      record,
      { ...pending, id: pending.sessionId },
      { updatedAt: new Date().toISOString() },
    );
    if (updated === record) return;
    const next = before.map((item) =>
      item.id === pending.recordId ? updated : item,
    );
    const linked = syncActionLinks(before, next);
    workspace.saveRecords(
      cleanupMeetingContacts(stampWaitingClosures(before, linked)),
      "İş günlüğü kaydı",
    );
    lastRaw = storage.getItem(storageKey);
    records = workspace.records;
  }

  function completeFinish() {
    if (!finish || finishing || !editor) return;
    const pending = { ...finish };
    const rawNote = editor.text;
    const result = rawNote.trim();
    if (!flush() && editor.dirty) return;
    synchronize();
    const record = find(pending.recordId);
    const existing = journaled(record, pending.sessionId);
    const latest = store.get(pending.recordId);
    if (
      !existing &&
      (!openDaily(record) ||
        latest?.sessionId !== pending.sessionId ||
        latest.status !== "paused" ||
        latest.elapsedMs !== pending.durationMs ||
        draftText(latest) !== rawNote ||
        store.current?.recordId !== pending.recordId)
    ) {
      editor.error =
        "Bu çalışma başka bir pencerede değişti. Notun korunuyor; güncel çalışmayı kontrol et.";
      render();
      return;
    }
    finishing = true;
    render();
    try {
      if (result && !existing) saveLog({ ...pending, note: result });
      if (
        !store.finish(pending.recordId, pending.sessionId, {
          expectedDraft: rawNote,
        })
      ) {
        editor.error =
          result || existing
            ? "Sonuç kaydedildi; çalışma kapatılamadı. Yeniden dene."
            : "Çalışma kapatılamadı. Yeniden dene.";
        return;
      }
      finish = null;
      editor = null;
      onMessage(
        result ? "Sonuç çalışma geçmişine kaydedildi." : "Çalışma bitirildi.",
        "info",
      );
    } catch (failure) {
      synchronize();
      editor.error =
        failure?.name === "WorkspaceConflictError"
          ? "Kayıtlar başka bir pencerede değişti. Notun korunuyor; yeniden kaydet."
          : `Sonuç kaydedilemedi: ${failure?.message || "Tarayıcı depolamasını kontrol et."}`;
    } finally {
      finishing = false;
      render();
    }
  }

  function setList(list, html) {
    if (listMarkup.get(list) === html) return;
    const focused = document.activeElement;
    const key =
      focused && list.contains(focused)
        ? `${focused.dataset.wb}:${focused.dataset.id}`
        : null;
    list.innerHTML = html;
    listMarkup.set(list, html);
    if (key)
      [...list.querySelectorAll("[data-wb]")]
        .find((item) => `${item.dataset.wb}:${item.dataset.id}` === key)
        ?.focus({ preventScroll: true });
  }

  function dueLabel(record, today) {
    if (!record.dueDate) return "";
    if (record.dueDate < today) return "Gecikti";
    if (record.dueDate === today) return "Bugün";
    return shortDate.format(new Date(`${record.dueDate}T12:00:00`));
  }

  function row(record, action, today) {
    const due = dueLabel(record, today);
    const resume = action === "resume";
    return `<li class="wb-row" data-id="${escapeHtml(record.id)}"><button type="button" class="wb-row-title" data-wb="open" data-id="${escapeHtml(record.id)}" title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</button>${due ? `<span class="wb-row-due${due === "Gecikti" ? " is-overdue" : due === "Bugün" ? " is-today" : ""}">${escapeHtml(due)}</span>` : ""}${journalButton(record)}<button type="button" class="wb-row-start${resume ? " is-paused" : ""}" data-wb="${resume ? "resume" : "start"}" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(record.title)}: ${resume ? "çalışmaya devam et" : "çalışmaya başla"}" title="${resume ? "Devam et" : "Çalışmaya başla"}"${unavailable || finishing ? " disabled" : ""}>${resume ? icons.resume : icons.play}</button></li>`;
  }

  function renderJournal() {
    const record = journalId ? find(journalId) : null;
    if (journalId && !record) journalId = null;
    root.dataset.journal = journalId ? "open" : "closed";
    journalPanel.hidden = !journalId;
    if (!record) return;
    journalTitle.textContent = record.title;
    journalTitle.title = record.title;
    const entries = [...savedLog(record)].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.endedAt || "").localeCompare(String(a.endedAt || "")),
    );
    setList(
      journalList,
      entries.length
        ? entries
            .map(
              (entry) =>
                `<li class="wb-journal-entry"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(journalDate.format(new Date(`${entry.date}T12:00:00`)))}</time><p>${entry.note?.trim() ? escapeHtml(entry.note) : '<span class="wb-journal-empty-note">Sonuç yazılmamış.</span>'}</p></li>`,
            )
            .join("")
        : '<li class="wb-journal-none">Bu iş için kayıtlı çalışma yok. Bitir ile yazdığın sonuçlar burada görünür.</li>',
    );
  }

  /** Due note reminders stay on top of both widget views until answered. */
  function renderReminders() {
    if (!reminderStrip || !reminderList) return;
    let due = [];
    try {
      due = workspace && !unavailable ? dueReminders(workspace.notes) : [];
    } catch {
      due = [];
    }
    reminderStrip.hidden = !due.length;
    setList(
      reminderList,
      due
        .slice(0, 3)
        .map(
          (note) =>
            `<li class="widget-reminder" data-note-id="${escapeHtml(note.id)}"><span class="widget-reminder-copy"><span class="widget-reminder-when">${escapeHtml(formatReminder(note.remindAt))}</span><span class="widget-reminder-text" title="${escapeHtml(note.text)}">${escapeHtml(note.text.split("\n")[0])}</span></span><button type="button" data-wb="reminder-done" data-id="${escapeHtml(note.id)}"${reminderSaving ? " disabled" : ""}>Tamam</button><button type="button" data-wb="reminder-hour" data-id="${escapeHtml(note.id)}" title="1 saat sonra, çeyrek saate yuvarlanarak yeniden hatırlat"${reminderSaving ? " disabled" : ""}>1 saat</button></li>`,
        )
        .join("") +
        (due.length > 3
          ? `<li class="widget-reminder-more">+${due.length - 3} hatırlatma daha · ODAK’taki zilden görebilirsin</li>`
          : ""),
    );
  }

  function answerReminder(id, action) {
    if (!workspace || unavailable || reminderSaving) return;
    synchronize();
    const expected = workspace.notes;
    try {
      reminderSaving = true;
      const next = withNoteReminder(
        expected,
        id,
        action === "done" ? null : snoozedMinute("hour"),
        new Date().toISOString(),
      );
      workspace.saveNotes(
        next,
        action === "done" ? "Hatırlatmayı kapatma" : "Hatırlatmayı erteleme",
      );
      lastRaw = storage.getItem(storageKey);
    } catch (failure) {
      synchronize();
      onMessage(
        failure?.name === "WorkspaceConflictError"
          ? "Notlar başka bir pencerede değişti. Güncel hatırlatmalar yüklendi; yeniden deneyebilirsin."
          : failure?.message || "Hatırlatma kaydedilemedi.",
        "error",
      );
    } finally {
      reminderSaving = false;
      render();
    }
  }

  function render() {
    if (destroyed) return;
    renderReminders();
    renderJournal();
    const today = localDate();
    const current = unavailable ? null : selected();
    if (current) adoptEditor(current.entry);
    else if (!finishing && !editor?.dirty) {
      editor = null;
      finish = null;
    }
    const working = Boolean(current && editor);
    root.dataset.mode = working ? "working" : "idle";
    // A paused work folds to a compact summary, like the sidebar work card.
    root.dataset.phase = working
      ? finish
        ? "finish"
        : current.entry.status
      : "idle";
    active.hidden = !working;
    idle.hidden = working;
    if (working) {
      const running = current.entry.status === "running";
      const finishingDraft = Boolean(finish);
      phase.textContent = finishingDraft
        ? "Sonuç kaydı"
        : running
          ? "Çalışıyor"
          : "Duraklatıldı";
      phase.dataset.phase = finishingDraft ? "finish" : current.entry.status;
      title.textContent = current.record.title;
      title.title = current.record.title;
      title.dataset.id = current.record.id;
      setList(headingJournal, journalButton(current.record));
      label.textContent = finishingDraft
        ? "Sonuç (isteğe bağlı)"
        : "Çalışma notu";
      note.placeholder = finishingDraft
        ? "Bu çalışmanın sonucunu yaz…"
        : "Çalışırken notlarını buraya yaz…";
      if (note.value !== editor.text) note.value = editor.text;
      note.disabled = finishing;
      error.textContent = editor.error;
      error.hidden = !editor.error;
      conflict.hidden = !editor.conflict;
      controls.hidden = finishingDraft;
      finishControls.hidden = !finishingDraft;
      toggle.dataset.state = running ? "running" : "paused";
      // Rewrite controls only when their state changes: replacing a pressed
      // button's content between mousedown and mouseup drops the click.
      if (toggle.dataset.rendered !== toggle.dataset.state) {
        toggle.innerHTML = `${running ? icons.pause : icons.resume}<span>${running ? "Duraklat" : "Devam et"}</span>`;
        toggle.dataset.rendered = toggle.dataset.state;
      }
      toggle.disabled = finishing;
      finishButton.disabled = finishing;
      saveButton.disabled = finishing || editor.conflict;
      const saveText = finishing ? "Kaydediliyor…" : "Kaydet ve bitir";
      if (saveButton.textContent !== saveText)
        saveButton.textContent = saveText;
    } else {
      idle.querySelector(".wb-idle-text").textContent =
        unavailable || "Şu an çalışılan iş yok. Aşağıdan birini başlat.";
    }
    const entries = store && !unavailable ? store.snapshot.entries : [];
    const busy = new Set(
      entries
        .filter((entry) => entry.status !== "finished")
        .map((entry) => entry.recordId),
    );
    const paused = entries
      .filter(
        (entry) =>
          entry.status === "paused" &&
          entry.recordId !== current?.entry.recordId &&
          openDaily(find(entry.recordId)) &&
          !journaled(find(entry.recordId), entry.sessionId),
      )
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt || a.recordId.localeCompare(b.recordId),
      );
    pausedSection.hidden = !paused.length;
    setList(
      pausedList,
      paused
        .map((entry) => row(find(entry.recordId), "resume", today))
        .join(""),
    );
    // While a work runs the note gets the room; once paused, another can start.
    const browsing = !working || current.entry.status !== "running";
    const upcoming =
      browsing && !finish ? upcomingWork(records, busy, today) : [];
    upcomingSection.hidden = !upcoming.length;
    setList(
      upcomingList,
      upcoming.map((record) => row(record, "start", today)).join(""),
    );
  }

  function refresh() {
    if (destroyed) return;
    synchronize();
    render();
  }

  function onReminderClick(event) {
    const control = event.target.closest?.("[data-wb]");
    if (!control || !reminderStrip?.contains(control) || control.disabled)
      return;
    answerReminder(
      control.dataset.id,
      control.dataset.wb === "reminder-done" ? "done" : "hour",
    );
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-wb]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.wb;
    if (action === "open") onOpenRecord(control.dataset.id);
    else if (action === "journal") {
      journalId = control.dataset.id;
      render();
      root
        .querySelector('[data-wb="journal-close"]')
        .focus({ preventScroll: true });
    } else if (action === "journal-close") {
      const id = journalId;
      journalId = null;
      render();
      [...root.querySelectorAll('[data-wb="journal"]')]
        .find((item) => item.dataset.id === id)
        ?.focus({ preventScroll: true });
    } else if (action === "start" || action === "resume")
      start(control.dataset.id);
    else if (action === "toggle") toggleRunning();
    else if (action === "finish") beginFinish();
    else if (action === "finish-cancel") cancelFinish();
    else if (action === "finish-save") completeFinish();
    else if (action === "use-current" && editor) {
      store.synchronize();
      const latest = store.get(editor.recordId);
      editor.text = draftText(latest);
      editor.expected = editor.text;
      editor.dirty = false;
      editor.conflict = false;
      editor.remote = null;
      editor.error = "";
      render();
    } else if (action === "save-local" && editor) {
      store.synchronize();
      editor.expected = draftText(store.get(editor.recordId));
      editor.conflict = false;
      editor.dirty = true;
      flush();
    }
  }

  function onInput(event) {
    if (event.target !== note || !editor || finishing) return;
    editor.text = note.value;
    editor.dirty = editor.text !== editor.expected;
    if (editor.dirty) scheduleSave();
  }

  function onKeydown(event) {
    if (destroyed || root.hidden || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    const plain = !event.shiftKey && !event.altKey && !event.metaKey;
    if (event.ctrlKey && plain && key === "p") {
      event.preventDefault();
      toggleRunning();
      return;
    }
    if (event.ctrlKey && plain && event.key === "Enter") {
      event.preventDefault();
      if (finish) completeFinish();
      else beginFinish();
      return;
    }
    if (journalId && event.key === "Escape") {
      event.preventDefault();
      journalId = null;
      render();
      return;
    }
    if (event.target !== note || event.isComposing || event.keyCode === 229)
      return;
    if (finish && event.key === "Escape") {
      event.preventDefault();
      cancelFinish();
    } else if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      // Like the main note: Enter never sends; Shift+Enter adds a line.
      event.preventDefault();
      if (finish) completeFinish();
    }
  }

  function onBlur(event) {
    if (event.target === note) flush();
  }

  function destroy() {
    if (destroyed) return;
    flush();
    try {
      store?.stopOwner();
    } catch {
      /* The saved context stays as it is. */
    }
    destroyed = true;
    window.clearTimeout(saveTimer);
    root.removeEventListener("click", onClick);
    reminderStrip?.removeEventListener("click", onReminderClick);
    note.removeEventListener("input", onInput);
    note.removeEventListener("blur", onBlur);
    document.removeEventListener("keydown", onKeydown, true);
  }

  setup();
  root.addEventListener("click", onClick);
  reminderStrip?.addEventListener("click", onReminderClick);
  note.addEventListener("input", onInput);
  note.addEventListener("blur", onBlur);
  document.addEventListener("keydown", onKeydown, true);
  render();
  return {
    refresh,
    destroy,
    get working() {
      return root.dataset.mode === "working";
    },
  };
}
