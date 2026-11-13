import { WIDGET_VIEWPORT, windowRoleHash } from "./window-size.js";
import { widgetAgenda } from "./widget-agenda-model.js";
import { PRIORITIES, statusLabel } from "./model.js";

// The agenda row whose details are open inside the widget (one at a time).
let agendaDetailId = null;
/** Open or fold one agenda row's details; only its edit button opens ODAK. */
export function toggleAgendaDetail(id) {
  agendaDetailId = agendaDetailId === id ? null : id;
}
const shortDay = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});
function agendaDetail(entry) {
  const record = entry.record;
  const day = (value) =>
    value ? shortDay.format(new Date(`${value}T12:00:00`)) : "";
  const facts = [
    `${entry.kind === "followup" ? "Takip" : "Teslim"}: ${day(entry.date)}`,
    statusLabel(record.type, record.status),
    ...(record.type === "daily" || record.type === "weekly"
      ? [PRIORITIES[record.priority]?.label || "Normal"]
      : []),
  ];
  const lines = [
    `<p class="wb-detail-facts">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}</p>`,
  ];
  if (record.type === "waiting" && record.expectedFrom)
    lines.push(
      `<p class="wb-detail-note"><strong>Kimden:</strong> ${escapeHtml(record.expectedFrom)}</p>`,
    );
  if (record.type === "waiting" && record.latestUpdate)
    lines.push(
      `<p class="wb-detail-note"><strong>Son gelişme:</strong> ${escapeHtml(record.latestUpdate)}</p>`,
    );
  const description = String(record.description || "").trim();
  if (description)
    lines.push(`<p class="wb-detail-text">${escapeHtml(description)}</p>`);
  lines.push(
    `<button type="button" class="wb-detail-edit" data-record-id="${escapeHtml(record.id)}">ODAK’ta düzenle</button>`,
  );
  return `<div class="wb-row-detail widget-task-detail" id="widget-detail-${escapeHtml(record.id)}">${lines.join("")}</div>`;
}

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
<html lang="tr" translate="no" class="notranslate" data-odak-widget="true">
<head>
  <meta charset="utf-8">
  <meta name="google" content="notranslate">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>ODAK · Özet</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='12' fill='%23174d43'/%3E%3Cpath d='m11 21 6 6 13-14' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Crect x='24' y='24' width='14' height='13' rx='3' fill='%23174d43'/%3E%3Crect x='25' y='25' width='12' height='11' rx='2' fill='%23d7e7ce'/%3E%3Cpath d='M27 28h8' stroke='%23174d43' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E">
  <style>
    :root { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; color:#294735; background:#f6f8f3; font-synthesis:none; color-scheme:light; }
    * { box-sizing:border-box; }
    html,body { width:100%; height:100%; margin:0; overflow:hidden; }
    /* A smaller window scrolls instead of squeezing the widget. */
    @media (max-height:319px) { html,body { overflow-y:auto; overflow-x:hidden; } }
    /* A narrow widget never scrolls sideways: the header drops its words. */
    @media (max-width:299px) { .widget-live { display:none; } .widget-view-toggle > span { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); } .widget-view-toggle { padding-inline:7px; } }
    button { font:inherit; cursor:pointer; }
    button:focus-visible { outline:3px solid #87b89d; outline-offset:2px; }
    .widget-shell { display:flex; flex-direction:column; gap:9px; width:100%; height:100%; height:100dvh; min-width:0; min-height:320px; padding:12px; }
    .widget-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex:0 0 auto; }
    .widget-header-tools { display:flex; align-items:center; gap:8px; }
    h1 { margin:0; color:#174d43; font-size:20px; line-height:1.2; font-weight:850; letter-spacing:2px; }
    .widget-live { color:#64775f; font-size:11px; }
    .widget-pin { display:inline-flex; align-items:center; justify-content:center; flex:0 0 26px; width:26px; height:26px; padding:4px; border:1px solid #dce5d7; border-radius:6px; color:#5d715a; background:#fff; }
    .widget-pin:disabled { opacity:.5; cursor:default; }
    .widget-strip-toggle { display:inline-flex; align-items:center; justify-content:center; flex:0 0 26px; width:26px; height:26px; padding:4px; border:1px solid #dce5d7; border-radius:6px; color:#5d715a; background:#fff; cursor:pointer; }
    .widget-strip-toggle svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
    .widget-strip-toggle:hover { background:#edf3e8; }
    [data-theme="dark"] .widget-strip-toggle { color:#d3d8d1; background:#18191b; border-color:#3d4249; }
    /* The strip: one line with the work in progress; everything else waits. */
    .widget-strip-line { display:none; }
    html[data-widget-strip] .widget-shell { height:auto; min-height:0; padding:8px 10px; gap:0; }
    html[data-widget-strip] .widget-shell > :not(.widget-header) { display:none !important; }
    html[data-widget-strip] .widget-header h1, html[data-widget-strip] .widget-live, html[data-widget-strip] .widget-view-toggle { display:none; }
    html[data-widget-strip] .widget-header { gap:8px; }
    html[data-widget-strip] .widget-strip-line { display:flex; align-items:center; gap:7px; flex:1 1 auto; min-width:0; margin:0; padding:0; border:0; background:none; color:#304d37; font:inherit; font-size:12px; font-weight:600; text-align:left; cursor:pointer; }
    .widget-strip-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .widget-strip-dot { flex:0 0 8px; width:8px; height:8px; border-radius:50%; background:#b8c2b3; }
    .widget-strip-line[data-phase="running"] .widget-strip-dot { background:#2f8a57; }
    .widget-strip-line[data-phase="paused"] .widget-strip-dot { background:#c99a3d; }
    [data-theme="dark"] html[data-widget-strip] .widget-strip-line, html[data-theme="dark"][data-widget-strip] .widget-strip-line { color:#e9eaec; }
    .widget-pin[aria-pressed="true"] { color:#174d43; border-color:#a8c5a0; background:#eaf2e4; }
    .widget-pin svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .widget-day-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; flex:0 0 auto; }
    .widget-day-tab { display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; min-height:35px; padding:6px 8px; border:1px solid #dce5d7; border-radius:8px; background:#fff; color:#5d715a; font-size:11px; font-weight:600; }
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
    .widget-task > .widget-task-detail { margin:7px 0 0; }
    .widget-task-meta { display:flex; align-items:center; flex-wrap:wrap; gap:4px 7px; min-width:0; margin-top:5px; font-size:10px; line-height:1.3; color:#6c7b65; }
    .widget-event-kind { display:inline-flex; align-items:center; gap:4px; padding:2px 5px; border-radius:5px; color:#476982; background:#edf3f8; }
    .widget-event-kind.followup { color:#886028; background:#fbf2e2; }
    .widget-event-kind svg { width:11px; height:11px; flex:0 0 11px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .widget-record-type { min-width:0; overflow-wrap:anywhere; }
    .widget-entry-date { margin-left:auto; white-space:nowrap; }
    .widget-empty { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:6px; min-height:100%; padding:20px 14px; color:#6b7e64; font-size:11px; line-height:1.5; text-align:center; }
    .widget-empty strong { color:#3f5c43; font-size:12px; }
    .widget-footer { flex:0 0 auto; min-width:0; }
    .widget-session { display:flex; align-items:center; justify-content:space-between; gap:10px; flex:0 0 auto; min-width:0; padding:6px 9px; border:1px solid #dce5d7; border-radius:8px; background:#eaf2e4; }
    .widget-session[hidden] { display:none; }
    .widget-session-identity { display:flex; flex-direction:column; gap:2px; min-width:0; }
    #widget-session-phase { color:#64775f; font-size:9px; line-height:1.2; }
    #widget-session-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#304d37; font-size:11px; line-height:1.3; }
    #widget-session-time { display:none; }
    .widget-session[data-phase="paused"] { background:#f4f3e9; }
    #widget-open-main { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:36px; padding:8px 12px; border:1px solid #174d43; border-radius:8px; background:#174d43; color:#fff; font-size:12px; font-weight:600; }
    #widget-open-main:hover { background:#256354; }
    #widget-open-main svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    #widget-status:empty { display:none; }
    #widget-status { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; max-height:44px; margin:7px 0 0; overflow:hidden; overflow-wrap:anywhere; color:#9c4a36; font-size:10px; line-height:1.35; }
    :root[data-theme="dark"] { color:#e9eaec; background:#0d0e10; color-scheme:dark; }
    [data-theme="dark"] h1 { color:#9dd8b7; }
    [data-theme="dark"] :is(.widget-live,#widget-task-count,.widget-task-meta,.widget-empty) { color:#b7bbc2; }
    [data-theme="dark"] :is(.widget-day-tab,.widget-work,.widget-pin) { color:#d3d8d1; background:#18191b; border-color:#3d4249; }
    [data-theme="dark"] .widget-pin[aria-pressed="true"] { color:#c3e7ce; background:#263b2c; border-color:#719b74; }
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
    [data-theme="dark"] .widget-session { background:#263b2c; border-color:#48664c; }
    [data-theme="dark"] .widget-session[data-phase="paused"] { background:#38362a; border-color:#686148; }
    [data-theme="dark"] #widget-session-phase { color:#b7bbc2; }
    [data-theme="dark"] #widget-session-title { color:#e9eaec; }
    [data-theme="dark"] #widget-session-time { color:#9dd8b7; }
    .widget-view-toggle { display:inline-flex; align-items:center; gap:5px; min-height:26px; padding:3px 8px; border:1px solid #dce5d7; border-radius:6px; color:#5d715a; background:#fff; font-size:11px; font-weight:600; }
    .widget-view-toggle svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .widget-view-toggle:hover { background:#f0f5ec; }
    .widget-shell[data-view="work"] :is(.widget-day-tabs,.widget-work,.widget-session) { display:none; }
    .widget-shell[data-view="agenda"] .widget-workbench { display:none; }
    .widget-reminders { flex:0 0 auto; min-width:0; border:1px solid #e5c082; border-radius:10px; background:#fff6e3; }
    .widget-reminders[hidden] { display:none; }
    .widget-reminders ul { list-style:none; margin:0; padding:0; }
    .widget-reminder { display:flex; align-items:center; gap:6px; min-width:0; padding:6px 8px; border-bottom:1px solid #f0dcb4; }
    .widget-reminder:last-child { border-bottom:0; }
    .widget-reminder-copy { display:flex; flex-direction:column; flex:1 1 auto; min-width:0; }
    .widget-reminder-when { color:#955400; font-size:10px; font-weight:650; }
    .widget-reminder-text { overflow:hidden; color:#4a3a14; font-size:12px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .widget-reminder button { flex:0 0 auto; min-height:26px; padding:3px 8px; border:1px solid #e5c082; border-radius:6px; background:#fff; color:#7a4a08; font-size:11px; font-weight:600; }
    .widget-reminder button[data-wb="reminder-done"] { border-color:#174d43; background:#174d43; color:#fff; }
    .widget-reminder button:disabled { opacity:.55; cursor:default; }
    .widget-reminder-more { padding:5px 8px; color:#7a5a1d; font-size:10px; }
    [data-theme="dark"] .widget-reminders { border-color:#8a6a35; background:#2e2719; }
    [data-theme="dark"] .widget-reminder { border-color:#5b4a2a; }
    [data-theme="dark"] :is(.widget-reminder-when,.widget-reminder-more) { color:#efd09a; }
    [data-theme="dark"] .widget-reminder-text { color:#f3e6c8; }
    [data-theme="dark"] .widget-reminder button { color:#efd09a; background:#18191b; border-color:#8a6a35; }
    [data-theme="dark"] .widget-reminder button[data-wb="reminder-done"] { color:#122e23; background:#9dd8b7; border-color:#9dd8b7; }
    .widget-workbench { display:flex; flex-direction:column; gap:8px; flex:1 1 auto; min-height:0; min-width:0; overflow:hidden; }
    .widget-workbench[data-mode="idle"] { overflow-y:auto; overscroll-behavior:contain; }
    .widget-workbench [hidden] { display:none !important; }
    .wb-active { display:flex; flex-direction:column; gap:6px; flex:1 1 auto; min-height:0; min-width:0; padding:10px; border:1px solid #dfe7da; border-radius:10px; background:#fff; }
    .wb-heading { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .wb-phase { color:#3f7a52; font-size:10px; font-weight:650; line-height:1.3; }
    .wb-phase[data-phase="paused"] { color:#8a6a2a; }
    .wb-phase[data-phase="finish"] { color:#476982; }
    .wb-title { display:flex; align-items:flex-start; gap:3px; min-width:0; margin:0; padding:0; border:0; background:none; color:#304d37; font-size:12px; font-weight:650; line-height:1.35; text-align:left; }
    .wb-title-text { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; min-width:0; overflow:hidden; overflow-wrap:anywhere; }
    .wb-title > .wb-row-chevron { margin-top:2px; }
    .wb-title:hover { color:#174d43; }
    .wb-title[aria-expanded="true"] > .wb-row-chevron { transform:rotate(90deg); }
    .widget-workbench .wb-title[aria-expanded="true"] > .wb-title-text { display:block; -webkit-line-clamp:unset; }
    .wb-heading { flex:0 0 auto; }
    /* Sized by its own lines (not the heading), and scrolls when long so the note and buttons keep their room. */
    .wb-heading > .wb-active-detail { flex:0 0 auto; align-content:start; max-height:min(42vh, 190px); margin:6px 0 0 15px; overflow-y:auto; overscroll-behavior:contain; }
    .wb-row-detail[hidden] { display:none; }
    .wb-note-field { display:flex; flex-direction:column; gap:3px; flex:1 1 auto; min-height:0; }
    .wb-note-label { color:#6b7e64; font-size:10px; }
    #widget-work-note { flex:1 1 auto; width:100%; min-height:64px; margin:0; padding:8px; resize:none; border:1px solid #cfdcc8; border-radius:8px; background:#fbfcf9; color:#294735; font:inherit; font-size:12px; line-height:1.45; }
    #widget-work-note:focus { outline:none; border-color:#87b89d; box-shadow:0 0 0 2px #d7e9dd; }
    .wb-error { margin:0; color:#9c4a36; font-size:10px; line-height:1.35; }
    .wb-conflict { display:flex; gap:6px; }
    .wb-conflict button { flex:1 1 0; min-height:26px; padding:3px 6px; border:1px solid #e2cf9e; border-radius:6px; background:#fbf6e8; color:#7a5a1d; font-size:10px; }
    .wb-controls,.wb-finish-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; flex:0 0 auto; }
    .wb-controls button,.wb-finish-controls button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:0; min-height:32px; padding:5px 8px; border:1px solid #cfdcc8; border-radius:8px; background:#fff; color:#2f5a3f; font-size:12px; font-weight:600; }
    .wb-controls button:disabled,.wb-finish-controls button:disabled { opacity:.55; cursor:default; }
    .wb-controls svg { width:13px; height:13px; flex:0 0 13px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .wb-toggle,.wb-save { border-color:#174d43 !important; background:#174d43 !important; color:#fff !important; }
    .wb-toggle:hover,.wb-save:hover { background:#256354 !important; }
    .wb-idle { margin:0; padding:12px 10px; border:1px dashed #cfdcc8; border-radius:10px; color:#6b7e64; font-size:11px; line-height:1.45; text-align:center; }
    .wb-paused,.wb-upcoming { display:flex; flex-direction:column; flex:0 0 auto; min-height:0; overflow:hidden; border:1px solid #dfe7da; border-radius:10px; background:#fff; }
    .widget-workbench[data-mode="working"] :is(.wb-paused,.wb-upcoming) { max-height:118px; }
    .widget-workbench { overflow-y:auto; overscroll-behavior:contain; }
    .widget-workbench > .wb-active { min-height:auto; }
    .widget-workbench[data-phase="paused"] > .wb-active { flex:0 0 auto; gap:8px; }
    .widget-workbench[data-phase="paused"] .wb-note-field { display:none; }
    .widget-workbench[data-phase="paused"] .wb-title-text { -webkit-line-clamp:1; }
    .widget-workbench[data-phase="paused"] > .wb-upcoming,.widget-workbench[data-mode="idle"] > .wb-upcoming { flex:1 1 auto; max-height:none; min-height:72px; }
    .widget-workbench[data-mode="idle"] > .wb-paused { flex:0 0 auto; max-height:118px; }
    .widget-workbench[data-mode="idle"] > .wb-upcoming > ul { flex:1 1 auto; }
    .widget-workbench[data-phase="paused"] > .wb-paused { flex:0 0 auto; }
    .widget-workbench[data-phase="paused"] > :is(.wb-paused,.wb-upcoming) > ul { flex:1 1 auto; }
    #widget-status[data-tone="info"] { color:#3f6a4f; }
    [data-theme="dark"] #widget-status[data-tone="info"] { color:#9dd8b7; }
    .wb-paused h2,.wb-upcoming h2 { flex:0 0 auto; margin:0; padding:7px 10px; border-bottom:1px solid #e8eee4; color:#64775f; font-size:10px; font-weight:650; line-height:1.3; }
    .wb-paused ul,.wb-upcoming ul { list-style:none; min-height:0; margin:0; padding:0; overflow-y:auto; }
    .wb-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-width:0; padding:6px 8px 6px 6px; border-bottom:1px solid #edf0e9; }
    .wb-row:last-child { border-bottom:0; }
    .wb-row-title { display:flex; align-items:center; gap:3px; flex:1 1 0; min-width:0; margin:0; padding:0; overflow:hidden; border:0; background:none; color:#304d37; font-size:12px; font-weight:600; line-height:1.35; text-align:left; }
    .wb-row-title > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wb-row-title:hover { color:#174d43; }
    .wb-row-chevron { flex:0 0 12px; width:12px; height:12px; fill:none; stroke:#8a9a84; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; transition:transform .12s; }
    .wb-row.is-open .wb-row-chevron { transform:rotate(90deg); }
    .wb-row.is-open .wb-row-title { align-items:flex-start; }
    .wb-row.is-open .wb-row-title > span { white-space:normal; overflow-wrap:anywhere; }
    .wb-row.is-open .wb-row-chevron { margin-top:2px; }
    .wb-row-detail { flex:1 0 100%; display:grid; gap:4px; margin:2px 0 2px 15px; padding:7px 8px; border-left:2px solid #d6e3cf; border-radius:0 6px 6px 0; background:#f6f9f3; color:#4b5d46; font-size:11px; line-height:1.4; }
    .wb-row-detail p { margin:0; overflow-wrap:anywhere; }
    .wb-detail-facts { display:flex; flex-wrap:wrap; gap:4px 10px; color:#5d6f57; font-weight:600; }
    .wb-detail-text { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; white-space:pre-line; }
    .wb-detail-note { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
    .wb-detail-note strong { font-weight:600; }
    .wb-detail-edit { justify-self:start; margin:2px 0 0; padding:3px 8px; border:1px solid #cfdcc8; border-radius:6px; background:#fff; color:#2f6a49; font-size:11px; font-weight:600; }
    .wb-detail-edit:hover { background:#edf3e8; }
    [data-theme="dark"] .wb-row-detail { color:#c9cec7; background:#1d2120; border-color:#3d5446; }
    [data-theme="dark"] .wb-detail-facts { color:#b7bbc2; }
    [data-theme="dark"] .wb-detail-edit { color:#9dd8b7; background:#18191b; border-color:#3d4249; }
    .wb-row-due { flex:0 0 auto; color:#6c7b65; font-size:10px; white-space:nowrap; }
    .wb-row-due.is-today { color:#955400; font-weight:700; }
    .wb-row-due.is-soon { color:#955400; }
    .wb-row-due.is-overdue { color:#ac2d24; }
    .wb-title-line { display:flex; align-items:flex-start; gap:6px; min-width:0; }
    .wb-title-line > .wb-title { flex:1 1 auto; }
    .wb-heading-journal { display:inline-flex; flex:0 0 auto; }
    .wb-journal-trigger { display:inline-flex; align-items:center; justify-content:center; flex:0 0 26px; width:26px; height:26px; padding:5px; border:1px solid #d2decc; border-radius:6px; background:#fff; color:#71816c; }
    .wb-journal-trigger svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .wb-journal-trigger.has-entries { color:#76529c; background:#f1eafa; border-color:#c4abdf; }
    .wb-journal-trigger.has-entries:hover { color:#654285; background:#e9def5; border-color:#b895d6; }
    .widget-workbench[data-journal="open"] > :not(.wb-journal) { display:none !important; }
    .wb-journal { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden; border:1px solid #dfe7da; border-radius:10px; background:#fff; }
    .wb-journal-header { display:flex; align-items:center; gap:8px; flex:0 0 auto; min-width:0; padding:8px 10px; border-bottom:1px solid #e8eee4; }
    .wb-journal-back { display:inline-flex; align-items:center; gap:4px; flex:0 0 auto; min-height:26px; padding:3px 8px; border:1px solid #d2decc; border-radius:6px; background:#fff; color:#2f5a3f; font-size:11px; font-weight:600; }
    .wb-journal-back svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .wb-journal-heading { display:flex; flex-direction:column; min-width:0; }
    .wb-journal-heading > span { color:#76529c; font-size:10px; font-weight:650; }
    .wb-journal-title { overflow:hidden; color:#304d37; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
    .wb-journal-list { list-style:none; min-height:0; margin:0; padding:0; overflow-y:auto; overscroll-behavior:contain; }
    .wb-journal-entry { padding:8px 10px; border-bottom:1px solid #edf0e9; }
    .wb-journal-entry:last-child { border-bottom:0; }
    .wb-journal-entry time { color:#6c7b65; font-size:10px; font-weight:600; }
    .wb-journal-entry p { margin:3px 0 0; color:#304d37; font-size:12px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
    .wb-journal-empty-note,.wb-journal-none { color:#6c7b65; font-size:11px; }
    .wb-journal-none { padding:14px 10px; line-height:1.45; text-align:center; }
    [data-theme="dark"] :is(.wb-journal,.wb-journal-back,.wb-journal-trigger:not(.has-entries)) { color:#d3d8d1; background:#18191b; border-color:#3d4249; }
    [data-theme="dark"] .wb-journal-trigger.has-entries { color:#d4b9f2; background:#30253d; border-color:#75608e; }
    [data-theme="dark"] :is(.wb-journal-header,.wb-journal-entry) { border-color:#353b40; }
    [data-theme="dark"] :is(.wb-journal-title,.wb-journal-entry p) { color:#e9eaec; }
    [data-theme="dark"] :is(.wb-journal-entry time,.wb-journal-empty-note,.wb-journal-none) { color:#b7bbc2; }
    [data-theme="dark"] .wb-journal-heading > span { color:#d4b9f2; }
    .wb-row-start { display:inline-flex; align-items:center; justify-content:center; flex:0 0 26px; width:26px; height:26px; padding:5px; border:1px solid #cfdcc8; border-radius:6px; background:#fff; color:#2f6a49; }
    .wb-row-start:disabled { opacity:.5; cursor:default; }
    .wb-row-start svg { width:13px; height:13px; fill:currentColor; stroke:none; }
    .wb-row-start.is-paused { border-color:#e2cf9e; background:#fbf6e8; color:#8a6a2a; }
    .wb-row-start.is-paused svg { fill:none; stroke:currentColor; stroke-width:1.8; stroke-linejoin:round; }
    [data-theme="dark"] :is(.widget-view-toggle,.wb-active,.wb-paused,.wb-upcoming,.wb-row-start,.wb-controls button,.wb-finish-controls button) { color:#d3d8d1; background:#18191b; border-color:#3d4249; }
    [data-theme="dark"] :is(.wb-title,.wb-row-title) { color:#e9eaec; }
    [data-theme="dark"] :is(.wb-note-label,.wb-row-due,.wb-idle,.wb-paused h2,.wb-upcoming h2) { color:#b7bbc2; }
    [data-theme="dark"] :is(.wb-paused h2,.wb-upcoming h2,.wb-row) { border-color:#353b40; }
    [data-theme="dark"] .wb-idle { border-color:#3d4249; }
    [data-theme="dark"] #widget-work-note { color:#e9eaec; background:#111214; border-color:#3d4249; }
    [data-theme="dark"] .wb-phase { color:#9dd8b7; }
    [data-theme="dark"] .wb-phase[data-phase="paused"] { color:#efd09a; }
    [data-theme="dark"] .wb-row-start.is-paused { color:#efd09a; background:#38362a; border-color:#686148; }
    [data-theme="dark"] :is(.wb-toggle,.wb-save) { color:#122e23 !important; background:#9dd8b7 !important; border-color:#9dd8b7 !important; }
    [data-theme="dark"] .wb-error { color:#ffb9ae; }
    @media(max-width:310px) { .widget-shell { padding:9px; gap:7px; } .widget-task { padding:8px; } .widget-day-tabs { gap:4px; } .widget-day-tab { padding:6px 4px; gap:4px; font-size:10px; } .widget-day-count { min-width:18px; padding:1px 3px; } }
  </style>
</head>
<body>
  <main class="widget-shell" data-view="work">
    <header class="widget-header"><h1>ODAK</h1><button type="button" class="widget-strip-line" id="widget-strip-line" data-phase="idle" title="Widget'ı büyüt"><span class="widget-strip-dot" aria-hidden="true"></span><span class="widget-strip-text">Çalışılan iş yok</span></button><div class="widget-header-tools"><span class="widget-live">Çalışma</span><button type="button" class="widget-view-toggle" id="widget-view-toggle" aria-controls="widget-agenda-views" title="Ajandayı göster"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></svg><span>Ajanda</span></button><button type="button" class="widget-strip-toggle" id="widget-strip" aria-label="Şeride küçült" aria-pressed="false" title="Şeride küçült"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="widget-pin" id="widget-pin" aria-label="Üstte tut" aria-pressed="false" title="Üstte tut Windows paketiyle kullanılabilir." disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-3 4v4l-2 2-3-6-6-3 2-2h4l4-3zM9 15l-6 6"/></svg></button></div></header>
    <section class="widget-reminders" id="widget-reminders" aria-label="Zamanı gelen hatırlatmalar" hidden><ul id="widget-reminder-list"></ul></section>
    <section class="widget-workbench" id="widget-workbench" aria-label="Çalışma" data-mode="idle">
      <div class="wb-active" hidden><div class="wb-heading"><span class="wb-phase"></span><div class="wb-title-line"><button type="button" class="wb-title" data-wb="active-detail" aria-expanded="false" aria-controls="wb-active-detail"><svg class="wb-row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="wb-title-text"></span></button><span class="wb-heading-journal"></span></div><div class="wb-row-detail wb-active-detail" id="wb-active-detail" hidden></div></div><label class="wb-note-field"><span class="wb-note-label">Çalışma notu</span><textarea id="widget-work-note" maxlength="10000" placeholder="Çalışırken notlarını buraya yaz…"></textarea></label><p class="wb-error" role="alert" hidden></p><div class="wb-conflict" hidden><button type="button" data-wb="use-current">Güncel notu yükle</button><button type="button" data-wb="save-local">Bu notu kaydet</button></div><div class="wb-controls"><button type="button" class="wb-toggle" data-wb="toggle"></button><button type="button" class="wb-finish" data-wb="finish"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg><span>Bitir</span></button></div><div class="wb-finish-controls" hidden><button type="button" data-wb="finish-cancel">Vazgeç</button><button type="button" class="wb-save" data-wb="finish-save">Kaydet ve bitir</button></div></div>
      <p class="wb-idle" hidden><span class="wb-idle-text"></span></p>
      <section class="wb-paused" aria-label="Duraklatılan işler" hidden><h2>Duraklatılanlar</h2><ul id="wb-paused-list"></ul></section>
      <section class="wb-upcoming" aria-label="Sıradaki işler" hidden><h2>Sıradaki işler</h2><ul id="wb-upcoming-list"></ul></section>
      <section class="wb-journal" aria-label="Çalışma geçmişi" hidden><header class="wb-journal-header"><button type="button" class="wb-journal-back" data-wb="journal-close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m5-5-5 5 5 5"/></svg><span>Geri</span></button><div class="wb-journal-heading"><span>Çalışma geçmişi</span><strong class="wb-journal-title"></strong></div></header><ol class="wb-journal-list"></ol></section>
    </section>
    <nav class="widget-day-tabs" id="widget-agenda-views" aria-label="Ajanda günü"><button type="button" class="widget-day-tab" data-widget-day="today" aria-pressed="true">Bugün <span class="widget-day-count" id="widget-today-count">0</span></button><button type="button" class="widget-day-tab" data-widget-day="tomorrow" aria-pressed="false">Yarın <span class="widget-day-count" id="widget-tomorrow-count">0</span></button><button type="button" class="widget-day-tab" data-widget-day="overdue" aria-pressed="false">Gecikenler <span class="widget-day-count" id="widget-overdue-count">0</span></button></nav>
    <section class="widget-work" aria-label="Seçili günün ajandası">
      <header class="widget-work-header"><time id="widget-date"></time><span id="widget-task-count"></span></header>
      <ul id="widget-tasks" tabindex="0" aria-label="Seçili günün teslimleri ve takipleri"></ul>
    </section>
    <section class="widget-session" id="widget-session" aria-label="Üzerinde çalışılan iş" hidden><div class="widget-session-identity"><span id="widget-session-phase"></span><span id="widget-session-title"></span></div><span id="widget-session-time" hidden aria-hidden="true"></span></section>
    <footer class="widget-footer"><button type="button" id="widget-open-main">ODAK’ı aç <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-5-5 5 5-5 5"/></svg></button><p id="widget-status" role="status" aria-live="polite"></p></footer>
  </main>
</body>
</html>`;

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  weekday: "long",
});
const entryDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});
const olderEntryDateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function renderWidgetSummary(
  document,
  records,
  date = new Date(),
  options = {},
) {
  const agenda = widgetAgenda(records, date, options);
  const list = document.getElementById("widget-tasks");
  const sameDay =
    list.dataset.agendaDate === agenda.selectedDate &&
    list.dataset.agendaView === agenda.view;
  const previousScroll = sameDay ? list.scrollTop : 0;
  const focused = document.activeElement?.closest?.(
    "[data-agenda-detail], [data-record-id]",
  );
  const focusedId =
    focused && list.contains(focused)
      ? focused.dataset.agendaDetail || focused.dataset.recordId
      : null;
  const restoreFocus = Boolean(focusedId && document.hasFocus());
  const dateElement = document.getElementById("widget-date");
  if (agenda.view === "overdue") {
    dateElement.removeAttribute("datetime");
    dateElement.textContent = "Gecikenler";
  } else {
    dateElement.dateTime = agenda.selectedDate;
    dateElement.textContent = dayFormatter.format(
      new Date(`${agenda.selectedDate}T12:00:00`),
    );
  }
  document.getElementById("widget-today-count").textContent = String(
    agenda.todayCount,
  );
  document.getElementById("widget-tomorrow-count").textContent = String(
    agenda.tomorrowCount,
  );
  document.getElementById("widget-overdue-count").textContent = String(
    agenda.overdueCount,
  );
  for (const button of document.querySelectorAll("[data-widget-day]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.widgetDay === agenda.view),
    );
  document.getElementById("widget-task-count").textContent =
    `${agenda.entries.length} kayıt`;
  list.dataset.agendaDate = agenda.selectedDate;
  list.dataset.agendaView = agenda.view;
  list.setAttribute(
    "aria-label",
    agenda.view === "overdue"
      ? "Gecikmiş teslimler ve takipler"
      : "Seçili günün teslimleri ve takipleri",
  );
  list.innerHTML = agenda.entries.length
    ? agenda.entries
        .map(
          (entry) =>
            `<li class="widget-task" data-id="${escapeHtml(entry.record.id)}" data-entry-kind="${entry.kind}" data-entry-date="${entry.date}"><button type="button" class="widget-task-open" data-agenda-detail="${escapeHtml(entry.record.id)}" aria-expanded="${agendaDetailId === entry.record.id}" aria-controls="widget-detail-${escapeHtml(entry.record.id)}" title="${escapeHtml(entry.record.title)}">${escapeHtml(entry.record.title)}</button><div class="widget-task-meta"><span class="widget-event-kind ${entry.kind}">${eventIcons[entry.kind]}${entry.kind === "followup" ? "Takip" : "Teslim"}</span><span class="widget-record-type">${escapeHtml(typeLabels[entry.record.type] || entry.record.type)}</span>${agenda.view === "overdue" ? `<time class="widget-entry-date" datetime="${entry.date}">${(entry.date.slice(0, 4) === agenda.today.slice(0, 4) ? entryDateFormatter : olderEntryDateFormatter).format(new Date(`${entry.date}T12:00:00`))}</time>` : ""}</div>${agendaDetailId === entry.record.id ? agendaDetail(entry) : ""}</li>`,
        )
        .join("")
    : `<li class="widget-empty"><strong>${agenda.view === "overdue" ? "Gecikmiş kayıt yok." : `${agenda.view === "tomorrow" ? "Yarın" : "Bugün"} için kayıt yok.`}</strong><span>Teslim veya takip tarihi olan açık kayıtlar burada görünür.</span></li>`;
  list.scrollTop = previousScroll;
  if (restoreFocus) {
    const next =
      sameDay &&
      [...list.querySelectorAll("[data-agenda-detail]")].find(
        (button) => button.dataset.agendaDetail === focusedId,
      );
    (
      next || document.querySelector(`[data-widget-day="${agenda.view}"]`)
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
