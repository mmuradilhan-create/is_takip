import { validateStore } from "./model.js";
import {
  renderWidgetSummary,
  toggleAgendaDetail,
  widgetDocumentHtml,
} from "./widget.js";
import { createWindowCoordinator } from "./window-coordinator.js";
import { createWidgetWork } from "./widget-work.js";
import {
  desktopWindowFeatures,
  fitWidgetWindow,
  windowRoleHash,
  windowPinSupported,
  windowSizingMode,
  WIDGET_STRIP_HEIGHT,
} from "./window-size.js";
import {
  WORK_SESSION_KEY,
  readPrimaryWorkSessionRaw,
} from "./work-session-store.js";
import {
  renderWidgetSession,
  widgetSessionSummary,
} from "./widget-session-presenter.js";
import {
  applyTheme,
  normalizePreferences,
  validPreferences,
  watchTheme,
} from "./preferences.js";

const STORAGE_KEY = "is-takip-v1";
const PREFERENCES_KEY = `${STORAGE_KEY}-preferences`;

/** A read-only summary for a directly launched application window. */
export function startStandaloneWidget() {
  const embedded = document.querySelector("#initial-data")?.textContent;
  const embeddedPreferences = document.querySelector(
    "#initial-preferences",
  )?.textContent;
  const template = new DOMParser().parseFromString(
    widgetDocumentHtml,
    "text/html",
  );
  document.documentElement.lang = "tr";
  document.documentElement.setAttribute("translate", "no");
  document.documentElement.classList.add("notranslate");
  document.documentElement.dataset.odakWidget = "true";
  document.head.replaceChildren(
    ...[...template.head.childNodes].map((node) =>
      document.importNode(node, true),
    ),
  );
  document.body.replaceChildren(
    ...[...template.body.childNodes].map((node) =>
      document.importNode(node, true),
    ),
  );
  document.querySelector(".widget-live").title =
    "Kayıtlar değiştikçe güncellenir";
  const pin = document.getElementById("widget-pin");
  const pinSupported = windowPinSupported(window);
  pin.disabled = !pinSupported;
  if (pinSupported) pin.title = "Üstte tut";
  else if (windowSizingMode(window) === "native")
    pin.title =
      "Üstte tut için ODAK pencerelerini kapatıp güncel Windows paketini yeniden aç.";

  let previousRaw;
  let previousLegacyPreferences;
  let preferences = normalizePreferences();
  let records = [];
  let fallback;
  let failed = false;
  let stopped = false;
  let stopSizing = () => {};
  let activating = false;
  let activationMessage = "";
  let mainPopup = null;
  let view = "today";
  let pane = "work";
  let pinned = false;
  let folded = false;
  let unfoldedSize = null;
  const stripButton = document.getElementById("widget-strip");
  // Pinning and folding both reach the Windows helper through the title.
  const widgetTitle = () =>
    `ODAK · Özet${pinned ? " · Üstte" : ""}${folded ? " · İnce" : ""}`;
  /**
   * Fold the widget to one line with the work in progress, or open it again.
   * With the Windows package the helper resizes the window (it owns its
   * size); in a browser popup the page resizes itself.
   */
  function setFolded(next) {
    if (folded === next) return;
    folded = next;
    if (folded) document.documentElement.dataset.widgetStrip = "";
    else delete document.documentElement.dataset.widgetStrip;
    const label = folded ? "Widget'ı büyüt" : "Şeride küçült";
    stripButton.setAttribute("aria-label", label);
    stripButton.title = label;
    stripButton.setAttribute("aria-pressed", String(folded));
    stripButton
      .querySelector("path")
      .setAttribute("d", folded ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6");
    document.title = widgetTitle();
    if (windowSizingMode(window) === "native") return;
    try {
      if (folded) {
        unfoldedSize = { width: window.outerWidth, height: window.outerHeight };
        window.resizeTo(
          window.outerWidth,
          window.outerHeight - window.innerHeight + WIDGET_STRIP_HEIGHT,
        );
      } else if (unfoldedSize) {
        window.resizeTo(unfoldedSize.width, unfoldedSize.height);
        unfoldedSize = null;
      }
    } catch {
      /* A window the page may not resize keeps its size; the strip still folds. */
    }
  }
  let workMessage = "";
  let workTone = "";
  let workMessageTimer = null;
  const shell = document.querySelector(".widget-shell");
  const paneToggle = document.getElementById("widget-view-toggle");
  const stopTheme = watchTheme(document, () => preferences, window);
  const windows = createWindowCoordinator({
    onActivateWidget: () => {
      window.focus();
      return { focused: document.hasFocus() };
    },
  });

  function initialRecords() {
    if (fallback === undefined) {
      fallback = embedded ? validateStore(JSON.parse(embedded)).records : [];
    }
    return fallback;
  }

  function showError() {
    renderWidgetSummary(document, [], new Date(), { view });
    renderWidgetSession(document, null);
    for (const id of [
      "widget-today-count",
      "widget-tomorrow-count",
      "widget-overdue-count",
    ]) {
      document.getElementById(id).textContent = "—";
    }
    document.getElementById("widget-task-count").textContent = "—";
    document.getElementById("widget-tasks").innerHTML =
      '<li class="widget-empty">Kayıtlar okunamıyor.</li>';
    delete document.getElementById("widget-status").dataset.tone;
    document.getElementById("widget-status").textContent =
      "Kayıtlar okunamadı. Verilerin değiştirilmedi; ODAK’ı açarak kontrol edebilirsin.";
  }

  function refreshSession() {
    if (stopped) return;
    let summary = null;
    if (!failed) {
      try {
        summary = widgetSessionSummary(
          records,
          readPrimaryWorkSessionRaw(
            window.localStorage.getItem(STORAGE_KEY),
            window.localStorage.getItem(WORK_SESSION_KEY),
          ),
          Date.now(),
        );
      } catch {
        // Optional session context cannot make the agenda unreadable.
      }
    }
    renderWidgetSession(document, summary);
  }

  function showStatus() {
    if (failed) return;
    // Work messages belong to the work view; the agenda keeps its own status.
    const message = pane === "work" ? workMessage : "";
    const status = document.getElementById("widget-status");
    status.textContent = message || activationMessage;
    if (message && workTone === "info") status.dataset.tone = "info";
    else delete status.dataset.tone;
  }

  function setPane(next) {
    pane = next;
    const agenda = pane === "agenda";
    shell.dataset.view = pane;
    paneToggle.title = agenda ? "Çalışmaya dön" : "Ajandayı göster";
    paneToggle.querySelector("span").textContent = agenda
      ? "Çalışma"
      : "Ajanda";
    document.querySelector(".widget-live").textContent = agenda
      ? "Mini ajanda"
      : "Çalışma";
    if (agenda) refresh(true);
    else work?.refresh();
    showStatus();
  }

  function refresh(force = false) {
    if (stopped) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const legacyRaw = window.localStorage.getItem(PREFERENCES_KEY);
      const changed =
        raw !== previousRaw || legacyRaw !== previousLegacyPreferences;
      // The once-a-second check redraws nothing unless something changed;
      // redrawing the work panel every second made typing a note stutter.
      if (!changed && !force && !failed) {
        refreshSession();
        return;
      }
      work?.refresh();
      if (changed || failed) {
        // A deliberately empty saved store must take precedence over seeds.
        const saved = raw === null ? null : JSON.parse(raw);
        records =
          saved === null ? initialRecords() : validateStore(saved).records;
        const primaryPreferences =
          saved?.odak?.version === 1 && validPreferences(saved.odak.preferences)
            ? saved.odak.preferences
            : null;
        let legacyPreferences;
        try {
          legacyPreferences = JSON.parse(
            legacyRaw ?? embeddedPreferences ?? "null",
          );
        } catch {
          // Optional appearance data cannot make task records unreadable.
        }
        preferences = normalizePreferences(
          primaryPreferences ?? legacyPreferences,
        );
        applyTheme(document, preferences, window);
        previousRaw = raw;
        previousLegacyPreferences = legacyRaw;
      }
      renderWidgetSummary(document, records, new Date(), { view });
      failed = false;
      showStatus();
      refreshSession();
    } catch {
      failed = true;
      showError();
    }
  }

  async function openMain(recordId = null) {
    if (activating) return;
    activating = true;
    // While the click still counts, a widget opened from ODAK can bring that
    // window forward itself; the Windows helper does it in the package.
    try {
      if (window.opener && !window.opener.closed) window.opener.focus();
    } catch {
      /* Another origin or a closed window: the coordinator still answers. */
    }
    const button = document.getElementById("widget-open-main");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const result = await windows.activateMain(recordId);
      if (stopped) return;
      if (result.existing) {
        activationMessage = result.focused
          ? "Açık ODAK penceresine geçildi."
          : "ODAK zaten açık. Görev çubuğundan ODAK’a geçebilirsin.";
        if (!failed)
          document.getElementById("widget-status").textContent =
            activationMessage;
        return;
      }
      const target = new URL(window.location.href);
      target.hash = windowRoleHash(
        "desktop",
        window,
        recordId ? { record: recordId } : {},
      );
      const scope = new URL(target.href);
      scope.hash = "";
      let hash = 5381;
      for (const character of scope.href)
        hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
      try {
        if (!mainPopup || mainPopup.closed) {
          mainPopup = window.open(
            target.href,
            `odak-main-${(hash >>> 0).toString(16)}`,
            desktopWindowFeatures(window),
          );
        }
        if (mainPopup) mainPopup.focus();
      } catch {
        /* Display the popup restriction without replacing the widget. */
      }
      if (!mainPopup) {
        activationMessage =
          "ODAK penceresi engellendi. Tarayıcıda açılır pencerelere izin ver.";
        if (!failed)
          document.getElementById("widget-status").textContent =
            activationMessage;
      }
    } catch {
      activationMessage =
        "ODAK penceresine erişilemedi. Görev çubuğundan ODAK’ı seçebilirsin.";
      if (!failed)
        document.getElementById("widget-status").textContent =
          activationMessage;
    } finally {
      activating = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#widget-view-toggle")) {
      setPane(pane === "agenda" ? "work" : "agenda");
      return;
    }
    if (target.closest("#widget-pin")) {
      if (pinSupported) {
        pinned = !pinned;
        pin.setAttribute("aria-pressed", String(pinned));
        pin.title = pinned ? "Üstte tutmayı kapat" : "Üstte tut";
        document.title = widgetTitle();
      }
      return;
    }
    if (target.closest("#widget-strip, #widget-strip-line")) {
      setFolded(!folded);
      return;
    }
    const day = target.closest("[data-widget-day]");
    if (day) {
      view = day.dataset.widgetDay;
      refresh(true);
      return;
    }
    // An agenda title opens its details here; only the edit button
    // inside them opens the record in ODAK.
    const detail = target.closest("[data-agenda-detail]");
    if (detail) {
      toggleAgendaDetail(detail.dataset.agendaDetail);
      refresh(true);
      return;
    }
    const task = target.closest("[data-record-id]");
    if (task) openMain(task.dataset.recordId);
    else if (target.closest("#widget-open-main")) openMain();
  });

  const onStorage = (event) => {
    if (event.key === WORK_SESSION_KEY) {
      refreshSession();
      work?.refresh();
      return;
    }
    if (
      event.key === STORAGE_KEY ||
      event.key === PREFERENCES_KEY ||
      event.key === null
    )
      refresh(true);
  };
  const onFocus = () => refresh(true);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);
  window.addEventListener("odak:refresh", onFocus);
  const polling = window.setInterval(() => refresh(), 1000);
  const dateUpdates = window.setInterval(() => refresh(true), 30000);
  function stop() {
    stopped = true;
    window.clearInterval(polling);
    window.clearInterval(dateUpdates);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("odak:refresh", onFocus);
    work?.destroy();
    window.clearTimeout(workMessageTimer);
    windows.stop();
    stopSizing();
    stopTheme();
  }
  window.addEventListener("pagehide", stop, { once: true });
  let work = null;
  try {
    work = createWidgetWork({
      document,
      window,
      storageKey: STORAGE_KEY,
      preferencesKey: PREFERENCES_KEY,
      onOpenRecord: (id) => openMain(id),
      onMessage: (message, tone = "error") => {
        workMessage = message;
        workTone = tone;
        showStatus();
        window.clearTimeout(workMessageTimer);
        workMessageTimer = window.setTimeout(() => {
          workMessage = "";
          showStatus();
        }, 6000);
      },
    });
  } catch {
    // The agenda stays available when the work view cannot start.
    setPane("agenda");
  }
  refresh(true);
  stopSizing = fitWidgetWindow(window);
  return { refresh: () => refresh(true), stop };
}
