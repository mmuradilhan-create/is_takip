import { validateStore } from "./model.js";
import { renderWidgetSummary, widgetDocumentHtml } from "./widget.js";
import { createWindowCoordinator } from "./window-coordinator.js";
import {
  desktopWindowFeatures,
  fitWidgetWindow,
  windowRoleHash,
} from "./window-size.js";
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
  let dayOffset = 0;
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
    renderWidgetSummary(document, [], new Date(), { dayOffset });
    for (const id of ["widget-today-count", "widget-tomorrow-count"]) {
      document.getElementById(id).textContent = "—";
    }
    document.getElementById("widget-task-count").textContent = "—";
    document.getElementById("widget-tasks").innerHTML =
      '<li class="widget-empty">Kayıtlar okunamıyor.</li>';
    document.getElementById("widget-status").textContent =
      "Kayıtlar okunamadı. Verilerin değiştirilmedi; ODAK’ı açarak kontrol edebilirsin.";
  }

  function refresh(force = false) {
    if (stopped) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const legacyRaw = window.localStorage.getItem(PREFERENCES_KEY);
      const changed =
        raw !== previousRaw || legacyRaw !== previousLegacyPreferences;
      if (!changed && !force && !failed) return;
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
      renderWidgetSummary(document, records, new Date(), { dayOffset });
      document.getElementById("widget-status").textContent = activationMessage;
      failed = false;
    } catch {
      failed = true;
      showError();
    }
  }

  async function openMain(recordId = null) {
    if (activating) return;
    activating = true;
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
    const day = target.closest("[data-widget-day]");
    if (day) {
      dayOffset = day.dataset.widgetDay === "tomorrow" ? 1 : 0;
      refresh(true);
      return;
    }
    const task = target.closest("[data-record-id]");
    if (task) openMain(task.dataset.recordId);
    else if (target.closest("#widget-open-main")) openMain();
  });

  const onStorage = (event) => {
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
    windows.stop();
    stopSizing();
    stopTheme();
  }
  window.addEventListener("pagehide", stop, { once: true });
  refresh(true);
  stopSizing = fitWidgetWindow(window);
  return { refresh: () => refresh(true), stop };
}
