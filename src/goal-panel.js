import { TYPES, getWeeklyProgress, goalProgress } from "./model.js";
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
  onUnlinkChild = null,
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
  let unlinking = null;
  let destroyed = false;
  let returnFocus = null;

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
    const busy = linking || progressSaving || unlinking;
    const linkForm = panel.querySelector("#goal-link-child-form");
    if (linkForm) {
      linkForm.setAttribute("aria-busy", String(linking));
      linkForm.elements.childId.disabled =
        busy || linkForm.elements.childId.options.length < 2;
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
      '[data-action="goal-new-step"], [data-action="goal-edit-record"], [data-action="goal-open-child"], [data-action="goal-add-measurement"], [data-action="goal-unlink-child"], [data-action="goal-panel-close"]',
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
    if (record.status === "cancelled") {
      const measurement = ownMetric(record)
        ? `<p class="goal-panel-metric"><span>Kaydedilen ölçüm</span> ${esc(record.currentValue ?? 0)} / ${esc(record.targetValue)} ${esc(record.metric || "hedef değeri")}</p>`
        : "";
      return `<section class="goal-panel-section goal-panel-progress" data-goal-section="progress" data-progress-basis="excluded"><div class="goal-panel-section-heading"><h3 tabindex="-1" data-goal-section-heading="progress">İlerleme</h3><span class="goal-progress-excluded">İptal edildi</span></div>${measurement}<p class="goal-progress-hint">Bu hedef üst hedefin ilerlemesine dahil değil. İlerlemeyi değiştirmek için hedefi yeniden aç.</p></section>`;
    }
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

  function unlinkControl(record) {
    if (typeof onUnlinkChild !== "function") return "";
    const caption =
      record.type === "daily"
        ? "Bağı kaldır ve anlık işe dönüştür"
        : "Üst hedef bağlantısını kaldır";
    return `<button type="button" class="goal-child-unlink" data-action="goal-unlink-child" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: ${caption.toLocaleLowerCase("tr-TR")}" data-record-link-tooltip="${esc(caption)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15-1 1a4 4 0 0 1-6-6l3-3a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-3 3a4 4 0 0 1-6 0M3 21 21 3"/></svg></button>`;
  }

  function childMarkup(record, records) {
    const due = childDateMarkup(record);
    const titleClass = ["completed", "cancelled"].includes(record.status)
      ? ` ${record.status}`
      : "";
    if (GOALS.has(record.type)) {
      const progress = goalProgress(record, records);
      const progressMarkup =
        record.status === "cancelled"
          ? '<span class="goal-progress-excluded" aria-label="İptal edildi; üst hedefin ilerlemesine dahil değil.">—</span>'
          : `<div class="progress-track" role="progressbar" aria-label="${esc(record.title)} ilerlemesi" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div><strong>%${progress.percent}</strong>`;
      return `<li class="goal-child-row goal-child-goal" data-id="${esc(record.id)}">${renderComplete(record)}<div class="goal-child-main"><div class="goal-child-heading"><button type="button" class="goal-child-title${titleClass}" data-action="goal-open-child" data-id="${esc(record.id)}">${esc(record.title)}</button><div class="goal-child-actions">${unlinkControl(record)}<button type="button" class="goal-child-open" data-action="goal-open-child" data-id="${esc(record.id)}" aria-label="${esc(record.title)}: hedef ayrıntılarını aç"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-5-5 5 5-5 5"/></svg></button></div></div><div class="goal-child-meta">${renderStatus(record)}${due}<span>${esc(humanPeriod(record))}</span></div><div class="goal-child-progress">${progressMarkup}</div></div></li>`;
    }
    const title = `<button type="button" class="goal-child-title${titleClass}" data-action="edit" data-id="${esc(record.id)}">${esc(record.title)}</button>`;
    const waiting = renderBlocked(record);
    const titleContent = waiting
      ? `<div class="goal-child-title-line">${title}${waiting}</div>`
      : title;
    return `<li class="goal-child-row" data-id="${esc(record.id)}">${renderComplete(record)}<div class="goal-child-main">${titleContent}<div class="goal-child-meta">${renderStatus(record)}${due}${renderJournal(record)}</div></div><div class="goal-child-action goal-child-actions">${unlinkControl(record)}${renderWork(record)}</div></li>`;
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
    const hasCandidates = candidates.length > 0;
    const caption =
      record.type === "weekly"
        ? "Mevcut günlük işi bağla"
        : record.type === "monthly"
          ? "Mevcut haftalık hedefi bağla"
          : "Mevcut aylık hedefi bağla";
    const emptyCaption =
      record.type === "weekly"
        ? "Bağlanabilecek günlük iş yok"
        : record.type === "monthly"
          ? "Bağlanabilecek haftalık hedef yok"
          : "Bağlanabilecek aylık hedef yok";
    return `<form id="goal-link-child-form" class="goal-link-child-form" data-id="${esc(record.id)}"><label for="goal-link-child">${caption}</label><div class="goal-link-child-controls"><select name="childId" id="goal-link-child" aria-label="${caption}"${hasCandidates ? "" : ' disabled aria-describedby="goal-link-child-empty"'}><option value="">${hasCandidates ? "Kayıt seç" : emptyCaption}</option>${candidates.map((child) => `<option value="${esc(child.id)}">${esc(child.title)}${GOALS.has(child.type) ? ` · ${esc(humanPeriod(child))}` : ""}</option>`).join("")}</select><button type="submit" class="btn" disabled>Bağla</button></div>${hasCandidates ? "" : '<p id="goal-link-child-empty" class="field-help">Yalnız açık ve üst hedefe bağlı olmayan kayıtlar listelenir.</p>'}${errorMarkup(record, "#goal-link-child-error")}</form>`;
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
      ? `<div class="goal-panel-summary goal-panel-secondary" aria-label="Haftalık özet"><div><span>Günlük iş ilerlemesi</span><strong>${summary.completed}/${summary.total} tamamlandı</strong></div></div>`
      : "";
    return `<section class="goal-panel-section goal-panel-children goal-hierarchy-section" data-goal-section="children"><div class="goal-panel-section-heading"><h3 tabindex="-1" data-goal-section-heading="children">Bağlı ${childName} <small>${children.length}</small></h3><button type="button" class="text-btn goal-new-step" data-action="goal-new-step" data-id="${esc(record.id)}">${plusIcon}${action}</button></div>${children.length ? `${excluded ? `<p class="field-help goal-child-order">${excluded} iptal veya arşiv kaydı ilerlemeye dahil değil.</p>` : ""}<ul class="goal-child-list">${children.map((child) => childMarkup(child, records)).join("")}</ul>` : '<p class="goal-panel-empty">Bu hedef için ilk bağlı adımı ekleyebilirsin.</p>'}${typeof onUnlinkChild === "function" ? errorMarkup(record, "#goal-unlink-child-error") : ""}${linkChildMarkup(record, records)}${secondary}</section>`;
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
    return `<section class="goal-panel-section goal-panel-transfer-reasons" data-goal-section="transfers"><h3>Taşıma notları</h3><ol>${reasons
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
      record && linkForm?.dataset.id === record.id
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

  function onClose() {
    captureProgressDraft();
    if (panel.open) return;
    const previous = returnFocus;
    returnFocus = null;
    if (destroyed || !previous) return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !panel.contains(active) &&
      active !== previous.trigger
    )
      return;
    const available = (control) =>
      control?.isConnected &&
      !panel.contains(control) &&
      !control.matches(":disabled") &&
      control.getClientRects().length > 0;
    const target = available(previous.trigger)
      ? previous.trigger
      : previous.action && previous.id
        ? [...root.querySelectorAll("[data-action][data-id]")].find(
            (control) =>
              control.dataset.action === previous.action &&
              control.dataset.id === previous.id &&
              control.tagName === previous.tagName &&
              available(control),
          )
        : null;
    target?.focus({ preventScroll: true });
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

  function canActivate() {
    return !destroyed && !linking && !progressSaving && !unlinking;
  }

  function canOpen(id) {
    return canActivate() && GOALS.has(find(id)?.type);
  }

  function open(id, { section = null } = {}) {
    if (!canOpen(id)) return;
    if (!panel.open) {
      const trigger = document.activeElement;
      returnFocus = {
        trigger,
        action: trigger?.dataset?.action,
        id: trigger?.dataset?.id,
        tagName: trigger?.tagName,
      };
    }
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
    if (
      linking ||
      progressSaving ||
      unlinking ||
      typeof onSaveProgress !== "function"
    )
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

  async function unlinkChild(id) {
    if (
      linking ||
      progressSaving ||
      unlinking ||
      typeof onUnlinkChild !== "function"
    )
      return;
    const record = goal();
    const children = record
      ? goalChildren(record, getRecords()).sort(sortChildren)
      : [];
    const index = children.findIndex((child) => child.id === id);
    if (!record || index === -1) {
      report(
        "Bu kaydın hedef bağlantısı değişti. Güncel listeyi kontrol et.",
        "#goal-unlink-child-error",
      );
      render(true);
      return;
    }
    const nextId = children[index + 1]?.id || children[index - 1]?.id;
    const scrollTop = panel.querySelector(".goal-panel-body")?.scrollTop || 0;
    captureProgressDraft();
    unlinking = id;
    clearError("#goal-unlink-child-error", record.id);
    updateSaveState();
    let saved = false;
    try {
      saved = (await onUnlinkChild(record.id, id)) === true;
      if (!saved)
        report(
          "Bağlantı kaldırılamadı. Yeniden deneyebilirsin.",
          "#goal-unlink-child-error",
          record.id,
        );
      else clearError("#goal-unlink-child-error", record.id);
    } catch (error) {
      report(
        error || "Bağlantı kaldırılamadı.",
        "#goal-unlink-child-error",
        record.id,
      );
    } finally {
      unlinking = null;
      if (!destroyed && panel.open) {
        render(true);
        updateSaveState();
        if (selectedId === record.id) {
          const body = panel.querySelector(".goal-panel-body");
          if (body) body.scrollTop = scrollTop;
          const target = saved
            ? [...panel.querySelectorAll(".goal-child-row")]
                .find((row) => row.dataset.id === nextId)
                ?.querySelector(".goal-child-title")
            : [
                ...panel.querySelectorAll('[data-action="goal-unlink-child"]'),
              ].find((button) => button.dataset.id === id);
          (
            target ||
            panel.querySelector('[data-goal-section-heading="children"]')
          )?.focus({ preventScroll: true });
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
        "goal-unlink-child",
        "goal-progress-decrement",
        "goal-progress-increment",
        "goal-progress-target",
        "goal-progress-reset",
        "goal-add-measurement",
      ].includes(action)
    )
      return;
    event.preventDefault();
    if (linking || progressSaving || unlinking) return;
    if (action === "goal-panel-close") close();
    else if (action === "goal-unlink-child") unlinkChild(id);
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
      captureProgressDraft();
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
      if (linking || progressSaving || unlinking) return;
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
    if (linking || progressSaving || unlinking) event.preventDefault();
    else captureProgressDraft();
  }

  function onEscape(event) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      !panel.open ||
      linking ||
      progressSaving ||
      unlinking
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
    panel.removeEventListener("close", onClose);
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
  panel.addEventListener("close", onClose);
  owner.addEventListener("pagehide", destroy, { once: true });
  owner.addEventListener("keydown", onEscape);
  return { open, canOpen, canActivate, refresh, close, destroy };
}
