import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const STAMP = "2026-10-20T09:00:00.000Z";
const TYPES = ["daily", "weekly", "monthly", "yearly", "meeting", "waiting"];
const form = (page) => page.locator("#editor #record-form");
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const store = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const list = (page, type) => page.locator(`#nav [data-view="${type}"]`).click();
const row = (page, id) =>
  page.locator(`.full-table > tbody > tr[data-record-row][data-id="${id}"]`);
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();
const close = (page) =>
  page
    .locator(
      '#editor [data-action="close"], #editor [data-action="creation-close"]',
    )
    .last()
    .click();

function fixture() {
  const record = (input) =>
    createRecord({ createdAt: STAMP, updatedAt: STAMP, ...input });
  return [
    record({
      id: "creation-year",
      type: "yearly",
      title: "Mevcut senelik hedef",
      periodKey: "2026",
    }),
    record({
      id: "creation-month",
      type: "monthly",
      title: "Mevcut aylık hedef",
      periodKey: "2026-11",
      goalParentId: "creation-year",
    }),
    record({
      id: "creation-week",
      type: "weekly",
      title: "Mevcut haftalık hedef",
      periodKey: "2026-W45",
      goalParentId: "creation-month",
      dueDate: "2026-11-08",
    }),
    record({
      id: "creation-existing",
      title: "Korunacak mevcut günlük iş",
      status: "waiting",
      parentId: "creation-week",
      priority: "high",
      sourceDate: "2026-10-20",
      dueDate: "2026-11-10",
      focusDate: "2026-11-05",
      owner: "Mevcut sorumlu",
      waitingReason: "Tasarım yanıtı bekleniyor.",
      nextAction: "Yanıtı kontrol et.",
      description: "Kullanıcının gerçek notu korunmalı.",
      projectCode: "ÖZGÜN-42",
      category: "Özgün kategori",
      workType: "Teknik inceleme",
      metric: "Eski ölçü",
      targetValue: 7,
      currentValue: 3,
      sourceFields: { "Özgün kayıt": { value: "Ham veri korunmalı" } },
      workLog: [
        {
          id: "creation-old-log",
          date: "2026-10-20",
          endedAt: "2026-10-20T09:00:00.000Z",
          durationMs: 90_000,
          note: "Gerçek geçmiş sonucu.",
          nextAction: "Eski sonraki adım.",
        },
      ],
    }),
    record({
      id: "creation-meeting",
      type: "meeting",
      title: "Mevcut toplantı kararı",
      decision: "Özgün karar korunur.",
    }),
    record({
      id: "creation-waiting",
      type: "waiting",
      title: "Mevcut bekleyen konu",
      expectedFrom: "Dış ekip",
      nextFollowUpDate: "2026-11-13",
    }),
  ];
}

async function seed(page, records = fixture()) {
  await page.clock.install({
    // Start a second early so pausing at NOW never has to rewind.
    time: new Date(new Date(NOW).getTime() - 1000),
  });
  await page.clock.pauseAt(NOW);
  await page.addInitScript(
    ({ key, records }) => {
      if (sessionStorage.getItem("record-creation-019-seeded")) return;
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
      sessionStorage.setItem("record-creation-019-seeded", "1");
    },
    { key: KEY, records },
  );
  await page.goto("/");
  return records;
}

async function openCreation(page, type = "daily") {
  await list(page, type);
  await page.locator(".topbar .new-record").click();
  await expect(form(page)).toHaveAttribute("data-creation", "true");
  await expect(form(page).locator('select[name="type"]')).toHaveValue(type);
}

async function advanced(page) {
  const details = form(page).locator("details.creation-advanced");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
  return details;
}

async function save(page) {
  await form(page)
    .getByRole("button", { name: "Kaydı ekle", exact: true })
    .click();
  await expect(page.locator("#editor")).not.toBeVisible();
}

async function createdByTitle(page, title) {
  return (await store(page)).records.find((record) => record.title === title);
}

test("all six creation forms expose a short optional workflow and save title-only records with honest defaults", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seed(page);
  const before = await saved(page);
  for (const type of TYPES) {
    await openCreation(page, type);
    const extra = form(page).locator("details.creation-advanced");
    await expect(extra.locator("summary")).toContainText("Ek bilgiler");
    expect(await extra.evaluate((element) => element.open)).toBe(false);
    expect(
      await form(page).evaluate((element) =>
        Boolean(
          element
            .querySelector(".creation-main-fields")
            .compareDocumentPosition(
              element.querySelector("details.creation-advanced"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await expect(field(page, "title")).toBeVisible();
    await expect(
      form(page).getByRole("button", { name: "Kaydı ekle", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await form(page)
        .locator("input[required],select[required],textarea[required]")
        .evaluateAll((inputs) => inputs.map((input) => input.name)),
    ).toEqual(["title"]);
    if (type === "daily") {
      for (const name of ["dueDate", "priority", "parentId"])
        await expect(field(page, name)).toBeVisible();
      await expect(field(page, "parentId")).toBeEnabled();
      await expect(field(page, "workContext")).not.toBeVisible();
      await advanced(page);
      await expect(field(page, "workContext")).toBeVisible();
      await expect(field(page, "workContext")).toHaveValue("ad_hoc");
      for (const name of ["projectCode", "workType"]) {
        await expect(field(page, name)).toHaveAttribute("type", "hidden");
        await expect(field(page, name)).toBeHidden();
        await expect(field(page, name)).toHaveValue("");
      }
    } else if (["weekly", "monthly", "yearly"].includes(type)) {
      await expect(field(page, "periodYear")).toBeVisible();
      if (type === "weekly")
        await expect(field(page, "periodWeek")).toBeVisible();
      if (type === "monthly")
        await expect(field(page, "periodMonth")).toBeVisible();
      if (type !== "yearly") {
        const deadline = form(page).locator(
          '.creation-main-fields [name="dueDate"]',
        );
        await expect(deadline).toBeVisible();
        await expect(deadline).toBeEnabled();
        await expect(deadline).toHaveValue("");
      }
      await expect(field(page, "numeric")).not.toBeChecked();
      await expect(field(page, "targetValue")).not.toBeVisible();
    } else if (type === "waiting") {
      await expect(field(page, "expectedFrom")).toBeVisible();
      await expect(field(page, "nextFollowUpDate")).toBeVisible();
      await expect(field(page, "lastFollowUpDate")).toHaveCount(0);
      await expect(field(page, "priority")).toHaveAttribute("type", "hidden");
      await expect(field(page, "priority")).toHaveValue("normal");
    } else {
      await expect(field(page, "decision")).toBeVisible();
      await expect(field(page, "dueDate")).toHaveCount(0);
      for (const name of ["owner", "participants"]) {
        await expect(field(page, name)).toHaveAttribute("type", "hidden");
        await expect(field(page, name)).toBeHidden();
        await expect(field(page, name)).toHaveValue("");
      }
      await expect(
        form(page).locator('[data-action="creation-meeting-route"]'),
      ).toHaveCount(3);
    }
    if (["daily", "weekly", "monthly"].includes(type)) {
      const selectId =
        type === "daily" ? "weekly-parent-select" : "higher-goal-select";
      const label = form(page).locator(
        `.creation-parent-heading > label[for="${selectId}"]`,
      );
      const optional = label.locator("small");
      await expect(optional).toHaveText("İsteğe bağlı");
      const geometry = await label.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element.firstChild);
        const text = range.getBoundingClientRect();
        const small = element.querySelector("small").getBoundingClientRect();
        return {
          text: { right: text.right, y: text.y, height: text.height },
          small: { x: small.x, y: small.y, height: small.height },
        };
      });
      expect(geometry.small.x).toBeGreaterThanOrEqual(geometry.text.right);
      expect(
        Math.abs(
          geometry.small.y +
            geometry.small.height / 2 -
            geometry.text.y -
            geometry.text.height / 2,
        ),
      ).toBeLessThanOrEqual(2);
      await expect(form(page).locator(`#${selectId}`)).toBeVisible();
    }
    await advanced(page);
    await expect(field(page, "nextAction")).not.toBeVisible();
    if (["weekly", "monthly", "yearly"].includes(type)) {
      for (const name of ["nextAction", "variance"]) {
        await expect(field(page, name)).toHaveAttribute("type", "hidden");
        await expect(field(page, name)).toHaveValue("");
      }
      if (type !== "yearly") {
        const source = form(page).locator(
          '.creation-advanced [name="sourceDate"]',
        );
        await expect(source).toBeVisible();
        await expect(source).toBeEnabled();
        await expect(source).toHaveValue("07.11.2026");
        const deadline = form(page).locator(
          '.creation-main-fields [name="dueDate"]',
        );
        await expect(deadline).toBeVisible();
        await expect(deadline).toBeEnabled();
        await expect(deadline).toHaveValue("");
      } else await expect(field(page, "dueDate")).toBeHidden();
    }
    expect(await saved(page)).toBe(before);
    const title = `Yalnız başlıkla oluşturulan ${type}`;
    await field(page, "title").fill(title);
    await save(page);
    const created = await createdByTitle(page, title);
    expect(created).toMatchObject({
      type,
      title,
      status: "planned",
      priority: "normal",
      sourceDate: "2026-11-07",
      dueDate: "",
    });
    if (type === "waiting") expect(created.lastFollowUpDate).toBe("");
    if (type === "meeting") {
      expect(created.owner).toBe("");
      expect(created.participants).toBe("");
    }
    if (type === "daily") {
      expect(created.workContext).toBe("ad_hoc");
      expect(created.projectCode).toBe("");
      expect(created.workType).toBe("");
    }
    if (["weekly", "monthly", "yearly"].includes(type)) {
      expect(created.periodKey).toBe(
        { weekly: "2026-W45", monthly: "2026-11", yearly: "2026" }[type],
      );
      expect(created.targetValue).toBeNull();
    }
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
});

test("switching creation types preserves separate drafts including collapsed details, dates and numeric choices without saving", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  await openCreation(page);
  await field(page, "title").fill("Günlük taslak");
  await field(page, "dueDate").fill("12.11.2026");
  await field(page, "parentId").selectOption("creation-week");
  await expect(field(page, "workContext")).toHaveValue("");
  await advanced(page);
  await field(page, "description").fill("Günlük taslak notu");
  await field(page, "sourceDate").fill("06.11.2026");
  await form(page).locator(".creation-advanced > summary").click();
  expect(
    await form(page)
      .locator(".creation-advanced")
      .evaluate((element) => element.open),
  ).toBe(false);
  await form(page).locator('select[name="type"]').selectOption("weekly");
  expect(
    await form(page)
      .locator(".creation-advanced")
      .evaluate((element) => element.open),
  ).toBe(false);
  await field(page, "title").fill("Haftalık taslak");
  await field(page, "periodWeek").selectOption("46");
  await field(page, "numeric").check();
  await field(page, "targetValue").fill("3");
  await field(page, "metric").fill("Rapor");
  await form(page).locator('select[name="type"]').selectOption("waiting");
  await field(page, "title").fill("Dış yanıt taslağı");
  await field(page, "expectedFrom").fill("İPEK tasarım ekibi");
  await field(page, "nextFollowUpDate").fill("14.11.2026");
  await advanced(page);
  await field(page, "latestUpdate").fill("İlk yanıt bekleniyor.");
  await form(page).locator('select[name="type"]').selectOption("daily");
  await expect(field(page, "title")).toHaveValue("Günlük taslak");
  await expect(field(page, "dueDate")).toHaveValue("12.11.2026");
  await expect(field(page, "parentId")).toHaveValue("creation-week");
  for (const name of ["projectCode", "workType"]) {
    await expect(field(page, name)).toHaveAttribute("type", "hidden");
    await expect(field(page, name)).toBeHidden();
    await expect(field(page, name)).toHaveValue("");
  }
  expect(
    await form(page)
      .locator(".creation-advanced")
      .evaluate((element) => element.open),
  ).toBe(false);
  await advanced(page);
  await expect(field(page, "description")).toHaveValue("Günlük taslak notu");
  await expect(field(page, "sourceDate")).toHaveValue("06.11.2026");
  await form(page).locator('select[name="type"]').selectOption("weekly");
  await expect(field(page, "title")).toHaveValue("Haftalık taslak");
  await expect(field(page, "periodWeek")).toHaveValue("46");
  await expect(field(page, "numeric")).toBeChecked();
  await expect(field(page, "targetValue")).toHaveValue("3");
  await expect(field(page, "metric")).toHaveValue("Rapor");
  for (const name of ["nextAction", "variance"]) {
    await expect(field(page, name)).toHaveAttribute("type", "hidden");
    await expect(field(page, name)).toHaveValue("");
  }
  await form(page).locator('select[name="type"]').selectOption("waiting");
  await expect(field(page, "title")).toHaveValue("Dış yanıt taslağı");
  await expect(field(page, "nextFollowUpDate")).toHaveValue("14.11.2026");
  await advanced(page);
  await expect(field(page, "latestUpdate")).toHaveValue(
    "İlk yanıt bekleniyor.",
  );
  await close(page);
  expect(await saved(page)).toBe(before);
});

test("selected goal periods and explicit parent context create the intended hierarchy without inventing deadlines", async ({
  page,
}) => {
  await seed(page);
  await list(page, "monthly");
  await page.locator('[data-action="period-current"]').click();
  await page.locator('[data-action="period-prev"]').click();
  await expect(page.locator("#planning-period-label")).toHaveText("Ekim 2026");
  await page.locator(".topbar .new-record").click();
  await expect(field(page, "periodKey")).toHaveValue("2026-10");
  await expect(field(page, "dueDate")).toHaveValue("");
  await field(page, "title").fill("Seçili ayda yeni hedef");
  await advanced(page);
  await field(page, "goalParentId").selectOption("creation-year");
  await save(page);
  const month = await createdByTitle(page, "Seçili ayda yeni hedef");
  expect(month).toMatchObject({
    type: "monthly",
    periodKey: "2026-10",
    goalParentId: "creation-year",
    dueDate: "",
  });
  await row(page, month.id).locator('[data-action="new-linked"]').click();
  await expect(form(page).locator('select[name="type"]')).toBeDisabled();
  await expect(field(page, "goalParentId")).toHaveValue(month.id);
  await expect(field(page, "periodKey")).toHaveValue("2026-W45");
  await expect(field(page, "dueDate")).toHaveValue("");
  await field(page, "title").fill("Aylık hedefin haftalık adımı");
  await save(page);
  const week = await createdByTitle(page, "Aylık hedefin haftalık adımı");
  expect(week).toMatchObject({
    type: "weekly",
    goalParentId: month.id,
    dueDate: "",
  });
  await list(page, "weekly");
  await row(page, week.id).locator('[data-action="new-linked"]').click();
  await expect(form(page).locator('select[name="type"]')).toBeDisabled();
  await expect(field(page, "parentId")).toHaveValue(week.id);
  await expect(field(page, "dueDate")).toHaveValue("");
  await field(page, "title").fill("Haftalık hedefin günlük adımı");
  await save(page);
  expect(
    await createdByTitle(page, "Haftalık hedefin günlük adımı"),
  ).toMatchObject({ type: "daily", parentId: week.id, dueDate: "" });
});

test("numeric tracking starts at zero while an unmeasured goal derives progress from its completed daily work", async ({
  page,
}) => {
  await seed(page);
  for (const numeric of [false, true]) {
    await openCreation(page, "weekly");
    const title = numeric
      ? "Adetle izlenen yeni hedef"
      : "Günlük işlerle izlenen yeni hedef";
    await field(page, "title").fill(title);
    if (numeric) {
      await field(page, "numeric").check();
      await field(page, "targetValue").fill("2");
      await field(page, "metric").fill("Rapor");
      await advanced(page);
      await expect(field(page, "currentValue")).toHaveValue("0");
    }
    await save(page);
    const goal = await createdByTitle(page, title);
    expect(goal.targetValue).toBe(numeric ? 2 : null);
    if (numeric) expect(goal.currentValue).toBe(0);
    await row(page, goal.id).locator('[data-action="new-linked"]').click();
    await field(page, "title").fill(`${title}: tamamlanmış günlük iş`);
    await advanced(page);
    await field(page, "status").selectOption("completed");
    await save(page);
    await list(page, "weekly");
    await expect(
      row(page, goal.id).locator('[role="progressbar"]'),
    ).toHaveAttribute("aria-valuenow", numeric ? "0" : "100");
    await expect(
      row(page, goal.id).locator(".goal-progress-summary"),
    ).toHaveText(numeric ? "0 / 2" : "1 / 1");
  }
});

test("meeting creation optionally saves no route, one route or both routes atomically without duplicates and one undo restores everything", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  const baseline = (await store(page)).records;
  for (const mode of [null, "daily", "waiting", "both"]) {
    await openCreation(page, "meeting");
    const title = `Yeni toplantı kararı ${mode || "yalnız karar"}`;
    await field(page, "title").fill(title);
    if (mode) {
      await form(page)
        .locator(`[data-action="creation-meeting-route"][data-route="${mode}"]`)
        .click();
      if (mode === "daily" || mode === "both") {
        await field(page, "dailyTitle").fill(`${title}: benim işim`);
        await expect(field(page, "dailyOwner")).not.toBeVisible();
        await field(page, "dailyDueDate").fill("12.11.2026");
        await expect(field(page, "dailyNextAction")).not.toBeVisible();
      }
      if (mode === "waiting" || mode === "both") {
        await field(page, "waitingTitle").fill(`${title}: dış yanıt`);
        await field(page, "expectedFrom").fill("Dış tasarım ekibi");
        await field(page, "nextFollowUpDate").fill("13.11.2026");
        await field(page, "latestUpdate").fill("Yanıtı takip et.");
      }
    }
    expect(await saved(page)).toBe(before);
    await save(page);
    const after = await store(page);
    const source = after.records.find(
      (record) => record.title === title && record.type === "meeting",
    );
    const targets = after.records.filter(
      (record) => record.sourceFields?.__followupSource?.recordId === source.id,
    );
    const types = mode === "both" ? ["daily", "waiting"] : mode ? [mode] : [];
    expect(targets.map((record) => record.type).sort()).toEqual(types);
    expect(source.status).toBe(types.length ? "in_progress" : "planned");
    if (types.includes("daily"))
      expect(targets.find((record) => record.type === "daily")).toMatchObject({
        title: `${title}: benim işim`,
        dueDate: "2026-11-12",
        nextAction: "",
      });
    expect(after.records).toHaveLength(baseline.length + 1 + types.length);
    expect(new Set(after.records.map((record) => record.id)).size).toBe(
      after.records.length,
    );
    expect(after.odak.history).toHaveLength(1);
    const afterSaved = await saved(page);
    await list(page, "meeting");
    await row(page, source.id).locator(".task-name").click();
    const preview = page.locator("#meeting-record-panel");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("data-record-id", source.id);
    expect(await saved(page)).toBe(afterSaved);
    await preview
      .getByRole("button", { name: "Kaydı düzenle", exact: true })
      .click();
    await expect(page.locator("#editor")).toBeVisible();
    await expect(field(page, "id")).toHaveValue(source.id);
    await expect(form(page)).not.toHaveAttribute("data-creation", "true");
    await expect(field(page, "status")).toHaveValue(
      types.length ? "in_progress" : "planned",
    );
    if (types.length) {
      await expect(field(page, "status")).toBeDisabled();
      await expect(
        form(page).locator("#meeting-derived-status-help"),
      ).toContainText("bağlı iş ve takipten");
      for (const type of types)
        await expect(
          form(page).locator(
            `[data-action="open-linked-action"][data-route="${type}"]`,
          ),
        ).toHaveCount(1);
    } else {
      await expect(field(page, "status")).toBeEnabled();
    }
    await close(page);
    expect(await saved(page)).toBe(afterSaved);
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
});

test("calendar presets reach the correct creation date channel and existing edits keep old data after using the new form", async ({
  page,
}) => {
  const original = await seed(page);
  const before = await saved(page);
  for (const type of ["daily", "waiting"]) {
    await list(page, "dashboard");
    const calendar = page.locator(".dashboard-calendar");
    await calendar
      .locator(
        '[data-calendar-action="select-day"][data-calendar-date="2026-11-12"]',
      )
      .click();
    await calendar.locator(".calendar-new-type").selectOption(type);
    await calendar.locator('[data-calendar-action="new-record"]').click();
    await expect(form(page)).toHaveAttribute("data-creation", "true");
    await expect(
      field(page, type === "daily" ? "dueDate" : "nextFollowUpDate"),
    ).toHaveValue("12.11.2026");
    const title = `Takvimden oluşturulan ${type}`;
    await field(page, "title").fill(title);
    await save(page);
    expect(await createdByTitle(page, title)).toMatchObject({
      type,
      sourceDate: "2026-11-07",
      ...(type === "daily"
        ? { dueDate: "2026-11-12" }
        : {
            nextFollowUpDate: "2026-11-12",
            dueDate: "",
            lastFollowUpDate: "",
          }),
    });
    await undo(page);
    expect(await saved(page)).toBe(before);
  }
  await list(page, "daily");
  await row(page, "creation-existing").locator(".task-name").click();
  await expect(form(page)).not.toHaveAttribute("data-creation", "true");
  await expect(field(page, "description")).toHaveValue(
    "Kullanıcının gerçek notu korunmalı.",
  );
  await field(page, "title").fill("Yalnız başlığı düzenlenmiş mevcut iş");
  await form(page)
    .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
    .click();
  const after = (await store(page)).records;
  const old = original.find((record) => record.id === "creation-existing");
  const edited = after.find((record) => record.id === old.id);
  expect({ ...edited, title: old.title, updatedAt: old.updatedAt }).toEqual(
    old,
  );
  expect(after.filter((record) => record.id !== old.id)).toEqual(
    original.filter((record) => record.id !== old.id),
  );
  await undo(page);
  expect(await saved(page)).toBe(before);
});
