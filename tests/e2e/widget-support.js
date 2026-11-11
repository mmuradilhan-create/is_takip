import { expect } from "@playwright/test";

/** 1.2.0 opens the widget on its work view; agenda suites switch to it first. */
export async function showAgenda(page) {
  const toggle = page.locator("#widget-view-toggle");
  await expect(toggle).toBeVisible();
  const shell = page.locator(".widget-shell");
  if ((await shell.getAttribute("data-view")) !== "agenda")
    await toggle.click();
  await expect(page.locator(".widget-shell")).toHaveAttribute(
    "data-view",
    "agenda",
  );
}
