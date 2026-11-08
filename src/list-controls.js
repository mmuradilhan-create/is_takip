const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

/** Keep the native select accessible while making its whole card clickable. */
export function renderFilterControl(
  id,
  caption,
  accessibleLabel,
  choicesHtml,
  activeFilter = false,
) {
  const options = document.createElement("select");
  options.innerHTML = choicesHtml;
  const selectedLabel = options.selectedOptions[0]?.textContent || "";
  return `<label class="filter-control filter-surface${activeFilter ? " is-active" : ""}" for="${escapeHtml(id)}"><span class="filter-caption">${escapeHtml(caption)}</span><span class="filter-value" aria-hidden="true">${escapeHtml(selectedLabel)}</span><svg class="filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><select class="filter-select" id="${escapeHtml(id)}" aria-label="${escapeHtml(accessibleLabel)}">${choicesHtml}</select></label>`;
}
