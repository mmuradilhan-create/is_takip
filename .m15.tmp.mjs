import { chromium } from "playwright";
import { createRecord } from "/home/user/is_takip/src/model.js";
const S = "2026-11-01T09:00:00.000Z";
const make = (x) => createRecord({ createdAt: S, updatedAt: S, ...x });
const recs = [
  make({ id: "both", type: "meeting", title: "Toplantı kararı both", decision: "x", status: "planned", sourceDate: "2026-10-28" }),
  make({ id: "both-work", type: "daily", title: "daily akışı", status: "planned", dueDate: "2026-11-15", sourceFields: { __followupSource: { recordId: "both", type: "meeting" } } }),
];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 800 } });
await p.addInitScript((r) => { if (!sessionStorage.getItem("s")) { sessionStorage.setItem("s", "1"); localStorage.setItem("is-takip-v1", JSON.stringify({ version: 1, records: r })); } }, recs);
await p.goto("http://127.0.0.1:5174/"); await p.locator('#nav [data-view="meeting"]').click();
await p.getByRole("searchbox").fill("Toplantı kararı both");
await p.locator('.meeting-title[data-id="both"]').click();
await p.locator('#meeting-record-panel .meeting-record-open[data-route="daily"]').click();
await p.waitForTimeout(300);
await p.locator("#editor #record-form [name=title]").fill("daily akışı 2");
await p.locator("#editor").getByRole("button", { name: "Değişiklikleri kaydet", exact: true }).click();
await p.waitForTimeout(500);
console.log("after save focus:", await p.evaluate(() => [document.activeElement?.tagName, document.activeElement?.className, document.activeElement?.closest("dialog")?.id, document.activeElement?.textContent?.slice(0,40)]), "meeting panel open:", await p.locator("#meeting-record-panel").isVisible());
await p.locator("#meeting-record-panel").getByRole("button", { name: "Kapat", exact: true }).click();
await p.waitForTimeout(300);
console.log("after close focus:", await p.evaluate(() => [document.activeElement?.tagName, document.activeElement?.className, document.activeElement?.dataset?.action, document.activeElement?.textContent?.slice(0,40)]));
await b.close();
