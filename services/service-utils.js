function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function safeClone(data, fallback = null) {
  if (typeof data === "undefined") {
    return fallback;
  }

  return clone(data);
}

function unwrapBusinessPayload(source, fallback = null) {
  if (
    source &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    Object.prototype.hasOwnProperty.call(source, "code") &&
    Object.prototype.hasOwnProperty.call(source, "data")
  ) {
    const code = Number(source.code);
    if (Number.isFinite(code) && code === 0) {
      return safeClone(source.data, fallback);
    }
    return safeClone(fallback, null);
  }

  return safeClone(source, fallback);
}

async function requestWithFallback(requester, fallbackValue) {
  try {
    const response = await requester();
    if (response && response.ok) {
      return unwrapBusinessPayload(response.data, fallbackValue);
    }
  } catch (error) {
    // noop: return fallback
  }

  const resolvedFallback = typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
  return safeClone(resolvedFallback, null);
}

function normalizeApiResult(response, fallback = null) {
  if (response && response.ok) {
    return unwrapBusinessPayload(response.data, fallback);
  }

  return safeClone(fallback, null);
}

module.exports = {
  clone,
  safeClone,
  requestWithFallback,
  normalizeApiResult
};
