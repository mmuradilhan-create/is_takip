import test from "node:test";
import assert from "node:assert/strict";
import { createRecord } from "../src/model.js";
import { createWorkspaceStore } from "../src/workspace-store.js";
import { workspaceSignature } from "../src/workspace-history.js";
import {
  normalizePreferences,
  validPreferences,
  resolveTheme,
  applyTheme,
  watchTheme,
} from "../src/preferences.js";

const KEY = "theme-test-workspace";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createStore(storage) {
  return createWorkspaceStore({ storage, key: KEY });
}

test("normalization preserves legacy density and only adds a valid explicitly chosen theme", () => {
  assert.deepEqual(normalizePreferences(), { density: "comfortable" });
  assert.deepEqual(normalizePreferences({ density: "compact" }), { density: "compact" });
  assert.deepEqual(normalizePreferences({ density: "compact", theme: "system" }), { density: "compact", theme: "system" });
  assert.deepEqual(normalizePreferences({ theme: "invalid" }), { density: "comfortable" });
  assert.deepEqual(normalizePreferences(Object.create({ theme: "dark" })), { density: "comfortable" });
  for (const theme of ["light", "dark", "system"]) {
    assert.equal(validPreferences({ density: "comfortable", theme }), true);
  }
  assert.equal(validPreferences({ density: "compact", theme: "invalid" }), false);
  assert.equal(validPreferences({ density: "compact", other: true }, { strict: true }), false);
});

test("pre-theme signatures and saved undo history load unchanged without a migration write", () => {
  // These signatures are the original density-only canonical representation.
  const oldEntry = {
    version: 1,
    label: "Liste görünümü",
    beforeSignature: "w1:54:a8ad0a11:cd732a53",
    afterSignature: "w1:50:e3a55edc:4168e10b",
    beforeOrder: [],
    afterOrder: [],
    beforePreferences: { density: "comfortable" },
    afterPreferences: { density: "compact" },
    changes: [],
  };
  const raw = JSON.stringify({
    version: 1,
    records: [],
    odak: { version: 1, preferences: { density: "compact" }, history: [oldEntry] },
  });
  const storage = memoryStorage({ [KEY]: raw });
  const store = createStore(storage);
  assert.equal(storage.getItem(KEY), raw);
  assert.deepEqual(storage.writes, []);
  assert.deepEqual(store.history, [oldEntry]);
  assert.equal(workspaceSignature({ records: [], preferences: store.preferences }), oldEntry.afterSignature);
  assert.equal(store.undo(), "Liste görünümü");
  assert.deepEqual(store.preferences, { density: "comfortable" });
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(KEY)).odak.preferences, "theme"), false);
});

test("theme changes share atomic workspace history, synchronize between windows, and undo to absent theme", () => {
  const record = createRecord({ id: "theme-task", title: "Temayı kontrol et" });
  const storage = memoryStorage({ [KEY]: JSON.stringify({ version: 1, records: [record] }) });
  const first = createStore(storage);
  const second = createStore(storage);
  first.savePreferences({ ...first.preferences, theme: "dark" }, "Tema");
  const saved = storage.getItem(KEY);
  const envelope = JSON.parse(saved);
  assert.deepEqual(envelope.records, [record]);
  assert.deepEqual(envelope.odak.preferences, { density: "comfortable", theme: "dark" });
  assert.equal(envelope.odak.history.length, 1);
  assert.deepEqual(envelope.odak.history[0].changes, []);
  second.synchronize(saved);
  assert.equal(second.preferences.theme, "dark");
  assert.equal(second.undo(), "Tema");
  first.synchronize(storage.getItem(KEY));
  assert.deepEqual(first.preferences, { density: "comfortable" });
  assert.deepEqual(first.records, [record]);
  assert.equal(first.canUndo, false);
});

test("explicit system choice persists while malformed themes cannot be committed or invalidate real records", () => {
  const record = createRecord({ id: "theme-safe", title: "Kayıt korunur" });
  const storage = memoryStorage({ [KEY]: JSON.stringify({ version: 1, records: [record] }) });
  const store = createStore(storage);
  store.savePreferences({ density: "compact", theme: "system" });
  assert.deepEqual(createStore(storage).preferences, { density: "compact", theme: "system" });
  const saved = storage.getItem(KEY);
  assert.throws(() => store.savePreferences({ density: "compact", theme: "invalid" }));
  assert.equal(storage.getItem(KEY), saved);
  const damaged = JSON.parse(saved);
  damaged.odak.history[0].beforePreferences.theme = "invalid";
  storage.setItem(KEY, JSON.stringify(damaged));
  const reopened = createStore(storage);
  assert.deepEqual(reopened.records, [record]);
  assert.equal(reopened.canUndo, false);
  assert.deepEqual(reopened.preferences, { density: "compact", theme: "system" });
});

function themeEnvironment({ dark = false, legacy = false } = {}) {
  const listeners = new Set();
  const query = { matches: dark };
  if (legacy) {
    query.addListener = (listener) => listeners.add(listener);
    query.removeListener = (listener) => listeners.delete(listener);
  } else {
    query.addEventListener = (name, listener) => listeners.add(listener);
    query.removeEventListener = (name, listener) => listeners.delete(listener);
  }
  const attributes = new Map();
  const meta = new Map();
  const document = {
    documentElement: {
      setAttribute: (name, value) => attributes.set(name, value),
      style: {},
    },
    querySelector: () => ({ setAttribute: (name, value) => meta.set(name, value) }),
  };
  const window = { matchMedia: () => query };
  return {
    document, window, attributes, meta,
    get listenerCount() { return listeners.size; },
    change(value) {
      query.matches = value;
      for (const listener of listeners) listener({ matches: value });
    },
  };
}

test("light is the default and operating-system preference is used only after explicit system selection", () => {
  const env = themeEnvironment({ dark: true });
  assert.equal(resolveTheme({}, env.window), "light");
  assert.equal(resolveTheme("light", env.window), "light");
  assert.equal(resolveTheme("dark", {}), "dark");
  assert.equal(resolveTheme({ theme: "system" }, env.window), "dark");
  assert.equal(resolveTheme("system", () => ({ matches: true })), "dark");
  assert.equal(resolveTheme("system", { matchMedia() { throw Error("Unavailable"); } }), "light");
  assert.equal(applyTheme(env.document, { theme: "dark" }, env.window), "dark");
  assert.equal(env.attributes.get("data-theme"), "dark");
  assert.equal(env.document.documentElement.style.colorScheme, "dark");
  assert.equal(env.meta.get("content"), "dark");
});

test("system watchers follow OS changes, respect later explicit choices, and clean up modern and legacy listeners", () => {
  for (const legacy of [false, true]) {
    const env = themeEnvironment({ legacy });
    let preferences = { density: "compact", theme: "system" };
    const stop = watchTheme(env.document, () => preferences, env.window);
    assert.equal(env.attributes.get("data-theme"), "light");
    assert.equal(env.listenerCount, 1);
    env.change(true);
    assert.equal(env.attributes.get("data-theme"), "dark");
    preferences = { ...preferences, theme: "light" };
    applyTheme(env.document, preferences, env.window);
    env.change(false);
    env.change(true);
    assert.equal(env.attributes.get("data-theme"), "light");
    assert.equal(preferences.theme, "light");
    stop();
    assert.equal(env.listenerCount, 0);
  }
});
