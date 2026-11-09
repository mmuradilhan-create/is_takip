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
  onCompleteSession,
  onHistory = () => {},
  onRunningChange = () => {},
  onError = () => {},
  onMessage = () => {},
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
  journal.innerHTML = `<div class="sidebar-journal-heading"><h2>${notesIcon}Çalışma notu</h2><span class="sidebar-journal-phase" hidden></span></div><section id="work-session-panel" class="work-session-panel" aria-label="Çalışma notu" hidden><form id="work-note-form" class="work-note-form" novalidate><button type="button" class="work-session-task-link" id="work-session-title" data-action="edit"></button><button type="button" id="work-note-expand" data-action="work-note-toggle" aria-controls="work-session-note" aria-expanded="false" hidden>Notu aç</button><div id="work-finish-summary" class="work-note-date" hidden><span>Sonuç kaydı</span><time id="work-finish-date"></time></div><label class="work-note-field"><span id="work-session-note-label">Çalışma notu</span><textarea id="work-session-note" name="resultNote" rows="5" maxlength="10000" aria-describedby="work-note-error work-finish-error" placeholder="Çalışırken notlarını buraya yaz…"></textarea></label><p id="work-note-error" class="work-note-error" role="alert" hidden></p><div id="work-note-conflict" class="work-note-conflict" hidden><details><summary>Diğer penceredeki not</summary><p id="work-note-peer"></p></details><div class="work-note-resolution"><button type="button" data-action="work-draft-use-current">Güncel notu yükle</button><button type="button" data-action="work-draft-save-local">Bu notu kaydet</button></div></div><button type="button" class="work-note-retry" data-action="work-draft-retry" hidden>Yeniden dene</button><p id="work-finish-error" class="work-note-error" role="alert" hidden></p><div id="work-note-controls" class="work-session-controls"><button type="button" class="work-session-toggle" data-action="work-pause">${pauseIcon}<span>Duraklat</span></button><button type="button" class="work-session-finish" data-action="work-finish" aria-label="Oturumu bitir">${stopIcon}<span>Bitir</span></button></div><div id="work-finish-controls" class="work-session-controls work-finish-controls" hidden><button type="button" data-action="work-finish-cancel">Vazgeç</button><button type="submit" class="work-note-save">Kaydet ve bitir</button></div></form></section><div class="sidebar-journal-footer"><button type="button" class="sidebar-journal-history" data-action="work-session-history">Çalışma geçmişi</button><small id="sidebar-saved-count" title="Toplam kaydedilmiş çalışma sayısı">0 kayıt</small></div>`;
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
    '<span class="work-running-title"></span><button type="button" data-action="work-running-open">Çalışmaya dön</button>';
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
  const contextHint = document.createElement("p");
  contextHint.id = "work-note-context";
  contextHint.className = "work-note-help";
  contextHint.hidden = true;
  panel.querySelector("#work-note-controls").before(contextHint);
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
  let storage;
  try {
    storage = owner.localStorage;
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
  function updateButtons() {
    for (const control of root.querySelectorAll(".work-start[data-id]")) {
      const record = find(control.dataset.id);
      if (!record) continue;
      const state = buttonState(record);
      control.hidden = record.type !== "daily";
      if (
        control.dataset.phase !== (state.entry?.status || "idle") ||
        control.firstElementChild?.dataset.workSymbol !== state.symbol
      )
        control.innerHTML = workIcons[state.symbol];
      control.dataset.phase = state.entry?.status || "idle";
      control.classList.toggle("is-running", state.running);
      control.classList.toggle("is-paused", state.paused);
      control.setAttribute("aria-label", `${record.title}: ${state.label}`);
      control.setAttribute("aria-pressed", String(state.running));
      control.title = state.hint;
      control.disabled = Boolean(state.disabled);
    }
    const runningId = getRunningRecordId();
    for (const row of root.querySelectorAll(".focus-row[data-id]")) {
      row.classList.toggle("is-working", row.dataset.id === runningId);
      if (row.dataset.id === runningId) row.dataset.workState = "running";
      else row.removeAttribute("data-work-state");
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
    journal.style.setProperty(
      "--work-finish-space",
      finishDraft ? "40px" : "0px",
    );
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
        row.innerHTML = `<button type="button" class="work-paused-title" data-action="work-paused-open"></button><button type="button" class="work-paused-resume" data-action="work-paused-resume">${resumeIcon}</button>`;
        pausedRows.set(key, row);
      }
      const record = find(entry.recordId);
      for (const control of row.querySelectorAll("button")) {
        control.dataset.id = entry.recordId;
        control.dataset.sessionId = entry.sessionId;
        control.disabled = finishing;
      }
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
      const control = runningSummary.querySelector("button");
      control.dataset.id = current.recordId;
      control.dataset.sessionId = current.sessionId;
      control.disabled = finishing;
    }
    journal.style.setProperty(
      "--work-extra-space",
      `${visible.length * 44 + (runningSummary.hidden ? 0 : 38)}px`,
    );
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
    const expandNote = panel.querySelector("#work-note-expand");
    expandNote.hidden =
      status !== "paused" ||
      Boolean(finishDraft) ||
      Boolean(state.error) ||
      state.conflict;
    expandNote.textContent = collapsed ? "Notu aç" : "Notu küçült";
    expandNote.setAttribute("aria-expanded", String(!collapsed));
    phase.hidden = false;
    phase.dataset.phase = status;
    phase.textContent = status === "running" ? "Çalışıyor" : "Duraklatıldı";
    form.id = finishDraft ? "work-finish-form" : "work-note-form";
    const title = panel.querySelector("#work-session-title");
    title.textContent = record?.title || "Çalışma notu";
    title.title = record?.title || "Çalışma notu";
    title.dataset.id = state.recordId;
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
    contextHint.hidden =
      Boolean(finishDraft) ||
      !sameSession ||
      !runningSummary.hidden ||
      store.current?.recordId === state.recordId;
    contextHint.textContent = contextHint.hidden
      ? ""
      : "Bu iş duraklatıldı. Devam et ile yeniden açabilirsin.";
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
  function flushDrafts() {
    for (const state of drafts.values())
      if (state.dirty && !flushState(state)) {
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
        panel.querySelector("#work-note-expand").focus({ preventScroll: true });
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
    if (!flushDrafts()) return;
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
        "work-note-toggle",
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
    if (action === "work-note-toggle") {
      if (!editorState || finishing || finishDraft) return;
      const expand = panel.dataset.collapsed === "true";
      editorState.pausedExpanded = expand;
      if (!expand) control.focus({ preventScroll: true });
      render();
      if (expand) focusNote();
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
    if (event.key === KEY || event.key === null) refresh();
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
    }
  }
  function onWheel(event) {
    event.stopPropagation();
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
    note.removeEventListener("input", onNoteInput);
    note.removeEventListener("select", rememberCaret);
    note.removeEventListener("wheel", onWheel);
    noteArea.removeEventListener("wheel", onWheel);
    nav?.removeEventListener("wheel", onNavWheel);
    owner.removeEventListener("storage", onStorage);
    owner.removeEventListener("focus", refresh);
    owner.removeEventListener("resize", reserveSpace);
    owner.removeEventListener("beforeunload", onBeforeUnload);
    owner.removeEventListener("pagehide", destroy);
    contextDialog.remove();
    journal.remove();
    sidebar.classList.remove("has-work-journal");
    reserveSpace();
  }
  root.addEventListener("click", onClick);
  form.addEventListener("submit", completeFinish);
  form.addEventListener("keydown", onNoteKeydown);
  note.addEventListener("input", onNoteInput);
  note.addEventListener("select", rememberCaret);
  note.addEventListener("wheel", onWheel, { passive: true });
  noteArea.addEventListener("wheel", onWheel, { passive: true });
  nav?.addEventListener("wheel", onNavWheel, { passive: true });
  owner.addEventListener("storage", onStorage);
  owner.addEventListener("focus", refresh);
  owner.addEventListener("resize", reserveSpace);
  owner.addEventListener("beforeunload", onBeforeUnload);
  owner.addEventListener("pagehide", destroy, { once: true });
  refresh();
  return { button, refresh, getRunningRecordId, destroy };
}
