const { DEFAULT_HEADERS, STORAGE_KEYS } = require("./env");
const { getRuntimeConfig } = require("./runtime");

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

function resolveTimeoutMessage(config = {}, timeoutMs = 0) {
  const method = String(config.method || "GET").toUpperCase();
  const target = String(config.url || "").trim() || "/";
  return `请求超时(${timeoutMs}ms)：${method} ${target}`;
}

function requestByNetwork(config, runtimeConfig) {
  return new Promise((resolve) => {
    const timeoutMs = Math.max(1000, Number(config.timeout || runtimeConfig.timeout) || 15000);
    const requestUrl = joinUrl(runtimeConfig.baseURL, config.url);
    let settled = false;
    let guardTimer = null;
    let requestTask = null;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      if (guardTimer) {
        clearTimeout(guardTimer);
      }
      resolve(result);
    };

    guardTimer = setTimeout(() => {
      if (requestTask && typeof requestTask.abort === "function") {
        try {
          requestTask.abort();
        } catch (_error) {
          // noop
        }
      }

      finish(
        buildErrorResponse(
          resolveTimeoutMessage(config, timeoutMs),
          0,
          false,
          {
            errMsg: "manual request timeout",
            method: String(config.method || "GET").toUpperCase(),
            timeout: timeoutMs,
            url: requestUrl
          }
        )
      );
    }, timeoutMs + 1200);

    requestTask = wx.request({
      url: requestUrl,
      method: config.method,
      data: config.data || {},
      timeout: timeoutMs,
      header: mergeHeaders(config.header),
      success(response) {
        const { statusCode, data } = response;

        if (statusCode >= 200 && statusCode < 300) {
          const normalized = normalizeNetworkPayload(data);
          if (normalized.ok) {
            finish({
              ok: true,
              statusCode,
              fromMock: false,
              data: normalized.data,
              message: normalized.message
            });
            return;
          }

          finish(
            buildErrorResponse(
              normalized.message || "Business error",
              statusCode,
              false,
              normalized.raw || data
            )
          );
          return;
        }

        finish(buildErrorResponse(resolveRemoteErrorMessage(data), statusCode, false, response));
      },
      fail(error) {
        const errMsg = String((error && error.errMsg) || "").trim();
        const message = /timeout/i.test(errMsg)
          ? resolveTimeoutMessage(config, timeoutMs)
          : (errMsg || "Network error");

        finish(
          buildErrorResponse(
            message,
            0,
            false,
            {
              ...(error || {}),
              method: String(config.method || "GET").toUpperCase(),
              timeout: timeoutMs,
              url: requestUrl
            }
          )
        );
      }
    });
  });
}

let _refreshingPromise = null;

async function request(options = {}) {
  const runtimeConfig = getRuntimeConfig();
  const config = {
    method: "GET",
    url: "",
    data: {},
    header: {},
    ...options
  };

  const result = await requestByNetwork(config, runtimeConfig);

  // 401 拦截：自动刷新 token 并重试一次（跳过 refresh 接口本身和已重试的请求）
  if (
    result.statusCode === 401 &&
    !options._isRetry &&
    !/\/auth\/refresh\b/.test(String(config.url || ""))
  ) {
    if (!_refreshingPromise) {
      const authService = require("../services/auth.service");
      _refreshingPromise = authService
        .refreshAccessToken()
        .catch(() => null)
        .finally(() => { _refreshingPromise = null; });
    }

    const refreshed = await _refreshingPromise;
    if (refreshed && refreshed.accessToken) {
      return request({ ...options, _isRetry: true });
    }

    // 刷新失败 → 清除登录态，由业务层决定是否跳转登录
    const authService = require("../services/auth.service");
    authService.clearAccessToken();
  }

  return result;
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

function isMockMode() {
  return false;
}

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  remove,
  isMockMode
};
