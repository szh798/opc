const { post, get, isMockMode } = require("./request");
const { requestData, resolveServiceErrorMessage } = require("./service-utils");
const { updateCurrentUser } = require("./user.service");
const { STORAGE_KEYS } = require("../utils/env");
const { getRuntimeConfig } = require("../utils/runtime");

const WECHAT_LOGIN_TIMEOUT_MS = 10000;
const WECHAT_PROFILE_TIMEOUT_MS = 8000;

const EMPTY_USER = {};

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

function safeSetStorageSync(key, value) {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }

  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // noop
  }
}

function safeRemoveStorageSync(key) {
  if (typeof wx === "undefined" || typeof wx.removeStorageSync !== "function") {
    return;
  }

  try {
    wx.removeStorageSync(key);
  } catch (error) {
    // noop
  }
}

function setAccessToken(token = "") {
  const safeToken = String(token || "");
  if (!safeToken) {
    safeRemoveStorageSync(STORAGE_KEYS.TOKEN);
    return "";
  }

  safeSetStorageSync(STORAGE_KEYS.TOKEN, safeToken);
  return safeToken;
}

function getAccessToken() {
  return String(safeGetStorageSync(STORAGE_KEYS.TOKEN) || "");
}

function clearAccessToken() {
  safeRemoveStorageSync(STORAGE_KEYS.TOKEN);
  safeRemoveStorageSync(STORAGE_KEYS.REFRESH_TOKEN);
}

function getRefreshToken() {
  return String(safeGetStorageSync(STORAGE_KEYS.REFRESH_TOKEN) || "");
}

function applyLoginToApp(loginResult = {}) {
  const app = typeof getApp === "function" ? getApp() : null;
  const user = loginResult.user || EMPTY_USER;

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...user
    };
  }

  if (loginResult.accessToken) {
    setAccessToken(loginResult.accessToken);
  }

  if (loginResult.refreshToken) {
    safeSetStorageSync(STORAGE_KEYS.REFRESH_TOKEN, loginResult.refreshToken);
  }

  return user;
}

function runWechatApiWithTimeout(executor, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10000);
  const timeoutMessage = String(options.timeoutMessage || "微信接口调用超时");
  const resolveOnTimeout = typeof options.resolveOnTimeout === "function" ? options.resolveOnTimeout : null;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (handler, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      handler(value);
    };

    const timer = setTimeout(() => {
      if (resolveOnTimeout) {
        finish(resolve, resolveOnTimeout());
        return;
      }

      finish(reject, new Error(timeoutMessage));
    }, timeoutMs);

    executor({
      resolve(value) {
        finish(resolve, value);
      },
      reject(error) {
        finish(
          reject,
          error instanceof Error ? error : new Error(String(error || timeoutMessage))
        );
      }
    });
  });
}

function requestWechatUserProfile() {
  return runWechatApiWithTimeout(({ resolve }) => {
    if (typeof wx === "undefined" || typeof wx.getUserProfile !== "function") {
      resolve(null);
      return;
    }

    wx.getUserProfile({
      desc: "用于完善资料与同步微信头像昵称",
      success(result) {
        resolve(result || null);
      },
      fail() {
        resolve(null);
      }
    });
  }, {
    timeoutMs: WECHAT_PROFILE_TIMEOUT_MS,
    resolveOnTimeout() {
      return null;
    }
  });
}

function requestWechatLoginCode() {
  return runWechatApiWithTimeout(({ resolve, reject }) => {
    if (typeof wx === "undefined" || typeof wx.login !== "function") {
      resolve("");
      return;
    }

    wx.login({
      success(result) {
        const code = String((result && result.code) || "").trim();

        if (!code) {
          reject(new Error("未获取到微信登录凭证"));
          return;
        }

        resolve(code);
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "微信登录失败"));
      }
    });
  }, {
    timeoutMs: WECHAT_LOGIN_TIMEOUT_MS,
    timeoutMessage: "微信登录超时，请检查开发者工具网络、AppID 配置和后端服务后重试"
  });
}

function normalizeWechatUserInfo(userInfo = {}) {
  const payload = userInfo && typeof userInfo === "object" ? userInfo : {};
  const nickname = String(payload.nickName || "").trim();
  const avatarUrl = String(payload.avatarUrl || "").trim();
  const nextUser = {};

  if (nickname) {
    nextUser.name = nickname;
    nextUser.nickname = nickname;
    nextUser.initial = nickname.slice(0, 1);
  }

  if (avatarUrl) {
    nextUser.avatarUrl = avatarUrl;
  }

  return nextUser;
}

function normalizeWechatLoginErrorMessage(message) {
  const source = String(message || "").trim().toLowerCase();

  if (!source) {
    return "微信登录失败，请稍后重试";
  }

  if (source.includes("invalid appsecret")) {
    return "微信登录失败：小程序 AppSecret 无效，请检查后端 .env 和微信后台配置";
  }

  if (source.includes("invalid code")) {
    return "微信登录失败：登录 code 无效，请确认开发者工具 AppID 一致，并重新编译后再试";
  }

  if (source.includes("code been used")) {
    return "微信登录失败：本次登录凭证已被使用，请重新点击登录";
  }

  if (source.includes("code expired")) {
    return "微信登录失败：本次登录凭证已过期，请重新点击登录";
  }

  if (source.includes("timeout") || source.includes("超时")) {
    return "微信登录超时，请检查开发者工具网络、AppID 配置和后端服务后重试";
  }

  return message;
}

function isRetryableWechatCodeError(message) {
  const source = String(message || "").trim().toLowerCase();
  return source.includes("invalid code") || source.includes("code been used") || source.includes("code expired");
}

function buildWechatProfilePatch(user = {}) {
  const payload = user && typeof user === "object" ? user : {};
  const nickname = String(payload.nickname || payload.name || "").trim();
  const avatarUrl = String(payload.avatarUrl || "").trim();
  const patch = {};

  if (nickname) {
    patch.name = nickname;
    patch.nickname = nickname;
    patch.initial = nickname.slice(0, 1);
  }

  if (avatarUrl) {
    patch.avatarUrl = avatarUrl;
  }

  return patch;
}

function hasWechatProfilePayload(payload = {}) {
  const requestPayload = payload && typeof payload === "object" ? payload : {};
  const userInfo = requestPayload.userInfo && typeof requestPayload.userInfo === "object"
    ? requestPayload.userInfo
    : {};

  const nickname = String(
    requestPayload.nickname ||
    requestPayload.name ||
    userInfo.nickName ||
    userInfo.nickname ||
    userInfo.name ||
    ""
  ).trim();
  const avatarUrl = String(
    requestPayload.avatarUrl ||
    userInfo.avatarUrl ||
    ""
  ).trim();

  return !!(nickname || avatarUrl);
}

async function submitWechatLogin(requestPayload = {}) {
  const userInfo = (requestPayload && requestPayload.userInfo) || null;
  const nickname = String((userInfo && userInfo.nickName) || "").trim();
  const avatarUrl = String((userInfo && userInfo.avatarUrl) || "").trim();
  const encryptedData = String(requestPayload.encryptedData || "").trim();
  const iv = String(requestPayload.iv || "").trim();

  // 把用户在 login-card 同步上下文里 wx.getUserProfile 拿到的昵称/头像
  // 一并发给后端,让后端在创建用户时直接落库,不再 fallback 到 "小明"。
  const body = {
    code: String(requestPayload.code || "").trim(),
    simulateFreshUser: requestPayload.simulateFreshUser === true
  };
  if (nickname) body.nickname = nickname;
  if (avatarUrl) body.avatarUrl = avatarUrl;
  if (encryptedData) body.encryptedData = encryptedData;
  if (iv) body.iv = iv;

  const response = await post("/auth/wechat-login", body);

  if (!response || !response.ok) {
    throw new Error(resolveServiceErrorMessage(response, "微信登录失败，请稍后重试"));
  }

  return response.data || {};
}

async function syncWechatProfileAfterLogin() {
  const profileResult = await requestWechatUserProfile();
  const profileUser = normalizeWechatUserInfo(profileResult && profileResult.userInfo);
  const profilePatch = buildWechatProfilePatch(profileUser);

  if (!Object.keys(profilePatch).length) {
    return profileUser;
  }

  try {
    const remoteUser = await updateCurrentUser(profilePatch);
    if (remoteUser && typeof remoteUser === "object") {
      return {
        ...profileUser,
        ...remoteUser
      };
    }
  } catch (_error) {
    // Keep login successful even if profile sync fails.
  }

  return profileUser;
}

async function loginByWechat(payload = {}) {
  if (isMockMode()) {
    throw new Error("当前仍处于 Mock 模式，请先关闭 Mock 再测试微信登录");
  }

  const requestPayload = {
    ...payload
  };
  const hasCustomCode = !!String(requestPayload.code || "").trim();

  if (!hasCustomCode) {
    const code = await requestWechatLoginCode();
    if (code) {
      requestPayload.code = code;
    }
  }

  let data;

  try {
    data = await submitWechatLogin(requestPayload);
  } catch (error) {
    const sourceMessage = resolveServiceErrorMessage(error, "微信登录失败，请稍后重试");
    if (hasCustomCode || !isRetryableWechatCodeError(sourceMessage)) {
      throw new Error(normalizeWechatLoginErrorMessage(sourceMessage));
    }

    const freshCode = await requestWechatLoginCode();
    requestPayload.code = freshCode;

    try {
      data = await submitWechatLogin(requestPayload);
    } catch (retryError) {
      throw new Error(
        normalizeWechatLoginErrorMessage(resolveServiceErrorMessage(retryError, "微信登录失败，请稍后重试"))
      );
    }
  }

  let nextData = {
    ...data,
    user: data && data.user ? data.user : {}
  };

  applyLoginToApp(nextData);

  return nextData;
}

async function loginByDevFresh(payload = {}) {
  if (isMockMode()) {
    throw new Error("当前仍处于 Mock 模式，请先关闭 Mock 再测试登录。");
  }

  const requestPayload = payload && typeof payload === "object" ? payload : {};
  const userInfo = requestPayload.userInfo && typeof requestPayload.userInfo === "object"
    ? requestPayload.userInfo
    : {};
  const runtimeConfig = getRuntimeConfig();
  const body = {};
  const nickname = String(
    requestPayload.nickname ||
    requestPayload.name ||
    userInfo.nickName ||
    userInfo.nickname ||
    ""
  ).trim();
  const avatarUrl = String(requestPayload.avatarUrl || userInfo.avatarUrl || "").trim();
  const preset = String(requestPayload.preset || "").trim();
  if (nickname) {
    body.nickname = nickname;
  }
  if (avatarUrl) {
    body.avatarUrl = avatarUrl;
  }
  if (preset) {
    body.preset = preset;
  }

  const devLoginSecret = String(
    requestPayload.devLoginSecret ||
    runtimeConfig.devFreshLoginSecret ||
    ""
  ).trim();
  if (devLoginSecret) {
    body.devLoginSecret = devLoginSecret;
  }

  const response = await post("/auth/dev-fresh-login", body);
  if (!response || !response.ok) {
    throw new Error(resolveServiceErrorMessage(response, "模拟新用户登录失败，请稍后重试"));
  }

  const data = response.data || {};
  const nextData = {
    ...data,
    user: data && data.user ? data.user : {}
  };
  applyLoginToApp(nextData);
  return nextData;
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const data = await requestData(
    () => post("/auth/refresh", { refreshToken }),
    "刷新登录状态失败"
  );

  if (data && data.accessToken) {
    setAccessToken(data.accessToken);
  }

  if (data && data.refreshToken) {
    safeSetStorageSync(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }

  return data;
}

async function fetchAuthUser() {
  return requestData(
    () => get("/auth/me"),
    "获取当前登录状态失败"
  );
}

async function sendSmsVerificationCode(phone, purpose = "login") {
  return requestData(
    () => post("/auth/sms/send-code", {
      phone: String(phone || "").trim(),
      purpose
    }),
    "验证码发送失败，请稍后重试"
  );
}

async function verifySmsVerificationCode(phone, code, purpose = "login") {
  return requestData(
    () => post("/auth/sms/verify-code", {
      phone: String(phone || "").trim(),
      code: String(code || "").trim(),
      purpose
    }),
    "验证码校验失败，请重新输入"
  );
}

async function loginBySms(phone, code) {
  if (isMockMode()) {
    throw new Error("当前仍处于 Mock 模式，请先关闭 Mock 再测试手机号登录");
  }

  const data = await requestData(
    () => post("/auth/sms-login", {
      phone: String(phone || "").trim(),
      code: String(code || "").trim()
    }),
    "手机号登录失败，请重新获取验证码后再试"
  );

  applyLoginToApp(data || {});
  return data || {};
}

async function loginByWechatPhone(payload = {}) {
  if (isMockMode()) {
    throw new Error("当前仍处于 Mock 模式，请先关闭 Mock 再测试手机号一键登录");
  }

  const requestPayload = payload && typeof payload === "object" ? payload : {};
  const phoneCode = String(
    requestPayload.phoneCode ||
    requestPayload.code ||
    ""
  ).trim();

  if (!phoneCode) {
    throw new Error("未获取到手机号授权凭证");
  }

  const data = await requestData(
    () => post("/auth/phone-login", {
      phoneCode
    }),
    "手机号一键登录失败，请改用验证码登录"
  );

  applyLoginToApp(data || {});
  return data || {};
}

async function logout() {
  await requestData(
    () => post("/auth/logout", {}),
    "退出登录失败，请稍后重试"
  );

  clearAccessToken();
  return { success: true };
}

function mockWechatLogin(app) {
  const nextUser = {};

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...nextUser
    };
  }

  clearAccessToken();
  return nextUser;
}

module.exports = {
  loginByWechat,
  loginByWechatPhone,
  loginByDevFresh,
  loginBySms,
  refreshAccessToken,
  fetchAuthUser,
  sendSmsVerificationCode,
  verifySmsVerificationCode,
  logout,
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  mockWechatLogin
};
