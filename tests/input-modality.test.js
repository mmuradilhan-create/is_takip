import test from "node:test";
import assert from "node:assert/strict";
import { installInputModality } from "../src/input-modality.js";

function element(selectors = [], extra = {}) {
  const attributes = new Map();
  return {
    attributes,
    matches: (selector) =>
      selectors.some((item) =>
        selector.split(",").some((part) => part.trim() === item),
      ),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) =>
      attributes.has(name) ? attributes.get(name) : null,
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    ...extra,
  };
}

function fakeDocument() {
  const listeners = new Map();
  const frames = [];
  let observed = null;
  const root = element();
  const doc = {
    documentElement: root,
    activeElement: null,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    defaultView: {
      requestAnimationFrame: (callback) => frames.push(callback),
      cancelAnimationFrame: () => {},
      MutationObserver: class {
        constructor(callback) {
          observed = callback;
        }
        observe() {}
        disconnect() {}
      },
    },
  };
  return {
    doc,
    root,
    fire: (type, event) => listeners.get(type)?.(event),
    mutate: (target) => observed([{ target }]),
    frames,
  };
}

const field = element(["input"]);
const button = element(["button"]);
const quiet = (root) => root.hasAttribute("data-focus-quiet");

test("a pointer press or Enter or Escape in a text field quiets focus cues until keyboard navigation", () => {
  const page = fakeDocument();
  const stop = installInputModality(page.doc);
  const key = (key, target, extra = {}) =>
    page.fire("keydown", { key, target, ...extra });
  assert.equal(quiet(page.root), false);
  key("a", field);
  assert.equal(quiet(page.root), false);
  key("Enter", field);
  assert.equal(quiet(page.root), true, "saving a form from its text field");
  key("ArrowUp", field);
  assert.equal(quiet(page.root), true, "arrows inside a text field edit it");
  key("Tab", button);
  assert.equal(quiet(page.root), false);
  key("Escape", field);
  assert.equal(quiet(page.root), true, "cancelling a form");
  key(" ", button);
  assert.equal(quiet(page.root), false, "activating a control");
  page.fire("pointerdown", { isPrimary: true });
  assert.equal(quiet(page.root), true, "a mouse press");
  assert.equal(page.root.getAttribute("data-input-modality"), "pointer");
  key("Tab", button, { ctrlKey: true });
  assert.equal(quiet(page.root), true, "shortcuts are not navigation");
  key("ArrowDown", button);
  assert.equal(quiet(page.root), false);
  assert.equal(page.root.getAttribute("data-input-modality"), "keyboard");
  stop();
  assert.equal(quiet(page.root), false);
});

test("focus reached by a key pressed after a dialog closed is not marked as restored", async () => {
  const page = fakeDocument();
  installInputModality(page.doc);
  const dialog = element(["dialog"], { open: false });
  const title = element([".focus-title"]);
  const close = () => page.fire("close", { target: dialog });
  const settle = () => new Promise((resolve) => queueMicrotask(resolve));

  // Focus returned by the close itself is restored focus.
  page.fire("keydown", { key: "Escape", target: field });
  page.mutate(dialog);
  page.doc.activeElement = title;
  close();
  await settle();
  assert.equal(title.hasAttribute("data-focus-restored"), true);

  // The close event arrives late, after Shift+Tab and Tab moved focus on.
  page.fire("keydown", { key: "Enter", target: title });
  page.fire("keydown", { key: "Escape", target: field });
  page.mutate(dialog);
  page.fire("keydown", { key: "Tab", target: title, shiftKey: true });
  page.fire("keydown", { key: "Tab", target: button });
  page.doc.activeElement = title;
  close();
  await settle();
  for (const frame of page.frames.splice(0)) frame();
  assert.equal(title.hasAttribute("data-focus-restored"), false);
});
