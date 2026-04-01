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
    data: payload
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

function requestByMock(config, runtimeConfig) {
  return new Promise((resolve, reject) => {
    const delay = runtimeConfig.mockDelay || 0;

    setTimeout(() => {
      try {
        const payload = resolveMockResponse(config.method, config.url, config.data);
        resolve(buildSuccessResponse(payload, 200, true));
      } catch (error) {
        reject(buildErrorResponse(error.message, 404, true, error));
      }
    }, delay);
  });
}

function requestByNetwork(config, runtimeConfig) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: joinUrl(runtimeConfig.baseURL, config.url),
      method: config.method,
      data: config.data || {},
      timeout: config.timeout || runtimeConfig.timeout,
      header: mergeHeaders(config.header),
      success(response) {
        const { statusCode, data } = response;

        if (statusCode >= 200 && statusCode < 300) {
          resolve(buildSuccessResponse(data, statusCode, false));
          return;
        }

        const responseMessage =
          data && typeof data === "object" && data
            ? String(data.message || data.errMsg || "").trim()
            : "";

        reject(buildErrorResponse(responseMessage || "HTTP request failed", statusCode, false, response));
      },
      fail(error) {
        reject(buildErrorResponse(error.errMsg || "Network error", 0, false, error));
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

  if (shouldUseMock) {
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
