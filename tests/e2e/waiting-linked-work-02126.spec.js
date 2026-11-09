import {
  readWorkspaceDomainRaw,
  readEffectiveWorkSession,
} from "./work-session-support.js";
import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T09:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const panel = (page) => page.locator("#waiting-record-panel");
const body = (page) => panel(page).locator(".waiting-record-body");
const children = (page) =>
  panel(page).locator('[data-waiting-section="children"]');
const child = (page, id) =>
  children(page).locator(`.waiting-record-child[data-id="${id}"]`);
const attachForm = (page) => panel(page).locator("#waiting-link-daily-form");
const attachSelect = (page) => panel(page).locator("#waiting-link-daily");
const saved = (page) => readWorkspaceDomainRaw(page);
const stored = async (page) => JSON.parse(await saved(page));
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const make = (values) =>
  createRecord({ createdAt: STAMP, updatedAt: STAMP, ...values });
const sourceFields = (id) => ({
  __followupSource: { recordId: id, type: "waiting" },
});
const linked = (records, id = "waiting") =>
  records.filter(
    (record) =>
      record.type === "daily" &&
      record.sourceFields.__followupSource?.recordId === id,
  );

function fixture() {
  const log = {
    id: "old-session",
    date: "2026-11-01",
    endedAt: STAMP,
    durationMs: 61_234,
    note: "Korunacak geçmiş çalışma",
    nextAction: "Özgün oturum adımı",
  };
  const preserved = {
    parentId: "goal",
    workContext: "",
    priority: "high",
    sourceDate: "2026-10-20",
    nextAction: "Kullanıcının sonraki adımı",
    projectCode: "ÖZGÜN-42",
    workType: "Teknik inceleme",
    workLog: [log],
  };
  return [
    make({
      id: "waiting",
      type: "waiting",
      title: "Birden çok işi olan dış yanıt",
      status: "waiting_response",
      nextFollowUpDate: "2026-11-10",
      sourceDate: "2026-11-01",
      latestUpdate: "Özgün dış yanıt durumu",
      description: Array.from(
        { length: 35 },
        (_, i) => `${i + 1}. Korunacak uzun kaynak açıklaması.`,
      ).join("\n"),
      sourceFields: { original: { values: ["kaynak", 7] } },
    }),
    make({
      id: "other-waiting",
      type: "waiting",
      title: "Başka dış yanıt",
      status: "follow_up",
    }),
    make({
      id: "closed-waiting",
      type: "waiting",
      title: "Kapalı dış yanıt",
      status: "completed",
    }),
    make({
      id: "goal",
      type: "weekly",
      title: "Korunacak haftalık hedef",
      periodKey: "2026-W46",
      targetValue: 10,
      currentValue: 2,
      metric: "Rapor",
    }),
    make({
      ...preserved,
      id: "linked-a",
      title: "İlk kaydedilmiş bağlı iş",
      status: "in_progress",
      dueDate: "2026-11-12",
      description:
        "<img src=x onerror=window.linkedInjected=1> Özgün günlük not",
      sourceFields: {
        retained: { value: "iş ham alanı" },
        ...sourceFields("waiting"),
      },
    }),
    make({
      id: "linked-b",
      title: "Daha yakın teslimli bağlı iş",
      status: "planned",
      dueDate: "2026-11-10",
      sourceFields: sourceFields("waiting"),
    }),
    make({
      id: "linked-closed",
      title: "Tamamlanmış bağlı iş",
      status: "completed",
      dueDate: "2026-11-08",
      sourceFields: sourceFields("waiting"),
    }),
    make({
      id: "linked-cancelled",
      title: "İptal edilmiş bağlı iş",
      status: "cancelled",
      dueDate: "2026-11-07",
      sourceFields: sourceFields("waiting"),
    }),
    make({
      ...preserved,
      id: "free",
      title: "Bağlanacak özgün günlük iş",
      status: "in_progress",
      dueDate: "2026-11-14",
      sourceFields: { retained: { original: "aynen korunur" } },
    }),
    make({
      id: "busy",
      title: "Başka kaynağa bağlı iş",
      sourceFields: sourceFields("other-waiting"),
    }),
    make({
      id: "closed-source-job",
      title: "Kapalı kaynağın son günlük işi",
      sourceFields: sourceFields("closed-waiting"),
      workLog: [log],
    }),
  ];
}

async function seed(page, context) {
  const records = fixture();
  const raw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact", theme: "light" },
      history: [],
    },
  });
  await context.clock.setFixedTime(NOW);
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
      window.waitingLinkQuota = false;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (
          this === window.localStorage &&
          name === key &&
          window.waitingLinkQuota
        )
          throw new DOMException("Test depolaması dolu", "QuotaExceededError");
        return set.call(this, name, value);
      };
    },
    { key: KEY, raw },
  );
  await page.goto("/");
  return { records, raw };
}
async function navigate(page, type) {
  const toggle = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.locator(`#nav [data-view="${type}"]`).click();
}
async function open(page, id = "waiting", { all = false } = {}) {
  if (await panel(page).isVisible())
    await panel(page)
      .getByRole("button", { name: "Kapat", exact: true })
      .click();
  await navigate(page, "waiting");
  if (all)
    await page.locator('[data-action="list-scope"][data-scope="all"]').click();
  await page
    .locator(`.waiting-table [data-record-row][data-id="${id}"] .task-name`)
    .click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-record-id", id);
}
async function revealChildren(page) {
  await children(page)
    .locator('[data-waiting-section-heading="children"]')
    .scrollIntoViewIfNeeded();
}
async function attach(page, id = "free", { duplicate = false } = {}) {
  await attachSelect(page).selectOption(id);
  if (duplicate)
    await attachForm(page).evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
  else
    await attachForm(page)
      .getByRole("button", { name: "Bağla", exact: true })
      .click();
}
async function closeEditor(page) {
  await page
    .locator("#editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}
function attached(records, id = "free", source = "waiting") {
  return records.map((record) =>
    record.id === id
      ? {
          ...record,
          sourceFields: { ...record.sourceFields, ...sourceFields(source) },
          updatedAt: NOW.toISOString(),
        }
      : record,
  );
}

test("waiting details show every open and closed daily step and preserve exact context through notes, timers, record handoff and completion Undo", async ({
  page,
  context,
}) => {
  const { records, raw } = await seed(page, context);
  await open(page);
  expect(await body(page).evaluate((element) => element.scrollTop)).toBe(0);
  await revealChildren(page);
  await expect(children(page).locator(".waiting-record-child")).toHaveCount(4);
  await expect(children(page).locator("h3 small")).toHaveText("4");
  expect(
    await children(page)
      .locator(".waiting-record-child")
      .evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.dataset.id)),
  ).toEqual(["linked-b", "linked-a"]);
  for (const id of [
    "linked-a",
    "linked-b",
    "linked-closed",
    "linked-cancelled",
  ]) {
    await expect(child(page, id).locator(".goal-child-title")).toBeVisible();
    await expect(child(page, id).locator(".goal-child-meta")).toContainText(
      id === "linked-closed"
        ? "Tamamlandı"
        : id === "linked-cancelled"
          ? "İptal"
          : id === "linked-b"
            ? "Yapılacak"
            : "Devam ediyor",
    );
    await expect(
      child(page, id).locator('[data-action="waiting-record-unlink-daily"]'),
    ).toBeVisible();
    await expect(child(page, id).locator(".work-start")).toHaveCount(1);
  }
  await expect(
    child(page, "linked-a").locator(".quick-complete"),
  ).toBeEnabled();
  await expect(
    child(page, "linked-a").locator(".goal-child-meta"),
  ).toContainText("12 Kas");
  await expect(
    child(page, "linked-b").locator(".goal-child-meta"),
  ).toContainText("10 Kas");
  await expect(
    child(page, "linked-a").locator('[data-action="work-journal"]'),
  ).toHaveCount(1);
  await expect(
    child(page, "linked-closed").locator(".work-start"),
  ).toBeDisabled();
  await expect(
    child(page, "linked-cancelled").locator(".completion-mark.is-cancelled"),
  ).toHaveCount(1);
  const title = child(page, "linked-a").locator(
    '[data-action="waiting-record-open-daily"]',
  );
  await title.scrollIntoViewIfNeeded();
  const scroll = await body(page).evaluate((element) => element.scrollTop);
  await title.click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "linked-a",
  );
  await closeEditor(page);
  await expect(panel(page)).toBeVisible();
  await expect(title).toBeFocused();
  expect(await body(page).evaluate((element) => element.scrollTop)).toBeCloseTo(
    scroll,
    0,
  );
  await child(page, "linked-a").locator('[data-action="record-note"]').click();
  await expect(
    page.locator('#record-note-editor [name="description"]'),
  ).toHaveValue(records.find((record) => record.id === "linked-a").description);
  await expect(page.locator("#record-note-editor img")).toHaveCount(0);
  await page
    .locator("#record-note-editor")
    .getByRole("button", { name: "Vazgeç", exact: true })
    .click();
  await child(page, "linked-a").locator(".work-start").click();
  await expect(child(page, "linked-a").locator(".work-start")).toHaveAttribute(
    "data-phase",
    "running",
  );
  expect((await readEffectiveWorkSession(page)).currentId).toBe("linked-a");
  await child(page, "linked-a").locator(".work-start").click();
  await expect(child(page, "linked-a").locator(".work-start")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  expect(await saved(page)).toBe(raw);
  await child(page, "linked-a").locator('[data-action="status-menu"]').click();
  await page
    .locator('#status-menu [data-action="set-status"][data-status="planned"]')
    .click();
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === "linked-a"
        ? { ...record, status: "planned", updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await child(page, "linked-a").locator('[data-action="edit-date"]').click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toHaveAttribute("data-selection-mode", "direct");
  await picker.locator('[data-date-day="2026-11-13"]').click();
  await expect(picker).not.toBeVisible();
  await expect(panel(page)).toBeVisible();
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === "linked-a"
        ? { ...record, dueDate: "2026-11-13", updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await child(page, "linked-a").locator(".quick-complete").click();
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === "linked-a"
        ? { ...record, status: "completed", updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  const oneCompleted = await saved(page);
  await child(page, "linked-b").locator(".quick-complete").click();
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      ["linked-a", "linked-b"].includes(record.id)
        ? { ...record, status: "completed", updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  await undo(page);
  expect(await saved(page)).toBe(oneCompleted);
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await open(page, "closed-waiting", { all: true });
  await expect(children(page).locator(".waiting-record-child")).toHaveCount(1);
  await expect(
    children(page).locator(
      '[data-action="waiting-record-create-daily"], #waiting-link-daily-form',
    ),
  ).toHaveCount(0);
  await expect(
    child(page, "closed-source-job").locator(
      '[data-action="waiting-record-unlink-daily"]',
    ),
  ).toBeVisible();
  expect(await saved(page)).toBe(raw);
});

test("an explicit waiting step creates a new daily record while the legacy route still reuses its first linked job", async ({
  page,
  context,
}) => {
  const { records, raw } = await seed(page, context);
  await open(page);
  await revealChildren(page);
  await children(page)
    .locator('[data-action="waiting-record-create-daily"]')
    .click();
  const form = page.locator("#record-form");
  await expect(form).toHaveAttribute("data-creation", "true");
  await expect(form.locator('[name="type"]')).toHaveValue("daily");
  await expect(form.locator('[name="title"]')).toHaveValue("");
  await expect(form.locator('[name="dueDate"]')).toHaveValue("");
  await form.locator('[name="title"]').fill("Zamansız iptal edilen adım");
  page.once("dialog", (dialog) => dialog.accept());
  await closeEditor(page);
  expect(await saved(page)).toBe(raw);
  await children(page)
    .locator('[data-action="waiting-record-create-daily"]')
    .click();
  await form
    .locator('[name="title"]')
    .fill("Bekleyen konu için ikinci yeni adım");
  await form.locator('[name="parentId"]').selectOption("goal");
  await form.locator('[name="dueDate"]').fill("15.11.2026");
  await form.locator('[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  const after = await stored(page);
  const fresh = after.records.find(
    (record) => !records.some((original) => original.id === record.id),
  );
  expect(fresh).toMatchObject({
    type: "daily",
    title: "Bekleyen konu için ikinci yeni adım",
    parentId: "goal",
    dueDate: "2026-11-15",
    status: "planned",
    sourceFields: sourceFields("waiting"),
  });
  expect(
    after.records.filter((record) =>
      records.some((original) => original.id === record.id),
    ),
  ).toEqual(records);
  expect(linked(after.records)).toHaveLength(5);
  expect(after.odak.history).toHaveLength(1);
  await expect(panel(page)).toBeVisible();
  await expect(child(page, fresh.id)).toBeVisible();
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await page
    .locator('.waiting-table [data-id="waiting"] .daily-source-control')
    .click();
  await expect(page.locator('#record-form [name="id"]')).toHaveValue(
    "linked-a",
  );
  expect(await saved(page)).toBe(raw);
  await closeEditor(page);
});

test("attach and unlink are single reversible changes that retain goals, lifecycle, dates, raw context and millisecond work logs", async ({
  page,
  context,
}) => {
  const { records, raw } = await seed(page, context);
  await open(page);
  await revealChildren(page);
  expect(
    await attachSelect(page)
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(["", "free"]);
  await attach(page, "free", { duplicate: true });
  await expect(child(page, "free")).toBeVisible();
  const withLink = await saved(page);
  expect((await stored(page)).records).toEqual(attached(records));
  expect((await stored(page)).odak.history).toHaveLength(1);
  expect(
    (await stored(page)).records.find((record) => record.id === "free")
      .workLog[0].durationMs,
  ).toBe(61_234);
  await child(page, "free")
    .locator('[data-action="waiting-record-unlink-daily"]')
    .click();
  await expect(child(page, "free")).toHaveCount(0);
  expect((await stored(page)).records).toEqual(
    records.map((record) =>
      record.id === "free"
        ? { ...record, updatedAt: NOW.toISOString() }
        : record,
    ),
  );
  expect((await stored(page)).odak.history).toHaveLength(2);
  await undo(page);
  expect(await saved(page)).toBe(withLink);
  await undo(page);
  expect(await saved(page)).toBe(raw);
  await open(page, "closed-waiting", { all: true });
  await child(page, "closed-source-job")
    .locator('[data-action="waiting-record-unlink-daily"]')
    .click();
  await expect(children(page).locator(".waiting-record-child")).toHaveCount(0);
  expect(
    (await stored(page)).records.find(
      (record) => record.id === "closed-waiting",
    ),
  ).toEqual(records.find((record) => record.id === "closed-waiting"));
  expect(
    (await stored(page)).records.find(
      (record) => record.id === "closed-source-job",
    ),
  ).toEqual({
    ...records.find((record) => record.id === "closed-source-job"),
    sourceFields: {},
    updatedAt: NOW.toISOString(),
  });
  await undo(page);
  expect(await saved(page)).toBe(raw);
});

test("failed attach and unlink keep the current panel and selected draft retryable without a partial record or history write", async ({
  page,
  context,
}) => {
  const { records, raw } = await seed(page, context);
  await open(page);
  await revealChildren(page);
  await attachSelect(page).selectOption("free");
  await page.evaluate(() => {
    window.waitingLinkQuota = true;
  });
  await attachForm(page)
    .getByRole("button", { name: "Bağla", exact: true })
    .click();
  await expect(panel(page).locator("#waiting-link-daily-error")).toContainText(
    /kaydedilemedi|dolu/i,
  );
  await expect(attachSelect(page)).toHaveValue("free");
  expect(await saved(page)).toBe(raw);
  await expect(panel(page)).toHaveAttribute("data-record-id", "waiting");
  await page.evaluate(() => {
    window.waitingLinkQuota = false;
  });
  await attachForm(page)
    .getByRole("button", { name: "Bağla", exact: true })
    .click();
  await expect(child(page, "free")).toBeVisible();
  const attachedRaw = await saved(page);
  expect((await stored(page)).records).toEqual(attached(records));
  expect((await stored(page)).odak.history).toHaveLength(1);
  await page.evaluate(() => {
    window.waitingLinkQuota = true;
  });
  await child(page, "free")
    .locator('[data-action="waiting-record-unlink-daily"]')
    .click();
  await expect(
    panel(page).locator("#waiting-unlink-daily-error"),
  ).toContainText(/kaldırılamadı|dolu/i);
  await expect(child(page, "free")).toBeVisible();
  expect(await saved(page)).toBe(attachedRaw);
  await page.evaluate(() => {
    window.waitingLinkQuota = false;
  });
  await child(page, "free")
    .locator('[data-action="waiting-record-unlink-daily"]')
    .click();
  await expect(child(page, "free")).toHaveCount(0);
  await undo(page);
  expect(await saved(page)).toBe(attachedRaw);
  await undo(page);
  expect(await saved(page)).toBe(raw);
});

test("external edits compose with an eligible attach draft while a target linked elsewhere cannot be stolen by a stale panel", async ({
  page,
  context,
}) => {
  const { raw } = await seed(page, context);
  await open(page);
  await revealChildren(page);
  await attachSelect(page).selectOption("free");
  const other = await context.newPage();
  await other.goto("/");
  await navigate(other, "daily");
  await other
    .locator('.full-table [data-record-row][data-id="free"] .task-name')
    .click();
  await other
    .locator('#record-form [name="title"]')
    .fill("Diğer pencerede düzeltilmiş özgün iş");
  await other.locator('#record-form [type="submit"]').click();
  const external = await saved(other);
  await expect.poll(() => saved(page)).toBe(external);
  await expect(attachSelect(page).locator('option[value="free"]')).toHaveText(
    "Diğer pencerede düzeltilmiş özgün iş",
  );
  await expect(attachSelect(page)).toHaveValue("free");
  await attachForm(page)
    .getByRole("button", { name: "Bağla", exact: true })
    .click();
  await expect(child(page, "free")).toBeVisible();
  expect((await stored(page)).records).toEqual(
    attached(JSON.parse(external).records),
  );
  await undo(page);
  expect(await saved(page)).toBe(external);
  await attachSelect(page).selectOption("free");
  await open(other, "other-waiting");
  await revealChildren(other);
  await attach(other, "free");
  await expect(child(other, "free")).toBeVisible();
  const linkedElsewhere = await saved(other);
  await expect.poll(() => saved(page)).toBe(linkedElsewhere);
  await expect(attachSelect(page).locator('option[value="free"]')).toHaveCount(
    0,
  );
  const submit = attachForm(page).getByRole("button", {
    name: "Bağla",
    exact: true,
  });
  if (await submit.isEnabled()) {
    await submit.click();
    await expect(
      panel(page).locator("#waiting-link-daily-error"),
    ).toContainText(/uygun|bağl/i);
  } else await expect(submit).toBeDisabled();
  expect(await saved(page)).toBe(linkedElsewhere);
  expect(
    (await stored(page)).records.find((record) => record.id === "free")
      .sourceFields.__followupSource,
  ).toEqual({ recordId: "other-waiting", type: "waiting" });
  expect(
    (await stored(page)).records.find((record) => record.id === "waiting"),
  ).toEqual(JSON.parse(raw).records.find((record) => record.id === "waiting"));
});
