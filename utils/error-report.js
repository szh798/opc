/**
 * Phase B1：前端错误上报。
 *
 * 设计要点：
 *  - 直接用 wx.request，不走 utils/request.js，避免请求拦截器自身崩溃时循环上报。
 *  - 只读 runtimeConfig 里的 baseURL（和业务请求同源）；解析失败就跳过，不要再 throw。
 *  - 节流：每类 message 60 秒只发一条，同一条错误刷屏不会压垮后端。
 *  - 不做 await / 不抛异常，onError 钩子里任何失败都该静默。
 */

const { getRuntimeConfig } = require("./runtime");
const { STORAGE_KEYS } = require("./env");

const THROTTLE_WINDOW_MS = 60 * 1000;
const lastSentByKey = new Map();

function safeToken() {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") return "";
  try {
    return String(wx.getStorageSync(STORAGE_KEYS.TOKEN) || "");
  } catch (_error) {
    return "";
  }
}

function resolveBaseURL() {
  try {
    const config = getRuntimeConfig() || {};
    return String(config.baseURL || "").replace(/\/+$/, "");
  } catch (_error) {
    return "";
  }
}

function resolveAppVersion() {
  if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") return "";
  try {
    const info = wx.getAccountInfoSync();
    return String(info && info.miniProgram && info.miniProgram.version ? info.miniProgram.version : "");
  } catch (_error) {
    return "";
  }
}

function throttle(key) {
  const now = Date.now();
  const last = lastSentByKey.get(key) || 0;
  if (now - last < THROTTLE_WINDOW_MS) return false;
  lastSentByKey.set(key, now);
  return true;
}

function reportClientError(entry = {}) {
  const message = String(entry.message || "").trim();
  if (!message) return;

  const throttleKey = `${message.slice(0, 120)}|${entry.route || ""}`;
  if (!throttle(throttleKey)) return;

  const baseURL = resolveBaseURL();
  if (!baseURL) return;

  const payload = {
    message: message.slice(0, 1024),
    stack: entry.stack ? String(entry.stack).slice(0, 8192) : undefined,
    route: entry.route ? String(entry.route).slice(0, 255) : undefined,
    level: entry.level || "error",
    appVersion: resolveAppVersion() || undefined,
    context: entry.context && typeof entry.context === "object" ? entry.context : undefined
  };

  const header = { "content-type": "application/json" };
  const token = safeToken();
  if (token) header.Authorization = `Bearer ${token}`;

  try {
    wx.request({
      url: `${baseURL}/client-errors`,
      method: "POST",
      data: payload,
      header,
      timeout: 5000,
      success() {},
      fail() {}
    });
  } catch (_error) {
    // 静默
  }
}

function resolveCurrentRoute() {
  if (typeof getCurrentPages !== "function") return "";
  try {
    const pages = getCurrentPages() || [];
    const current = pages[pages.length - 1];
    return current ? `/${current.route || current.__route__ || ""}` : "";
  } catch (_error) {
    return "";
  }
}

module.exports = {
  reportClientError,
  resolveCurrentRoute
};
