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
    time: `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
  };
}

export function renderWidgetSession(document, summary) {
  // The folded widget's one line shows the same work and its phase.
  const line = document.getElementById("widget-strip-line");
  if (line) {
    line.dataset.phase = summary?.status || "idle";
    line.querySelector(".widget-strip-text").textContent =
      summary?.title || "Çalışılan iş yok";
  }
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
