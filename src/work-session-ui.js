import { createWorkSessionStore } from "./work-session-store.js";
import { localDate } from "./model.js";
import { weekWorkSummary } from "./work-journal.js";

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
const workIcons = { play: playIcon, pause: pauseIcon, resume: resumeIcon };
const stopIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';
const notesIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v13h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 3h8v4H8zM8 12h8M8 16h5"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function duration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function savedDuration(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  const totalMinutes = Math.round(value / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours
    ? `${hours} sa${minutes ? ` ${minutes} dk` : ""}`
    : `${minutes} dk`;
}

/** A task's execution controls stay separate from status and planning fields. */
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
    throw new TypeError("Çalışma oturumu için kayıt listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const sidebar = root.querySelector(".sidebar") || root;
  const journal = document.createElement("section");
  journal.id = "sidebar-work-journal";
  journal.className = "sidebar-work-journal";
  journal.setAttribute("aria-label", "İş günlüğü kontrolü");
  journal.innerHTML = `<div class="sidebar-journal-heading"><h2>${notesIcon}İş günlüğü</h2><span class="sidebar-journal-phase" hidden></span></div><div class="sidebar-journal-saved" title="Bugün iş günlüğüne kaydedilen süre"><span>Bugün</span> <span class="sidebar-journal-separator" aria-hidden="true">·</span> <strong id="sidebar-saved-time">0 dk</strong> <span class="sidebar-journal-separator" aria-hidden="true">·</span> <small id="sidebar-saved-count">0 oturum</small></div><button type="button" class="sidebar-journal-history" data-action="work-session-history">Çalışma geçmişi <span aria-hidden="true">→</span></button>`;
  sidebar.append(journal);
  sidebar.classList.add("has-work-journal");
  const phase = journal.querySelector(".sidebar-journal-phase");
  const saved = journal.querySelector(".sidebar-journal-saved");
  const panel = document.createElement("section");
  panel.id = "work-session-panel";
  panel.className = "work-session-panel";
  panel.setAttribute("aria-label", "Çalışma oturumu");
  panel.hidden = true;
  journal.insertBefore(panel, saved);
  const contextDialog = document.createElement("dialog");
  contextDialog.id = "work-session-context";
  contextDialog.className = "modal work-context-modal";
  contextDialog.setAttribute("aria-label", "Notlar ve sonraki adım");
  root.append(contextDialog);
  const finishDialog = document.createElement("dialog");
  finishDialog.id = "work-finish-dialog";
  finishDialog.className = "modal work-finish-modal";
  finishDialog.setAttribute("aria-label", "Çalışma oturumunu bitir");
  root.append(finishDialog);
  let expanded = false;
  let destroyed = false;
  let refreshing = false;
  let renderKey = "";
  let contextKey = "";
  let summaryRecords = null;
  let summaryDate = "";
  let errorMessage = "";
  let finishDraft = null;
  let finishing = false;
  let observedRunningId;
  let runningNotificationQueued = false;
  let store;
  let storage;
  try {
    storage = owner.localStorage;
  } catch {
    storage = {
      getItem: () => {
        throw new Error("Tarayıcı depolamasına erişilemiyor.");
      },
      setItem: () => {
        throw new Error("Tarayıcı depolamasına erişilemiyor.");
      },
    };
  }

  function reportError(message) {
    const text = message instanceof Error ? message.message : String(message);
    if (text !== errorMessage) {
      try {
        onError(text);
      } catch {
        /* Feedback must not interrupt a paused or saved session. */
      }
    }
    errorMessage = text;
  }

  function isOpen(record) {
    return record?.type === "daily" && !CLOSED.has(record.status);
  }
  function find(id) {
    return getRecords().find((record) => record.id === id);
  }

  function isJournaled(record, entry) {
    return (
      entry &&
      entry.status !== "finished" &&
      Array.isArray(record?.workLog) &&
      record.workLog.some((log) => log.id === entry.sessionId)
    );
  }

  function settleJournaled(record) {
    const entry = store.get(record.id);
    if (!isJournaled(record, entry)) return true;
    // A primary save can succeed before the separate context write fails.
    // Retire that exact session before allowing any more time to accumulate.
    if (!store.finish(record.id, entry.sessionId)) return false;
    return !isJournaled(record, store.get(record.id));
  }

  function buttonState(record) {
    const entry = store?.get(record.id);
    const journaled = isJournaled(record, entry);
    const running = entry?.status === "running" && !journaled;
    const paused = entry?.status === "paused" && !journaled;
    const disabled = !isOpen(record) || store?.readOnly || journaled;
    const label = running
      ? "çalışmayı duraklat"
      : paused
        ? "çalışmaya devam et"
        : "çalışmaya başla";
    const hint = journaled
      ? "İş günlüğü kaydedildi. Oturumun kapanması için tarayıcı depolamasını kontrol et."
      : !isOpen(record)
        ? "Bu kayıt kapalı. Çalışmak için önce durumunu güncelle."
        : store?.readOnly
          ? "Çalışma oturumu kaydedilemiyor."
          : running
            ? "Çalışmayı duraklat"
            : paused
              ? "Duraklatıldı · Devam et"
              : "Çalışmaya başla";
    return {
      entry,
      running,
      paused,
      symbol: running ? "pause" : paused ? "resume" : "play",
      disabled,
      label,
      hint:
        entry && entry.status !== "finished"
          ? `${hint} · ${duration(store.elapsed(record.id))}`
          : hint,
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
    if (!current || current.status !== "running") return null;
    const record = find(current.recordId);
    return isOpen(record) && !isJournaled(record, current) ? record.id : null;
  }

  function updateRunningRows() {
    const runningId = getRunningRecordId();
    for (const row of root.querySelectorAll(".focus-row[data-id]")) {
      const running = row.dataset.id === runningId;
      row.classList.toggle("is-working", running);
      if (running) row.dataset.workState = "running";
      else row.removeAttribute("data-work-state");
    }
    // The initial view reads the getter when it renders. Later changes can
    // reorder the Dashboard after the current refresh has fully completed.
    if (observedRunningId === undefined) {
      observedRunningId = runningId;
      return;
    }
    if (observedRunningId === runningId) return;
    observedRunningId = runningId;
    if (runningNotificationQueued) return;
    runningNotificationQueued = true;
    owner.queueMicrotask(() => {
      runningNotificationQueued = false;
      if (destroyed) return;
      try {
        onRunningChange(getRunningRecordId());
      } catch {
        // Refreshing a view must not interrupt the saved timer state.
      }
    });
  }

  function reserveSpace() {
    // Session controls now live inside the fixed navigation; the work area
    // and goal panel no longer need bottom padding or a floating-card gap.
    document.body.removeAttribute("data-work-session");
    document.documentElement.style.removeProperty("--work-session-height");
    journal.dataset.phase = panel.hidden ? "idle" : panel.dataset.phase;
  }

  function updateDailySummary() {
    const records = getRecords();
    const date = localDate();
    if (records === summaryRecords && date === summaryDate) return;
    const summary = weekWorkSummary(records, { start: date, end: date });
    journal.querySelector("#sidebar-saved-time").textContent = savedDuration(
      summary.totalMs,
    );
    journal.querySelector("#sidebar-saved-count").textContent =
      `${summary.sessionCount} oturum`;
    summaryRecords = records;
    summaryDate = date;
  }

  function closeContext() {
    expanded = false;
    if (contextDialog.open) contextDialog.close();
  }

  function renderContext(record, force = false) {
    if ((!contextDialog.open && !force) || !record) return;
    const nextKey = JSON.stringify([
      record.id,
      record.title,
      record.nextAction,
      record.description,
      record.status,
      record.waitingReason,
      record.blockReason,
    ]);
    if (nextKey === contextKey) return;
    const scrollTop =
      contextDialog.querySelector(".modal-body")?.scrollTop || 0;
    contextDialog.innerHTML = `<div class="work-context-shell"><div class="modal-header"><h2>Notlar ve sonraki adım</h2><button type="button" class="close-modal" data-action="work-context-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body work-context-body"><p class="work-context-title">${escapeHtml(record.title)}</p>${record.status === "waiting" && (record.waitingReason ?? record.blockReason) ? `<section class="work-session-waiting-reason"><h3>Bekleme nedeni</h3><p>${escapeHtml(record.waitingReason ?? record.blockReason)}</p></section>` : ""}<div class="work-session-context-grid"><section><h3>Sonraki adım</h3><p class="${record.nextAction ? "" : "work-session-empty"}">${escapeHtml(record.nextAction || "Bu iş için sonraki adım eklenmemiş.")}</p></section><section><h3>Notlar</h3><p class="${record.description ? "" : "work-session-empty"}">${escapeHtml(record.description || "Bu iş için not eklenmemiş.")}</p></section></div></div><div class="modal-footer"><button type="button" class="btn primary" data-action="work-context-close">Tamam</button></div></div>`;
    contextDialog.querySelector(".modal-body").scrollTop = scrollTop;
    contextKey = nextKey;
  }

  function updateButtons() {
    for (const control of root.querySelectorAll(".work-start[data-id]")) {
      const record = find(control.dataset.id);
      if (!record) continue;
      control.hidden = record.type !== "daily";
      const state = buttonState(record);
      const phase = state.entry?.status || "idle";
      if (
        control.dataset.phase !== phase ||
        control.firstElementChild?.dataset.workSymbol !== state.symbol
      ) {
        control.innerHTML = workIcons[state.symbol];
        control.dataset.phase = phase;
      }
      control.classList.toggle("is-running", state.running);
      control.classList.toggle("is-paused", state.paused);
      control.setAttribute("aria-label", `${record.title}: ${state.label}`);
      control.setAttribute("aria-pressed", String(state.running));
      control.title = state.hint;
      control.disabled = Boolean(state.disabled);
    }
    updateRunningRows();
  }

  function render() {
    if (destroyed || !store) return;
    updateDailySummary();
    const current = store.current;
    const record = current ? find(current.recordId) : null;
    if (!current || !isOpen(record) || isJournaled(record, current)) {
      panel.hidden = true;
      panel.innerHTML = "";
      panel.removeAttribute("data-phase");
      phase.hidden = true;
      renderKey = "";
      closeContext();
      reserveSpace();
      updateButtons();
      return;
    }
    phase.hidden = false;
    phase.textContent =
      current.status === "running" ? "Çalışıyor" : "Duraklatıldı";
    phase.dataset.phase = current.status;
    const nextKey = JSON.stringify([
      current.recordId,
      current.sessionId,
      current.status,
      current.elapsedMs,
      current.startedAt,
      current.updatedAt,
      record.title,
      expanded,
    ]);
    if (nextKey !== renderKey) {
      const active = document.activeElement;
      const focusedAction = panel.contains(active)
        ? active?.dataset?.action
        : null;
      panel.hidden = false;
      panel.dataset.phase = current.status;
      panel.innerHTML = `<div class="work-session-summary"><button type="button" class="work-session-task-link" id="work-session-title" data-action="edit" data-id="${escapeHtml(record.id)}" title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</button><div class="work-session-duration"><span id="work-session-time" role="timer" aria-label="Bu oturumda geçen süre, saat, dakika ve saniye" aria-live="off">${duration(store.elapsed(current.recordId))}</span><button type="button" class="work-session-details" data-action="work-details" aria-label="Notlar ve sonraki adım" aria-controls="work-session-context" aria-expanded="${expanded}" title="Notlar ve sonraki adım">${notesIcon}</button></div><div class="work-session-controls"><button type="button" class="work-session-toggle" data-action="${current.status === "running" ? "work-pause" : "work-resume"}" data-id="${escapeHtml(record.id)}">${current.status === "running" ? pauseIcon : playIcon}<span>${current.status === "running" ? "Duraklat" : "Devam et"}</span></button><button type="button" class="work-session-finish" data-action="work-finish" data-id="${escapeHtml(record.id)}" aria-label="Oturumu bitir">${stopIcon}<span>Bitir</span></button></div></div>`;
      renderKey = nextKey;
      if (focusedAction) {
        const control =
          [...panel.querySelectorAll("[data-action]")].find(
            (element) => element.dataset.action === focusedAction,
          ) ||
          (["work-pause", "work-resume"].includes(focusedAction)
            ? panel.querySelector(".work-session-toggle")
            : null);
        control?.focus({ preventScroll: true });
      }
      reserveSpace();
    }
    const counter = panel.querySelector("#work-session-time");
    if (counter)
      counter.textContent = duration(store.elapsed(current.recordId));
    renderContext(record);
    updateButtons();
  }

  store = createWorkSessionStore({
    storage,
    key: KEY,
    onChange: render,
    onError: reportError,
  });

  function refresh() {
    if (destroyed || refreshing) return;
    refreshing = true;
    try {
      store.synchronize();
      for (const entry of store.snapshot.entries) {
        const record = find(entry.recordId);
        if (record?.type === "daily" && isJournaled(record, entry))
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

  function finishError(message) {
    const output = finishDialog.querySelector("#work-finish-error");
    if (output) {
      output.textContent = message;
      output.hidden = false;
    }
    reportError(message);
  }

  function setFinishing(value) {
    finishing = value;
    finishDialog.setAttribute("aria-busy", String(value));
    for (const control of finishDialog.querySelectorAll("button, textarea"))
      control.disabled = value;
    const submit = finishDialog.querySelector('[type="submit"]');
    if (submit)
      submit.textContent = value ? "Kaydediliyor…" : "Kaydet ve bitir";
  }

  function cancelFinish() {
    if (finishing) return;
    finishDraft = null;
    finishDialog.close();
  }

  function beginFinish(id) {
    if (finishing || finishDialog.open || !isOpen(find(id))) return;
    store.synchronize();
    if (!settleJournaled(find(id))) return;
    const selected = store.current;
    if (selected?.recordId !== id) return;
    if (!store.pause(id, selected.sessionId)) return;
    const paused = store.current;
    if (
      paused?.recordId !== id ||
      paused.sessionId !== selected.sessionId ||
      paused.status !== "paused"
    )
      return;
    const ended = new Date();
    const date = `${ended.getFullYear()}-${String(ended.getMonth() + 1).padStart(2, "0")}-${String(ended.getDate()).padStart(2, "0")}`;
    const record = find(id);
    closeContext();
    finishDraft = {
      recordId: id,
      sessionId: paused.sessionId,
      endedAt: ended.toISOString(),
      date,
      durationMs: paused.elapsedMs,
      contextUpdatedAt: paused.updatedAt,
    };
    finishDialog.innerHTML = `<form id="work-finish-form"><div class="modal-header"><h2>Çalışma oturumunu bitir</h2><button type="button" class="close-modal" data-action="work-finish-cancel" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body work-finish-body"><p class="work-finish-title">${escapeHtml(record.title)}</p><div class="work-finish-summary"><div><span>Tarih</span><time id="work-finish-date" datetime="${date}">${escapeHtml(ended.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }))}</time></div><div><span>Çalışma süresi</span><output id="work-finish-duration">${duration(paused.elapsedMs)}</output></div></div><label class="field">Sonuç <span class="field-help">İsteğe bağlı · Kısa bir sonuç yazabilirsin.</span><textarea name="resultNote" rows="3" maxlength="10000" aria-describedby="work-finish-shortcuts" placeholder="Örn. Üç madde incelendi, ikisi tasarım yanıtını bekliyor."></textarea></label><p id="work-finish-shortcuts" class="field-help">Enter ile kaydet, Shift+Enter ile alt satıra geç.</p><p id="work-finish-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn danger delete-record" data-action="work-finish-discard" title="Bu çalışma oturumunu kaydetmeden sil">Kaydı sil</button><button type="button" class="btn" data-action="work-finish-cancel">Vazgeç</button><button type="submit" class="btn primary">Kaydet ve bitir</button></div></form>`;
    finishDialog.showModal();
  }

  function discardFinish() {
    if (finishing || !finishDraft) return;
    const pending = { ...finishDraft };
    if (!owner.confirm("Bu çalışma oturumu kaydedilmeden silinsin mi?")) return;
    store.synchronize();
    if (store.readOnly) {
      finishError(
        "Çalışma oturumu okunamıyor. Tarayıcı depolamasını kontrol edip yeniden dene.",
      );
      return;
    }
    const record = find(pending.recordId);
    if (record?.workLog?.some((entry) => entry.id === pending.sessionId)) {
      finishError(
        "Bu oturum iş günlüğüne kaydedilmiş. Güncel kayıtları kontrol et.",
      );
      return;
    }
    setFinishing(true);
    try {
      if (
        !store.discard(pending.recordId, pending.sessionId, {
          elapsedMs: pending.durationMs,
          updatedAt: pending.contextUpdatedAt,
        })
      ) {
        finishError(
          store.readOnly
            ? "Çalışma oturumu silinemedi. Yazdığın bilgiler korunuyor; yeniden deneyebilirsin."
            : "Bu oturum başka bir pencerede değişti. Vazgeçip güncel oturumu yeniden aç.",
        );
        return;
      }
      finishDraft = null;
      finishDialog.close();
      render();
      try {
        onMessage("Çalışma oturumu kaydedilmeden silindi.");
      } catch {
        /* Feedback must not turn a successful discard into an error. */
      }
    } finally {
      setFinishing(false);
    }
  }

  async function completeFinish(event) {
    if (!event.target.matches("#work-finish-form")) return;
    event.preventDefault();
    if (finishing || !finishDraft) return;
    const pending = { ...finishDraft };
    const form = event.target;
    const note = form.elements.resultNote.value.trim();
    const error = finishDialog.querySelector("#work-finish-error");
    error.hidden = true;
    store.synchronize();
    if (store.readOnly) {
      finishError(
        "Çalışma oturumu okunamıyor. Tarayıcı depolamasını kontrol edip yeniden dene.",
      );
      return;
    }
    const latest = store.get(pending.recordId);
    if (
      !isOpen(find(pending.recordId)) ||
      latest?.sessionId !== pending.sessionId ||
      latest.status === "running" ||
      latest.elapsedMs !== pending.durationMs
    ) {
      finishError(
        "Bu oturum başka bir pencerede değişti. Vazgeçip güncel oturumu yeniden bitir.",
      );
      return;
    }
    setFinishing(true);
    try {
      const saved =
        typeof onCompleteSession === "function" &&
        (await onCompleteSession(pending.recordId, {
          sessionId: pending.sessionId,
          endedAt: pending.endedAt,
          date: pending.date,
          durationMs: pending.durationMs,
          note,
        }));
      if (saved !== true) {
        finishError(
          "İş günlüğü kaydedilemedi. Oturum duraklatıldı; yeniden deneyebilirsin.",
        );
        return;
      }
      if (!store.finish(pending.recordId, pending.sessionId)) {
        finishError(
          "İş günlüğü kaydedildi; oturum kapatılamadı. Yeniden dene.",
        );
        return;
      }
      closeContext();
      finishDraft = null;
      finishDialog.close();
      render();
      if (!destroyed) {
        try {
          onMessage(
            `İş günlüğüne kaydedildi: ${duration(pending.durationMs)}.`,
          );
        } catch {
          /* A feedback error must not report a successful save as failed. */
        }
      }
    } catch {
      finishError(
        "İş günlüğü kaydedilemedi. Oturum duraklatıldı; yeniden deneyebilirsin.",
      );
    } finally {
      setFinishing(false);
    }
  }

  function onFinishCancel(event) {
    event.preventDefault();
    cancelFinish();
  }
  const onFinishClose = () => {
    if (!finishing) finishDraft = null;
  };
  finishDialog.addEventListener("submit", completeFinish);
  finishDialog.addEventListener("cancel", onFinishCancel);
  finishDialog.addEventListener("close", onFinishClose);

  function onClick(event) {
    const control = event.target.closest("[data-action]");
    if (!control || !root.contains(control)) return;
    const { action, id } = control.dataset;
    if (
      ![
        "work-start",
        "work-pause",
        "work-resume",
        "work-finish",
        "work-details",
        "work-finish-cancel",
        "work-finish-discard",
        "work-context-close",
        "work-session-history",
      ].includes(action)
    )
      return;
    event.preventDefault();
    if (action === "work-finish-cancel") {
      cancelFinish();
      return;
    }
    if (action === "work-finish-discard") {
      discardFinish();
      return;
    }
    if (action === "work-context-close") {
      closeContext();
      render();
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
      const current = store.current;
      const record = current ? find(current.recordId) : null;
      if (!isOpen(record)) return;
      if (contextDialog.open) closeContext();
      else {
        expanded = true;
        renderContext(record, true);
        contextDialog.showModal();
      }
      render();
      return;
    }
    if (action === "work-finish") {
      beginFinish(id);
      return;
    }
    if (action === "work-pause") {
      if (isOpen(find(id))) store.pause(id);
      return;
    }
    const record = find(id);
    if (!isOpen(record)) return;
    store.synchronize();
    if (!settleJournaled(record)) return;
    if (
      action === "work-start" &&
      store.current?.recordId === id &&
      store.current.status === "running"
    )
      store.pause(id);
    else store.start(id);
  }

  const onStorage = (event) => {
    if (event.key === KEY || event.key === null) refresh();
  };
  const onContextClose = () => {
    expanded = false;
    render();
  };
  contextDialog.addEventListener("close", onContextClose);
  root.addEventListener("click", onClick);
  owner.addEventListener("storage", onStorage);
  owner.addEventListener("focus", refresh);
  owner.addEventListener("resize", reserveSpace);
  const timer = owner.setInterval(refresh, 1000);
  function destroy() {
    if (destroyed) return;
    store.stopOwner();
    destroyed = true;
    for (const row of root.querySelectorAll(".focus-row.is-working")) {
      row.classList.remove("is-working");
      row.removeAttribute("data-work-state");
    }
    owner.clearInterval(timer);
    root.removeEventListener("click", onClick);
    owner.removeEventListener("storage", onStorage);
    owner.removeEventListener("focus", refresh);
    owner.removeEventListener("resize", reserveSpace);
    owner.removeEventListener("pagehide", destroy);
    finishDialog.removeEventListener("submit", completeFinish);
    finishDialog.removeEventListener("cancel", onFinishCancel);
    finishDialog.removeEventListener("close", onFinishClose);
    contextDialog.removeEventListener("close", onContextClose);
    contextDialog.remove();
    finishDialog.remove();
    journal.remove();
    sidebar.classList.remove("has-work-journal");
    document.body.removeAttribute("data-work-session");
    document.documentElement.style.removeProperty("--work-session-height");
  }
  owner.addEventListener("pagehide", destroy, { once: true });
  refresh();
  return { button, refresh, getRunningRecordId, destroy };
}
