const STORAGE_KEYS = {
  USE_MOCK: "opc_use_mock",
  TOKEN: "opc_access_token",
  REFRESH_TOKEN: "opc_refresh_token"
};

let localRuntimeConfig = {};

try {
  localRuntimeConfig = require("./runtime-config.local");
} catch (_error) {
  localRuntimeConfig = {};
}

const RUNTIME_CONFIG_PRESETS = {
  dev: {
    env: "dev",
    baseURL: "http://127.0.0.1:3000",
    timeout: 15000,
    mockDelay: 180,
    useMock: false,
    allowRuntimeMock: false
  },
  trial: {
    env: "staging",
    baseURL: "https://trial-api.atreeagent.com",
    timeout: 15000,
    mockDelay: 180,
    useMock: false,
    allowRuntimeMock: false
  },
  release: {
    env: "prod",
    baseURL: "https://api.atreeagent.com",
    timeout: 15000,
    mockDelay: 180,
    useMock: false,
    allowRuntimeMock: false
  }
};

function resolveMiniProgramEnvVersion() {
  if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") {
    return "develop";
  }

  try {
    const info = wx.getAccountInfoSync();
    return String((info && info.miniProgram && info.miniProgram.envVersion) || "develop");
  } catch (_error) {
    return "develop";
  }
}

function resolveRuntimePresetKey(envVersion) {
  if (envVersion === "release") {
    return "release";
  }

  if (envVersion === "trial") {
    return "trial";
  }

  return "dev";
}

function resolveDefaultRuntimeConfig() {
  const presetKey = resolveRuntimePresetKey(resolveMiniProgramEnvVersion());
  const preset = RUNTIME_CONFIG_PRESETS[presetKey] || RUNTIME_CONFIG_PRESETS.dev;
  const commonOverrides = localRuntimeConfig.common && typeof localRuntimeConfig.common === "object"
    ? localRuntimeConfig.common
    : {};
  const presetOverrides = localRuntimeConfig[presetKey] && typeof localRuntimeConfig[presetKey] === "object"
    ? localRuntimeConfig[presetKey]
    : {};

  return {
    ...preset,
    ...commonOverrides,
    ...presetOverrides
  };
}

const DEFAULT_RUNTIME_CONFIG = resolveDefaultRuntimeConfig();

const DEFAULT_HEADERS = {
  "content-type": "application/json"
};

module.exports = {
  STORAGE_KEYS,
  DEFAULT_RUNTIME_CONFIG,
  DEFAULT_HEADERS,
  RUNTIME_CONFIG_PRESETS
};
