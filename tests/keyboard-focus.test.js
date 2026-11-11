import test from "node:test";
import assert from "node:assert/strict";
import { trackKeyboardFocus } from "../src/keyboard-focus.js";

function fakeDocument() {
  const listeners = new Map();
  return {
    documentElement: { dataset: {} },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    fire: (type, event = {}) => listeners.get(type)?.(event),
    listeners,
  };
}
const field = { matches: () => true };
const button = { matches: () => false };

test("keyboard navigation turns focus underlines on and a pointer press turns them off", () => {
  const doc = fakeDocument();
  const stop = trackKeyboardFocus(doc);
  const state = () => doc.documentElement.dataset.focusSource;
  doc.fire("keydown", { key: "Enter", target: field });
  assert.equal(state(), undefined, "saving with Enter is not navigation");
  doc.fire("keydown", { key: "ArrowUp", target: field });
  assert.equal(state(), undefined, "arrows inside a text field edit it");
  doc.fire("keydown", { key: "Tab", target: field, ctrlKey: true });
  assert.equal(state(), undefined);
  doc.fire("keydown", { key: "Tab", target: field });
  assert.equal(state(), "keyboard");
  doc.fire("pointerdown");
  assert.equal(state(), undefined);
  doc.fire("keydown", { key: "ArrowDown", target: button });
  assert.equal(state(), "keyboard");
  stop();
  assert.equal(state(), undefined);
  assert.equal(doc.listeners.size, 0);
});
