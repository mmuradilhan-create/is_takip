import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopWindowFeatures,
  widgetWindowSize,
  fitWidgetWindow,
  windowSizingMode,
  windowRoleHash,
  windowPinSupported,
} from "../src/window-size.js";

const windowFeatures = (metrics) =>
  Object.fromEntries(
    desktopWindowFeatures(metrics)
      .split(",")
      .map((feature) => feature.split("=")),
  );

test("new main windows use available monitor work area in CSS pixels and preserve negative monitor origins", () => {
  const metrics = {
    innerWidth: 380,
    innerHeight: 420,
    devicePixelRatio: 1.5,
    screen: {
      availWidth: 1707,
      availHeight: 920,
      availLeft: -1707,
      availTop: -120,
    },
  };
  assert.deepEqual(windowFeatures(metrics), {
    popup: "yes",
    width: "1707",
    height: "920",
    left: "-1707",
    top: "-120",
    resizable: "yes",
    scrollbars: "yes",
  });
  assert.equal(metrics.innerWidth, 380);
  assert.equal(metrics.innerHeight, 420);
  assert.deepEqual(
    windowFeatures({
      screen: {
        availWidth: 1920,
        availHeight: 1040,
        availLeft: 0,
        availTop: 0,
      },
    }),
    {
      ...windowFeatures(metrics),
      width: "1920",
      height: "1040",
      left: "0",
      top: "0",
    },
  );
});

test("unknown monitor geometry uses bounded main-window defaults rather than invalid popup values", () => {
  const fallback = {
    popup: "yes",
    width: "1920",
    height: "1080",
    left: "0",
    top: "0",
    resizable: "yes",
    scrollbars: "yes",
  };
  assert.deepEqual(windowFeatures(), fallback);
  assert.deepEqual(
    windowFeatures({
      screen: {
        availWidth: 0,
        availHeight: -1,
        availLeft: Infinity,
        availTop: NaN,
      },
    }),
    fallback,
  );
  assert.deepEqual(
    windowFeatures({ screen: { availWidth: 640, availHeight: 440 } }),
    { ...fallback, width: "640", height: "440" },
  );
});

test("native sizing requires the helper-ready fragment marker", () => {
  for (const hash of [
    "#widget?windowSizing=native",
    "#desktop?record=example&windowSizing=native",
  ])
    assert.equal(windowSizingMode({ location: { hash } }), "native");
  for (const hash of [
    "",
    "#widget",
    "#desktop?record=windowSizing%3Dnative",
    "#widget?windowSizing=browser",
  ])
    assert.equal(windowSizingMode({ location: { hash } }), "browser");
  assert.equal(
    windowSizingMode({ location: { search: "?windowSizing=native" } }),
    "browser",
  );
  assert.equal(windowSizingMode(null), "browser");
});

test("pin controls require both helper capabilities and survive main/widget navigation", () => {
  const owner = {
    location: {
      hash: "#widget?windowSizing=native&windowPin=native",
    },
  };
  assert.equal(windowPinSupported(owner), true);
  const mainHash = windowRoleHash("desktop", owner, {
    record: "saved & record",
  });
  const main = { location: { hash: `#${mainHash}` } };
  assert.equal(windowPinSupported(main), true);
  assert.equal(
    new URLSearchParams(mainHash.split("?")[1]).get("record"),
    "saved & record",
  );
  assert.equal(
    windowRoleHash("widget", main),
    "widget?windowSizing=native&windowPin=native",
  );
  for (const hash of [
    "#widget",
    "#widget?windowSizing=native",
    "#widget?windowPin=native",
    "#widget?windowSizing=native&windowPin=browser",
    "#widget?record=windowPin%3Dnative",
  ])
    assert.equal(windowPinSupported({ location: { hash } }), false);
  assert.equal(windowPinSupported(null), false);
  assert.equal(
    windowRoleHash("widget", {
      location: { hash: "#desktop?windowPin=native" },
    }),
    "widget",
  );
});

test("new main and widget windows carry sizing ownership without changing their workspace scope or record target", () => {
  const owner = {
    location: new URL("file:///work/TAKIP.html#desktop?windowSizing=native"),
  };
  const widget = new URL(owner.location);
  widget.hash = windowRoleHash("widget", owner);
  assert.equal(widget.hash, "#widget?windowSizing=native");
  assert.equal(windowSizingMode({ location: widget }), "native");
  const main = new URL(widget);
  main.hash = windowRoleHash(
    "desktop",
    { location: widget },
    { record: "a b&c" },
  );
  const query = new URLSearchParams(main.hash.split("?")[1]);
  assert.equal(query.get("record"), "a b&c");
  assert.equal(query.get("windowSizing"), "native");
  assert.equal(
    windowRoleHash("desktop", { location: widget }),
    "desktop?windowSizing=native",
  );
  for (const url of [main, widget]) {
    url.hash = "";
    assert.equal(url.href, "file:///work/TAKIP.html");
  }
  assert.equal(windowRoleHash("widget", {}), "widget");
  assert.equal(
    windowRoleHash("desktop", {}, { record: "example" }),
    "desktop?record=example",
  );
});

test("widget bounds add the actual browser frame to the small content viewport", () => {
  assert.deepEqual(
    widgetWindowSize({
      innerWidth: 1200,
      innerHeight: 800,
      outerWidth: 1216,
      outerHeight: 839,
    }),
    { width: 396, height: 459 },
  );
  assert.deepEqual(
    widgetWindowSize({
      innerWidth: 380,
      innerHeight: 420,
      outerWidth: 380,
      outerHeight: 420,
    }),
    { width: 380, height: 420 },
  );
  assert.deepEqual(widgetWindowSize(), { width: 400, height: 480 });
});

test("widget bounds fit available CSS screen pixels without scaling twice for devicePixelRatio", () => {
  assert.deepEqual(
    widgetWindowSize({
      innerWidth: 1200,
      innerHeight: 800,
      outerWidth: 1216,
      outerHeight: 839,
      devicePixelRatio: 1.5,
      screen: { availWidth: 360, availHeight: 440 },
    }),
    { width: 360, height: 440 },
  );
  assert.deepEqual(
    widgetWindowSize({ screen: { availWidth: 0, availHeight: 0 } }),
    { width: 400, height: 480 },
  );
});

function simulatedWidget({ scale = 1, denied = false, native = false } = {}) {
  let now = 0;
  let nextId = 1;
  let frameWidth = 16;
  let frameHeight = 39;
  const timers = new Map();
  const listeners = new Map();
  const calls = [];
  function emit(type) {
    for (const listener of [...(listeners.get(type) || [])]) listener();
  }
  const win = {
    location: { hash: native ? "#widget?windowSizing=native" : "#widget" },
    innerWidth: 1264,
    innerHeight: 811,
    outerWidth: 1280,
    outerHeight: 850,
    devicePixelRatio: scale,
    screen: { availWidth: 1920 / scale, availHeight: 1040 / scale },
    closed: false,
    resizeTo(width, height) {
      calls.push([width, height]);
      if (denied) throw Error("Not permitted");
      win.outerWidth = width;
      win.outerHeight = height;
      win.innerWidth = width - frameWidth;
      win.innerHeight = height - frameHeight;
      emit("resize");
    },
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    win,
    calls,
    emit,
    advance(milliseconds) {
      const end = now + milliseconds;
      while (timers.size) {
        const [id, next] = [...timers.entries()].sort(
          (a, b) => a[1].at - b[1].at || a[0] - b[0],
        )[0];
        if (next.at > end) break;
        now = next.at;
        timers.delete(id);
        next.callback();
      }
      now = end;
    },
    hostResize(width, height, frame = {}) {
      frameWidth = frame.width ?? frameWidth;
      frameHeight = frame.height ?? frameHeight;
      win.outerWidth = width;
      win.outerHeight = height;
      win.innerWidth = width - frameWidth;
      win.innerHeight = height - frameHeight;
      emit("resize");
    },
    pending: () => ({
      timers: timers.size,
      listeners: [...listeners.values()].reduce(
        (sum, set) => sum + set.size,
        0,
      ),
    }),
  };
}

test("plain HTML corrects the initial frame once and preserves every later manual size", () => {
  const env = simulatedWidget();
  const stop = fitWidgetWindow(env.win);
  assert.equal(fitWidgetWindow(env.win), stop);
  env.advance(100);
  env.hostResize(1400, 920, { width: 20, height: 60 });
  env.advance(99);
  assert.deepEqual(env.calls, []);
  env.advance(1);
  assert.deepEqual(env.calls, [[400, 480]]);
  assert.equal(env.win.innerWidth, 380);
  assert.equal(env.win.innerHeight, 420);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
  env.advance(450);
  env.hostResize(720, 600);
  env.emit("focus");
  assert.equal(fitWidgetWindow(env.win), stop);
  env.advance(10000);
  assert.deepEqual(env.calls, [[400, 480]]);
  assert.equal(env.win.innerWidth, 700);
  assert.equal(env.win.innerHeight, 540);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
});

test("native-managed startup leaves all geometry and sizing timers to the helper", () => {
  const env = simulatedWidget({ native: true });
  fitWidgetWindow(env.win);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
  env.hostResize(1400, 920);
  env.advance(10000);
  assert.deepEqual(env.calls, []);
  assert.equal(env.win.outerWidth, 1400);
  assert.equal(env.win.outerHeight, 920);
});

test("interaction before the startup attempt gives control to the user immediately", () => {
  for (const type of ["pointerdown", "keydown"]) {
    const env = simulatedWidget();
    fitWidgetWindow(env.win);
    env.advance(100);
    env.emit(type);
    env.hostResize(720, 600);
    fitWidgetWindow(env.win);
    env.advance(10000);
    assert.deepEqual(env.calls, [], type);
    assert.equal(env.win.outerWidth, 720);
    assert.equal(env.win.outerHeight, 600);
    assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
  }
});

test("an already compact popup is left at its requested size without geometry writes", () => {
  const env = simulatedWidget();
  env.hostResize(396, 459);
  fitWidgetWindow(env.win);
  env.advance(10000);
  assert.deepEqual(env.calls, []);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
});

test("CSS viewport calibration is identical at 100, 125, 150 and 200 percent display scale", () => {
  for (const scale of [1, 1.25, 1.5, 2]) {
    const env = simulatedWidget({ scale });
    fitWidgetWindow(env.win);
    env.advance(2600);
    assert.deepEqual(env.calls, [[396, 459]], `scale ${scale}`);
    assert.equal(env.win.innerWidth, 380);
    assert.equal(env.win.innerHeight, 420);
  }
});

test("transient inconsistent outer metrics use a bounded initial frame instead of a negative measurement", () => {
  assert.deepEqual(
    widgetWindowSize({
      innerWidth: 1280,
      innerHeight: 850,
      outerWidth: 400,
      outerHeight: 480,
    }),
    { width: 400, height: 480 },
  );
});

test("cleanup, closure and denied resizing end all startup work without a permanent listener", () => {
  const env = simulatedWidget();
  const stop = fitWidgetWindow(env.win);
  stop();
  const count = env.calls.length;
  env.advance(10000);
  env.hostResize(900, 700);
  assert.equal(env.calls.length, count);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });

  const denied = simulatedWidget({ denied: true });
  assert.doesNotThrow(() => fitWidgetWindow(denied.win));
  denied.advance(3000);
  assert.deepEqual(denied.calls, [[396, 459]]);
  assert.deepEqual(denied.pending(), { timers: 0, listeners: 0 });

  const closed = simulatedWidget();
  fitWidgetWindow(closed.win);
  closed.win.closed = true;
  closed.advance(200);
  assert.deepEqual(closed.pending(), { timers: 0, listeners: 0 });
  const alreadyClosed = simulatedWidget();
  alreadyClosed.win.closed = true;
  fitWidgetWindow(alreadyClosed.win);
  assert.equal(alreadyClosed.calls.length, 0);
  assert.deepEqual(alreadyClosed.pending(), { timers: 0, listeners: 0 });
  assert.doesNotThrow(() => fitWidgetWindow(null)());
});
