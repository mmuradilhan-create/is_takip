import { TYPES, getWeeklyProgress, goalProgress } from "./model.js";
import { weeklyGoalWorkMs } from "./work-journal.js";
import { formatWorkDuration } from "./work-journal-ui.js";
import { renderDeadlineChip } from "./deadline-presentation.js";
import { goalChildren, parentGoalType } from "./goal-hierarchy.js";
import { makePlanningPeriod, shiftPlanningPeriod } from "./planning-periods.js";

const GOALS = new Set(["weekly", "monthly", "yearly"]);
const CLOSED = new Set(["completed", "cancelled", "transferred"]);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const closeIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const plusIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const goalNames = {
  weekly: "Haftalık hedef",
  monthly: "Aylık hedef",
  yearly: "Senelik hedef",
};
const shortDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const ownMetric = (record) =>
  Number.isFinite(record?.targetValue) && record.targetValue > 0;
const progressSnapshot = (record) => ({
  targetValue: record.targetValue,
  metric: record.metric,
  status: record.status,
});
const currentDisplay = (record) => String(record.currentValue ?? 0);

function humanPeriod(record) {
  try {
    return shiftPlanningPeriod({ type: record.type, key: record.periodKey }, 0)
      .label;
  } catch {
    if (record.type !== "yearly" && record.dueDate) {
      try {
        return makePlanningPeriod(record.type, record.dueDate).label;
      } catch {
        /* Keep malformed legacy dates out of presentation. */
      }
    }
    return record.type === "weekly"
      ? "Hafta belirtilmemiş"
      : record.type === "monthly"
        ? "Ay belirtilmemiş"
        : "Yıl belirtilmemiş";
  }
}

function childDate(record) {
  if (!record.dueDate) return "Tarih yok";
  const date = new Date(`${record.dueDate}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Tarih yok" : shortDate.format(date);
}

function parseProgress(value) {
  const text = String(value ?? "").trim();
  const result = text ? Number(text.replace(",", ".")) : NaN;
  if (!Number.isFinite(result) || result < 0)
    throw new Error("Mevcut değer için sıfır veya pozitif bir sayı yaz.");
  return result;
}

function sortChildren(first, second) {
  return (
    Number(CLOSED.has(first.status)) - Number(CLOSED.has(second.status)) ||
    (first.dueDate || "9999").localeCompare(second.dueDate || "9999") ||
    first.title.localeCompare(second.title, "tr") ||
    first.id.localeCompare(second.id)
  );
}

/** Keep a goal's progress, supporting work and transfer history together. */
export function createGoalPanel({
  root = document.querySelector("#app"),
  getRecords,
  renderStatus = () => "",
  renderComplete = () => "",
  renderWork = () => "",
  renderJournal = () => "",
  renderBlocked = () => "",
  renderDateControl = null,
  onNewStep = () => {},
  onEdit = () => {},
  onSaveProgress = null,
  onLinkChild = null,
  onError = () => {},
} = {}) {
  if (!root || typeof getRecords !== "function")
    throw new TypeError("Hedef ayrıntıları için kayıt listesi gereklidir.");
  const document = root.ownerDocument;
  const owner = document.defaultView;
  const panel = document.createElement("dialog");
  panel.id = "goal-detail-panel";
  panel.className = "modal goal-detail-panel";
  panel.setAttribute("aria-label", "Hedef ayrıntıları");
  root.append(panel);
  const progressDrafts = new Map();
  const messages = new Map();
  let selectedId = null;
  let renderKey = "";
  let linking = false;
  let progressSaving = false;
  let destroyed = false;

  const find = (id) => getRecords().find((record) => record.id === id);
  const goal = () => {
    const record = find(selectedId);
    return record && GOALS.has(record.type) ? record : null;
  };

  function report(message, selector = "#goal-progress-error", id = selectedId) {
    const text = message instanceof Error ? message.message : String(message);
    messages.set(`${id}:${selector}`, text);
    const error = id === selectedId ? panel.querySelector(selector) : null;
    if (error) {
      error.textContent = text;
      error.hidden = !text;
    }
    try {
      onError(text);
    } catch {
      /* Feedback must not discard the current progress draft. */
    }
  }

  function clearError(selector, id = selectedId) {
    messages.delete(`${id}:${selector}`);
    const target = id === selectedId ? panel.querySelector(selector) : null;
    if (target) {
      target.textContent = "";
      target.hidden = true;
    }
  }

  function errorMarkup(record, selector) {
    const text = messages.get(`${record.id}:${selector}`) || "";
    return `<p id="${selector.slice(1)}" class="goal-panel-error error-message" role="alert" ${text ? "" : "hidden"}>${esc(text)}</p>`;
  }

  function metricDraftFor(record) {
    let entry = progressDrafts.get(record.id);
    if (!entry || !entry.dirty) {
      const display = currentDisplay(record);
      entry = {
        value: display,
        baseDisplay: display,
        expectedCurrent: record.currentValue,
        expectedSnapshot: progressSnapshot(record),
        dirty: false,
      };
      progressDrafts.set(record.id, entry);
    }
    return entry;
  }

  function captureProgressDraft() {
    const form = panel.querySelector("#goal-progress-form");
    const record = form ? find(form.dataset.id) : null;
    if (!record || !form.elements.currentValue) return;
    const entry = progressDrafts.get(record.id) || metricDraftFor(record);
    entry.value = form.elements.currentValue.value;
    entry.dirty = entry.value.trim() !== entry.baseDisplay;
  }

  function updateSaveState() {
    const record = goal();
    if (!record) return;
    const busy = linking || progressSaving;
    const linkForm = panel.querySelector("#goal-link-child-form");
    if (linkForm) {
      linkForm.setAttribute("aria-busy", String(linking));
      linkForm.elements.childId.disabled = busy;
      const linkSubmit = linkForm.querySelector('[type="submit"]');
      linkSubmit.disabled = busy || !linkForm.elements.childId.value;
      linkSubmit.textContent = linking ? "Bağlanıyor…" : "Bağla";
    }
    const progressForm = panel.querySelector("#goal-progress-form");
    if (progressForm) {
      const entry = progressDrafts.get(record.id);
      const current = Number(entry.expectedCurrent ?? 0);
      progressForm.setAttribute("aria-busy", String(progressSaving));
      progressForm.elements.currentValue.disabled = busy;
      progressForm.querySelector('[type="submit"]').disabled =
        busy || !entry.dirty;
      progressForm.querySelector('[type="submit"]').textContent = progressSaving
        ? "Kaydediliyor…"
        : "Değeri kaydet";
      progressForm.querySelector(
        '[data-action="goal-progress-decrement"]',
      ).disabled = busy || entry.dirty || current <= 0;
      progressForm.querySelector(
        '[data-action="goal-progress-increment"]',
      ).disabled = busy || entry.dirty;
      progressForm.querySelector(
        '[data-action="goal-progress-target"]',
      ).disabled =
        busy || entry.dirty || current === entry.expectedSnapshot.targetValue;
      progressForm.querySelector(
        '[data-action="goal-progress-reset"]',
      ).disabled =
        busy ||
        (!entry.dirty && !messages.has(`${record.id}:#goal-progress-error`));
    }
    for (const control of panel.querySelectorAll(
      '[data-action="goal-new-step"], [data-action="goal-edit-record"], [data-action="goal-open-child"], [data-action="goal-add-measurement"], [data-action="goal-panel-close"]',
    ))
      control.disabled = busy;
  }

  function progressControls(record) {
    if (
      !ownMetric(record) ||
      CLOSED.has(record.status) ||
      typeof onSaveProgress !== "function"
    )
      return "";
    const entry = metricDraftFor(record);
    return `<div class="goal-progress-controls"><form id="goal-progress-form" data-id="${esc(record.id)}"><div class="goal-progress-quick" role="group" aria-label="İlerlemeyi değiştir"><button type="button" class="btn" data-action="goal-progress-decrement" data-id="${esc(record.id)}" aria-label="Mevcut değeri bir azalt">−1</button><button type="button" class="btn" data-action="goal-progress-increment" data-id="${esc(record.id)}" aria-label="Mevcut değeri bir artır">+1</button><button type="button" class="btn" data-action="goal-progress-target" data-id="${esc(record.id)}">Hedefe getir</button></div><div class="goal-progress-entry"><label class="field" for="goal-progress-current">Mevcut değer<input id="goal-progress-current" name="currentValue" type="text" inputmode="decimal" autocomplete="off" maxlength="80" value="${esc(entry.value)}"></label><button type="submit" class="btn primary">Değeri kaydet</button></div>${errorMarkup(record, "#goal-progress-error")}<div class="goal-progress-foot"><small>Durum kendiliğinden değişmez.</small><button type="button" class="text-btn" data-action="goal-progress-reset" data-id="${esc(record.id)}">Güncel değeri al</button></div></form></div>`;
  }

  function progressMarkup(record, records) {
    const progress = goalProgress(record, records);
    const basis = {
      metric: "Sayısal ölçüm",
      linked: "Günlük işler",
      rollup: "Alt hedefler",
      status: "Durum",
    }[progress.basis];
    const metric = ownMetric(record)
      ? `${record.currentValue ?? 0} / ${record.targetValue} ${record.metric || "hedef değeri"}`
      : progress.basis === "linked"
        ? `${progress.completed}/${progress.total} günlük iş tamamlandı`
        : progress.basis === "rollup"
          ? `${progress.total} ${record.type === "monthly" ? "haftalık" : "aylık"} hedefin ortalaması · ${progress.completed} tamamlandı`
          : record.status === "completed"
            ? "Hedef tamamlandı"
            : "Henüz ölçüm girilmemiş";
    const childKind =
      record.type === "weekly"
        ? "günlük işler"
        : record.type === "monthly"
          ? "haftalık hedefler"
          : "aylık hedefler";
    const hint = CLOSED.has(record.status)
      ? '<p class="goal-progress-hint">İlerlemeyi değiştirmek için hedefi yeniden aç.</p>'
      : !ownMetric(record)
        ? `<div class="goal-progress-derived"><p>Bağlı ${childKind} üzerinden.</p><button type="button" class="text-btn" data-action="goal-add-measurement" data-id="${esc(record.id)}">Ölçüm ekle</button></div>`
        : "";
    return `<section class="goal-panel-section goal-panel-progress" data-goal-section="progress" data-progress-basis="${esc(progress.basis)}"><div class="goal-panel-section-heading"><h3 tabindex="-1" data-goal-section-heading="progress">İlerleme <span class="goal-progress-basis">${esc(basis)}</span></h3><strong>%${progress.percent}</strong></div><div class="progress-track" role="progressbar" aria-label="${esc(record.title)} ilerlemesi" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div><p class="goal-panel-metric">${esc(metric)}</p>${progressControls(record)}${hint}</section>`;
  }

  function childDateMarkup(record) {
    if (
      ["daily", "weekly", "monthly"].includes(record.type) &&
      typeof renderDateControl === "function"
    ) {
      const control = renderDateControl(record);
      if (control) return control;
    }
    return renderDeadlineChip(record, {
      label: childDate(record),
      className: "goal-child-date",
    });
  }

  function childMarkup(record, records) {
    const due = childDateMarkup(record);
    if (GOALS.has(record.type)) {
      const progress = goalProgress(record, records);
      return `<li class="goal-child-row goal-child-goal" data-id="${esc(record.id)}">${renderComplete(record)}<div class="goal-child-main"><button type="button" class="goal-child-title${record.status === "completed" ? " completed" : ""}" data-action="goal-open-child" data-id="${esc(record.id)}">${esc(record.title)}</button><div class="goal-child-meta">${renderStatus(record)}${due}<span>${esc(humanPeriod(record))}</span></div><div class="goal-child-progress"><div class="progress-track" role="progressbar" aria-label="${esc(record.title)} ilerlemesi" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div><strong>%${progress.percent}</strong></div></div><button type="button" class="goal-child-open" data-action="goal-open-child" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: hedef ayrıntılarını aç">→</button></li>`;
    }
    return `<li class="goal-child-row" data-id="${esc(record.id)}">${renderComplete(record)}<div class="goal-child-main"><button type="button" class="goal-child-title${record.status === "completed" ? " completed" : ""}" data-action="edit" data-id="${esc(record.id)}">${esc(record.title)}</button><div class="goal-child-meta">${renderStatus(record)}${renderBlocked(record)}${due}${renderJournal(record)}</div></div><div class="goal-child-action">${renderWork(record)}</div></li>`;
  }

  function unboundChildren(record, records) {
    return records
      .filter(
        (child) =>
          parentGoalType(child.type) === record.type &&
          !CLOSED.has(child.status) &&
          child.id !== record.id &&
          (child.type === "daily" ? !child.parentId : !child.goalParentId),
      )
      .sort(sortChildren);
  }

  function linkChildMarkup(record, records) {
    if (typeof onLinkChild !== "function") return "";
    const candidates = unboundChildren(record, records);
    if (!candidates.length) return "";
    const caption =
      record.type === "weekly"
        ? "Mevcut günlük işi bağla"
        : record.type === "monthly"
          ? "Mevcut haftalık hedefi bağla"
          : "Mevcut aylık hedefi bağla";
    return `<form id="goal-link-child-form" class="goal-link-child-form" data-id="${esc(record.id)}"><label for="goal-link-child">${caption}</label><div class="goal-link-child-controls"><select name="childId" id="goal-link-child" aria-label="${caption}"><option value="">Kayıt seç</option>${candidates.map((child) => `<option value="${esc(child.id)}">${esc(child.title)}${GOALS.has(child.type) ? ` · ${esc(humanPeriod(child))}` : ""}</option>`).join("")}</select><button type="submit" class="btn" disabled>Bağla</button></div>${errorMarkup(record, "#goal-link-child-error")}</form>`;
  }

  function childrenMarkup(record, records, children) {
    const weekly = record.type === "weekly";
    const childName = weekly
      ? "günlük işler"
      : record.type === "monthly"
        ? "haftalık hedefler"
        : "aylık hedefler";
    const action = weekly
      ? "Yeni adım ekle"
      : record.type === "monthly"
        ? "Yeni haftalık hedef"
        : "Yeni aylık hedef";
    const excluded = children.filter((child) =>
      ["cancelled", "transferred"].includes(child.status),
    ).length;
    const summary = weekly ? getWeeklyProgress(record.id, records) : null;
    const secondary = summary
      ? `<div class="goal-panel-summary goal-panel-secondary" aria-label="Haftalık özet"><div><span>Günlük iş ilerlemesi</span><strong>${summary.completed}/${summary.total} tamamlandı</strong></div><div><span>Kaydedilen süre</span><strong>${esc(formatWorkDuration(weeklyGoalWorkMs(record.id, records)))}</strong></div></div>`
      : "";
    return `<section class="goal-panel-section goal-panel-children goal-hierarchy-section" data-goal-section="children"><div class="goal-panel-section-heading"><h3 tabindex="-1" data-goal-section-heading="children">Bağlı ${childName} <small>${children.length}</small></h3><button type="button" class="text-btn goal-new-step" data-action="goal-new-step" data-id="${esc(record.id)}">${plusIcon}${action}</button></div>${children.length ? `<p class="field-help goal-child-order">Açık kayıtlar önce; yakın teslim tarihine göre.${excluded ? ` ${excluded} iptal veya arşiv kaydı ilerlemeye dahil değil.` : ""}</p><ul class="goal-child-list">${children.map((child) => childMarkup(child, records)).join("")}</ul>` : '<p class="goal-panel-empty">Bu hedef için ilk bağlı adımı ekleyebilirsin.</p>'}${linkChildMarkup(record, records)}${secondary}</section>`;
  }

  function transferReasonsMarkup(record) {
    const reasons = ["weekly", "monthly"].flatMap((type) => {
      const moves =
        record.sourceFields?.[
          type === "weekly" ? "__weeklyMoves" : "__monthlyMoves"
        ];
      return Array.isArray(moves)
        ? moves
            .filter(
              (move) => typeof move?.reason === "string" && move.reason.trim(),
            )
            .map((move) => ({ type, move }))
        : [];
    });
    if (!reasons.length) return "";
    const period = (type, key) => {
      try {
        return shiftPlanningPeriod({ type, key }, 0).label;
      } catch {
        return "";
      }
    };
    return `<section class="goal-panel-section goal-panel-transfer-reasons" data-goal-section="transfers"><h3>Taşıma gerekçeleri</h3><ol>${reasons
      .slice()
      .reverse()
      .map(({ type, move }) => {
        const from = period(type, move.from);
        const to = period(type, move.to);
        return `<li data-transfer-type="${type}">${from && to ? `<small>${esc(from)} → ${esc(to)}</small>` : ""}<p class="goal-transfer-reason">${esc(move.reason)}</p></li>`;
      })
      .join("")}</ol></section>`;
  }

  function render(force = false) {
    const record = goal();
    const records = getRecords();
    const children = record
      ? goalChildren(record, records).sort(sortChildren)
      : [];
    // A descendant's changed progress affects every open ancestor, including
    // changes to metrics, work logs, eligibility, or intermediate links.
    const nextKey = JSON.stringify([record, records]);
    if (!force && nextKey === renderKey) return;
    captureProgressDraft();
    const active = document.activeElement;
    const activeAction = panel.contains(active)
      ? active?.dataset?.action
      : null;
    const activeId = panel.contains(active) ? active?.dataset?.id : null;
    const focusedSection = panel.contains(active)
      ? active?.dataset?.goalSectionHeading
      : null;
    const progressFocused = active?.matches?.(
      '#goal-progress-form [name="currentValue"]',
    );
    const linkForm = panel.querySelector("#goal-link-child-form");
    const linkChoice =
      linkForm?.dataset.id === record?.id
        ? linkForm.elements.childId.value
        : "";
    const linkFocused = active?.matches?.(
      '#goal-link-child-form [name="childId"]',
    );
    const selection = progressFocused
      ? [active.selectionStart, active.selectionEnd]
      : null;
    const scrollTop = panel.querySelector(".goal-panel-body")?.scrollTop || 0;
    if (!record) {
      delete panel.dataset.goalId;
      panel.innerHTML = `<div class="goal-panel-shell"><div class="modal-header"><h2>Hedef ayrıntıları</h2><button type="button" class="close-modal" data-action="goal-panel-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body goal-panel-body"><p class="goal-panel-empty">Bu hedef artık bulunamıyor. Silinmiş veya başka bir listeye taşınmış olabilir.</p></div><div class="modal-footer"><button type="button" class="btn" data-action="goal-panel-close">Kapat</button></div></div>`;
    } else {
      panel.dataset.goalId = record.id;
      const type = goalNames[record.type];
      const parent = records.find(
        (item) =>
          item.id === record.goalParentId &&
          item.type === parentGoalType(record.type),
      );
      const parentMarkup = parent
        ? `<button type="button" class="goal-parent-context" data-action="goal-open-child" data-id="${esc(parent.id)}"><span>↑ ${esc(TYPES[parent.type].label)}</span><strong>${esc(parent.title)}</strong></button>`
        : "";
      panel.innerHTML = `<div class="goal-panel-shell"><div class="modal-header"><div><p class="goal-panel-period">${esc(type)} · ${esc(humanPeriod(record))}</p><h2 class="goal-panel-title">${esc(record.title)}</h2></div><button type="button" class="close-modal" data-action="goal-panel-close" aria-label="Pencereyi kapat">${closeIcon}</button></div><div class="modal-body goal-panel-body">${parentMarkup}${progressMarkup(record, records)}${childrenMarkup(record, records, children)}${transferReasonsMarkup(record)}</div><div class="modal-footer"><button type="button" class="btn" data-action="goal-edit-record" data-id="${esc(record.id)}">Hedefi düzenle</button><button type="button" class="btn primary" data-action="goal-panel-close">Kapat</button></div></div>`;
      const choice = panel.querySelector(
        '#goal-link-child-form [name="childId"]',
      );
      if (
        choice &&
        [...choice.options].some((option) => option.value === linkChoice)
      )
        choice.value = linkChoice;
      updateSaveState();
    }
    const body = panel.querySelector(".goal-panel-body");
    if (body) body.scrollTop = scrollTop;
    if (progressFocused) {
      const field = panel.querySelector(
        '#goal-progress-form [name="currentValue"]',
      );
      field?.focus({ preventScroll: true });
      if (field && selection) field.setSelectionRange(...selection);
    } else if (linkFocused) {
      panel
        .querySelector('#goal-link-child-form [name="childId"]')
        ?.focus({ preventScroll: true });
    } else if (focusedSection) {
      panel
        .querySelector(`[data-goal-section-heading="${focusedSection}"]`)
        ?.focus({ preventScroll: true });
    } else if (activeAction) {
      const restored = [...panel.querySelectorAll("[data-action]")].find(
        (control) =>
          control.dataset.action === activeAction &&
          (!activeId || control.dataset.id === activeId),
      );
      if (restored && !restored.disabled)
        restored.focus({ preventScroll: true });
      else if (activeAction.startsWith("goal-progress-"))
        panel
          .querySelector("#goal-progress-current")
          ?.focus({ preventScroll: true });
    }
    renderKey = nextKey;
  }

  function close() {
    captureProgressDraft();
    if (panel.open) panel.close();
  }

  function focusSection(section) {
    const targetSection = panel.querySelector(
      `[data-goal-section="${section}"]`,
    );
    if (!targetSection) return;
    const control = targetSection.querySelector(
      section === "progress"
        ? "#goal-progress-current:not(:disabled)"
        : ".goal-child-list .goal-child-title:not(:disabled), .goal-child-list .goal-child-open:not(:disabled)",
    );
    const target =
      control || targetSection.querySelector("[data-goal-section-heading]");
    targetSection.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }

  function open(id, { section = null } = {}) {
    const record = find(id);
    if (destroyed || !record || !GOALS.has(record.type)) return;
    captureProgressDraft();
    selectedId = id;
    renderKey = "";
    render(true);
    if (!panel.open) panel.show();
    if (section === "progress" || section === "children") {
      focusSection(section);
    } else panel.querySelector(".goal-panel-body").scrollTop = 0;
  }

  function refresh() {
    if (!destroyed && panel.open) render();
  }

  async function saveProgress(value) {
    if (linking || progressSaving || typeof onSaveProgress !== "function")
      return;
    const record = goal();
    if (!record || CLOSED.has(record.status) || !ownMetric(record)) return;
    captureProgressDraft();
    const entry = progressDrafts.get(record.id) || metricDraftFor(record);
    const active = document.activeElement;
    const restoreAction = panel.contains(active)
      ? active?.dataset?.action
      : null;
    const restoreInput = Boolean(active?.closest?.("#goal-progress-form"));
    let parsed;
    try {
      parsed = parseProgress(value);
    } catch (error) {
      report(error, "#goal-progress-error", record.id);
      return;
    }
    clearError("#goal-progress-error", record.id);
    progressSaving = true;
    updateSaveState();
    try {
      const saved = await onSaveProgress(
        record.id,
        parsed,
        entry.expectedCurrent,
        { ...entry.expectedSnapshot },
      );
      if (destroyed) return;
      if (saved !== true) {
        report(
          "İlerleme kaydedilemedi. Yazdığın değer korunuyor; yeniden deneyebilirsin.",
          "#goal-progress-error",
          record.id,
        );
        return;
      }
      const updated = find(record.id);
      const currentForm = panel.querySelector("#goal-progress-form");
      if (updated && currentForm?.dataset.id === record.id)
        currentForm.elements.currentValue.value = currentDisplay(updated);
      progressDrafts.delete(record.id);
      clearError("#goal-progress-error", record.id);
    } catch (error) {
      if (!destroyed)
        report(
          error || "İlerleme kaydedilemedi.",
          "#goal-progress-error",
          record.id,
        );
    } finally {
      progressSaving = false;
      if (!destroyed && panel.open) {
        render(true);
        const currentActive = document.activeElement;
        if (
          selectedId === record.id &&
          restoreInput &&
          (!currentActive ||
            currentActive === document.body ||
            panel.contains(currentActive))
        ) {
          const control = restoreAction
            ? panel.querySelector(`[data-action="${restoreAction}"]`)
            : null;
          if (control && !control.disabled)
            control.focus({ preventScroll: true });
          else
            panel
              .querySelector("#goal-progress-current")
              ?.focus({ preventScroll: true });
        }
      }
    }
  }

  function onClick(event) {
    const control = event.target.closest?.("[data-action]");
    if (!control || !panel.contains(control)) return;
    const { action, id } = control.dataset;
    if (
      ![
        "goal-panel-close",
        "goal-new-step",
        "goal-edit-record",
        "goal-open-child",
        "goal-progress-decrement",
        "goal-progress-increment",
        "goal-progress-target",
        "goal-progress-reset",
        "goal-add-measurement",
      ].includes(action)
    )
      return;
    event.preventDefault();
    if (linking || progressSaving) return;
    if (action === "goal-panel-close") close();
    else if (
      [
        "goal-progress-decrement",
        "goal-progress-increment",
        "goal-progress-target",
      ].includes(action)
    ) {
      const record = goal();
      const entry = record && progressDrafts.get(record.id);
      if (!record || !entry || entry.dirty || CLOSED.has(record.status)) return;
      const current = Number(entry.expectedCurrent ?? 0);
      saveProgress(
        action === "goal-progress-target"
          ? entry.expectedSnapshot.targetValue
          : action === "goal-progress-increment"
            ? current + 1
            : Math.max(0, current - 1),
      );
    } else if (action === "goal-progress-reset") {
      const record = goal();
      if (!record) return;
      const current = panel.querySelector("#goal-progress-current");
      if (current) current.value = currentDisplay(record);
      progressDrafts.delete(record.id);
      clearError("#goal-progress-error", record.id);
      render(true);
    } else if (action === "goal-add-measurement" && goal()) {
      close();
      onEdit(id);
    } else if (action === "goal-open-child") {
      open(id);
    } else if (action === "goal-new-step" && GOALS.has(find(id)?.type)) {
      close();
      onNewStep(id);
    } else if (action === "goal-edit-record" && goal()) {
      close();
      onEdit(id);
    }
  }

  function onInput(event) {
    if (event.target.matches?.('#goal-progress-form [name="currentValue"]')) {
      captureProgressDraft();
      clearError("#goal-progress-error");
      updateSaveState();
      return;
    }
    if (event.target.matches?.('#goal-link-child-form [name="childId"]')) {
      clearError("#goal-link-child-error");
      updateSaveState();
      return;
    }
  }

  async function onSubmit(event) {
    if (event.target.matches?.("#goal-progress-form")) {
      event.preventDefault();
      if (event.target.dataset.id !== goal()?.id) return;
      await saveProgress(event.target.elements.currentValue.value);
      return;
    }
    if (event.target.matches?.("#goal-link-child-form")) {
      event.preventDefault();
      if (linking || progressSaving) return;
      const record = goal();
      const childId = event.target.elements.childId.value;
      if (
        !record ||
        event.target.dataset.id !== record.id ||
        !unboundChildren(record, getRecords()).some(
          (child) => child.id === childId,
        )
      ) {
        report(
          "Bu kayıt artık bağlanmaya uygun değil. Listeyi yeniden kontrol et.",
          "#goal-link-child-error",
        );
        return;
      }
      linking = true;
      clearError("#goal-link-child-error", record.id);
      updateSaveState();
      try {
        const saved = await onLinkChild(record.id, childId);
        if (saved !== true) {
          report(
            "Bağlantı kaydedilemedi. Yeniden deneyebilirsin.",
            "#goal-link-child-error",
          );
          return;
        }
        render(true);
      } catch (error) {
        report(error || "Bağlantı kaydedilemedi.", "#goal-link-child-error");
      } finally {
        linking = false;
        updateSaveState();
      }
      return;
    }
  }

  function onCancel(event) {
    if (linking || progressSaving) event.preventDefault();
    else captureProgressDraft();
  }

  function onEscape(event) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      !panel.open ||
      linking ||
      progressSaving
    )
      return;
    // A status/calendar popover or a modal editor gets the first Escape.
    // This nonmodal panel must not consume their dismissal shortcut.
    if (document.querySelector("dialog:modal, :popover-open")) return;
    event.preventDefault();
    close();
  }

  function destroy() {
    if (destroyed) return;
    close();
    destroyed = true;
    panel.removeEventListener("click", onClick);
    panel.removeEventListener("input", onInput);
    panel.removeEventListener("submit", onSubmit);
    panel.removeEventListener("cancel", onCancel);
    panel.removeEventListener("close", captureProgressDraft);
    owner.removeEventListener("pagehide", destroy);
    owner.removeEventListener("keydown", onEscape);
    panel.remove();
    progressDrafts.clear();
    messages.clear();
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", onInput);
  panel.addEventListener("submit", onSubmit);
  panel.addEventListener("cancel", onCancel);
  panel.addEventListener("close", captureProgressDraft);
  owner.addEventListener("pagehide", destroy, { once: true });
  owner.addEventListener("keydown", onEscape);
  return { open, refresh, close, destroy };
}
