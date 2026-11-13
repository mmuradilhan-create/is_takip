import { readWorkSessionSnapshot } from "./work-session-store.js";

const CLOSED = new Set(["completed", "cancelled", "transferred"]);

/** Observe existing work; the widget never owns or changes the session. */
export function widgetSessionSummary(records, raw, at = Date.now()) {
  if (!Array.isArray(records) || !Number.isSafeInteger(at) || at < 0)
    return null;
  let snapshot;
  try {
    snapshot = readWorkSessionSnapshot(raw);
  } catch {
    return null;
  }
  const current = snapshot.entries.find(
    (entry) => entry.recordId === snapshot.currentId,
  );
  if (!current || !["running", "paused"].includes(current.status)) return null;
  const record = records.find((item) => item.id === current.recordId);
  if (
    record?.type !== "daily" ||
    typeof record.title !== "string" ||
    !record.title.trim() ||
    CLOSED.has(record.status) ||
    (Array.isArray(record.workLog) &&
      record.workLog.some((entry) => entry.id === current.sessionId))
  )
    return null;
  const elapsedMs = Math.min(
    Number.MAX_SAFE_INTEGER,
    current.elapsedMs +
      (current.status === "running" && current.trackTime !== false
        ? Math.max(0, at - current.startedAt)
        : 0),
  );
  const seconds = Math.floor(elapsedMs / 1000);
  return {
    recordId: record.id,
    title: record.title,
    status: current.status,
    phase: current.status === "running" ? "Çalışıyor" : "Duraklatıldı",
    elapsedMs,
    tracked: current.trackTime !== false,
    time: `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
  };
}

const stripIcons = {
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
};

const setText = (element, text) => {
  if (element && element.textContent !== text) element.textContent = text;
};
const setAttr = (element, name, value) => {
  if (element && element.getAttribute(name) !== value)
    element.setAttribute(name, value);
};

/**
 * The folded widget's one line. Working: the work, its time and a pause or
 * resume button. Idle: the next work with a start button and today's counts.
 */
function renderStrip(document, summary, idle) {
  const line = document.getElementById("widget-strip-line");
  if (!line) return;
  const text = line.querySelector(".widget-strip-text");
  const meta = document.getElementById("widget-strip-meta");
  const action = document.getElementById("widget-strip-action");
  line.dataset.phase = summary?.status || "idle";
  let kind = "";
  let target = "";
  let label = "";
  if (summary) {
    setText(text, summary.title);
    setAttr(line, "title", `${summary.title} · Widget'ı büyüt`);
    // Work started without time keeping has no clock worth showing.
    setText(meta, summary.tracked ? summary.time : "");
    meta?.classList.remove("is-overdue");
    kind = summary.status === "running" ? "pause" : "resume";
    target = summary.recordId;
    label =
      summary.status === "running"
        ? `${summary.title}: duraklat`
        : `${summary.title}: çalışmaya devam et`;
  } else {
    // The next work's name comes first; beside it only late work is counted.
    const counts = [];
    if (idle?.todayCount && !idle?.next)
      counts.push(`Bugün ${idle.todayCount}`);
    if (idle?.overdueCount) counts.push(`${idle.overdueCount} geciken`);
    setText(meta, counts.join(" · "));
    meta?.classList.toggle("is-overdue", Boolean(idle?.overdueCount));
    if (idle?.next) {
      setText(text, `Sıradaki: ${idle.next.title}`);
      setAttr(line, "title", `Sıradaki: ${idle.next.title} · Widget'ı büyüt`);
      kind = "start";
      target = idle.next.id;
      label = `${idle.next.title}: çalışmaya başla`;
    } else {
      setText(text, "Çalışılan iş yok");
      setAttr(line, "title", "Widget'ı büyüt");
    }
  }
  if (!action) return;
  action.hidden = !kind;
  if (!kind) return;
  if (action.dataset.action !== kind) {
    action.dataset.action = kind;
    action.innerHTML = kind === "pause" ? stripIcons.pause : stripIcons.play;
  }
  action.dataset.id = target;
  setAttr(action, "aria-label", label);
  setAttr(
    action,
    "title",
    kind === "pause" ? "Duraklat" : kind === "resume" ? "Devam et" : "Başlat",
  );
}

export function renderWidgetSession(document, summary, idle = null) {
  renderStrip(document, summary, idle);
  const strip = document.getElementById("widget-session");
  strip.hidden = !summary;
  if (!summary) {
    delete strip.dataset.phase;
    for (const id of [
      "widget-session-phase",
      "widget-session-title",
      "widget-session-time",
    ])
      document.getElementById(id).textContent = "";
    document.getElementById("widget-session-title").removeAttribute("title");
    return;
  }
  strip.dataset.phase = summary.status;
  document.getElementById("widget-session-phase").textContent = summary.phase;
  document.getElementById("widget-session-title").textContent = summary.title;
  document.getElementById("widget-session-title").title = summary.title;
  document.getElementById("widget-session-time").textContent = summary.time;
}
