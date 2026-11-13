import { createWorkSessionStore } from "./work-session-store.js";
import { localDate } from "./model.js";

const KEY = "is-takip-v1-work-session";
const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const playIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" data-work-symbol="play"><path d="m9 5 11 7-11 7z"/></svg>';
const pauseIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" data-work-symbol="pause"><path d="M8 5v14M16 5v14"/></svg>';
const resumeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" data-work-symbol="resume"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none"/></svg>';
const stopIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';
const notesIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v13h14V5h-2M8 3h8v4H8zM8 12h8M8 16h5"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const workIcons = { play: playIcon, pause: pauseIcon, resume: resumeIcon };
const draftText = (entry) => entry?.draftNote ?? "";
const draftKey = (entry) => JSON.stringify([entry.recordId, entry.sessionId]);
const peerMessage =
  "Çalışma notu başka bir pencerede değişti. Yazdıkların burada korunuyor.";

/** Working notes stay separate from the record status and the dated result log. */
export function createWorkSessionUI({
  root = document.querySelector("#app"),
  getRecords,
  sessionStorage = null,
  workspaceStorageKey = null,
  onCompleteSession,
  onHistory = () => {},
  onRunningChange = () => {},
  onError = () => {},
  onMessage = () => {},
  journalButton = () => "",
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError("Çalışma notu için kayıt listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const sidebar = root.querySelector(".sidebar") || root;
  const nav = sidebar.querySelector(".nav");
  const journal = document.createElement("section");
  journal.id = "sidebar-work-journal";
  journal.className = "sidebar-work-journal";
  journal.setAttribute("aria-label", "Çalışma notu ve geçmişi");
  journal.innerHTML = `<div class="sidebar-journal-heading"><h2>${notesIcon}Çalışma notu</h2><span class="sidebar-journal-phase" hidden></span></div><section id="work-session-panel" class="work-session-panel" aria-label="Çalışma notu" hidden><form id="work-note-form" class="work-note-form" novalidate><div class="work-session-heading"><button type="button" class="work-session-task-link" id="work-session-title" data-action="edit"></button><span class="work-journal-slot" hidden></span></div><div id="work-finish-summary" class="work-note-date" hidden><span>Sonuç kaydı</span><time id="work-finish-date"></time></div><label class="work-note-field"><span id="work-session-note-label">Çalışma notu</span><textarea id="work-session-note" name="resultNote" rows="5" maxlength="10000" aria-describedby="work-note-error work-finish-error" placeholder="Çalışırken notlarını buraya yaz…"></textarea></label><p id="work-note-error" class="work-note-error" role="alert" hidden></p><div id="work-note-conflict" class="work-note-conflict" hidden><details><summary>Diğer penceredeki not</summary><p id="work-note-peer"></p></details><div class="work-note-resolution"><button type="button" data-action="work-draft-use-current">Güncel notu yükle</button><button type="button" data-action="work-draft-save-local">Bu notu kaydet</button></div></div><button type="button" class="work-note-retry" data-action="work-draft-retry" hidden>Yeniden dene</button><p id="work-finish-error" class="work-note-error" role="alert" hidden></p><div id="work-note-controls" class="work-session-controls"><button type="button" class="work-session-toggle" data-action="work-pause">${pauseIcon}<span>Duraklat</span></button><button type="button" class="work-session-finish" data-action="work-finish" aria-label="Oturumu bitir">${stopIcon}<span>Bitir</span></button></div><div id="work-finish-controls" class="work-session-controls work-finish-controls" hidden><button type="button" data-action="work-finish-cancel">Vazgeç</button><button type="submit" class="work-note-save">Kaydet ve bitir</button></div></form></section><div class="sidebar-journal-footer"><button type="button" class="sidebar-journal-history" data-action="work-session-history">Çalışma geçmişi</button><small id="sidebar-saved-count" title="Toplam kaydedilmiş çalışma sayısı">0 kayıt</small></div>`;
  sidebar.append(journal);
  sidebar.classList.add("has-work-journal");
  const panel = journal.querySelector("#work-session-panel");
  const noteArea = document.createElement("div");
  noteArea.className = "work-note-area";
  panel.before(noteArea);
  noteArea.append(panel);
  const runningSummary = document.createElement("div");
  runningSummary.id = "work-running-summary";
  runningSummary.className = "work-running-summary";
  runningSummary.hidden = true;
  runningSummary.innerHTML =
    '<span class="work-running-title"></span><span class="work-journal-slot" hidden></span><button type="button" data-action="work-running-open">Çalışmaya dön</button>';
  noteArea.prepend(runningSummary);
  const pausedList = document.createElement("ul");
  pausedList.id = "work-paused-list";
  pausedList.className = "work-paused-list";
  pausedList.setAttribute("aria-label", "Duraklatılan çalışmalar");
  pausedList.hidden = true;
  noteArea.append(pausedList);
  const pausedRows = new Map();
  const form = panel.querySelector("form");
  const note = panel.querySelector("#work-session-note");
  const forkButton = document.createElement("button");
  forkButton.type = "button";
  forkButton.className = "work-note-retry";
  forkButton.dataset.action = "work-draft-fork";
  forkButton.textContent = "Yeni çalışma notu olarak devam et";
  forkButton.hidden = true;
  panel.querySelector("#work-note-conflict").append(forkButton);
  const phase = journal.querySelector(".sidebar-journal-phase");
  const contextDialog = document.createElement("dialog");
  contextDialog.id = "work-session-context";
  contextDialog.className = "modal work-context-modal";
  contextDialog.setAttribute("aria-label", "Kayıt notları");
  root.append(contextDialog);
  const drafts = new Map();
  let editorState = null;
  let editorKey = null;
  let editorPinned = false;
  let finishDraft = null;
  let finishMessage = "";
  let finishing = false;
  let destroyed = false;
  let refreshing = false;
  let errorMessage = "";
  let observedRunningId;
  let runningNotificationQueued = false;
  let store;
  let layoutFrame = null;
  let fittedLayout = "";
  let storage = sessionStorage;
  try {
    if (!storage) storage = owner.localStorage;
  } catch {
    storage = {
      getItem() {
        throw new Error("Tarayıcı depolamasına erişilemiyor.");
      },
      setItem() {
        throw new Error("Tarayıcı depolamasına erişilemiyor.");
      },
    };
  }
  const find = (id) => getRecords().find((record) => record.id === id);
  const isOpen = (record) =>
    record?.type === "daily" && !CLOSED.has(record.status);
  const recorded = (record, sessionId) =>
    record?.workLog?.find((entry) => entry.id === sessionId);
  const isJournaled = (record, entry) =>
    Boolean(
      entry && entry.status !== "finished" && recorded(record, entry.sessionId),
    );

  function reportError(message) {
    const text = message instanceof Error ? message.message : String(message);
    if (text !== errorMessage) {
      try {
        onError(text);
      } catch {
        /* Feedback cannot undo a saved note. */
      }
    }
    errorMessage = text;
  }
  function acknowledge(state, entry) {
    if (
      !entry ||
      entry.sessionId !== state.sessionId ||
      entry.status === "finished"
    )
      return;
    const saved = draftText(entry);
    // onChange runs inside saveDraft; acknowledge our own write before return.
    if (saved === state.text) {
      state.expected = saved;
      state.dirty = false;
      state.conflict = false;
      state.remote = null;
      state.error = "";
      return;
    }
    if (saved !== state.expected) {
      if (
        state.dirty ||
        finishDraft?.sessionId === state.sessionId ||
        (editorState === state && document.activeElement === note)
      ) {
        state.dirty = true;
        state.conflict = true;
        state.remote = saved;
        state.error = peerMessage;
      } else {
        state.text = saved;
        state.expected = saved;
        state.error = "";
        state.conflict = false;
        state.remote = null;
      }
    }
  }
  function stateFor(entry) {
    const key = draftKey(entry);
    if (!drafts.has(key))
      drafts.set(key, {
        recordId: entry.recordId,
        sessionId: entry.sessionId,
        text: draftText(entry),
        expected: draftText(entry),
        dirty: false,
        conflict: false,
        remote: null,
        error: "",
        pausedExpanded: false,
        selectionStart: null,
        selectionEnd: null,
      });
    const state = drafts.get(key);
    acknowledge(state, entry);
    return state;
  }
  function rememberCaret() {
    if (!editorState || editorKey !== draftKey(editorState)) return;
    editorState.selectionStart = note.selectionStart;
    editorState.selectionEnd = note.selectionEnd;
    editorState.scrollTop = note.scrollTop;
  }
  function focusNote() {
    if (editorState && panel.dataset.collapsed === "true") {
      editorState.pausedExpanded = true;
      render();
    }
    if (owner.matchMedia?.("(max-width: 760px)").matches) {
      sidebar.classList.add("open");
      root.querySelector(".mobile-backdrop")?.classList.add("open");
      root
        .querySelector(".mobile-toggle")
        ?.setAttribute("aria-expanded", "true");
    }
    noteArea.scrollTop = 0;
    note.focus({ preventScroll: true });
    if (
      editorState?.selectionStart !== null &&
      editorState?.selectionStart !== undefined
    )
      note.setSelectionRange(
        editorState.selectionStart,
        editorState.selectionEnd,
      );
  }
  function settleJournaled(record) {
    const entry = store.get(record.id);
    if (!isJournaled(record, entry)) return true;
    const log = recorded(record, entry.sessionId);
    if (
      draftText(entry).trim() &&
      draftText(entry).trim() !== String(log.note || "").trim()
    ) {
      editorState = stateFor(entry);
      editorPinned = true;
      editorState.dirty = true;
      editorState.conflict = true;
      editorState.remote = log.note || "";
      editorState.error =
        "Bu çalışma kaydedilmiş; farklı çalışma notun burada korunuyor.";
      render();
      return false;
    }
    return store.finish(record.id, entry.sessionId, {
      expectedDraft: draftText(entry),
    });
  }
  function buttonState(record) {
    const entry = store?.get(record.id);
    const journaled = isJournaled(record, entry);
    const running = entry?.status === "running" && !journaled;
    const paused = entry?.status === "paused" && !journaled;
    return {
      entry,
      running,
      paused,
      disabled: !isOpen(record) || store?.readOnly || journaled || finishing,
      symbol: running ? "pause" : paused ? "resume" : "play",
      label: running
        ? "çalışmayı duraklat"
        : paused
          ? "çalışmaya devam et"
          : "çalışmaya başla",
      hint: journaled
        ? "Sonuç kaydedildi. Çalışmayı kapatmak için yeniden dene."
        : !isOpen(record)
          ? "Bu kayıt kapalı. Çalışmak için önce durumunu güncelle."
          : store?.readOnly
            ? "Çalışma notu kaydedilemiyor."
            : running
              ? "Çalışmayı duraklat"
              : paused
                ? "Duraklatıldı · Devam et"
                : "Çalışmaya başla",
    };
  }
  function button(record) {
    if (record.type !== "daily") return "";
    const state = buttonState(record);
    return `<button type="button" class="work-start${state.running ? " is-running" : ""}${state.paused ? " is-paused" : ""}" data-action="work-start" data-id="${escapeHtml(record.id)}" data-phase="${escapeHtml(state.entry?.status || "idle")}" aria-label="${escapeHtml(record.title)}: ${state.label}" aria-pressed="${state.running}" title="${escapeHtml(state.hint)}" ${state.disabled ? "disabled" : ""}>${workIcons[state.symbol]}</button>`;
  }
  function getRunningRecordId() {
    if (destroyed || !store) return null;
    const current = store.current;
    const record = current ? find(current.recordId) : null;
    return current?.status === "running" &&
      isOpen(record) &&
      !isJournaled(record, current)
      ? record.id
      : null;
  }
  // Writes only what changed: a note being typed in another window saves
  // every half second, and rewriting every row's button each time made
  // typing stutter.
  const setAttr = (element, name, value) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  function updateButtons() {
    const byId = new Map(getRecords().map((record) => [record.id, record]));
    for (const control of root.querySelectorAll(".work-start[data-id]")) {
      const record = byId.get(control.dataset.id);
      if (!record) continue;
      const state = buttonState(record);
      const hidden = record.type !== "daily";
      if (control.hidden !== hidden) control.hidden = hidden;
      const phase = state.entry?.status || "idle";
      if (
        control.dataset.phase !== phase ||
        control.firstElementChild?.dataset.workSymbol !== state.symbol
      )
        control.innerHTML = workIcons[state.symbol];
      setAttr(control, "data-phase", phase);
      if (control.classList.contains("is-running") !== state.running)
        control.classList.toggle("is-running", state.running);
      if (control.classList.contains("is-paused") !== state.paused)
        control.classList.toggle("is-paused", state.paused);
      setAttr(control, "aria-label", `${record.title}: ${state.label}`);
      setAttr(control, "aria-pressed", String(state.running));
      setAttr(control, "title", state.hint);
      if (control.disabled !== Boolean(state.disabled))
        control.disabled = Boolean(state.disabled);
    }
    const runningId = getRunningRecordId();
    for (const row of root.querySelectorAll(".focus-row[data-id]")) {
      const working = row.dataset.id === runningId;
      if (row.classList.contains("is-working") !== working)
        row.classList.toggle("is-working", working);
      if (working) setAttr(row, "data-work-state", "running");
      else if (row.hasAttribute("data-work-state"))
        row.removeAttribute("data-work-state");
    }
    if (observedRunningId === undefined) observedRunningId = runningId;
    else if (observedRunningId !== runningId) {
      observedRunningId = runningId;
      if (!runningNotificationQueued) {
        runningNotificationQueued = true;
        owner.queueMicrotask(() => {
          runningNotificationQueued = false;
          if (!destroyed) {
            try {
              onRunningChange(getRunningRecordId());
            } catch {
              /* Keep saved state. */
            }
          }
        });
      }
    }
  }
  function reserveSpace() {
    document.body.removeAttribute("data-work-session");
    document.documentElement.style.removeProperty("--work-session-height");
    journal.dataset.phase = panel.hidden ? "idle" : panel.dataset.phase;
    journal.dataset.expanded = String(
      !panel.hidden && panel.dataset.collapsed !== "true",
    );
    const layout = JSON.stringify([
      panel.hidden,
      panel.dataset.mode,
      panel.dataset.collapsed,
      editorKey,
      form.textContent,
      pausedList.textContent,
      runningSummary.hidden,
      runningSummary.textContent,
    ]);
    if (layout !== fittedLayout) {
      fittedLayout = layout;
      // Mode changes must fit before controls can be activated, even before RAF.
      fitNoteArea();
    }
    scheduleNoteFit();
  }
  function scheduleNoteFit() {
    if (destroyed || layoutFrame !== null) return;
    layoutFrame = owner.requestAnimationFrame(() => {
      layoutFrame = null;
      if (!destroyed) fitNoteArea();
    });
  }
  function fitNoteArea() {
    const rows = [...pausedList.children];
    for (const row of rows) row.hidden = false;
    pausedList.hidden = !rows.length;
    const extra =
      pausedList.getBoundingClientRect().height +
      (runningSummary.hidden
        ? 0
        : runningSummary.getBoundingClientRect().height);
    journal.style.setProperty("--work-extra-space", `${extra}px`);
    const label = panel.querySelector("#work-session-note-label");
    const summary = panel.querySelector("#work-finish-summary");
    const gap = parseFloat(owner.getComputedStyle(form).rowGap) || 0;
    const finishSpace = finishDraft
      ? summary.getBoundingClientRect().height +
        label.getBoundingClientRect().height +
        gap * 2
      : 0;
    journal.style.setProperty("--work-finish-space", `${finishSpace}px`);
    const hasNote = !panel.hidden && !note.closest(".work-note-field").hidden;
    const oldScroll = note.scrollTop;
    if (hasNote) note.style.height = "40px";
    const area = noteArea.getBoundingClientRect();
    const sidebarBounds = sidebar.getBoundingClientRect();
    const paddingBottom =
      parseFloat(owner.getComputedStyle(sidebar).paddingBottom) || 0;
    const cardChrome = journal.getBoundingClientRect().height - area.height;
    const cardGap = parseFloat(owner.getComputedStyle(journal).rowGap) || 0;
    const compactCapacity =
      sidebarBounds.bottom -
      paddingBottom -
      (nav?.getBoundingClientRect().bottom ?? sidebarBounds.top) -
      cardGap -
      cardChrome;
    // A compact card hugs its content. Its current height is not the capacity
    // available for restoring rows hidden by an earlier expanded-note fit.
    const available = Math.max(0, hasNote ? area.height : compactCapacity);
    const contentHeight = () => {
      const top = noteArea.getBoundingClientRect().top;
      let bottom = top;
      for (const child of noteArea.children)
        if (!child.hidden)
          bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
      return Math.max(0, bottom - top);
    };
    // Keep complete rows and all actions visible. On tiny screens the oldest
    // extra rows wait in the saved session list instead of creating a scrollbar.
    while (rows.some((row) => !row.hidden) && contentHeight() > available + 1) {
      const last = [...rows].reverse().find((row) => !row.hidden);
      last.hidden = true;
      pausedList.hidden = rows.every((row) => row.hidden);
    }
    if (hasNote) {
      const chrome = contentHeight() - note.getBoundingClientRect().height;
      const height = Math.max(24, Math.min(250, available - chrome));
      note.style.height = `${height}px`;
      journal.dataset.tight = String(height < 40);
      note.scrollTop = oldScroll;
    } else journal.dataset.tight = "false";
    noteArea.scrollTop = 0;
    const focusedRow = document.activeElement?.closest?.(".work-paused-row");
    if (focusedRow?.hidden)
      (
        pausedList.querySelector(
          ".work-paused-row:not([hidden]) .work-paused-title",
        ) || panel.querySelector("#work-session-title")
      )?.focus({ preventScroll: true });
  }
  // The record's work journal is reachable from every open or paused work.
  const journalMarkup = new WeakMap();
  function setJournal(slot, record) {
    let html = "";
    try {
      html = record ? journalButton(record) || "" : "";
    } catch {
      html = "";
    }
    if (journalMarkup.get(slot) === html) return;
    const hadFocus = slot.contains(document.activeElement);
    slot.innerHTML = html;
    slot.hidden = !html;
    journalMarkup.set(slot, html);
    if (hadFocus) slot.querySelector("button")?.focus({ preventScroll: true });
  }
  function renderPausedWork(state) {
    const paused = store.snapshot.entries
      .filter(
        (entry) =>
          entry.status === "paused" &&
          isOpen(find(entry.recordId)) &&
          !isJournaled(find(entry.recordId), entry),
      )
      .sort(
        (first, second) =>
          second.updatedAt - first.updatedAt ||
          first.recordId.localeCompare(second.recordId),
      );
    const selectedKey = state ? draftKey(state) : null;
    const selectedPaused = paused.some(
      (entry) => draftKey(entry) === selectedKey,
    );
    const visible = paused
      .filter((entry) => draftKey(entry) !== selectedKey)
      .slice(0, selectedPaused ? 2 : 3);
    const keys = new Set(visible.map(draftKey));
    for (const [key, row] of pausedRows) {
      if (!keys.has(key)) {
        row.remove();
        pausedRows.delete(key);
      }
    }
    const focused = document.activeElement;
    visible.forEach((entry, index) => {
      const key = draftKey(entry);
      let row = pausedRows.get(key);
      if (!row) {
        row = document.createElement("li");
        row.className = "work-paused-row";
        row.dataset.recordId = entry.recordId;
        row.dataset.sessionId = entry.sessionId;
        row.innerHTML = `<button type="button" class="work-paused-title" data-action="work-paused-open"></button><span class="work-journal-slot" hidden></span><button type="button" class="work-paused-resume" data-action="work-paused-resume">${resumeIcon}</button>`;
        pausedRows.set(key, row);
      }
      const record = find(entry.recordId);
      for (const control of row.querySelectorAll(":scope > button")) {
        control.dataset.id = entry.recordId;
        control.dataset.sessionId = entry.sessionId;
        control.disabled = finishing;
      }
      setJournal(row.querySelector(".work-journal-slot"), record);
      const title = row.querySelector(".work-paused-title");
      title.textContent = record.title;
      title.title = record.title;
      title.setAttribute("aria-label", `${record.title}: çalışma notunu aç`);
      row
        .querySelector(".work-paused-resume")
        .setAttribute("aria-label", `${record.title}: çalışmaya devam et`);
      if (pausedList.children[index] !== row)
        pausedList.insertBefore(row, pausedList.children[index] || null);
    });
    if (
      focused &&
      pausedList.contains(focused) &&
      document.activeElement !== focused
    )
      focused.focus({ preventScroll: true });
    pausedList.hidden = !visible.length;
    const current = store.current;
    const currentRecord = current ? find(current.recordId) : null;
    runningSummary.hidden = !(
      current?.status === "running" &&
      isOpen(currentRecord) &&
      !isJournaled(currentRecord, current) &&
      (!state || draftKey(current) !== selectedKey)
    );
    if (!runningSummary.hidden) {
      runningSummary.querySelector(".work-running-title").textContent =
        currentRecord.title;
      setJournal(
        runningSummary.querySelector(".work-journal-slot"),
        currentRecord,
      );
      const control = runningSummary.querySelector(
        '[data-action="work-running-open"]',
      );
      control.dataset.id = current.recordId;
      control.dataset.sessionId = current.sessionId;
      control.disabled = finishing;
    }
  }
  function render() {
    if (destroyed || !store) return;
    const count = getRecords().reduce(
      (total, record) =>
        total +
        (record.type === "daily" && Array.isArray(record.workLog)
          ? record.workLog.length
          : 0),
      0,
    );
    const countLabel = `${count} kayıt`;
    const countControl = journal.querySelector("#sidebar-saved-count");
    if (countControl.textContent !== countLabel)
      countControl.textContent = countLabel;
    if (
      editorState &&
      document.activeElement === note &&
      store.current?.sessionId !== editorState.sessionId
    )
      editorPinned = true;
    let entry;
    if (finishDraft) entry = store.get(finishDraft.recordId);
    else if (editorState?.dirty || editorPinned)
      entry = store.get(editorState.recordId);
    else entry = store.current;
    if (finishDraft || editorState?.dirty || editorPinned) {
      if (entry?.sessionId === editorState?.sessionId)
        acknowledge(editorState, entry);
      else if (editorState) {
        editorState.conflict = true;
        editorState.dirty = true;
        editorState.remote = draftText(entry);
        editorState.error =
          "Bu çalışma başka bir pencerede değişti. Yazdıkların burada korunuyor.";
      }
    } else if (entry) editorState = stateFor(entry);
    else editorState = null;
    const state = editorState;
    const record = state ? find(state.recordId) : null;
    const savedLog = state ? recorded(record, state.sessionId) : null;
    const sameSession = entry?.sessionId === state?.sessionId;
    const retired = savedLog && (!sameSession || entry?.status === "finished");
    renderPausedWork(state);
    if (
      savedLog &&
      state.text.trim() &&
      state.text.trim() !== String(savedLog.note || "").trim()
    ) {
      state.dirty = true;
      state.conflict = true;
      state.remote = savedLog.note || "";
      state.error =
        "Bu çalışma başka bir pencerede kaydedildi. Yazdıkların burada korunuyor.";
    }
    if (retired && state && !finishing) {
      if (
        !state.dirty &&
        state.text.trim() === String(savedLog.note || "").trim()
      ) {
        drafts.delete(draftKey(state));
        finishDraft = null;
        editorState = null;
        editorPinned = false;
        render();
        return;
      }
      state.dirty = true;
      state.conflict = true;
      state.remote = savedLog.note || "";
      state.error =
        "Bu çalışma başka bir pencerede kaydedildi. Yazdıkların burada korunuyor.";
    }
    if (
      !state ||
      (!isOpen(record) && !state.dirty) ||
      (savedLog && !finishDraft && !state.dirty)
    ) {
      panel.hidden = true;
      phase.hidden = true;
      editorKey = null;
      reserveSpace();
      updateButtons();
      return;
    }
    panel.hidden = false;
    const status =
      sameSession && entry.status === "running" ? "running" : "paused";
    if (status === "paused" && document.activeElement === note)
      state.pausedExpanded = true;
    const collapsed =
      status === "paused" &&
      !finishDraft &&
      !state.pausedExpanded &&
      !state.error &&
      !state.conflict;
    panel.dataset.phase = status;
    panel.dataset.mode = finishDraft ? "finish" : "note";
    panel.dataset.collapsed = String(collapsed);
    note.closest(".work-note-field").hidden = collapsed;
    phase.hidden = false;
    phase.dataset.phase = status;
    phase.textContent = status === "running" ? "Çalışıyor" : "Duraklatıldı";
    form.id = finishDraft ? "work-finish-form" : "work-note-form";
    const title = panel.querySelector("#work-session-title");
    setJournal(
      panel.querySelector(".work-session-heading > .work-journal-slot"),
      finishDraft ? null : record,
    );
    title.textContent = record?.title || "Çalışma notu";
    title.title = record?.title || "Çalışma notu";
    title.dataset.id = state.recordId;
    title.dataset.action = finishDraft ? "edit" : "work-note-open";
    if (!finishDraft) {
      title.setAttribute("aria-expanded", String(!collapsed));
      title.setAttribute("aria-controls", "work-session-note");
    } else {
      title.removeAttribute("aria-expanded");
      title.removeAttribute("aria-controls");
    }
    panel.querySelector("#work-session-note-label").textContent = finishDraft
      ? "Sonuç (isteğe bağlı)"
      : "Çalışma notu";
    panel.querySelector("#work-session-note-label").hidden = !finishDraft;
    note.setAttribute(
      "aria-label",
      finishDraft ? "Sonuç (isteğe bağlı)" : "Çalışma notu",
    );
    note.required = false;
    note.placeholder = finishDraft
      ? "İstersen kısa bir sonuç yaz…"
      : "Çalışırken notlarını buraya yaz…";
    const nextKey = draftKey(state);
    if (editorKey !== nextKey || note.value !== state.text) {
      const focused = document.activeElement === note;
      const start =
        editorKey === nextKey && focused
          ? note.selectionStart
          : state.selectionStart;
      const end =
        editorKey === nextKey && focused
          ? note.selectionEnd
          : state.selectionEnd;
      const scrollTop =
        editorKey === nextKey ? note.scrollTop : state.scrollTop || 0;
      note.value = state.text;
      if (start !== null && start !== undefined)
        note.setSelectionRange(
          Math.min(start, note.value.length),
          Math.min(end ?? start, note.value.length),
        );
      note.scrollTop = scrollTop;
      editorKey = nextKey;
    }
    note.disabled = finishing;
    note.readOnly = Boolean(savedLog);
    const draftError = panel.querySelector("#work-note-error");
    draftError.textContent = state.error;
    draftError.hidden = !state.error;
    panel.querySelector("#work-note-conflict").hidden = !state.conflict;
    panel.querySelector("#work-note-peer").textContent =
      state.remote || "Not boş.";
    panel.querySelector(".work-note-resolution").hidden = Boolean(
      savedLog &&
      sameSession &&
      entry?.status !== "finished" &&
      draftText(entry) === state.text,
    );
    forkButton.hidden =
      !savedLog || !sameSession || entry?.status === "finished";
    forkButton.disabled = finishing;
    panel.querySelector('[data-action="work-draft-save-local"]').hidden =
      Boolean(savedLog);
    panel.querySelector('[data-action="work-draft-save-local"]').disabled =
      finishing ||
      !sameSession ||
      entry?.status === "finished" ||
      Boolean(savedLog);
    panel.querySelector('[data-action="work-draft-use-current"]').disabled =
      finishing;
    panel.querySelector('[data-action="work-draft-retry"]').hidden =
      !state.dirty || state.conflict;
    panel.querySelector('[data-action="work-draft-retry"]').disabled =
      finishing;
    panel.querySelector("#work-note-controls").hidden = Boolean(finishDraft);
    panel.querySelector("#work-finish-controls").hidden = !finishDraft;
    panel.querySelector("#work-finish-summary").hidden = !finishDraft;
    const finishError = panel.querySelector("#work-finish-error");
    finishError.textContent = finishMessage;
    finishError.hidden = !finishMessage;
    const toggle = panel.querySelector(".work-session-toggle");
    toggle.dataset.action = status === "running" ? "work-pause" : "work-resume";
    toggle.dataset.id = state.recordId;
    toggle.innerHTML = `${status === "running" ? pauseIcon : resumeIcon}<span>${status === "running" ? "Duraklat" : "Devam et"}</span>`;
    toggle.disabled =
      finishing || !sameSession || !isOpen(record) || Boolean(savedLog);
    const finish = panel.querySelector('[data-action="work-finish"]');
    finish.dataset.id = state.recordId;
    finish.disabled =
      finishing ||
      !sameSession ||
      !isOpen(record) ||
      Boolean(savedLog) ||
      store.current?.recordId !== state.recordId;
    panel.querySelector('[data-action="work-finish-cancel"]').disabled =
      finishing;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled =
      finishing ||
      state.conflict ||
      (!savedLog && (!sameSession || entry?.status !== "paused"));
    submit.textContent = finishing ? "Kaydediliyor…" : "Kaydet ve bitir";
    form.setAttribute("aria-busy", String(finishing));
    if (finishDraft) {
      const date = panel.querySelector("#work-finish-date");
      date.dateTime = finishDraft.date;
      date.textContent = new Date(
        `${finishDraft.date}T12:00:00`,
      ).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    reserveSpace();
    updateButtons();
  }
  store = createWorkSessionStore({
    storage,
    key: KEY,
    onChange: render,
    onError: reportError,
  });
  function flushState(state, { force = false } = {}) {
    if (!state?.dirty) return true;
    store.synchronize();
    const latest = store.get(state.recordId);
    if (
      !latest ||
      latest.sessionId !== state.sessionId ||
      latest.status === "finished" ||
      recorded(find(state.recordId), state.sessionId)
    ) {
      state.conflict = true;
      state.remote = draftText(latest);
      state.error =
        "Bu çalışma artık değiştirilemiyor. Yazdıkların burada korunuyor.";
      render();
      return false;
    }
    if (force) {
      state.expected = draftText(latest);
      state.conflict = false;
      state.remote = null;
    }
    if (state.conflict) {
      render();
      return false;
    }
    const saved = store.saveDraft(
      state.recordId,
      state.sessionId,
      state.text,
      state.expected,
    );
    const current = store.get(state.recordId);
    if (
      saved &&
      current?.sessionId === state.sessionId &&
      draftText(current) === state.text
    ) {
      state.expected = state.text;
      state.dirty = false;
      state.conflict = false;
      state.remote = null;
      state.error = "";
      errorMessage = "";
    } else {
      acknowledge(state, current);
      if (!state.conflict)
        state.error =
          "Not kaydedilemedi. Yazdıkların burada korunuyor; yeniden dene.";
    }
    render();
    return saved;
  }
  function flushDrafts({ allowDurable = false } = {}) {
    for (const state of drafts.values())
      if (state.dirty) {
        const entry = store.get(state.recordId);
        // Reading or backing up can leave an already durable recovery unresolved.
        if (
          allowDurable &&
          entry?.sessionId === state.sessionId &&
          entry.status !== "finished" &&
          draftText(entry) === state.text
        )
          continue;
        if (flushState(state)) continue;
        editorState = state;
        render();
        focusNote();
        return false;
      }
    return true;
  }
  function onNoteInput(event) {
    if (event.target !== note || !editorState || finishing) return;
    const state = editorState;
    state.text = note.value;
    state.dirty = state.text !== state.expected;
    rememberCaret();
    finishMessage = "";
    note.setCustomValidity("");
    if (!state.dirty) {
      state.error = "";
      render();
    } else flushState(state);
  }
  function useCurrentDraft() {
    const state = editorState;
    if (!state || finishing) return;
    store.synchronize();
    const latest = store.get(state.recordId);
    if (recorded(find(state.recordId), state.sessionId)) {
      const log = recorded(find(state.recordId), state.sessionId);
      if (
        latest?.sessionId === state.sessionId &&
        latest.status !== "finished" &&
        draftText(latest).trim() !== String(log.note || "").trim()
      ) {
        state.text = draftText(latest);
        state.expected = state.text;
        finishDraft = null;
        finishMessage = "";
        note.setCustomValidity("");
        render();
        focusNote();
        return;
      }
      if (
        latest?.sessionId === state.sessionId &&
        latest.status !== "finished" &&
        !store.finish(state.recordId, state.sessionId, {
          expectedDraft: draftText(latest),
        })
      ) {
        state.error =
          "Kaydedilmiş sonuç yüklenemedi. Notun korunuyor; yeniden dene.";
        render();
        return;
      }
      drafts.delete(draftKey(state));
      editorState = null;
      editorPinned = false;
      finishDraft = null;
      finishMessage = "";
      render();
      return;
    }
    state.dirty = false;
    state.conflict = false;
    state.error = "";
    state.remote = null;
    if (latest?.sessionId === state.sessionId && latest.status !== "finished") {
      state.text = draftText(latest);
      state.expected = state.text;
    } else {
      finishDraft = null;
      finishMessage = "";
      editorState = null;
      editorPinned = false;
    }
    render();
    if (!panel.hidden) focusNote();
  }
  function refresh() {
    if (destroyed || refreshing) return;
    refreshing = true;
    try {
      store.synchronize();
      for (const entry of store.snapshot.entries) {
        const record = find(entry.recordId);
        const protectedDraft = drafts.get(draftKey(entry));
        if (
          record?.type === "daily" &&
          isJournaled(record, entry) &&
          finishDraft?.sessionId !== entry.sessionId &&
          !protectedDraft?.dirty
        )
          settleJournaled(record);
      }
      store.reconcile(
        getRecords()
          .filter(isOpen)
          .map((record) => record.id),
      );
      render();
    } finally {
      refreshing = false;
    }
  }
  function forkWorkingNote() {
    const state = editorState;
    if (!state || finishing) return;
    store.synchronize();
    const latest = store.get(state.recordId);
    if (
      !latest ||
      latest.sessionId !== state.sessionId ||
      latest.status === "finished" ||
      !recorded(find(state.recordId), state.sessionId)
    ) {
      finishError(
        "Bu çalışma değişti. Notun korunuyor; güncel kaydı kontrol et.",
      );
      return;
    }
    if (
      draftText(latest) !== state.text &&
      !store.saveDraft(
        state.recordId,
        state.sessionId,
        state.text,
        state.expected,
      )
    ) {
      finishError("Not kaydedilemedi. Yazdıkların korunuyor; yeniden dene.");
      return;
    }
    if (!store.forkDraft(state.recordId, state.sessionId, state.text)) {
      finishError(
        "Yeni çalışma notu açılamadı. Notun korunuyor; yeniden dene.",
      );
      return;
    }
    drafts.delete(draftKey(state));
    finishDraft = null;
    finishMessage = "";
    editorState = stateFor(store.get(state.recordId));
    editorPinned = true;
    render();
    focusNote();
  }
  function finishError(message) {
    finishMessage = message;
    reportError(message);
    render();
  }
  function cancelFinish() {
    if (finishing) return;
    finishDraft = null;
    finishMessage = "";
    note.setCustomValidity("");
    if (editorState) editorState.pausedExpanded = false;
    if (document.activeElement === note) note.blur();
    render();
    if (!panel.hidden) {
      if (panel.dataset.collapsed === "true")
        panel
          .querySelector("#work-session-title")
          .focus({ preventScroll: true });
      else focusNote();
    }
  }
  function beginFinish(id) {
    if (finishing || finishDraft || !isOpen(find(id)) || !flushDrafts()) return;
    store.synchronize();
    if (!settleJournaled(find(id))) return;
    const selected = store.current;
    if (selected?.recordId !== id || !store.pause(id, selected.sessionId))
      return;
    const paused = store.current;
    if (
      paused?.recordId !== id ||
      paused.sessionId !== selected.sessionId ||
      paused.status !== "paused"
    )
      return;
    editorState = stateFor(paused);
    const ended = new Date();
    finishDraft = {
      recordId: id,
      sessionId: paused.sessionId,
      endedAt: ended.toISOString(),
      date: localDate(ended),
      durationMs: paused.elapsedMs,
    };
    finishMessage = "";
    render();
    focusNote();
  }
  async function completeFinish(event) {
    if (event.target !== form) return;
    event.preventDefault();
    if (finishing || !finishDraft || !editorState) return;
    const pending = { ...finishDraft };
    const state = editorState;
    const rawNote = state.text;
    const result = rawNote.trim();
    if (!flushState(state)) return;
    store.synchronize();
    const record = find(pending.recordId);
    const existingLog = recorded(record, pending.sessionId);
    const latest = store.get(pending.recordId);
    if (
      !existingLog &&
      (!isOpen(record) ||
        latest?.sessionId !== pending.sessionId ||
        latest.status !== "paused" ||
        latest.elapsedMs !== pending.durationMs ||
        draftText(latest) !== rawNote ||
        store.current?.recordId !== pending.recordId)
    ) {
      finishError(
        "Bu çalışma başka bir pencerede değişti. Notun korunuyor; güncel çalışmayı kontrol et.",
      );
      return;
    }
    finishing = true;
    finishMessage = "";
    render();
    try {
      const saved =
        !result ||
        Boolean(existingLog) ||
        (typeof onCompleteSession === "function" &&
          (await onCompleteSession(pending.recordId, {
            ...pending,
            note: result,
          })) === true);
      if (!saved) {
        finishError(
          "Sonuç kaydedilemedi. Notun korunuyor; yeniden deneyebilirsin.",
        );
        return;
      }
      if (
        !store.finish(pending.recordId, pending.sessionId, {
          expectedDraft: rawNote,
        })
      ) {
        finishError(
          result || existingLog
            ? "Sonuç kaydedildi; çalışma kapatılamadı. Yeniden dene."
            : "Çalışma kapatılamadı. Yeniden dene.",
        );
        return;
      }
      drafts.delete(draftKey(state));
      editorState = null;
      editorPinned = false;
      finishDraft = null;
      finishMessage = "";
      try {
        onMessage(
          result ? "Sonuç çalışma geçmişine kaydedildi." : "Çalışma bitirildi.",
        );
      } catch {
        /* Already committed. */
      }
    } catch (error) {
      finishError(
        error instanceof Error
          ? error.message
          : "Sonuç kaydedilemedi. Notun korunuyor; yeniden dene.",
      );
    } finally {
      finishing = false;
      render();
    }
  }
  function openContext() {
    const entry = store.current;
    const record = entry ? find(entry.recordId) : null;
    if (!record) return;
    contextDialog.innerHTML = `<div class="work-context-shell"><div class="modal-header"><h2>Kayıt notları</h2><button type="button" class="close-modal" data-action="work-context-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body work-context-body"><p class="work-context-title">${escapeHtml(record.title)}</p><p class="work-record-notes">${escapeHtml(record.description || "Bu iş için kayıt notu eklenmemiş.")}</p></div><div class="modal-footer"><button type="button" class="btn primary" data-action="work-context-close">Tamam</button></div></div>`;
    if (!contextDialog.open) contextDialog.showModal();
  }
  function selectWorkNote(
    id,
    sessionId,
    { resume = false, running = false } = {},
  ) {
    if (finishing) return;
    if (finishDraft) {
      finishError("Önce bu sonucu kaydet ya da Vazgeç ile çalışma notuna dön.");
      return;
    }
    rememberCaret();
    store.synchronize();
    if (!flushDrafts({ allowDurable: !resume })) return;
    store.synchronize();
    const entry = store.get(id);
    const record = find(id);
    if (
      !entry ||
      entry.sessionId !== sessionId ||
      entry.status !== (running ? "running" : "paused") ||
      !isOpen(record) ||
      isJournaled(record, entry)
    ) {
      reportError(
        "Bu çalışma başka bir pencerede değişti. Güncel notları kontrol et.",
      );
      render();
      return;
    }
    if (resume) {
      editorPinned = false;
      if (!store.start(id, { trackTime: false })) {
        render();
        return;
      }
      editorState = stateFor(store.current);
    } else editorState = stateFor(entry);
    editorPinned = true;
    editorState.pausedExpanded = true;
    finishMessage = "";
    render();
    focusNote();
  }
  function toggleWorkNote() {
    if (!editorState || panel.hidden || finishing || finishDraft) return;
    rememberCaret();
    const collapse =
      panel.dataset.phase === "paused" && panel.dataset.collapsed !== "true";
    // Keep failed or conflicting drafts and their recovery controls visible.
    // This visual toggle must never flush another job's pending note.
    if (
      collapse &&
      (editorState.dirty || editorState.error || editorState.conflict)
    ) {
      focusNote();
      return;
    }
    editorState.pausedExpanded = !collapse;
    if (collapse && document.activeElement === note) note.blur();
    render();
    if (panel.dataset.collapsed === "true")
      panel.querySelector("#work-session-title").focus({ preventScroll: true });
    else focusNote();
  }
  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !root.contains(control)) return;
    const { action, id } = control.dataset;
    if (
      ![
        "work-start",
        "work-pause",
        "work-resume",
        "work-finish",
        "work-finish-cancel",
        "work-details",
        "work-context-close",
        "work-session-history",
        "work-draft-retry",
        "work-draft-use-current",
        "work-draft-save-local",
        "work-draft-fork",
        "work-note-open",
        "work-paused-open",
        "work-paused-resume",
        "work-running-open",
      ].includes(action)
    )
      return;
    event.preventDefault();
    if (
      action === "work-paused-open" ||
      action === "work-paused-resume" ||
      action === "work-running-open"
    ) {
      selectWorkNote(id, control.dataset.sessionId, {
        resume: action === "work-paused-resume",
        running: action === "work-running-open",
      });
      return;
    }
    if (action === "work-note-open") {
      toggleWorkNote();
      return;
    }
    if (action === "work-finish-cancel") {
      cancelFinish();
      return;
    }
    if (action === "work-draft-use-current") {
      useCurrentDraft();
      return;
    }
    if (action === "work-draft-fork") {
      forkWorkingNote();
      return;
    }
    if (action === "work-draft-retry" || action === "work-draft-save-local") {
      if (editorState)
        flushState(editorState, { force: action === "work-draft-save-local" });
      return;
    }
    if (action === "work-context-close") {
      contextDialog.close();
      return;
    }
    if (action === "work-session-history") {
      try {
        onHistory();
      } catch (error) {
        reportError(error);
      }
      return;
    }
    if (action === "work-details") {
      openContext();
      return;
    }
    if (action === "work-finish") {
      beginFinish(id);
      return;
    }
    if (finishing || finishDraft || !isOpen(find(id)) || !flushDrafts()) return;
    store.synchronize();
    if (!settleJournaled(find(id))) return;
    if (
      action === "work-pause" ||
      (action === "work-start" &&
        store.current?.recordId === id &&
        store.current.status === "running")
    ) {
      if (editorState) editorState.pausedExpanded = false;
      if (document.activeElement === note) note.blur();
      store.pause(id, store.current?.sessionId);
      render();
      return;
    }
    editorPinned = false;
    if (store.start(id, { trackTime: false })) {
      editorState = stateFor(store.current);
      editorPinned = true;
      render();
      focusNote();
    }
  }
  function onStorage(event) {
    if (
      event.key === KEY ||
      event.key === workspaceStorageKey ||
      event.key === null
    )
      refresh();
  }
  function onNoteKeydown(event) {
    if (
      finishDraft &&
      !finishing &&
      !event.defaultPrevented &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();
      cancelFinish();
      return;
    }
    if (
      event.target === note &&
      !finishDraft &&
      !finishing &&
      !event.defaultPrevented &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  function onWorkShortcut(event) {
    const pause = event.key.toLowerCase() === "p";
    const finish = event.key === "Enter";
    if (
      destroyed ||
      panel.hidden ||
      !editorState ||
      finishing ||
      event.defaultPrevented ||
      !event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing ||
      event.repeat ||
      event.keyCode === 229 ||
      (!pause && !finish)
    )
      return;
    if (document.querySelector("dialog:modal, :popover-open")) return;
    const target = event.target;
    if (target.closest?.("dialog, [popover]")) return;
    const targetForm = target.closest?.("form");
    if (targetForm && targetForm !== form) return;
    const control = pause
      ? panel.querySelector(".work-session-toggle")
      : finishDraft
        ? form.querySelector('[type="submit"]')
        : panel.querySelector('[data-action="work-finish"]');
    if (
      !control ||
      control.matches(":disabled") ||
      control.closest("[hidden]") ||
      !control.getClientRects().length
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (finishDraft && finish) {
      form.requestSubmit(control);
      return;
    }
    const action = control.dataset.action;
    control.click();
    if (pause) {
      const next = panel.querySelector(".work-session-toggle");
      if (
        action === "work-pause" &&
        panel.dataset.collapsed === "true" &&
        next?.dataset.action === "work-resume" &&
        !next.disabled
      )
        next.focus({ preventScroll: true });
      else if (!panel.hidden && document.activeElement !== note) focusNote();
    }
  }
  function onWheel(event) {
    event.stopPropagation();
  }
  function onNoteAreaClick(event) {
    if (panel.hidden || finishing || finishDraft || !editorState) return;
    if (
      event.target.closest?.(
        ".sidebar-journal-footer, .work-paused-list, .work-running-summary, .work-note-field",
      )
    )
      return;
    if (
      event.target.closest?.(
        'button, a, input, select, textarea, summary, [data-action], [role="button"], [role="link"]',
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    toggleWorkNote();
  }
  function onNavWheel(event) {
    if (nav.scrollHeight > nav.clientHeight) event.stopPropagation();
  }
  function onBeforeUnload(event) {
    if (
      [...drafts.values()].some((state) => {
        const saved = store.get(state.recordId);
        return (
          state.dirty &&
          (saved?.sessionId !== state.sessionId ||
            draftText(saved) !== state.text)
        );
      })
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  function destroy() {
    if (destroyed) return;
    for (const state of drafts.values())
      if (state.dirty && !state.conflict) flushState(state);
    store.stopOwner();
    destroyed = true;
    for (const row of root.querySelectorAll(".focus-row.is-working")) {
      row.classList.remove("is-working");
      row.removeAttribute("data-work-state");
    }
    root.removeEventListener("click", onClick);
    form.removeEventListener("submit", completeFinish);
    form.removeEventListener("keydown", onNoteKeydown);
    journal.removeEventListener("click", onNoteAreaClick);
    noteArea.removeEventListener("toggle", scheduleNoteFit, true);
    note.removeEventListener("input", onNoteInput);
    note.removeEventListener("select", rememberCaret);
    note.removeEventListener("wheel", onWheel);
    noteArea.removeEventListener("wheel", onWheel);
    nav?.removeEventListener("wheel", onNavWheel);
    owner.removeEventListener("storage", onStorage);
    owner.removeEventListener("keydown", onWorkShortcut);
    owner.removeEventListener("focus", refresh);
    owner.removeEventListener("resize", reserveSpace);
    owner.removeEventListener("beforeunload", onBeforeUnload);
    owner.removeEventListener("pagehide", destroy);
    if (layoutFrame !== null) owner.cancelAnimationFrame(layoutFrame);
    layoutObserver?.disconnect();
    contextDialog.remove();
    journal.remove();
    sidebar.classList.remove("has-work-journal");
    reserveSpace();
  }
  root.addEventListener("click", onClick);
  form.addEventListener("submit", completeFinish);
  form.addEventListener("keydown", onNoteKeydown);
  journal.addEventListener("click", onNoteAreaClick);
  noteArea.addEventListener("toggle", scheduleNoteFit, true);
  note.addEventListener("input", onNoteInput);
  note.addEventListener("select", rememberCaret);
  note.addEventListener("wheel", onWheel, { passive: true });
  noteArea.addEventListener("wheel", onWheel, { passive: true });
  nav?.addEventListener("wheel", onNavWheel, { passive: true });
  owner.addEventListener("storage", onStorage);
  owner.addEventListener("keydown", onWorkShortcut);
  owner.addEventListener("focus", refresh);
  owner.addEventListener("resize", reserveSpace);
  owner.addEventListener("beforeunload", onBeforeUnload);
  owner.addEventListener("pagehide", destroy, { once: true });
  const layoutObserver =
    typeof owner.ResizeObserver === "function"
      ? new owner.ResizeObserver(scheduleNoteFit)
      : null;
  layoutObserver?.observe(sidebar);
  refresh();
  return {
    button,
    refresh,
    getRunningRecordId,
    /** Last note or state change of every unfinished work, by record. */
    activity() {
      return new Map(
        store.snapshot.entries
          .filter((entry) => entry.status !== "finished")
          .map((entry) => [entry.recordId, entry.updatedAt]),
      );
    },
    getDraftSnapshot() {
      rememberCaret();
      store.synchronize();
      if (!flushDrafts({ allowDurable: true }))
        throw new Error(
          "Çalışma notlarından biri kaydedilemedi. Notun korunuyor; yedeklemeden önce hatayı çöz veya yeniden dene.",
        );
      store.synchronize();
      if (store.readOnly)
        throw new Error(
          "Çalışma notları güvenle okunamadığı için yedek hazırlanamadı.",
        );
      return store.snapshot;
    },
    destroy,
  };
}
