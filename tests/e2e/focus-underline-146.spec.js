import { test, expect } from "@playwright/test";

const underline = (locator) =>
  locator.evaluate((item) => getComputedStyle(item).textDecorationLine);

test("a clicked button that gets focus back after Enter saves stays plain until Tab navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const add = page.locator(".workspace-note-add");
  await add.click();
  const text = page.locator('#workspace-note-editor [name="text"]');
  await text.fill("Toplantı sonrası arayacağım");
  await text.press("Enter");
  await expect(page.locator("#workspace-note-editor")).toBeHidden();
  await expect(add).toBeFocused();
  expect(await underline(add)).toBe("none");

  // Keyboard navigation still marks the focused control.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(add).toBeFocused();
  expect(await underline(add)).toBe("underline");
  await page.mouse.click(5, 880);
  expect(await underline(add)).toBe("none");
});
