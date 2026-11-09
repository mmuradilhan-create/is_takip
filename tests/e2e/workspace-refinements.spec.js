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
  const beforeDate = await saved(page);

  await primary.locator(".inline-date").click();
  const picker = page.locator("#odak-date-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("data-selection-mode", "direct");
  await expect(page.locator("#due-date-menu, #quick-date-form")).toHaveCount(0);
  await expect(
    picker.locator('input[type="text"], [type="submit"]'),
  ).toHaveCount(0);
  await expect(
    picker.getByRole("button", { name: "Kaydet", exact: true }),
  ).toHaveCount(0);
  await expect(
    picker.getByRole("button", { name: "Vazgeç", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#editor")).not.toBeVisible();
  await picker
    .getByRole("button", { name: "Takvimi kapat", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(await saved(page)).toBe(beforeDate);
  await primary.locator(".inline-date").click();
  await picker.locator('[data-date-day="2026-11-06"]').click();
  await expect(picker).not.toBeVisible();
  expect(await saved(page)).toBe(beforeDate);
  await primary.locator(".inline-date").click();
  await picker.locator('[data-date-day="2026-11-10"]').click();
  await expect(picker).not.toBeVisible();
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

test("sidebar working notes keep idle compact and inline finish controls bounded without covering navigation on short PC windows", async ({
  page,
}) => {
  const original = await seed(page);
  const originalBytes = await saved(page);
  const savedCount = original
    .filter((record) => record.type === "daily")
    .reduce((count, record) => count + (record.workLog?.length || 0), 0);
  const labels = [
    "Genel bakış",
    "Günlük işler",
    "Haftalık plan",
    "Aylık hedefler",
    "Senelik hedefler",
    "Toplantı aksiyonları",
    "Bekleyen konular",
  ];
  const expandedNotes = [];
  async function navigationGeometry(baseline) {
    const geometry = await page.locator("#nav").evaluate((nav) => {
      const rect = (box) => ({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
      return {
        clientHeight: nav.clientHeight,
        scrollHeight: nav.scrollHeight,
        clientWidth: nav.clientWidth,
        scrollWidth: nav.scrollWidth,
        scrollTop: nav.scrollTop,
        box: rect(nav.getBoundingClientRect()),
        buttons: [...nav.querySelectorAll("button[data-view]")].map(
          (button) => {
            const node = [...button.childNodes].find(
              (child) =>
                child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
            );
            const range = document.createRange();
            range.selectNodeContents(node);
            const style = getComputedStyle(button);
            const count = button.querySelector(".count");
            return {
              view: button.dataset.view,
              label: node.textContent.trim(),
              box: rect(button.getBoundingClientRect()),
              textOverflow: style.textOverflow,
              lines: [...range.getClientRects()].map(rect),
              count: count ? rect(count.getBoundingClientRect()) : null,
            };
          },
        ),
      };
    });
    expect(geometry.scrollHeight).toBeLessThanOrEqual(
      geometry.clientHeight + 1,
    );
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.buttons.map((button) => button.label)).toEqual(labels);
    for (const [index, button] of geometry.buttons.entries()) {
      expect(button.box.x).toBeGreaterThanOrEqual(geometry.box.x - 0.5);
      expect(button.box.y).toBeGreaterThanOrEqual(geometry.box.y - 0.5);
      expect(button.box.x + button.box.width).toBeLessThanOrEqual(
        geometry.box.x + geometry.box.width + 0.5,
      );
      expect(button.box.y + button.box.height).toBeLessThanOrEqual(
        geometry.box.y + geometry.box.height + 0.5,
      );
      expect(button.box.y).toBeGreaterThanOrEqual(0);
      expect(button.box.y + button.box.height).toBeLessThanOrEqual(
        page.viewportSize().height,
      );
      expect(button.textOverflow).not.toBe("ellipsis");
      expect(button.lines).toHaveLength(1);
      const line = button.lines[0];
      expect(line.x).toBeGreaterThanOrEqual(button.box.x - 0.5);
      expect(line.y).toBeGreaterThanOrEqual(button.box.y - 0.5);
      expect(line.x + line.width).toBeLessThanOrEqual(
        button.box.x + button.box.width + 0.5,
      );
      expect(line.y + line.height).toBeLessThanOrEqual(
        button.box.y + button.box.height + 0.5,
      );
      if (button.count) {
        expect(line.x + line.width).toBeLessThanOrEqual(button.count.x + 0.5);
        expect(button.count.x + button.count.width).toBeLessThanOrEqual(
          button.box.x + button.box.width + 0.5,
        );
      }
      if (baseline) {
        expect(button.view).toBe(baseline.buttons[index].view);
        for (const dimension of ["x", "y", "width", "height"])
          expect(
            Math.abs(
              button.box[dimension] - baseline.buttons[index].box[dimension],
            ),
          ).toBeLessThanOrEqual(0.5);
      }
    }
    return geometry;
  }
  async function noteControls(journal, workingNote, baseline, expanded = true) {
    await navigationGeometry(baseline);
    await expect(journal).toBeInViewport({ ratio: 1 });
    if (expanded) {
      await expect(workingNote).toBeInViewport({ ratio: 1 });
      expect((await workingNote.boundingBox()).height).toBeGreaterThan(0);
      if (
        (await journal
          .locator("#work-session-panel")
          .getAttribute("data-mode")) === "note"
      ) {
        await expect(workingNote).toHaveAccessibleName("Çalışma notu");
        const caption = await journal
          .locator("#work-session-note-label")
          .boundingBox();
        expect(!caption || (caption.width <= 1 && caption.height <= 1)).toBe(
          true,
        );
      } else {
        await expect(workingNote).toHaveAccessibleName("Sonuç (isteğe bağlı)");
      }
    } else await expect(workingNote).toBeHidden();
    const pad = await journal.boundingBox();
    const nav = await page.locator("#nav").boundingBox();
    expect(nav.y + nav.height).toBeLessThanOrEqual(pad.y + 1);
    for (const control of await journal
      .locator("#work-session-panel button:visible")
      .all()) {
      await control.scrollIntoViewIfNeeded();
      const visible = await control.evaluate((button) => {
        const rect = (box) => ({
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        });
        const viewport = window.visualViewport;
        const clip = {
          left: viewport?.offsetLeft || 0,
          top: viewport?.offsetTop || 0,
          right: (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth),
          bottom:
            (viewport?.offsetTop || 0) + (viewport?.height || innerHeight),
        };
        for (
          let ancestor = button.parentElement;
          ancestor;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          const box = ancestor.getBoundingClientRect();
          if (style.overflowX !== "visible") {
            clip.left = Math.max(clip.left, box.left + ancestor.clientLeft);
            clip.right = Math.min(
              clip.right,
              box.left + ancestor.clientLeft + ancestor.clientWidth,
            );
          }
          if (style.overflowY !== "visible") {
            clip.top = Math.max(clip.top, box.top + ancestor.clientTop);
            clip.bottom = Math.min(
              clip.bottom,
              box.top + ancestor.clientTop + ancestor.clientHeight,
            );
          }
        }
        const box = rect(button.getBoundingClientRect());
        const contentClip = {
          left: Math.max(clip.left, box.left),
          top: Math.max(clip.top, box.top),
          right: Math.min(clip.right, box.right),
          bottom: Math.min(clip.bottom, box.bottom),
        };
        const captions = [];
        if (button.id !== "work-session-title") {
          const walker = document.createTreeWalker(
            button,
            NodeFilter.SHOW_TEXT,
          );
          let node;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            captions.push([...range.getClientRects()].map(rect));
          }
        }
        return {
          box,
          clip,
          contentClip,
          captions,
          icons: [...button.querySelectorAll("svg")]
            .map((icon) => icon.getBoundingClientRect())
            .filter((icon) => icon.width && icon.height)
            .map(rect),
        };
      });
      expect(visible.box.left).toBeGreaterThanOrEqual(visible.clip.left - 1);
      expect(visible.box.top).toBeGreaterThanOrEqual(visible.clip.top - 1);
      expect(visible.box.right).toBeLessThanOrEqual(visible.clip.right + 1);
      expect(visible.box.bottom).toBeLessThanOrEqual(visible.clip.bottom + 1);
      for (const caption of visible.captions)
        expect(caption.length).toBeGreaterThan(0);
      for (const content of [...visible.captions.flat(), ...visible.icons]) {
        expect(content.left).toBeGreaterThanOrEqual(visible.contentClip.left);
        expect(content.top).toBeGreaterThanOrEqual(visible.contentClip.top);
        expect(content.right).toBeLessThanOrEqual(visible.contentClip.right);
        expect(content.bottom).toBeLessThanOrEqual(visible.contentClip.bottom);
      }
      await navigationGeometry(baseline);
    }
    await expect(
      journal.locator("#work-session-time, #sidebar-saved-time"),
    ).toHaveCount(0);
    await expect(journal.locator(".sidebar-journal-saved")).toHaveCount(0);
    await expect(journal.locator("#sidebar-saved-count")).toHaveText(
      `${savedCount} kayıt`,
    );
    await expect(
      journal.locator('[data-action="work-session-history"]'),
    ).toHaveText("Çalışma geçmişi");
    const history = await journal
      .locator('[data-action="work-session-history"]')
      .boundingBox();
    const count = await journal.locator("#sidebar-saved-count").boundingBox();
    const footer = await journal
      .locator(".sidebar-journal-footer")
      .boundingBox();
    expect(history.x).toBeGreaterThanOrEqual(footer.x - 0.5);
    expect(history.x + history.width).toBeLessThanOrEqual(count.x + 0.5);
    expect(count.x + count.width).toBeLessThanOrEqual(
      footer.x + footer.width + 0.5,
    );
    expect(
      Math.abs(history.y + history.height / 2 - count.y - count.height / 2),
    ).toBeLessThanOrEqual(1);
    expect(await saved(page)).toBe(originalBytes);
  }
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1280, height: 700 },
    { width: 1280, height: 400 },
    { width: 850, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await navigate(page, "dashboard");
    const baseline = await navigationGeometry();
    const journal = page.locator("#sidebar-work-journal");
    const idle = await journal.boundingBox();
    expect(idle.height).toBeLessThanOrEqual(110);
    await expect(journal.locator(".sidebar-journal-idle")).toHaveCount(0);
    await focus(page).locator(".work-start").click();
    const active = await journal.boundingBox();
    expect(active.height).toBeGreaterThan(idle.height + 30);
    expect(active.y).toBeLessThan(idle.y);
    const workingNote = journal.locator("#work-session-note");
    await expect(workingNote).toBeFocused();
    await noteControls(journal, workingNote, baseline);
    expandedNotes.push({
      viewportHeight: viewport.height,
      height: (await workingNote.boundingBox()).height,
    });
    const sidebar = await page.locator(".sidebar").boundingBox();
    expect(sidebar.y).toBeGreaterThanOrEqual(0);
    expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(viewport.height);
    const result = `Dar pencerede kaydedilen gerçek sonuç ${viewport.width}×${viewport.height}`;
    await workingNote.fill(result);
    await journal.locator('[data-action="work-pause"]').click();
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-phase",
      "paused",
    );
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await expect(workingNote).toHaveValue(result);
    const compact = await journal.boundingBox();
    expect(compact.height).toBeLessThan(active.height);
    expect(active.y).toBeLessThan(compact.y);
    const expand = await journal.locator("#work-note-expand").boundingBox();
    const compactPanel = await journal
      .locator("#work-session-panel")
      .boundingBox();
    expect(expand.width).toBeLessThan(compactPanel.width / 2);
    await noteControls(journal, workingNote, baseline, false);
    await journal.locator("#work-note-expand").click();
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-phase",
      "paused",
    );
    await noteControls(journal, workingNote, baseline);
    await journal.locator('[data-action="work-resume"]').click();
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-phase",
      "running",
    );
    await expect(workingNote).toHaveValue(result);
    await noteControls(journal, workingNote, baseline);
    await journal.locator('[data-action="work-finish"]').click();
    await expect(page.locator("#work-finish-dialog")).toHaveCount(0);
    await expect(journal.locator("#work-session-panel")).toHaveAttribute(
      "data-mode",
      "finish",
    );
    await expect(workingNote).toHaveValue(result);
    await noteControls(journal, workingNote, baseline);
    await expect(
      journal.getByRole("button", { name: "Kaydet ve bitir", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      journal.locator('[data-action="work-finish-cancel"]'),
    ).toBeInViewport({ ratio: 1 });
    await workingNote.press("Enter");
    await expect(journal.locator("#work-session-panel")).not.toBeVisible();
    await navigationGeometry(baseline);
    await expect(journal.locator("#sidebar-saved-count")).toHaveText(
      `${savedCount + 1} kayıt`,
    );
    const changed = (await records(page)).find(
      (record) => record.id === "refine-primary",
    );
    expect(changed.workLog.at(-1)).toMatchObject({
      durationMs: 0,
      note: result,
    });
    expect(changed.workLog.slice(0, -1)).toEqual(
      original.find((record) => record.id === "refine-primary").workLog,
    );
    await undo(page);
    expect(await records(page)).toEqual(original);
    expect(await saved(page)).toBe(originalBytes);
    await expect(journal.locator("#sidebar-saved-count")).toHaveText(
      `${savedCount} kayıt`,
    );
  }
  expect(
    expandedNotes.find((note) => note.viewportHeight === 864).height,
  ).toBeGreaterThan(
    expandedNotes.find((note) => note.viewportHeight === 700).height,
  );
});
