import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const STAMP = "2026-11-05T09:00:00.000Z";

test("meeting route boxes keep their caption and icon on one line inside 96x30", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-12T09:00:00.000Z"));
  const records = [
    createRecord({
      id: "meeting",
      type: "meeting",
      title: "Toplantı aksiyonu",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  await page.addInitScript(
    (raw) => {
      if (localStorage.getItem("is-takip-v1") === null)
        localStorage.setItem("is-takip-v1", raw);
    },
    JSON.stringify({ version: 1, records }),
  );
  for (const width of [1920, 1280, 900]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/");
    await page.locator('#nav [data-view="meeting"]').click();
    const routes = page.locator(".meeting-table .meeting-route");
    await expect(routes).toHaveText(["İş oluştur", "Takip oluştur"]);
    const sizes = await routes.evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          fits:
            item.scrollWidth <= item.clientWidth + 1 &&
            item.scrollHeight <= item.clientHeight + 1,
          oneLine: [...item.childNodes]
            .filter((node) => node.nodeType === 3 && node.textContent.trim())
            .every((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              return range.getClientRects().length === 1;
            }),
        };
      }),
    );
    for (const size of sizes)
      expect(size, `${width}`).toEqual({
        width: 96,
        height: 30,
        fits: true,
        oneLine: true,
      });
  }
});
