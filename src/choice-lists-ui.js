import {
  availableChoices,
  normalizeChoiceLists,
  addChoice,
  renameChoice,
  removeChoice,
  restoreChoice,
  CHOICE_LIMITS,
} from "./choice-catalogs.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const KINDS = {
  projectCode: { title: "Proje kodları", singular: "Proje kodu" },
  workType: { title: "İş türleri", singular: "İş türü" },
};
const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const identity = (value) =>
  String(value).normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
const STALE_MESSAGE =
  "Liste başka bir pencerede değişti. Metnin korundu; vazgeçip güncel listeden yeniden düzenleyebilirsin.";

/** Manage suggestions without changing values already stored on records. */
export function createChoiceListSettings({
  root = document.querySelector("#app"),
  getRecords,
  getPreferences,
  onSave,
} = {}) {
  if (
    !root ||
    typeof getRecords !== "function" ||
    typeof getPreferences !== "function" ||
    typeof onSave !== "function"
  )
    throw new TypeError(
      "Seçim listeleri için kayıtlar ve kaydetme işlevi gereklidir.",
    );

  const document = root.ownerDocument;
  const states = Object.fromEntries(
    Object.keys(KINDS).map((kind) => [
      kind,
      {
        open: false,
        removedOpen: false,
        add: "",
        addExpected: undefined,
        addStarted: false,
        editing: null,
        error: "",
      },
    ]),
  );
  let busy = false;
  let destroyed = false;
  const currentLists = () => getPreferences()?.choiceLists;
  const host = () => root.querySelector("[data-choice-list-settings]");
  const stateFor = (element) => {
    const kind = element?.closest?.("[data-choice-catalog]")?.dataset
      .choiceCatalog;
    return Object.hasOwn(KINDS, kind || "")
      ? { kind, state: states[kind] }
      : null;
  };

  function row(kind, value, editing = false) {
    const state = states[kind];
    const caption = KINDS[kind].singular;
    return `<li class="choice-catalog-row" data-choice-value="${escapeHtml(value)}">${
      editing
        ? `<form class="choice-catalog-rename" data-choice-form="rename" data-choice-kind="${kind}" novalidate><input type="text" name="choiceValue" value="${escapeHtml(state.editing.draft)}" aria-label="${caption}: yeni ad" maxlength="${CHOICE_LIMITS[kind]}" autocomplete="off"><button type="submit"${busy ? " disabled" : ""}>Kaydet</button><button type="button" data-choice-action="cancel"${busy ? " disabled" : ""}>Vazgeç</button></form>`
        : `<span class="choice-catalog-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span><span class="choice-catalog-row-actions"><button type="button" data-choice-action="rename" aria-label="${escapeHtml(`${value}: düzenle`)}"${busy ? " disabled" : ""}>Düzenle</button><button type="button" data-choice-action="remove" aria-label="${escapeHtml(`${value}: listeden kaldır`)}"${busy ? " disabled" : ""}>Listeden kaldır</button></span>`
    }</li>`;
  }

  function catalog(kind, lists) {
    const state = states[kind];
    const config = KINDS[kind];
    const values = availableChoices(kind, getRecords(), lists);
    const hidden = normalizeChoiceLists(lists)[kind].hidden;
    const editingKey = state.editing && identity(state.editing.value);
    const hasEditing = values.some((value) => identity(value) === editingKey);
    const activeExpected = state.editing?.expected;
    if (
      !busy &&
      ((state.editing && !same(activeExpected, lists)) ||
        (state.addStarted && !same(state.addExpected, lists)))
    )
      state.error = STALE_MESSAGE;
    return `<details class="choice-catalog" data-choice-catalog="${kind}"${state.open ? " open" : ""}><summary><span>${config.title}</span><span class="choice-catalog-count">${values.length}</span><span class="choice-catalog-chevron" aria-hidden="true">›</span></summary><div class="choice-catalog-body"><form class="choice-catalog-add" data-choice-form="add" data-choice-kind="${kind}" novalidate><input type="text" name="choiceValue" value="${escapeHtml(state.add)}" aria-label="Yeni ${config.singular.toLocaleLowerCase("tr-TR")}" placeholder="${config.singular} ekle" maxlength="${CHOICE_LIMITS[kind]}" autocomplete="off"><button type="submit"${busy ? " disabled" : ""}>Ekle</button></form><p class="choice-catalog-error" data-choice-error role="alert"${state.error ? "" : " hidden"}>${escapeHtml(state.error)}</p><ul class="choice-catalog-list" aria-label="${config.title}">${values.map((value) => row(kind, value, identity(value) === editingKey)).join("")}${state.editing && !hasEditing ? row(kind, state.editing.value, true) : ""}${values.length || state.editing ? "" : '<li class="choice-catalog-empty">Henüz seçenek yok.</li>'}</ul>${hidden.length ? `<details class="choice-catalog-removed" data-choice-removed${state.removedOpen ? " open" : ""}><summary>Kaldırılanlar (${hidden.length})</summary><ul class="choice-catalog-hidden-list">${hidden.map((value) => `<li class="choice-catalog-row" data-choice-hidden-value="${escapeHtml(value)}"><span class="choice-catalog-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span><button type="button" data-choice-action="restore" aria-label="${escapeHtml(`${value}: geri ekle`)}"${busy ? " disabled" : ""}>Geri ekle</button></li>`).join("")}</ul></details>` : ""}</div></details>`;
  }

  function render() {
    if (destroyed) return "";
    const lists = currentLists();
    return `<section class="settings-choice-lists" data-choice-list-settings aria-label="Proje ve iş türü listeleri"${busy ? ' aria-busy="true"' : ""}><h3>Listeler</h3>${Object.keys(
      KINDS,
    )
      .map((kind) => catalog(kind, lists))
      .join("")}</section>`;
  }

  function refresh() {
    if (destroyed) return;
    const section = host();
    if (!section) return;
    for (const element of section.querySelectorAll("[data-choice-catalog]")) {
      const state = states[element.dataset.choiceCatalog];
      state.open = element.open;
      state.removedOpen = Boolean(
        element.querySelector("[data-choice-removed]")?.open,
      );
    }
    const active = section.contains(document.activeElement)
      ? document.activeElement
      : null;
    const descriptor = active && {
      kind: stateFor(active)?.kind,
      form: active.closest("[data-choice-form]")?.dataset.choiceForm,
      action: active.dataset.choiceAction,
      value: active.closest("[data-choice-value]")?.dataset.choiceValue,
      hiddenValue: active.closest("[data-choice-hidden-value]")?.dataset
        .choiceHiddenValue,
      summary: active.tagName === "SUMMARY",
      removed: Boolean(active.closest("[data-choice-removed]")),
      start: active.selectionStart,
      end: active.selectionEnd,
    };
    const scrollTop = section.scrollTop;
    const scrolls = Object.fromEntries(
      [...section.querySelectorAll("[data-choice-catalog]")].map((element) => [
        element.dataset.choiceCatalog,
        [
          element.querySelector(".choice-catalog-list")?.scrollTop || 0,
          element.querySelector(".choice-catalog-hidden-list")?.scrollTop || 0,
        ],
      ]),
    );
    section.outerHTML = render();
    const next = host();
    next.scrollTop = scrollTop;
    for (const element of next.querySelectorAll("[data-choice-catalog]")) {
      const positions = scrolls[element.dataset.choiceCatalog];
      if (!positions) continue;
      element.querySelector(".choice-catalog-list").scrollTop = positions[0];
      const hidden = element.querySelector(".choice-catalog-hidden-list");
      if (hidden) hidden.scrollTop = positions[1];
    }
    if (!descriptor?.kind) return;
    const container = next.querySelector(
      `[data-choice-catalog="${descriptor.kind}"]`,
    );
    let control;
    if (descriptor.form)
      control = container.querySelector(
        `[data-choice-form="${descriptor.form}"] input`,
      );
    else if (descriptor.summary)
      control = descriptor.removed
        ? container.querySelector("[data-choice-removed] > summary")
        : container.querySelector(":scope > summary");
    else if (descriptor.action) {
      const rows = container.querySelectorAll(
        "[data-choice-value], [data-choice-hidden-value]",
      );
      const matching = [...rows].find((element) =>
        descriptor.hiddenValue === undefined
          ? element.dataset.choiceValue === descriptor.value
          : element.dataset.choiceHiddenValue === descriptor.hiddenValue,
      );
      control = matching?.querySelector(
        `[data-choice-action="${descriptor.action}"]`,
      );
    }
    if (control) {
      control.focus({ preventScroll: true });
      if (descriptor.start !== null && descriptor.start !== undefined)
        control.setSelectionRange?.(descriptor.start, descriptor.end);
    }
  }

  async function commit(kind, next, expected, onSuccess, onFocus) {
    if (busy || destroyed) return;
    busy = true;
    states[kind].error = "";
    refresh();
    let succeeded = false;
    try {
      const saved = await onSave(next, clone(expected));
      if (saved !== true) throw new Error(STALE_MESSAGE);
      onSuccess?.();
      // Our own explicit edit can safely advance other drafts' baselines.
      // Updates from another window never pass this successful-save branch.
      for (const state of Object.values(states)) {
        if (state.addStarted && same(state.addExpected, expected))
          state.addExpected = clone(currentLists());
        if (state.editing && same(state.editing.expected, expected))
          state.editing.expected = clone(currentLists());
      }
      states[kind].error = "";
      succeeded = true;
    } catch (error) {
      states[kind].error =
        error instanceof Error
          ? error.message
          : "Liste kaydedilemedi. Metnin korundu.";
    } finally {
      busy = false;
      refresh();
      if (
        succeeded &&
        !destroyed &&
        [
          document.body,
          document.documentElement,
          host()?.closest("dialog"),
        ].includes(document.activeElement)
      )
        onFocus?.();
    }
  }

  function onInput(event) {
    const form = event.target.closest?.("[data-choice-form]");
    if (!form || !host()?.contains(form)) return;
    const info = stateFor(form);
    if (!info || event.target.name !== "choiceValue") return;
    const { state } = info;
    if (form.dataset.choiceForm === "rename") {
      if (state.editing) state.editing.draft = event.target.value;
    } else {
      if (!event.target.value) {
        state.addStarted = false;
        state.addExpected = undefined;
        state.add = "";
        return;
      }
      if (!state.addStarted) {
        state.addStarted = true;
        state.addExpected = clone(currentLists());
      }
      state.add = event.target.value;
    }
  }

  function onSubmit(event) {
    const form = event.target.closest?.("[data-choice-form]");
    if (!form || !host()?.contains(form)) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const { kind, state } = stateFor(form);
    const input = form.elements.namedItem("choiceValue");
    onInput({ target: input });
    const editing = form.dataset.choiceForm === "rename";
    const expected = editing
      ? state.editing.expected
      : state.addStarted
        ? state.addExpected
        : clone(currentLists());
    const value = input.value;
    try {
      if (!same(expected, currentLists())) throw new Error(STALE_MESSAGE);
      const next = editing
        ? renameChoice(kind, state.editing.value, value, getRecords(), expected)
        : addChoice(kind, value, getRecords(), expected);
      void commit(
        kind,
        next,
        expected,
        () => {
          if (editing && state.editing?.draft === value) state.editing = null;
          else if (editing && state.editing)
            state.editing.value = value.normalize("NFKC").trim();
          if (!editing && state.add === value) {
            state.add = "";
            state.addStarted = false;
            state.addExpected = undefined;
          }
        },
        () => focusRename(kind, value.normalize("NFKC").trim()),
      );
    } catch (error) {
      state.error = error.message;
      refresh();
    }
  }

  function onClick(event) {
    const button = event.target.closest?.("[data-choice-action]");
    if (!button || !host()?.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const { kind, state } = stateFor(button);
    const action = button.dataset.choiceAction;
    const value = button.closest("[data-choice-value]")?.dataset.choiceValue;
    if (action === "rename") {
      if (
        state.editing &&
        identity(state.editing.value) !== identity(value) &&
        state.editing.draft !== state.editing.value
      ) {
        state.error =
          "Önce açık düzenlemeyi kaydet veya vazgeç. Yazdığın ad korunuyor.";
        refresh();
        host()
          .querySelector(
            `[data-choice-catalog="${kind}"] [data-choice-form="rename"] input`,
          )
          ?.focus({ preventScroll: true });
        return;
      }
      state.editing = { value, draft: value, expected: clone(currentLists()) };
      state.error = "";
      refresh();
      const input = host().querySelector(
        `[data-choice-catalog="${kind}"] [data-choice-form="rename"] input`,
      );
      input.focus({ preventScroll: true });
      input.select();
    } else if (action === "cancel") {
      state.editing = null;
      state.error = "";
      refresh();
      focusRename(kind, value);
    } else {
      const expected = clone(currentLists());
      const container = button.closest("[data-choice-catalog]");
      const rows = [
        ...container.querySelectorAll(
          ".choice-catalog-list > [data-choice-value]",
        ),
      ];
      const index = rows.findIndex(
        (element) => element.dataset.choiceValue === value,
      );
      const nearest =
        rows[index + 1]?.dataset.choiceValue ||
        rows[index - 1]?.dataset.choiceValue;
      const restored =
        action === "restore"
          ? button.closest("[data-choice-hidden-value]").dataset
              .choiceHiddenValue
          : null;
      try {
        const next =
          action === "restore"
            ? restoreChoice(
                kind,
                button.closest("[data-choice-hidden-value]").dataset
                  .choiceHiddenValue,
                getRecords(),
                expected,
              )
            : removeChoice(kind, value, getRecords(), expected);
        void commit(kind, next, expected, null, () =>
          focusRename(kind, restored || nearest),
        );
      } catch (error) {
        state.error = error.message;
        refresh();
      }
    }
  }

  function onToggle(event) {
    const element = event.target;
    if (!host()?.contains(element)) return;
    const info = stateFor(element);
    if (!info) return;
    if (element.hasAttribute("data-choice-removed"))
      info.state.removedOpen = element.open;
    else if (element.hasAttribute("data-choice-catalog"))
      info.state.open = element.open;
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    const form = event.target.closest?.('[data-choice-form="rename"]');
    if (!form || !host()?.contains(form) || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const { kind, state } = stateFor(form);
    const value = state.editing?.value;
    state.editing = null;
    state.error = "";
    refresh();
    focusRename(kind, value);
  }

  function focusRename(kind, value) {
    const container = host()?.querySelector(`[data-choice-catalog="${kind}"]`);
    const row = [
      ...(container?.querySelectorAll("[data-choice-value]") || []),
    ].find((element) => element.dataset.choiceValue === value);
    const control =
      row?.querySelector('[data-choice-action="rename"]') ||
      row?.querySelector('[data-choice-form="rename"] input') ||
      container?.querySelector('[data-choice-form="add"] input') ||
      container?.querySelector(":scope > summary");
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener("input", onInput);
    root.removeEventListener("submit", onSubmit);
    root.removeEventListener("click", onClick);
    root.removeEventListener("toggle", onToggle, true);
    root.removeEventListener("keydown", onKeyDown);
  }

  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("click", onClick);
  root.addEventListener("toggle", onToggle, true);
  root.addEventListener("keydown", onKeyDown);
  return { render, refresh, destroy };
}
