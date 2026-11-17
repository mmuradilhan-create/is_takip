import { statusesForType, statusForDisplay } from "./model.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const checkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const GROUPS = {
  daily: { title: "İş", label: "İşin durumu" },
  waiting: { title: "Takip", label: "Takibin durumu" },
};

/** Route-specific controls change only their chosen linked destination. */
export function renderMeetingStatusMenu(record, targets, { targetId } = {}) {
  const selectedTarget = targets.find((target) => target.id === targetId);
  const groups = (selectedTarget ? [selectedTarget] : targets)
    .filter((target) => Object.hasOwn(GROUPS, target.type))
    .map((target) => {
      const group = GROUPS[target.type];
      const selected = statusForDisplay(target.status);
      const title =
        target.title !== record.title
          ? `<span class="meeting-status-target-title" title="${escapeHtml(target.title)}">${escapeHtml(target.title)}</span>`
          : "";
      const options = Object.entries(
        statusesForType(target.type, [target.status]),
      )
        .filter(([status]) => status !== "completed")
        .map(
          ([status, item]) =>
            `<button type="button" class="status-option" role="menuitemradio" aria-checked="${status === selected}" data-action="set-status" data-id="${escapeHtml(target.id)}" data-status="${escapeHtml(status)}"><span>${escapeHtml(item.label)}</span><span class="status-mark" aria-hidden="true">${checkIcon}</span></button>`,
        )
        .join("");
      // Opened from one linked box, the menu names only whose status it is;
      // the work's name and details are not repeated there.
      const heading = selectedTarget
        ? ""
        : `<div class="meeting-status-group-heading"><strong>${group.title}</strong>${title}</div>`;
      return `<div class="meeting-status-group" role="group" aria-label="${group.label}" data-target-id="${escapeHtml(target.id)}" data-target-type="${target.type}">${heading}${options}</div>`;
    })
    .join("");
  const menuHeading = selectedTarget
    ? GROUPS[selectedTarget.type]?.label || "Aksiyon durumu"
    : "Aksiyon durumu";
  return `<div class="status-menu-heading">${menuHeading}</div>${groups}`;
}
