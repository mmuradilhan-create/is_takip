import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-01T09:00:00.000Z";
const make = (input) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
const stored = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("is-takip-v1")).records.find(
      (record) => record.id === "topic",
    ),
  );

async function seed(page) {
  await page.clock.setFixedTime(new Date("2026-11-17T09:00:00.000Z"));
  await page.addInitScript(
    (raw) => {
      if (sessionStorage.getItem("followup-delete-181")) return;
      sessionStorage.setItem("followup-delete-181", "1");
      localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({
      version: 1,
      records: [
        make({ id: "meeting", type: "meeting", title: "Toplantı kaydı" }),
        make({
          id: "topic",
          type: "waiting",
          title: "Toplantıya bağlı bekleyen konu",
          status: "waiting_response",
          expectedFrom: "Tedarikçi",
          lastFollowUpDate: "2026-11-17",
          nextFollowUpDate: "2026-11-20",
          latestUpdate: "Numune istendi",
          sourceFields: {
            __followupSource: { recordId: "meeting", type: "meeting" },
          },
          followUpLog: [
            {
              id: "older",
              date: "2026-11-10",
              note: "Telefonla arandı",
              nextFollowUpDate: "2026-11-14",
            },
            {
              id: "newer",
              date: "2026-11-17",
              note: "Numune istendi",
              nextFollowUpDate: "2026-11-20",
            },
          ],
        }),
        make({ id: "plain", type: "waiting", title: "Bağsız konu" }),
      ],
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator('#nav [data-view="waiting"]').click();
}

test("a title linked to a meeting is not underlined until hovered, like an unlinked one", async ({
  page,
}) => {
  await seed(page);
  const look = (id) =>
    page
      .locator(`tr[data-record-row][data-id="${id}"] .task-name`)
      .evaluate((element) => getComputedStyle(element).textDecorationLine);
  await page.mouse.move(2, 2);
  expect(await look("topic")).toBe("none");
  expect(await look("plain")).toBe("none");
  await page.locator('tr[data-record-row][data-id="topic"] .task-name').hover();
  expect(await look("topic")).toBe("underline");
});

test("a saved follow-up is deleted after a confirmation as one Undo step and the live fields follow the history", async ({
  page,
}) => {
  await seed(page);
  await page
    .locator('tr[data-record-row][data-id="topic"] .waiting-followup-trigger')
    .click();
  const dialog = page.locator("#waiting-followup-dialog");
  const entry = (id) => dialog.locator(`li[data-followup-id="${id}"]`);
  const remove = (id) =>
    entry(id).getByRole("button", { name: "Sil", exact: true });
  await expect(remove("newer")).toBeVisible();
  await expect(
    entry("newer").getByRole("button", { name: "Düzenle", exact: true }),
  ).toBeVisible();
  // Backing out of the question changes nothing.
  await remove("newer").click();
  const confirm = page
    .getByRole("alertdialog")
    .or(page.locator(".app-confirm-dialog"));
  await expect(confirm.first()).toContainText("17 Kasım 2026");
  await confirm
    .first()
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  expect((await stored(page)).followUpLog).toHaveLength(2);
  await remove("newer").click();
  await confirm
    .first()
    .getByRole("button", { name: "Sil", exact: true })
    .click();
  await expect(entry("newer")).toHaveCount(0);
  await expect(
    entry("older").getByRole("button", { name: "Düzenle", exact: true }),
  ).toBeFocused();
  const after = await stored(page);
  expect(after.followUpLog.map((item) => item.id)).toEqual(["older"]);
  expect(after.lastFollowUpDate).toBe("2026-11-10");
  expect(after.nextFollowUpDate).toBe("2026-11-14");
  expect(after.latestUpdate).toBe("Telefonla arandı");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).followUpLog.length)
    .toBe(2);
  const restored = await stored(page);
  expect(restored.lastFollowUpDate).toBe("2026-11-17");
  expect(restored.nextFollowUpDate).toBe("2026-11-20");
  expect(restored.latestUpdate).toBe("Numune istendi");
});
