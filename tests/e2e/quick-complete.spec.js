import { test, expect } from "@playwright/test";
import { selectListStatus } from "./list-scope-helper.js";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const SESSION_KEY = `${KEY}-work-session`;
const START = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const PERIODS = { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" };

function record(type, overrides = {}) {
  return createRecord({
    id: `quick-${type}`,
    type,
    title: `${type} kaydını tamamla`,
    status: "in_progress",
    dueDate: "2026-11-07",
    periodKey: PERIODS[type] || "",
    description: "Mevcut kayıt notu korunmalı.",
    nextAction: "Sonraki adım korunmalı.",
    sourceFields: { "Özgün alan": { value: "Korunacak değer" } },
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  });
}

const oldLog = {
  id: "existing-work-session",
  date: "2026-11-06",
  endedAt: "2026-11-06T12:00:00.000Z",
  durationMs: 65_000,
  note: "Önceki çalışma tamamlandı.",
  nextAction: "İkinci bölümü incele.",
};

async function seed(page, records) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START);
  await page.addInitScript(
    ({ key, sessionKey, records }) => {
      if (sessionStorage.getItem("odak-quick-complete-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records,
          odak: {
            version: 1,
            preferences: { density: "comfortable" },
            history: [],
          },
        }),
      );
      localStorage.removeItem(sessionKey);
      sessionStorage.setItem("odak-quick-complete-seeded", "true");
    },
    { key: KEY, sessionKey: SESSION_KEY, records },
  );
  await page.goto("/");
}

const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const readRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

async function openList(page, type) {
  await page.locator(`#nav [data-view="${type}"]`).click();
  await selectListStatus(page, "active");
}

test("daily quick completion takes one click, hides from open work and undo restores the exact journal and record", async ({
  page,
}) => {
  const original = record("daily", { workLog: [oldLog] });
  await seed(page, [original]);
  await openList(page, "daily");
  const daily = row(page, original.id);
  await expect(daily.locator(".status-trigger")).toHaveText("Devam ediyor");
  await expect(
    daily.locator(".task-title-cell > .quick-complete"),
  ).toBeVisible();
  await daily
    .getByRole("button", {
      name: `${original.title}: hızlı tamamla`,
      exact: true,
    })
    .click();
  await expect(daily).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#status-menu")).not.toBeVisible();
  const [completed] = await readRecords(page);
  expect(completed).toEqual({
    ...original,
    status: "completed",
    updatedAt: START.toISOString(),
  });
  expect(completed.workLog).toEqual([oldLog]);
  await undo(page);
  expect(await readRecords(page)).toEqual([original]);
  await expect(daily).toBeVisible();
  await expect(daily.locator(".status-trigger")).toHaveText("Devam ediyor");
  await expect(daily.locator(".quick-complete")).toBeVisible();
});

test("meeting status closure and waiting quick closure use their own terminal captions and each undo restores source details", async ({
  page,
}) => {
  const originals = [
    record("meeting"),
    record("waiting", { status: "waiting_response" }),
  ];
  await seed(page, originals);
  for (const original of originals) {
    await openList(page, original.type);
    if (original.type === "meeting") {
      await expect(
        row(page, original.id).locator(".quick-complete"),
      ).toHaveCount(0);
      await row(page, original.id).locator(".task-name").click();
      const preview = page.locator("#meeting-record-panel");
      await expect(preview).toBeVisible();
      await preview
        .getByRole("button", { name: "Kaydı düzenle", exact: true })
        .click();
      const form = page.locator("#editor #record-form");
      await expect(form.locator('[name="id"]')).toHaveValue(original.id);
      await form.locator('[name="status"]').selectOption("completed");
      await form
        .getByRole("button", {
          name: "Değişiklikleri kaydet",
          exact: true,
        })
        .click();
      await expect(page.locator("#editor")).not.toBeVisible();
    } else {
      await row(page, original.id)
        .getByRole("button", {
          name: `${original.title}: konuyu kapat`,
          exact: true,
        })
        .click();
    }
    await expect(row(page, original.id)).toHaveCount(0);
    await selectListStatus(page, "completed");
    await expect(row(page, original.id).locator(".status-trigger")).toHaveText(
      "Kapandı",
    );
    if (original.type === "meeting")
      await expect(
        row(page, original.id).locator(".meeting-archive-control"),
      ).toHaveCount(0);
    await expect(row(page, original.id).locator(".quick-complete")).toHaveCount(
      0,
    );
    const saved = (await readRecords(page)).find(
      (item) => item.id === original.id,
    );
    expect(saved).toEqual({
      ...original,
      status: "completed",
      updatedAt: START.toISOString(),
      ...(original.type === "waiting"
        ? {
            sourceFields: {
              ...original.sourceFields,
              __waitingClosure: {
                version: 1,
                closedDate: "2026-11-07",
                closedAt: START.toISOString(),
              },
            },
          }
        : {}),
    });
    await undo(page);
    expect(await readRecords(page)).toEqual(originals);
  }
});

test("goal quick completion displays full progress while preserving entered metric values and exact undo", async ({
  page,
}) => {
  const originals = ["weekly", "monthly", "yearly"].map((type) =>
    record(type, { metric: "Rapor", targetValue: 10, currentValue: 4 }),
  );
  await seed(page, originals);
  for (const original of originals) {
    await openList(page, original.type);
    await expect(
      row(page, original.id).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "40");
    await row(page, original.id).locator(".quick-complete").click();
    await expect(row(page, original.id)).toHaveCount(0);
    await selectListStatus(page, "completed");
    await expect(
      row(page, original.id).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "100");
    const saved = (await readRecords(page)).find(
      (item) => item.id === original.id,
    );
    expect(saved).toEqual({
      ...original,
      status: "completed",
      updatedAt: START.toISOString(),
    });
    await expect(row(page, original.id).locator(".quick-complete")).toHaveCount(
      0,
    );
    await undo(page);
    expect(await readRecords(page)).toEqual(originals);
    await selectListStatus(page, "active");
    await expect(
      row(page, original.id).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "40");
  }
});

test("closed records keep read-only marks and cancelled titles are muted and struck through across every list", async ({
  page,
}) => {
  const types = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
  const originals = types.flatMap((type) =>
    ["completed", "cancelled", "transferred"].map((status) =>
      record(type, { id: `closed-${type}-${status}`, status }),
    ),
  );
  await seed(page, originals);
  const before = await page.evaluate((key) => localStorage.getItem(key), KEY);
  for (const type of types) {
    await page.locator(`#nav [data-view="${type}"]`).click();
    await selectListStatus(page, "all");
    for (const original of originals.filter((item) => item.type === type)) {
      if (type === "weekly" && original.status === "transferred") {
        await expect(row(page, original.id)).toBeVisible();
        await selectListStatus(page, "transferred");
        await expect(page.locator("#status-filter")).toHaveValue("transferred");
      }
      await expect(row(page, original.id)).toBeVisible();
      await expect(
        row(page, original.id).locator(".quick-complete"),
      ).toHaveCount(0);
      await expect(
        row(page, original.id).locator(".status-trigger"),
      ).toBeVisible();
      const title = row(page, original.id).locator(".task-name");
      if (original.status === "cancelled") {
        if (["weekly", "monthly", "yearly"].includes(type)) {
          const progress = row(page, original.id).locator(".metric-cell");
          await expect(progress).toHaveText("—");
          await expect(progress.getByRole("progressbar")).toHaveCount(0);
          await expect(progress).toHaveAttribute(
            "aria-label",
            "İptal edilen kayıt ilerlemeye dahil değil",
          );
        }
        const mark = row(page, original.id).locator(
          ".completion-mark.is-cancelled",
        );
        if (type === "meeting") await expect(mark).toHaveCount(0);
        else {
          await expect(mark).toHaveAttribute("role", "img");
          await expect(mark).not.toHaveAttribute("tabindex");
          await expect(mark).not.toHaveAttribute("data-action");
          await expect(mark.locator("svg path")).toHaveAttribute(
            "d",
            "m6 6 12 12M6 18 18 6",
          );
        }
        for (const [theme, muted] of [
          ["light", "rgb(123, 137, 115)"],
          ["dark", "rgb(150, 156, 165)"],
        ]) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          await expect(title).toHaveCSS("color", muted);
          await expect(title).toHaveCSS("text-decoration-line", /line-through/);
          await title.hover();
          await expect(title).toHaveCSS("color", muted);
          await expect(title).toHaveCSS("text-decoration-line", /line-through/);
        }
        await title.press("Enter");
        const preview = page.locator(
          ["weekly", "monthly", "yearly"].includes(type)
            ? "#goal-detail-panel"
            : type === "meeting"
              ? "#meeting-record-panel"
              : type === "waiting"
                ? "#waiting-record-panel"
                : "#editor",
        );
        await expect(preview).toBeVisible();
        if (["weekly", "monthly", "yearly"].includes(type)) {
          const progress = preview.locator(".goal-panel-progress");
          await expect(progress.getByRole("progressbar")).toHaveCount(0);
          await expect(progress).not.toContainText("%");
          await expect(progress.locator(".goal-progress-excluded")).toHaveText(
            "İptal edildi",
          );
        }
        await preview
          .getByRole("button", {
            name: type === "daily" ? "Vazgeç" : "Kapat",
            exact: true,
          })
          .click();
        await expect(preview).not.toBeVisible();
        await expect(title).toHaveCSS("text-decoration-line", /line-through/);
      } else if (original.status === "completed") {
        await expect(title).not.toHaveCSS(
          "text-decoration-line",
          /line-through/,
        );
        if (type !== "meeting") {
          const mark = row(page, original.id).locator(
            ".completion-mark.is-completed",
          );
          await expect(mark).toHaveAttribute("role", "img");
          await expect(mark.locator("svg path")).toHaveAttribute(
            "d",
            "m5 12 4 4L19 6",
          );
        }
      }
      if (type === "meeting") {
        await expect(
          row(page, original.id).locator(".meeting-archive-control"),
        ).toHaveCount(0);
        await expect(
          row(page, original.id).locator(".status-col > .status-trigger"),
        ).toHaveText("Kapandı");
      }
    }
  }
  expect(await readRecords(page)).toEqual(originals);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    before,
  );
});

test("quick completion pauses a running daily timer without changing the journal and undo preserves the paused time", async ({
  page,
}) => {
  const original = record("daily", { workLog: [oldLog] });
  await seed(page, [original]);
  await openList(page, "daily");
  await row(page, original.id).locator(".work-start").click();
  await page.clock.fastForward(30_000);
  await expect(page.locator("#work-session-panel")).toHaveAttribute(
    "data-phase",
    "running",
  );
  await row(page, original.id).locator(".quick-complete").click();
  await expect(page.locator("#work-session-panel")).not.toBeVisible();
  const session = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SESSION_KEY,
  );
  expect(session.currentId).toBeNull();
  expect(session.entries[0]).toMatchObject({
    recordId: original.id,
    status: "paused",
    elapsedMs: 30_000,
    startedAt: null,
    ownerId: null,
  });
  expect((await readRecords(page))[0].workLog).toEqual([oldLog]);
  await undo(page);
  expect(await readRecords(page)).toEqual([original]);
  await expect(row(page, original.id).locator(".work-start")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(page.locator("#work-session-panel")).not.toBeVisible();
  await page.clock.fastForward(60_000);
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SESSION_KEY,
  );
  expect(after.entries[0].elapsedMs).toBe(30_000);
});
