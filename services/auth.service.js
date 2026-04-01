const { post, get } = require("./request");
const { requestWithFallback } = require("./service-utils");
const { STORAGE_KEYS } = require("../utils/env");

const MOCK_USER = {
  id: "mock-user-001",
  name: "\u5c0f\u660e",
  nickname: "\u5c0f\u660e",
  initial: "\u5c0f",
  loggedIn: true
};

const MOCK_LOGIN_RESULT = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  expiresIn: 7200,
  user: MOCK_USER
};

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
}

function applyLoginToApp(loginResult = {}) {
  const app = typeof getApp === "function" ? getApp() : null;
  const user = loginResult.user || MOCK_USER;

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...user
    };
  }

  if (loginResult.accessToken) {
    setAccessToken(loginResult.accessToken);
  }

  return user;
}

async function loginByWechat(payload = {}) {
  const data = await requestWithFallback(
    () => post("/auth/wechat-login", payload),
    MOCK_LOGIN_RESULT
  );

  applyLoginToApp(data);
  return data;
}

async function refreshAccessToken(payload = {}) {
  const data = await requestWithFallback(
    () => post("/auth/refresh", payload),
    {
      accessToken: "mock-access-token-refreshed",
      refreshToken: "mock-refresh-token",
      expiresIn: 7200
    }
  );

  if (data && data.accessToken) {
    setAccessToken(data.accessToken);
  }

  return data;
}

async function fetchAuthUser() {
  return requestWithFallback(
    () => get("/auth/me"),
    MOCK_USER
  );
}

async function logout() {
  await requestWithFallback(
    () => post("/auth/logout", {}),
    { success: true }
  );

  clearAccessToken();
  return { success: true };
}

function mockWechatLogin(app) {
  const nextUser = {
    ...MOCK_USER
  };

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...nextUser
    };
  }

  setAccessToken(MOCK_LOGIN_RESULT.accessToken);
  return nextUser;
}

module.exports = {
  loginByWechat,
  refreshAccessToken,
  fetchAuthUser,
  logout,
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  mockWechatLogin
};
