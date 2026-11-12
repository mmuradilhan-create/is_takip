import { test, expect } from "@playwright/test";

test("the overview shrinks smoothly with window height instead of jumping at 740px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto("/");
  const measure = () =>
    page.evaluate(() => {
      const calendar = document.querySelector(
        ".dashboard-rows .dashboard-calendar",
      );
      const size = (selector) =>
        calendar.querySelector(selector).getBoundingClientRect().height;
      const bottom = document
        .querySelector(".dashboard-bottom-row > .attention-panel")
        .getBoundingClientRect().height;
      return {
        heading: size(".calendar-heading"),
        day: size(".calendar-day"),
        font: parseFloat(
          getComputedStyle(calendar.querySelector(".calendar-heading h2"))
            .fontSize,
        ),
        bottom,
      };
    });
  let previous = null;
  for (let height = 820; height >= 660; height -= 10) {
    await page.setViewportSize({ width: 1440, height });
    const current = await measure();
    if (previous)
      for (const key of Object.keys(current))
        expect(
          Math.abs(current[key] - previous[key]),
          `${key} at ${height}px`,
        ).toBeLessThanOrEqual(1.5);
    previous = current;
  }
  // Across the old 740px step the sizes differ by a fraction of a pixel.
  await page.setViewportSize({ width: 1440, height: 741 });
  const above = await measure();
  await page.setViewportSize({ width: 1440, height: 740 });
  const below = await measure();
  for (const key of Object.keys(above))
    expect(Math.abs(above[key] - below[key]), key).toBeLessThanOrEqual(0.5);
});
