const TOOL_GUIDE_KEY = "opc_tool_guide_seen";

function getStorageSyncSafe(key) {
  try {
    return wx.getStorageSync(key);
  } catch (error) {
    return "";
  }
}

function setStorageSyncSafe(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {}
}

function getToolGuideSeen(app) {
  const appFlag = app && app.globalData ? app.globalData.firstToolGuideSeen : false;

  return Boolean(appFlag || getStorageSyncSafe(TOOL_GUIDE_KEY));
}

function setToolGuideSeen(app, value = true) {
  if (app && app.globalData) {
    app.globalData.firstToolGuideSeen = value;
  }

  setStorageSyncSafe(TOOL_GUIDE_KEY, value);
}

module.exports = {
  getToolGuideSeen,
  setToolGuideSeen
};
