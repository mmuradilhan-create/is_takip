import test from "node:test";
import assert from "node:assert/strict";
import { createWindowCoordinator } from "../src/window-coordinator.js";

function environment({
  broadcast = true,
  locks = true,
  storageFails = false,
} = {}) {
  const values = new Map([
    ["is-takip-v1", "untouched-workspace"],
    ["is-takip-v1-preferences", "untouched-preferences"],
  ]);
  const windows = [];
  const channels = new Map();
  const held = new Map();
  const writes = [];
  let time = 100000;
  const lockManager = {
    query: async () => ({
      held: [...held.keys()].map((name) => ({ name })),
      pending: [],
    }),
    request(name, options, callback) {
      if (held.has(name))
        return new Promise((resolve, reject) =>
          options.signal?.addEventListener(
            "abort",
            () => reject(new Error("Aborted")),
            { once: true },
          ),
        );
      held.set(name, true);
      return Promise.resolve()
        .then(callback)
        .finally(() => held.delete(name));
    },
  };
  function createWindow(href = "file:///C:/ODAK/TAKIP.html#widget") {
    const owner = new EventTarget();
    Object.assign(owner, {
      location: { href },
      crypto: globalThis.crypto,
      Date: { now: () => time },
      AbortController,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      navigator: locks ? { locks: lockManager } : {},
    });
    function storageEvent(key, newValue) {
      for (const other of windows)
        if (other !== owner)
          queueMicrotask(() => {
            const event = new Event("storage");
            Object.defineProperties(event, {
              key: { value: key },
              newValue: { value: newValue },
            });
            other.dispatchEvent(event);
          });
    }
    owner.localStorage = {
      get length() {
        if (storageFails) throw new Error("Blocked");
        return values.size;
      },
      key(index) {
        return [...values.keys()][index] || null;
      },
      getItem(key) {
        if (storageFails) throw new Error("Blocked");
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageFails) throw new Error("Blocked");
        writes.push({ owner, key });
        values.set(key, value);
        storageEvent(key, value);
      },
      removeItem(key) {
        if (storageFails) throw new Error("Blocked");
        writes.push({ owner, key });
        values.delete(key);
        storageEvent(key, null);
      },
    };
    if (broadcast)
      owner.BroadcastChannel = class {
        constructor(name) {
          this.name = name;
          this.closed = false;
          if (!channels.has(name)) channels.set(name, new Set());
          channels.get(name).add(this);
        }
        postMessage(data) {
          for (const channel of channels.get(this.name))
            if (channel !== this)
              queueMicrotask(() => {
                if (!channel.closed)
                  channel.onmessage?.({ data: structuredClone(data) });
              });
        }
        close() {
          this.closed = true;
          channels.get(this.name).delete(this);
        }
      };
    windows.push(owner);
    return owner;
  }
  return {
    createWindow,
    values,
    writes,
    held,
    tick: (milliseconds) => {
      time += milliseconds;
    },
  };
}

test("widget initialization is read-only and activation reaches exactly one main through duplicate transports", async () => {
  const env = environment();
  const mainWindow = env.createWindow("file:///C:/ODAK/TAKIP.html#desktop");
  const calls = [];
  const main = createWindowCoordinator({
    window: mainWindow,
    onActivateMain: (recordId) => {
      calls.push(recordId);
      return { focused: false };
    },
  });
  const widgetWindow = env.createWindow();
  const before = env.writes.length;
  const widget = createWindowCoordinator({ window: widgetWindow });
  assert.equal(env.writes.length, before);
  const result = await widget.activateMain("opaque-record-id");
  assert.deepEqual(result, { existing: true, focused: false });
  assert.deepEqual(calls, ["opaque-record-id"]);
  widget.stop();
  main.stop();
  assert.equal(env.values.get("is-takip-v1"), "untouched-workspace");
  assert.equal(
    env.values.get("is-takip-v1-preferences"),
    "untouched-preferences",
  );
  assert.ok(env.writes.every(({ key }) => key.startsWith("odak-windows:")));
  assert.deepEqual([...env.values.keys()].sort(), [
    "is-takip-v1",
    "is-takip-v1-preferences",
  ]);
});

test("native sizing ownership stays in the same window scope as plain HTML through either transport", async () => {
  for (const broadcast of [true, false]) {
    const env = environment({ broadcast });
    const calls = [];
    const main = createWindowCoordinator({
      window: env.createWindow(
        "file:///C:/ODAK/TAKIP.html#desktop?record=example&windowSizing=native",
      ),
      onActivateMain: (id) => {
        calls.push(id);
        return { focused: true };
      },
    });
    const widget = createWindowCoordinator({
      window: env.createWindow("file:///C:/ODAK/TAKIP.html#widget"),
      onActivateWidget: () => {
        calls.push("widget");
        return { focused: true };
      },
    });
    try {
      assert.deepEqual(await main.activateWidget(), {
        existing: true,
        focused: true,
      });
      assert.deepEqual(await widget.activateMain("saved-record"), {
        existing: true,
        focused: true,
      });
      assert.deepEqual(calls, ["widget", "saved-record"]);
      assert.equal(env.values.get("is-takip-v1"), "untouched-workspace");
    } finally {
      widget.stop();
      main.stop();
    }
  }
});

test("the last focused main is targeted and localStorage carries requests when BroadcastChannel is unavailable", async () => {
  const env = environment({ broadcast: false, locks: false });
  const calls = [];
  const firstWindow = env.createWindow();
  const first = createWindowCoordinator({
    window: firstWindow,
    onActivateMain: () => {
      calls.push("first");
      return { focused: true };
    },
  });
  env.tick(10);
  const second = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => {
      calls.push("second");
      return { focused: true };
    },
  });
  env.tick(10);
  firstWindow.dispatchEvent(new Event("focus"));
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(calls, ["first"]);
  widget.stop();
  first.stop();
  second.stop();
});

test("BroadcastChannel discovery activates a main even when storage is inaccessible", async () => {
  const env = environment({ storageFails: true });
  const calls = [];
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: (id) => {
      calls.push(id);
      return { focused: true };
    },
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain("record / & #"), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(calls, ["record / & #"]);
  widget.stop();
  main.stop();
});

test("a held main lock prevents duplicate fallback when activation is unresponsive and repeated clicks share a request", async () => {
  const env = environment();
  let calls = 0;
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => {
      calls++;
      return new Promise(() => {});
    },
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  const pending = widget.activateMain();
  assert.equal(widget.activateMain(), pending);
  assert.deepEqual(await pending, {
    existing: true,
    focused: false,
    unresponsive: true,
  });
  assert.equal(calls, 1);
  widget.stop();
  main.stop();
});

test("fresh presence prevents duplicate fallback when Web Locks are unavailable", async () => {
  const env = environment({ locks: false });
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => new Promise(() => {}),
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: true,
    focused: false,
    unresponsive: true,
  });
  widget.stop();
  main.stop();
});

test("different HTML files never share a main and stopping a pending requester cleans its mailbox", async () => {
  const env = environment();
  const main = createWindowCoordinator({
    window: env.createWindow("file:///C:/Other/TAKIP.html#desktop"),
    onActivateMain: () => {
      throw new Error("Wrong scope");
    },
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: false,
    focused: false,
  });
  const pending = widget.activateMain();
  widget.stop();
  assert.deepEqual(await pending, { existing: false, focused: false });
  main.stop();
  assert.deepEqual([...env.values.keys()].sort(), [
    "is-takip-v1",
    "is-takip-v1-preferences",
  ]);
});

test("a rejected main lock request retains fresh presence even when lock queries succeed", async () => {
  const env = environment();
  const mainWindow = env.createWindow();
  mainWindow.navigator = {
    locks: { request: () => Promise.reject(new Error("File origin denied")) },
  };
  const main = createWindowCoordinator({
    window: mainWindow,
    onActivateMain: () => new Promise(() => {}),
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: true,
    focused: false,
    unresponsive: true,
  });
  widget.stop();
  main.stop();
});

test("live discovery takes priority over a leftover presence with a newer focus timestamp", async () => {
  const env = environment();
  const scope = "file:///C:/ODAK/TAKIP.html";
  const ghostKey = `odak-windows:${scope}:main:ghost`;
  env.values.set(
    ghostKey,
    JSON.stringify({
      version: 1,
      scope,
      id: "ghost",
      seenAt: 100000,
      focusedAt: 100005,
      lockState: "held",
    }),
  );
  const calls = [];
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => {
      calls.push("live");
      return { focused: true };
    },
  });
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(calls, ["live"]);
  widget.stop();
  main.stop();
  env.values.delete(ghostKey);
});

test("a leftover held presence does not report an existing main after its browser lock disappears", async () => {
  const env = environment();
  const scope = "file:///C:/ODAK/TAKIP.html";
  env.values.set(
    `odak-windows:${scope}:main:ghost`,
    JSON.stringify({
      version: 1,
      scope,
      id: "ghost",
      seenAt: 100000,
      focusedAt: 100000,
      lockState: "held",
    }),
  );
  const widget = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await widget.activateMain(), {
    existing: false,
    focused: false,
  });
  widget.stop();
});

test("main and independent widget activate each other without confusing roles, including a reloaded main", async () => {
  const env = environment();
  const calls = [];
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: (recordId) => {
      calls.push(["main", recordId]);
      return { focused: true };
    },
  });
  const widget = createWindowCoordinator({
    window: env.createWindow(),
    onActivateWidget: () => {
      calls.push(["widget"]);
      return { focused: true };
    },
  });
  assert.deepEqual(await main.activateWidget(), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(await widget.activateMain("selected-record"), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(calls, [["widget"], ["main", "selected-record"]]);
  main.stop();
  const replacementMain = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => ({ focused: true }),
  });
  assert.deepEqual(await replacementMain.activateWidget(), {
    existing: true,
    focused: true,
  });
  assert.deepEqual(calls, [
    ["widget"],
    ["main", "selected-record"],
    ["widget"],
  ]);
  replacementMain.stop();
  widget.stop();
  assert.deepEqual([...env.values.keys()].sort(), [
    "is-takip-v1",
    "is-takip-v1-preferences",
  ]);
});

test("a widget lock cannot claim a main exists, and closed widgets are unavailable to an existing main", async () => {
  const env = environment();
  const widget = createWindowCoordinator({
    window: env.createWindow(),
    onActivateWidget: () => ({ focused: true }),
  });
  const observer = createWindowCoordinator({ window: env.createWindow() });
  assert.deepEqual(await observer.activateMain(), {
    existing: false,
    focused: false,
  });
  assert.deepEqual(await observer.activateWidget(), {
    existing: true,
    focused: true,
  });
  widget.stop();
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => ({ focused: true }),
  });
  assert.deepEqual(await main.activateWidget(), {
    existing: false,
    focused: false,
  });
  observer.stop();
  main.stop();
});

test("different role requests keep separate promises and callbacks", async () => {
  const env = environment();
  const main = createWindowCoordinator({
    window: env.createWindow(),
    onActivateMain: () => ({ focused: true }),
  });
  const widget = createWindowCoordinator({
    window: env.createWindow(),
    onActivateWidget: () => ({ focused: false }),
  });
  const observer = createWindowCoordinator({ window: env.createWindow() });
  const mainRequest = observer.activateMain();
  const widgetRequest = observer.activateWidget();
  assert.notEqual(mainRequest, widgetRequest);
  assert.equal(observer.activateWidget(), widgetRequest);
  assert.deepEqual(await mainRequest, { existing: true, focused: true });
  assert.deepEqual(await widgetRequest, { existing: true, focused: false });
  observer.stop();
  main.stop();
  widget.stop();
});
