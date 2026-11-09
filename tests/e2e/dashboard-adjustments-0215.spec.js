import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const OLD = "2026-11-04T08:00:00.000Z";
const record = (input) =>
  createRecord({ createdAt: OLD, updatedAt: OLD, ...input });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const savedRecords = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).records, KEY);
const attention = (page) =>
  page.locator(".dashboard-bottom-row > .attention-panel");
const weekly = (page) =>
  page.locator(".dashboard-bottom-row > .weekly-dashboard-panel");
const waitingCard = (page, id = "adjustment-waiting") =>
  attention(page).locator(`.followup-row[data-id="${id}"]`);
const dateControl = (page) =>
  waitingCard(page).locator('button[data-action="edit-next-followup"]');
const dateMenu = (page) => page.locator("#due-date-menu");
const dashboard = (page) =>
  page.locator('#nav [data-view="dashboard"]').click();
const undo = (page) =>
  page.getByRole("button", { name: "Geri al", exact: true }).click();

function fixture({ paged = false } = {}) {
  return [
    record({
      id: "adjustment-goal",
      type: "weekly",
      title: "Ölçüm dosyasının doğrulama hedefi",
      periodKey: "2026-W46",
      metric: "Kontrol",
      targetValue: 7,
      currentValue: 2,
      nextAction: "Son doğrulama çizimini gözden geçir.",
    }),
    record({
      id: "adjustment-daily",
      title: "Doğrulama çizimini hazırla",
      parentId: "adjustment-goal",
      dueDate: "2026-11-09",
    }),
    record({
      id: "adjustment-waiting",
      type: "waiting",
      title: "Malzeme doğrulaması için tedarik yanıtını bekle",
      status: "waiting_response",
      sourceDate: "2026-10-28",
      lastFollowUpDate: "2026-11-04",
      nextFollowUpDate: "2026-11-08",
      latestUpdate: "Teklif değerlendirme sırasında.",
      expectedFrom: "Tedarik ekibi",
      dueDate: "2020-01-01",
      priority: "high",
      description: "Kullanıcının özgün açıklaması.",
      sourceFields: { "Özgün tarih": "Değişmeyecek kaynak bilgisi" },
      followUpLog: [
        {
          id: "adjustment-contact",
          date: "2026-11-04",
          note: "Teklif değerlendirme sırasında.",
          nextFollowUpDate: "2026-11-08",
          previousUpdate: "Teklif paylaşıldı.",
        },
      ],
    }),
    ...(paged
      ? [1, 2, 3, 4].map((index) =>
          record({
            id: `adjustment-waiting-${index}`,
            type: "waiting",
            title: `Tedarik değerlendirmesinin ${index}. yanıtı`,
            nextFollowUpDate: "2026-11-09",
            expectedFrom: "Kalite ekibi",
          }),
        )
      : []),
  ];
}

async function seed(page, { paged = false, width = 1536, height = 864 } = {}) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  const records = fixture({ paged });
  const original = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact" },
      history: [],
    },
  });
  await page.addInitScript(
    ({ key, original }) => {
      if (sessionStorage.getItem("dashboard-adjustments-0215-seeded")) return;
      localStorage.setItem(key, original);
      sessionStorage.setItem("dashboard-adjustments-0215-seeded", "1");
    },
    { key: KEY, original },
  );
  await page.goto("/");
  await expect(attention(page)).toBeVisible();
  expect(await saved(page)).toBe(original);
  return { records, original };
}

async function openDate(page) {
  await dateControl(page).click();
  await expect(dateMenu(page)).toBeVisible();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#waiting-followup-dialog")).not.toBeVisible();
  return dateMenu(page).locator('[name="nextFollowUpDate"]');
}

async function slotWidth(list, card, expectedColumns) {
  await expect
    .poll(() =>
      list.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(expectedColumns);
  expect(
    await list.evaluate(
      (element) => element.closest(".dashboard-rows").dataset.cardColumns,
    ),
  ).toBe("2");
  await card.scrollIntoViewIfNeeded();
  const sizes = await list.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: element.clientWidth,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      gap: parseFloat(style.columnGap),
      columns: style.gridTemplateColumns.split(" ").length,
    };
  });
  const box = await card.boundingBox();
  expect(sizes.columns).toBe(expectedColumns);
  expect(
    Math.abs(
      box.width -
        (sizes.width - sizes.padding - sizes.gap * (expectedColumns - 1)) /
          expectedColumns,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(card).toBeInViewport({ ratio: 1 });
}

async function sharedHeaders(page, expectedWaitingCount = "1") {
  await expect(attention(page).locator(".dashboard-panel-count")).toHaveText(
    expectedWaitingCount,
  );
  await expect(weekly(page).locator(".dashboard-panel-count")).toHaveText("1");
  const headers = await page.locator(".dashboard-bottom-row").evaluate((row) =>
    [...row.querySelectorAll(".dashboard-panel-header")].map((header) => {
      const title = header.querySelector(".dashboard-panel-heading h2");
      const box = header.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const style = getComputedStyle(title);
      return {
        box: box.toJSON(),
        title: titleBox.toJSON(),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
      };
    }),
  );
  expect(headers).toHaveLength(3);
  expect(
    Math.abs(headers[0].box.height - headers[1].box.height),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(headers[0].title.y - headers[1].title.y)).toBeLessThanOrEqual(
    1,
  );
  expect(headers[0].fontSize).toBe(headers[1].fontSize);
  expect(headers[0].lineHeight).toBe(headers[1].lineHeight);
  expect(headers[0].fontWeight).toBe(headers[1].fontWeight);
  await expect(attention(page).locator(".dashboard-panel-subtitle")).toHaveText(
    "Gecikenler, bugün ve önümüzdeki 3 gün",
  );
  await expect(weekly(page).locator(".dashboard-week-label")).toContainText(
    "9 – 15 Kasım 2026",
  );
  for (const panel of [attention(page), weekly(page)]) {
    await panel.locator(".dashboard-panel-link").scrollIntoViewIfNeeded();
    await expect(panel.locator(".dashboard-panel-link")).toBeInViewport({
      ratio: 1,
    });
  }
  expect(
    await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth + 1,
      y: document.documentElement.scrollHeight > innerHeight + 1,
    })),
  ).toEqual({ x: false, y: page.viewportSize().width < 1280 });
  const notes = page.locator(".dashboard-bottom-row > .dashboard-notes-panel");
  const notesHeader = headers[2];
  expect(notesHeader.fontSize).toBe(headers[0].fontSize);
  expect(notesHeader.lineHeight).toBe(headers[0].lineHeight);
  if (page.viewportSize().width >= 1280) {
    expect(Math.abs(notesHeader.box.y - headers[0].box.y)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(notesHeader.box.height - headers[0].box.height),
    ).toBeLessThanOrEqual(1);
  }
  await notes.locator(".workspace-note-add").scrollIntoViewIfNeeded();
  await expect(notes.locator(".workspace-note-add")).toBeInViewport({
    ratio: 1,
  });
}

test("a card follow-up date cancels without writes and saves only its plan with exact reload and one Undo", async ({
  page,
}) => {
  const { records, original } = await seed(page);
  let input = await openDate(page);
  await expect(page.locator("#odak-date-picker")).toBeVisible();
  await expect(input).toHaveValue("08.11.2026");
  await input.fill("10.11.2026");
  await page.keyboard.press("Escape");
  await expect(page.locator("#odak-date-picker")).not.toBeVisible();
  await expect(dateMenu(page)).toBeVisible();
  expect(await saved(page)).toBe(original);
  await page.keyboard.press("Escape");
  await expect(dateMenu(page)).not.toBeVisible();
  expect(await saved(page)).toBe(original);

  input = await openDate(page);
  await input.fill("10.11.2026");
  await dateMenu(page).locator('[data-action="cancel-inline"]').click();
  await expect(dateMenu(page)).not.toBeVisible();
  expect(await saved(page)).toBe(original);

  input = await openDate(page);
  await input.fill("09.11.2026");
  await dateMenu(page)
    .getByRole("button", { name: "Kaydet", exact: true })
    .click();
  await expect(dateMenu(page)).not.toBeVisible();
  await expect(dateControl(page)).toHaveText("9 Kas");
  const expected = records.map((item) =>
    item.id === "adjustment-waiting"
      ? {
          ...item,
          nextFollowUpDate: "2026-11-09",
          updatedAt: NOW.toISOString(),
        }
      : item,
  );
  expect(await savedRecords(page)).toEqual(expected);
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#waiting-followup-dialog")).not.toBeVisible();
  const editedBytes = await saved(page);
  await page.reload();
  expect(await saved(page)).toBe(editedBytes);
  await expect(dateControl(page)).toHaveText("9 Kas");
  await undo(page);
  expect(await saved(page)).toBe(original);
  expect(await savedRecords(page)).toEqual(records);
  await page.reload();
  expect(await saved(page)).toBe(original);
  await expect(dateControl(page)).toHaveText("8 Kas");
});

test("single waiting and goal cards retain one shared grid slot and common headers at wide and short desktop sizes", async ({
  page,
}) => {
  const { original } = await seed(page);
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
    { width: 1200, height: 800 },
    { width: 1100, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await sharedHeaders(page);
    const columns = 2;
    await slotWidth(
      attention(page).locator(".attention-list"),
      waitingCard(page),
      columns,
    );
    const goals = weekly(page).locator(".dashboard-goals");
    await slotWidth(goals, goals.locator(".dashboard-goal-row"), columns);
    const children = goals.locator('[data-action="goal-children-open"]');
    await expect(children.locator(".dashboard-goal-count")).toHaveText("1");
    await expect(children).toHaveText("Bağlı işler 1");
    await expect(children).toBeInViewport({
      ratio: 1,
    });
    await expect(dateControl(page)).toHaveAttribute(
      "data-followup-state",
      "soon",
    );
    await expect(dateControl(page)).toBeInViewport({ ratio: 1 });

    await attention(page).locator(".dashboard-panel-link").click();
    await expect(page.locator("#page-title")).toHaveText("Bekleyen konular");
    await expect(
      page.locator(
        '.waiting-table tr[data-record-row][data-id="adjustment-waiting"]',
      ),
    ).toBeVisible();
    await dashboard(page);
    await weekly(page).locator(".dashboard-panel-link").click();
    await expect(page.locator("#planning-period-label")).toHaveText(
      "9 – 15 Kasım 2026",
    );
    await expect(
      page.locator(
        '.full-table tr[data-record-row][data-id="adjustment-goal"]',
      ),
    ).toBeVisible();
    await dashboard(page);
    expect(await saved(page)).toBe(original);
  }
});

test("two-card pages keep every record reachable in both two-column and one-column layouts without stretching the last card", async ({
  page,
}) => {
  const { original } = await seed(page, {
    paged: true,
    width: 1536,
    height: 864,
  });
  await sharedHeaders(page, "5");
  await expect(attention(page).locator(".attention-page-label")).toHaveText(
    "Sayfa 1 / 3",
  );
  const first = await attention(page)
    .locator(".followup-row")
    .evaluateAll((cards) => cards.map((card) => card.dataset.id));
  const next = attention(page).getByRole("button", {
    name: "Sonraki takipler",
    exact: true,
  });
  await expect(next).toBeInViewport({ ratio: 1 });
  await next.focus();
  await page.keyboard.press("Enter");
  const middle = await attention(page)
    .locator(".followup-row")
    .evaluateAll((cards) => cards.map((card) => card.dataset.id));
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(attention(page).locator(".attention-page-label")).toHaveText(
    "Sayfa 3 / 3",
  );
  const last = attention(page).locator(".followup-row");
  await expect(last).toHaveCount(1);
  const lastId = await last.getAttribute("data-id");
  expect(new Set([...first, ...middle, lastId]).size).toBe(5);
  await slotWidth(attention(page).locator(".attention-list"), last, 2);
  await sharedHeaders(page, "5");
  await expect(next).toBeDisabled();

  for (const [viewport, columns] of [
    [{ width: 1280, height: 800 }, 2],
    [{ width: 1280, height: 720 }, 2],
    [{ width: 1200, height: 800 }, 2],
    [{ width: 1100, height: 640 }, 2],
    [{ width: 390, height: 700 }, 1],
  ]) {
    await page.setViewportSize(viewport);
    const list = attention(page).locator(".attention-list");
    await expect
      .poll(() =>
        list.evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ),
      )
      .toBe(columns);
    const previous = attention(page).getByRole("button", {
      name: "Önceki takipler",
      exact: true,
    });
    for (let step = 0; step < 4 && !(await previous.isDisabled()); step++)
      await previous.click();
    await expect(previous).toBeDisabled();
    const seen = new Set();
    for (let step = 0; step < 4; step++) {
      await expect(attention(page).locator(".attention-page-label")).toHaveText(
        `Sayfa ${step + 1} / 3`,
      );
      const cards = attention(page).locator(".followup-row");
      const ids = await cards.evaluateAll((items) =>
        items.map((item) => item.dataset.id),
      );
      expect(ids.length).toBeLessThanOrEqual(2);
      for (const id of ids) seen.add(id);
      for (const card of await cards.all())
        await slotWidth(list, card, columns);
      if (await next.isDisabled()) break;
      await next.focus();
      await page.keyboard.press("Enter");
    }
    expect([...seen].sort()).toEqual([
      "adjustment-waiting",
      "adjustment-waiting-1",
      "adjustment-waiting-2",
      "adjustment-waiting-3",
      "adjustment-waiting-4",
    ]);
    await expect(next).toBeDisabled();
    if (viewport.width >= 1100) await sharedHeaders(page, "5");
    expect(await saved(page)).toBe(original);
  }

  const title = weekly(page).locator(".dashboard-goal-title");
  await expect(title).not.toHaveAttribute("data-action");
  expect(await title.evaluate((element) => element.tagName)).toBe("STRONG");
  const progressAction = weekly(page).locator(
    '[data-action="goal-progress-open"]',
  );
  await expect(progressAction).toHaveText("İlerleme");
  const childrenAction = weekly(page).locator(
    '[data-action="goal-children-open"]',
  );
  await expect(childrenAction).toHaveText("Bağlı işler 1");
  await expect(childrenAction.locator(".dashboard-goal-count")).toHaveText("1");
  await expect(childrenAction).toBeVisible();
  await progressAction.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("#goal-detail-panel");
  await expect(panel.locator(".goal-panel-title")).toHaveText(
    "Ölçüm dosyasının doğrulama hedefi",
  );
  await expect(panel.locator('[data-goal-section="progress"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  expect(await saved(page)).toBe(original);
});
