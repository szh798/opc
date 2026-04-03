const { DEFAULT_HEADERS, STORAGE_KEYS } = require("./env");
const { getRuntimeConfig } = require("./runtime");
const { resolveMockResponse } = require("../mock/api-mock");

function safeGetStorageSync(key) {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return "";
  }

  try {
    return wx.getStorageSync(key) || "";
  } catch (error) {
    return "";
  }
}

function mergeHeaders(headers = {}) {
  const merged = {
    ...DEFAULT_HEADERS,
    ...headers
  };

  const token = String(safeGetStorageSync(STORAGE_KEYS.TOKEN) || "");
  if (token && !merged.Authorization && !merged.authorization) {
    merged.Authorization = `Bearer ${token}`;
  }

  return merged;
}

function joinUrl(baseURL, path) {
  if (!path) {
    return baseURL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBase = String(baseURL || "").replace(/\/+$/, "");
  const normalizedPath = String(path).replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}

function buildSuccessResponse(payload, statusCode, fromMock) {
  return {
    ok: true,
    statusCode,
    fromMock,
    data: payload,
    message: "ok"
  };
}

function buildErrorResponse(message, statusCode, fromMock, raw) {
  return {
    ok: false,
    statusCode,
    fromMock,
    message,
    raw
  };
}

function isContractEnvelope(payload) {
  return !!(
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.prototype.hasOwnProperty.call(payload, "code") &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  );
}

function normalizeNetworkPayload(payload) {
  if (!isContractEnvelope(payload)) {
    return {
      ok: true,
      data: payload,
      message: "ok"
    };
  }

  const code = Number(payload.code);
  const isSuccess = Number.isFinite(code) ? code === 0 : false;

  if (isSuccess) {
    return {
      ok: true,
      data: payload.data,
      message: payload.message || "ok"
    };
  }

  return {
    ok: false,
    data: undefined,
    message: payload.message || `Business error(${String(payload.code)})`,
    raw: payload
  };
}

function resolveRemoteErrorMessage(data, fallbackMessage = "HTTP request failed") {
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (Array.isArray(data.message) && data.message.length) {
      return data.message.map((item) => String(item)).join("; ");
    }

    if (typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
  }

  return fallbackMessage;
}

function requestByMock(config, runtimeConfig) {
  return new Promise((resolve) => {
    const delay = runtimeConfig.mockDelay || 0;

    setTimeout(() => {
      try {
        const payload = resolveMockResponse(config.method, config.url, config.data);
        resolve(buildSuccessResponse(payload, 200, true));
      } catch (error) {
        resolve(buildErrorResponse(error.message, 404, true, error));
      }
    }, delay);
  });
}

function requestByNetwork(config, runtimeConfig) {
  return new Promise((resolve) => {
    wx.request({
      url: joinUrl(runtimeConfig.baseURL, config.url),
      method: config.method,
      data: config.data || {},
      timeout: config.timeout || runtimeConfig.timeout,
      header: mergeHeaders(config.header),
      success(response) {
        const { statusCode, data } = response;

        if (statusCode >= 200 && statusCode < 300) {
          const normalized = normalizeNetworkPayload(data);
          if (normalized.ok) {
            resolve({
              ok: true,
              statusCode,
              fromMock: false,
              data: normalized.data,
              message: normalized.message
            });
            return;
          }

          resolve(
            buildErrorResponse(
              normalized.message || "Business error",
              statusCode,
              false,
              normalized.raw || data
            )
          );
          return;
        }

        resolve(buildErrorResponse(resolveRemoteErrorMessage(data), statusCode, false, response));
      },
      fail(error) {
        resolve(buildErrorResponse(error.errMsg || "Network error", 0, false, error));
      }
    });
  });
}

function request(options = {}) {
  const runtimeConfig = getRuntimeConfig();
  const config = {
    method: "GET",
    url: "",
    data: {},
    header: {},
    ...options
  };

  const shouldUseMock = typeof options.useMock === "boolean" ? options.useMock : runtimeConfig.useMock;
  const isPlaceholderBase = /api\.opc\.local/i.test(String(runtimeConfig.baseURL || ""));
  const forceMockInDev = runtimeConfig.env !== "prod" && isPlaceholderBase;
  const allowRuntimeMock = runtimeConfig.allowRuntimeMock === true;
  const finalUseMock = allowRuntimeMock && (shouldUseMock || forceMockInDev);

  if (finalUseMock) {
    return requestByMock(config, runtimeConfig);
  }

  return requestByNetwork(config, runtimeConfig);
}

function get(url, options = {}) {
  return request({
    ...options,
    method: "GET",
    url
  });
}

function post(url, data = {}, options = {}) {
  return request({
    ...options,
    method: "POST",
    url,
    data
  });
}

function put(url, data = {}, options = {}) {
  return request({
    ...options,
    method: "PUT",
    url,
    data
  });
}

function patch(url, data = {}, options = {}) {
  return request({
    ...options,
    method: "PATCH",
    url,
    data
  });
}

function remove(url, data = {}, options = {}) {
  return request({
    ...options,
    method: "DELETE",
    url,
    data
  });
}

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  remove
};
