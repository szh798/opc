const listeners = new Set();

function registerComingSoonHook(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => unregisterComingSoonHook(listener);
}

function unregisterComingSoonHook(listener) {
  listeners.delete(listener);
}

function buildComingSoonPayload(options = {}) {
  return {
    featureKey: String(options.featureKey || "").trim(),
    source: String(options.source || "unknown").trim() || "unknown",
    message: String(options.message || "").trim(),
    timestamp: Date.now(),
    meta: options.meta && typeof options.meta === "object" ? options.meta : {}
  };
}

function emitComingSoonHook(payload = {}) {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (_error) {
      // Ignore listener errors to avoid blocking current interaction.
    }
  });
}

module.exports = {
  registerComingSoonHook,
  unregisterComingSoonHook,
  buildComingSoonPayload,
  emitComingSoonHook
};
