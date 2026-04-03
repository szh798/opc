const { post, get, isMockMode } = require("./request");
const { requestData, resolveServiceErrorMessage } = require("./service-utils");
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

function requestWechatUserProfile() {
  return new Promise((resolve) => {
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
  });
}

function requestWechatLoginCode() {
  return new Promise((resolve, reject) => {
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
  });
}

function normalizeWechatUserInfo(userInfo = {}) {
  const nickname = String(userInfo.nickName || "").trim();
  const avatarUrl = String(userInfo.avatarUrl || "").trim();
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
    return "微信登录失败：登录 code 无效，请确认开发者工具当前工程 AppID 与后端一致后重试";
  }

  if (source.includes("code been used")) {
    return "微信登录失败：本次登录凭证已被使用，请重新点击登录";
  }

  if (source.includes("code expired")) {
    return "微信登录失败：本次登录凭证已过期，请重新点击登录";
  }

  return message;
}

async function loginByWechat(payload = {}) {
  if (isMockMode()) {
    throw new Error("当前仍处于 Mock 模式，请先关闭 Mock 再测试微信登录");
  }

  const profilePromise = requestWechatUserProfile();
  const requestPayload = {
    ...payload
  };

  if (!String(requestPayload.code || "").trim()) {
    const code = await requestWechatLoginCode();
    if (code) {
      requestPayload.code = code;
    }
  }

  const profileResult = await profilePromise;
  const profileUser = normalizeWechatUserInfo(profileResult && profileResult.userInfo);

  if (profileResult && profileResult.encryptedData && profileResult.iv) {
    requestPayload.encryptedData = profileResult.encryptedData;
    requestPayload.iv = profileResult.iv;
  }

  let response;

  try {
    response = await post("/auth/wechat-login", requestPayload);
  } catch (error) {
    throw new Error(normalizeWechatLoginErrorMessage(resolveServiceErrorMessage(error, "微信登录失败，请稍后重试")));
  }

  if (!response || !response.ok) {
    throw new Error(normalizeWechatLoginErrorMessage(resolveServiceErrorMessage(response, "微信登录失败，请稍后重试")));
  }

  const data = response.data || {};

  const nextData = {
    ...data,
    user: {
      ...(data && data.user ? data.user : {}),
      ...profileUser
    }
  };

  applyLoginToApp(nextData);
  return nextData;
}

async function refreshAccessToken(payload = {}) {
  const data = await requestData(
    () => post("/auth/refresh", payload),
    "刷新登录状态失败，请重新登录"
  );

  if (data && data.accessToken) {
    setAccessToken(data.accessToken);
  }

  return data;
}

async function fetchAuthUser() {
  return requestData(
    () => get("/auth/me"),
    "获取当前登录状态失败"
  );
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
