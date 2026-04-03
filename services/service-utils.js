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

function resolveServiceErrorMessage(error, fallbackMessage = "request_failed") {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (error && error.raw && error.raw.data) {
    const { data } = error.raw;

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (Array.isArray(data.message) && data.message.length) {
      return data.message.map((item) => String(item)).join("; ");
    }
  }

  return fallbackMessage;
}

async function requestData(requester, fallbackMessage = "request_failed") {
  try {
    const response = await requester();
    if (response && response.ok) {
      return safeClone(response.data, null);
    }

    throw new Error(resolveServiceErrorMessage(response, fallbackMessage));
  } catch (error) {
    throw new Error(resolveServiceErrorMessage(error, fallbackMessage));
  }
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
  requestData,
  resolveServiceErrorMessage,
  normalizeApiResult
};
