const { STORAGE_KEYS, DEFAULT_RUNTIME_CONFIG } = require("./env");

function safeGetStorageSync(key) {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return undefined;
  }

  try {
    return wx.getStorageSync(key);
  } catch (error) {
    return undefined;
  }
}

function safeSetStorageSync(key, value) {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }

  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // ignore write errors in non-storage environments
  }
}

function resolveStoredMockFlag() {
  const stored = safeGetStorageSync(STORAGE_KEYS.USE_MOCK);
  return typeof stored === "boolean" ? stored : undefined;
}

function createRuntimeConfig(overrides = {}) {
  const merged = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...overrides
  };
  const allowRuntimeMock = !!merged.allowRuntimeMock;
  const storedMock = allowRuntimeMock ? resolveStoredMockFlag() : undefined;

  return {
    ...merged,
    ...(typeof storedMock === "boolean" ? { useMock: storedMock } : {}),
    ...(allowRuntimeMock ? {} : { useMock: false })
  };
}

function getRuntimeConfig() {
  if (typeof getApp !== "function") {
    return createRuntimeConfig();
  }

  try {
    const app = getApp();
    const fromApp = app && app.globalData ? app.globalData.runtimeConfig : null;

    return fromApp || createRuntimeConfig();
  } catch (error) {
    return createRuntimeConfig();
  }
}

function persistMockFlag(enabled) {
  safeSetStorageSync(STORAGE_KEYS.USE_MOCK, !!enabled);
}

module.exports = {
  createRuntimeConfig,
  getRuntimeConfig,
  persistMockFlag
};
