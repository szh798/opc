const { agents } = require("./theme/roles");
const { createRuntimeConfig, persistMockFlag } = require("./utils/runtime");

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
