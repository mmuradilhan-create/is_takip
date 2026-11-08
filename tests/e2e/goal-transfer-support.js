import { expect } from "@playwright/test";

/** Confirm a goal move through its real period-and-reason dialog. */
export async function completeGoalTransfer(
  page,
  { reason, targetPeriod } = {},
) {
  const dialog = page.locator("#goal-transfer-dialog");
  await expect(dialog).toBeVisible();
  if (targetPeriod !== undefined)
    await dialog.locator('[name="targetPeriod"]').selectOption(targetPeriod);
  if (reason !== undefined)
    await dialog.locator('[name="transferReason"]').fill(reason);
  await dialog.getByRole("button", { name: "Taşı", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
