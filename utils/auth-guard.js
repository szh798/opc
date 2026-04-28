const { getAccessToken } = require("../services/auth.service");

const LOGIN_ENTRY_URL = "/pages/conversation/conversation?scene=onboarding_intro";

function isLoggedIn() {
  const app = typeof getApp === "function" ? getApp() : null;
  const user = (app && app.globalData && app.globalData.user) || {};
  return !!getAccessToken() && !!user.loggedIn;
}

function ensureLoggedIn(options = {}) {
  if (isLoggedIn()) {
    return true;
  }

  const redirectUrl = String(options.redirectUrl || LOGIN_ENTRY_URL);

  if (typeof wx !== "undefined" && typeof wx.reLaunch === "function") {
    wx.reLaunch({ url: redirectUrl });
  }

  return false;
}

module.exports = {
  ensureLoggedIn,
  isLoggedIn,
  LOGIN_ENTRY_URL
};
