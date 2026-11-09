const layouts = new WeakMap();
const GOALS = new Set(["weekly", "monthly", "yearly"]);
const MEASUREMENT = ["metric", "targetValue", "currentValue"];
const TITLES = {
  daily: "Başlık *",
  weekly: "Hedef *",
  monthly: "Hedef *",
  yearly: "Hedef *",
  meeting: "Toplantı / konu *",
  waiting: "Beklenen konu *",
};

function details(document, attribute, caption) {
  const element = document.createElement("details");
  element.className = "record-editor-details full";
  element.setAttribute(attribute, "");
  const summary = document.createElement("summary");
  summary.textContent = caption;
  const grid = document.createElement("div");
  grid.className = "form-grid record-editor-details-grid";
  element.append(summary, grid);
  return { element, grid };
}

function caption(field, text) {
  if (!field) return;
  let label = field.querySelector(":scope > [data-record-editor-caption]");
  if (!label) {
    label = field.ownerDocument.createElement("span");
    label.setAttribute("data-record-editor-caption", "");
    const oldText = [...field.childNodes].find(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    );
    if (oldText) oldText.replaceWith(label);
    else field.prepend(label);
  }
  label.textContent = text;
}

// Leave nodes in place when their order already matches, including focused fields.
function arrange(container, nodes) {
  let next = container.firstElementChild;
  for (const node of nodes) {
    if (node === next) next = next.nextElementSibling;
    else container.insertBefore(node, next);
  }
}

function numericControls(form, document) {
  const element = document.createElement("div");
  element.className = "record-editor-numeric full";
  element.setAttribute("data-record-editor-measurement", "");
  const label = document.createElement("label");
  label.className = "record-editor-numeric-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "editorNumeric";
  const metric = form.querySelector('[name="metric"]')?.value.trim();
  const target = form.querySelector('[name="targetValue"]')?.value.trim();
  const current = form.querySelector('[name="currentValue"]')?.value.trim();
  const initialEnabled = Boolean(
    metric || target || (current && Number(current) !== 0),
  );
  checkbox.checked = initialEnabled;
  checkbox.defaultChecked = initialEnabled;
  label.append(checkbox, document.createTextNode("Adetle takip et"));
  const grid = document.createElement("fieldset");
  grid.className = "record-editor-numeric-fields";
  element.append(label, grid);
  return { element, grid, checkbox, initialEnabled, touched: false };
}

function updateNumeric(layout) {
  const { measurement, fields, type } = layout;
  const goal = GOALS.has(type);
  const enabled = goal && measurement.checkbox.checked;
  measurement.element.hidden = !goal;
  measurement.checkbox.disabled = !goal;
  measurement.grid.hidden = !enabled;
  measurement.grid.disabled = !enabled;
  for (const name of MEASUREMENT) {
    const field = fields.get(name);
    if (!field) continue;
    field.hidden = !enabled;
    for (const control of field.querySelectorAll(
      "input, select, textarea, button",
    ))
      control.disabled = !enabled;
  }
}

function initialize(form) {
  const body = form.querySelector(":scope > .modal-body");
  const basic = body?.querySelector(":scope > .form-grid");
  if (!body || !basic) return null;
  const document = form.ownerDocument;
  const fields = new Map();
  for (const control of body.querySelectorAll("[name]")) {
    if (control.name.startsWith("editorPeriod")) continue;
    const field = control.closest(".field");
    if (!field || fields.has(control.name)) continue;
    fields.set(control.name, field);
    field.dataset.recordEditorField = control.name;
  }
  const context = [...basic.children].filter(
    (element) => !element.matches(".field"),
  );
  const extras = details(document, "data-record-editor-extras", "Ek bilgiler");
  extras.element.open = false;
  const measurement = numericControls(form, document);
  const followupHeading = document.createElement("h3");
  followupHeading.className = "record-editor-followup-heading full";
  followupHeading.textContent = "Takip bilgileri";
  const pool = document.createElement("div");
  pool.setAttribute("data-record-editor-unused", "");
  pool.hidden = true;
  pool.setAttribute("aria-hidden", "true");
  const error = body.querySelector(":scope > #form-error");
  const latest = fields.get("latestUpdate");
  if (latest) {
    const help = document.createElement("span");
    help.className = "field-help";
    help.textContent =
      "Yeni takip sonuçlarını listeden “Takip ettim” ile tarihli kaydedebilirsin.";
    latest.append(help);
  }
  body.insertBefore(extras.element, error);
  body.insertBefore(pool, error);
  basic.dataset.recordEditorBasic = "";
  form.dataset.recordEditorLayout = "";
  const layout = {
    basic,
    fields,
    context,
    extras,
    measurement,
    followupHeading,
    pool,
    oldGroups: [...body.querySelectorAll(":scope > .extra-group")],
  };
  form.addEventListener("change", (event) => {
    if (event.target !== measurement.checkbox) return;
    measurement.touched = true;
    updateNumeric(layout);
  });
  return layout;
}

/** Read the edit form's chosen mode; deciding what to persist stays with Save. */
export function readRecordEditorNumeric(form) {
  const layout = layouts.get(form);
  if (!layout) return null;
  return {
    enabled: GOALS.has(layout.type) && layout.measurement.checkbox.checked,
    initialEnabled: layout.measurement.initialEnabled,
    touched: layout.measurement.touched,
  };
}

/** Rearrange existing edit controls without changing any entered or stored value. */
export function arrangeRecordEditor(
  form,
  { type, linkedMeeting = false } = {},
) {
  if (!form || form.dataset.creation === "true" || !Object.hasOwn(TITLES, type))
    return;
  let layout = layouts.get(form);
  if (!layout) {
    layout = initialize(form);
    if (!layout) return;
    layouts.set(form, layout);
  }
  const { basic, fields, context, extras, measurement, followupHeading, pool } =
    layout;
  layout.type = type;
  const daily = type === "daily";
  const goal = GOALS.has(type);
  const waiting =
    daily && form.querySelector('[name="status"]').value === "waiting";
  const basicNames = daily
    ? [
        "title",
        "status",
        "dueDate",
        "priority",
        "parentId",
        ...(waiting ? ["waitingReason"] : []),
      ]
    : goal
      ? [
          "title",
          "status",
          "periodKey",
          ...(type !== "yearly" ? ["dueDate"] : []),
          ...(type !== "yearly" ? ["goalParentId"] : []),
        ]
      : type === "meeting"
        ? ["title", "decision", "status"]
        : [
            "title",
            "status",
            "expectedFrom",
            "lastFollowUpDate",
            "nextFollowUpDate",
            "latestUpdate",
          ];
  const extraNames = [
    "type",
    ...(goal ? ["priority"] : []),
    "sourceDate",
    "description",
    ...(goal ? ["currentValue"] : []),
    ...(daily ? ["workContext"] : []),
  ];
  const activeNames = new Set([
    ...basicNames,
    ...extraNames,
    ...(goal ? MEASUREMENT : []),
  ]);
  const inactive = [];
  for (const [name, field] of fields) {
    const active = activeNames.has(name);
    field.hidden = !active;
    // A locked type selector can have a live hidden companion. Preserve both.
    if (name !== "type") {
      const disabled = !active || (linkedMeeting && name === "status");
      for (const control of field.querySelectorAll(
        "input, select, textarea, button",
      ))
        control.disabled = disabled;
    }
    if (!active && (!MEASUREMENT.includes(name) || name === "currentValue"))
      inactive.push(field);
  }
  arrange(pool, [...new Set(inactive)]);
  const nodes = basicNames.map((name) => fields.get(name)).filter(Boolean);
  if (type === "waiting") nodes.splice(1, 0, followupHeading);
  else if (followupHeading.parentElement !== pool) pool.append(followupHeading);
  arrange(
    basic,
    type === "meeting"
      ? [...nodes, ...context, measurement.element]
      : [...context, ...nodes, measurement.element],
  );
  arrange(
    extras.grid,
    extraNames.map((name) => fields.get(name)).filter(Boolean),
  );
  arrange(
    measurement.grid,
    ["targetValue", "metric"].map((name) => fields.get(name)).filter(Boolean),
  );
  for (const group of layout.oldGroups) group.remove();
  layout.oldGroups = [];
  caption(fields.get("title"), TITLES[type]);
  caption(fields.get("targetValue"), "Hedef adet");
  caption(fields.get("metric"), "Birim");
  caption(fields.get("currentValue"), "Mevcut adet");
  fields.get("dueDate")?.classList.toggle("full", goal);
  form
    .querySelector('[name="targetValue"]')
    ?.setAttribute("placeholder", "Örn. 10");
  form
    .querySelector('[name="metric"]')
    ?.setAttribute("placeholder", "Örn. Rapor, parça");
  updateNumeric(layout);
  if (
    goal &&
    !fields.get("periodKey")?.hasAttribute("data-editor-period-field")
  )
    caption(
      fields.get("periodKey"),
      { weekly: "Hafta", monthly: "Ay", yearly: "Yıl" }[type],
    );
}
