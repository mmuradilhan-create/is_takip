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

test("Enter or Escape in a text field quiets the focus cue until navigation or a click", () => {
  const doc = fakeDocument();
  const stop = trackKeyboardFocus(doc);
  const quiet = () => Object.hasOwn(doc.documentElement.dataset, "focusQuiet");
  doc.fire("keydown", { key: "a", target: field });
  assert.equal(quiet(), false);
  doc.fire("keydown", { key: "Enter", target: field });
  assert.equal(quiet(), true, "saving a form from its text field");
  doc.fire("keydown", { key: "ArrowUp", target: field });
  assert.equal(quiet(), true, "arrows inside a text field edit it");
  doc.fire("keydown", { key: "Tab", target: button });
  assert.equal(quiet(), false);
  doc.fire("keydown", { key: "Escape", target: field });
  assert.equal(quiet(), true, "cancelling a form from its text field");
  doc.fire("pointerdown");
  assert.equal(quiet(), false);
  doc.fire("keydown", { key: "Escape", target: field });
  doc.fire("keydown", { key: "ArrowDown", target: button });
  assert.equal(quiet(), false);
  doc.fire("keydown", { key: "Enter", target: field });
  doc.fire("keydown", { key: " ", target: button });
  assert.equal(quiet(), false, "activating a control is navigation again");
  stop();
  assert.equal(doc.listeners.size, 0);
});
