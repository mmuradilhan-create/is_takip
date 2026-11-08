/** Reveal optional controls through the same disclosure used in the product. */
export async function openCreationExtras(page) {
  const form = page.locator("#record-form");
  const creation = (await form.getAttribute("data-creation")) === "true";
  const details = form.locator(
    creation
      ? "details.creation-advanced"
      : "details[data-record-editor-extras]",
  );
  if (!(await details.count())) return form;
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
  return form;
}

/** Reveal numerical controls without clearing an existing measurement. */
export async function enableCreationMeasurement(page) {
  const form = page.locator("#record-form");
  if ((await form.getAttribute("data-creation")) === "true")
    await form.locator('[name="numeric"]').check();
  else {
    const details = form.locator("details[data-record-editor-measurement]");
    if (
      (await details.count()) &&
      !(await details.evaluate((element) => element.open))
    )
      await details.locator("summary").click();
  }
  return openCreationExtras(page);
}

/** Use the product's friendly period selectors in both creation and editing. */
export async function setRecordPeriod(page, key) {
  const form = page.locator("#record-form");
  const creation = (await form.getAttribute("data-creation")) === "true";
  const names = creation
    ? { year: "periodYear", week: "periodWeek", month: "periodMonth" }
    : {
        year: "editorPeriodYear",
        week: "editorPeriodWeek",
        month: "editorPeriodMonth",
      };
  await form.locator(`[name="${names.year}"]`).selectOption(key.slice(0, 4));
  if (key.includes("-W"))
    await form.locator(`[name="${names.week}"]`).selectOption(key.slice(-2));
  else if (key.length === 7)
    await form.locator(`[name="${names.month}"]`).selectOption(key.slice(-2));
}
