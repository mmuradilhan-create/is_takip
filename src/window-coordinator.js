const VERSION = 1;
const HEARTBEAT_MS = 5000;
const PRESENCE_TTL_MS = 90000;
const ACK_TIMEOUT_MS = 1200;
const DISCOVERY_MS = 100;
const ROLES = new Set(["main", "widget"]);

/** Coordinate application windows without reading or changing workspace data. */
export function createWindowCoordinator({
  onActivateMain = null,
  onActivateWidget = null,
  window: owner = globalThis.window,
} = {}) {
  const url = new URL(owner.location.href);
  url.hash = "";
  const scope = url.href;
  const prefix = `odak-windows:${scope}:`;
  const randomId = () =>
    owner.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const id = randomId();
  const mailboxKey = `${prefix}message:${id}`;
  const lockName = (role) => `${prefix}${role}`;
  const presenceKey = (role) => `${prefix}${role}:${id}`;
  const now = () => (owner.Date || Date).now();
  const roles = new Map();
  for (const [role, handler] of [
    ["main", onActivateMain],
    ["widget", onActivateWidget],
  ]) {
    if (typeof handler === "function")
      roles.set(role, {
        handler,
        focusedAt: now(),
        lockState: "unavailable",
        releaseLock: null,
        lockAbort: null,
      });
  }
  let storage;
  try {
    storage = owner.localStorage;
  } catch {
    storage = null;
  }
  let channel;
  try {
    channel = new owner.BroadcastChannel(`${prefix}channel`);
  } catch {
    channel = null;
  }
  let stopped = false;
  let heartbeat;
  let wroteMailbox = false;
  const operations = new Map();
  const seenMessages = new Set();
  const handledRequests = new Set();

  function remember(set, value) {
    set.add(value);
    if (set.size > 256) set.delete(set.values().next().value);
  }

  function remove(key) {
    try {
      storage?.removeItem(key);
    } catch {
      /* Communication cannot affect workspace records. */
    }
  }

  function writePresence(role) {
    const state = roles.get(role);
    if (!state || stopped) return;
    try {
      storage?.setItem(
        presenceKey(role),
        JSON.stringify({
          version: VERSION,
          scope,
          id,
          role,
          focusedAt: state.focusedAt,
          seenAt: now(),
          lockState: state.lockState,
        }),
      );
    } catch {
      /* The channel and browser lock remain independent fallbacks. */
    }
  }

  function freshPresence(role) {
    if (!storage) return [];
    try {
      const result = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(`${prefix}${role}:`)) continue;
        let value;
        try {
          value = JSON.parse(storage.getItem(key));
        } catch {
          continue;
        }
        if (
          value?.version === VERSION &&
          value.scope === scope &&
          (value.role === undefined || value.role === role) &&
          typeof value.id === "string" &&
          Number.isFinite(value.seenAt) &&
          Number.isFinite(value.focusedAt) &&
          value.seenAt <= now() + 5000 &&
          now() - value.seenAt < PRESENCE_TTL_MS
        )
          result.push(value);
      }
      return result;
    } catch {
      return [];
    }
  }

  function emit(payload) {
    if (stopped) return;
    const message = {
      version: VERSION,
      scope,
      sender: id,
      messageId: randomId(),
      ...payload,
    };
    try {
      channel?.postMessage(message);
    } catch {
      /* Use the mailbox fallback. */
    }
    try {
      if (storage) {
        storage.setItem(mailboxKey, JSON.stringify(message));
        wroteMailbox = true;
      }
    } catch {
      /* Use BroadcastChannel. */
    }
  }

  async function receive(message) {
    if (
      stopped ||
      message?.version !== VERSION ||
      message.scope !== scope ||
      message.sender === id ||
      typeof message.sender !== "string" ||
      typeof message.messageId !== "string" ||
      seenMessages.has(message.messageId)
    )
      return;
    // Requests from the previous main-only coordinator remain main requests.
    const role = message.role ?? "main";
    if (!ROLES.has(role)) return;
    remember(seenMessages, message.messageId);
    const state = roles.get(role);
    const operation = operations.get(role);
    if (
      message.kind === "probe" &&
      state &&
      typeof message.requestId === "string"
    ) {
      emit({
        kind: "offer",
        role,
        requestId: message.requestId,
        target: message.sender,
        focusedAt: state.focusedAt,
        seenAt: now(),
      });
      return;
    }
    if (
      message.kind === "offer" &&
      operation &&
      message.target === id &&
      message.requestId === operation.requestId
    ) {
      if (Number.isFinite(message.focusedAt))
        operation.offers.set(message.sender, {
          id: message.sender,
          focusedAt: message.focusedAt,
          seenAt: now(),
        });
      return;
    }
    if (
      message.kind === "ack" &&
      operation &&
      message.target === id &&
      message.requestId === operation.requestId &&
      message.sender === operation.target
    ) {
      finish(role, { existing: true, focused: message.focused === true });
      return;
    }
    const requestKey = `${role}:${message.requestId}`;
    if (
      message.kind !== "activate" ||
      !state ||
      message.target !== id ||
      typeof message.requestId !== "string" ||
      handledRequests.has(requestKey)
    )
      return;
    remember(handledRequests, requestKey);
    let focused = false;
    try {
      const result = await state.handler(
        typeof message.recordId === "string" ? message.recordId : null,
      );
      focused = result?.focused === true;
    } catch {
      /* Confirm existence even when native foreground is denied. */
    }
    emit({
      kind: "ack",
      role,
      requestId: message.requestId,
      target: message.sender,
      focused,
    });
  }

  const onStorage = (event) => {
    if (!event.key?.startsWith(`${prefix}message:`) || !event.newValue) return;
    try {
      void receive(JSON.parse(event.newValue));
    } catch {
      /* Ignore malformed mail. */
    }
  };
  const onMessage = (event) => {
    void receive(event.data);
  };
  const onFocus = () => {
    for (const [role, state] of roles) {
      state.focusedAt = now();
      writePresence(role);
    }
  };
  owner.addEventListener("storage", onStorage);
  owner.addEventListener("pagehide", stop, { once: true });
  if (channel) channel.onmessage = onMessage;

  if (roles.size) {
    owner.addEventListener("focus", onFocus);
    for (const [role, state] of roles) {
      try {
        const locks = owner.navigator?.locks;
        if (typeof locks?.request === "function") {
          state.lockState = "acquiring";
          const Abort = owner.AbortController || globalThis.AbortController;
          state.lockAbort = Abort ? new Abort() : null;
          const options = state.lockAbort
            ? { mode: "exclusive", signal: state.lockAbort.signal }
            : { mode: "exclusive" };
          Promise.resolve(
            locks.request(lockName(role), options, () => {
              if (stopped) return;
              state.lockState = "held";
              writePresence(role);
              return new Promise((resolve) => {
                state.releaseLock = resolve;
              });
            }),
          ).catch(() => {
            state.lockState = "unavailable";
            writePresence(role);
          });
        }
      } catch {
        state.lockState = "unavailable";
      }
      writePresence(role);
    }
    heartbeat = owner.setInterval(() => {
      for (const role of roles.keys()) writePresence(role);
    }, HEARTBEAT_MS);
  }

  function finish(role, result) {
    const operation = operations.get(role);
    if (!operation) return;
    operations.delete(role);
    owner.clearTimeout(operation.timeout);
    owner.clearTimeout(operation.discovery);
    if (!operations.size && wroteMailbox) {
      remove(mailboxKey);
      wroteMailbox = false;
    }
    operation.resolve(result);
  }

  function chooseTarget(operation, candidates) {
    if (
      operations.get(operation.role) !== operation ||
      operation.target ||
      !candidates.length
    )
      return;
    candidates.sort(
      (left, right) =>
        right.focusedAt - left.focusedAt ||
        right.seenAt - left.seenAt ||
        left.id.localeCompare(right.id),
    );
    operation.target = candidates[0].id;
    emit({
      kind: "activate",
      role: operation.role,
      requestId: operation.requestId,
      target: operation.target,
      recordId: operation.recordId,
    });
  }

  async function onTimeout(operation) {
    if (operations.get(operation.role) !== operation) return;
    let existing;
    try {
      const locks = owner.navigator?.locks;
      if (typeof locks?.query !== "function")
        throw new Error("Locks unavailable");
      const snapshot = await locks.query();
      existing =
        snapshot.held?.some(
          (lock) => lock.name === lockName(operation.role),
        ) === true;
      // A file origin may allow query() while refusing request().
      if (!existing)
        existing = freshPresence(operation.role).some(
          (presence) => presence.lockState !== "held",
        );
    } catch {
      existing = freshPresence(operation.role).length > 0;
    }
    if (operations.get(operation.role) !== operation) return;
    finish(
      operation.role,
      existing
        ? { existing: true, focused: false, unresponsive: true }
        : { existing: false, focused: false },
    );
  }

  function activateRole(role, recordId = null) {
    if (stopped) return Promise.resolve({ existing: false, focused: false });
    if (operations.has(role)) return operations.get(role).promise;
    const ownRole = roles.get(role);
    if (ownRole)
      return Promise.resolve()
        .then(() => ownRole.handler(recordId))
        .then(
          (result) => ({ existing: true, focused: result?.focused === true }),
          () => ({ existing: true, focused: false }),
        );
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const operation = {
      role,
      requestId: randomId(),
      recordId: typeof recordId === "string" ? recordId : null,
      offers: new Map(),
      target: null,
      resolve,
      promise,
    };
    operations.set(role, operation);
    operation.timeout = owner.setTimeout(() => {
      void onTimeout(operation);
    }, ACK_TIMEOUT_MS);
    emit({ kind: "probe", role, requestId: operation.requestId });
    operation.discovery = owner.setTimeout(() => {
      const offers = [...operation.offers.values()];
      chooseTarget(operation, offers.length ? offers : freshPresence(role));
    }, DISCOVERY_MS);
    return promise;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    owner.clearInterval(heartbeat);
    owner.removeEventListener("storage", onStorage);
    owner.removeEventListener("focus", onFocus);
    owner.removeEventListener("pagehide", stop);
    try {
      channel?.close();
    } catch {
      /* Already closed. */
    }
    for (const [role, state] of roles) {
      try {
        state.releaseLock?.();
        state.lockAbort?.abort();
      } catch {
        /* Already released. */
      }
      remove(presenceKey(role));
    }
    if (wroteMailbox) {
      remove(mailboxKey);
      wroteMailbox = false;
    }
    for (const role of [...operations.keys()])
      finish(role, { existing: false, focused: false });
  }

  return {
    activateMain: (recordId = null) => activateRole("main", recordId),
    activateWidget: () => activateRole("widget"),
    stop,
  };
}
