function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function safeClone(data, fallback = null) {
  if (typeof data === "undefined") {
    return fallback;
  }

  return clone(data);
}

async function requestWithFallback(requester, fallbackValue) {
  try {
    const response = await requester();
    if (response && response.ok) {
      return safeClone(response.data, fallbackValue);
    }
  } catch (error) {
    // noop: return fallback
  }

  const resolvedFallback = typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
  return safeClone(resolvedFallback, null);
}

function normalizeApiResult(response, fallback = null) {
  if (response && response.ok) {
    return safeClone(response.data, fallback);
  }

  return safeClone(fallback, null);
}

module.exports = {
  clone,
  safeClone,
  requestWithFallback,
  normalizeApiResult
};
