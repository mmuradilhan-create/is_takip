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

test("the unsaved changes question has no thick focus ring around its buttons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".workspace-note-add").click();
  const text = page.locator('#workspace-note-editor [name="text"]');
  await text.fill("Yarım kalan not");
  await text.press("Escape");
  const confirm = page.locator(".app-confirm-dialog");
  await expect(confirm).toBeVisible();
  const cancel = confirm.getByRole("button", { name: "Vazgeç" });
  await expect(cancel).toBeFocused();
  await expect(cancel).toHaveCSS("outline-style", "none");
  await expect(cancel).toHaveCSS("box-shadow", "none");
  // Tab still shows where the keyboard is, with the app's underline cue.
  await page.keyboard.press("Tab");
  const discard = confirm.getByRole("button", { name: "Kaydetmeden kapat" });
  await expect(discard).toBeFocused();
  await expect(discard).toHaveCSS("outline-style", "none");
  expect(
    await discard.evaluate((item) => getComputedStyle(item).textDecorationLine),
  ).toBe("underline");
  await cancel.click();
  await expect(confirm).toBeHidden();
  await expect(text).toHaveValue("Yarım kalan not");
});
