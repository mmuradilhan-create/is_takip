import test from "node:test";
import assert from "node:assert/strict";
import { installDialogLightDismiss } from "../src/dialog-light-dismiss.js";

function fixture() {
  const listeners = new Map();
  const dialogs = [];
  let popover = false;
  let observer;
  const owner = new EventTarget();
  owner.Event = Event;
  owner.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.records = [];
      observer = this;
    }
    observe() {}
    takeRecords() {
      return this.records.splice(0);
    }
    disconnect() {
      this.records.length = 0;
    }
  };
  const document = {
    defaultView: owner,
    documentElement: {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    querySelector() {
      return popover ? {} : null;
    },
    querySelectorAll() {
      return dialogs.filter((dialog) => dialog.open);
    },
  };
  function emit(type, fields = {}) {
    const event = {
      type,
      target: document,
      button: 0,
      detail: 1,
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      ...fields,
    };
    for (const listener of listeners.get(type) || []) listener(event);
    return event;
  }
  function dialog({ modal = false, native = false } = {}) {
    const result = new EventTarget();
    Object.assign(result, {
      localName: "dialog",
      open: false,
      isConnected: true,
      calls: 0,
      contains: (element) => element?.parent === result,
      matches: () => modal,
      getBoundingClientRect: () => ({
        left: 100,
        top: 100,
        right: 400,
        bottom: 400,
      }),
      show() {
        emit("beforetoggle", { target: result, newState: "open" });
        result.open = true;
        observer.records.push({ target: result, oldValue: null });
      },
      close() {
        emit("beforetoggle", { target: result, newState: "closed" });
        result.open = false;
        observer.records.push({ target: result, oldValue: "" });
      },
    });
    if (native)
      result.requestClose = () => {
        result.calls++;
        if (result.dispatchEvent(new Event("cancel", { cancelable: true })))
          result.close();
      };
    dialogs.push(result);
    return result;
  }
  const destroy = installDialogLightDismiss(document);
  function click(target, fields = {}) {
    emit("pointerdown", { target, ...fields });
    return emit("click", { target, ...fields });
  }
  return {
    document,
    dialog,
    emit,
    click,
    destroy,
    setPopover(value) {
      popover = value;
    },
  };
}

test("modal backdrop requests normal cancellation and consumes the underlay click", () => {
  const f = fixture();
  const editor = f.dialog({ modal: true, native: true });
  let cancelled = 0;
  editor.addEventListener("cancel", () => cancelled++);
  editor.show();
  const click = f.click(editor);
  assert.equal(editor.open, false);
  assert.equal(editor.calls, 1);
  assert.equal(cancelled, 1);
  assert.equal(click.defaultPrevented, true);
  assert.equal(click.propagationStopped, true);
});

test("native and fallback cancellation both honor a saving guard", () => {
  for (const native of [true, false]) {
    const f = fixture();
    const panel = f.dialog({ native });
    panel.addEventListener("cancel", (event) => event.preventDefault());
    panel.show();
    const click = f.click({});
    assert.equal(panel.open, true);
    assert.equal(click.defaultPrevented, true);
    f.destroy();
  }
});

test("padding, inputs, inside-to-outside drags, and cancelled pointers keep the dialog open", () => {
  const f = fixture();
  const editor = f.dialog({ modal: true });
  editor.show();
  f.click(editor, { clientX: 120, clientY: 120 });
  f.click({ parent: editor }, { clientX: 120, clientY: 120 });
  f.emit("pointerdown", { target: editor, clientX: 120, clientY: 120 });
  f.emit("click", { target: editor });
  f.emit("pointerdown", { target: editor });
  f.emit("pointercancel", { target: editor });
  f.emit("click", { target: editor });
  assert.equal(editor.open, true);
});

test("an opening click, keyboard activation, and mismatched pointers cannot dismiss a dialog", () => {
  const f = fixture();
  const panel = f.dialog();
  f.emit("pointerdown");
  panel.show();
  f.emit("click");
  assert.equal(panel.open, true);
  f.emit("pointerdown");
  f.emit("click", { detail: 0 });
  f.emit("pointerdown", { pointerId: 2 });
  f.emit("click", { pointerId: 3 });
  assert.equal(panel.open, true);
});

test("only the newest modal closes even when its DOM order precedes its caller", () => {
  const f = fixture();
  const editor = f.dialog({ modal: true });
  const calendar = f.dialog({ modal: true });
  const panel = f.dialog();
  panel.show();
  calendar.show();
  editor.show();
  f.click(editor);
  assert.equal(editor.open, false);
  assert.equal(calendar.open, true);
  assert.equal(panel.open, true);
  f.click(calendar);
  assert.equal(calendar.open, false);
  assert.equal(panel.open, true);
});

test("an outside page click closes only the latest nonmodal panel through its cancel handler", () => {
  const f = fixture();
  const goal = f.dialog();
  const waiting = f.dialog();
  let capturedDraft = false;
  waiting.addEventListener("cancel", () => {
    capturedDraft = true;
  });
  goal.show();
  waiting.show();
  f.click({});
  assert.equal(waiting.open, false);
  assert.equal(goal.open, true);
  assert.equal(capturedDraft, true);
});

test("a popover dismissed between pointerdown and click protects its parent panel", () => {
  const f = fixture();
  const panel = f.dialog();
  panel.show();
  f.setPopover(true);
  f.emit("pointerdown");
  f.setPopover(false);
  f.emit("click");
  assert.equal(panel.open, true);
  f.click({});
  assert.equal(panel.open, false);
});

test("reopened dialogs and a changed top layer are protected from an earlier gesture", () => {
  const f = fixture();
  const panel = f.dialog();
  const child = f.dialog({ modal: true });
  panel.show();
  f.emit("pointerdown");
  panel.close();
  panel.show();
  f.emit("click");
  assert.equal(panel.open, true);
  f.emit("pointerdown");
  child.show();
  f.emit("click", { target: child });
  assert.equal(child.open, true);
  assert.equal(panel.open, true);
});

test("page teardown removes dismissal listeners", () => {
  const f = fixture();
  const panel = f.dialog();
  panel.show();
  f.destroy();
  f.click({});
  assert.equal(panel.open, true);
});
