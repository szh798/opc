const { agents } = require("./theme/roles");
const { createRuntimeConfig, persistMockFlag } = require("./utils/runtime");
const { reportClientError, resolveCurrentRoute } = require("./utils/error-report");

App({
  globalData: {
    currentAgent: "master",
    firstToolGuideSeen: false,
    sidebarDataVersion: 0,
    user: {
      id: "",
      name: "",
      nickname: "",
      initial: "\u6e38",
      loggedIn: false,
      loginMode: "guest"
    },
    agents,
    runtimeConfig: createRuntimeConfig()
  },

  onLaunch() {
    this.globalData.runtimeConfig = createRuntimeConfig();
  },

  // Phase B1：小程序全局 JS 异常
  onError(error) {
    const raw = typeof error === "string" ? error : String((error && error.message) || error || "");
    if (!raw) return;
    const split = raw.split("\n");
    reportClientError({
      level: "error",
      message: split[0] || raw,
      stack: split.slice(1).join("\n") || undefined,
      route: resolveCurrentRoute(),
      context: { origin: "app.onError" }
    });
  },

  // Phase B1：未 catch 的 Promise 拒绝
  onUnhandledRejection(detail) {
    const reason = detail && detail.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason || {});
    if (!message) return;
    reportClientError({
      level: "error",
      message: String(message).slice(0, 400),
      stack: reason instanceof Error ? reason.stack : undefined,
      route: resolveCurrentRoute(),
      context: { origin: "app.onUnhandledRejection" }
    });
  },

  setCurrentAgent(agentKey) {
    this.globalData.currentAgent = agentKey;
  },

  setMockEnabled(enabled) {
    const allowRuntimeMock = !!(this.globalData.runtimeConfig && this.globalData.runtimeConfig.allowRuntimeMock);
    const nextEnabled = allowRuntimeMock && !!enabled;

    this.globalData.runtimeConfig = {
      ...this.globalData.runtimeConfig,
      useMock: nextEnabled
    };

    persistMockFlag(nextEnabled);
  },

  isMockEnabled() {
    return !!(
      this.globalData.runtimeConfig &&
      this.globalData.runtimeConfig.allowRuntimeMock &&
      this.globalData.runtimeConfig.useMock
    );
  }
});
