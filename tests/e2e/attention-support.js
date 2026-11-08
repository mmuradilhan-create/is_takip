import { expect } from "@playwright/test";

export const attentionRows = (page) =>
  page.locator(".attention-panel .attention-list > [data-id]");
export const previousAttention = (page) =>
  page.getByRole("button", { name: "Önceki takipler", exact: true });
export const nextAttention = (page) =>
  page.getByRole("button", { name: "Sonraki takipler", exact: true });

export async function firstAttentionPage(page) {
  const previous = previousAttention(page);
  for (let index = 0; index < 100; index += 1) {
    if (!(await previous.count()) || (await previous.isDisabled())) return;
    await previous.click();
  }
  throw new Error("Takip kartları ilk sayfaya dönemedi.");
}

/** Read every attention page through its real controls, then return to page one. */
export async function readAttentionCards(page) {
  await firstAttentionPage(page);
  const cards = [];
  for (let index = 0; index < 100; index += 1) {
    expect(await attentionRows(page).count()).toBeLessThanOrEqual(3);
    cards.push(
      ...(await attentionRows(page).evaluateAll((rows) =>
        rows.map((row) => ({
          id: row.dataset.id,
          date: row.querySelector("[data-attention-date]")?.dataset
            .attentionDate,
          near: Boolean(row.querySelector(".attention-date-near")),
        })),
      )),
    );
    const next = nextAttention(page);
    if (!(await next.count()) || (await next.isDisabled())) {
      await firstAttentionPage(page);
      return cards;
    }
    await next.click();
  }
  throw new Error("Takip kartlarının son sayfasına ulaşılamadı.");
}
