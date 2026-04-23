const { get, getRequestConfig } = require("./request");
const { requestData, requestWithFallback } = require("./service-utils");

const DEV_BOOTSTRAP_TIMEOUT_MS = 5000;
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 10000;

function shouldUseDevBootstrapFallback() {
  const runtimeConfig = getRequestConfig();
  return String((runtimeConfig && runtimeConfig.env) || "").trim() === "dev";
}

// dev 环境后端连不上时的兜底 payload —— 只返回空壳,不返回"小明"假身份,
// 避免 demo 数据污染匿名访问,与后端 buildAnonymousBootstrap 保持一致。
function buildBootstrapFallback() {
  return {
    user: {
      id: "",
      name: "",
      nickname: "",
      initial: "",
      stage: "",
      streakDays: 0,
      subtitle: "",
      avatarUrl: "",
      loggedIn: false,
      loginMode: "",
      openId: "",
      unionId: "",
      lastLoginAt: "",
      onboardingCompleted: false,
      hasAssetRadar: false,
      hasOpportunityScores: false,
      hasSelectedDirection: false
    },
    projects: [],
    tools: [],
    recentChats: [],
    assetInventoryStatus: {
      hasReport: false,
      inProgress: false,
      workflowKey: "firstInventory",
      lastConversationId: null,
      resumePrompt: null
    },
    opportunityState: {
      phase2Route: "onboarding_flow",
      focusProject: null,
      primaryAction: "opportunity_continue_identify",
      secondaryActions: ["opportunity_refresh_assets", "opportunity_free_chat"],
      phaseSummaryCopy: "先完成登录和资产盘点，我们再进入机会识别。"
    }
  };
}

function getBootstrapRequestOptions() {
  return {
    timeout: shouldUseDevBootstrapFallback() ? DEV_BOOTSTRAP_TIMEOUT_MS : DEFAULT_BOOTSTRAP_TIMEOUT_MS
  };
}

function fetchBootstrap() {
  const requestOptions = getBootstrapRequestOptions();

  return requestWithFallback(
    () => get("/bootstrap", requestOptions),
    buildBootstrapFallback
  );
}

module.exports = {
  fetchBootstrap
};
