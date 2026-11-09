export const PRIMARY_WORKSPACE_KEY = "is-takip-v1";
export const LEGACY_WORK_SESSION_KEY = `${PRIMARY_WORKSPACE_KEY}-work-session`;

export function workspaceDomainRaw(raw, originalRaw = raw) {
  if (raw === null) return null;
  const data = JSON.parse(raw);
  if (!Object.hasOwn(data.odak || {}, "workSessions")) return raw;
  delete data.odak.workSessions;
  const original = originalRaw === null ? null : JSON.parse(originalRaw);
  if (
    original &&
    !Object.hasOwn(original, "odak") &&
    data.odak.version === 1 &&
    Object.keys(data.odak).length === 1
  )
    delete data.odak;
  return JSON.stringify(data);
}

export async function readWorkspaceDomainRaw(page, originalRaw) {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    PRIMARY_WORKSPACE_KEY,
  );
  return workspaceDomainRaw(raw, originalRaw);
}

export async function readEffectiveWorkSessionRaw(page) {
  const { primary, legacy } = await page.evaluate(
    ({ primaryKey, legacyKey }) => ({
      primary: localStorage.getItem(primaryKey),
      legacy: localStorage.getItem(legacyKey),
    }),
    {
      primaryKey: PRIMARY_WORKSPACE_KEY,
      legacyKey: LEGACY_WORK_SESSION_KEY,
    },
  );
  // Inspect actual persisted bytes/order, including deliberate corrupt fixtures.
  // Production validation belongs to the store and must not rewrite this probe.
  const data = primary === null ? null : JSON.parse(primary);
  if (Object.hasOwn(data?.odak || {}, "workSessions")) {
    const value = data.odak.workSessions;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return legacy;
}

export async function readEffectiveWorkSession(page) {
  const raw = await readEffectiveWorkSessionRaw(page);
  return raw === null
    ? { version: 1, currentId: null, entries: [] }
    : JSON.parse(raw);
}

export function workspaceWithSessionRaw(primaryRaw, sessionRaw) {
  const data = JSON.parse(primaryRaw);
  let context;
  if (sessionRaw === null)
    context = { version: 1, currentId: null, entries: [] };
  else {
    try {
      context = JSON.parse(sessionRaw);
    } catch {
      // Corrupt-context fixtures deliberately exercise the authoritative path.
      context = sessionRaw;
    }
  }
  data.odak = { version: 1, ...data.odak, workSessions: context };
  return JSON.stringify(data);
}

export async function writeEffectiveWorkSessionRaw(page, sessionRaw) {
  await page.evaluate(
    ({ key, sessionRaw }) => {
      const data = JSON.parse(localStorage.getItem(key));
      let context;
      if (sessionRaw === null)
        context = { version: 1, currentId: null, entries: [] };
      else {
        try {
          context = JSON.parse(sessionRaw);
        } catch {
          context = sessionRaw;
        }
      }
      data.odak = { version: 1, ...data.odak, workSessions: context };
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: PRIMARY_WORKSPACE_KEY, sessionRaw },
  );
}

// This function is self-contained so page/context.addInitScript can install it.
export function sessionAwareStorageHooks({
  primaryKey = "is-takip-v1",
  baselineRaw,
  sessionQuotaFlag,
  domainWriteCounter,
  sessionWriteCounter,
} = {}) {
  const baseline = baselineRaw ?? localStorage.getItem(primaryKey);
  const originalHasMetadata =
    baseline !== null && Object.hasOwn(JSON.parse(baseline), "odak");
  const domain = (raw) => {
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (data.odak && Object.hasOwn(data.odak, "workSessions")) {
      delete data.odak.workSessions;
      if (
        !originalHasMetadata &&
        data.odak.version === 1 &&
        Object.keys(data.odak).length === 1
      )
        delete data.odak;
    }
    return JSON.stringify(data);
  };
  const context = (raw) =>
    raw === null
      ? null
      : JSON.stringify(JSON.parse(raw).odak?.workSessions ?? null);
  if (sessionQuotaFlag) window[sessionQuotaFlag] = false;
  if (domainWriteCounter) window[domainWriteCounter] = 0;
  if (sessionWriteCounter) window[sessionWriteCounter] = 0;
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) {
    if (this !== window.localStorage || name !== primaryKey)
      return originalSet.call(this, name, value);
    const before = this.getItem(name);
    const domainChanged = domain(before) !== domain(value);
    const contextChanged = context(before) !== context(value);
    if (
      sessionQuotaFlag &&
      window[sessionQuotaFlag] &&
      contextChanged &&
      !domainChanged
    )
      throw new DOMException("Test depolaması dolu", "QuotaExceededError");
    const result = originalSet.call(this, name, value);
    const initialSeed = before === null && value === baseline;
    if (domainWriteCounter && domainChanged && !initialSeed)
      window[domainWriteCounter]++;
    if (sessionWriteCounter && contextChanged && !initialSeed)
      window[sessionWriteCounter]++;
    return result;
  };
}
