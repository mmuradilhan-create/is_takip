// ODAK 1.0.0 replaced native confirm() with its own <dialog role="alertdialog">.
// This adapter exposes those in-app confirmations through the same small API
// the suites used for Playwright's native "dialog" events, so each assertion
// keeps its meaning: type(), message(), accept() and dismiss(). As with native
// dialogs, a confirmation that no listener handles is dismissed.
//
// In-app confirmations open asynchronously, so a suite can register the
// handler for its next confirmation before the previous one is noticed here.
// Each confirmation therefore goes to every on() listener and to only the
// oldest pending once()/waitForEvent() registration.

import { expect } from "@playwright/test";

const adapters = new WeakMap();
const OPEN = "dialog.app-confirm-dialog[open]";

function wrap(page, id, message) {
  const button = (kind) =>
    page.locator(`${OPEN}:has(#${id}-title) [data-confirm="${kind}"]`).last();
  let settled = false;
  async function settle(kind) {
    if (settled) return;
    settled = true;
    await button(kind).click();
    // Native confirm() returned before the page continued; wait likewise.
    await page
      .locator(`dialog:has(#${id}-title)`)
      .waitFor({ state: "detached" });
  }
  return {
    type: () => "confirm",
    message: () => message,
    accept: () => settle("accept"),
    dismiss: () => settle("cancel"),
  };
}

function create(page) {
  const listeners = new Set();
  const queue = [];
  let running = false;

  async function next() {
    const handle = await page
      .locator(OPEN)
      .first()
      .elementHandle({ timeout: 0 });
    return handle.evaluate((dialog) => ({
      id: dialog.getAttribute("aria-labelledby").replace(/-title$/, ""),
      message: dialog.querySelector(".modal-body p")?.textContent ?? "",
    }));
  }

  async function loop() {
    running = true;
    try {
      for (;;) {
        const { id, message } = await next();
        const dialog = wrap(page, id, message);
        const first = queue.shift();
        const handlers = [...listeners, ...(first ? [first] : [])];
        for (const handler of handlers) await handler(dialog);
        if (!handlers.length) await dialog.dismiss();
        await page
          .locator(`dialog:has(#${id}-title)`)
          .waitFor({ state: "detached", timeout: 0 });
      }
    } catch {
      // The page closed or navigated away; a later registration restarts.
    } finally {
      running = false;
    }
  }

  function start() {
    if (!running && !page.isClosed()) loop();
  }

  const adapter = {
    on(event, handler) {
      if (event === "dialog") listeners.add(handler);
      start();
      return adapter;
    },
    once(event, handler) {
      if (event === "dialog") queue.push(handler);
      start();
      return adapter;
    },
    off(event, handler) {
      listeners.delete(handler);
      const index = queue.indexOf(handler);
      if (index >= 0) queue.splice(index, 1);
      return adapter;
    },
    /** Wait until every open confirmation was answered and closed. */
    async settled() {
      await expect(page.locator(OPEN)).toHaveCount(0);
    },
    waitForEvent(event) {
      if (event !== "dialog") return page.waitForEvent(event);
      const result = new Promise((resolve) => queue.push(resolve));
      start();
      return result;
    },
  };
  return adapter;
}

/** In-app confirmations of `page`, with Playwright's dialog-event shape. */
export function appConfirms(page) {
  if (!adapters.has(page)) adapters.set(page, create(page));
  return adapters.get(page);
}
