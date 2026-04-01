const { agents } = require("./theme/roles");
const { createRuntimeConfig, persistMockFlag } = require("./utils/runtime");

App({
  globalData: {
    currentAgent: "master",
    firstToolGuideSeen: false,
    user: {
      id: "mock-user-001",
      name: "\u5c0f\u660e",
      nickname: "\u5c0f\u660e",
      initial: "\u5c0f"
    },
    agents,
    runtimeConfig: createRuntimeConfig()
  },

  onLaunch() {
    this.globalData.runtimeConfig = createRuntimeConfig();
  },

  setCurrentAgent(agentKey) {
    this.globalData.currentAgent = agentKey;
  },

  setMockEnabled(enabled) {
    const nextEnabled = !!enabled;

    this.globalData.runtimeConfig = {
      ...this.globalData.runtimeConfig,
      useMock: nextEnabled
    };

    persistMockFlag(nextEnabled);
  },

  isMockEnabled() {
    return !!(this.globalData.runtimeConfig && this.globalData.runtimeConfig.useMock);
  }
});
