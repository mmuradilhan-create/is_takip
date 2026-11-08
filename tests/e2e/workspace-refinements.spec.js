import { selectListStatus } from "./list-scope-helper.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const START = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";

function fixture() {
  const record = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    record({
      id: "refine-weekly",
      type: "weekly",
      title: "Kontrol haftalık hedefi",
      periodKey: "2026-W45",
      priority: "high",
      targetValue: 10,
      currentValue: 4,
      metric: "Rapor",
    }),
    record({
      id: "refine-next-weekly",
      type: "weekly",
      title: "Kontrol sonraki haftalık hedefi",
      periodKey: "2026-W46",
      priority: "normal",
    }),
    record({
      id: "refine-primary",
      title: "Kontrol belgelerini incele ve tasarım değerlendirmesini hazırla",
      parentId: "refine-weekly",
      status: "in_progress",
      priority: "normal",
      dueDate: "2026-11-06",
      nextAction: "Mevcut sonraki adım korunmalı.",
      description:
        "Kullanıcının gerçek notu başlık yardımıyla birlikte silinmemeli.",
      sourceFields: { "Özgün kayıt": { value: "Korunacak kaynak bilgisi" } },
      workLog: [
        {
          id: "refine-saved-log",
          date: "2026-11-07",
          endedAt: "2026-11-07T09:00:00.000Z",
          durationMs: 60_000,
          note: "Korunacak çalışma sonucu",
          nextAction: "Önceki sonraki adım",
        },
      ],
    }),
    record({
      id: "refine-second",
      title: "Kontrol toplantı kararlarını değerlendir",
      status: "waiting",
      priority: "high",
      dueDate: "2026-11-11",
      parentId: "refine-weekly",
    }),
    record({
      id: "refine-ad-hoc",
      title: "Kontrol anlık taleplerini değerlendir",
      workContext: "ad_hoc",
      priority: "urgent",
      dueDate: "2026-11-10",
    }),
    record({
      id: "refine-today",
      title: "Kontrol bugünkü teslimi hazırla",
      priority: "low",
      dueDate: "2026-11-07",
    }),
    record({
      id: "refine-completed",
      title: "Kontrol tamamlanmış kayıt",
      status: "completed",
      dueDate: "2026-11-05",
    }),
    record({
      id: "refine-meeting",
      type: "meeting",
      title: "Kontrol toplantı takibi",
    }),
    record({
      id: "refine-waiting",
      type: "waiting",
      title: "Kontrol yanıt takibi",
      status: "waiting_response",
    }),
  ];
}

async function seed(page) {
  const records = fixture();
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("workspace-refinements-seeded")) return;
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
      localStorage.removeItem(`${key}-work-session`);
      sessionStorage.setItem("workspace-refinements-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const records = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const navigate = (page, type) =>
  page.locator(`#nav [data-view="${type}"]`).click();
const focus = (page, id = "refine-primary") =>
  page.locator(`.focus-row[data-id="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

test("dashboard priority and delivery controls edit only their field and undo preserves the whole task", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.locator("#settings-dialog #list-density")).toHaveCount(0);
  await expect(
    page.locator("#settings-dialog .settings-theme-choice"),
  ).toHaveCount(3);
  await page.keyboard.press("Escape");
  expect(await saved(page)).toBe(before);
  const primary = focus(page);
  await expect(primary.locator(".focus-priority .priority-flag")).toHaveCount(
    1,
  );
  await primary.locator(".inline-priority").click();
  const priorityMenu = page.locator("#priority-menu");
  await expect(priorityMenu).toBeVisible();
  await expect(priorityMenu.locator(".priority-option-label svg")).toHaveCount(
    0,
  );
  await expect(priorityMenu.locator(".quick-field-check svg")).toHaveCount(1);
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(priorityMenu).not.toBeVisible();
  const changed = await records(page);
  const changedPrimary = changed.find(
    (record) => record.id === "refine-primary",
  );
  const originalPrimary = original.find(
    (record) => record.id === "refine-primary",
  );
  expect(changedPrimary.priority).toBe("high");
  expect({
    ...changedPrimary,
    priority: originalPrimary.priority,
    updatedAt: originalPrimary.updatedAt,
  }).toEqual(originalPrimary);
  expect(changed.filter((record) => record.id !== "refine-primary")).toEqual(
    original.filter((record) => record.id !== "refine-primary"),
  );
  await undo(page);
  expect(await records(page)).toEqual(original);

  await primary.locator(".inline-date").click();
  const dateMenu = page.locator("#due-date-menu");
  await expect(dateMenu).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await dateMenu.locator('[name="dueDate"]').fill("10.11.2026");
  await dateMenu.locator(".date-picker-toggle").click();
  await page.locator('#odak-date-picker [data-date-day="2026-11-10"]').click();
  await expect(dateMenu).toBeVisible();
  await dateMenu.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(primary.locator(".inline-date")).toHaveClass(/due-soon/);
  await expect(page.locator("#editor")).not.toBeVisible();
  const afterDate = await records(page);
  const dated = afterDate.find((record) => record.id === "refine-primary");
  expect(dated.dueDate).toBe("2026-11-10");
  expect({
    ...dated,
    dueDate: originalPrimary.dueDate,
    updatedAt: originalPrimary.updatedAt,
  }).toEqual(originalPrimary);
  await undo(page);
  expect(await records(page)).toEqual(original);
});

test("simplified copy keeps real notes and list filters reset without touching records or the global search", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  await expect(
    page.locator(
      "#page-subtitle, .stat-foot, .followup-order, .focus-sort-note",
    ),
  ).toHaveCount(0);
  await expect(page.locator("#focus-sort")).toHaveCount(0);
  await focus(page).locator(".focus-title").click();
  await openCreationExtras(page);
  await expect(page.locator('#record-form [name="description"]')).toHaveValue(
    original.find((record) => record.id === "refine-primary").description,
  );
  await page.locator('#editor [data-action="close"]').last().click();
  await navigate(page, "daily");
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  await expect(page.locator(".filter-control .filter-caption")).toHaveText([
    "İş grubu",
    "Durum",
    "Öncelik",
    "Termin",
  ]);
  await selectListStatus(page, "completed");
  await expect(page.locator("#status-filter")).toHaveCount(0);
  await expect(
    page.locator('[data-action="list-scope"][data-scope="completed"]'),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .locator(".full-table tbody tr[data-record-row]")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id)),
  ).toEqual(["refine-completed"]);
  expect(await saved(page)).toBe(before);
  await selectListStatus(page, "active");
  await expect(page.locator("#status-filter")).toHaveValue("all");
  await expect(page.locator(".clear-filters")).toHaveCount(0);
  expect(
    await page.locator(".full-table tbody tr[data-record-row]").count(),
  ).toBe(4);
  expect(await saved(page)).toBe(before);
  await page.locator("#global-search").fill("Kontrol");
  await page.locator("#work-context-filter").selectOption("ad_hoc");
  await page.locator("#status-filter").selectOption("waiting");
  await page.locator("#priority-filter").selectOption("urgent");
  await page.locator("#period-filter").selectOption("today");
  await expect(page.locator(".filter-control.is-active")).toHaveCount(4);
  await expect(page.locator(".clear-filters")).toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.locator('[data-action="clear-filters"]').click();
  await expect(page.locator("#work-context-filter")).toHaveValue("all");
  await expect(page.locator("#status-filter")).toHaveValue("all");
  await expect(page.locator("#priority-filter")).toHaveValue("all");
  await expect(page.locator("#period-filter")).toHaveValue("all");
  await expect(page.locator("#global-search")).toHaveValue("Kontrol");
  await expect(
    page.locator(".clear-filters, .filter-control.is-active"),
  ).toHaveCount(0);
  expect(
    await page.locator(".full-table tbody tr[data-record-row]").count(),
  ).toBe(4);
  expect(await saved(page)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Geri al", exact: true }),
  ).toBeDisabled();

  await page.locator("#period-filter").selectOption("soon");
  expect(
    await page
      .locator(".full-table tbody tr[data-record-row]")
      .evaluateAll((rows) => rows.map((row) => row.dataset.id)),
  ).toEqual(["refine-ad-hoc", "refine-today"]);
  await page.locator('[data-action="clear-filters"]').click();
  await expect(page.locator("#period-filter")).toHaveValue("all");
  expect(await saved(page)).toBe(before);

  await navigate(page, "weekly");
  await expect(page.locator(".filter-control .filter-caption")).toHaveText([
    "Durum",
    "Öncelik",
    "Termin",
  ]);
  await page.locator('[data-action="period-current"]').click();
  await page.locator("#priority-filter").selectOption("high");
  await expect(page.locator(".clear-filters")).toBeVisible();
  await page.locator('[data-action="clear-filters"]').click();
  await expect(page.locator("#planning-period-label")).toHaveText(
    /2\s*[–-]\s*8 Kasım 2026/,
  );
  await expect(page.locator("#priority-filter")).toHaveValue("all");
  await expect(page.locator("#global-search")).toHaveValue("Kontrol");
  expect(await page.locator(".weekly-goal-row").count()).toBe(1);
  expect(await saved(page)).toBe(before);
});

test("sidebar journal keeps idle compact and active controls bounded without covering navigation on short PC windows", async ({
  page,
}) => {
  const original = await seed(page);
  const originalBytes = await saved(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1280, height: 600 },
    { width: 1280, height: 400 },
    { width: 850, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await navigate(page, "dashboard");
    const journal = page.locator("#sidebar-work-journal");
    const idle = await journal.boundingBox();
    expect(idle.height).toBeLessThanOrEqual(110);
    await expect(journal.locator(".sidebar-journal-idle")).toHaveCount(0);
    await focus(page).locator(".work-start").click();
    const active = await journal.boundingBox();
    expect(active.height).toBeGreaterThan(idle.height + 30);
    expect(active.y + active.height).toBeCloseTo(idle.y + idle.height, 1);
    await expect(journal.locator("#work-session-time")).toHaveText("00:00");
    const nav = await page.locator("#nav").boundingBox();
    expect(nav.y + nav.height).toBeLessThanOrEqual(active.y + 1);
    expect(active.y + active.height).toBeLessThanOrEqual(viewport.height);
    for (const link of await page.locator("#nav [data-view]").all())
      await expect(link).toBeInViewport({ ratio: 1 });
    await expect(journal.locator("#work-session-panel")).toBeVisible();
    await expect(
      journal.locator('[aria-label="Oturumu bitir"]'),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await page
        .locator(".sidebar")
        .evaluate((element) => element.scrollHeight === element.clientHeight),
    ).toBe(true);
    await page.clock.fastForward(5000);
    await journal
      .getByRole("button", { name: "Oturumu bitir", exact: true })
      .click();
    await page
      .locator("#work-finish-dialog")
      .getByRole("button", { name: "Kaydet ve bitir", exact: true })
      .click();
    await expect(page.locator("#work-finish-dialog")).not.toBeVisible();
    const changed = (await records(page)).find(
      (record) => record.id === "refine-primary",
    );
    expect(changed.workLog.at(-1).durationMs).toBe(5000);
    expect(changed.workLog.slice(0, -1)).toEqual(
      original.find((record) => record.id === "refine-primary").workLog,
    );
    await undo(page);
    expect(await records(page)).toEqual(original);
    expect(await saved(page)).toBe(originalBytes);
  }
});
