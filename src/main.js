import "./style.css";
import "./responsive.css";
import "./dashboard.css";
import "./widget.css";
import "./status.css";
import "./editor-layout.css";
import "./record-context.css";
import "./planning-list.css";
import "./work-session.css";
import "./work-journal.css";
import "./date-picker.css";
import "./compact-actions.css";
import "./dashboard-compact.css";
import "./sidebar-work-journal.css";
import "./workspace-refinements.css";
import "./choice-fields.css";
import "./detail-refinements.css";
import "./weekly-flow.css";
import "./waiting-followup.css";
import "./followup-refinements.css";
import "./list-controls.css";
import "./dashboard-session.css";
import "./waiting-state.css";
import "./waiting-details-ui.css";
import "./dashboard-refresh.css";
import "./dashboard-planning.css";
import "./workspace-polish.css";
import "./goal-hierarchy.css";
import "./waiting-info.css";
import "./theme.css";
import "./dashboard-focus.css";
import "./meeting-both-ui.css";
import "./record-creation-ui.css";
import "./dashboard-calendar.css";
import "./dashboard-attention.css";
import "./row-action-labels.css";
import "./yearly-layout.css";
import "./header-calendar.css";
import "./journal-state.css";
import "./dashboard-viewport.css";
import "./meeting-records.css";
import "./dashboard-rows.css";
import "./settings-compact.css";
import "./control-alignment.css";
import "./goal-card-actions.css";
import "./topbar-clock.css";
import "./record-note-ui.css";
import "./record-alignment-0218.css";
import "./record-editor-period.css";
import "./record-parent-context.css";
import "./record-source-context.css";
import "./record-link-tooltip.css";
import "./waiting-record-panel.css";
import "./meeting-record-panel.css";
import "./dashboard-card-details.css";
import "./action-focus.css";
import "./goal-transfer-ui.css";
import "./workspace-notes-ui.css";
import "./compact-filter-row.css";
import "./title-icon-wrap.css";
import "./sticky-topbar.css";
import "./dashboard-weekly-paging.css";
import "./waiting-last-followup.css";
import "./waiting-table-controls.css";
import "./work-card-journal.css";
import "./waiting-age-chip.css";
import "./note-reminders.css";
import "./planning-dismiss.css";
import { bellIcon, createWorkspaceNotesUI } from "./workspace-notes-ui.js";
import { normalizeNotes, notesFromBackup } from "./workspace-notes.js";
import { exportWorkDrafts, workDraftsFromBackup } from "./work-draft-backup.js";
import { createGoalTransferUI } from "./goal-transfer-ui.js";
import { createWaitingRecordPanel } from "./waiting-record-panel.js";
import { createMeetingRecordPanel } from "./meeting-record-panel.js";
import { createRecordLinkTooltip } from "./record-link-tooltip.js";
import {
  renderEditorPeriodMarkup,
  syncEditorPeriod,
} from "./record-editor-period.js";
import { createRecordNoteUI } from "./record-note-ui.js";
import { installRecordFormShortcuts } from "./record-form-shortcuts.js";
import {
  DISCARD_RECORD_CHANGES,
  recordFormValues,
} from "./record-form-discard.js";
import { installDialogLightDismiss } from "./dialog-light-dismiss.js";
import { confirmAction } from "./app-confirm.js";
import { installInputModality } from "./input-modality.js";
import { createTopbarClock } from "./topbar-clock.js";
import { createMeetingBothUI } from "./meeting-both-ui.js";
import { createRecordCreationUI } from "./record-creation-ui.js";
import {
  arrangeRecordEditor,
  readRecordEditorNumeric,
} from "./record-editor-layout.js";
import { renderMeetingStatusMenu } from "./meeting-status-menu.js";
import {
  cleanupMeetingContacts,
  runMeetingContactCleanup,
} from "./meeting-contact-cleanup.js";
import { recordContextParts } from "./record-context.js";
import { prepareRecordCreation } from "./record-creation.js";
import { createDashboardCalendar } from "./dashboard-calendar.js";
import { selectDayFocus, toggleDayFocus } from "./day-focus.js";
import { proposeGoalLinks, applyGoalLinks } from "./goal-link-review.js";
import { normalizePreferences, applyTheme, watchTheme } from "./preferences.js";
import {
  hiddenPlanningPrompts,
  promptDismissal,
  selectPlanningPrompts,
  waitingGaps,
  withPromptDismissal,
} from "./planning-prompts.js";
import { createReminderBell } from "./reminder-bell.js";
import { parentGoalType, goalChildren } from "./goal-hierarchy.js";
import { unlinkGoalChild } from "./goal-child-unlink.js";
import { createWaitingInfoUI } from "./waiting-info-ui.js";
import { version as APP_VERSION } from "../package.json";
import { selectDashboardWeek, selectAttention } from "./dashboard-planning.js";
import {
  linkedAction,
  linkedActions,
  resolveActionSource,
  syncActionLinks,
  buildMeetingActions,
  attachMeetingAction,
  attachWaitingWork,
  unlinkWaitingWork,
} from "./action-links.js";
import { createWaitingDetailsUI } from "./waiting-details-ui.js";
import {
  migrateBlockedToWaiting,
  waitingStateMigrationInfo,
  listReviewRecords,
} from "./waiting-state.js";
import { renderFilterControl } from "./list-controls.js";
import { sortListRecords, paginateRecords } from "./list-view.js";
import {
  TYPES,
  statusesForType,
  isStatusSelectable,
  statusLabel,
  statusForDisplay,
  PRIORITIES,
  createRecord,
  emptyStore,
  validateStore,
  goalProgress,
  localDate,
  isOverdue,
} from "./model.js";
import { selectCurrentWork } from "./dashboard-model.js";
import { createWorkspaceStore } from "./workspace-store.js";
import { createSummaryWidget } from "./widget.js";
import { createWindowCoordinator } from "./window-coordinator.js";
import { createWorkSessionUI } from "./work-session-ui.js";
import { createGoalPanel } from "./goal-panel.js";
import { updateGoalProgress } from "./goal-progress-update.js";
import { deadlineTone } from "./deadlines.js";
import { renderDeadlineChip } from "./deadline-presentation.js";
import { choiceField, createChoiceFields } from "./choice-fields.js";
import {
  availableChoices,
  normalizeChoiceLists,
  validChoiceLists,
} from "./choice-catalogs.js";
import {
  cleanupImportedNotes,
  importedNoteCleanupInfo,
} from "./record-details.js";
import { createWorkJournalUI } from "./work-journal-ui.js";
import { createWaitingFollowUpUI } from "./waiting-followup-ui.js";
import {
  appendFollowUp,
  updateFollowUp,
  waitingAgePresentation,
  stampWaitingClosures,
  followUpPresentation,
  cleanupWaitingImportNotes,
  waitingImportNoteCleanupInfo,
} from "./waiting-followup.js";
import {
  appendWorkLog,
  updateWorkLogEntry,
  removeWorkLogEntry,
} from "./work-journal.js";
import {
  DAILY_CONTEXTS,
  isDailyInboxGoal,
  migrateDailyInbox,
} from "./daily-context.js";
import { createInlineFields } from "./inline-fields.js";
import {
  createDatePicker,
  dateInput,
  dateValue as readDateValue,
} from "./date-picker.js";
import {
  makePlanningPeriod,
  shiftPlanningPeriod,
  matchesPlanningPeriod,
} from "./planning-periods.js";
import {
  previousWeeklyGoals,
  moveWeeklyGoal,
  weeklyPeriodFromKey,
  isArchivedWeekly,
} from "./weekly-flow.js";
import {
  previousMonthlyGoals,
  moveMonthlyGoal,
  monthlyPeriodFromKey,
} from "./monthly-flow.js";

export async function startMainApp() {
  const desktopMode = location.hash.split("?")[0] === "#desktop";
  const paths = {
    undo: "m9 14-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-1",
    widget: "M3 4h18v16H3zM12 12h7v6h-7z",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    settings:
      "M20 7h-9m-6 0H4m16 10h-1M9 17H4M11 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm8 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    check: "m5 12 4 4L19 6",
    history: "M3 11a9 9 0 1 1 2.7 6.4M3 4v7h7M12 7v5l3 2",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    calendar:
      "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h2m6 0h2M7 18h2",
    list: "M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01",
    target: "M21 12a9 9 0 1 1-9-9m0 4a5 5 0 1 0 5 5m-5 0 9-9m-5 0h5v5",
    flag: "M4 22V3m0 0c5-4 10 4 16 0v11c-6 4-11-4-16 0",
    star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    search: "m21 21-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0",
    chevron: "m9 5 7 7-7 7",
    down: "m6 9 6 6 6-6",
    plus: "M12 5v14M5 12h14",
    upload: "M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5",
    download: "M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4",
    arrow: "M4 12h16m-5-5 5 5-5 5",
    archive: "M3 4h18v4H3zM5 8v12h14V8m-10 4h6",
    leaf: "M20 3C8 2 2 8 5 15s15 6 15-12ZM4 21 16 9",
    shield: "M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Zm-4 9 3 3 5-6",
    close: "m6 6 12 12M6 18 18 6",
    edit: "m16 3 5 5-13 13H3v-5L16 3Zm-2 2 5 5",
    menu: "M3 6h18M3 12h18M3 18h18",
    sun: "M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4m0-12.8 1.4-1.4M4.2 19.8l1.4-1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
    moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z",
    inbox: "M3 13 6 3h12l3 10v8H3v-8Zm0 0h5l2 3h4l2-3h5",
    trend: "m3 17 6-6 4 4 8-10m-6 0h6v6",
    link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4m12-2 2-2a4 4 0 0 1 6 6l-4 4",
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.list}"/></svg>`;
  const typeIcons = {
    daily: "list",
    weekly: "calendar",
    monthly: "target",
    yearly: "flag",
    meeting: "people",
    waiting: "clock",
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const label = (map, key) => map[key]?.label || key;
  const STORAGE_KEY = "is-takip-v1";
  let initial = emptyStore();
  let storageError = "";
  let bootstrapNotice = "";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const decoded = JSON.parse(saved);
      initial = validateStore(decoded);
      notesFromBackup(decoded);
    } else {
      try {
        const embedded = document.querySelector("#initial-data");
        const response = embedded
          ? new Response(embedded.textContent, {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          : await fetch("/__local/initial-data");
        if (
          response.status === 200 &&
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const imported = await response.json();
          const checked = validateStore(imported);
          const importedNotes = notesFromBackup(imported);
          const seeded = importedNotes.present
            ? { ...checked, odak: { version: 1, notes: importedNotes.notes } }
            : checked;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
          initial = checked;
        } else if (![200, 204, 404].includes(response.status)) {
          bootstrapNotice =
            "Başlangıç kayıtları yüklenemedi. Sayfayı yenileyip yeniden deneyebilirsin.";
        }
      } catch {
        bootstrapNotice =
          "Başlangıç kayıtları okunamadı veya tarayıcıya kaydedilemedi. Tarayıcı depolama ayarlarını kontrol edip yeniden dene; kayıt dosyaların korunuyor.";
      }
    }
  } catch {
    storageError =
      "Kayıtlı veriler okunamadı. Üzerine yazmamak için kayıt kapatıldı. Tarayıcı verilerini silmeden önce mevcut verilerini yedekle.";
  }
  const state = {
    records: initial.records,
    view: "dashboard",
    search: "",
    status: "all",
    listScope: "open",
    listSort: "created-desc",
    listPage: 1,
    priority: "all",
    period: "all",
    focusFilter: "open",
    attentionPage: 1,
    attentionPageSize: 2,
    weeklyPage: 1,
    onlyUnlinked: false,
    workContext: "all",
    weeklyBacklogOpen: false,
    monthlyBacklogOpen: false,
    planningPeriods: { weekly: null, monthly: null, yearly: null },
  };
  const APP_NAME = "Odak";
  const PREFERENCES_KEY = `${STORAGE_KEY}-preferences`;
  let preferences = normalizePreferences();
  try {
    const embedded = document.querySelector(
      "#initial-preferences",
    )?.textContent;
    const saved = localStorage.getItem(PREFERENCES_KEY) || embedded;
    if (saved) preferences = normalizePreferences(JSON.parse(saved));
  } catch {
    /* Appearance preferences are independent of task records. */
  }
  let workspaceStore = null;
  let renderedWorkspaceDomain = null;
  let workspaceResetConfirmation = null;
  let workspaceResetSaving = false;
  let editorDiscardPending = null;
  let summaryWidget = null;
  let inlineFields = null;
  let workSessions = null;
  let workJournal = null;
  let datePicker = null;
  let goalPanel = null;
  let goalTransfers = null;
  let choiceFields = null;
  let waitingFollowUps = null;
  let waitingRecordPanel = null;
  let meetingRecordPanel = null;
  let waitingDetails = null;
  let waitingInfo = null;
  let recordNotes = null;
  let workspaceNotes = null;
  let reminderBell = null;
  let meetingBoth = null;
  let meetingLinkedReturn = null;
  let recordCreation = null;
  let dashboardCalendar = null;
  let planningPromptKind = null;
  let planningShowHidden = false;
  let goalLinkReviewEntries = [];
  let goalLinkReviewSaving = false;
  let renderedCalendarDay = null;
  let dashboardOrderPending = false;
  const CONTEXT_MIGRATION_KEY = `${STORAGE_KEY}-daily-context-migration`;
  const NOTES_CLEANUP_KEY = `${STORAGE_KEY}-import-notes-cleanup`;
  const WAITING_NOTES_CLEANUP_KEY = `${STORAGE_KEY}-waiting-notes-cleanup`;
  const WAITING_STATE_MIGRATION_KEY = `${STORAGE_KEY}-waiting-state-migration`;
  const MEETING_CONTACT_CLEANUP_KEY = `${STORAGE_KEY}-meeting-contact-cleanup`;
  function cleanupMeetingContactsOnce() {
    if (storageError) return;
    try {
      const result = runMeetingContactCleanup({
        records: state.records,
        storage: localStorage,
        markerKey: MEETING_CONTACT_CLEANUP_KEY,
        saveRecords: (records) =>
          saveRecords(records, "Toplantı kişi alanlarını temizleme", {
            syncLinks: false,
          }),
      });
      if (result.status === "cleaned")
        toast(
          `${result.recordsChanged} toplantının sorumlu ve katılımcı bilgileri silindi. İşlem geri alınabilir; sonraki kayıt veya yedek yüklemede yeniden temizlenir.`,
        );
    } catch {
      toast(
        "Toplantı kişi bilgileri silinemedi. Tarayıcı depolamasını kontrol et.",
        true,
      );
    }
  }
  function migrateWaitingState(automatic = false) {
    const migrated = migrateBlockedToWaiting(state.records);
    if (migrated === state.records || storageError) return;
    try {
      if (automatic && localStorage.getItem(WAITING_STATE_MIGRATION_KEY))
        return;
      localStorage.setItem(WAITING_STATE_MIGRATION_KEY, "1");
    } catch {
      if (!automatic)
        toast(
          "Bekleme düzeni kaydedilemedi. Tarayıcı depolamasını kontrol et.",
          true,
        );
      return;
    }
    if (saveRecords(migrated, "Bekleme düzeni", { syncLinks: false })) {
      if (!automatic) document.querySelector("#settings-dialog")?.close();
      toast(
        "Bekleme bilgileri korundu ve durumlarla birleştirildi. İşlem geri alınabilir.",
      );
    }
  }
  function cleanupWaitingNotes(automatic = false) {
    const cleaned = cleanupWaitingImportNotes(state.records);
    if (cleaned === state.records || storageError) return;
    const info = waitingImportNoteCleanupInfo(state.records);
    try {
      if (automatic && localStorage.getItem(WAITING_NOTES_CLEANUP_KEY)) return;
      localStorage.setItem(WAITING_NOTES_CLEANUP_KEY, "1");
    } catch {
      if (!automatic)
        toast(
          "Takip notları temizlenemedi. Tarayıcı depolamasını kontrol et.",
          true,
        );
      return;
    }
    if (
      saveRecords(cleaned, "Bekleyen konu notlarını düzenleme", {
        syncLinks: false,
      })
    ) {
      if (!automatic) document.querySelector("#settings-dialog")?.close();
      toast(
        `${info.recordsChanged} bekleyen konunun aktarım notları düzenlendi. İşlem geri alınabilir.`,
      );
    }
  }
  function cleanupImportNotes(automatic = false) {
    const cleaned = cleanupImportedNotes(state.records);
    if (cleaned === state.records || storageError) return;
    const info = importedNoteCleanupInfo(state.records);
    try {
      if (automatic && localStorage.getItem(NOTES_CLEANUP_KEY)) return;
      localStorage.setItem(NOTES_CLEANUP_KEY, "1");
    } catch {
      if (!automatic)
        toast(
          "Aktarım notları temizlenemedi. Tarayıcı depolamasını kontrol et.",
          true,
        );
      return;
    }
    if (
      saveRecords(cleaned, "Aktarım notlarını temizleme", { syncLinks: false })
    ) {
      if (!automatic) document.querySelector("#settings-dialog")?.close();
      toast(
        `${info.recordsChanged} kayıttaki aktarım notları temizlendi. İşlem geri alınabilir.`,
      );
    }
  }
  function migrateInbox(automatic = false) {
    const migrated = migrateDailyInbox(state.records);
    if (migrated === state.records || storageError) return;
    try {
      // Keep the once-only marker outside record undo. Otherwise a deliberate
      // undo would be silently applied again on the next launch.
      if (automatic && localStorage.getItem(CONTEXT_MIGRATION_KEY)) return;
      localStorage.setItem(CONTEXT_MIGRATION_KEY, "1");
    } catch {
      if (!automatic)
        toast(
          "Anlık iş düzeni kaydedilemedi. Tarayıcı depolamasını kontrol edip yeniden dene.",
          true,
        );
      return;
    }
    const count = migrated.filter(
      (r, index) =>
        r.type === "daily" && r.parentId !== state.records[index].parentId,
    ).length;
    if (saveRecords(migrated, "Anlık iş düzeni", { syncLinks: false }))
      toast(
        `${count} günlük iş Anlık işler grubuna taşındı. Eski haftalık kayıtlar geçmişte korundu.`,
      );
  }
  function applyPreferences() {
    document.documentElement.dataset.density = "compact";
    applyTheme(document, preferences, window);
    for (const input of document.querySelectorAll(
      '#settings-dialog [name="theme"]',
    ))
      input.checked = input.value === (preferences.theme || "light");
  }
  function openSettings() {
    closeRecordPreviews();
    recordNotes?.close();
    choiceFields?.close();
    const cleanupInfo = importedNoteCleanupInfo(state.records);
    const waitingCleanupInfo = waitingImportNoteCleanupInfo(state.records);
    const waitingStateInfo = waitingStateMigrationInfo(state.records);
    document.querySelector("#settings-dialog").innerHTML = `
    <div class="modal-header"><h2>Ayarlar</h2><button type="button" class="close-modal" data-action="close" aria-label="Pencereyi kapat">${icon("close")}</button></div>
    <div class="modal-body settings-content">
      <section class="settings-appearance settings-section" aria-label="Görünüm"><h3 class="settings-section-heading">Tema</h3><div class="settings-theme-options" role="radiogroup" aria-label="Tema">${[
        ["light", "Açık", "sun"],
        ["dark", "Koyu", "moon"],
        ["system", "Sistem", "widget"],
      ]
        .map(
          ([value, title, symbol]) =>
            `<label class="settings-theme-choice"><input type="radio" name="theme" value="${value}" ${(preferences.theme || "light") === value ? "checked" : ""}>${icon(symbol)}<span>${title}</span></label>`,
        )
        .join("")}</div><div id="settings-error" role="alert"></div></section>
      <details class="settings-backup" open><summary><span class="settings-summary-icon">${icon("download")}</span><span>Yedekleme</span><span class="settings-chevron">${icon("chevron")}</span></summary><div class="settings-backup-body"><div class="settings-backup-actions"><button type="button" class="btn" data-action="backup-records" aria-label="Kayıt yedeğini indir">${icon("download")}Yedeği indir</button><button type="button" class="btn" data-action="select-backup" aria-label="Kayıt yedeğini geri yükle">${icon("upload")}Yedeği yükle</button></div><input type="file" id="restore-file" accept=".json,application/json" aria-label="Kayıt yedeği seç" hidden><div id="settings-backup-error" role="alert"></div></div></details>
      <details class="settings-help"><summary><span>Yardım</span><span class="settings-chevron">${icon("chevron")}</span></summary><div class="settings-help-body"><section class="settings-goal-rules" aria-label="Hedef ilerlemesi"><h3>Hedef ilerlemesi</h3><p>Günlük iş → Haftalık → Aylık → Senelik</p><p>Bağlantılar isteğe bağlıdır. Sayısal hedef varsa kendi ölçümü kullanılır; yoksa bağlı işlerin ilerlemesi hesaplanır. Hedefi tamamlamak ayrıca senin kararındır.</p></section><section><h3>Kayıtlar ve yedekleme</h3><p>Kayıtlar ve tercihler bu tarayıcıda otomatik saklanır; HTML dosyasının içine yazılmaz. Yedeği indir, kayıtlarını, bağımsız notlarını ve bitmemiş çalışma taslaklarını JSON dosyası olarak saklar. Yedeği yükle, seçtiğin yedeği onayından sonra geri getirir.</p></section></div></details>
      ${cleanupInfo.recordsChanged ? `<section class="settings-note-cleanup"><p>${cleanupInfo.recordsChanged} kayıtta eski Gün / Gecikme / Odak Sıra aktarım satırları var.</p><button type="button" class="btn" data-action="cleanup-import-notes">Aktarım notlarını temizle</button></section>` : ""}
      ${waitingCleanupInfo.recordsChanged ? `<section class="settings-note-cleanup"><p>${waitingCleanupInfo.recordsChanged} bekleyen konuda eski Son Durum / Kaç Gün Bekledi aktarım satırları var.</p><button type="button" class="btn" data-action="cleanup-waiting-notes">Bekleyen konu notlarını düzenle</button></section>` : ""}
      ${waitingStateInfo.recordsChanged ? `<section class="settings-note-cleanup"><p>Eski engel bilgilerini Beklemede durumuyla birleştirebilirsin. Nedenler ve geçmiş korunur.</p><button type="button" class="btn" data-action="migrate-waiting-state">Bekleme düzenine taşı</button></section>` : ""}
      <section class="settings-reset" aria-label="Çalışma alanını sıfırlama"><div class="settings-reset-copy"><h3>Çalışma alanı</h3><p><strong>${state.records.length} kayıt${workspaceStore?.notes.length ? ` ve ${workspaceStore.notes.length} not` : ""}</strong> temizlenir. Önce yedek al.</p></div><button type="button" class="btn danger" data-action="reset-workspace" aria-label="Çalışma alanını sıfırla" ${!state.records.length && !workspaceStore?.notes.length ? "disabled" : ""}>${icon("trash")}Sıfırla</button></section>
    </div>
    <div class="modal-footer"><small class="settings-version">ODAK ${APP_VERSION} · Bu tarayıcıda saklanır</small><button type="button" class="btn primary" data-action="close">Tamam</button></div>
  `;
    document.querySelector("#settings-dialog").showModal();
  }
  function workspaceResetSnapshot() {
    return {
      records: workspaceStore?.records || state.records,
      notes: workspaceStore?.notes || [],
      hasNotes: Boolean(workspaceStore?.hasNotes),
    };
  }
  function positionWorkspaceReset() {
    const dialog = document.querySelector("#workspace-reset-dialog");
    if (!dialog?.open) return;
    const trigger = workspaceResetConfirmation?.trigger;
    if (!trigger?.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const bounds = dialog.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 8;
    const top = (viewport?.offsetTop || 0) + 8;
    const right = left + (viewport?.width || window.innerWidth) - 16;
    const bottom = top + (viewport?.height || window.innerHeight) - 16;
    const above = rect.top - bounds.height - 8;
    const below = rect.bottom + 8;
    const preferred = above >= top ? above : below;
    dialog.style.left = `${Math.max(left, Math.min(rect.right - bounds.width, right - bounds.width))}px`;
    dialog.style.top = `${Math.max(top, Math.min(preferred, bottom - bounds.height))}px`;
  }
  function renderWorkspaceReset(trigger, error = "") {
    const snapshot = workspaceResetSnapshot();
    workspaceResetConfirmation = {
      token: JSON.stringify(snapshot),
      trigger,
    };
    const dialog = document.querySelector("#workspace-reset-dialog");
    const contents = `${snapshot.records.length} kayıt${snapshot.notes.length ? ` ve ${snapshot.notes.length} not` : ""}`;
    dialog.innerHTML = `<div class="modal-header"><h2 id="workspace-reset-title">Çalışma alanını sıfırla?</h2><button type="button" class="close-modal" data-action="cancel-workspace-reset" aria-label="Pencereyi kapat">${icon("close")}</button></div><div class="modal-body"><p id="workspace-reset-description"><strong>${contents}</strong> silinecek. Yedeğin varsa daha sonra geri yükleyebilirsin.</p><p class="workspace-reset-help">Görünüm ve seçenek listelerin korunur.</p><p id="workspace-reset-error" class="error-message" role="alert" ${error ? "" : "hidden"}>${esc(error)}</p></div><div class="modal-footer"><button type="button" class="btn" data-action="cancel-workspace-reset" autofocus>Vazgeç</button><button type="button" class="btn danger" data-action="confirm-reset-workspace" ${!snapshot.records.length && !snapshot.notes.length ? "disabled" : ""}>Sıfırla</button></div>`;
    if (!dialog.open) dialog.showModal();
    positionWorkspaceReset();
    dialog
      .querySelector('[data-action="cancel-workspace-reset"][autofocus]')
      ?.focus({ preventScroll: true });
  }
  function resetWorkspace(trigger) {
    if (workspaceResetSaving) return;
    const snapshot = workspaceResetSnapshot();
    if (!snapshot.records.length && !snapshot.notes.length) return;
    renderWorkspaceReset(trigger);
  }
  function confirmWorkspaceReset() {
    const dialog = document.querySelector("#workspace-reset-dialog");
    const expected = workspaceResetConfirmation;
    if (!dialog.open || !expected || workspaceResetSaving) return;
    const snapshot = workspaceResetSnapshot();
    if (JSON.stringify(snapshot) !== expected.token) {
      renderWorkspaceReset(
        expected.trigger,
        "Çalışma alanı bu pencere açıkken değişti. Güncel kayıt ve not sayısını kontrol edip yeniden onayla.",
      );
      return;
    }
    if (!snapshot.records.length && !snapshot.notes.length) return;
    workspaceResetSaving = true;
    dialog.setAttribute("aria-busy", "true");
    for (const button of dialog.querySelectorAll("button"))
      button.disabled = true;
    // Persist an empty store instead of removing the key, so embedded initial
    // records are not imported again on reload. The store also checks its latest
    // persisted snapshot atomically, including changes not delivered by storage events.
    let saved = false;
    try {
      saved = saveWorkspaceSnapshot(
        [],
        snapshot.hasNotes ? { notes: [] } : {},
        "Çalışma alanı sıfırlama",
      );
    } finally {
      workspaceResetSaving = false;
      dialog.removeAttribute("aria-busy");
    }
    if (saved) {
      dialog.close();
      state.search = "";
      state.focusFilter = "open";
      document.querySelector("#global-search").value = "";
      navigate("dashboard");
      document.querySelector("#settings-dialog").close();
      toast(
        "Çalışma alanı sıfırlandı. Kayıt yedeğini Ayarlar → Yedekleme bölümünden geri yükleyebilirsin.",
      );
    } else {
      const changed =
        JSON.stringify(workspaceResetSnapshot()) !== expected.token;
      renderWorkspaceReset(
        expected.trigger,
        changed
          ? "Çalışma alanı bu pencere açıkken değişti. Güncel kayıt ve not sayısını kontrol edip yeniden onayla."
          : "Sıfırlama kaydedilemedi. Tarayıcı depolamasını kontrol edip yeniden deneyebilirsin.",
      );
    }
  }
  function backupRecords() {
    try {
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      syncWorkspaceView();
      const drafts = exportWorkDrafts(
        workSessions.getDraftSnapshot(),
        state.records,
      );
      const data = JSON.stringify(
        {
          ...validateStore({ version: 1, records: state.records }),
          ...(Object.hasOwn(preferences, "choiceLists")
            ? { choiceLists: normalizeChoiceLists(preferences.choiceLists) }
            : {}),
          ...(workspaceStore?.hasNotes ? { notes: workspaceStore.notes } : {}),
          workDrafts: drafts,
        },
        null,
        2,
      );
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kayit-yedegi-${today()}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(
        `Kayıt yedeği indirildi. ${drafts.entries.length} çalışma taslağı dahil.`,
      );
    } catch (error) {
      toast(error.message || "Kayıt yedeği hazırlanamadı.", true);
    }
  }
  async function restoreRecords(file, input) {
    if (!file) return;
    const dialog = document.querySelector("#settings-dialog");
    input.disabled = true;
    const errorElement = dialog.querySelector("#settings-backup-error");
    errorElement.textContent = "";
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Kayıt yedeği en fazla 20 MB olabilir.");
      const parsed = JSON.parse(await file.text());
      const store = validateStore(parsed);
      const restoredNotes = notesFromBackup(parsed);
      const restoredDrafts = workDraftsFromBackup(parsed, store.records);
      const hasChoiceLists = Object.hasOwn(parsed, "choiceLists");
      if (hasChoiceLists && !validChoiceLists(parsed.choiceLists))
        throw new Error(
          "Yedekteki proje ve iş türü listeleri geçersiz. Kayıtlar değiştirilmedi.",
        );
      const restoredChoiceLists = hasChoiceLists
        ? normalizeChoiceLists(parsed.choiceLists)
        : undefined;
      if (!input.isConnected || !dialog.open) return;
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      syncWorkspaceView();
      const currentDrafts = restoredDrafts.present
        ? exportWorkDrafts(workSessions.getDraftSnapshot(), state.records)
        : { entries: [] };
      const expectedWorkSessionRaw = restoredDrafts.present
        ? workspaceStore.readWorkSessionRaw()
        : undefined;
      const expectedWorkspace = workspaceDomainSnapshot(
        state.records,
        preferences,
      );
      const contents = `${store.records.length} kayıt${restoredNotes.present ? ` ve ${restoredNotes.notes.length} not` : ""}${restoredDrafts.present ? ` ve ${restoredDrafts.drafts.entries.length} çalışma taslağı` : ""}${hasChoiceLists ? " ve seçenek listeleri" : ""}`;
      if (
        !(await confirmAction({
          root: app,
          title: "Yedeği geri yükle?",
          message: `Yedekte ${contents} var. Mevcut ${state.records.length} kayıt${restoredNotes.present ? ` ve ${workspaceStore.notes.length} not` : ""}${hasChoiceLists ? " ve seçenek listeleri" : ""} bu yedekle değiştirilsin mi?\n\n${restoredDrafts.present ? `Bu tarayıcıda ${currentDrafts.entries.length} çalışma taslağı var; farklı metinli taslakların üzerine yazılmaz. Geri gelen taslaklar duraklatılmış olarak açılır.` : "Çalışma taslakların korunacak."}${restoredDrafts.ignoredCount ? ` Kaydı bulunmayan veya aktarılmaya uygun olmayan ${restoredDrafts.ignoredCount} taslak alınmayacak.` : ""}${!restoredNotes.present && workspaceStore.notes.length ? " Bağımsız notların korunacak." : ""}`,
          confirmLabel: "Yedeği yükle",
          danger: true,
          trigger: dialog.querySelector('[data-action="select-backup"]'),
        }))
      )
        return;
      // Let queued cross-window changes reach localStorage before comparing
      // the workspace the user approved with the workspace being replaced.
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          channel.port2.close();
          resolve();
        };
        channel.port2.postMessage(null);
      });
      if (!input.isConnected || !dialog.open) return;
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      syncWorkspaceView();
      if (
        workspaceDomainSnapshot(state.records, preferences) !== expectedWorkspace
      )
        throw new Error(
          "Çalışma alanı onay penceresi açıkken değişti. Güncel kayıtları kontrol edip yedeği yeniden seç.",
        );
      const restored = saveWorkspaceSnapshot(
        store.records,
        {
          ...(hasChoiceLists ? { choiceLists: restoredChoiceLists } : {}),
          ...(restoredNotes.present ? { notes: restoredNotes.notes } : {}),
          ...(restoredDrafts.present
            ? {
                workDrafts: restoredDrafts.drafts,
                expectedWorkSessionRaw,
              }
            : {}),
        },
        "Yedek yükleme",
        { throwOnError: true },
      );
      if (restored) {
        dialog.close();
        toast(
          `${store.records.length} kayıt${restoredDrafts.present ? ` ve ${restoredDrafts.drafts.entries.length} çalışma taslağı` : ""} geri yüklendi.`,
        );
      }
    } catch (error) {
      if (input.isConnected)
        errorElement.innerHTML = `<p class="error-message">${esc(error instanceof SyntaxError ? "Geçerli bir kayıt yedeği (.json) seç." : error.message)}</p>`;
    } finally {
      if (input.isConnected) {
        input.disabled = false;
        input.value = "";
      }
    }
  }

  const app = document.querySelector("#app");
  const stopInputModality = installInputModality(document);
  window.addEventListener("pagehide", stopInputModality, { once: true });
  installDialogLightDismiss(document, {
    allowOutsideActivation(event, dialog) {
      const preview =
        dialog.id === "goal-detail-panel"
          ? goalPanel
          : dialog.id === "waiting-record-panel"
            ? waitingRecordPanel
            : dialog.id === "meeting-record-panel"
              ? meetingRecordPanel
              : ["work-journal-dialog", "work-week-dialog"].includes(dialog.id)
                ? workJournal
                : null;
      if (!preview?.canActivate()) return false;
      const control = event.target.closest?.(
        '[data-action], button, a[href], input, select, textarea, label, summary, [role="button"], [role="link"]',
      );
      return Boolean(
        control &&
          app.contains(control) &&
          !control.disabled &&
          control.getAttribute("aria-disabled") !== "true",
      );
    },
  });
  const recordLinkTooltip = createRecordLinkTooltip({ root: app });
  window.addEventListener("pagehide", recordLinkTooltip.destroy, {
    once: true,
  });
  const today = () => localDate();
  const dateFmt = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  });
  const dateValue = (str) => new Date(`${str}T12:00:00`);
  const formatDate = (str) =>
    str ? dateFmt.format(dateValue(str)) : "Tarih yok";
  const active = (r) =>
    !["completed", "cancelled", "transferred"].includes(r.status);
  const dueSort = (a, b) =>
    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    b.createdAt.localeCompare(a.createdAt);
  let toastTimer;
  function toast(message, error = false) {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.className = `visible${error ? " error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "";
    }, 5000);
  }
  function syncWorkspaceView() {
    if (workspaceStore) {
      state.records = workspaceStore.records;
      preferences = workspaceStore.preferences;
    }
    render();
    reminderBell?.refresh();
  }
  function workspaceDomainSnapshot(records, currentPreferences) {
    return JSON.stringify({
      records,
      preferences: currentPreferences,
      ...(workspaceStore?.hasNotes ? { notes: workspaceStore.notes } : {}),
    });
  }
  function updateUndoButton() {
    const button = document.querySelector("#undo-button");
    if (!button) return;
    button.disabled = !workspaceStore?.canUndo;
    button.title = workspaceStore?.canUndo
      ? `Geri al: ${workspaceStore.undoLabel} (Ctrl+Z)`
      : "Geri alınacak işlem yok";
  }
  function saveRecords(
    records,
    label = "Kayıt değişikliği",
    { syncLinks = true } = {},
  ) {
    if (storageError) {
      toast(storageError, true);
      return false;
    }
    try {
      const linked = syncLinks
        ? syncActionLinks(state.records, records)
        : records;
      workspaceStore.saveRecords(
        cleanupMeetingContacts(
          syncLinks ? stampWaitingClosures(state.records, linked) : linked,
        ),
        label,
      );
      syncWorkspaceView();
      return true;
    } catch (error) {
      syncWorkspaceView();
      toast(
        `Kaydedilemedi: ${error.message || "Tarayıcı depolama alanını kontrol et."}`,
        true,
      );
      return false;
    }
  }
  function savePreferences(
    nextPreferences,
    actionLabel = "Görünüm değişikliği",
  ) {
    if (storageError) {
      toast(storageError, true);
      return false;
    }
    try {
      workspaceStore.savePreferences(nextPreferences, actionLabel);
      syncWorkspaceView();
      return true;
    } catch (error) {
      syncWorkspaceView();
      toast(
        `${actionLabel === "Görünüm değişikliği" ? "Görünüm" : actionLabel} kaydedilemedi: ${error.message}`,
        true,
      );
      return false;
    }
  }
  function saveWorkspaceSnapshot(
    records,
    additions = {},
    label = "Yedek yükleme",
    { throwOnError = false } = {},
  ) {
    if (storageError) {
      if (throwOnError) throw new Error(storageError);
      toast(storageError, true);
      return false;
    }
    try {
      workspaceStore.saveWorkspace(
        {
          records: cleanupMeetingContacts(records),
          ...(Object.hasOwn(additions, "choiceLists")
            ? {
                preferences: {
                  ...preferences,
                  choiceLists: normalizeChoiceLists(additions.choiceLists),
                },
              }
            : {}),
          ...(Object.hasOwn(additions, "notes")
            ? { notes: normalizeNotes(additions.notes) }
            : {}),
          ...(Object.hasOwn(additions, "workDrafts")
            ? {
                workDrafts: additions.workDrafts,
                expectedWorkSessionRaw: additions.expectedWorkSessionRaw,
              }
            : {}),
        },
        label,
      );
      syncWorkspaceView();
      return true;
    } catch (error) {
      syncWorkspaceView();
      if (throwOnError) throw error;
      toast(
        `Kaydedilemedi: ${error.message || "Tarayıcı depolamasını kontrol et."}`,
        true,
      );
      return false;
    }
  }
  function saveWorkspaceNotes(
    nextNotes,
    expectedNotes,
    label = "Not değişikliği",
  ) {
    if (storageError) {
      toast(storageError, true);
      return false;
    }
    try {
      if (
        JSON.stringify(workspaceStore.notes) !== JSON.stringify(expectedNotes)
      )
        throw new Error(
          "Notlar başka bir pencerede değişti. Taslağın korunuyor; güncel notu yeniden açarak devam et.",
        );
      workspaceStore.saveNotes(nextNotes, label);
      syncWorkspaceView();
      return true;
    } catch (error) {
      syncWorkspaceView();
      throw error;
    }
  }
  function undoLastAction() {
    if (!workspaceStore?.canUndo) return;
    try {
      const label = workspaceStore.undo();
      syncWorkspaceView();
      if (label) toast(`${label} geri alındı.`);
    } catch (error) {
      syncWorkspaceView();
      toast(error.message || "İşlem geri alınamadı.", true);
    }
  }
  function statusBadge(
    r,
    {
      sourceId = r.id,
      targetId = "",
      caption = `${r.title}: durumu değiştir`,
    } = {},
  ) {
    if (r.type === "meeting" && !targetId && meetingTargets(r).length)
      return statusSummary(effectiveRecord(r), true);
    return `<button type="button" class="badge status-trigger status-${esc(statusForDisplay(r.status, r.type))}" data-action="status-menu" data-id="${esc(sourceId)}"${targetId ? ` data-target-id="${esc(targetId)}"` : ""} aria-label="${esc(caption)}" aria-haspopup="menu" aria-controls="status-menu" aria-expanded="false" title="Durumu değiştir"><span class="dot"></span>${esc(statusLabel(r.type, r.status))}</button>`;
  }
  function statusSummary(r, derived = false) {
    return `<span class="badge status-summary status-${esc(statusForDisplay(r.status, r.type))}"${derived ? ' data-meeting-derived-status title="Durum bağlı iş ve takipten hesaplanır."' : ""}><span class="dot"></span>${esc(statusLabel(r.type, r.status))}</span>`;
  }
  function completionControl(r) {
    if (r.type === "meeting") return "";
    if (!active(r))
      return `<span class="completion-mark${r.status === "completed" ? " is-completed" : r.status === "cancelled" ? " is-cancelled" : ""}" role="img" aria-label="${esc(r.title)}: ${esc(statusLabel(r.type, r.status))}">${r.status === "completed" ? icon("check") : r.status === "cancelled" ? icon("close") : ""}</span>`;
    if (meetingTargets(r).length > 1)
      return `<span class="completion-mark" role="img" aria-label="${esc(r.title)}: bağlı kayıtlardan hesaplanır" title="Aksiyonun durumu iki bağlı kayıttan hesaplanır"></span>`;
    return `<button type="button" class="quick-complete" data-action="quick-complete" data-id="${esc(r.id)}" aria-label="${esc(r.title)}: ${r.type === "waiting" ? "konuyu kapat" : "hızlı tamamla"}" title="${r.type === "waiting" ? "Konuyu kapat" : "Tamamlandı olarak işaretle"}"></button>`;
  }
  function workControl(record) {
    if (record.type === "daily") return workSessions?.button(record) || "";
    if (record.type === "meeting") return meetingRouteControls(record, true);
    if (record.type !== "waiting") return "";
    return `<button type="button" class="daily-source-control" data-action="waiting-create-daily" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: yeni günlük adım ekle" title="Bu konu için yeni günlük iş oluştur"${active(record) ? "" : " disabled"}>${icon("plus")}</button>`;
  }
  function meetingTarget(record) {
    return meetingTargets(record)[0] || null;
  }
  function meetingTargets(record) {
    if (record?.type !== "meeting") return [];
    try {
      return linkedActions(record.id, state.records);
    } catch {
      return [];
    }
  }
  function effectiveRecord(record) {
    try {
      return resolveActionSource(record, state.records);
    } catch {
      return record;
    }
  }
  function meetingRouteControls(record, compact = false) {
    const targets = meetingTargets(record);
    return `<div class="meeting-route-actions${targets.length === 2 ? " has-both" : ""}">${[
      "daily",
      "waiting",
    ]
      .map((type) => {
        const target = targets.find((item) => item.type === type);
        const text =
          type === "daily"
            ? target
              ? "İşi aç"
              : "Ben yapacağım"
            : target
              ? "Takibi aç"
              : "Başkasından bekliyorum";
        return `<button type="button" class="meeting-route${target ? " linked-action-control" : ""}${compact ? (targets.length === 2 ? " route-text-action" : " row-icon-action") : ""}" data-action="${target ? "open-linked-action" : "meeting-route"}" data-route="${type}" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ${text.toLocaleLowerCase("tr-TR")}" title="${text}">${compact ? `${icon(type === "daily" ? "list" : "clock")}${targets.length === 2 ? `<span>${text}</span>` : ""}` : text}</button>`;
      })
      .join(
        "",
      )}${!compact && targets.length < 2 ? `<button type="button" class="meeting-route" data-action="meeting-route-both" data-id="${esc(record.id)}">Her ikisi de</button>` : ""}</div>`;
  }
  function lifecycleDateControl(record) {
    return (
      inlineFields?.dateControl(record) ||
      renderDeadlineChip(record, {
        label: formatDate(record.dueDate),
        today: today(),
      })
    );
  }
  function rowIconAction(record, action, symbol, text, className = "") {
    const tooltip = text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);
    return `<button type="button" class="row-icon-action ${className}" data-action="${action}" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ${esc(text)}" title="${esc(tooltip)}">${icon(symbol)}</button>`;
  }
  function recordEditControl(record) {
    return rowIconAction(
      record,
      "edit",
      "edit",
      "kaydı düzenle",
      "record-edit-trigger",
    );
  }
  function goalEditControl(record) {
    if (!["weekly", "monthly", "yearly"].includes(record.type)) return "";
    return rowIconAction(
      record,
      "edit",
      "edit",
      "hedefi düzenle",
      "goal-edit-trigger",
    );
  }
  function journalControl(record) {
    return record.type === "daily"
      ? workJournal?.button(record, { compact: true }) ||
          rowIconAction(
            record,
            "work-journal",
            "list",
            "iş günlüğünü gör",
            "work-journal-trigger",
          )
      : "";
  }
  function rowEndControl(record) {
    if (["weekly", "monthly", "yearly"].includes(record.type)) {
      if (isArchivedWeekly(record)) return goalEditControl(record);
      const target =
        state.planningPeriods[record.type] ||
        makePlanningPeriod(record.type, today());
      const canMove =
        record.type === "weekly"
          ? previousWeeklyGoals([record], target).length > 0
          : record.type === "monthly" &&
            previousMonthlyGoals([record], target).length > 0;
      return `${goalEditControl(record)}${canMove ? carryPlanningButton(record, target, true) : ""}${rowIconAction(record, "new-linked", "plus", record.type === "weekly" ? "yeni günlük adım ekle" : record.type === "monthly" ? "haftalık hedef ekle" : "aylık hedef ekle", "goal-add-step")}`;
    }
    return `${journalControl(record)}${workControl(record)}`;
  }
  function recordRow(r, goalDetails = false) {
    const action = goalDetails
      ? "goal-details"
      : r.type === "meeting"
        ? "meeting-record-details"
        : r.type === "waiting"
          ? "waiting-record-details"
          : "edit";
    return `data-record-row data-action="${action}" data-id="${esc(r.id)}" tabindex="0" aria-label="${esc(r.title)} ${action === "edit" ? "kaydını düzenle" : "ayrıntılarını aç"}"`;
  }
  function priorityBadge(r) {
    return `<span class="priority priority-${esc(r.priority)}"><svg class="priority-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths.flag}"/></svg>${esc(label(PRIORITIES, r.priority))}</span>`;
  }
  function waitingReasonText(record) {
    return record?.waitingReason ?? record?.blockReason ?? "";
  }
  function options(map, selected, placeholder = "") {
    return `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ""}${Object.entries(
      map,
    )
      .map(
        ([key, value]) =>
          `<option value="${key}" ${key === selected ? "selected" : ""}>${esc(value.label)}</option>`,
      )
      .join("")}`;
  }
  function weekBounds() {
    const date = dateValue(today());
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    const start = localDate(date);
    date.setDate(date.getDate() + 6);
    return [start, localDate(date)];
  }
  function matchesSearch(r) {
    return `${r.title} ${r.description} ${r.nextAction} ${r.owner} ${r.decision || ""} ${r.participants || ""} ${r.expectedFrom || ""} ${r.latestUpdate || ""} ${r.projectCode || ""} ${r.workType || ""} ${r.blockReason || ""} ${r.waitingReason || ""} ${label(TYPES, r.type)}`
      .toLocaleLowerCase("tr-TR")
      .includes(state.search.toLocaleLowerCase("tr-TR"));
  }
  function periodMatch(r, period) {
    if (period === "all") return true;
    if (period === "review")
      return (
        listReviewRecords([r], today(), {
          runningRecordId: workSessions?.getRunningRecordId() || null,
          activity: workSessions?.activity?.() || null,
        }).length > 0
      );
    if (r.type === "waiting") {
      const date = r.nextFollowUpDate || "";
      if (period === "followup") return active(r) && (!date || date <= today());
      if (period === "unscheduled") return active(r) && !date;
      if (period === "soon")
        return followUpPresentation(r, today()).tone === "due-soon";
      if (period === "overdue")
        return active(r) && Boolean(date) && date < today();
      if (!date) return false;
      if (period === "today") return date === today();
      const [start, end] = weekBounds();
      return date >= start && date <= end;
    }
    if (period === "soon") return deadlineTone(r, today()) === "due-soon";
    if (period === "overdue") return isOverdue(r, today());
    if (!r.dueDate) return false;
    if (period === "today") return r.dueDate === today();
    const [start, end] = weekBounds();
    return r.dueDate >= start && r.dueDate <= end;
  }
  function unresolved(r) {
    return (
      r.type === "daily" &&
      r.workContext !== "ad_hoc" &&
      !r.parentId &&
      Boolean(r.sourceFields?.__unresolvedParent)
    );
  }
  function pageTitle() {
    return state.view === "dashboard"
      ? "Genel bakış"
      : label(TYPES, state.view);
  }
  function updatePageHeader() {
    document.querySelector("#page-title").textContent = pageTitle();
  }
  function progressCell(record) {
    if (record.status === "cancelled")
      return '<td class="metric-cell progress-col cancelled-progress" aria-label="İptal edilen kayıt ilerlemeye dahil değil" title="İptal edilen kayıt ilerlemeye dahil değil"><span aria-hidden="true">—</span></td>';
    const progress = goalProgress(record, state.records);
    const summary =
      progress.basis === "metric"
        ? `${record.currentValue ?? 0} / ${record.targetValue}`
        : progress.basis === "linked"
          ? `${progress.completed} / ${progress.total}`
          : progress.basis === "rollup"
            ? `${progress.total} alt hedef`
            : record.status === "completed"
              ? "Tamamlandı"
              : "Ölçüm yok";
    return `<td class="metric-cell progress-col"><strong>%${progress.percent}</strong><div class="progress-track" role="progressbar" aria-label="${esc(record.title)} ilerlemesi" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div><small class="goal-progress-summary" title="${esc(progressDescription(record, progress))}"><span>${esc(summary)}</span></small></td>`;
  }
  function table(records, nested = false) {
    if (!records.length) {
      const filtered =
        state.search ||
        !["active", "all"].includes(state.status) ||
        state.priority !== "all" ||
        state.period !== "all" ||
        state.planningPeriods[state.view] ||
        (state.view === "daily" && state.workContext !== "all") ||
        state.onlyUnlinked;
      return emptyState(
        filtered
          ? "Aramana uygun kayıt yok"
          : state.listScope === "open"
            ? "Açık kayıt yok"
            : "Burada yeni bir başlangıç var",
        filtered
          ? "Filtrelerini değiştirerek diğer kayıtlarını görebilirsin."
          : state.listScope === "open"
            ? state.view === "meeting"
              ? "Kapalı düğmesinden kapanan kararlarını görebilir veya yeni bir karar ekleyebilirsin."
              : "Tamamlanan düğmesinden biten kayıtlarını görebilir veya yeni kayıt ekleyebilirsin."
            : "Yeni kayıt ekleyerek bu listeyi oluşturmaya başla.",
      );
    }
    if (state.view === "waiting" && !nested) return waitingTable(records);
    if (state.view === "meeting" && !nested) return meetingTable(records);
    const withProgress =
      !nested && ["weekly", "monthly", "yearly"].includes(state.view);
    const withDeadline = nested || state.view !== "yearly";
    return `<div class="table-wrap"><table class="${nested ? "linked-tasks-table" : `full-table record-table${withProgress ? " has-progress" : ""}${withDeadline ? "" : " without-deadline"}`}"><thead><tr><th>${withProgress ? "Hedef" : "İş / Hedef"}</th><th class="status-col">Durum</th><th class="priority-col">Öncelik</th>${withDeadline ? '<th class="date-col">Teslim tarihi</th>' : ""}${withProgress ? '<th class="progress-col">İlerleme</th>' : ""}<th class="row-action-col">İşlem</th></tr></thead><tbody>${records
      .map((record) => {
        const isWeekly = !nested && record.type === "weekly";
        const opensGoalDetails =
          !nested && ["weekly", "monthly", "yearly"].includes(record.type);
        const contextParts = recordContextParts(record, state.records, {
          showPeriod: !state.planningPeriods[record.type],
        });
        const context = contextParts.filter(
          (part) => part.kind !== "source" && part.kind !== "parent",
        );
        const subtitle = context.map((part) => part.text).join(" · ");
        const contextMarkup = context.length
          ? `<div class="task-meta-line"><div class="task-sub" data-record-context title="${esc(subtitle)}">${context.map((part) => (part.targetId ? `<button type="button" class="record-context-link" data-context-kind="${esc(part.kind)}" data-action="${part.kind === "parent" ? "goal-details" : "edit"}" data-id="${esc(part.targetId)}" title="${esc(part.text)}" aria-label="${esc(part.text)}: ${part.kind === "parent" ? "üst hedefi aç" : part.kind === "source" ? "kaynak kaydı aç" : "bilgiyi düzenle"}">${part.kind === "parent" ? parentContextLabel(part.text) : esc(part.text)}</button>` : `<span class="record-context-part" data-context-kind="${esc(part.kind)}">${esc(part.text)}</span>`)).join('<span class="record-context-separator" aria-hidden="true">·</span>')}</div></div>`
          : "";
        return `<tr class="${isWeekly ? "weekly-goal-row" : "record-list-row"}${record.type === "daily" && active(record) && record.focusDate === today() ? " is-day-focus" : ""}" ${recordRow(record, opensGoalDetails)}><td><div class="task-title-cell">${completionControl(record)}<div class="task-copy${record.type === "daily" ? " daily-task-copy" : ""}"><div class="task-name-line">${dayFocusButton(record)}${recordTitleContent(record, `<button class="task-name ${record.status === "completed" ? "completed" : record.status === "cancelled" ? "cancelled" : ""}" data-action="${opensGoalDetails ? "goal-details" : "edit"}" data-id="${esc(record.id)}">${esc(record.title)}</button>`, recordNotes?.button(record) || "", contextParts)}</div>${contextMarkup}</div></div></td><td class="status-col">${statusBadge(record)}</td><td class="priority-col">${inlineFields ? inlineFields.priorityControl(record) : priorityBadge(record)}</td>${withDeadline ? `<td class="date-col date-cell ${deadlineTone(record, today())}">${lifecycleDateControl(record)}</td>` : ""}${withProgress ? progressCell(record) : ""}<td class="row-action-col"><div class="row-end-actions">${rowEndControl(record)}</div></td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  }
  function emptyState(title, description) {
    return `<div class="empty-state"><div class="empty-icon">${icon("inbox")}</div><h3>${title}</h3><p>${description}</p><button class="btn" data-action="new">${icon("plus")}İlk adımı ekle</button></div>`;
  }
  function waitingAgeMarkup(record, descriptive = false) {
    const age = waitingAgePresentation(record, today(), { formatDate });
    return `<span class="waiting-age" data-waiting-age-kind="${esc(age.kind)}" title="${esc(age.title)}" aria-label="${esc(age.ariaLabel)}">${esc(descriptive ? age.description : age.text)}</span>`;
  }
  /** The last follow-up date is itself the "takip ettim" control. */
  function waitingLastControl(record) {
    const open = active(record);
    const action = open ? "Takip ettim" : "Takip geçmişi";
    return `<button type="button" class="deadline-tag waiting-last-trigger waiting-followup-trigger" data-action="waiting-followup" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ${open ? "takip ettim" : "takip geçmişi"}" title="${action}">${icon(open ? "check" : "history")}${lastFollowUpMarkup(record)}</button>`;
  }
  function lastFollowUpMarkup(record, descriptive = false) {
    const text = record.lastFollowUpDate
      ? `${descriptive ? "Son takip: " : ""}${formatDate(record.lastFollowUpDate)}`
      : descriptive
        ? record.followUpLog?.length
          ? "Son takip tarihi yok"
          : "Henüz takip edilmedi"
        : "Takip yok";
    const content =
      descriptive && record.lastFollowUpDate
        ? `<span class="followup-last-caption">Son takip:</span> <span class="followup-last-value">${esc(formatDate(record.lastFollowUpDate))}</span>`
        : esc(text);
    return `<span class="waiting-last-date" title="${record.lastFollowUpDate ? esc(record.lastFollowUpDate) : "Henüz takip kaydı yok"}">${content}</span>`;
  }
  function meetingLinkedCell(record, type) {
    const target = meetingTargets(record).find((item) => item.type === type);
    if (!target && !active(record))
      return `<td class="meeting-linked-cell" data-route="${type}"></td>`;
    const daily = type === "daily";
    const caption = target
      ? daily
        ? "İşi aç"
        : "Takibi aç"
      : daily
        ? "İş oluştur"
        : "Takip oluştur";
    const date = target && (daily ? target.dueDate : target.nextFollowUpDate);
    const dateCaption = daily ? "İş teslimi" : "Sonraki takip";
    const dateText = date ? `${dateCaption}: ${formatDate(date)}` : "";
    const kind = daily ? "iş" : "takip";
    return `<td class="meeting-linked-cell" data-route="${type}"><div class="meeting-linked-content"><button type="button" class="meeting-route${target ? " linked-action-control" : ""}" data-action="${target ? "open-linked-action" : "meeting-route"}" data-route="${type}" data-id="${esc(record.id)}" title="${caption}" aria-label="${esc(record.title)}: ${caption.toLocaleLowerCase("tr-TR")}">${icon(daily ? "list" : "clock")}<span>${caption}</span></button>${target ? `${target.title !== record.title ? `<span class="meeting-linked-title" title="${esc(target.title)}">${esc(target.title)}</span>` : ""}${statusBadge(target, { sourceId: record.id, targetId: target.id, caption: `${record.title}: ${kind} durumunu değiştir` })}${date ? `<span class="meeting-linked-date" title="${dateCaption}: ${esc(date)}">${esc(dateText)}</span>` : ""}` : ""}</div></td>`;
  }
  function meetingTable(records) {
    return `<div class="table-wrap"><table class="full-table meeting-table"><thead><tr><th>Aksiyon / Karar</th><th class="status-col meeting-source-status-col">Durum</th><th class="meeting-linked-heading">Bağlı iş</th><th class="meeting-linked-heading">Takip</th><th class="row-action-col">İşlem</th></tr></thead><tbody>${records.map((record) => `<tr class="record-list-row" ${recordRow(record)}><td><div class="task-title-cell"><div class="task-copy"><div class="task-name-line"><button class="task-name ${record.status === "completed" ? "completed" : record.status === "cancelled" ? "cancelled" : ""}" data-action="meeting-record-details" aria-haspopup="dialog" aria-controls="meeting-record-panel" data-id="${esc(record.id)}">${esc(record.title)}</button>${recordNotes?.button(record) || ""}</div>${record.decision ? `<div class="meeting-decision" title="${esc(record.decision)}">${esc(record.decision)}</div>` : ""}${record.sourceDate ? `<div class="task-sub meeting-date">Toplantı: ${esc(formatDate(record.sourceDate))}</div>` : ""}</div></div></td><td class="status-col meeting-source-status-col">${statusBadge(record)}</td>${meetingLinkedCell(record, "daily")}${meetingLinkedCell(record, "waiting")}<td class="row-action-col"><div class="row-end-actions">${recordEditControl(record)}</div></td></tr>`).join("")}</tbody></table></div>`;
  }
  function waitingTable(records) {
    return `<div class="table-wrap"><table class="full-table waiting-table"><thead><tr><th>Konu / Beklenen</th><th>Durum</th><th class="waiting-last-col">Son takip</th><th class="waiting-next-col">Sonraki takip</th><th class="waiting-age-col">Bekleme</th><th class="row-action-col">İşlem</th></tr></thead><tbody>${records.map((record) => `<tr class="record-list-row" ${recordRow(record)}><td><div class="task-title-cell">${completionControl(record)}<div class="task-copy"><div class="task-name-line">${dayFocusButton(record)}${recordTitleContent(record, `<a class="task-name ${record.status === "completed" ? "completed" : record.status === "cancelled" ? "cancelled" : ""}" href="#waiting-record-panel" role="button" data-action="waiting-record-details" data-id="${esc(record.id)}" aria-haspopup="dialog" aria-controls="waiting-record-panel">${esc(record.title)}</a>`, `${recordNotes?.button(record) || ""}${recordNotes?.historyButton(record) || ""}`)}</div>${record.expectedFrom ? `<div class="task-sub" title="${esc(record.expectedFrom)}">${esc(record.expectedFrom)}</div>` : ""}${record.latestUpdate ? `<div class="waiting-latest" title="${esc(record.latestUpdate)}">${esc(record.latestUpdate)}</div>` : ""}</div></div></td><td>${statusBadge(record)}</td><td class="waiting-last-col">${waitingLastControl(record)}</td><td class="waiting-next-col">${inlineFields?.followUpDateControl(record) || ""}</td><td class="waiting-age-col">${inlineFields?.waitingStartControl(record) || waitingAgeMarkup(record)}</td><td class="row-action-col"><div class="row-end-actions">${recordEditControl(record)}${workControl(record)}</div></td></tr>`).join("")}</tbody></table></div>`;
  }
  function progressDescription(r, p) {
    if (p.basis === "linked")
      return `${p.completed} / ${p.total} günlük iş tamamlandı`;
    if (p.basis === "rollup")
      return `${p.total} bağlı ${r.type === "monthly" ? "haftalık" : "aylık"} hedefin ortalaması`;
    if (p.basis === "metric")
      return `${r.currentValue ?? 0} / ${r.targetValue} ${r.metric || "hedef değeri"}`;
    return r.status === "completed" ? "Hedef tamamlandı" : "Henüz ilerleme yok";
  }
  function planningSuggestions() {
    return selectPlanningPrompts(state.records, {
      today: today(),
      query: state.search,
      runningRecordId: workSessions?.getRunningRecordId() || null,
      activity: workSessions?.activity?.() || null,
    });
  }
  const promptKinds = {
    goals: {
      key: "unplannedGoals",
      title: "Hedeflere adım planla",
      symbol: "target",
      description: "İstersen bu hedefleri günlük işlere bölebilirsin.",
    },
    waiting: {
      key: "waitingDetails",
      title: "Beklemeyi netleştir",
      symbol: "clock",
      description:
        "Kimden beklendiği veya sonraki takip tarihi eksik bekleyen konular; tarihsiz konular Takip gerekenler’de görünmez. İki haftadır hiç takip edilmemiş konularda son gelişme, beklemedeki işlerde bekleme nedeni de istenir.",
    },
    review: {
      key: "reviewRecords",
      title: "İşleri gözden geçir",
      symbol: "inbox",
      description:
        "En az 7 gündür güncellenmeyen ve üzerinde çalışılmayan açık işler. Hâlâ geçerliyse işaretle; 7 gün boyunca listede görünmez.",
    },
    previous: {
      key: "previousGoals",
      title: "Kalan hedefleri planla",
      symbol: "calendar",
      description:
        "Önceki hafta ve aylardan kalan hedefleri gözden geçir veya güncel dönemine taşı.",
    },
  };
  function stats() {
    const suggestions = planningSuggestions();
    const items = Object.entries(promptKinds).filter(
      ([, config]) => suggestions[config.key].length,
    );
    if (!items.length) return "";
    return `<section class="planning-prompts" aria-label="Planını netleştir"><h2>Planını netleştir</h2><div class="planning-prompt-actions">${items.map(([key, config]) => `<button type="button" class="planning-prompt" data-action="planning-prompt" data-prompt="${key}" title="${esc(config.description)}">${icon(config.symbol)}${config.title}<span class="planning-prompt-count">${suggestions[config.key].length}</span>${icon("arrow")}</button>`).join("")}</div></section>`;
  }
  function openPlanningPrompt(kind) {
    waitingInfo?.close();
    if (!promptKinds[kind]) return;
    planningPromptKind = kind;
    planningShowHidden = false;
    renderPlanningPrompt();
    const dialog = document.querySelector("#planning-prompts-dialog");
    if (!dialog.open) dialog.showModal();
  }
  const waitingGapLabels = {
    expectedFrom: "Kimden bekleniyor",
    nextFollowUpDate: "Sonraki takip tarihi",
    latestUpdate: "Son gelişme",
    waitingReason: "Bekleme nedeni",
  };
  function planningPromptDetail(record) {
    if (planningPromptKind === "previous")
      return `<small class="planning-prompt-period">${record.type === "monthly" ? "Aylık hedef" : "Haftalık hedef"} · ${esc(record.periodKey || "Önceki dönem")}</small>`;
    if (planningPromptKind === "waiting") {
      const gaps = waitingGaps(record, today());
      return gaps.length
        ? `<small class="planning-prompt-period planning-prompt-gaps">Eksik: ${gaps.map((gap) => esc(waitingGapLabels[gap])).join(" · ")}</small>`
        : "";
    }
    return "";
  }
  function planningPromptOptions() {
    return {
      today: today(),
      query: state.search,
      runningRecordId: workSessions?.getRunningRecordId() || null,
      activity: workSessions?.activity?.() || null,
    };
  }
  function promptDay(days) {
    const date = new Date(`${today()}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDate(date);
  }
  function hiddenPromptStatus(record) {
    const value = promptDismissal(record, planningPromptKind);
    if (value === "never") return "Bir daha önerilmeyecek";
    if (value === promptDay(1)) return "Yarın yeniden önerilecek";
    return `${formatDate(value)} tarihinde yeniden önerilecek`;
  }
  const morePromptIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>';
  function planningPromptMore(record) {
    return `<button type="button" class="btn small planning-prompt-more" data-action="planning-prompt-menu" data-id="${esc(record.id)}" data-prompt="${planningPromptKind}" aria-haspopup="menu" aria-expanded="false" aria-controls="planning-prompt-menu" aria-label="${esc(record.title)}: ertele veya gizle" title="Ertele veya gizle">${morePromptIcon}</button>`;
  }
  function planningPromptActions(record) {
    const open = `<button type="button" class="btn small" data-action="planning-prompt-record" data-id="${esc(record.id)}" data-prompt="${planningPromptKind}">${planningPromptKind === "waiting" ? "Bilgi ekle" : planningPromptKind === "review" ? "İşi aç" : "Hedefi aç"}${icon("arrow")}</button>`;
    if (planningPromptKind === "previous")
      return `${open}${carryPlanningButton(record, makePlanningPeriod(record.type, today()))}${planningPromptMore(record)}`;
    if (planningPromptKind === "review")
      return `<button type="button" class="btn small planning-review-keep" data-action="planning-review" data-review="keep" data-id="${esc(record.id)}" title="İş hâlâ geçerli; 7 gün boyunca bu listede görünmez">Hâlâ geçerli</button><button type="button" class="btn small" data-action="planning-review" data-review="completed" data-id="${esc(record.id)}">Tamamla</button><button type="button" class="btn small" data-action="planning-review" data-review="cancelled" data-id="${esc(record.id)}">İptal</button>${open}${planningPromptMore(record)}`;
    return `${open}${planningPromptMore(record)}`;
  }
  function renderPlanningPrompt() {
    if (!planningPromptKind) return;
    const config = promptKinds[planningPromptKind];
    const records = planningSuggestions()[config.key];
    const hidden = hiddenPlanningPrompts(
      state.records,
      planningPromptKind,
      planningPromptOptions(),
    );
    if (!hidden.length) planningShowHidden = false;
    const hiddenToggle = hidden.length
      ? `<button type="button" class="text-btn planning-hidden-toggle" data-action="planning-hidden-toggle" aria-expanded="${planningShowHidden}" aria-controls="planning-hidden-list">${planningShowHidden ? "Gizlenenleri sakla" : "Gizlenenleri göster"} (${hidden.length})</button>`
      : "";
    const hiddenList =
      planningShowHidden && hidden.length
        ? `<section class="planning-hidden" aria-label="Gizlenen öneriler"><h3>Gizlenen öneriler</h3><ul class="planning-prompt-list" id="planning-hidden-list">${hidden.map((record) => `<li data-hidden-record="${esc(record.id)}"><span>${esc(record.title)}<small class="planning-prompt-period">${esc(hiddenPromptStatus(record))}</small></span><div class="planning-prompt-row-actions"><button type="button" class="btn small" data-action="planning-prompt-restore" data-id="${esc(record.id)}" data-prompt="${planningPromptKind}">Yeniden öner</button></div></li>`).join("")}</ul></section>`
        : "";
    const dialog = document.querySelector("#planning-prompts-dialog");
    dialog.innerHTML = `<div class="modal-header"><h2>${config.title}</h2><button type="button" class="close-modal" data-action="close" aria-label="Pencereyi kapat">${icon("close")}</button></div><div class="modal-body"><p class="field-help">${config.description}</p>${records.length ? `<ul class="planning-prompt-list">${records.map((record) => `<li data-prompt-record="${esc(record.id)}"><span>${esc(record.title)}${planningPromptDetail(record)}</span><div class="planning-prompt-row-actions">${planningPromptActions(record)}</div></li>`).join("")}</ul>` : `<p class="soft-empty">Burada planlanacak kayıt kalmadı.</p>`}${hiddenList}</div><div class="modal-footer">${hiddenToggle}<button type="button" class="btn primary" data-action="close">Kapat</button></div><div id="planning-prompt-menu" class="quick-field-menu planning-prompt-menu" popover="auto" role="menu" aria-label="Öneriyi ertele veya gizle"></div>`;
  }
  function focusList() {
    const options = {
      today: today(),
      query: state.search,
      runningRecordId: workSessions?.getRunningRecordId() || null,
    };
    const all = selectCurrentWork(state.records, options);
    const records =
      state.focusFilter === "focus"
        ? selectDayFocus(state.records, options)
        : selectCurrentWork(state.records, {
            ...options,
            filter: state.focusFilter,
          });
    const counts = {
      open: all.length,
      today: all.filter((r) => r.dueDate === today()).length,
      overdue: all.filter((r) => isOverdue(r, today())).length,
      focus: selectDayFocus(state.records, options).length,
    };
    const emptyTitle = state.search
      ? "Eşleşen açık iş yok"
      : {
          open: "Açık günlük işin yok",
          focus: "Bugünün odağını seç",
          today: "Bugün teslim edilecek iş yok",
          overdue: "Geciken iş yok",
        }[state.focusFilter];
    const filters = `<div class="focus-filters" role="group" aria-label="Güncel iş filtresi">${[
      ["open", "Açık işler"],
      ["today", "Bugün teslim"],
      ["overdue", "Geciken"],
      ["focus", "Bugünün odağı"],
    ]
      .map(
        ([key, title]) =>
          `<button class="${state.focusFilter === key ? "active" : ""}" data-action="focus-filter" data-filter="${key}" aria-pressed="${state.focusFilter === key}">${title}<span>${counts[key]}${key === "focus" ? "/3" : ""}</span></button>`,
      )
      .join("")}</div>`;
    return `<section class="panel focus-panel"><div class="panel-header"><div class="focus-heading"><h2>Güncel işler</h2>${filters}${goalLinkReviewTrigger()}</div><button class="text-btn open-list" data-action="open-list" data-view="daily">Günlük işler ${icon("arrow")}</button></div>
    ${records.length ? `<ul class="focus-list" tabindex="0" aria-label="Güncel işler">${records.map((r) => `<li class="focus-row${r.focusDate === today() ? " is-day-focus" : ""}" ${recordRow(r)}>${completionControl(r)}<div class="focus-task"><div class="focus-title-line">${dayFocusButton(r)}${focusTitleContent(r)}</div></div>${statusBadge(r)}<span class="focus-priority">${inlineFields ? inlineFields.priorityControl(r) : priorityBadge(r)}</span><span class="focus-date ${deadlineTone(r, today())}">${inlineFields ? inlineFields.dateControl(r) : renderDeadlineChip(r, { label: formatDate(r.dueDate), today: today() })}</span><div class="focus-work-actions">${journalControl(r)}${workControl(r)}</div></li>`).join("")}</ul>` : `<div class="focus-empty${state.focusFilter === "focus" ? " day-focus-empty" : ""}"><h3>${emptyTitle}</h3><p>${state.search ? "Başka bir kelimeyle arayabilirsin." : state.focusFilter === "focus" ? "Açık işler listesindeki yıldızlarla bugün çalışacağın en fazla 3 işi seç. Teslim tarihleri değişmez." : state.focusFilter === "open" ? "Yeni kayıt düğmesiyle günlük iş ekleyebilirsin." : "Diğer açık işlerini Açık işler bölümünde görebilirsin."}</p></div>`}
    </section>`;
  }
  function dayFocusButton(record) {
    if (record.type !== "daily" || !active(record)) return "";
    const selected = record.focusDate === today();
    const full =
      !selected &&
      selectDayFocus(state.records, { today: today() }).length >= 3;
    const caption = selected
      ? "bugünün odağından çıkar"
      : "bugünün odağına ekle";
    return `<button type="button" class="day-focus-toggle${selected ? " is-selected" : ""}" data-action="toggle-day-focus" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ${caption}" aria-pressed="${selected}" title="${full ? "Bugünün odağına en fazla 3 iş seçebilirsin" : caption[0].toLocaleUpperCase("tr-TR") + caption.slice(1)}" ${full ? "disabled" : ""}>${icon("star")}</button>`;
  }
  function goalLinkReviewTrigger() {
    const count = proposeGoalLinks(state.records, {
      today: today(),
      query: state.search,
    }).length;
    return count
      ? `<button type="button" class="text-btn goal-links-review-trigger" data-action="review-goal-links" title="Eski hedef bağlantılarını gözden geçir">${icon("link")}Bağlantıları gözden geçir <span class="goal-link-review-count">${count}</span></button>`
      : "";
  }
  function openGoalLinkReview() {
    waitingInfo?.close();
    recordNotes?.close();
    closeStatusMenu();
    datePicker?.close();
    inlineFields?.close();
    choiceFields?.close();
    goalPanel?.close();
    goalLinkReviewEntries = proposeGoalLinks(state.records, {
      today: today(),
      query: state.search,
    });
    goalLinkReviewSaving = false;
    const candidates = state.records.filter(
      (record) =>
        record.type === "weekly" && active(record) && !isDailyInboxGoal(record),
    );
    const dialog = document.querySelector("#goal-links-review-dialog");
    dialog.innerHTML = `<form id="goal-links-review-form"><div class="modal-header"><h2>Hedef bağlantılarını gözden geçir</h2><button type="button" class="close-modal" data-action="close" aria-label="Pencereyi kapat">${icon("close")}</button></div><div class="modal-body"><p class="field-help">Bu günlük işler eski veya kapalı haftalık hedeflere bağlı. Yeni hedefi kontrol edip bağlamak istediklerini seç.</p>${goalLinkReviewEntries.length ? `<ul class="goal-link-review-list">${goalLinkReviewEntries.map((entry) => `<li data-review-record="${esc(entry.record.id)}"><label class="goal-link-review-choice"><input type="checkbox" name="applyLink" value="${esc(entry.record.id)}"><strong>${esc(entry.record.title)}</strong></label><p class="goal-link-review-current">Önceki hedef: ${entry.previousGoal ? `${esc(entry.previousGoal.title)} · ${esc(entry.previousGoal.periodKey || "Dönem belirtilmemiş")} (${esc(statusLabel("weekly", entry.previousGoal.status))})` : "Bağlı hedef bulunamadı"}</p><label class="goal-link-review-suggestion">Bağlanacak hedef<select name="goalTarget" data-id="${esc(entry.record.id)}"><option value="">Hedef seç</option>${candidates.map((goal) => `<option value="${esc(goal.id)}" ${entry.suggestedGoal?.id === goal.id ? "selected" : ""}>${esc(goal.title)}${goal.periodKey ? ` · ${esc(goal.periodKey)}` : ""}</option>`).join("")}</select></label><small class="goal-link-review-note">${entry.suggestedGoal ? "Aynı adlı açık hedef önerildi; seçiminle uygulanır." : "Tek bir eşleşme bulunamadı; uygun hedefi sen seçebilirsin."}</small></li>`).join("")}</ul>` : '<p class="soft-empty">Gözden geçirilecek eski bağlantı yok.</p>'}<p class="field-help">Durum, teslim tarihi ve çalışma geçmişi korunur. Sayısal hedefin ilerlemesi kendi ölçümünden hesaplanmaya devam eder.</p><p id="goal-links-review-error" class="error-message" role="alert" hidden></p></div><div class="modal-footer"><button type="button" class="btn" data-action="close">Vazgeç</button><button type="submit" class="btn primary" disabled>Bağlantıları uygula</button></div></form>`;
    if (!dialog.open) dialog.showModal();
  }
  function updateGoalLinkReviewSave() {
    const form = document.querySelector("#goal-links-review-form");
    if (!form) return;
    form.querySelector('[type="submit"]').disabled =
      goalLinkReviewSaving || !form.querySelector('[name="applyLink"]:checked');
  }
  function saveGoalLinkReview(form) {
    if (goalLinkReviewSaving) return;
    const error = form.querySelector("#goal-links-review-error");
    try {
      const chosen = [...form.querySelectorAll('[name="applyLink"]:checked')];
      if (!chosen.length) return;
      const changes = chosen.map((input) => {
        const entry = goalLinkReviewEntries.find(
          (item) => item.record.id === input.value,
        );
        if (!entry)
          throw new Error("Bağlantı listesi değişti; pencereyi yeniden aç.");
        const selected = input
          .closest("[data-review-record]")
          .querySelector('[name="goalTarget"]').value;
        return {
          recordId: entry.record.id,
          fromParentId: entry.record.parentId,
          toParentId: selected,
        };
      });
      const next = applyGoalLinks(state.records, changes);
      goalLinkReviewSaving = true;
      updateGoalLinkReviewSave();
      if (saveRecords(next, "Hedef bağlantılarını güncelleme")) {
        document.querySelector("#goal-links-review-dialog").close();
        toast(`${changes.length} hedef bağlantısı güncellendi.`);
      } else {
        error.textContent =
          "Bağlantılar kaydedilemedi. Güncel kayıtları kontrol edip yeniden dene.";
        error.hidden = false;
      }
    } catch (failure) {
      error.textContent = failure.message || "Bağlantılar güncellenemedi.";
      error.hidden = false;
    } finally {
      goalLinkReviewSaving = false;
      updateGoalLinkReviewSave();
    }
  }
  function sourceContextControl(
    record,
    parts = recordContextParts(record, state.records),
  ) {
    const reference = parts.find(
      (part) => part.kind === "source" && part.targetId,
    );
    const source =
      reference && state.records.find((item) => item.id === reference.targetId);
    if (!source) return "";
    const caption = `${source.type === "meeting" ? "Toplantı" : "Bekleyen konu"}: ${source.title}`;
    return `<button type="button" class="record-context-link record-source-link" data-context-kind="source" data-source-type="${esc(source.type)}" data-action="${source.type === "meeting" ? "meeting-record-details" : "waiting-record-details"}" data-id="${esc(source.id)}" data-record-link-tooltip="${esc(caption)}" aria-label="${esc(caption)}: kaynak kaydı aç" aria-haspopup="dialog" aria-controls="${source.type === "meeting" ? "meeting-record-panel" : "waiting-record-panel"}">${icon(source.type === "meeting" ? "people" : "clock")}</button>`;
  }
  function parentTitleControl(
    record,
    parts = recordContextParts(record, state.records),
  ) {
    const parent = parts.find(
      (part) => part.kind === "parent" && part.targetId,
    );
    const target =
      parent && state.records.find((item) => item.id === parent.targetId);
    if (!target) return "";
    const role = {
      weekly: "Haftalık hedef",
      monthly: "Aylık hedef",
      yearly: "Senelik hedef",
    }[target.type];
    const caption = `${role}: ${target.title}`;
    return `<button type="button" class="record-context-link record-parent-link" data-context-kind="parent" data-action="goal-details" data-id="${esc(target.id)}" data-record-link-tooltip="${esc(caption)}" aria-label="${esc(caption)}: üst hedefi aç" aria-haspopup="dialog" aria-controls="goal-detail-panel">${icon("target")}</button>`;
  }
  function focusTitleContent(record) {
    return `<div class="record-title-content"><button class="focus-title${record.status === "cancelled" ? " cancelled" : ""}" data-action="edit" data-id="${esc(record.id)}" title="${esc(record.title)}">${esc(record.title)}</button>${parentTitleControl(record)}${sourceContextControl(record)}${waitingInfo?.button(record) || ""}${recordNotes?.button(record) || ""}</div>`;
  }
  function recordTitleContent(record, title, extras = "", parts) {
    const parent = parentTitleControl(record, parts);
    const source = sourceContextControl(record, parts);
    const waiting = waitingInfo?.button(record) || "";
    return parent || source || waiting
      ? `<div class="record-title-content">${title}${parent}${source}${waiting}${extras}</div>`
      : `${title}${extras}`;
  }
  function parentContextLabel(text) {
    return `${icon("target")}<span class="record-context-text">${esc(text)}</span>`;
  }
  function weeklyDashboardPanel(pageSize = dashboardCardColumns()) {
    const {
      records: weekRecords,
      total,
      period,
      isUpcoming,
    } = selectDashboardWeek(state.records, {
      today: today(),
      query: state.search,
      limit: Infinity,
    });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    state.weeklyPage = Math.max(1, Math.min(pageCount, state.weeklyPage));
    const start = (state.weeklyPage - 1) * pageSize;
    const records = weekRecords.slice(start, start + pageSize);
    const pagination =
      pageCount > 1
        ? `<nav class="weekly-goal-pagination" aria-label="Haftalık hedef kartı sayfaları"><button type="button" class="weekly-goal-prev" data-action="weekly-goal-page" data-page="${state.weeklyPage - 1}" aria-label="Önceki hedefler" title="Önceki hedefler" ${state.weeklyPage === 1 ? "disabled" : ""}>${icon("arrow")}</button><span class="weekly-goal-page-label" aria-live="polite">Sayfa ${state.weeklyPage} / ${pageCount}</span><button type="button" data-action="weekly-goal-page" data-page="${state.weeklyPage + 1}" aria-label="Sonraki hedefler" title="Sonraki hedefler" ${state.weeklyPage === pageCount ? "disabled" : ""}>${icon("arrow")}</button></nav>`
        : "";
    const nextWeek = shiftPlanningPeriod(
      makePlanningPeriod("weekly", today()),
      1,
    );
    const weekCaption = isUpcoming
      ? `${period.key === nextWeek.key ? "Gelecek hafta" : "Sıradaki hafta"} · ${period.label}`
      : period.label;
    return `<section class="panel weekly-dashboard-panel"><div class="panel-header dashboard-panel-header"><div class="dashboard-panel-heading"><h2>${isUpcoming ? "Yaklaşan haftanın hedefleri" : "Bu haftanın hedefleri"}<span class="dashboard-panel-count">${total}</span></h2></div>${pagination}<button type="button" class="text-btn dashboard-panel-link" data-action="dashboard-weekly" data-week="${esc(period.key)}" title="${esc(weekCaption)}">Haftalık plan ${icon("arrow")}</button></div>
      ${
        records.length
          ? `<ul class="dashboard-goals" tabindex="0" aria-label="Haftalık hedefler">${records
              .map((record) => {
                const progress = goalProgress(record, state.records);
                const progressCount = ["metric", "linked"].includes(
                  progress.basis,
                )
                  ? ` · ${progress.completed} / ${progress.total}`
                  : "";
                const children = state.records.filter(
                  (item) =>
                    item.type === "daily" && item.parentId === record.id,
                );
                return `<li class="dashboard-goal-row dashboard-detail-card" role="group" tabindex="0" data-action="goal-card-details" data-id="${esc(record.id)}" data-goal-id="${esc(record.id)}" aria-label="${esc(record.title)}: ayrıntıları aç" aria-keyshortcuts="Enter Space"><div class="dashboard-goal-title-line"><strong class="dashboard-goal-title${record.status === "cancelled" ? " cancelled" : ""}" title="${esc(record.title)}">${esc(record.title)}</strong></div><div class="dashboard-goal-meta-controls">${statusBadge(record)}${lifecycleDateControl(record)}</div><div class="dashboard-goal-progress"><div class="progress-track" role="progressbar" aria-label="${esc(record.title)} ilerlemesi" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="%${progress.percent} · ${esc(progressDescription(record, progress))}"><span style="width:${progress.percent}%"></span></div><span class="goal-progress-label" title="${esc(progressDescription(record, progress))}">%${progress.percent}${esc(progressCount)}</span></div><div class="dashboard-goal-actions"><button type="button" class="btn small dashboard-goal-progress-action" data-action="goal-progress-open" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ilerleme">İlerleme</button><button type="button" class="btn small dashboard-goal-children-action" data-action="goal-children-open" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: bağlı işler, ${children.length} adım">Bağlı işler <span class="dashboard-goal-count">${children.length}</span></button></div></li>`;
              })
              .join("")}</ul>`
          : `<div class="weekly-dashboard-empty"><p>${state.search ? "Eşleşen haftalık hedef yok." : "Bu hafta için açık hedef yok."}</p><button type="button" class="btn" data-action="dashboard-weekly">Hedef seç</button></div>`
      }
      </section>`;
  }
  function dashboardCardColumns() {
    return 2;
  }
  function attentionPanel(pageSize = dashboardCardColumns()) {
    const { records, total } = selectAttention(state.records, {
      today: today(),
      query: state.search,
      limit: Infinity,
    });
    state.attentionPageSize = pageSize;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    state.attentionPage = Math.max(1, Math.min(pageCount, state.attentionPage));
    const start = (state.attentionPage - 1) * pageSize;
    const shown = records.slice(start, start + pageSize);
    const end = new Date(`${today()}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 3);
    const nearEnd = end.toISOString().slice(0, 10);
    const cards = shown.map((record) => {
      const date = record.nextFollowUpDate;
      const near = date >= today() && date <= nearEnd;
      const dateControl = inlineFields?.followUpDateControl(record) || "";
      const linkedDailyCount = linkedActions(record.id, state.records).filter(
        (item) => item.type === "daily",
      ).length;
      const lastFollowUp = record.lastFollowUpDate
        ? lastFollowUpMarkup(record)
        : `<span class="waiting-last-date" title="${record.followUpLog?.length ? "Son takip tarihi yok" : "Henüz takip edilmedi"}">—</span>`;
      return `<li class="followup-row dashboard-detail-card" role="group" tabindex="0" data-action="waiting-record-details" data-record-row data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ayrıntıları aç" aria-keyshortcuts="Enter Space"><div class="followup-title-line"><button type="button" class="followup-title" data-action="waiting-record-details" data-id="${esc(record.id)}">${esc(record.title)}</button></div><div class="followup-meta">${statusBadge(record)}<span class="attention-date${near ? " attention-date-near" : ""}" data-attention-date="${esc(date)}">${dateControl}</span></div><div class="followup-tracking"><button type="button" class="followup-wait-info followup-detail-trigger" data-action="waiting-record-details" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: bekleme ve son takip ayrıntılarını aç"><span class="followup-fact" data-followup-fact="age"><span class="followup-fact-label">Bekleme</span>${waitingAgeMarkup(record)}</span><span class="followup-fact" data-followup-fact="last"><span class="followup-fact-label">Son takip</span><span class="followup-last">${lastFollowUp}</span></span></button><div class="followup-card-actions">${waitingFollowUps?.button(record, { compact: true }) || ""}<button type="button" class="btn small followup-children-action" data-action="waiting-children-open" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: bağlı işler, ${linkedDailyCount} iş" aria-haspopup="dialog" aria-controls="waiting-record-panel">Bağlı işler <span class="followup-children-count">${linkedDailyCount}</span></button></div></div></li>`;
    });
    return `<section class="panel attention-panel"><div class="followup-header dashboard-panel-header"><div class="dashboard-panel-heading"><h2>Takip gerekenler<span class="dashboard-panel-count">${total}</span></h2></div>${pageCount > 1 ? `<nav class="attention-pagination" aria-label="Takip kartı sayfaları"><button type="button" class="attention-prev" data-action="attention-page" data-page="${state.attentionPage - 1}" aria-label="Önceki takipler" title="Önceki takipler" ${state.attentionPage === 1 ? "disabled" : ""}>${icon("arrow")}</button><span class="attention-page-label" aria-live="polite">Sayfa ${state.attentionPage} / ${pageCount}</span><button type="button" data-action="attention-page" data-page="${state.attentionPage + 1}" aria-label="Sonraki takipler" title="Sonraki takipler" ${state.attentionPage === pageCount ? "disabled" : ""}>${icon("arrow")}</button></nav>` : ""}<button type="button" class="text-btn open-list dashboard-panel-link" data-action="open-list" data-view="waiting">Bekleyen konular ${icon("arrow")}</button></div>${records.length ? `<ul class="attention-list followup-list" tabindex="0" aria-label="Takip gereken kartlar">${cards.join("")}</ul>` : '<div class="followup-empty">Yaklaşan takip yok.</div>'}</section>`;
  }
  function dashboard() {
    const columns = dashboardCardColumns();
    return `${stats()}<div class="dashboard-workspace dashboard-rows" data-card-columns="${columns}" style="--dashboard-card-columns:${columns}"><div class="dashboard-top-row"><div class="dashboard-main-column">${focusList()}</div><aside class="dashboard-followups">${dashboardCalendar?.render() || ""}</aside></div><div class="dashboard-bottom-row">${attentionPanel(columns)}${weeklyDashboardPanel(columns)}${workspaceNotes?.render() || ""}</div></div>`;
  }
  function planningPeriodBar() {
    if (!Object.hasOwn(state.planningPeriods, state.view)) return "";
    const selected = state.planningPeriods[state.view];
    const current = makePlanningPeriod(state.view, today());
    const names = {
      weekly: { current: "Bu hafta", all: "Tüm haftalar", unit: "hafta" },
      monthly: { current: "Bu ay", all: "Tüm aylar", unit: "ay" },
      yearly: { current: "Bu yıl", all: "Tüm yıllar", unit: "yıl" },
    }[state.view];
    return `<div class="planning-periodbar"><div class="period-navigation" role="group" aria-label="Dönem seçimi"><button type="button" class="period-prev" data-action="period-prev" aria-label="Önceki ${names.unit}">${icon("chevron")}</button><span class="period-label" id="planning-period-label" role="status" aria-live="polite">${esc(selected?.label || names.all)}</span><button type="button" class="period-next" data-action="period-next" aria-label="Sonraki ${names.unit}">${icon("chevron")}</button></div><div class="period-shortcuts"><button type="button" class="period-current" data-action="period-current" aria-pressed="${selected?.key === current.key}">${names.current}</button><button type="button" class="period-all" data-action="period-all" aria-pressed="${selected === null}">${names.all}</button></div></div>`;
  }
  function filterControl(id, caption, accessibleLabel, choices, activeFilter) {
    return renderFilterControl(
      id,
      caption,
      accessibleLabel,
      choices,
      activeFilter,
    );
  }
  function hasListFilters() {
    return (
      state.status !== "all" ||
      (!["meeting", "waiting"].includes(state.view) &&
        state.priority !== "all") ||
      (state.view !== "meeting" && state.period !== "all") ||
      (state.view === "daily" && state.workContext !== "all") ||
      state.onlyUnlinked
    );
  }
  function matchesListFilters(record) {
    if (record.type !== state.view) return false;
    if (state.listScope === "open" && !active(record)) return false;
    if (
      state.listScope === "completed" &&
      statusForDisplay(record.status, record.type) !== "completed"
    )
      return false;
    return (
      (state.view !== "daily" ||
        state.workContext === "all" ||
        (state.workContext === "ad_hoc"
          ? record.workContext === "ad_hoc"
          : record.workContext !== "ad_hoc")) &&
      (!state.onlyUnlinked || unresolved(record)) &&
      matchesSearch(record) &&
      (state.status === "all" ||
        statusForDisplay(record.status, record.type) === state.status) &&
      (["meeting", "waiting"].includes(state.view) ||
        state.priority === "all" ||
        record.priority === state.priority) &&
      (["yearly", "meeting"].includes(state.view) ||
        periodMatch(record, state.period))
    );
  }
  function carryWeeklyButton(record, target, compact = false) {
    const isCurrent = target.key === makePlanningPeriod("weekly", today()).key;
    const title = isCurrent ? "Bu haftaya taşı" : "Seçili haftaya taşı";
    return `<button type="button" class="carry-weekly${compact ? " is-compact row-icon-action" : ""}" data-action="carry-weekly" data-id="${esc(record.id)}" data-week="${esc(target.key)}" aria-label="${esc(record.title)}: ${title.toLocaleLowerCase("tr-TR")}" title="${esc(title)}">${icon("arrow")}${compact ? "" : `<span>${title}</span>`}</button>`;
  }
  function carryMonthlyButton(record, target, compact = false) {
    const isCurrent = target.key === makePlanningPeriod("monthly", today()).key;
    const title = isCurrent ? "Bu aya taşı" : "Seçili aya taşı";
    return `<button type="button" class="carry-weekly carry-monthly${compact ? " is-compact row-icon-action" : ""}" data-action="carry-monthly" data-id="${esc(record.id)}" data-month="${esc(target.key)}" aria-label="${esc(record.title)}: ${title.toLocaleLowerCase("tr-TR")}" title="${esc(title)}">${icon("arrow")}${compact ? "" : `<span>${title}</span>`}</button>`;
  }
  function carryPlanningButton(record, target, compact = false) {
    return record.type === "monthly"
      ? carryMonthlyButton(record, target, compact)
      : carryWeeklyButton(record, target, compact);
  }
  function planningBacklog() {
    const monthly = state.view === "monthly";
    if (!monthly && state.view !== "weekly") return "";
    const selected = state.planningPeriods[state.view];
    if (!selected) return "";
    const records = (
      monthly
        ? previousMonthlyGoals(state.records, selected)
        : previousWeeklyGoals(state.records, selected)
    ).filter(matchesListFilters);
    if (!monthly) records.sort(dueSort);
    if (!records.length) return "";
    const expanded = monthly
      ? state.monthlyBacklogOpen
      : state.weeklyBacklogOpen;
    const title = monthly ? "Önceki aylardan" : "Önceki haftalardan";
    return `<details class="weekly-backlog${monthly ? " monthly-backlog" : ""}" ${expanded ? "open" : ""}><summary>${icon("undo")}<span>${title}</span><span class="backlog-count">${records.length}</span>${icon("down")}</summary><div class="weekly-backlog-body"><p>Açık hedefler burada bekler. Taşıdığında ilerlemesi ve bağlı işleriyle aynı hedef devam eder.</p><ul>${records.map((record) => `<li data-${monthly ? "monthly" : "weekly"}-backlog-id="${esc(record.id)}"><div class="backlog-task"><button class="backlog-title" type="button" data-action="edit" data-id="${esc(record.id)}">${esc(record.title)}</button><span>${esc(record.periodKey || (monthly ? "Önceki ay" : "Önceki hafta"))}</span></div>${statusBadge(record)}${carryPlanningButton(record, selected)}</li>`).join("")}</ul></div></details>`;
  }
  function planningEmpty() {
    const selected = state.planningPeriods[state.view];
    const filtered =
      state.search || state.priority !== "all" || state.period !== "all";
    const title = filtered
      ? "Filtrelerle eşleşen hedef yok"
      : state.status === "transferred"
        ? "Bu görünümde arşivlenmiş hedef yok"
        : state.listScope === "completed"
          ? "Bu görünümde tamamlanan hedef yok"
          : selected
            ? state.view === "monthly"
              ? "Seçili ayda hedef yok"
              : "Seçili haftada hedef yok"
            : "Bu görünümde hedef yok";
    return `<div class="weekly-empty" role="status">${icon("calendar")}<p>${title}</p></div>`;
  }
  function effectiveListSort() {
    return ["yearly", "meeting"].includes(state.view) &&
      state.listSort.startsWith("due-")
      ? "created-desc"
      : state.listSort;
  }
  function listToolbar() {
    const meeting = state.view === "meeting";
    return `<div class="list-view-toolbar"><div class="list-scope-tabs" role="group" aria-label="Kayıt görünümü">${[
      ["open", "Açık"],
      ["completed", meeting ? "Kapalı" : "Tamamlanan"],
      ["all", "Tümü"],
    ]
      .map(
        ([scope, title]) =>
          `<button type="button" data-action="list-scope" data-scope="${scope}" aria-pressed="${state.listScope === scope}">${title}</button>`,
      )
      .join("")}</div></div>`;
  }
  function listSortControl() {
    const dateLabel = state.view === "waiting" ? "Takip" : "Teslim";
    const choices = [
      ["created-desc", "Oluşturma · en yeni"],
      ["created-asc", "Oluşturma · en eski"],
      ...(["yearly", "meeting"].includes(state.view)
        ? []
        : [
            ["due-asc", `${dateLabel} · yakın önce`],
            ["due-desc", `${dateLabel} · uzak önce`],
          ]),
    ];
    const selected = effectiveListSort();
    const caption = choices.find(([value]) => value === selected)?.[1];
    const title = `Sırala: ${caption || choices[0][1]}`;
    return `<label class="list-sort" title="${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"/></svg><select id="list-sort" aria-label="Kayıtları sırala" title="${esc(title)}">${choices
      .map(
        ([value, title]) =>
          `<option value="${value}" ${selected === value ? "selected" : ""}>${title}</option>`,
      )
      .join("")}</select></label>`;
  }
  function listPagination(page) {
    if (page.pageCount <= 1) return "";
    return `<nav class="list-pagination" aria-label="Kayıt sayfaları"><span class="pagination-summary">${page.start}–${page.end} / ${page.total} kayıt</span><button type="button" data-action="list-page" data-page="${page.page - 1}" aria-label="Önceki sayfa" ${page.page === 1 ? "disabled" : ""}>Önceki</button><span>Sayfa ${page.page} / ${page.pageCount}</span><button type="button" data-action="list-page" data-page="${page.page + 1}" aria-label="Sonraki sayfa" ${page.page === page.pageCount ? "disabled" : ""}>Sonraki</button></nav>`;
  }
  function listPage() {
    const pendingGoalLinks = state.records.filter(
      (record) => unresolved(record) && active(record) && matchesSearch(record),
    );
    const filteredRecords = state.records
      .map(effectiveRecord)
      .filter(
        (r) =>
          matchesListFilters(r) &&
          matchesPlanningPeriod(r, state.planningPeriods[state.view]),
      );
    const page = paginateRecords(
      sortListRecords(filteredRecords, effectiveListSort(), {
        dateField: state.view === "waiting" ? "nextFollowUpDate" : "dueDate",
      }),
      state.listPage,
    );
    state.listPage = page.page;
    const records = page.records;
    const pendingInbox =
      state.view === "daily" &&
      migrateDailyInbox(state.records) !== state.records;
    const contextFilter =
      state.view === "daily"
        ? filterControl(
            "work-context-filter",
            "İş grubu",
            "İş bağlamına göre filtrele",
            [
              ["all", "Tüm işler"],
              ["planned", "Planlı işler"],
              ["ad_hoc", "Anlık işler"],
            ]
              .map(
                ([key, value]) =>
                  `<option value="${key}" ${state.workContext === key ? "selected" : ""}>${value}</option>`,
              )
              .join(""),
            state.workContext !== "all",
          )
        : "";
    const statusChoices = statusesForType(
      state.view,
      state.records
        .filter((r) => r.type === state.view)
        .map(effectiveRecord)
        .map((r) => r.status),
    );
    if (state.view === "weekly" && statusChoices.transferred)
      statusChoices.transferred = { label: "Arşivlenenler" };
    if (state.view !== "meeting" || state.listScope === "open")
      delete statusChoices.completed;
    if (state.listScope === "open")
      for (const key of ["cancelled", "transferred"]) delete statusChoices[key];
    const statusFilter =
      state.listScope === "completed"
        ? ""
        : filterControl(
            "status-filter",
            "Durum",
            "Duruma göre filtrele",
            `<option value="all" ${state.status === "all" ? "selected" : ""}>Tüm durumlar</option>${options(
              statusChoices,
              state.status,
            )}`,
            state.status !== "all",
          );
    const priorityFilter = ["meeting", "waiting"].includes(state.view)
      ? ""
      : filterControl(
          "priority-filter",
          "Öncelik",
          "Önceliğe göre filtrele",
          `<option value="all">Tüm öncelikler</option>${options(PRIORITIES, state.priority)}`,
          state.priority !== "all",
        );
    const dateChoices = [
      ["all", state.view === "waiting" ? "Tüm takipler" : "Tüm tarihler"],
      ...(state.view === "waiting" ? [["followup", "Takip gerekenler"]] : []),
      ["today", state.view === "waiting" ? "Bugün takip" : "Bugün teslim"],
      ...(["daily", "waiting"].includes(state.view)
        ? [["soon", "3 gün içinde"]]
        : []),
      ["week", state.view === "waiting" ? "Bu hafta takip" : "Bu hafta teslim"],
      ["overdue", "Gecikenler"],
      ...(state.view === "daily"
        ? [["review", "7 gündür güncellenmeyen"]]
        : []),
      ...(state.view === "waiting" ? [["unscheduled", "Takip planı yok"]] : []),
    ];
    const dateFilter = ["yearly", "meeting"].includes(state.view)
      ? ""
      : filterControl(
          "period-filter",
          state.view === "waiting" ? "Takip" : "Termin",
          state.view === "waiting"
            ? "Takip tarihine göre filtrele"
            : "Teslim tarihine göre filtrele",
          dateChoices
            .map(
              ([key, value]) =>
                `<option value="${key}" ${state.period === key ? "selected" : ""}>${value}</option>`,
            )
            .join(""),
          state.period !== "all",
        );
    const contextBanner = pendingInbox
      ? '<div class="daily-context-banner"><span>Eski Pop-Up işleri haftalık hedeften ayırıp Anlık işler grubunda takip edebilirsin.</span><button type="button" class="text-btn" data-action="migrate-daily-inbox">Anlık işlere taşı</button></div>'
      : "";
    return `<section class="panel">${planningPeriodBar()}<div class="list-controls-bar">${listToolbar()}<div class="filters">${contextFilter}${statusFilter}${priorityFilter}${dateFilter}${hasListFilters() ? `<button type="button" class="clear-filters" data-action="clear-filters" aria-label="Liste filtrelerini temizle">${icon("close")}Temizle</button>` : ""}<span class="result-count">${state.search ? `“${esc(state.search)}” için ` : ""}${page.total} sonuç</span></div>${listSortControl()}</div>${contextBanner}${state.view === "daily" && state.listScope !== "completed" && pendingGoalLinks.length ? `<div class="link-warning">${icon("link")}<span>${pendingGoalLinks.length} açık işin hedef bağlantısı eksik.</span><button type="button" class="text-btn" data-action="unlinked">${state.onlyUnlinked ? "Tüm açık işleri göster" : "Bu işleri göster"}</button></div>` : ""}${state.view === "weekly" && state.status === "transferred" ? '<p class="weekly-archive-note">Eski hafta aktarımları. İlerleme ve bağlı işler bu kayıtlarda korunur.</p>' : ""}${planningBacklog()}${["weekly", "monthly"].includes(state.view) && !records.length ? planningEmpty() : table(records)}${listPagination(page)}<button class="add-inline" data-action="new">${icon("plus")}Yeni kayıt ekle</button></section>`;
  }
  function render() {
    renderedCalendarDay = today();
    applyPreferences();
    updateUndoButton();
    document.querySelector("#nav").innerHTML =
      `<button data-action="view" data-view="dashboard" class="${state.view === "dashboard" ? "active" : ""}" ${state.view === "dashboard" ? 'aria-current="page"' : ""}>${icon("grid")}Genel bakış</button><div class="nav-separator"></div>${Object.entries(
        TYPES,
      )
        .map(
          ([type, value]) =>
            `<button data-action="view" data-view="${type}" ${type === "weekly" ? 'title="Tüm haftalardaki açık hedefler"' : ""} class="${state.view === type ? "active" : ""}" ${state.view === type ? 'aria-current="page"' : ""}>${icon(typeIcons[type])}${esc(value.label)}<span class="count">${state.records.map(effectiveRecord).filter((r) => r.type === type && active(r)).length}</span></button>`,
        )
        .join("")}`;
    updatePageHeader();
    topbarClock.refresh();
    document.title = `${pageTitle()} · ${APP_NAME}`;
    renderContent();
    renderedWorkspaceDomain = workspaceDomainSnapshot(
      state.records,
      preferences,
    );
  }
  function renderContent() {
    const previousAgenda = document.querySelector(
      ".dashboard-calendar .calendar-agenda-entries",
    );
    const previousAgendaDay = previousAgenda?.dataset.calendarSelected;
    const previousAgendaScroll = previousAgenda?.scrollTop || 0;
    document
      .querySelector(".main")
      .classList.toggle("is-dashboard", state.view === "dashboard");
    closeStatusMenu();
    datePicker?.close();
    choiceFields?.close();
    inlineFields?.close();
    summaryWidget?.refresh();
    document
      .querySelector("#content")
      .classList.toggle("dashboard-content", state.view === "dashboard");
    document.querySelector("#content").innerHTML =
      `${state.view === "dashboard" ? dashboard() : listPage()}${state.view === "dashboard" ? "" : `<footer class="page-footer"><span>Biraz düzen, daha çok odak.</span><span><span class="footer-dot"></span>Kişisel alanın · Bu tarayıcıda saklanır</span></footer>`}`;
    workSessions?.refresh();
    workJournal?.refresh();
    goalPanel?.refresh();
    goalTransfers?.refresh();
    waitingFollowUps?.refresh();
    waitingRecordPanel?.refresh();
    meetingRecordPanel?.refresh();
    waitingDetails?.refresh();
    waitingInfo?.refresh();
    recordNotes?.refresh();
    workspaceNotes?.refresh();
    meetingBoth?.refresh();
    recordCreation?.refresh();
    dashboardCalendar?.refresh();
    const currentAgenda = document.querySelector(
      ".dashboard-calendar .calendar-agenda-entries",
    );
    if (
      currentAgenda &&
      currentAgenda.dataset.calendarSelected === previousAgendaDay
    )
      currentAgenda.scrollTop = previousAgendaScroll;
    if (document.querySelector("#planning-prompts-dialog")?.open)
      renderPlanningPrompt();
  }
  function refreshDashboardRunningOrder() {
    if (
      state.view !== "dashboard" &&
      !(state.view === "daily" && state.period === "review")
    ) {
      dashboardOrderPending = false;
      return;
    }
    if (document.querySelector("dialog:modal, :popover-open")) {
      dashboardOrderPending = true;
      return;
    }
    dashboardOrderPending = false;
    const focused = document.activeElement;
    const control = focused?.closest?.("[data-action]");
    const action = control?.dataset.action;
    const id = control?.dataset.id;
    const agenda = control?.dataset.agenda;
    renderContent();
    if (focused?.isConnected) focused.focus({ preventScroll: true });
    else if (action) {
      const selector = `[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : agenda ? `[data-agenda="${CSS.escape(agenda)}"]` : ""}`;
      document.querySelector(selector)?.focus({ preventScroll: true });
    }
  }
  function refreshCalendarDay() {
    if (!renderedCalendarDay || renderedCalendarDay === today()) return;
    if (document.querySelector("dialog:modal, :popover-open")) return;
    renderedCalendarDay = today();
    render();
  }
  function navigate(view) {
    closeRecordPreviews();
    state.view = view;
    state.attentionPage = 1;
    state.weeklyPage = 1;
    if (view === "dashboard") state.focusFilter = "open";
    state.onlyUnlinked = false;
    state.status = "all";
    state.listScope = "open";
    state.listPage = 1;
    state.priority = "all";
    state.period = "all";
    state.workContext = "all";
    document
      .querySelector(".mobile-toggle")
      .setAttribute("aria-expanded", "false");
    document.querySelector(".sidebar").classList.remove("open");
    document.querySelector(".mobile-backdrop").classList.remove("open");
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function editorExtras(record, type) {
    const r = record || {};
    const input = (key, title, inputType = "text", placeholder = "") =>
      `<label class="field">${title}${inputType === "date" ? dateInput({ name: key, value: r[key] || "", label: title }) : `<input type="${inputType}" name="${key}" value="${esc(r[key] ?? "")}" ${inputType === "number" ? 'step="any" min="0"' : ""} placeholder="${placeholder}">`}</label>`;
    const area = (key, title) =>
      `<label class="field full">${title}<textarea name="${key}" maxlength="10000">${esc(r[key] || "")}</textarea></label>`;
    const group = (name, types, body) =>
      `<div class="extra-group form-grid" data-types="${types.join(",")}" ${!types.includes(type) ? "hidden" : ""}><div class="extra-heading">${name}</div>${body}</div>`;
    return `
    ${group("Proje ve iş türü", ["daily"], `${choiceField({ name: "projectCode", label: "Proje kodu", value: r.projectCode || "", placeholder: "Proje kodu yaz veya seç" })}${choiceField({ name: "workType", label: "İş türü", value: r.workType || "", placeholder: "İş türü yaz veya seç" })}`)}
    ${group("Hedef ve ölçüm", ["weekly", "monthly", "yearly"], `${renderEditorPeriodMarkup({ type, periodKey: r.periodKey || "", today: today() })}${input("metric", "Ölçülebilir çıktı", "text", "Örn. Tamamlanan rapor sayısı")}${input("targetValue", "Hedef değer", "number")}${input("currentValue", "Mevcut değer", "number")}<p class="field-help full">İlerleme ölçümden veya bağlı kayıtlardan hesaplanır.</p>${area("variance", "Sapma / neden")}`)}
    ${group("Toplantı bilgileri", ["meeting"], `${input("participants", "Katılımcılar")}${area("decision", "Alınan karar")}`)}
    ${group("Takip bilgileri", ["waiting"], `${input("expectedFrom", "Kimden bekleniyor?")}${input("lastFollowUpDate", "Son takip tarihi", "date")}${input("nextFollowUpDate", "Sonraki takip tarihi", "date")}${area("latestUpdate", "Son gelişme")}`)}
  `;
  }
  function editorStatusOptions(type, selected, extraStatuses = []) {
    return Object.entries(statusesForType(type, extraStatuses))
      .filter(
        ([key]) =>
          type !== "meeting" ||
          isStatusSelectable(type, key) ||
          key === selected,
      )
      .map(
        ([key, value]) =>
          `<option value="${esc(key)}" ${key === selected ? "selected" : ""} ${isStatusSelectable(type, key) ? "" : "disabled"}>${esc(value.label)}</option>`,
      )
      .join("");
  }
  function updateEditorType(type) {
    document.querySelector("#context-field").hidden = type !== "daily";
    document.querySelector('[name="workContext"]').disabled = type !== "daily";
    updateEditorContext();
    updateHigherGoalOptions();
    const form = document.querySelector("#record-form");
    const record = state.records.find((r) => r.id === form.elements.id.value);
    const select = form.elements.status;
    const choices = statusesForType(
      type,
      record?.type === type ? [record.status] : [],
    );
    const selected = Object.hasOwn(choices, select.value)
      ? select.value
      : Object.keys(choices)[0];
    select.innerHTML = editorStatusOptions(
      type,
      selected,
      record?.type === type ? [record.status] : [],
    );
    if (
      !record &&
      (!form.elements.periodKey.value ||
        form.elements.periodKey.value === form.dataset.autoPeriod)
    ) {
      const periodKey = Object.hasOwn(state.planningPeriods, type)
        ? (state.planningPeriods[type] || makePlanningPeriod(type, today())).key
        : "";
      form.elements.periodKey.value = periodKey;
      form.dataset.autoPeriod = periodKey;
    }
    for (const group of document.querySelectorAll(".extra-group"))
      group.hidden = !group.dataset.types.split(",").includes(type);
    updateEditorDetails();
  }
  function updateEditorDetails() {
    const form = document.querySelector("#record-form");
    if (!form) return;
    const type = form.querySelector('select[name="type"]').value;
    const daily = type === "daily";
    const yearly = type === "yearly";
    const waiting = type === "waiting";
    const meeting = type === "meeting";
    const existing = state.records.find(
      (record) => record.id === form.elements.id.value,
    );
    const linkedMeeting = Boolean(meetingTarget(existing));
    form.querySelector("#owner-field").hidden = type !== "meeting";
    form.elements.owner.disabled = !meeting;
    const deadlineField = form.querySelector("#deadline-field");
    deadlineField.hidden = yearly || waiting || meeting;
    form.elements.dueDate.disabled =
      yearly || waiting || meeting || linkedMeeting;
    deadlineField.querySelector("button").disabled =
      yearly || waiting || meeting || linkedMeeting;
    for (const name of ["nextFollowUpDate", "latestUpdate"])
      form.elements[name].disabled = !waiting;
    const dateCaption = waiting
      ? "Beklemeye başlama tarihi"
      : meeting
        ? "Toplantı tarihi"
        : "Kayıt / açılış tarihi";
    form.querySelector("#source-date-caption").textContent = dateCaption;
    form.elements.sourceDate.setAttribute("aria-label", dateCaption);
    for (const name of ["projectCode", "workType"])
      form.elements[name].disabled = !daily;
    const waitingTask = daily && form.elements.status.value === "waiting";
    form.querySelector("#waiting-reason-field").hidden = !waitingTask;
    form.elements.waitingReason.disabled = !waitingTask;
    arrangeRecordEditor(form, { type, linkedMeeting });
    let statusHelp = form.querySelector("#meeting-derived-status-help");
    if (!statusHelp) {
      statusHelp = document.createElement("small");
      statusHelp.id = "meeting-derived-status-help";
      statusHelp.className = "field-help";
      statusHelp.textContent = "Durum bağlı iş ve takipten hesaplanır.";
      form.elements.status.closest("label").append(statusHelp);
    }
    statusHelp.hidden = !linkedMeeting;
    if (linkedMeeting) {
      form.elements.status.value = statusForDisplay(
        effectiveRecord(existing).status,
        "meeting",
      );
      form.elements.status.setAttribute("aria-describedby", statusHelp.id);
    } else form.elements.status.removeAttribute("aria-describedby");
    syncEditorPeriod(form, type, today());
  }
  function updateEditorContext() {
    const form = document.querySelector("#record-form");
    if (!form) return;
    const isDaily = form.querySelector('select[name="type"]').value === "daily";
    const adHoc = isDaily && form.elements.workContext.value === "ad_hoc";
    document.querySelector("#parent-field").hidden = !isDaily;
    form.elements.parentId.disabled = !isDaily;
    if (adHoc) form.elements.parentId.value = "";
  }
  function updateParentOptions(selectedId) {
    const form = document.querySelector("#record-form");
    if (!form) return;
    const select = form.elements.parentId;
    const selected = selectedId ?? select.value;
    const candidates = state.records.filter(
      (record) =>
        record.type === "weekly" &&
        record.id !== form.elements.id.value &&
        (!isDailyInboxGoal(record) || record.id === selected),
    );
    const shown = candidates.filter(
      (record) => active(record) || record.id === selected,
    );
    select.innerHTML = `<option value="">Bağlantı yok</option>${shown.map((record) => `<option value="${esc(record.id)}" ${record.id === selected ? "selected" : ""}>${record.periodKey ? `${esc(record.periodKey)} · ` : ""}${esc(record.title)}${!active(record) ? ` (${esc(statusLabel(record.type, record.status))}${record.id === selected ? " · seçili bağlantı" : ""})` : ""}</option>`).join("")}`;
    const current = candidates.find((record) => record.id === selected);
    const hint = form.querySelector("#parent-target-hint");
    hint.textContent =
      current && !active(current)
        ? "Kapalı hedef bağlantısı korunur."
        : !candidates.some(active)
          ? "Açık haftalık hedef yok."
          : "";
    hint.hidden = !hint.textContent;
  }
  function updateHigherGoalOptions(selectedId) {
    const form = document.querySelector("#record-form");
    if (!form) return;
    const type = form.querySelector('select[name="type"]').value;
    const parentType = ["weekly", "monthly"].includes(type)
      ? parentGoalType(type)
      : null;
    const select = form.elements.goalParentId;
    const selected = selectedId ?? select.value;
    form.querySelector("#higher-goal-field").hidden = !parentType;
    select.disabled = !parentType;
    if (!parentType) {
      select.value = "";
      return;
    }
    const candidates = state.records.filter(
      (record) =>
        record.type === parentType &&
        record.id !== form.elements.id.value &&
        (active(record) || record.id === selected),
    );
    select.innerHTML = `<option value="">Bağlantı yok</option>${candidates.map((record) => `<option value="${esc(record.id)}" ${record.id === selected ? "selected" : ""}>${record.periodKey ? `${esc(record.periodKey)} · ` : ""}${esc(record.title)}${!active(record) ? ` (${esc(statusLabel(record.type, record.status))})` : ""}</option>`).join("")}`;
    form.querySelector("#higher-goal-caption").textContent =
      parentType === "monthly" ? "Bağlı aylık hedef" : "Bağlı senelik hedef";
    const hint = form.querySelector("#higher-goal-hint");
    const current = candidates.find((record) => record.id === selected);
    hint.textContent =
      current && !active(current)
        ? "Kapalı hedef bağlantısı korunur."
        : !candidates.some(active)
          ? "Açık üst hedef yok."
          : "";
    hint.hidden = !hint.textContent;
  }
  function openEditor(
    id = null,
    parentId = "",
    sourceId = "",
    routeType = "daily",
    creationOptions = {},
  ) {
    meetingLinkedReturn = creationOptions.meetingReturn || null;
    if (!creationOptions.keepRecordPanel) {
      waitingRecordPanel?.close({ restoreFocus: false });
      meetingRecordPanel?.close({ restoreFocus: false });
    }
    waitingInfo?.close();
    recordNotes?.close();
    closeStatusMenu();
    datePicker?.close();
    choiceFields?.close();
    inlineFields?.close();
    if (!creationOptions.keepGoalPanel) goalPanel?.close();
    const record = state.records.find((r) => r.id === id);
    const parentGoal = state.records.find((r) => r.id === parentId);
    const source = state.records.find(
      (r) => r.id === sourceId && ["meeting", "waiting"].includes(r.type),
    );
    if (!record) {
      if (id) {
        toast("Bu kayıt artık bulunamıyor.", true);
        return;
      }
      const type =
        creationOptions.type ||
        (sourceId
          ? routeType
          : parentId
            ? { weekly: "daily", monthly: "weekly", yearly: "monthly" }[
                parentGoal?.type
              ] || "daily"
            : state.view === "dashboard"
              ? "daily"
              : state.view);
      const periodKey = Object.hasOwn(state.planningPeriods, type)
        ? (state.planningPeriods[type] || makePlanningPeriod(type, today())).key
        : "";
      recordCreation?.open({
        type,
        periodKey: creationOptions.periodKey ?? periodKey,
        parentId: type === "daily" ? parentId : "",
        goalParentId: ["weekly", "monthly"].includes(type) ? parentId : "",
        sourceId,
        forceNewSourceAction: creationOptions.forceNewSourceAction === true,
        navigateAfterCreate: creationOptions.navigateAfterCreate === true,
        values: {
          ...(source
            ? {
                title: source.title,
                status: type === "waiting" ? "waiting_response" : "planned",
                priority:
                  source.type === "meeting" ? "normal" : source.priority,
                dueDate: source.type === "meeting" ? "" : source.dueDate,
                owner:
                  type === "daily" && source.type !== "meeting"
                    ? source.owner
                    : "",
                expectedFrom:
                  source.type === "meeting" ? "" : source.expectedFrom || "",
                nextAction: source.type === "meeting" ? "" : source.nextAction,
                description: [
                  source.description,
                  source.decision ? `Toplantı kararı: ${source.decision}` : "",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              }
            : {}),
          ...creationOptions.values,
        },
      });
      return;
    }
    recordCreation?.close();
    const origin =
      source ||
      state.records.find(
        (r) => r.id === record?.sourceFields?.__followupSource?.recordId,
      );
    const routedTarget = meetingTarget(record);
    const linkedOrigin = Boolean(record && origin);
    const values =
      (record && effectiveRecord(record)) ||
      (source
        ? {
            title: source.title,
            priority: source.priority,
            dueDate: source.dueDate,
            sourceDate: today(),
            owner: source.owner,
            expectedFrom: source.owner,
            nextAction: source.nextAction,
            description: [
              source.description,
              source.decision ? `Toplantı kararı: ${source.decision}` : "",
              source.expectedFrom
                ? `Beklenen kişi: ${source.expectedFrom}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          }
        : {});
    const type =
      record?.type ||
      (parentId || source
        ? source
          ? routeType
          : { weekly: "daily", monthly: "weekly", yearly: "monthly" }[
              parentGoal?.type
            ] || "daily"
        : state.view === "dashboard"
          ? "daily"
          : state.view);
    const linkedCount = record ? goalChildren(record, state.records).length : 0;
    const initialPeriod =
      record?.periodKey ??
      (Object.hasOwn(state.planningPeriods, type)
        ? (state.planningPeriods[type] || makePlanningPeriod(type, today())).key
        : "");
    document.querySelector("#editor").innerHTML = `<form id="record-form">
    <div class="modal-header"><h2>${record ? "Kaydı düzenle" : "Yeni bir adım ekle"}</h2><button type="button" class="close-modal" data-action="close" aria-label="Pencereyi kapat">${icon("close")}</button></div>
    <div class="modal-body"><input type="hidden" name="id" value="${esc(record?.id || "")}"><div class="form-grid">
      ${origin ? `<p class="daily-source-existing full">${esc(label(TYPES, origin.type))}: ${esc(origin.title)}<br>${type === "waiting" ? "Takip bu kayıttan yönetilir; toplantı kararı korunur." : "Çalışma bu günlük işten yönetilir; kaynak konu korunur."}</p>` : ""}
      ${record?.type === "meeting" ? `<div class="${routedTarget ? "action-source-context" : "meeting-route-panel"} full"><p>${routedTarget ? "Toplantı, tüm bağlı işler ve takipler kapandığında kapanır." : "Bu aksiyon için bir veya iki takip akışı açabilirsin."}</p>${meetingRouteControls(record)}</div>` : ""}
      <label class="field full">Başlık *<input name="title" required maxlength="500" placeholder="Ne yapmak istiyorsun?" value="${esc(values.title || "")}" autofocus></label>
      <label class="field">Liste<select name="type" ${linkedCount || source || routedTarget || linkedOrigin ? "disabled" : ""}>${options(TYPES, type)}</select>${linkedCount || source || routedTarget || linkedOrigin ? `<input type="hidden" name="type" value="${type}">${linkedCount ? '<span class="field-help">Bağlı kayıtlar var; liste türü değiştirilemez.</span>' : ""}` : ""}</label>
      <label class="field">Durum<select name="status" aria-label="Durum">${editorStatusOptions(type, statusForDisplay(values.status || "planned", type), record ? [record.status, values.status] : [])}</select></label>
      <label class="field">Öncelik<select name="priority">${options(PRIORITIES, values.priority || "normal")}</select></label>
      <label class="field" id="deadline-field">Teslim tarihi${dateInput({ name: "dueDate", value: values.dueDate || "", label: "Teslim tarihi" })}</label>
      <label class="field"><span id="source-date-caption">${type === "waiting" ? "Beklemeye başlama tarihi" : "Kayıt / açılış tarihi"}</span>${dateInput({ name: "sourceDate", value: values.sourceDate || (!record && type === "waiting" ? today() : ""), label: type === "waiting" ? "Beklemeye başlama tarihi" : "Kayıt / açılış tarihi" })}</label>
      <label class="field" id="owner-field">Sorumlu<input name="owner" maxlength="120" placeholder="İsim (isteğe bağlı)" value="${esc(values.owner || "")}"></label>
      <label class="field full" id="context-field" ${type !== "daily" ? "hidden" : ""}>Çalışma bağlamı<select name="workContext" ${type !== "daily" ? "disabled" : ""}>${options(DAILY_CONTEXTS, values.workContext || "")}</select></label>
      <div class="field full" id="parent-field" ${type !== "daily" ? "hidden" : ""}><div class="parent-goal-heading"><label for="weekly-parent-select">Bağlı haftalık hedef</label></div><select id="weekly-parent-select" name="parentId" aria-describedby="parent-target-hint"><option value="">Bağlantı yok</option></select><span id="parent-target-hint" class="field-help"></span>${record && unresolved(record) ? `<span class="field-help">Önceki hedef: ${esc(record.sourceFields.__unresolvedParent)}</span>` : ""}</div>
      <label class="field full" id="higher-goal-field" ${["weekly", "monthly"].includes(type) ? "" : "hidden"}><span id="higher-goal-caption">Bağlı üst hedef</span><select name="goalParentId" id="higher-goal-select" aria-describedby="higher-goal-hint"><option value="">Bağlantı yok</option></select><span class="field-help" id="higher-goal-hint">Bağlantı isteğe bağlıdır.</span></label>
      <label class="field full" id="waiting-reason-field" ${type === "daily" && record?.status === "waiting" ? "" : "hidden"}>Neyi/kimi bekliyorum?<textarea name="waitingReason" maxlength="1000" rows="2" placeholder="Örn. Tasarım yanıtı veya malzeme bekleniyor.">${esc(waitingReasonText(values))}</textarea></label><label class="field full">Sonraki adım<textarea name="nextAction" maxlength="10000" placeholder="Bir sonraki somut adım…">${esc(values.nextAction || "")}</textarea></label>
      <label class="field full">Notlar<textarea name="description" maxlength="50000" placeholder="Ayrıntılar, hatırlatmalar…">${esc(values.description || "")}</textarea></label>
    </div>${editorExtras(record ? values : { ...values, periodKey: initialPeriod }, type)}<div id="form-error" role="alert"></div></div>
    <div class="modal-footer">${record ? `<button type="button" class="btn danger delete-record" data-action="delete" data-id="${esc(id)}">Kaydı sil</button>` : ""}<button type="button" class="btn" data-action="close">Vazgeç</button><button type="submit" class="btn primary">${icon("check")}${record ? "Değişiklikleri kaydet" : "Kaydı ekle"}</button></div>
  </form>`;
    if (record)
      document.querySelector("#record-form").dataset.recordSnapshot =
        JSON.stringify(record);
    if (!record)
      document.querySelector("#record-form").dataset.autoPeriod = initialPeriod;
    if (source)
      document.querySelector("#record-form").dataset.followupSource = source.id;
    updateParentOptions(record?.parentId || (type === "daily" ? parentId : ""));
    updateHigherGoalOptions(
      record?.goalParentId || (type !== "daily" ? parentId : ""),
    );
    updateEditorContext();
    updateEditorDetails();
    if (routedTarget) {
      const form = document.querySelector("#record-form");
      for (const name of ["dueDate", "nextAction"])
        form.elements[name].disabled = true;
      form.elements.dueDate
        .closest(".date-input-wrap")
        .querySelector("button").disabled = true;
    }
    const editor = document.querySelector("#editor");
    document.querySelector("#record-form").dataset.initialValues =
      recordFormValues(document.querySelector("#record-form"));
    if (!editor.open) editor.showModal();
  }
  function openLinkedAction(
    id,
    routeType = null,
    { keepRecordPanel = false } = {},
  ) {
    try {
      const source = state.records.find(
        (record) =>
          record.id === id && ["meeting", "waiting"].includes(record.type),
      );
      if (!source) return;
      const targets = linkedActions(id, state.records);
      if (source.type === "meeting" && !routeType && targets.length > 1) {
        openEditor(source.id);
        return;
      }
      const linked = routeType
        ? linkedAction(id, state.records, routeType)
        : targets[0];
      if (linked) {
        const meetingReturn =
          source.type === "meeting" && state.view === "meeting"
            ? {
                sourceId: source.id,
                routeType: linked.type,
                scrollX: window.scrollX,
                scrollY: window.scrollY,
                tableScrollLeft:
                  document.querySelector(".meeting-table")?.parentElement
                    ?.scrollLeft || 0,
              }
            : null;
        if (source.type !== "meeting" && !keepRecordPanel)
          navigate(linked.type);
        openEditor(linked.id, "", "", "daily", {
          meetingReturn,
          keepRecordPanel,
        });
      } else
        openEditor(null, "", id, routeType || "daily", { keepRecordPanel });
    } catch (error) {
      toast(error.message, true);
    }
  }
  function openDailyFromSource(id) {
    openLinkedAction(id, "daily");
  }
  function createWaitingDaily(id, { keepRecordPanel = false } = {}) {
    const source = state.records.find((record) => record.id === id);
    if (source?.type !== "waiting" || !active(source))
      throw new Error("Yeni iş eklemek için bekleyen konuyu yeniden aç.");
    openEditor(null, "", id, "daily", {
      keepRecordPanel,
      forceNewSourceAction: true,
      values: { title: "", dueDate: "", nextAction: "" },
    });
  }
  function closeRecordPreviews(except = null) {
    if (except !== "waiting")
      waitingRecordPanel?.close({ restoreFocus: false });
    if (except !== "meeting")
      meetingRecordPanel?.close({ restoreFocus: false });
    if (except !== "goal") goalPanel?.close();
    if (except !== "history") workJournal?.close();
  }
  function openRecordPreview(type, id, trigger = null) {
    const preview =
      type === "meeting" ? meetingRecordPanel : waitingRecordPanel;
    if (!preview?.canOpen(id)) return;
    closeStatusMenu();
    datePicker?.close();
    choiceFields?.close();
    inlineFields?.close();
    waitingInfo?.close();
    recordNotes?.close();
    closeRecordPreviews(type);
    trigger?.focus({ preventScroll: true });
    preview.open(id, { trigger });
  }
  function openPanelRoute(id, type) {
    const target = linkedAction(id, state.records, type);
    if (target?.type === "waiting") {
      openRecordPreview("waiting", target.id);
      return;
    }
    openLinkedAction(id, type, { keepRecordPanel: true });
  }
  function restoreMeetingRoute() {
    if (document.querySelector("#editor").open) return;
    const context = meetingLinkedReturn;
    meetingLinkedReturn = null;
    if (!context || state.view !== "meeting") return;
    const table = document.querySelector(".meeting-table");
    if (table?.parentElement)
      table.parentElement.scrollLeft = context.tableScrollLeft;
    window.scrollTo(context.scrollX, context.scrollY);
    const sourceRow = [
      ...(table?.querySelectorAll("[data-record-row]") || []),
    ].find((element) => element.dataset.id === context.sourceId);
    const trigger = [
      ...(sourceRow?.querySelectorAll(".meeting-route[data-route]") || []),
    ].find((element) => element.dataset.route === context.routeType);
    (trigger || document.querySelector('#nav [data-view="meeting"]'))?.focus({
      preventScroll: true,
    });
  }
  function setRecordStatus(id, status) {
    const record = state.records.find((r) => r.id === id);
    if (record?.type === "meeting") {
      try {
        if (linkedActions(record.id, state.records).length) {
          closeStatusMenu();
          return;
        }
      } catch (error) {
        closeStatusMenu();
        toast(error.message, true);
        return;
      }
    }
    if (
      !record ||
      !isStatusSelectable(record.type, status) ||
      !Object.hasOwn(statusesForType(record.type, [record.status]), status)
    )
      return;
    closeStatusMenu();
    if (record.status === status) {
      if (record.type === "daily" && status === "waiting")
        waitingDetails?.open(id);
      return;
    }
    const saved = saveRecords(
      state.records.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              ...(r.type === "daily" ? { blocked: false } : {}),
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
      "Durum güncelleme",
    );
    if (saved && record.type === "daily" && status === "waiting")
      waitingDetails?.open(id);
  }
  let statusMenuTrigger = null;
  function closeStatusMenu() {
    const menu = document.querySelector("#status-menu");
    if (menu?.matches(":popover-open")) menu.hidePopover();
    statusMenuTrigger?.setAttribute("aria-expanded", "false");
    statusMenuTrigger = null;
    if (menu && menu.parentElement !== app) app.append(menu);
  }
  function openStatusMenu(id, trigger) {
    recordNotes?.close();
    waitingInfo?.close();
    inlineFields?.close();
    const record = state.records.find((r) => r.id === id);
    if (!record) return;
    const menu = document.querySelector("#status-menu");
    const alreadyOpen =
      menu.matches(":popover-open") && statusMenuTrigger === trigger;
    closeStatusMenu();
    if (alreadyOpen) return;
    const choices = statusesForType(record.type, [record.status]);
    // This shared popover stays outside the nonmodal goal panel, whose local
    // draft reset can replace its contents without going through renderContent.
    app.append(menu);
    let targets;
    try {
      targets =
        record.type === "meeting" ? linkedActions(id, state.records) : [];
    } catch (error) {
      toast(error.message, true);
      return;
    }
    if (
      record.type === "meeting" &&
      ((targets.length && !trigger.dataset.targetId) ||
        (trigger.dataset.targetId &&
          !targets.some((target) => target.id === trigger.dataset.targetId)))
    )
      return;
    if (targets.length && trigger.dataset.targetId)
      menu.innerHTML = renderMeetingStatusMenu(record, targets, {
        targetId: trigger.dataset.targetId,
      });
    else
      menu.innerHTML = `<div class="status-menu-heading">${esc(label(TYPES, record.type))} · Durum</div>${Object.entries(
        choices,
      )
        .filter(
          ([key]) =>
            (record.type === "meeting" || key !== "completed") &&
            isStatusSelectable(record.type, key),
        )
        .map(
          ([key, value]) =>
            `<button type="button" class="status-option" role="menuitemradio" aria-checked="${key === statusForDisplay(effectiveRecord(record).status, record.type)}" data-action="set-status" data-id="${esc(id)}" data-status="${esc(key)}"><span>${esc(value.label)}</span><span class="status-mark">${icon("check")}</span></button>`,
        )
        .join(
          "",
        )}${record.type === "daily" && record.status === "waiting" ? `<div class="status-waiting-info"><button type="button" role="menuitem" class="waiting-details-control" data-action="waiting-details" data-id="${esc(id)}">Bekleme bilgisini düzenle</button></div>` : ""}`;
    statusMenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 272))}px`;
    menu.style.top = "0px";
    menu.showPopover();
    const height = menu.getBoundingClientRect().height;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - height - 8))}px`;
    (
      menu.querySelector('[aria-checked="true"]') ||
      menu.querySelector(".status-option")
    )?.focus({ preventScroll: true });
  }
  async function deleteRecord(id, trigger) {
    try {
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      syncWorkspaceView();
      const r = state.records.find((r) => r.id === id);
      if (!r) return;
      const editor = document.querySelector("#editor");
      const form = editor.querySelector("#record-form");
      const expectedWorkspace = workspaceDomainSnapshot(
        state.records,
        preferences,
      );
      const children = goalChildren(r, state.records).length;
      if (
        !(await confirmAction({
          root: app,
          title: "Kaydı sil?",
          message: `“${r.title}” silinsin mi?${children ? ` Bağlı ${children} iş veya alt hedef korunacak; bu hedefe bağlantıları kaldırılacak.` : ""}`,
          confirmLabel: "Kaydı sil",
          danger: true,
          trigger,
        }))
      )
        return;
      if (!editor.open || editor.querySelector("#record-form") !== form)
        return;
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      syncWorkspaceView();
      if (
        workspaceDomainSnapshot(state.records, preferences) !== expectedWorkspace
      )
        throw new Error(
          "Çalışma alanı onay penceresi açıkken değişti. Güncel kaydı kontrol edip yeniden silebilirsin.",
        );
      const next = state.records
        .filter((r) => r.id !== id)
        .map((r) =>
          r.parentId === id
            ? { ...r, parentId: "", updatedAt: new Date().toISOString() }
            : r.goalParentId === id
              ? { ...r, goalParentId: null, updatedAt: new Date().toISOString() }
              : r,
        );
      if (saveRecords(next, "Kayıt silme")) {
        editor.close();
        toast("Kayıt silindi.");
      }
    } catch (error) {
      toast(error.message || "Kayıt silinemedi.", true);
    }
  }

  app.innerHTML = `<div class="layout"><div class="mobile-backdrop" data-action="menu"></div><aside class="sidebar"><div class="brand-lockup"><div class="brand"><span class="brand-name" id="brand-name"><span class="brand-accessible-name">ODAK</span><svg class="brand-lettering" viewBox="0 0 200 48" aria-hidden="true"><path fill-rule="evenodd" d="M15 2H29Q42 2 42 15V31Q42 44 29 44H15Q2 44 2 31V15Q2 2 15 2ZM16 11Q12 11 12 16V30Q12 35 16 35H28Q32 35 32 30V16Q32 11 28 11Z"/><path fill-rule="evenodd" d="M51 2H72Q93 2 93 23Q93 44 72 44H51ZM61 11V35H71Q83 35 83 23Q83 11 71 11Z"/><path fill-rule="evenodd" d="M119 2H130L148 44H137L133 34H116L112 44H101ZM119 26H130L124.5 12Z"/><path d="M157 2H167V19L183 2H196L176 23L198 44H184L167 27V44H157Z"/></svg></span></div></div><p class="nav-label">ÇALIŞMA ALANI</p><nav id="nav" class="nav" aria-label="Ana menü"></nav></aside><main class="main"><header class="topbar"><div class="topbar-start"><button type="button" class="mobile-toggle" data-action="menu" aria-label="Menüyü aç" aria-expanded="false">${icon("menu")}</button><div class="page-heading"><h1 id="page-title">Genel bakış</h1></div></div><div class="topbar-right"><div class="search">${icon("search")}<input type="search" id="global-search" placeholder="Kayıtlarında ara…" aria-label="Kayıtlarında ara" autocomplete="off"></div><button type="button" class="btn primary new-record" data-action="new">${icon("plus")}<span>Yeni kayıt</span></button><button type="button" class="btn widget-trigger" data-action="open-widget" aria-label="Widget aç" title="Mini ajandayı aç">${icon("widget")}<span>Widget</span></button><button type="button" class="btn calendar-trigger" data-action="open-calendar" aria-label="Takvimi aç" title="Takvimi aç">${icon("calendar")}<span>Takvim</span></button><span class="today">${icon("calendar")}<span class="today-copy"><time id="topbar-date" class="today-date"></time><time id="topbar-clock" class="today-clock"></time></span></span><button type="button" id="reminder-button" class="icon-btn reminder-trigger" aria-haspopup="dialog" aria-controls="reminder-panel" aria-expanded="false" aria-label="Hatırlatmalar" title="Hatırlatmalar">${bellIcon}<span class="reminder-count" hidden></span></button><button type="button" id="undo-button" class="icon-btn undo-trigger" data-action="undo" aria-label="Geri al" aria-keyshortcuts="Control+Z Meta+Z" title="Geri alınacak işlem yok" disabled>${icon("undo")}</button><button type="button" class="icon-btn settings-trigger" data-action="settings" aria-label="Ayarlar" title="Ayarlar">${icon("settings")}</button></div></header>${storageError || bootstrapNotice ? `<div class="unsaved-warning" role="alert">${esc(storageError || bootstrapNotice)}</div>` : ""}<div class="content" id="content"></div></main></div><dialog class="modal" id="editor" aria-label="Kayıt formu"></dialog><dialog class="modal" id="settings-dialog" aria-label="Ayarlar"></dialog><dialog class="modal" id="workspace-reset-dialog" aria-labelledby="workspace-reset-title" aria-describedby="workspace-reset-description"></dialog><dialog class="modal" id="planning-prompts-dialog" aria-label="Planını netleştir"></dialog><dialog class="modal goal-links-review-dialog" id="goal-links-review-dialog" aria-label="Hedef bağlantılarını gözden geçir"></dialog><div id="status-menu" class="status-menu" popover="auto" role="menu" aria-label="Durum seç"></div>`;
  document
    .querySelector("#editor")
    .addEventListener("close", restoreMeetingRoute);
  const workspaceResetDialog = document.querySelector(
    "#workspace-reset-dialog",
  );
  workspaceResetDialog.addEventListener("cancel", (event) => {
    if (workspaceResetSaving) event.preventDefault();
  });
  workspaceResetDialog.addEventListener("close", () => {
    if (workspaceResetDialog.open) return;
    const trigger = workspaceResetConfirmation?.trigger;
    workspaceResetConfirmation = null;
    if (document.querySelector("#settings-dialog").open && trigger?.isConnected)
      trigger.focus({ preventScroll: true });
  });
  window.addEventListener("resize", positionWorkspaceReset);
  window.visualViewport?.addEventListener("resize", positionWorkspaceReset);
  window.addEventListener(
    "pagehide",
    () => {
      window.removeEventListener("resize", positionWorkspaceReset);
      window.visualViewport?.removeEventListener(
        "resize",
        positionWorkspaceReset,
      );
    },
    { once: true },
  );
  document.querySelector("#editor").addEventListener("cancel", async (event) => {
    const editor = event.currentTarget;
    const form = editor.querySelector(
      '#record-form:not([data-creation="true"])',
    );
    if (!form) return;
    const values = recordFormValues(form);
    if (values !== form.dataset.initialValues) {
      event.preventDefault();
      if (editorDiscardPending) return;
      const request = { form, values };
      editorDiscardPending = request;
      try {
        const confirmed = await confirmAction({
          root: app,
          title: "Değişiklikler kaydedilmedi",
          message: DISCARD_RECORD_CHANGES,
          confirmLabel: "Kaydetmeden kapat",
          danger: true,
        });
        if (
          !confirmed ||
          editorDiscardPending !== request ||
          !editor.open ||
          editor.querySelector("#record-form") !== form ||
          recordFormValues(form) !== values
        )
          return;
        datePicker?.close();
        choiceFields?.close();
        editor.close();
      } finally {
        if (editorDiscardPending === request) editorDiscardPending = null;
      }
      return;
    }
    datePicker?.close();
    choiceFields?.close();
  });
  const topbarClock = createTopbarClock({ root: app });
  window.addEventListener("pagehide", topbarClock.destroy, { once: true });
  function initWorkSessions() {
    workSessions = createWorkSessionUI({
      root: app,
      getRecords: () => state.records,
      sessionStorage: workspaceStore.sessionStorage,
      workspaceStorageKey: STORAGE_KEY,
      onRunningChange: refreshDashboardRunningOrder,
      onHistory: () => workJournal?.openWeek(),
      journalButton: (record) =>
        workJournal?.button(record, { compact: true }) || "",
      onCompleteSession: (recordId, draft) => {
        const record = state.records.find((r) => r.id === recordId);
        if (!record || record.type !== "daily") {
          toast(
            "Bu günlük iş artık bulunamıyor. İş günlüğü kaydedilemedi.",
            true,
          );
          return false;
        }
        try {
          if (record.workLog?.some((entry) => entry.id === draft.sessionId))
            return saveRecords(state.records, "İş günlüğü kaydı");
          if (["completed", "cancelled", "transferred"].includes(record.status))
            throw new Error("Bu günlük iş kapanmış. Güncel kaydı kontrol et.");
          if (
            draft.note == null ||
            (typeof draft.note === "string" && !draft.note.trim())
          )
            return true;
          const updated = appendWorkLog(
            record,
            { ...draft, id: draft.sessionId },
            { updatedAt: new Date().toISOString() },
          );
          // A second window or a retried finish must not duplicate an entry or
          // change the first successful request's saved session.
          if (updated === record)
            return saveRecords(state.records, "İş günlüğü kaydı");
          return saveRecords(
            state.records.map((r) => (r.id === recordId ? updated : r)),
            "İş günlüğü kaydı",
          );
        } catch (error) {
          toast(error.message || "İş günlüğü kaydedilemedi.", true);
          return false;
        }
      },
      onError: (message) => toast(message, true),
      onMessage: (message) => toast(message),
    });
  }
  workJournal = createWorkJournalUI({
    root: app,
    getRecords: () => state.records,
    onBeforeOpen: () => closeRecordPreviews("history"),
    onUpdateEntry: (id, entryId, patch) => {
      try {
        const record = state.records.find((item) => item.id === id);
        const updated = updateWorkLogEntry(record, entryId, patch, {
          updatedAt: new Date().toISOString(),
        });
        const saved = saveRecords(
          updated === record
            ? state.records
            : state.records.map((item) =>
                item.id === id ? createRecord(updated) : item,
              ),
          "İş günlüğü kaydını düzenleme",
        );
        if (saved) toast("İş günlüğü kaydı güncellendi.");
        return saved;
      } catch (error) {
        toast(error.message || "İş günlüğü kaydı güncellenemedi.", true);
        return false;
      }
    },
    onDeleteEntry: (id, entryId) => {
      try {
        const record = state.records.find((item) => item.id === id);
        const updated = removeWorkLogEntry(record, entryId, {
          updatedAt: new Date().toISOString(),
        });
        const saved = saveRecords(
          updated === record
            ? state.records
            : state.records.map((item) =>
                item.id === id ? createRecord(updated) : item,
              ),
          "İş günlüğü kaydını silme",
        );
        if (saved)
          toast("İş günlüğü kaydı silindi. Geri al ile geri yükleyebilirsin.");
        return saved;
      } catch (error) {
        toast(error.message || "İş günlüğü kaydı silinemedi.", true);
        return false;
      }
    },
    onError: (message) => toast(message, true),
  });
  goalPanel = createGoalPanel({
    root: app,
    getRecords: () => state.records,
    renderStatus: statusBadge,
    renderDateControl: (record) =>
      active(record) ? lifecycleDateControl(record) : "",
    renderComplete: completionControl,
    renderWork: workControl,
    renderJournal: (record) => journalControl(record),
    renderBlocked: (record) => waitingInfo?.button(record) || "",
    onLinkChild: (parentId, childId) => {
      const parent = state.records.find((record) => record.id === parentId);
      const child = state.records.find((record) => record.id === childId);
      if (
        !parent ||
        !child ||
        !active(parent) ||
        !active(child) ||
        parentGoalType(child.type) !== parent.type
      )
        return false;
      if (child.parentId || child.goalParentId) return false;
      const patch =
        child.type === "daily"
          ? {
              parentId,
              ...(child.workContext === "ad_hoc" ? { workContext: "" } : {}),
            }
          : { goalParentId: parentId };
      const updated = createRecord({
        ...child,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      return saveRecords(
        state.records.map((record) =>
          record.id === childId ? updated : record,
        ),
        "Hedef bağlantısı",
      );
    },
    onUnlinkChild: (parentId, childId) => {
      const child = state.records.find((record) => record.id === childId);
      const next = unlinkGoalChild(state.records, parentId, childId, {
        updatedAt: new Date().toISOString(),
      });
      if (next === state.records) return true;
      const saved = saveRecords(next, "Hedef bağlantısını kaldırma", {
        syncLinks: false,
      });
      if (saved)
        toast(
          child.type === "daily"
            ? "Hedef bağlantısı kaldırıldı; iş anlık işe döndü. Geri alınabilir."
            : "Hedef bağlantısı kaldırıldı. Geri alınabilir.",
        );
      return saved;
    },
    onNewStep: (id) => openEditor(null, id),
    onEdit: (id) => {
      const details = document.querySelector("#goal-detail-panel");
      const keepGoalPanel = details?.open && details.dataset.goalId === id;
      const scrollTop =
        details?.querySelector(".goal-panel-body")?.scrollTop || 0;
      openEditor(id, "", "", "daily", { keepGoalPanel });
      const editor = document.querySelector("#editor");
      if (keepGoalPanel && editor.open)
        editor.addEventListener(
          "close",
          () => {
            if (editor.open || !details.isConnected || !details.open) return;
            goalPanel?.refresh();
            const body = details.querySelector(".goal-panel-body");
            if (body) body.scrollTop = scrollTop;
            const trigger =
              (details.dataset.goalId === id &&
                details.querySelector('[data-action="goal-edit-record"]')) ||
              details.querySelector('[data-action="goal-panel-close"]');
            trigger?.focus({ preventScroll: true });
          },
          { once: true },
        );
    },
    onSaveProgress: (id, value, expectedCurrent, expectedSnapshot) => {
      const existing = state.records.find((record) => record.id === id);
      if (!existing)
        throw new Error("Hedef artık bulunamıyor. İlerleme kaydedilemedi.");
      const updated = updateGoalProgress(existing, value, {
        expectedCurrent,
        expectedSnapshot,
        updatedAt: new Date().toISOString(),
      });
      if (updated === existing) return true;
      const saved = saveRecords(
        state.records.map((record) => (record.id === id ? updated : record)),
        "Hedef ilerlemesi",
        { syncLinks: false },
      );
      if (saved) toast("İlerleme güncellendi.");
      return saved;
    },
    onError: (message) => toast(message, true),
  });
  datePicker = createDatePicker({ root: app, today });
  choiceFields = createChoiceFields({
    root: app,
    getChoices: (kind) =>
      availableChoices(kind, state.records, preferences.choiceLists),
    onError: (message) => toast(message, true),
  });
  inlineFields = createInlineFields({
    root: app,
    getRecords: () => state.records,
    onOpenDatePicker: (options) => datePicker?.openSelection(options),
    onCloseDatePicker: () => datePicker?.closeSelection(),
    onSave: (id, patch, actionLabel) => {
      const existing = state.records.find((record) => record.id === id);
      if (!existing) return false;
      const updated = createRecord({ ...existing, ...patch });
      return saveRecords(
        state.records.map((record) => (record.id === id ? updated : record)),
        actionLabel,
      );
    },
    onError: (message) => toast(message, true),
    formatDate,
    today,
  });
  waitingDetails = createWaitingDetailsUI({
    root: app,
    getRecords: () => state.records,
    onSave: (id, patch) => {
      try {
        const record = state.records.find((item) => item.id === id);
        if (!record || record.type !== "daily" || record.status !== "waiting")
          throw new Error("Bu günlük iş artık Beklemede değil.");
        if (waitingReasonText(record) === patch.waitingReason)
          return saveRecords(state.records, "Bekleme bilgisi");
        const updated = createRecord({
          ...record,
          waitingReason: patch.waitingReason,
          blocked: false,
          updatedAt: new Date().toISOString(),
        });
        const saved = saveRecords(
          state.records.map((item) => (item.id === id ? updated : item)),
          "Bekleme bilgisi",
        );
        if (saved) toast("Bekleme bilgisi kaydedildi.");
        return saved;
      } catch (error) {
        toast(error.message || "Bekleme bilgisi kaydedilemedi.", true);
        return false;
      }
    },
    onError: (message) => toast(message, true),
  });
  recordNotes = createRecordNoteUI({
    root: app,
    getRecord: (id) => state.records.find((record) => record.id === id),
    onSaveNote: (id, description, expectedDescription) => {
      const record = state.records.find((item) => item.id === id);
      if (!record) throw new Error("Bu kayıt artık bulunamıyor.");
      if (String(record.description || "") !== expectedDescription)
        throw new Error(
          "Not başka bir yerde değişti. Taslağın korunuyor; güncel notu kontrol et.",
        );
      if (String(record.description || "") === description) return true;
      const updated = createRecord({
        ...record,
        description,
        updatedAt: new Date().toISOString(),
      });
      return saveRecords(
        state.records.map((item) => (item.id === id ? updated : item)),
        "Kayıt notu",
        { syncLinks: false },
      );
    },
    onError: (message) => toast(message, true),
  });
  window.addEventListener("pagehide", recordNotes.destroy, { once: true });
  workspaceNotes = createWorkspaceNotesUI({
    root: app,
    getNotes: () => workspaceStore?.notes || [],
    onSaveNotes: saveWorkspaceNotes,
    onError: (message) => toast(message, true),
  });
  window.addEventListener("pagehide", workspaceNotes.destroy, { once: true });
  reminderBell = createReminderBell({
    root: app,
    button: document.querySelector("#reminder-button"),
    getNotes: () => workspaceStore?.notes || [],
    onSaveNotes: saveWorkspaceNotes,
    onEditNote: (id, control) => workspaceNotes.edit(id, control),
    onAlert: (message) => toast(message),
    onError: (message) => toast(message, true),
  });
  window.addEventListener("pagehide", reminderBell.destroy, { once: true });
  waitingInfo = createWaitingInfoUI({
    root: app,
    getRecord: (id) => state.records.find((record) => record.id === id),
    onEdit: (id) => waitingDetails?.open(id),
  });
  recordCreation = createRecordCreationUI({
    root: app,
    dialog: document.querySelector("#editor"),
    getRecords: () => state.records,
    today,
    onSave: (input, context) => {
      const prepared = prepareRecordCreation(state.records, input, context);
      const actionLabel =
        prepared.createdTypes.length > 1
          ? "Yeni kayıt ve takip akışları"
          : "Yeni kayıt";
      if (!saveRecords(prepared.records, actionLabel)) return false;
      return prepared;
    },
    onOpenRecord: (id) => {
      const record = state.records.find((item) => item.id === id);
      if (!record) return;
      navigate(record.type);
      openEditor(id);
    },
    onCreated: (record, { navigateAfterCreate }) => {
      if (!navigateAfterCreate || state.view === record.type) return;
      if (Object.hasOwn(state.planningPeriods, record.type) && record.periodKey)
        state.planningPeriods[record.type] = shiftPlanningPeriod(
          { type: record.type, key: record.periodKey },
          0,
        );
      state.search = "";
      document.querySelector("#global-search").value = "";
      navigate(record.type);
    },
    onError: (message) => toast(message, true),
    onMessage: (message) => toast(message),
  });
  dashboardCalendar = createDashboardCalendar({
    root: app,
    getRecords: () => state.records,
    today,
    getQuery: () => state.search,
    onOpenRecord: (id) => {
      const record = state.records.find((item) => item.id === id);
      if (!record) {
        toast("Bu kayıt artık bulunamıyor.", true);
        return;
      }
      openEditor(id);
    },
    onNewRecord: ({ type, values }) =>
      openEditor(null, "", "", type, { type, values }),
  });
  meetingBoth = createMeetingBothUI({
    root: app,
    getRecords: () => state.records,
    onSave: (sourceId, drafts) => {
      try {
        const result = buildMeetingActions(state.records, sourceId, drafts);
        if (!saveRecords(result.records, "Toplantının iki takip akışı"))
          return false;
        return {
          createdTypes: result.createdTypes,
          reusedTypes: result.reusedTypes,
        };
      } catch (error) {
        toast(error.message || "Takip akışları kaydedilemedi.", true);
        return false;
      }
    },
    onOpenTarget: (id) => {
      const record = state.records.find((item) => item.id === id);
      if (!record) return;
      navigate(record.type);
      openEditor(id);
    },
    onError: (message) => toast(message, true),
    onMessage: (message) => toast(message),
  });
  waitingFollowUps = createWaitingFollowUpUI({
    root: app,
    getRecords: () => state.records,
    today,
    onSave: (id, draft) => {
      try {
        const record = state.records.find((item) => item.id === id);
        const updated = appendFollowUp(record, draft, {
          today: today(),
          updatedAt: new Date().toISOString(),
        });
        const saved = saveRecords(
          updated === record
            ? state.records
            : state.records.map((item) =>
                item.id === id ? createRecord(updated) : item,
              ),
          "Konu takibi",
        );
        if (saved) toast("Takip kaydedildi.");
        return saved;
      } catch (error) {
        toast(error.message || "Takip kaydedilemedi.", true);
        return false;
      }
    },
    onEdit: (id, entryId, patch, expectedEntry) => {
      try {
        const record = state.records.find((item) => item.id === id);
        const updated = updateFollowUp(record, entryId, patch, {
          today: today(),
          updatedAt: new Date().toISOString(),
          expectedEntry,
        });
        const saved = saveRecords(
          updated === record
            ? state.records
            : state.records.map((item) =>
                item.id === id ? createRecord(updated) : item,
              ),
          "Takip kaydı düzenleme",
        );
        if (saved) toast("Takip kaydı güncellendi.");
        return saved;
      } catch (error) {
        toast(error.message || "Takip kaydı güncellenemedi.", true);
        return false;
      }
    },
    onError: (message) => toast(message, true),
  });
  goalTransfers = createGoalTransferUI({
    root: app,
    getRecords: () => state.records,
    onMove: (id, period, reason, expected) => {
      const record = state.records.find((item) => item.id === id);
      if (!record || JSON.stringify(record) !== JSON.stringify(expected))
        throw new Error(
          "Hedef değişti. Taslağın korunuyor; yeniden açıp kontrol et.",
        );
      const next =
        record.type === "weekly"
          ? moveWeeklyGoal(state.records, id, period, new Date(), reason)
          : moveMonthlyGoal(state.records, id, period, new Date(), reason);
      if (next === state.records) return true;
      const saved = saveRecords(
        next,
        record.type === "weekly"
          ? "Haftalık hedefi taşıma"
          : "Aylık hedefi taşıma",
      );
      if (saved) toast("Hedef taşındı.");
      return saved;
    },
    onError: (message) => toast(message, true),
  });
  waitingRecordPanel = createWaitingRecordPanel({
    root: app,
    getRecords: () => state.records,
    formatDate,
    renderStatus: (record) =>
      record.type === "daily" ? statusBadge(record) : statusSummary(record),
    renderComplete: completionControl,
    renderWork: workControl,
    renderJournal: (record) => journalControl(record),
    renderNote: (record) => recordNotes?.button(record) || "",
    renderBlocked: (record) => waitingInfo?.button(record) || "",
    renderDateControl: (record) =>
      active(record) ? lifecycleDateControl(record) : "",
    onEdit: (id) => openEditor(id, "", "", "daily", { keepRecordPanel: true }),
    onFollowUp: (id) => waitingFollowUps?.open(id),
    onRoute: openPanelRoute,
    onCreateDaily: (id) => createWaitingDaily(id, { keepRecordPanel: true }),
    onOpenDaily: (dailyId, waitingId) => {
      const linked = linkedActions(waitingId, state.records).some(
        (record) => record.id === dailyId && record.type === "daily",
      );
      if (!linked) throw new Error("Bu iş artık bekleyen konuya bağlı değil.");
      openEditor(dailyId, "", "", "daily", { keepRecordPanel: true });
    },
    onLinkDaily: (waitingId, dailyId) => {
      const next = attachWaitingWork(state.records, waitingId, dailyId);
      if (next === state.records) return true;
      const saved = saveRecords(next, "Bekleyen konuya iş bağlama");
      if (saved) toast("İş bağlandı. Geri alınabilir.");
      return saved;
    },
    onUnlinkDaily: (waitingId, dailyId) => {
      const next = unlinkWaitingWork(state.records, waitingId, dailyId);
      if (next === state.records) return true;
      const saved = saveRecords(next, "Bekleyen konu iş bağlantısını kaldırma");
      if (saved) toast("İş bağlantısı kaldırıldı. Geri alınabilir.");
      return saved;
    },
    onError: (message) => toast(message, true),
  });
  window.addEventListener("pagehide", waitingRecordPanel.destroy, {
    once: true,
  });
  meetingRecordPanel = createMeetingRecordPanel({
    root: app,
    getRecords: () => state.records,
    formatDate,
    renderStatus: (record) =>
      record.type === "meeting" ? statusBadge(record) : statusSummary(record),
    onEdit: (id) => openEditor(id, "", "", "daily", { keepRecordPanel: true }),
    onRoute: openPanelRoute,
    onLinkAction: (meetingId, targetId, type) => {
      const next = attachMeetingAction(
        state.records,
        meetingId,
        targetId,
        type,
      );
      if (next === state.records) return true;
      const saved = saveRecords(next, "Toplantıya kayıt bağlama");
      if (saved) toast("Kayıt bağlandı. Geri alınabilir.");
      return saved;
    },
    onError: (message) => toast(message, true),
  });
  window.addEventListener("pagehide", meetingRecordPanel.destroy, {
    once: true,
  });
  const removeRecordFormShortcuts = installRecordFormShortcuts(app);
  window.addEventListener("pagehide", removeRecordFormShortcuts, {
    once: true,
  });
  // Wheel gestures over the fixed navigation should not move the work area.
  // Keep Ctrl-wheel available for browser zoom.
  document.querySelector(".sidebar").addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) event.preventDefault();
    },
    { passive: false },
  );
  app.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id, view, filter } = button.dataset;
    const card = button.closest(".dashboard-detail-card");
    if (button === card) {
      const interactive = event.target.closest(
        'button, a, input, select, textarea, summary, label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]',
      );
      if (interactive && card.contains(interactive)) return;
    }
    if (
      card &&
      ["waiting-record-details", "goal-card-details"].includes(action) &&
      event.detail > 0
    ) {
      const selection = window.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        (card.contains(selection.anchorNode) ||
          card.contains(selection.focusNode))
      )
        return;
    }
    switch (action) {
      case "undo":
        undoLastAction();
        break;
      case "open-widget":
        summaryWidget?.open();
        break;
      case "open-calendar":
        closeRecordPreviews();
        closeStatusMenu();
        datePicker?.close();
        choiceFields?.close();
        inlineFields?.close();
        waitingInfo?.close();
        recordNotes?.close();
        dashboardCalendar?.open(button);
        break;
      case "record-note":
        closeStatusMenu();
        datePicker?.close();
        choiceFields?.close();
        inlineFields?.close();
        waitingInfo?.close();
        recordNotes?.edit(id, button);
        break;
      case "waiting-history":
        closeStatusMenu();
        datePicker?.close();
        choiceFields?.close();
        inlineFields?.close();
        waitingInfo?.close();
        recordNotes?.close();
        waitingFollowUps?.open(id, { focusHistory: true });
        break;
      case "settings":
        openSettings();
        break;
      case "reset-workspace":
        resetWorkspace(button);
        break;
      case "confirm-reset-workspace":
        confirmWorkspaceReset();
        break;
      case "cancel-workspace-reset":
        if (!workspaceResetSaving)
          document.querySelector("#workspace-reset-dialog").close();
        break;
      case "cleanup-import-notes":
        cleanupImportNotes();
        break;
      case "migrate-waiting-state":
        migrateWaitingState();
        break;
      case "waiting-details":
        closeStatusMenu();
        break;
      case "cleanup-waiting-notes":
        cleanupWaitingNotes();
        break;
      case "select-backup": {
        const input = document.querySelector("#restore-file");
        if (input && !input.disabled) input.click();
        break;
      }
      case "backup-records":
        backupRecords();
        break;
      case "unlinked":
        state.onlyUnlinked = !state.onlyUnlinked;
        if (state.onlyUnlinked) {
          state.listScope = "open";
          state.status = "all";
          state.priority = "all";
          state.period = "all";
          state.workContext = "all";
        }
        state.listPage = 1;
        renderContent();
        break;
      case "clear-filters":
        state.status = "all";
        state.listPage = 1;
        state.priority = "all";
        state.period = "all";
        state.workContext = "all";
        state.onlyUnlinked = false;
        renderContent();
        (
          document.querySelector("#work-context-filter") ||
          document.querySelector("#status-filter")
        )?.focus({ preventScroll: true });
        break;
      case "list-scope":
        if (!["open", "completed", "all"].includes(button.dataset.scope)) break;
        state.listScope = button.dataset.scope;
        state.status = "all";
        state.listPage = 1;
        state.onlyUnlinked = false;
        renderContent();
        document
          .querySelector(
            `[data-action="list-scope"][data-scope="${state.listScope}"]`,
          )
          ?.focus({ preventScroll: true });
        break;
      case "list-page":
        state.listPage = Number(button.dataset.page);
        renderContent();
        document
          .querySelector(".list-view-toolbar")
          ?.scrollIntoView({ block: "start" });
        break;
      case "view":
        navigate(view);
        break;
      case "planning-prompt":
        openPlanningPrompt(button.dataset.prompt);
        break;
      case "planning-prompt-menu": {
        const dialog = document.querySelector("#planning-prompts-dialog");
        const menu = dialog.querySelector("#planning-prompt-menu");
        if (!menu) break;
        if (menu.matches(":popover-open")) {
          menu.hidePopover();
          break;
        }
        const kind = button.dataset.prompt;
        menu.innerHTML = [
          ["tomorrow", "Yarın hatırlat"],
          ["week", "1 hafta sonra hatırlat"],
          ["never", "Bir daha önerme"],
        ]
          .map(
            ([until, text]) =>
              `<button type="button" class="quick-priority-option" role="menuitem" data-action="planning-prompt-dismiss" data-until="${until}" data-id="${esc(id)}" data-prompt="${esc(kind)}">${text}</button>`,
          )
          .join("");
        menu.style.left = "8px";
        menu.style.top = "8px";
        menu.showPopover();
        button.setAttribute("aria-expanded", "true");
        menu.addEventListener(
          "toggle",
          (event) => {
            if (event.newState === "closed")
              button.setAttribute("aria-expanded", "false");
          },
          { once: true },
        );
        const rect = button.getBoundingClientRect();
        const bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, innerWidth - bounds.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - bounds.height - 8))}px`;
        menu.querySelector("button")?.focus({ preventScroll: true });
        break;
      }
      case "planning-prompt-dismiss":
      case "planning-prompt-restore": {
        const kind = button.dataset.prompt;
        const record = state.records.find((item) => item.id === id);
        if (!record || !promptKinds[kind]) break;
        const dialog = document.querySelector("#planning-prompts-dialog");
        const restore = action === "planning-prompt-restore";
        const until = button.dataset.until;
        const row = dialog.querySelector(
          `[data-prompt-record="${CSS.escape(id)}"]`,
        );
        const neighbour = (row?.nextElementSibling || row?.previousElementSibling)
          ?.dataset.promptRecord;
        const value = restore
          ? null
          : until === "never"
            ? "never"
            : promptDay(until === "week" ? 7 : 1);
        dialog.querySelector("#planning-prompt-menu")?.hidePopover?.();
        let next;
        try {
          next = withPromptDismissal(record, kind, value);
        } catch (error) {
          toast(error.message, true);
          break;
        }
        if (
          saveRecords(
            state.records.map((item) => (item.id === id ? next : item)),
            restore
              ? "Öneriyi geri getirme"
              : until === "never"
                ? "Öneriyi gizleme"
                : "Öneriyi erteleme",
          )
        )
          toast(
            restore
              ? "Kayıt yeniden önerilecek."
              : until === "never"
                ? "Bu kayıt bu öneride bir daha çıkmayacak. Gizlenenlerden geri getirebilirsin."
                : until === "week"
                  ? "Öneri 1 hafta sonra yeniden görünecek."
                  : "Öneri yarın yeniden görünecek.",
          );
        renderPlanningPrompt();
        (
          (restore &&
            dialog.querySelector(
              `[data-prompt-record="${CSS.escape(id)}"] button`,
            )) ||
          (neighbour &&
            dialog.querySelector(
              `[data-prompt-record="${CSS.escape(neighbour)}"] button`,
            )) ||
          dialog.querySelector(".planning-hidden-toggle") ||
          dialog.querySelector(".modal-footer .btn.primary")
        )?.focus({ preventScroll: true });
        break;
      }
      case "planning-hidden-toggle": {
        planningShowHidden = !planningShowHidden;
        renderPlanningPrompt();
        document
          .querySelector("#planning-prompts-dialog .planning-hidden-toggle")
          ?.focus({ preventScroll: true });
        break;
      }
      case "planning-review": {
        const record = state.records.find((item) => item.id === id);
        if (!record || !active(effectiveRecord(record))) break;
        const row = button.closest("[data-prompt-record]");
        const neighbour = (
          row?.nextElementSibling || row?.previousElementSibling
        )?.dataset.promptRecord;
        if (button.dataset.review === "keep") {
          // Confirming a job is still valid counts as its update.
          if (
            saveRecords(
              state.records.map((item) =>
                item.id === id
                  ? { ...item, updatedAt: new Date().toISOString() }
                  : item,
              ),
              "İşi gözden geçirme",
            )
          )
            toast(
              "İş güncel olarak işaretlendi; 7 gün boyunca listede görünmez.",
            );
        } else if (["completed", "cancelled"].includes(button.dataset.review))
          setRecordStatus(id, button.dataset.review);
        renderPlanningPrompt();
        // Keep the keyboard in the list: move to the next job left to review.
        const dialog = document.querySelector("#planning-prompts-dialog");
        const stays = dialog.querySelector(
          `[data-prompt-record="${CSS.escape(id)}"] [data-review="keep"]`,
        );
        (
          stays ||
          (neighbour &&
            dialog.querySelector(
              `[data-prompt-record="${CSS.escape(neighbour)}"] [data-review="keep"]`,
            )) ||
          dialog.querySelector(".modal-footer .btn.primary")
        )?.focus({ preventScroll: true });
        break;
      }
      case "planning-prompt-record":
        document.querySelector("#planning-prompts-dialog").close();
        if (button.dataset.prompt === "waiting") {
          const record = state.records.find((item) => item.id === id);
          if (record?.type === "waiting") {
            openEditor(id);
            const name =
              waitingGaps(record, today()).find((gap) =>
                ["expectedFrom", "nextFollowUpDate", "latestUpdate"].includes(
                  gap,
                ),
              ) || "expectedFrom";
            document.querySelector(`#record-form [name="${name}"]`)?.focus();
          } else waitingDetails?.open(id);
        } else if (button.dataset.prompt === "review") openEditor(id);
        else goalPanel?.open(id);
        break;
      case "agenda":
        if (button.dataset.agenda === "weekly") {
          navigate("weekly");
          state.planningPeriods.weekly = makePlanningPeriod("weekly", today());
          state.weeklyBacklogOpen = true;
          renderContent();
        } else if (button.dataset.agenda === "waiting") {
          navigate("waiting");
          state.period = "followup";
          state.listSort = "due-asc";
          renderContent();
        } else if (button.dataset.agenda === "waiting-jobs") {
          navigate("daily");
          state.status = "waiting";
          renderContent();
        } else if (button.dataset.agenda === "review") {
          navigate("daily");
          state.period = "review";
          renderContent();
        }
        break;
      case "new":
        openEditor(null, "", "", "daily", { navigateAfterCreate: true });
        break;
      case "new-linked":
        openEditor(null, id);
        break;
      case "waiting-record-details":
        event.preventDefault();
        openRecordPreview("waiting", id, button);
        break;
      case "waiting-children-open":
        event.preventDefault();
        if (!waitingRecordPanel?.canOpen(id)) break;
        closeStatusMenu();
        datePicker?.close();
        choiceFields?.close();
        inlineFields?.close();
        waitingInfo?.close();
        recordNotes?.close();
        closeRecordPreviews("waiting");
        button.focus({ preventScroll: true });
        waitingRecordPanel.open(id, { trigger: button, section: "children" });
        break;
      case "meeting-record-details":
        event.preventDefault();
        openRecordPreview("meeting", id, button);
        break;
      case "goal-card-details":
      case "goal-details":
      case "goal-progress-open":
      case "goal-children-open":
        closeRecordPreviews("goal");
        button.focus({ preventScroll: true });
        closeStatusMenu();
        datePicker?.close();
        inlineFields?.close();
        goalPanel?.open(id, {
          section:
            action === "goal-progress-open"
              ? "progress"
              : action === "goal-children-open"
                ? "children"
                : undefined,
        });
        break;
      case "meeting-route":
        openLinkedAction(id, button.dataset.route);
        break;
      case "meeting-route-both":
        document.querySelector("#editor").close();
        waitingInfo?.close();
        closeStatusMenu();
        datePicker?.close();
        choiceFields?.close();
        inlineFields?.close();
        goalPanel?.close();
        meetingBoth?.open(id);
        break;
      case "open-linked-action":
        openLinkedAction(id, button.dataset.route || null);
        break;
      case "dashboard-weekly":
      case "dashboard-previous":
        navigate("weekly");
        state.planningPeriods.weekly =
          weeklyPeriodFromKey(button.dataset.week) ||
          makePlanningPeriod("weekly", today());
        state.weeklyBacklogOpen = action === "dashboard-previous";
        renderContent();
        break;
      case "daily-from-source":
        openDailyFromSource(id);
        break;
      case "waiting-create-daily":
        try {
          createWaitingDaily(id);
        } catch (error) {
          toast(error.message || "Yeni günlük adım açılamadı.", true);
        }
        break;
      case "migrate-daily-inbox":
        migrateInbox();
        break;
      case "carry-weekly": {
        goalTransfers?.open(id, {
          period: weeklyPeriodFromKey(button.dataset.week),
          trigger: button,
        });
        break;
      }
      case "carry-monthly": {
        goalTransfers?.open(id, {
          period: monthlyPeriodFromKey(button.dataset.month),
          trigger: button,
        });
        break;
      }
      case "period-prev":
      case "period-next":
      case "period-current":
      case "period-all":
        if (!Object.hasOwn(state.planningPeriods, state.view)) break;
        try {
          const current =
            state.planningPeriods[state.view] ||
            makePlanningPeriod(state.view, today());
          state.planningPeriods[state.view] =
            action === "period-all"
              ? null
              : action === "period-current"
                ? makePlanningPeriod(state.view, today())
                : shiftPlanningPeriod(
                    current,
                    action === "period-prev" ? -1 : 1,
                  );
          state.listPage = 1;
          renderContent();
          document
            .querySelector(`[data-action="${action}"]`)
            ?.focus({ preventScroll: true });
        } catch (error) {
          toast(error.message, true);
        }
        break;
      case "edit":
        event.preventDefault();
        openEditor(id, "", "", "daily", {
          keepRecordPanel: Boolean(
            document.querySelector(
              "#waiting-record-panel[open], #meeting-record-panel[open]",
            ),
          ),
          keepGoalPanel: Boolean(
            document.querySelector("#goal-detail-panel[open]"),
          ),
        });
        break;
      case "status-menu":
        openStatusMenu(id, button);
        break;
      case "set-status":
        setRecordStatus(id, button.dataset.status);
        break;
      case "quick-complete": {
        const record = state.records.find((r) => r.id === id);
        if (record && active(effectiveRecord(record)))
          setRecordStatus(id, "completed");
        break;
      }
      case "delete":
        await deleteRecord(id, button);
        break;
      case "close":
        if (button.closest("#editor")) {
          const editor = button.closest("dialog");
          if (typeof editor.requestClose === "function") editor.requestClose();
          else if (
            editor.dispatchEvent(new Event("cancel", { cancelable: true }))
          )
            editor.close();
          break;
        }
        datePicker?.close();
        choiceFields?.close();
        button.closest("dialog")?.close();
        break;
      case "toggle-day-focus": {
        try {
          const next = toggleDayFocus(state.records, id, { today: today() });
          if (saveRecords(next, "Günlük odak seçimi")) {
            (
              document.querySelector(
                `[data-action="toggle-day-focus"][data-id="${CSS.escape(id)}"]`,
              ) ||
              document.querySelector(
                '[data-action="focus-filter"][data-filter="focus"]',
              )
            )?.focus({ preventScroll: true });
          }
        } catch (error) {
          toast(error.message, true);
        }
        break;
      }
      case "review-goal-links":
        openGoalLinkReview();
        break;
      case "focus-filter":
        state.focusFilter = filter;
        renderContent();
        break;
      case "weekly-goal-page": {
        const requested = Number(button.dataset.page);
        if (!Number.isInteger(requested) || requested < 1) break;
        const direction = button.getAttribute("aria-label");
        state.weeklyPage = requested;
        renderContent();
        const controls = [
          ...document.querySelectorAll(
            ".weekly-goal-pagination button:not(:disabled)",
          ),
        ];
        const nextFocus =
          controls.find(
            (control) => control.getAttribute("aria-label") === direction,
          ) ||
          controls[0] ||
          document.querySelector(".dashboard-goals");
        nextFocus?.focus({ preventScroll: true });
        break;
      }
      case "attention-page": {
        const requested = Number(button.dataset.page);
        if (!Number.isInteger(requested) || requested < 1) break;
        const direction = button.getAttribute("aria-label");
        state.attentionPage = requested;
        renderContent();
        const controls = [
          ...document.querySelectorAll(
            ".attention-pagination button:not(:disabled)",
          ),
        ];
        const nextFocus =
          controls.find(
            (control) => control.getAttribute("aria-label") === direction,
          ) ||
          controls[0] ||
          document.querySelector(".attention-list");
        nextFocus?.focus({ preventScroll: true });
        break;
      }
      case "open-list":
        navigate(view);
        state.status = "all";
        renderContent();
        break;
      case "menu": {
        const opened = document
          .querySelector(".sidebar")
          .classList.toggle("open");
        document
          .querySelector(".mobile-backdrop")
          .classList.toggle("open", opened);
        document
          .querySelector(".mobile-toggle")
          .setAttribute("aria-expanded", String(opened));
        break;
      }
    }
  });
  document.querySelector("#status-menu").addEventListener("toggle", (event) => {
    if (event.newState === "closed") {
      statusMenuTrigger?.setAttribute("aria-expanded", "false");
      statusMenuTrigger = null;
    }
  });
  app.addEventListener("keydown", (event) => {
    if (
      event.target.matches(
        'a.task-name[role="button"]:is([data-action="edit"], [data-action="waiting-record-details"])',
      ) &&
      event.key === " " &&
      !event.defaultPrevented &&
      !event.isComposing &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if (
      event.target.matches(".dashboard-detail-card") &&
      ["Enter", " "].includes(event.key)
    ) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      event.preventDefault();
      event.target.click();
      return;
    }
    if (
      event.target.matches("[data-record-row]") &&
      ["Enter", " "].includes(event.key)
    ) {
      event.preventDefault();
      event.target.click();
      return;
    }
    const item = event.target.closest(
      "#status-menu .status-option, #status-menu .waiting-details-control",
    );
    if (!item) return;
    const menuKeys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!menuKeys.includes(event.key)) return;
    event.preventDefault();
    const items = [
      ...document.querySelectorAll(
        "#status-menu .status-option, #status-menu .waiting-details-control",
      ),
    ];
    const index = items.indexOf(item);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next].focus();
  });
  window.addEventListener("resize", () => {
    closeStatusMenu();
    if (
      state.view === "dashboard" &&
      state.attentionPageSize !== dashboardCardColumns()
    )
      renderContent();
  });
  app.addEventListener("input", (event) => {
    if (event.target.id === "global-search") {
      state.search = event.target.value.trim();
      state.listPage = 1;
      state.attentionPage = 1;
      state.weeklyPage = 1;
      renderContent();
    }
  });
  app.addEventListener(
    "toggle",
    (event) => {
      if (event.target.matches?.(".monthly-backlog"))
        state.monthlyBacklogOpen = event.target.open;
      else if (event.target.matches?.(".weekly-backlog"))
        state.weeklyBacklogOpen = event.target.open;
      if (event.newState === "closed") {
        if (dashboardOrderPending) queueMicrotask(refreshDashboardRunningOrder);
        queueMicrotask(refreshCalendarDay);
      }
    },
    true,
  );
  app.addEventListener(
    "close",
    () => {
      if (dashboardOrderPending) queueMicrotask(refreshDashboardRunningOrder);
      queueMicrotask(refreshCalendarDay);
    },
    true,
  );
  app.addEventListener("change", (event) => {
    const el = event.target;
    if (el.closest('form#record-form[data-creation="true"]')) return;
    if (/^editorPeriod/.test(el.name) && el.closest("#record-form")) {
      const form = el.closest("#record-form");
      syncEditorPeriod(
        form,
        form.querySelector('select[name="type"]').value,
        today(),
        el,
      );
      return;
    }
    if (el.name === "status" && el.closest("#record-form"))
      el.closest("#record-form").dataset.statusTouched = "true";
    if (
      [
        "status-filter",
        "priority-filter",
        "period-filter",
        "work-context-filter",
        "list-sort",
      ].includes(el.id)
    )
      state.listPage = 1;
    if (el.id === "list-sort") {
      state.listSort = el.value;
      renderContent();
    }
    if (el.id === "status-filter") {
      state.status = el.value;
      renderContent();
    }
    if (el.id === "priority-filter") {
      state.priority = el.value;
      renderContent();
    }
    if (el.id === "period-filter") {
      state.period = el.value;
      renderContent();
    }
    if (el.id === "work-context-filter") {
      state.workContext = el.value;
      renderContent();
    }
    if (el.name === "workContext" && el.closest("#record-form")) {
      updateEditorContext();
      updateParentOptions();
      updateEditorDetails();
    }
    if (el.name === "status" && el.closest("#record-form"))
      updateEditorDetails();
    if (el.name === "parentId" && el.closest("#record-form")) {
      el.closest("#record-form").elements.workContext.value = el.value
        ? ""
        : "ad_hoc";
      updateParentOptions();
      updateEditorContext();
      updateEditorDetails();
    }
    if (el.name === "type") {
      updateEditorType(el.value);
    }
    if (el.closest("#goal-links-review-form")) updateGoalLinkReviewSave();
    if (el.name === "theme" && el.closest("#settings-dialog")) {
      const updated = normalizePreferences({ ...preferences, theme: el.value });
      if (savePreferences(updated))
        document.querySelector("#settings-error").textContent = "";
      else {
        applyPreferences();
        document.querySelector("#settings-error").innerHTML =
          '<p class="error-message">Tema kaydedilemedi.</p>';
      }
    }
    if (el.id === "restore-file") restoreRecords(el.files[0], el);
  });
  app.addEventListener("submit", (event) => {
    if (event.target.matches('form#record-form[data-creation="true"]')) return;
    if (event.target.matches("form#goal-links-review-form")) {
      event.preventDefault();
      saveGoalLinkReview(event.target);
      return;
    }
    if (!event.target.matches("form#record-form")) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const measurement = readRecordEditorNumeric(event.target);
    delete data.editorNumeric;
    if (
      ["weekly", "monthly", "yearly"].includes(data.type) &&
      measurement &&
      !measurement.enabled
    ) {
      for (const key of ["metric", "targetValue", "currentValue"]) {
        if (measurement.touched) data[key] = key === "metric" ? "" : null;
        else delete data[key];
      }
    }
    const existing = state.records.find((r) => r.id === data.id);
    try {
      if (data.id && !existing)
        throw new Error(
          "Bu kayıt başka bir pencerede silindi. Değişiklikler kaydedilmedi.",
        );
      if (
        existing &&
        event.target.dataset.recordSnapshot !== JSON.stringify(existing)
      )
        throw new Error(
          "Bu kayıt başka bir pencerede değişti. Taslağın korunuyor; güncel kaydı yeniden açarak devam et.",
        );
      if (
        existing &&
        event.target.dataset.statusTouched !== "true" &&
        recordFormValues(event.target) === event.target.dataset.initialValues &&
        !(
          ["weekly", "monthly", "yearly"].includes(data.type) &&
          measurement?.touched &&
          !measurement.enabled &&
          ["metric", "targetValue", "currentValue"].some(
            (key) => data[key] !== existing[key],
          )
        )
      ) {
        document.querySelector("#editor").close();
        return;
      }
      for (const key of [
        "dueDate",
        "sourceDate",
        "lastFollowUpDate",
        "nextFollowUpDate",
      ])
        if (!event.target.elements[key].disabled)
          data[key] = readDateValue(event.target.elements[key]);
      const sourceId = event.target.dataset.followupSource;
      if (
        existing?.type === "meeting" &&
        data.type === "meeting" &&
        linkedActions(existing.id, state.records).length
      )
        delete data.status;
      const source = state.records.find(
        (r) => r.id === sourceId && ["meeting", "waiting"].includes(r.type),
      );
      if (sourceId && !source)
        throw new Error(
          "Kaynak takip kaydı artık bulunamıyor. Pencereyi kapatıp tekrar dene.",
        );
      if (
        !existing &&
        source &&
        linkedAction(source.id, state.records, data.type)
      ) {
        document.querySelector("#editor").close();
        openLinkedAction(source.id, data.type);
        toast("Bu akışın kaydı zaten var; mevcut kayıt açıldı.");
        return;
      }
      if (
        existing &&
        data.type === existing.type &&
        statusForDisplay(existing.status, existing.type) !== existing.status &&
        data.status === statusForDisplay(existing.status, existing.type) &&
        event.target.dataset.statusTouched !== "true"
      )
        data.status = existing.status;
      if (
        data.status &&
        !isStatusSelectable(data.type, data.status) &&
        !(existing?.type === data.type && existing.status === data.status)
      )
        throw new Error("Bu durum bu kayıt türünde seçilemez.");
      const input = {
        ...data,
        ...(source
          ? {
              type: data.type,
              sourceFields: {
                __followupSource: { recordId: source.id, type: source.type },
              },
            }
          : {}),
        parentId:
          data.type === "daily" && data.workContext !== "ad_hoc"
            ? data.parentId || ""
            : "",
        blocked: data.type === "daily" ? false : existing?.blocked || false,
        carryForward: existing?.carryForward || false,
      };
      if (["weekly", "monthly"].includes(data.type) && data.goalParentId)
        input.goalParentId = data.goalParentId;
      else if (Object.hasOwn(existing || {}, "goalParentId"))
        input.goalParentId = null;
      else delete input.goalParentId;
      if (!data.workContext && !Object.hasOwn(existing || {}, "workContext"))
        delete input.workContext;
      for (const key of [
        "projectCode",
        "waitingReason",
        "nextFollowUpDate",
        "latestUpdate",
      ])
        if (
          !String(data[key] || "").trim() &&
          !Object.hasOwn(existing || {}, key)
        )
          delete input[key];
      const record = existing
        ? createRecord({
            ...existing,
            ...input,
            updatedAt: new Date().toISOString(),
          })
        : createRecord(input);
      if (
        saveRecords(
          existing
            ? state.records.map((r) => (r.id === existing.id ? record : r))
            : [...state.records, record],
          existing ? "Kayıt düzenleme" : "Yeni kayıt",
        )
      ) {
        document.querySelector("#editor").close();
        toast(existing ? "Değişiklikler kaydedildi." : "Yeni kayıt eklendi.");
      }
    } catch (error) {
      document.querySelector("#form-error").innerHTML =
        `<p class="error-message">${esc(error.message)}</p>`;
    }
  });
  window.addEventListener("storage", (event) => {
    if (![STORAGE_KEY, PREFERENCES_KEY].includes(event.key)) return;
    try {
      const before = renderedWorkspaceDomain;
      workspaceStore.synchronize(localStorage.getItem(STORAGE_KEY));
      const changed =
        before !==
        workspaceDomainSnapshot(
          workspaceStore.records,
          workspaceStore.preferences,
        );
      if (changed) syncWorkspaceView();
      else {
        workSessions?.refresh();
        updateUndoButton();
      }
      if (event.key === STORAGE_KEY && changed)
        toast("Çalışma alanı diğer penceredeki değişikliklerle güncellendi.");
    } catch (error) {
      toast(
        error.message || "Diğer penceredeki değişiklikler okunamadı.",
        true,
      );
    }
  });
  window.addEventListener("keydown", (event) => {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== "z"
    )
      return;
    const target = event.target;
    if (document.querySelector("dialog:modal")) return;
    if (
      target instanceof Element &&
      target.closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
      )
    )
      return;
    if (workspaceStore?.canUndo) {
      event.preventDefault();
      undoLastAction();
    }
  });
  let workspaceStorage;
  try {
    workspaceStorage = window.localStorage;
  } catch {
    workspaceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Tarayıcı depolamasına erişilemiyor.");
      },
    };
  }
  workspaceStore = createWorkspaceStore({
    storage: workspaceStorage,
    key: STORAGE_KEY,
    preferencesKey: PREFERENCES_KEY,
    initialRecords: state.records,
    initialPreferences: preferences,
    readOnly: Boolean(storageError),
  });
  state.records = workspaceStore.records;
  preferences = workspaceStore.preferences;
  initWorkSessions();
  // Reminders read the notes only once the workspace store exists.
  reminderBell?.refresh();
  function activateMainWindow(id = null) {
    window.focus();
    const record = state.records.find((item) => item.id === id);
    if (record) {
      if (document.querySelector("dialog:modal")) {
        toast(
          "Önce açık formu tamamla veya kapat; ardından diğer kaydı açabilirsin.",
        );
      } else {
        navigate(record.type);
        openEditor(record.id);
      }
    }
    return { focused: document.hasFocus() };
  }
  const windows = createWindowCoordinator({
    onActivateMain: activateMainWindow,
  });
  summaryWidget = createSummaryWidget({
    findWidget: () => windows.activateWidget(),
    onMessage: toast,
  });
  renderedCalendarDay = today();
  const calendarTimer = window.setInterval(refreshCalendarDay, 30000);
  window.addEventListener("focus", refreshCalendarDay);
  const onCalendarVisible = () => {
    if (!document.hidden) refreshCalendarDay();
  };
  document.addEventListener("visibilitychange", onCalendarVisible);
  window.addEventListener(
    "pagehide",
    () => {
      window.clearInterval(calendarTimer);
      window.removeEventListener("focus", refreshCalendarDay);
      document.removeEventListener("visibilitychange", onCalendarVisible);
    },
    { once: true },
  );
  const stopThemeWatch = watchTheme(document, () => preferences, window);
  window.addEventListener("pagehide", stopThemeWatch, { once: true });
  render();
  cleanupMeetingContactsOnce();
  migrateInbox(true);
  cleanupImportNotes(true);
  cleanupWaitingNotes(true);
  migrateWaitingState(true);
  if (desktopMode) {
    const requestedId = new URLSearchParams(location.hash.split("?")[1]).get(
      "record",
    );
    const requested = state.records.find((record) => record.id === requestedId);
    if (requested) {
      navigate(requested.type);
      openEditor(requested.id);
    }
  }
}
