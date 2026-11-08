import { test, expect } from "@playwright/test";
import { createRecord } from "../../src/model.js";
import { openCreationExtras } from "./creation-support.js";

const KEY = "is-takip-v1";
const NOW = new Date("2026-11-09T10:00:00.000Z");
const STAMP = "2026-11-01T09:00:00.000Z";
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const decoration = (control) =>
  control.evaluate((element) => getComputedStyle(element).textDecorationLine);

async function seed(page) {
  const records = [
    ...[
      ["weekly", "2026-W46", "Haftalık odak dönüşü"],
      ["monthly", "2026-11", "Aylık odak dönüşü"],
      ["yearly", "2026", "Senelik odak dönüşü"],
    ].map(([type, periodKey, title]) =>
      createRecord({
        id: `pointer-return-${type}`,
        type,
        title,
        periodKey,
        status: "in_progress",
        targetValue: 100,
        currentValue: 5,
        metric: "Rapor",
        createdAt: STAMP,
        updatedAt: STAMP,
      }),
    ),
    createRecord({
      id: "pointer-return-daily",
      title: "Güncel işin odak dönüşü",
      workContext: "ad_hoc",
      description: "Odak kontrolünde korunacak gerçek not.",
      dueDate: "2026-11-13",
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  ];
  const initialRaw = JSON.stringify({
    version: 1,
    records,
    odak: {
      version: 1,
      preferences: { density: "compact" },
      history: [],
    },
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ key, initialRaw }) => {
      if (sessionStorage.getItem("pointer-return-seeded")) return;
      localStorage.setItem(key, initialRaw);
      sessionStorage.setItem("pointer-return-seeded", "1");
    },
    { key: KEY, initialRaw },
  );
  await page.goto("/");
  expect(await saved(page)).toBe(initialRaw);
  return initialRaw;
}

async function theme(page, value) {
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }, value);
}

test("pointer closures restore goal and current-work focus without residual underlines while keyboard returns keep their cue", async ({
  page,
}) => {
  const before = await seed(page);
  const panel = page.locator("#goal-detail-panel");
  for (const palette of ["light", "dark"]) {
    await theme(page, palette);
    for (const type of ["weekly", "monthly", "yearly"]) {
      await page.locator(`#nav [data-view="${type}"]`).click();
      const row = page.locator(
        `.full-table [data-record-row][data-id="pointer-return-${type}"]`,
      );
      const title = row.locator('.task-name[data-action="goal-details"]');
      for (const closeMethod of ["header", "footer", "outside"]) {
        if (closeMethod === "header") {
          // This point is empty title-column space, away from completion.
          await row
            .locator("td")
            .first()
            .click({ position: { x: 450, y: 25 } });
        } else await title.click();
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute(
          "data-goal-id",
          `pointer-return-${type}`,
        );
        if (closeMethod === "header")
          await panel
            .getByRole("button", { name: "Pencereyi kapat", exact: true })
            .click();
        else if (closeMethod === "footer")
          await panel
            .getByRole("button", { name: "Kapat", exact: true })
            .click();
        else await page.locator("#page-title").click();
        await expect(panel).not.toBeVisible();
        if (closeMethod === "outside")
          expect(
            await panel.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          ).toBe(false);
        else await expect(closeMethod === "header" ? row : title).toBeFocused();
        await expect.poll(() => decoration(title)).toBe("none");
        // Pointer focus restored by a close button must not revive an underline.
        if (closeMethod !== "outside") {
          await title.hover();
          await expect.poll(() => decoration(title)).toBe("none");
        }
        expect(await saved(page)).toBe(before);
      }

      await page.keyboard.press("Tab");
      await title.focus();
      await expect(title).toBeFocused();
      await expect.poll(() => decoration(title)).toContain("underline");
      await page.keyboard.press("Enter");
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
      await expect(title).toBeFocused();
      await expect.poll(() => decoration(title)).toContain("underline");
      expect(await saved(page)).toBe(before);
    }

    await page.locator('#nav [data-view="dashboard"]').click();
    const current = page.locator(
      '.focus-row[data-id="pointer-return-daily"] .focus-title',
    );
    const editor = page.locator("#editor");
    await current.click();
    await expect(editor).toBeVisible();
    await editor
      .getByRole("button", { name: "Pencereyi kapat", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    await expect(current).toBeFocused();
    await expect.poll(() => decoration(current)).toBe("none");
    await current.hover();
    await expect.poll(() => decoration(current)).toBe("none");

    await page.keyboard.press("Tab");
    await current.focus();
    await expect.poll(() => decoration(current)).toContain("underline");
    await page.keyboard.press("Enter");
    await expect(editor).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).not.toBeVisible();
    await expect(current).toBeFocused();
    await expect.poll(() => decoration(current)).toContain("underline");
    expect(await saved(page)).toBe(before);
  }
});

test("form fields and filter wrappers keep a thin active border without external focus rings in both themes", async ({
  page,
}) => {
  const before = await seed(page);
  await page.locator('#nav [data-view="daily"]').click();
  const row = page.locator(
    '.full-table [data-record-row][data-id="pointer-return-daily"]',
  );
  const editor = page.locator("#editor");
  const form = editor.locator("#record-form");
  const noExternalFrame = async (control) => {
    await expect(control).toHaveCSS("outline-style", "none");
    await expect(control).toHaveCSS("outline-offset", "0px");
    await expect(control).toHaveCSS("box-shadow", "none");
  };
  const appearance = (control) =>
    control.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        borderColor: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        background: style.backgroundColor,
        width: bounds.width,
        height: bounds.height,
      };
    });
  const thinFieldFocus = async (control, neutral) => {
    await neutral.focus();
    const normal = await appearance(control);
    await control.click();
    await expect(control).toBeFocused();
    await noExternalFrame(control);
    const pointer = await appearance(control);
    expect(pointer.borderWidth).toBe(normal.borderWidth);
    expect(pointer.borderWidth).toBe("1px");
    expect(pointer.borderColor).not.toBe(normal.borderColor);
    expect(pointer.background).toBe(normal.background);
    expect(pointer.width).toBe(normal.width);
    expect(pointer.height).toBe(normal.height);

    await neutral.focus();
    await page.keyboard.press("Tab");
    await control.focus();
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await noExternalFrame(control);
    const keyboard = await appearance(control);
    expect(keyboard.borderWidth).toBe(normal.borderWidth);
    expect(keyboard.borderColor).not.toBe(normal.borderColor);
    expect(keyboard.background).toBe(normal.background);
  };

  for (const palette of ["light", "dark"]) {
    await theme(page, palette);
    await row.locator(".task-name").click();
    await expect(editor).toBeVisible();
    await expect(form.locator('[name="id"]')).toHaveValue(
      "pointer-return-daily",
    );
    await openCreationExtras(page);
    const close = editor.getByRole("button", {
      name: "Pencereyi kapat",
      exact: true,
    });
    for (const name of ["workContext", "title", "description", "dueDate"])
      await thinFieldFocus(form.locator(`[name="${name}"]`), close);

    const summary = form.locator(
      "details[data-record-editor-extras] > summary",
    );
    await page.keyboard.press("Tab");
    await summary.focus();
    await noExternalFrame(summary);
    await expect(summary).toHaveCSS("text-decoration-line", "underline");

    // A native invalid state and its error border must not turn green on focus.
    const errorStyle = await page.addStyleTag({
      content:
        "#record-form .test-focus-error { border-color: rgb(179, 77, 66); }",
    });
    const title = form.locator('[name="title"]');
    await title.evaluate((element) => {
      element.classList.add("test-focus-error");
      element.setAttribute("aria-invalid", "true");
      element.setCustomValidity("Kontrol edilen hata durumu.");
    });
    await title.focus();
    await noExternalFrame(title);
    await expect(title).toHaveCSS("border-top-color", "rgb(179, 77, 66)");
    expect(await title.evaluate((element) => element.matches(":invalid"))).toBe(
      true,
    );
    await title.evaluate((element) => {
      element.classList.remove("test-focus-error");
      element.removeAttribute("aria-invalid");
      element.setCustomValidity("");
    });
    await errorStyle.evaluate((element) => element.remove());
    await close.click();
    await expect(editor).not.toBeVisible();
    expect(await saved(page)).toBe(before);

    const priority = page.locator("#priority-filter");
    const wrapper = page.locator(".filter-control:has(#priority-filter)");
    await page.locator("#global-search").focus();
    const normalFilter = await appearance(wrapper);
    await priority.click();
    await expect(priority).toBeFocused();
    await noExternalFrame(priority);
    await noExternalFrame(wrapper);
    expect((await appearance(wrapper)).borderWidth).toBe(
      normalFilter.borderWidth,
    );
    expect((await appearance(wrapper)).borderColor).not.toBe(
      normalFilter.borderColor,
    );
    await page.locator("#global-search").focus();
    await page.keyboard.press("Tab");
    await priority.focus();
    await noExternalFrame(wrapper);
    expect((await appearance(wrapper)).borderColor).not.toBe(
      normalFilter.borderColor,
    );
    await expect(priority).toHaveValue("all");

    await row.locator('[data-action="record-note"]').click();
    const note = page.locator("#record-note-editor");
    await expect(note).toBeVisible();
    await thinFieldFocus(
      note.locator('textarea[name="description"]'),
      note.getByRole("button", { name: "Pencereyi kapat", exact: true }),
    );
    await note.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(note).not.toBeVisible();
    expect(await saved(page)).toBe(before);

    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    const settings = page.locator("#settings-dialog");
    const radio = settings
      .locator(".settings-theme-choice input:not(:checked)")
      .first();
    const choice = radio.locator("xpath=..");
    const normalChoice = await appearance(choice);
    await page.keyboard.press("Tab");
    await radio.focus();
    await expect(radio).toBeFocused();
    await noExternalFrame(choice);
    expect((await appearance(choice)).borderWidth).toBe(
      normalChoice.borderWidth,
    );
    expect((await appearance(choice)).borderColor).not.toBe(
      normalChoice.borderColor,
    );
    await settings.getByRole("button", { name: "Tamam", exact: true }).click();
    await expect(settings).not.toBeVisible();
    expect(await saved(page)).toBe(before);
  }
});
