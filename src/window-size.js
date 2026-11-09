export const WIDGET_VIEWPORT = Object.freeze({ width: 380, height: 420 });
export const WIDGET_OUTER_FALLBACK = Object.freeze({ width: 400, height: 480 });
const widgetSizing = new WeakMap();

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The launcher marks native sizing only after its helper is ready. */
export function windowSizingMode(win = globalThis.window) {
  const parameters = new URLSearchParams(win?.location?.hash?.split("?")[1]);
  return parameters.get("windowSizing") === "native" ? "native" : "browser";
}

/** Keep sizing ownership in the fragment so workspace/window identity stays the same. */
export function windowRoleHash(role, win = globalThis.window, parameters = {}) {
  const query = new URLSearchParams(parameters);
  if (windowSizingMode(win) === "native") query.set("windowSizing", "native");
  return query.size ? `${role}?${query}` : role;
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

/** Size unmanaged windows once; native launches have one owner in the helper. */
export function fitWidgetWindow(win = globalThis.window) {
  if (
    !win ||
    win.closed ||
    windowSizingMode(win) === "native" ||
    typeof win.resizeTo !== "function"
  )
    return () => {};
  const existing = widgetSizing.get(win);
  if (existing) return existing;
  let stopped = false;
  let timer;
  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) win.clearTimeout(timer);
    win.removeEventListener?.("pointerdown", stop, true);
    win.removeEventListener?.("keydown", stop, true);
  }
  function fit() {
    if (stopped) return;
    stop();
    if (win.closed) return;
    try {
      const size = widgetWindowSize(win);
      if (
        Math.abs(win.outerWidth - size.width) > 0.5 ||
        Math.abs(win.outerHeight - size.height) > 0.5
      ) {
        win.resizeTo(size.width, size.height);
      }
    } catch {
      // A normal tab may forbid resizing. Leave it alone without retrying.
    }
  }
  widgetSizing.set(win, stop);
  win.addEventListener?.("pointerdown", stop, { once: true, capture: true });
  win.addEventListener?.("keydown", stop, { once: true, capture: true });
  // Popup features already request the compact viewport. Only correct a
  // different initial frame, and give control to the user after this attempt.
  timer = win.setTimeout(fit, 200);
  return stop;
}
