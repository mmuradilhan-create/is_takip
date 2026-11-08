export const WIDGET_VIEWPORT = Object.freeze({ width: 380, height: 420 });
export const WIDGET_OUTER_FALLBACK = Object.freeze({ width: 400, height: 480 });
const widgetSizing = new WeakMap();

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Request the monitor's work area for a newly created main window. */
export function desktopWindowFeatures(metrics = {}) {
  const screen = metrics.screen || {};
  const width = Math.max(1, Math.round(positive(screen.availWidth, 1280)));
  const height = Math.max(1, Math.round(positive(screen.availHeight, 850)));
  const left = Number.isFinite(screen.availLeft)
    ? Math.round(screen.availLeft)
    : 0;
  const top = Number.isFinite(screen.availTop)
    ? Math.round(screen.availTop)
    : 0;
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

/** Browser dimensions use CSS pixels, including on a scaled Windows display. */
export function widgetWindowSize(metrics = {}) {
  const frameWidth =
    Number.isFinite(metrics.innerWidth) &&
    metrics.innerWidth > 0 &&
    Number.isFinite(metrics.outerWidth) &&
    metrics.outerWidth >= metrics.innerWidth
      ? metrics.outerWidth - metrics.innerWidth
      : WIDGET_OUTER_FALLBACK.width - WIDGET_VIEWPORT.width;
  const frameHeight =
    Number.isFinite(metrics.innerHeight) &&
    metrics.innerHeight > 0 &&
    Number.isFinite(metrics.outerHeight) &&
    metrics.outerHeight >= metrics.innerHeight
      ? metrics.outerHeight - metrics.innerHeight
      : WIDGET_OUTER_FALLBACK.height - WIDGET_VIEWPORT.height;
  return {
    width: Math.round(
      Math.min(
        WIDGET_VIEWPORT.width + frameWidth,
        positive(metrics.screen?.availWidth, Infinity),
      ),
    ),
    height: Math.round(
      Math.min(
        WIDGET_VIEWPORT.height + frameHeight,
        positive(metrics.screen?.availHeight, Infinity),
      ),
    ),
  };
}

/** Let Chrome finish restoring its frame, then leave manual resizing alone. */
export function fitWidgetWindow(win = globalThis.window) {
  if (!win || typeof win.resizeTo !== "function") return () => {};
  widgetSizing.get(win)?.();
  let stopped = false;
  let resizeTimer;
  const timers = new Set();
  function schedule(callback, delay) {
    const timer = win.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) win.clearTimeout(timer);
    timers.clear();
    win.removeEventListener?.("resize", onResize);
    if (widgetSizing.get(win) === stop) widgetSizing.delete(win);
  }
  function fit() {
    if (stopped) return;
    if (win.closed) {
      stop();
      return;
    }
    try {
      const size = widgetWindowSize(win);
      if (
        Math.abs(win.outerWidth - size.width) > 0.5 ||
        Math.abs(win.outerHeight - size.height) > 0.5
      ) {
        win.resizeTo(size.width, size.height);
      }
    } catch {
      // A normal tab may forbid resizing. The Windows launcher also measures
      // the widget's native renderer and corrects only its newly opened window.
    }
  }
  function onResize() {
    if (stopped) return;
    if (resizeTimer !== undefined) {
      win.clearTimeout(resizeTimer);
      timers.delete(resizeTimer);
    }
    resizeTimer = schedule(fit, 40);
  }
  widgetSizing.set(win, stop);
  win.addEventListener?.("resize", onResize);
  fit();
  if (stopped) return stop;
  // Chrome may apply remembered placement or change frame metrics after load.
  // Sampling stays bounded, including when resizeTo is denied by the browser.
  for (const delay of [50, 150, 300, 600, 1000, 1600, 2400])
    schedule(fit, delay);
  schedule(stop, 2500);
  return stop;
}
