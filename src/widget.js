import { WIDGET_VIEWPORT, windowRoleHash } from "./window-size.js";
import { widgetAgenda } from "./widget-agenda-model.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const eventIcons = {
  due: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6m8-6v6M4 11h16"/></svg>',
  followup:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};
const typeLabels = {
  daily: "Günlük iş",
  weekly: "Haftalık hedef",
  monthly: "Aylık hedef",
  meeting: "Toplantı aksiyonu",
  waiting: "Bekleyen konu",
};

export const widgetDocumentHtml = `<!doctype html>
<html lang="tr" data-odak-widget="true">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>ODAK · Özet</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23174d43'/%3E%3Ccircle cx='16' cy='16' r='8' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E">
  <style>
    :root { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; color:#294735; background:#f6f8f3; font-synthesis:none; color-scheme:light; }
    * { box-sizing:border-box; }
    html,body { width:100%; height:100%; margin:0; overflow:hidden; }
    button { font:inherit; cursor:pointer; }
    button:focus-visible { outline:3px solid #87b89d; outline-offset:2px; }
    .widget-shell { display:flex; flex-direction:column; gap:9px; width:100%; height:100%; height:100dvh; min-width:0; padding:12px; }
    .widget-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex:0 0 auto; }
    h1 { margin:0; color:#174d43; font-size:20px; line-height:1.2; font-weight:850; letter-spacing:2px; }
    .widget-live { color:#64775f; font-size:11px; }
    .widget-day-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; flex:0 0 auto; }
    .widget-day-tab { display:flex; align-items:center; justify-content:center; gap:8px; min-width:0; min-height:35px; padding:6px 10px; border:1px solid #dce5d7; border-radius:8px; background:#fff; color:#5d715a; font-size:12px; font-weight:600; }
    .widget-day-tab[aria-pressed="true"] { color:#174d43; border-color:#a8c5a0; background:#eaf2e4; }
    .widget-day-count { display:inline-flex; align-items:center; justify-content:center; min-width:20px; min-height:20px; padding:1px 5px; border-radius:6px; background:#f0f4ed; font-size:11px; font-variant-numeric:tabular-nums; }
    .widget-day-tab[aria-pressed="true"] .widget-day-count { background:#d7e7ce; }
    .widget-work { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; min-width:0; overflow:hidden; border:1px solid #dfe7da; border-radius:10px; background:#fff; }
    .widget-work-header { display:flex; justify-content:space-between; align-items:center; gap:8px; flex:0 0 auto; min-width:0; padding:10px; border-bottom:1px solid #e8eee4; }
    #widget-date { min-width:0; margin:0; color:#36573c; font-size:12px; line-height:1.4; font-weight:650; }
    #widget-task-count { color:#6b7e64; font-size:10px; white-space:nowrap; }
    #widget-tasks { list-style:none; min-width:0; min-height:0; flex:1 1 auto; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; scrollbar-gutter:stable; margin:0; padding:0; }
    .widget-task { min-width:0; padding:9px 10px; border-bottom:1px solid #edf0e9; }
    .widget-task:last-child { border-bottom:0; }
    .widget-task-open { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; width:100%; min-width:0; margin:0; padding:0; border:0; background:none; color:#304d37; font-size:12px; font-weight:600; line-height:1.35; text-align:left; overflow-wrap:anywhere; }
    .widget-task-open:hover { color:#174d43; text-decoration:underline; }
    .widget-task-meta { display:flex; align-items:center; flex-wrap:wrap; gap:4px 7px; min-width:0; margin-top:5px; font-size:10px; line-height:1.3; color:#6c7b65; }
    .widget-event-kind { display:inline-flex; align-items:center; gap:4px; padding:2px 5px; border-radius:5px; color:#476982; background:#edf3f8; }
    .widget-event-kind.followup { color:#886028; background:#fbf2e2; }
    .widget-event-kind svg { width:11px; height:11px; flex:0 0 11px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .widget-record-type { min-width:0; overflow-wrap:anywhere; }
    .widget-empty { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:6px; min-height:100%; padding:20px 14px; color:#6b7e64; font-size:11px; line-height:1.5; text-align:center; }
    .widget-empty strong { color:#3f5c43; font-size:12px; }
    .widget-footer { flex:0 0 auto; min-width:0; }
    #widget-open-main { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:36px; padding:8px 12px; border:1px solid #174d43; border-radius:8px; background:#174d43; color:#fff; font-size:12px; font-weight:600; }
    #widget-open-main:hover { background:#256354; }
    #widget-open-main svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    #widget-status:empty { display:none; }
    #widget-status { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; max-height:44px; margin:7px 0 0; overflow:hidden; overflow-wrap:anywhere; color:#9c4a36; font-size:10px; line-height:1.35; }
    :root[data-theme="dark"] { color:#e9eaec; background:#0d0e10; color-scheme:dark; }
    [data-theme="dark"] h1 { color:#9dd8b7; }
    [data-theme="dark"] :is(.widget-live,#widget-task-count,.widget-task-meta,.widget-empty) { color:#b7bbc2; }
    [data-theme="dark"] :is(.widget-day-tab,.widget-work) { color:#d3d8d1; background:#18191b; border-color:#3d4249; }
    [data-theme="dark"] .widget-day-tab[aria-pressed="true"] { color:#c3e7ce; background:#263b2c; border-color:#719b74; }
    [data-theme="dark"] .widget-day-count { color:#d3d8d1; background:#292d2a; }
    [data-theme="dark"] .widget-day-tab[aria-pressed="true"] .widget-day-count { background:#35513c; }
    [data-theme="dark"] :is(.widget-work-header,.widget-task) { border-color:#353b40; }
    [data-theme="dark"] :is(#widget-date,.widget-task-open,.widget-empty strong) { color:#e9eaec; }
    [data-theme="dark"] .widget-task-open:hover { color:#9dd8b7; }
    [data-theme="dark"] .widget-event-kind { color:#bdd6e8; background:#263746; }
    [data-theme="dark"] .widget-event-kind.followup { color:#efd09a; background:#443824; }
    [data-theme="dark"] #widget-status { color:#ffb9ae; }
    [data-theme="dark"] #widget-open-main { color:#122e23; background:#9dd8b7; border-color:#9dd8b7; }
    [data-theme="dark"] #widget-open-main:hover { background:#b8e8ce; }
    @media(max-width:310px) { .widget-shell { padding:9px; gap:7px; } .widget-task { padding:8px; } }
  </style>
</head>
<body>
  <main class="widget-shell">
    <header class="widget-header"><h1>ODAK</h1><span class="widget-live">Mini ajanda</span></header>
    <nav class="widget-day-tabs" aria-label="Ajanda günü"><button type="button" class="widget-day-tab" data-widget-day="today" aria-pressed="true">Bugün <span class="widget-day-count" id="widget-today-count">0</span></button><button type="button" class="widget-day-tab" data-widget-day="tomorrow" aria-pressed="false">Yarın <span class="widget-day-count" id="widget-tomorrow-count">0</span></button></nav>
    <section class="widget-work" aria-label="Seçili günün ajandası">
      <header class="widget-work-header"><time id="widget-date"></time><span id="widget-task-count"></span></header>
      <ul id="widget-tasks" tabindex="0" aria-label="Seçili günün teslimleri ve takipleri"></ul>
    </section>
    <footer class="widget-footer"><button type="button" id="widget-open-main">ODAK’ı aç <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-5-5 5 5-5 5"/></svg></button><p id="widget-status" role="status" aria-live="polite"></p></footer>
  </main>
</body>
</html>`;

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
});

export function renderWidgetSummary(
  document,
  records,
  date = new Date(),
  options = {},
) {
  const agenda = widgetAgenda(records, date, options);
  const list = document.getElementById("widget-tasks");
  const sameDay = list.dataset.agendaDate === agenda.selectedDate;
  const previousScroll = sameDay ? list.scrollTop : 0;
  const focused = document.activeElement?.closest?.("[data-record-id]");
  const focusedId =
    focused && list.contains(focused) ? focused.dataset.recordId : null;
  const restoreFocus = Boolean(focusedId && document.hasFocus());
  const dateElement = document.getElementById("widget-date");
  dateElement.dateTime = agenda.selectedDate;
  dateElement.textContent = dayFormatter.format(
    new Date(`${agenda.selectedDate}T12:00:00`),
  );
  document.getElementById("widget-today-count").textContent = String(
    agenda.todayCount,
  );
  document.getElementById("widget-tomorrow-count").textContent = String(
    agenda.tomorrowCount,
  );
  for (const button of document.querySelectorAll("[data-widget-day]"))
    button.setAttribute(
      "aria-pressed",
      String(
        (button.dataset.widgetDay === "tomorrow" ? 1 : 0) === agenda.dayOffset,
      ),
    );
  document.getElementById("widget-task-count").textContent =
    `${agenda.entries.length} kayıt`;
  list.dataset.agendaDate = agenda.selectedDate;
  list.innerHTML = agenda.entries.length
    ? agenda.entries
        .map(
          (entry) =>
            `<li class="widget-task" data-id="${escapeHtml(entry.record.id)}" data-entry-kind="${entry.kind}" data-entry-date="${entry.date}"><button type="button" class="widget-task-open" data-record-id="${escapeHtml(entry.record.id)}" title="${escapeHtml(entry.record.title)}">${escapeHtml(entry.record.title)}</button><div class="widget-task-meta"><span class="widget-event-kind ${entry.kind}">${eventIcons[entry.kind]}${entry.kind === "followup" ? "Takip" : "Teslim"}</span><span class="widget-record-type">${escapeHtml(typeLabels[entry.record.type] || entry.record.type)}</span></div></li>`,
        )
        .join("")
    : `<li class="widget-empty"><strong>${agenda.dayOffset ? "Yarın" : "Bugün"} için kayıt yok.</strong><span>Teslim veya takip tarihi olan açık kayıtlar burada görünür.</span></li>`;
  list.scrollTop = previousScroll;
  if (restoreFocus) {
    const next =
      sameDay &&
      [...list.querySelectorAll("[data-record-id]")].find(
        (button) => button.dataset.recordId === focusedId,
      );
    (
      next ||
      document.querySelector(
        `[data-widget-day="${agenda.dayOffset ? "tomorrow" : "today"}"]`,
      )
    )?.focus({ preventScroll: true });
  }
}

/** Open an independent summary window without replacing or closing its owner. */
export function createSummaryWidget({ findWidget, onMessage } = {}) {
  let popup = null;
  let opening = null;
  const url = new URL(window.location.href);
  url.hash = windowRoleHash("widget", window);
  const scope = new URL(url.href);
  scope.hash = "";
  let hash = 5381;
  for (const character of scope.href)
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  const name = `odak-widget-${(hash >>> 0).toString(16)}`;

  function refresh() {
    if (!popup || popup.closed) {
      popup = null;
      return false;
    }
    try {
      popup.dispatchEvent(new popup.Event("odak:refresh"));
      return true;
    } catch {
      return false;
    }
  }

  async function openWindow() {
    if (popup && !popup.closed) {
      try {
        popup.focus();
        refresh();
        return popup;
      } catch {
        /* Locate an independent widget through the coordinator. */
      }
    }
    const result = typeof findWidget === "function" ? await findWidget() : null;
    if (result?.existing) {
      if (!result.focused)
        onMessage?.("Widget zaten açık. Görev çubuğundan seçebilirsin.");
      return null;
    }
    let next;
    try {
      next = window.open(
        url.href,
        name,
        `popup=yes,width=${WIDGET_VIEWPORT.width},height=${WIDGET_VIEWPORT.height},resizable=yes,scrollbars=yes`,
      );
    } catch {
      /* Show the same actionable error as a blocked popup. */
    }
    if (!next) {
      onMessage?.(
        "Özet penceresi engellendi. Tarayıcıda açılır pencerelere izin ver.",
        true,
      );
      return null;
    }
    popup = next;
    try {
      next.focus();
    } catch {
      /* The browser controls foreground policy. */
    }
    return next;
  }

  function open() {
    if (opening) return opening;
    opening = openWindow()
      .catch(() => {
        onMessage?.("Özet penceresi açılamadı. Tekrar deneyebilirsin.", true);
        return null;
      })
      .finally(() => {
        opening = null;
      });
    return opening;
  }

  function close() {
    const current = popup;
    popup = null;
    try {
      if (current && !current.closed) current.close();
    } catch {
      /* Already closed. */
    }
  }

  // The summary reads the same saved workspace itself. It intentionally stays
  // alive through main-window reloads and closure; no owner pagehide handler.
  return { open, refresh, close };
}
