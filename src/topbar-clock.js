const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const pad = (value) => String(value).padStart(2, "0");

/** Refresh the local header clock without rendering views or saving data. */
export function createTopbarClock({
  root = document,
  now = () => new Date(),
} = {}) {
  const document = root?.ownerDocument || root;
  const owner = document?.defaultView;
  if (!root?.querySelector || !document?.addEventListener || !owner?.setTimeout)
    throw new TypeError("Üst çubuk saati için bir ekran kökü gereklidir.");
  if (typeof now !== "function")
    throw new TypeError("Saat kaynağı geçerli bir işlev olmalıdır.");
  let destroyed = false;
  let timer = null;

  function refresh() {
    if (destroyed) return;
    owner.clearTimeout(timer);
    timer = null;
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
      throw new TypeError("Üst çubuk saati için geçerli bir tarih gereklidir.");
    const dateLabel = dateFormatter.format(date);
    const dateKey = `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    for (const [selector, text, value] of [
      [".today-date", dateLabel, dateKey],
      [".today-clock", time, time],
    ]) {
      const element = root.querySelector(selector);
      if (!element) continue;
      if (element.textContent !== text) element.textContent = text;
      if (element.getAttribute("datetime") !== value)
        element.setAttribute("datetime", value);
    }
    // Read the clock again on each callback instead of accumulating timer drift.
    timer = owner.setTimeout(refresh, 60000 - (date.getTime() % 60000));
  }

  function onVisible() {
    if (!document.hidden) refresh();
  }

  refresh();
  document.addEventListener("visibilitychange", onVisible);
  owner.addEventListener("focus", refresh);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    owner.clearTimeout(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisible);
    owner.removeEventListener("focus", refresh);
  }

  return { refresh, destroy };
}
