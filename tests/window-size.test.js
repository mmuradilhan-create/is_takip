import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopWindowFeatures,
  widgetWindowSize,
  fitWidgetWindow,
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
    width: "1280",
    height: "850",
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

function simulatedWidget({ scale = 1, denied = false } = {}) {
  let now = 0;
  let nextId = 1;
  let frameWidth = 16;
  let frameHeight = 39;
  const timers = new Map();
  const listeners = new Set();
  const calls = [];
  const win = {
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
      for (const listener of listeners) listener();
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
      if (type === "resize") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "resize") listeners.delete(listener);
    },
  };
  return {
    win,
    calls,
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
      for (const listener of listeners) listener();
    },
    pending: () => ({ timers: timers.size, listeners: listeners.size }),
  };
}

test("startup converges after a late restored size and changed browser frame, then releases manual resizing", () => {
  const env = simulatedWidget();
  fitWidgetWindow(env.win);
  assert.deepEqual(env.calls, [[396, 459]]);
  assert.equal(env.win.innerWidth, 380);
  assert.equal(env.win.innerHeight, 420);
  env.advance(800);
  env.hostResize(1400, 920, { width: 20, height: 60 });
  env.advance(40);
  assert.deepEqual(env.calls.at(-1), [400, 480]);
  assert.equal(env.win.innerWidth, 380);
  assert.equal(env.win.innerHeight, 420);
  env.advance(2000);
  assert.deepEqual(env.pending(), { timers: 0, listeners: 0 });
  const count = env.calls.length;
  env.hostResize(720, 600);
  env.advance(10000);
  assert.equal(env.calls.length, count);
  assert.equal(env.win.innerWidth, 700);
  assert.equal(env.win.innerHeight, 540);
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
  assert(denied.calls.length > 1 && denied.calls.length < 20);
  assert.deepEqual(denied.pending(), { timers: 0, listeners: 0 });

  const closed = simulatedWidget();
  fitWidgetWindow(closed.win);
  closed.win.closed = true;
  closed.advance(100);
  assert.deepEqual(closed.pending(), { timers: 0, listeners: 0 });
  const alreadyClosed = simulatedWidget();
  alreadyClosed.win.closed = true;
  fitWidgetWindow(alreadyClosed.win);
  assert.equal(alreadyClosed.calls.length, 0);
  assert.deepEqual(alreadyClosed.pending(), { timers: 0, listeners: 0 });
  assert.doesNotThrow(() => fitWidgetWindow(null)());
});
