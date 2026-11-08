const THEMES = new Set(["light", "dark", "system"]);
const DENSITIES = new Set(["comfortable", "compact"]);

/** Keep old density-only snapshots unchanged unless a theme was chosen. */
export function normalizePreferences(input) {
  const preferences = {
    density: input?.density === "compact" ? "compact" : "comfortable",
  };
  if (input && Object.hasOwn(input, "theme") && THEMES.has(input.theme)) {
    preferences.theme = input.theme;
  }
  if (
    input &&
    Object.hasOwn(input, "choiceLists") &&
    validChoiceLists(input.choiceLists)
  ) {
    preferences.choiceLists = normalizeChoiceLists(input.choiceLists);
  }
  return preferences;
}

export function validPreferences(input, { strict = false } = {}) {
  return (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    DENSITIES.has(input.density) &&
    (!Object.hasOwn(input, "theme") || THEMES.has(input.theme)) &&
    (!Object.hasOwn(input, "choiceLists") ||
      validChoiceLists(input.choiceLists)) &&
    (!strict ||
      Object.keys(input).every((key) =>
        ["density", "theme", "choiceLists"].includes(key),
      ))
  );
}

function requestedTheme(preferences) {
  if (typeof preferences === "string") return preferences;
  return preferences && Object.hasOwn(preferences, "theme")
    ? preferences.theme
    : undefined;
}

function systemQuery(environment) {
  try {
    if (typeof environment === "function") {
      return environment("(prefers-color-scheme: dark)");
    }
    return environment?.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  } catch {
    return null;
  }
}

export function resolveTheme(preferences, environment = globalThis.window) {
  const requested = requestedTheme(preferences);
  if (requested === "dark") return "dark";
  if (requested === "system" && systemQuery(environment)?.matches)
    return "dark";
  return "light";
}

/** Rendering a preference never writes or migrates the saved workspace. */
export function applyTheme(
  document,
  preferences,
  environment = document?.defaultView ?? globalThis.window,
) {
  const theme = resolveTheme(preferences, environment);
  const root = document?.documentElement;
  if (root) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  }
  document
    ?.querySelector?.('meta[name="color-scheme"]')
    ?.setAttribute("content", theme);
  return theme;
}

/** Reapply only an explicitly selected system theme when the OS changes. */
export function watchTheme(
  document,
  getPreferences,
  environment = document?.defaultView ?? globalThis.window,
) {
  const current = () =>
    typeof getPreferences === "function" ? getPreferences() : getPreferences;
  applyTheme(document, current(), environment);
  const query = systemQuery(environment);
  const update = () => {
    if (requestedTheme(current()) === "system") {
      applyTheme(document, current(), environment);
    }
  };
  if (typeof query?.addEventListener === "function") {
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }
  query?.addListener?.(update);
  return () => query?.removeListener?.(update);
}
import { normalizeChoiceLists, validChoiceLists } from "./choice-catalogs.js";
