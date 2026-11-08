/** Follow the separate visibility tabs before choosing a detailed status. */
export async function selectListStatus(page, value) {
  const scope =
    value === "active"
      ? "open"
      : value === "completed"
        ? "completed"
        : value === "all" || ["cancelled", "transferred"].includes(value)
          ? "all"
          : "open";
  await page
    .locator(`[data-action="list-scope"][data-scope="${scope}"]`)
    .click();
  if (!["active", "completed", "all"].includes(value))
    await page.locator("#status-filter").selectOption(value);
}
