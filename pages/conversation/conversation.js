const { getConversationScene: getLocalConversationScene } = require("../../services/conversation.service");
const { fetchBootstrap } = require("../../services/bootstrap.service");
const { loginByWechat } = require("../../services/auth.service");
const { updateCurrentUser } = require("../../services/user.service");
const { createProject } = require("../../services/project.service");
const { getToolGuideSeen, setToolGuideSeen } = require("../../services/session.service");
const {
  buildComingSoonPayload,
  emitComingSoonHook
} = require("../../services/coming-soon-subscription.service");
const { resolveToolScene, resolveRecentScene } = require("../../services/intent-routing.service");
const {
  buildFeedbackPrompt,
  buildFeedbackAdvice,
  getFeedbackReplies,
  fetchDailyTasks,
  completeTask,
  fetchTaskFeedback
} = require("../../services/task.service");
const {
  fetchConversationSceneRemote,
  startChatStream,
  pollChatStream,
  foldStreamEvents,
  deleteRecentChat
} = require("../../services/chat.service");
const {
  createRouterSession,
  fetchRouterSession,
  startRouterStream,
  pollRouterStream,
  cancelRouterStream,
  switchRouterAgent,
  submitRouterQuickReply,
  fetchAssetReportStatus,
  foldRouterStreamEvents
} = require("../../services/router.service");
const { buildQuickReplyPayload } = require("../../services/conversation-state.service");
const { cardsToMessages, normalizeCardPayload } = require("../../services/card-registry.service");
const { getAgentMeta } = require("../../services/agent.service");
const { getNavMetrics } = require("../../utils/nav");
const { buildDisplayUser, normalizeAvatarUrl } = require("../../utils/user-display");

const AGENT_SCENE_MAP = {
  master: "home",
  asset: "ip_assistant",
  execution: "ai_assistant",
  mindset: "social_proof",
  steward: "monthly_check"
};

const AGENT_ORDER = ["master", "asset", "execution", "mindset", "steward"];
const AGENT_COMING_SOON_KEYS = ["execution", "mindset"];
const AGENT_COMING_SOON_TIP = "一树正在开发";
const TOOL_COMING_SOON_KEYS = ["ai", "ip", "company"];
const TOOL_COMING_SOON_TIP = "一树正在开发";
// 方案 γ —— 主对话流退役后,execution/mindset 相关的 routeAction 全部在前端拦截,
// 点击后直接弹 coming-soon 提示,不再发送到后端。后端 ROUTE_ACTION_DECISIONS 里
// 对应条目仍保留作防御性回退,但运行时流量不应触达。
const BLOCKED_ROUTE_ACTIONS = new Set([
  "task_completed",
  "action_plan_48h",
  "opportunity_score",
  "project_execution_followup",
  "tool_ai",
  "switch_execution",
  "mindset_unblock",
  "mindset_next_step"
]);
const COMING_SOON_NOTICE_DURATION = 1800;
const PROJECT_COLORS = ["#378ADD", "#10A37F", "#534AB7", "#E24B4A", "#EBA327"];
const SCENE_ROUTE_ACTION_MAP = {
  onboarding_path_working: "route_working",
  onboarding_path_trying: "route_trying",
  onboarding_path_fulltime: "route_fulltime",
  onboarding_path_park: "route_park",
  // 旧 key 别名，防止旧版 mock / 服务端派发仍指向旧场景
  onboarding_path_explore: "route_working",
  onboarding_path_stuck: "route_trying",
  onboarding_path_scale: "route_fulltime",
  ai_assistant: "tool_ai",
  ip_assistant: "tool_ip",
  monthly_check: "business_health",
  company_park_followup: "company_park_followup",
  company_tax_followup: "company_tax_followup",
  company_profit_followup: "company_profit_followup",
  company_payroll_followup: "company_payroll_followup",
  project_execution_followup: "project_execution_followup",
  project_asset_followup: "project_asset_followup"
};
const TOOL_ROUTE_ACTION_MAP = {
  ai: "tool_ai",
  ip: "tool_ip"
};
const AGENT_MENU_GAP_PX = 4;
const LOGIN_REQUIRED_TIP = "请先登录后再使用";

function mergeUserState(remote = {}, local = {}) {
  const remoteUser = remote && typeof remote === "object" ? remote : {};
  const localUser = local && typeof local === "object" ? local : {};
  const hasRemoteId = !!String(remoteUser.id || "").trim();
  const hasLocalId = !!String(localUser.id || "").trim();
  const shouldApplyLocal = hasLocalId || !hasRemoteId;
  const base = shouldApplyLocal
    ? { ...remoteUser, ...localUser }
    : { ...remoteUser };

  const localName = shouldApplyLocal ? String(localUser.nickname || localUser.name || "").trim() : "";
  const remoteName = String(remoteUser.nickname || remoteUser.name || "").trim();
  const nextName = localName || remoteName;

  const localInitial = shouldApplyLocal ? String(localUser.initial || "").trim() : "";
  const remoteInitial = String(remoteUser.initial || "").trim();

  const localAvatar = shouldApplyLocal ? String(localUser.avatarUrl || "").trim() : "";
  const remoteAvatar = String(remoteUser.avatarUrl || "").trim();

  return {
    ...base,
    ...buildDisplayUser(
      {
        ...base,
        name: nextName || String(base.name || "").trim(),
        nickname: nextName || String(base.nickname || base.name || "").trim(),
        initial: localInitial || remoteInitial || nextName.slice(0, 1) || String(base.initial || "游").trim() || "游",
        avatarUrl: localAvatar || remoteAvatar || String(base.avatarUrl || "").trim()
      },
      {
        fallbackName: "访客",
        fallbackInitial: "游"
      }
    ),
    loggedIn:
      shouldApplyLocal && typeof localUser.loggedIn === "boolean"
        ? localUser.loggedIn
        : (typeof remoteUser.loggedIn === "boolean" ? remoteUser.loggedIn : !!base.loggedIn),
    loginMode:
      shouldApplyLocal && typeof localUser.loginMode === "string" && localUser.loginMode.trim()
        ? localUser.loginMode.trim()
        : String(remoteUser.loginMode || base.loginMode || "").trim()
  };
}

function normalizeUserState(user = {}) {
  const source = user && typeof user === "object" ? user : {};
  const displayUser = buildDisplayUser(source, {
    fallbackName: "访客",
    fallbackInitial: "游"
  });

  return {
    ...source,
    id: String(source.id || "").trim(),
    name: displayUser.name,
    nickname: displayUser.nickname,
    initial: displayUser.initial,
    avatarUrl: normalizeAvatarUrl(source.avatarUrl),
    loginMode: String(source.loginMode || "").trim(),
    loggedIn: !!source.loggedIn
  };
}

function buildAgentMenuOptions() {
  return AGENT_ORDER.map((agentKey) => {
    const meta = getAgentMeta(agentKey);
    const disabled = AGENT_COMING_SOON_KEYS.includes(meta.key);
    return {
      key: meta.key,
      label: meta.label,
      color: meta.color,
      disabled
    };
  });
}

function canSimulateFreshLogin() {
  const app = typeof getApp === "function" ? getApp() : null;
  const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || {};
  return String(runtimeConfig.env || "").trim() === "dev";
}

function stampMessages(messages = []) {
  const seed = Date.now();

  return messages
    .filter((message) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === "typing") {
        return false;
      }

      const messageId = String(message.id || "");
      if (/^router-welcome-/.test(messageId)) {
        return false;
      }
      if (messageId === "onboarding-route-2") {
        return false;
      }

      return true;
    })
    .map((message, index) => {
      const nextMessage = { ...message };

      if (nextMessage.type === "artifact_card") {
        const localized = normalizeCardPayload({
          cardType: nextMessage.cardType,
          title: nextMessage.title,
          description: nextMessage.description,
          primaryText: nextMessage.primaryText,
          secondaryText: nextMessage.secondaryText,
          tags: nextMessage.tags
        });

        if (localized) {
          nextMessage.title = localized.title;
          nextMessage.description = localized.description;
          nextMessage.primaryText = localized.primaryText;
          nextMessage.secondaryText = localized.secondaryText;
        }
      }

      return {
        ...nextMessage,
        _uid: `${nextMessage.id || "msg"}-${seed}-${index}`
      };
    });
}

function buildUserMessage(text, fixedId = "") {
  const id = String(fixedId || `user-${Date.now()}`);

  return {
    id,
    _uid: id,
    type: "user",
    text
  };
}

function buildAgentMessage(text) {
  return {
    id: `agent-${Date.now()}`,
    type: "agent",
    text
  };
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveActiveToolKey(sceneKey, pendingToolTarget = "") {
  if (pendingToolTarget === "company") {
    return "company";
  }

  if (sceneKey === "ai_assistant") {
    return "ai";
  }

  if (sceneKey === "ip_assistant") {
    return "ip";
  }

  if (sceneKey === "leverage_intro" && (pendingToolTarget === "ai" || pendingToolTarget === "ip")) {
    return pendingToolTarget;
  }

  return "";
}

function resolveRouteActionByScene(sceneKey = "", fallback = "") {
  return SCENE_ROUTE_ACTION_MAP[sceneKey] || fallback || "";
}

function isOnboardingScene(sceneKey = "") {
  return /^onboarding(?:_|$)/.test(String(sceneKey || ""));
}

function isPreRouterOnboardingScene(sceneKey = "") {
  return [
    "onboarding_intro",
    "onboarding_nickname",
    "onboarding_rename"
  ].includes(String(sceneKey || ""));
}

function resolveBootstrapScene(sceneKey = "", user = {}) {
  const requestedScene = String(sceneKey || "home").trim() || "home";
  return requestedScene;
}

function withRetryQuickReply(items = []) {
  const safeItems = Array.isArray(items) ? items.slice() : [];
  const hasRetry = safeItems.some((item) => item && item.action === "retry_router");
  if (!hasRetry) {
    safeItems.unshift({
      label: "重试上一步",
      action: "retry_router"
    });
  }
  return safeItems;
}

function sanitizeNickname(name, fallback = "\u5c0f\u660e") {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, 12);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return String(value || "");
  }
}

function pickProjectColor(index = 0) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length] || PROJECT_COLORS[0];
}

function requestProjectName() {
  return new Promise((resolve) => {
    wx.showModal({
      title: "创建项目",
      editable: true,
      placeholderText: "例如：智能获客实验",
      confirmText: "创建",
      success(result) {
        if (!result.confirm) {
          resolve("");
          return;
        }

        resolve(String(result.content || "").trim());
      },
      fail() {
        resolve("");
      }
    });
  });
}

function resolveUiErrorMessage(error, fallbackMessage) {
  const message = String((error && error.message) || "").trim();
  if (!message) {
    return fallbackMessage;
  }

  if (message === "empty_stream_events" || message === "empty_stream_content" || message === "stream_timeout") {
    return "智能体暂时没有返回内容，请稍后再试";
  }

  if (message === "Dify is unavailable") {
    return "智能体暂时不可用，请稍后重试";
  }

  if (/timeout of \d+ms exceeded/i.test(message)) {
    return "智能体这次思考超时了，请稍后重试，或在 Dify 中检查模型响应耗时";
  }

  if (message.includes("messages 参数非法")) {
    return "智能体暂时不可用：Dify 当前模型配置不兼容聊天消息格式，请检查该应用绑定的模型或工作流节点";
  }

  if (/^Dify request failed:/i.test(message)) {
    return message.replace(/^Dify request failed:\s*/i, "智能体暂时不可用：");
  }

  return message;
}

// onboarding_route 自由文本启发：命中强信号才返回对应场景，其余全部返回 null 交给后端
// 兜底 chatflow（Phase 1.3 的 5-通用兜底对话流）去接住，避免把所有自由文本强塞进资产盘点。
function inferOnboardingRouteByText(text) {
  const source = String(text || "").trim();

  if (!source) {
    return null;
  }

  if (/(\u56ed\u533a|\u6ce8\u518c|\u653f\u7b56|\u8fd4\u7a0e|\u5165\u9a7b|\u8585|\u516c\u53f8\u5730\u5740)/.test(source)) {
    return "onboarding_path_park";
  }

  if (/(\u4e0a\u73ed|\u4e0a\u73ed\u65cf|\u6ca1\u60f3\u8fc7|\u6ca1\u601d\u8003\u8fc7|\u4e0a\u73ed\u65cf|\u6253\u5de5)/.test(source)) {
    return "onboarding_path_working";
  }

  if (/(\u6709\u60f3\u6cd5|\u5728\u5c1d\u8bd5|\u525a\u5f00\u59cb|\u65b0\u624b\u4e0a\u8def|\u5728\u6478\u7d22|\u8bd5\u7740\u505a)/.test(source)) {
    return "onboarding_path_trying";
  }

  if (/(\u5168\u804c|\u81ea\u5df1\u5f00\u4e86|\u81ea\u5df1\u5728\u505a|\u521b\u4e1a\u4e24\u5e74|\u521b\u4e1a\u4e09\u5e74|\u5df2\u7ecf\u5728\u505a)/.test(source)) {
    return "onboarding_path_fulltime";
  }

  return null;
}

function normalizeTaskItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    id: item && item.id ? item.id : `task-${Date.now()}`,
    label: item && item.label ? item.label : "",
    tag: item && item.tag ? item.tag : "",
    done: !!(item && item.done)
  }));
}

function mergeTaskCardIntoMessages(messages = [], taskPayload = {}) {
  const hasTaskCard = messages.some((message) => message.type === "task_card");
  if (!hasTaskCard) {
    return messages;
  }

  const items = normalizeTaskItems(taskPayload.items);
  if (!items.length) {
    return messages;
  }

  return messages.map((message) => {
    if (message.type !== "task_card") {
      return message;
    }

    return {
      ...message,
      title: taskPayload.title || message.title || "今日任务",
      items
    };
  });
}

function markTaskDoneInMessages(messages = [], taskId = "", taskLabel = "") {
  return messages.map((message) => {
    if (message.type !== "task_card" || !Array.isArray(message.items)) {
      return message;
    }

    const nextItems = message.items.map((item) => {
      const byIdMatched = taskId && String(item.id) === String(taskId);
      const byLabelMatched = !taskId && taskLabel && item.label === taskLabel;

      if (!byIdMatched && !byLabelMatched) {
        return item;
      }

      return {
        ...item,
        done: true
      };
    });

    return {
      ...message,
      items: nextItems
    };
  });
}

Page({
  data: {
    sceneKey: "home",
    pendingToolTarget: "",
    agentKey: "master",
    agentColor: "#0D0D0D",
    user: {},
    projects: [],
    tools: [],
    recentChats: [],
    messages: [],
    quickReplies: [],
    inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
    allowInput: true,
    sidebarVisible: false,
    projectSheetVisible: false,
    scrollIntoView: "",
    activeToolKey: "",
    activeConversationId: "",
    conversationStateId: "",
    currentAgentId: "master",
    routeMode: "guided",
    activeChatflowId: "",
    pendingQuickReplyAction: "",
    assetReportStatus: "idle",
    assetReportVersion: "",
    assetReportLastAt: "",
    assetReportError: "",
    routerErrorMessage: "",
    feedbackPendingTask: "",
    feedbackPendingTaskId: "",
    feedbackLastSummary: "",
    isStreaming: false,
    bootLoading: true,
    bootError: false,
    agentMenuVisible: false,
    agentMenuStyle: "",
    agentMenuOptions: buildAgentMenuOptions(),
    showDevFreshLogin: false,
    comingSoonNoticeVisible: false,
    comingSoonNoticeText: "",
    comingSoonNoticeFeatureKey: ""
  },

  onUnload() {
    this.currentSceneHydrationKey = "";
    this.currentTaskHydrationKey = "";
    this.assetReportPollingSessionId = "";
    this.clearComingSoonNoticeTimer();
    this.stopStreaming();
  },

  onLoad(options) {
    const app = getApp();
    this.sidebarDataVersionSeen = Number((app && app.globalData && app.globalData.sidebarDataVersion) || 0);
    this.lastRouterActionPayload = null;
    this.initialRouteApplied = false;
    this.assetReportPollingSessionId = "";
    this.latestAssetReportReadyKey = "";
    this.latestAssetReportFailedKey = "";
    this.syncAgentMenuLayout();
    this.setData({
      showDevFreshLogin: canSimulateFreshLogin()
    });
    this.bootstrapConversationData(options);
  },

  onShow() {
    this.syncAgentMenuLayout();
    this.setData({
      showDevFreshLogin: canSimulateFreshLogin()
    });
    const app = getApp();
    const nextVersion = Number((app && app.globalData && app.globalData.sidebarDataVersion) || 0);
    if (nextVersion !== this.sidebarDataVersionSeen) {
      this.sidebarDataVersionSeen = nextVersion;
      this.syncUserState((app && app.globalData && app.globalData.user) || {});
      this.refreshSidebarData();
    }
  },

  syncAgentMenuLayout() {
    const navMetrics = getNavMetrics(true);
    const fallbackTop = navMetrics.headerTop + navMetrics.menuHeight + 6 + AGENT_MENU_GAP_PX;
    const applyMenuTop = (menuTop) => {
      const nextStyle = `top: ${menuTop}px;`;
      if (nextStyle === this.data.agentMenuStyle) {
        return;
      }

      this.setData({
        agentMenuStyle: nextStyle
      });
    };
    const measureHeaderBottom = () => {
      const query = this.createSelectorQuery();
      query.select(".conversation-header-anchor").boundingClientRect();
      query.exec((result = []) => {
        const headerRect = result[0];
        const measuredTop = headerRect && Number.isFinite(headerRect.bottom)
          ? Math.round(headerRect.bottom + AGENT_MENU_GAP_PX)
          : fallbackTop;

        applyMenuTop(Math.max(fallbackTop, measuredTop));
      });
    };

    if (typeof wx !== "undefined" && typeof wx.nextTick === "function") {
      wx.nextTick(measureHeaderBottom);
      return;
    }

    measureHeaderBottom();
  },

  clearComingSoonNoticeTimer() {
    if (this.comingSoonNoticeTimer) {
      clearTimeout(this.comingSoonNoticeTimer);
      this.comingSoonNoticeTimer = null;
    }
  },

  showComingSoonNotice(message, featureKey = "") {
    this.clearComingSoonNoticeTimer();
    this.setData({
      comingSoonNoticeVisible: true,
      comingSoonNoticeText: String(message || TOOL_COMING_SOON_TIP).trim() || TOOL_COMING_SOON_TIP,
      comingSoonNoticeFeatureKey: String(featureKey || "").trim()
    });
    this.comingSoonNoticeTimer = setTimeout(() => {
      this.setData({
        comingSoonNoticeVisible: false,
        comingSoonNoticeText: "",
        comingSoonNoticeFeatureKey: ""
      });
      this.comingSoonNoticeTimer = null;
    }, COMING_SOON_NOTICE_DURATION);
  },

  isUserLoggedIn() {
    return !!(this.data.user && this.data.user.loggedIn);
  },

  hasPendingLoginCard() {
    return this.data.messages.some((message) => message && message.type === "login_card" && message.mode !== "done");
  },

  promptLoginRequired(message = LOGIN_REQUIRED_TIP) {
    this.setData({
      sidebarVisible: false,
      agentMenuVisible: false,
      projectSheetVisible: false
    });

    if (this.data.sceneKey !== "onboarding_intro" || !this.hasPendingLoginCard()) {
      this.replaceScene("onboarding_intro");
    }

    wx.showToast({
      title: String(message || LOGIN_REQUIRED_TIP).trim() || LOGIN_REQUIRED_TIP,
      icon: "none"
    });
    return false;
  },

  ensureLoggedIn(message = LOGIN_REQUIRED_TIP) {
    if (this.isUserLoggedIn()) {
      return true;
    }

    return this.promptLoginRequired(message);
  },

  notifyComingSoonSubscriptionHook(featureKey, meta = {}) {
    const payload = buildComingSoonPayload({
      featureKey,
      source: "conversation_sidebar_tool",
      message: TOOL_COMING_SOON_TIP,
      meta
    });
    emitComingSoonHook(payload);
    if (typeof this.onComingSoonSubscriptionHook === "function") {
      this.onComingSoonSubscriptionHook(payload);
    }
  },

  bootstrapConversationData(options) {
    const app = getApp();
    this.setData({
      bootLoading: true,
      bootError: false
    });

    const openInitialScene = (user = {}) => {
      const initialScene = resolveBootstrapScene(options.scene || "home", user);
      const target = options.target || "";
      const initialUserText = options.userText ? safeDecode(options.userText) : "";

      if (initialUserText && initialScene !== "home") {
        this.appendScene(initialScene, {
          target,
          userText: initialUserText
        });
        return initialScene;
      }

      this.replaceScene(initialScene, {
        target
      });
      return initialScene;
    };

    fetchBootstrap()
      .then((payload) => {
        const mergedUser = mergeUserState(
          (payload && payload.user) || {},
          (app && app.globalData && app.globalData.user) || {}
        );
        this.syncUserState(mergedUser);
        const assetInventoryStatus = (payload && payload.assetInventoryStatus) || null;
        this.setData({
          projects: Array.isArray(payload && payload.projects) ? payload.projects : [],
          tools: Array.isArray(payload && payload.tools) ? payload.tools : [],
          recentChats: Array.isArray(payload && payload.recentChats) ? payload.recentChats : [],
          assetInventoryStatus,
          bootLoading: false,
          bootError: false
        });

        const openedScene = openInitialScene(mergedUser);
        if (!isPreRouterOnboardingScene(openedScene)) {
          this.initializeRouterSession()
            .then(() => this.tryHandleInitialRouteAction(options))
            .then(() => this.tryAutoResumeAssetInventory(options, mergedUser, assetInventoryStatus));
        }
      })
      .catch(() => {
        const fallbackUser = app.globalData.user || {};
        this.syncUserState(fallbackUser);
        this.setData({
          projects: [],
          tools: [],
          recentChats: [],
          bootLoading: false,
          bootError: true
        });

        const openedScene = openInitialScene(fallbackUser);
        if (!isPreRouterOnboardingScene(openedScene)) {
          this.initializeRouterSession().then(() => this.tryHandleInitialRouteAction(options));
        }
      });
  },

  bumpSidebarDataVersion() {
    const app = getApp();
    if (!app || !app.globalData) {
      return;
    }

    const nextVersion = Number(app.globalData.sidebarDataVersion || 0) + 1;
    app.globalData.sidebarDataVersion = nextVersion;
    this.sidebarDataVersionSeen = nextVersion;
  },

  refreshSidebarData() {
    const app = getApp();
    return fetchBootstrap()
      .then((payload) => {
        const mergedUser = mergeUserState(
          (payload && payload.user) || {},
          (app && app.globalData && app.globalData.user) || {}
        );
        this.syncUserState(mergedUser);

        this.setData({
          projects: Array.isArray(payload && payload.projects) ? payload.projects : [],
          tools: Array.isArray(payload && payload.tools) ? payload.tools : [],
          recentChats: Array.isArray(payload && payload.recentChats) ? payload.recentChats : []
        });
      })
      .catch(() => undefined);
  },

  syncSceneMeta(scene, messages) {
    const app = getApp();

    app.setCurrentAgent(scene.agentKey);

    this.setData({
      sceneKey: scene.key,
      agentKey: scene.agentKey,
      currentAgentId: scene.agentKey,
      agentColor: scene.agent.color,
      activeToolKey: resolveActiveToolKey(scene.key, this.data.pendingToolTarget),
      quickReplies: scene.quickReplies || [],
      inputPlaceholder: scene.inputPlaceholder || "\u8f93\u5165\u6d88\u606f...",
      allowInput: scene.allowInput !== false,
      messages,
      scrollIntoView: messages.length ? `msg-${messages[messages.length - 1]._uid}` : ""
    });

    this.syncDailyTaskCard(scene.key);
  },

  syncDailyTaskCard(sceneKey) {
    if (sceneKey !== "home") {
      this.currentDailyTaskSyncKey = "";
      return;
    }

    const syncKey = `daily-task-${Date.now()}`;
    this.currentDailyTaskSyncKey = syncKey;

    fetchDailyTasks()
      .then((taskPayload) => {
        if (this.currentDailyTaskSyncKey !== syncKey || this.data.sceneKey !== "home") {
          return;
        }

        this.patchDailyTaskCard(taskPayload);
      })
      .catch(() => {
        if (this.currentDailyTaskSyncKey === syncKey) {
          this.currentDailyTaskSyncKey = "";
        }
      });
  },

  patchDailyTaskCard(taskPayload = {}) {
    const hasTaskCard = this.data.messages.some((message) => message.type === "task_card");
    if (!hasTaskCard) {
      return;
    }

    const nextMessages = this.data.messages.map((message) => {
      if (message.type !== "task_card") {
        return message;
      }

      return {
        ...message,
        title: taskPayload.title || message.title,
        items: Array.isArray(taskPayload.items) ? taskPayload.items : message.items
      };
    });

    this.setData({
      messages: nextMessages
    });
  },

  patchTaskCardItem(taskId, updates = {}) {
    if (!taskId) {
      return;
    }

    const nextMessages = this.data.messages.map((message) => {
      if (message.type !== "task_card" || !Array.isArray(message.items)) {
        return message;
      }

      return {
        ...message,
        items: message.items.map((item) => {
          if (item.id !== taskId) {
            return item;
          }

          return {
            ...item,
            ...updates
          };
        })
      };
    });

    this.setData({
      messages: nextMessages
    });
  },

  syncUserState(user = {}) {
    const nextUser = normalizeUserState(user);

    this.data.user = {
      ...nextUser
    };

    this.setData({
      user: this.data.user
    });

    const app = getApp();
    if (app && app.globalData) {
      app.globalData.user = {
        ...app.globalData.user,
        ...nextUser
      };
    }
  },

  applyRouterStatePatch(patch = {}) {
    this.setData({
      conversationStateId: patch.conversationStateId || this.data.conversationStateId,
      currentAgentId: patch.currentAgentId || this.data.currentAgentId,
      routeMode: patch.routeMode || this.data.routeMode,
      activeChatflowId: patch.activeChatflowId || this.data.activeChatflowId,
      pendingQuickReplyAction:
        typeof patch.pendingQuickReplyAction === "string"
          ? patch.pendingQuickReplyAction
          : this.data.pendingQuickReplyAction
    });
  },

  applyAssetReportStatusPatch(patch = {}) {
    this.setData({
      assetReportStatus: patch.reportStatus || patch.assetReportStatus || this.data.assetReportStatus || "idle",
      assetReportVersion: patch.reportVersion || this.data.assetReportVersion || "",
      assetReportLastAt: patch.lastReportAt || this.data.assetReportLastAt || "",
      assetReportError:
        typeof patch.lastError === "string"
          ? patch.lastError
          : (typeof patch.reportError === "string" ? patch.reportError : this.data.assetReportError || "")
    });
  },

  buildAssetReportReadyKey(status = {}) {
    const workflow = String(status.assetWorkflowKey || "").trim();
    const version = String(status.reportVersion || "").trim();
    const lastAt = String(status.lastReportAt || "").trim();
    return `${workflow}|${version}|${lastAt}`;
  },

  async watchAssetReportStatus(sessionId, options = {}) {
    if (!sessionId) {
      return;
    }
    if (this.assetReportPollingSessionId === sessionId) {
      return;
    }

    this.assetReportPollingSessionId = sessionId;
    const maxPoll = Math.max(1, Number(options.maxPoll || 25));
    const pollInterval = Math.max(500, Number(options.pollInterval || 1200));
    try {
      for (let i = 0; i < maxPoll; i += 1) {
        if (this.assetReportPollingSessionId !== sessionId) {
          return;
        }

        const status = await fetchAssetReportStatus(sessionId);
        this.applyAssetReportStatusPatch(status);
        const reportStatus = String(status.reportStatus || "").toLowerCase();

        if (reportStatus === "ready") {
          const readyKey = this.buildAssetReportReadyKey(status);
          if (readyKey && readyKey !== this.latestAssetReportReadyKey) {
            this.latestAssetReportReadyKey = readyKey;
            const summary = buildAgentMessage("资产报告已生成，点击卡片即可查看。");
            const card = normalizeCardPayload({
              cardType: "asset_report",
              title: "资产盘点报告已生成",
              description: "你可以现在查看报告，也可以稍后到个人页继续。",
              primaryText: "查看报告",
              secondaryText: "稍后",
              primaryAction: "open_asset_report"
            });
            const messages = [summary];
            if (card) {
              messages.push(card);
            }
            this.appendMessages(messages, this.data.quickReplies);
          }
          return;
        }

        if (reportStatus === "failed") {
          const failedKey = `${this.buildAssetReportReadyKey(status)}|${status.lastError || ""}`;
          if (failedKey && failedKey !== this.latestAssetReportFailedKey) {
            this.latestAssetReportFailedKey = failedKey;
            const errorMessage = status.lastError
              ? `资产报告生成失败：${status.lastError}`
              : "资产报告生成失败，请稍后重试。";
            this.appendMessages([buildAgentMessage(errorMessage)], this.data.quickReplies);
          }
          return;
        }

        await sleep(pollInterval);
      }
    } catch (_error) {
      // noop
    } finally {
      if (this.assetReportPollingSessionId === sessionId) {
        this.assetReportPollingSessionId = "";
      }
    }
  },

  bindRouterSession(snapshot = {}, options = {}) {
    const nextAgent = snapshot.agentKey || this.data.agentKey;
    this.applyRouterStatePatch({
      conversationStateId: snapshot.conversationStateId || snapshot.sessionId || this.data.conversationStateId,
      currentAgentId: nextAgent,
      routeMode: snapshot.routeMode || this.data.routeMode,
      activeChatflowId: snapshot.activeChatflowId || snapshot.chatflowId || this.data.activeChatflowId
    });
    this.applyAssetReportStatusPatch(snapshot);

    if (options.includeMessages) {
      const messages = []
        .concat(Array.isArray(snapshot.firstScreenMessages) ? snapshot.firstScreenMessages : [])
        .concat(Array.isArray(snapshot.recentMessages) ? snapshot.recentMessages : []);
      if (messages.length) {
        this.appendMessages(messages, Array.isArray(snapshot.quickReplies) ? snapshot.quickReplies : this.data.quickReplies);
      }
    } else if (options.includeQuickReplies !== false && Array.isArray(snapshot.quickReplies)) {
      this.setData({
        quickReplies: snapshot.quickReplies
      });
    }

    if (nextAgent) {
      this.setData({
        agentKey: nextAgent,
        agentColor: this.getAgentColorByKey(nextAgent)
      });
      getApp().setCurrentAgent(nextAgent);
    }

    if (String(snapshot.assetReportStatus || "").toLowerCase() === "pending" && this.data.conversationStateId) {
      this.watchAssetReportStatus(this.data.conversationStateId);
    }
  },

  async initializeRouterSession(options = {}) {
    const isLoggedIn = !!(this.data.user && this.data.user.loggedIn);
    if (!isLoggedIn) {
      return false;
    }

    try {
      const snapshot = await createRouterSession({
        sessionId: this.data.conversationStateId || "",
        source: "conversation_page",
        forceNew: options.forceNew === true
      });
      if (!snapshot || !snapshot.sessionId) {
        return false;
      }
      this.bindRouterSession(snapshot, {
        includeMessages:
          typeof options.includeMessages === "boolean"
            ? options.includeMessages
            : !this.data.conversationStateId
      });
      return true;
    } catch (_error) {
      return false;
    }
  },

  async ensureRouterSession(options = {}) {
    if (this.data.conversationStateId) {
      return true;
    }

    const shouldForceNew = options.forceNew === true || isOnboardingScene(this.data.sceneKey);
    return this.initializeRouterSession({
      forceNew: shouldForceNew
    });
  },

  async runRouterAction(input = {}, options = {}) {
    if (!this.data.conversationStateId) {
      return false;
    }

    // 方案 γ —— 主对话流退役,execution/mindset 相关 routeAction 在前端拦截,
    // 用户点击后弹 coming-soon 提示,请求不下发后端,避免落入已下线的 agent 分支。
    const requestedRouteAction = String((input && input.routeAction) || "").trim();
    if (requestedRouteAction && BLOCKED_ROUTE_ACTIONS.has(requestedRouteAction)) {
      this.showComingSoonNotice(AGENT_COMING_SOON_TIP, requestedRouteAction);
      return false;
    }

    if (this.data.isStreaming) {
      wx.showToast({
        title: "正在输出，请稍后",
        icon: "none"
      });
      return true;
    }

    const userLabel = String(options.userLabel || "").trim();
    const showUserMessage = options.showUserMessage !== false;
    const silentFailure = options.silentFailure === true;
    const showProcessingMessage = options.showProcessingMessage !== false;
    const streamMessageId = `router-stream-${Date.now()}`;
    const optimisticUserMessageId = showUserMessage && userLabel ? `user-${Date.now()}-${Math.random()}` : "";
    const streamJobKey = `router-job-${Date.now()}`;
    this.currentStreamJobKey = streamJobKey;

    const optimistic = [];
    if (optimisticUserMessageId) {
      optimistic.push(buildUserMessage(userLabel, optimisticUserMessageId));
    }
    optimistic.push({
      id: streamMessageId,
      type: "agent",
      uiMode: "processing",
      text: options.loadingText || "一树正在处理中"
    });
    // 用户已经主动发话(或点了快捷回复),旧的 quickReplies 一律清空——
    // 让按钮跟"用户消息已上屏"同一帧消失,而不是等 Dify 流式回完才消失。
    this.appendMessages(optimistic, []);
    if (!showProcessingMessage) {
      this.removeMessagesByIds([streamMessageId]);
    }
    // 用户一旦真正进入 router 流(发消息 / 点快捷回复走 routeAction),就必须把首屏
    // onboarding 场景埋的那句"选一个状态..."刷掉。之前只在 stream 成功分支里改,
    // 导致用户从点击到 Dify 回完这几秒还看着老提示语。现在乐观更新,跟 optimisticUserMessage
    // 同一帧切掉,视觉上跟"已经开始处理"是一致的。
    this.setData({
      isStreaming: true,
      routerErrorMessage: "",
      inputPlaceholder: "和一树继续聊…"
    });

    let streamResult = null;
    let lastError = null;
    const retries = Math.max(1, Number(options.retries || 2));
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        if (options.useQuickReplyEndpoint && options.quickReplyPayload) {
          streamResult = await submitRouterQuickReply(this.data.conversationStateId, options.quickReplyPayload);
        } else {
          streamResult = await startRouterStream(this.data.conversationStateId, input);
        }
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retries - 1) {
          await sleep(220 * (attempt + 1));
        }
      }
    }

    try {
      if (!streamResult) {
        throw lastError || new Error("router_start_failed");
      }

      this.applyRouterStatePatch({
        conversationStateId: streamResult.conversationStateId || this.data.conversationStateId,
        currentAgentId: streamResult.agentKey || this.data.currentAgentId,
        routeMode: streamResult.routeMode || this.data.routeMode,
        activeChatflowId: streamResult.activeChatflowId || streamResult.chatflowId || this.data.activeChatflowId,
        pendingQuickReplyAction: ""
      });
      this.applyAssetReportStatusPatch(streamResult);

      const streamId = streamResult.streamId || "";
      // handleStopStream 要用它发 cancel 请求,因此挂在实例上,成功结束或出错时再清掉。
      this.currentStreamId = streamId;
      const inlineEvents = Array.isArray(streamResult.events) ? streamResult.events : [];
      // 后端真流式会返回 events:[] + status:"streaming",后台 worker 边跑边写 streamEvent。
      // blocking 的老路径仍然会把全量 events 一次性 inline 返回,两种情况都兼容:
      //   inline 非空 → 直接打字机式渲染
      //   inline 为空 → 进入 streaming 模式,一边 poll 一边渲染,first token 到达即可见。
      const events = [];
      const accumulator = { text: "" };

      if (inlineEvents.length) {
        events.push(...inlineEvents);
        accumulator.text = await this.renderStreamTokens(streamMessageId, inlineEvents, streamJobKey);
      } else {
        await this.pollStreamEvents(streamId, streamJobKey, pollRouterStream, async (chunk) => {
          if (!Array.isArray(chunk) || !chunk.length) {
            return;
          }
          events.push(...chunk);
          accumulator.text = await this.renderStreamTokens(
            streamMessageId,
            chunk,
            streamJobKey,
            accumulator.text
          );
        });
      }
      if (!events.length) {
        throw new Error("empty_stream_events");
      }

      const streamedText = accumulator.text;
      const folded = foldRouterStreamEvents(events);
      const finalText = folded.content || streamedText;
      if (!finalText) {
        throw new Error("empty_stream_content");
      }
      if (showProcessingMessage) {
        this.patchMessageText(streamMessageId, finalText);
      } else {
        this.appendMessages([{
          id: streamMessageId,
          type: "agent",
          text: finalText
        }], this.data.quickReplies);
      }

      if (Array.isArray(folded.cards) && folded.cards.length) {
        this.appendMessages(cardsToMessages(folded.cards), this.data.quickReplies);
      }

      this.lastRouterActionPayload = null;
      this.currentStreamJobKey = "";
      this.currentStreamId = "";
      // Dify 流跑完之后原先会把 session snapshot 里的 quickReplies 回填回来，
      // 但那批按钮跟 Dify 刚回复的内容往往不搭（例如聊着资产却弹"盘一盘我的资产"），
      // 索性清空，让用户顺着 Dify 文字继续往下聊就行。
      // 同理 inputPlaceholder 也要刷掉:onboarding 那几条"选一个状态..."是首屏固定场景里带的,
      // 用户已经进入自由对话后不该再挂在输入框里。
      this.setData({
        isStreaming: false,
        quickReplies: [],
        inputPlaceholder: "和一树继续聊…"
      });

      fetchRouterSession(this.data.conversationStateId)
        .then((snapshot) => {
          this.bindRouterSession(snapshot, {
            includeMessages: false,
            includeQuickReplies: false
          });
        })
        .catch(() => {});

      // Dify 流成功跑完意味着后端已经在 conversation 表里插了/更新了这一条会话,
      // 侧边栏 RECENT CHATS 需要立刻刷新,否则要等下次页面重载才能看到。
      // 不阻塞当前流程 — fire-and-forget,刷新失败也不影响本轮对话展示。
      this.refreshSidebarData();

      if (String(streamResult.assetReportStatus || "").toLowerCase() === "pending" && this.data.conversationStateId) {
        this.watchAssetReportStatus(this.data.conversationStateId);
      }

      return true;
    } catch (error) {
      if (silentFailure) {
        this.currentStreamJobKey = "";
        this.removeMessagesByIds([optimisticUserMessageId, streamMessageId]);
        this.lastRouterActionPayload = null;
        this.setData({
          isStreaming: false,
          routerErrorMessage: ""
        });
        return false;
      }

      if (this.currentStreamJobKey === streamJobKey) {
        this.patchMessageText(streamMessageId, resolveUiErrorMessage(error, "路由处理失败，请重试"));
        this.currentStreamJobKey = "";
      }

      this.lastRouterActionPayload = {
        input,
        options: {
          ...options,
          retries: 3
        }
      };
      this.setData({
        isStreaming: false,
        routerErrorMessage: resolveUiErrorMessage(error, "路由处理失败"),
        quickReplies: withRetryQuickReply(this.data.quickReplies)
      });
      return false;
    }
  },

  async retryLastRouterAction() {
    if (!this.lastRouterActionPayload) {
      return false;
    }
    return this.runRouterAction(
      this.lastRouterActionPayload.input || {},
      this.lastRouterActionPayload.options || {}
    );
  },

  async tryHandleInitialRouteAction(options = {}) {
    if (this.initialRouteApplied) {
      return;
    }

    const routeAction = options.routeAction ? safeDecode(options.routeAction) : "";
    if (!routeAction || !this.data.conversationStateId) {
      return;
    }

    this.initialRouteApplied = true;
    const userText = options.userText ? safeDecode(options.userText) : "";
    await this.runRouterAction({
      inputType: "system_event",
      text: userText,
      routeAction,
      metadata: {
        source: "initial_route_action",
        scene: options.scene || ""
      }
    }, {
      userLabel: userText || "",
      showUserMessage: !!userText
    });
  },

  // Phase 1.5 —— 二次登录自动续盘资产盘点
  async tryAutoResumeAssetInventory(options = {}, user = {}, status = null) {
    if (this.autoResumeApplied) {
      return;
    }
    if (!status || !user || !user.loggedIn || !user.onboardingCompleted) {
      return;
    }
    // 已有显式初始路由（options.routeAction / options.scene）或已经打开非 home 场景时，不再自动续盘
    const requestedScene = String(options.scene || "").trim();
    if (requestedScene && requestedScene !== "home") {
      return;
    }
    if (options.routeAction) {
      return;
    }
    if (!this.data.conversationStateId) {
      return;
    }
    if (status.workflowKey !== "resumeInventory") {
      return;
    }
    const resumePrompt = String(status.resumePrompt || "我们继续上次没完成的资产盘点。").trim();
    if (!resumePrompt) {
      return;
    }

    this.autoResumeApplied = true;
    try {
      await this.ensureRouterAgent("asset");
      await this.runRouterAction({
        inputType: "text",
        text: resumePrompt,
        metadata: {
          source: "auto_resume_asset_inventory",
          workflowKey: status.workflowKey
        }
      }, {
        userLabel: resumePrompt,
        showUserMessage: true
      });
    } catch (error) {
      this.autoResumeApplied = false;
    }
  },

  getSceneContext(target = "") {
    return {
      user: this.data.user,
      target: target || this.data.pendingToolTarget
    };
  },

  getLocalScene(sceneKey, target = "") {
    return getLocalConversationScene(sceneKey, this.getSceneContext(target));
  },

  normalizeScene(scene, fallbackScene) {
    const remoteScene = scene && typeof scene === "object" ? scene : {};

    return {
      ...fallbackScene,
      ...remoteScene,
      key: remoteScene.key || fallbackScene.key,
      agentKey: remoteScene.agentKey || fallbackScene.agentKey,
      agent: remoteScene.agent || fallbackScene.agent,
      messages: Array.isArray(remoteScene.messages) ? remoteScene.messages : fallbackScene.messages,
      quickReplies: Array.isArray(remoteScene.quickReplies) ? remoteScene.quickReplies : (fallbackScene.quickReplies || []),
      inputPlaceholder: remoteScene.inputPlaceholder || fallbackScene.inputPlaceholder,
      allowInput: typeof remoteScene.allowInput === "boolean" ? remoteScene.allowInput : fallbackScene.allowInput
    };
  },

  hydrateScene(sceneKey, fallbackScene, options = {}) {
    const hydrationKey = `scene-${Date.now()}-${Math.random()}`;
    const mode = options.mode || "replace";
    const target = options.target || "";
    const prefixMessages = Array.isArray(options.prefixMessages) ? options.prefixMessages : [];

    this.currentSceneHydrationKey = hydrationKey;

    fetchConversationSceneRemote(sceneKey)
      .then((remoteScene) => {
        if (this.currentSceneHydrationKey !== hydrationKey) {
          return;
        }

        const scene = this.normalizeScene(remoteScene, fallbackScene);
        const messages = mode === "append" ? prefixMessages.concat(stampMessages(scene.messages)) : stampMessages(scene.messages);

        this.data.pendingToolTarget = target;
        this.setData({
          pendingToolTarget: target
        });

        this.syncSceneMeta(scene, messages);
      })
      .catch(() => {
        if (this.currentSceneHydrationKey === hydrationKey) {
          this.currentSceneHydrationKey = "";
        }
      });
  },

  replaceScene(sceneKey, context = {}) {
    this.stopStreaming();

    const target = context.target || "";
    const scene = this.getLocalScene(sceneKey, target);
    const messages = stampMessages(scene.messages);
    const shouldResetRouterSession = isPreRouterOnboardingScene(sceneKey);

    this.data.pendingToolTarget = target;
    this.setData({
      pendingToolTarget: target,
      activeConversationId: "",
      agentMenuVisible: false,
      conversationStateId: shouldResetRouterSession ? "" : this.data.conversationStateId,
      currentAgentId: shouldResetRouterSession ? "master" : this.data.currentAgentId,
      routeMode: shouldResetRouterSession ? "guided" : this.data.routeMode,
      activeChatflowId: shouldResetRouterSession ? "" : this.data.activeChatflowId,
      pendingQuickReplyAction: shouldResetRouterSession ? "" : this.data.pendingQuickReplyAction,
      routerErrorMessage: shouldResetRouterSession ? "" : this.data.routerErrorMessage
    });

    this.syncSceneMeta(scene, messages);
    this.hydrateScene(sceneKey, scene, {
      mode: "replace",
      target
    });
  },

  appendScene(sceneKey, options = {}) {
    this.stopStreaming();

    const target = options.target || "";
    const scene = this.getLocalScene(sceneKey, target);
    const nextMessages = [];
    const shouldResetRouterSession = isPreRouterOnboardingScene(sceneKey);

    if (options.userText) {
      nextMessages.push(buildUserMessage(options.userText));
    }

    const prefixMessages = this.data.messages.concat(nextMessages);
    const messages = prefixMessages.concat(stampMessages(scene.messages));

    this.data.pendingToolTarget = target;
    this.setData({
      pendingToolTarget: target,
      activeConversationId: "",
      agentMenuVisible: false,
      conversationStateId: shouldResetRouterSession ? "" : this.data.conversationStateId,
      currentAgentId: shouldResetRouterSession ? "master" : this.data.currentAgentId,
      routeMode: shouldResetRouterSession ? "guided" : this.data.routeMode,
      activeChatflowId: shouldResetRouterSession ? "" : this.data.activeChatflowId,
      pendingQuickReplyAction: shouldResetRouterSession ? "" : this.data.pendingQuickReplyAction,
      routerErrorMessage: shouldResetRouterSession ? "" : this.data.routerErrorMessage
    });

    this.syncSceneMeta(scene, messages);
    this.hydrateScene(sceneKey, scene, {
      mode: "append",
      prefixMessages,
      target
    });
  },

  appendMessages(messages = [], nextQuickReplies = this.data.quickReplies) {
    this.currentSceneHydrationKey = "";
    const MAX_VISIBLE_MESSAGES = 200;
    const combined = this.data.messages.concat(stampMessages(messages));
    const mergedMessages = combined.length > MAX_VISIBLE_MESSAGES
      ? combined.slice(combined.length - MAX_VISIBLE_MESSAGES)
      : combined;

    this.setData({
      messages: mergedMessages,
      quickReplies: nextQuickReplies,
      scrollIntoView: mergedMessages.length ? `msg-${mergedMessages[mergedMessages.length - 1]._uid}` : ""
    });
  },

  removeMessagesByIds(ids = []) {
    const targetIds = ids
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    if (!targetIds.length) {
      return;
    }

    const targetSet = new Set(targetIds);
    const nextMessages = this.data.messages.filter((message) => !targetSet.has(String(message.id || "").trim()));

    this.setData({
      messages: nextMessages,
      scrollIntoView: nextMessages.length ? `msg-${nextMessages[nextMessages.length - 1]._uid}` : ""
    });
  },

  replacePendingLoginCardWithDone(user) {
    this.currentSceneHydrationKey = "";
    const nextMessages = this.data.messages.map((message) => {
      if (message.type !== "login_card") {
        return message;
      }

      return {
        ...message,
        mode: "done",
        title: "\u5fae\u4fe1\u5df2\u767b\u5f55",
        description: "\u767b\u5f55\u6210\u529f\uff0c\u6211\u4eec\u53ef\u4ee5\u7ee7\u7eed\u4e86",
        buttonText: "\u5df2\u767b\u5f55",
        userName: user.nickname || user.name || "\u5c0f\u660e",
        userAvatarUrl: user.avatarUrl || "",
        userInitial: user.initial || "\u5c0f"
      };
    });

    this.setData({
      messages: nextMessages,
      scrollIntoView: nextMessages.length ? `msg-${nextMessages[nextMessages.length - 1]._uid}` : ""
    });
  },

  async applyNickname(nextName) {
    const nickname = sanitizeNickname(nextName, this.data.user.nickname || "\u5c0f\u660e");
    const nextUser = {
      ...this.data.user,
      name: nickname,
      nickname,
      initial: nickname.slice(0, 1)
    };

    this.syncUserState(nextUser);

    try {
      const remoteUser = await updateCurrentUser({
        name: nickname,
        nickname,
        initial: nickname.slice(0, 1)
      });

      if (remoteUser && typeof remoteUser === "object") {
        const mergedUser = {
          ...nextUser,
          ...remoteUser
        };

        this.syncUserState(mergedUser);
        return mergedUser;
      }
    } catch (error) {
      // noop: keep local nickname state
    }

    return nextUser;
  },

  async tryHandleOnboardingInput(value) {
    if (this.data.sceneKey === "onboarding_intro") {
      this.appendMessages([
        buildUserMessage(value),
        buildAgentMessage("\u5148\u70b9\u4e00\u4e0b\u767b\u5f55\u5361\u7247\uff0c\u6211\u4eec 1 \u79d2\u8fdb\u5165\u6b63\u5f0f\u5bf9\u8bdd\u3002")
      ], []);
      return true;
    }

    if (this.data.sceneKey === "onboarding_nickname" || this.data.sceneKey === "onboarding_rename") {
      const nextUser = await this.applyNickname(value);
      this.appendScene("onboarding_route", {
        userText: `\u53eb\u6211${nextUser.nickname}`
      });
      return true;
    }

    if (this.data.sceneKey === "onboarding_route") {
      const inferredRouteScene = inferOnboardingRouteByText(value);
      const inferredAction = inferredRouteScene ? SCENE_ROUTE_ACTION_MAP[inferredRouteScene] : "";

      // 命中强信号 → 直接按分支走 router（带上对应 routeAction，让后端精确进入分支）。
      if (inferredRouteScene && inferredAction) {
        const hasRouterSession = await this.ensureRouterSession({ forceNew: true });
        if (hasRouterSession) {
          await this.runRouterAction({
            inputType: "system_event",
            text: value,
            routeAction: inferredAction,
            metadata: {
              source: "onboarding_text_route",
              sceneKey: inferredRouteScene
            }
          }, {
            userLabel: value,
            showUserMessage: true
          });
          return true;
        }

        this.appendScene(inferredRouteScene, { userText: value });
        return true;
      }

      // 未命中强信号 → 不再本地兜底到资产盘点，直接把自由文本发给 router，
      // 让后端 5-通用兜底对话流（Phase 1.3）接住。
      const hasRouterSession = await this.ensureRouterSession({ forceNew: true });
      if (hasRouterSession) {
        await this.runRouterAction({
          inputType: "text",
          text: value,
          metadata: {
            source: "onboarding_fallback_text",
            sceneKey: "onboarding_route"
          }
        }, {
          userLabel: value,
          showUserMessage: true
        });
        return true;
      }

      // 本地无 router session 时的最后兜底：当作"想开始盘点"处理
      this.appendScene("onboarding_path_working", { userText: value });
      return true;
    }

    if (this.data.sceneKey === "onboarding_path_park") {
      const userText = String(value || "").trim();
      const isUnregistered =
        /(还没注册|未注册|没注册|没有注册|没公司|没有公司|未成立|还没开公司|未开公司)/.test(userText);
      const isRegistered =
        /(已注册|已经注册|有公司|有限公司|个体户|主体)/.test(userText);

      if (isUnregistered || isRegistered) {
        await this.handleParkProfileBranch(
          isUnregistered ? "unregistered" : "registered",
          userText,
          "park_text_input"
        );
        return true;
      }
    }

    return false;
  },

  async handleParkProfileBranch(status = "", userText = "", source = "park_quick_reply") {
    const normalizedStatus = status === "unregistered" ? "unregistered" : "registered";
    const normalizedText = String(
      userText || (normalizedStatus === "unregistered" ? "还没注册" : "已经注册了")
    ).trim();

    let hasRouterSession = !!this.data.conversationStateId;
    if (!hasRouterSession) {
      hasRouterSession = await this.ensureRouterSession({
        forceNew: true
      });
    }

    if (hasRouterSession && this.data.conversationStateId) {
      // 不再显式 ensureRouterAgent("steward") —— 后端 resolveRoutingDecision 看到
      // routeAction=route_park 已经会自动切到 steward，多一次 agent-switch HTTP
      // 只是徒增一轮延迟（还可能触发记忆注入等慢操作），让用户感觉"还没注册"卡半天。
      const routed = await this.runRouterAction({
        inputType: "text",
        text: normalizedText,
        routeAction: "route_park",
        metadata: {
          source,
          companyStatus: normalizedStatus
        }
      }, {
        userLabel: normalizedText,
        showUserMessage: true,
        silentFailure: true
      });

      if (routed) {
        return true;
      }
    }

    const followupText = normalizedStatus === "unregistered"
      ? "我先记下你还没注册。为了把政策匹配做准，下一步先确认地区：你主要想查哪个城市或区域的政策？"
      : "我先记下你已注册。为了把政策匹配做准，下一步先确认地区：你主要想查哪个城市或区域的政策？";

    this.appendMessages([
      buildUserMessage(normalizedText),
      {
        id: `park-branch-${Date.now()}`,
        type: "agent",
        text: followupText
      }
    ], [
      { label: "杭州", action: "quick_fill_region_hangzhou" },
      { label: "上海", action: "quick_fill_region_shanghai" },
      { label: "我自己输入地区", action: "park_manual_region" }
    ]);

    return true;
  },

  stopStreaming() {
    this.currentStreamJobKey = "";
    this.setData({
      isStreaming: false
    });
  },

  /**
   * 用户点停止键:让 runRouterAction 里还在跑的 pollStreamEvents / renderStreamTokens
   * 下一次循环时因为 streamJobKey 对不上而退出,同时把处理中的气泡就地定格——
   * 如果已经有部分文字就保留 + 加"(已停止)"后缀,还是空的就直接改成"已停止接收"。
   * 后端的后台 worker 还会继续跑完(无法远程 kill Dify),但那些后续 token 都会被
   * getStream 轮询忽略,对用户不可见。
   */
  handleStopStream() {
    if (!this.data.isStreaming) {
      return;
    }

    const streamingMessage = this.data.messages
      .slice()
      .reverse()
      .find((message) => message && message.type === "agent" && /^router-stream-/.test(String(message.id || "")));

    // 把正在跑的 streamId 记下来,后面 fire-and-forget 发 cancel 请求给后端,
    // 让后台 worker 真正 abort 掉 Dify SSE,不再 finalize 污染下一轮会话。
    const pendingStreamId = this.currentStreamId || "";

    this.stopStreaming();
    this.lastRouterActionPayload = null;

    if (pendingStreamId) {
      cancelRouterStream(pendingStreamId).catch(() => {});
    }
    this.currentStreamId = "";

    if (streamingMessage) {
      const currentText = String(streamingMessage.text || "").trim();
      const isProcessing = streamingMessage.uiMode === "processing";
      const nextText = !currentText || isProcessing
        ? "已停止接收"
        : `${currentText}\n\n（已停止）`;
      this.patchMessageText(streamingMessage.id, nextText);
    }

    this.setData({
      routerErrorMessage: "",
      quickReplies: []
    });
  },

  patchMessageText(messageId, nextText) {
    const messages = this.data.messages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const shouldResetProcessing =
        message.uiMode === "processing" && String(nextText || "") !== String(message.text || "");

      return {
        ...message,
        text: nextText,
        uiMode: shouldResetProcessing ? "" : message.uiMode
      };
    });

    const target = messages.find((item) => item.id === messageId);
    this.setData({
      messages,
      scrollIntoView: target && target._uid ? `msg-${target._uid}` : this.data.scrollIntoView
    });
  },

  async pollStreamEvents(streamId, streamJobKey, poller = pollChatStream, onChunk) {
    const events = [];
    let done = false;
    // 240 轮 × 120ms ≈ 31 秒,撞上"会话自愈重试"场景就会被腰斩:第一次 Dify 调用
    // 挂了 1 秒(404 Conversation Not Exists),后端清缓存重发,第二次又要走完整
    // R1 推理(普遍 25-50 秒),前端 31 秒一刀切就显示"暂时没有返回内容",其实
    // 后端 worker 还在跑。放宽到 720 轮(~94 秒),给"慢模型 + 一次自愈"留余量。
    const maxRounds = 720;

    for (let index = 0; index < maxRounds; index += 1) {
      if (!streamId || streamJobKey !== this.currentStreamJobKey) {
        break;
      }

      const chunk = await poller(streamId);
      if (streamJobKey !== this.currentStreamJobKey) {
        break;
      }

      if (Array.isArray(chunk) && chunk.length) {
        events.push(...chunk);
        // onChunk 让上层(runRouterAction)在每次 poll 拿到新 events 后立刻渲染,
        // 从而把"收齐全部 events 才开始打字"的等待缩短成"first chunk 到达即开始渲染"。
        if (typeof onChunk === "function") {
          await onChunk(chunk);
        }
        if (chunk.some((item) => item.type === "done" || item.type === "error")) {
          done = true;
          break;
        }
      }

      await sleep(120);
    }

    if (!done && events.some((item) => item && item.type === "meta")) {
      throw new Error("stream_timeout");
    }

    return events;
  },

  async renderStreamTokens(streamMessageId, events = [], streamJobKey, initialText = "") {
    let accumulatedText = String(initialText || "");

    for (let index = 0; index < events.length; index += 1) {
      if (streamJobKey !== this.currentStreamJobKey) {
        return accumulatedText;
      }

      const event = events[index];
      if (!event || typeof event !== "object") {
        continue;
      }

      if (event.type === "token") {
        accumulatedText += event.token || event.delta || event.content || "";
        this.patchMessageText(streamMessageId, accumulatedText);
        await sleep(16);
      }

      if (event.type === "message" && event.message && event.message.text) {
        accumulatedText = String(event.message.text);
        this.patchMessageText(streamMessageId, accumulatedText);
      }
    }

    return accumulatedText;
  },

  async appendStreamingThenReply(userText) {
    if (this.data.isStreaming) {
      return;
    }

    if (!this.data.conversationStateId && this.data.user && this.data.user.loggedIn) {
      const sceneAgentMap = {
        onboarding_path_working: "asset",
        onboarding_path_trying: "asset",
        onboarding_path_fulltime: "asset",
        onboarding_path_park: "steward",
        // 旧 key 保留别名
        onboarding_path_explore: "asset",
        onboarding_path_stuck: "asset",
        onboarding_path_scale: "asset",
        ip_assistant: "asset",
        ai_assistant: "execution",
        monthly_check: "steward"
      };
      const ensured = await this.ensureRouterSession();
      if (ensured) {
        await this.ensureRouterAgent(sceneAgentMap[this.data.sceneKey] || this.data.agentKey || "master");
      }
    }

    if (this.data.conversationStateId) {
      await this.runRouterAction({
        inputType: "text",
        text: userText,
        metadata: {
          source: "text_input",
          sceneKey: this.data.sceneKey
        }
      }, {
        userLabel: userText,
        showUserMessage: true
      });
      return;
    }

    const nextAgentKey = this.data.agentKey || "master";
    const streamMessageId = `stream-agent-${Date.now()}`;
    const streamMessage = {
      id: streamMessageId,
      type: "agent",
      uiMode: "processing",
      text: "一树正在思考中..."
    };
    const streamJobKey = `stream-job-${Date.now()}`;
    this.currentStreamJobKey = streamJobKey;

    this.setData({
      agentKey: nextAgentKey,
      agentColor: this.getAgentColorByKey(nextAgentKey),
      isStreaming: true
    });

    getApp().setCurrentAgent(nextAgentKey);

    this.appendMessages([buildUserMessage(userText), streamMessage], []);

    try {
      const payload = {
        sceneKey: this.data.sceneKey,
        userText
      };

      if (this.data.activeConversationId) {
        payload.conversationId = this.data.activeConversationId;
      }

      const streamResult = await startChatStream({
        ...payload
      });

      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      const streamId = streamResult && streamResult.streamId ? streamResult.streamId : "";
      const nextConversationId = String((streamResult && streamResult.conversationId) || "").trim();
      let events = Array.isArray(streamResult && streamResult.events) ? streamResult.events : [];

      if (!events.length) {
        events = await this.pollStreamEvents(streamId, streamJobKey);
      }

      if (!events.length) {
        throw new Error("empty_stream_events");
      }

      const streamedText = await this.renderStreamTokens(streamMessageId, events, streamJobKey);
      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      const folded = foldStreamEvents(events);
      const finalText = folded.content || streamedText;
      if (!finalText) {
        throw new Error("empty_stream_content");
      }
      this.patchMessageText(streamMessageId, finalText);

      this.setData({
        activeConversationId: nextConversationId || this.data.activeConversationId,
        quickReplies: [],
        isStreaming: false
      });
      this.currentStreamJobKey = "";
    } catch (error) {
      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      this.patchMessageText(streamMessageId, resolveUiErrorMessage(error, "抱歉，当前智能体暂时不可用，请稍后再试。"));
      this.setData({
        quickReplies: [],
        isStreaming: false
      });
      this.currentStreamJobKey = "";
    }
  },

  getAgentColorByKey(agentKey) {
    const colorMap = {
      master: "#0D0D0D",
      asset: "#534AB7",
      execution: "#10A37F",
      mindset: "#E24B4A",
      steward: "#378ADD"
    };

    return colorMap[agentKey] || colorMap.master;
  },

  async ensureRouterAgent(agentKey) {
    if (!this.data.conversationStateId || !agentKey) {
      return false;
    }

    try {
      const snapshot = await switchRouterAgent(this.data.conversationStateId, {
        agentKey
      });
      this.bindRouterSession(snapshot, {
        includeMessages: false
      });
      return true;
    } catch (_error) {
      return false;
    }
  },

  syncToolRouteInBackground(toolKey, route) {
    if (!this.data.conversationStateId) {
      return;
    }

    const routeAction = TOOL_ROUTE_ACTION_MAP[toolKey] || resolveRouteActionByScene(route.scene);
    if (!routeAction) {
      return;
    }

    this.runRouterAction({
      inputType: "system_event",
      text: "",
      routeAction,
      metadata: {
        source: "tool_route",
        toolKey,
        scene: route.scene
      }
    }, {
      userLabel: "",
      showUserMessage: false,
      showProcessingMessage: false,
      silentFailure: true
    }).catch(() => {});
  },

  syncAgentSwitchInBackground(agentKey) {
    if (!this.data.conversationStateId || !agentKey) {
      return;
    }

    switchRouterAgent(this.data.conversationStateId, {
      agentKey
    })
      .then((snapshot) => {
        this.bindRouterSession(snapshot, {
          includeMessages: false
        });
      })
      .catch(() => {});
  },

  async openSceneFromTool(toolKey) {
    if (toolKey === "ai" || toolKey === "ip") {
      setToolGuideSeen(getApp(), true);
    }

    const route = resolveToolScene(toolKey, getToolGuideSeen(getApp()));

    if (route.type === "panel") {
      this.showComingSoonNotice(TOOL_COMING_SOON_TIP, toolKey);
      this.notifyComingSoonSubscriptionHook(toolKey, {
        entry: "tool_panel_route"
      });
      return;
    }

    this.replaceScene(route.scene, {
      target: route.target || toolKey
    });
    this.syncToolRouteInBackground(toolKey, route);
  },

  handleAvatarTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      agentMenuVisible: false,
      sidebarVisible: true
    });
  },

  handleAgentTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.syncAgentMenuLayout();
    this.setData({
      agentMenuVisible: !this.data.agentMenuVisible
    });
  },

  handleAgentMenuClose() {
    this.setData({
      agentMenuVisible: false
    });
  },

  handleAgentMenuHold() {},

  async handleAgentSelect(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const dataset = event.currentTarget.dataset || {};
    const nextAgentKey = dataset.key;
    const disabled = dataset.disabled === true || dataset.disabled === "true";
    const targetScene = AGENT_SCENE_MAP[nextAgentKey] || "home";
    const isCurrent = nextAgentKey === this.data.agentKey;

    if (disabled) {
      wx.showToast({
        title: AGENT_COMING_SOON_TIP,
        icon: "none"
      });
      return;
    }

    this.setData({
      agentMenuVisible: false
    });

    if (isCurrent) {
      return;
    }

    this.replaceScene(targetScene);
    this.syncAgentSwitchInBackground(nextAgentKey);
  },

  handleSidebarClose() {
    this.setData({
      sidebarVisible: false
    });
  },

  handleTreeTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.openMyTreePage();
  },

  handleTreePullDown() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.openMyTreePage();
  },

  openMyTreePage() {
    this.setData({
      agentMenuVisible: false
    });
    this.showComingSoonNotice(TOOL_COMING_SOON_TIP, "tree");
  },

  handleProfileTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      sidebarVisible: false,
      agentMenuVisible: false
    });

    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  },

  handleSettingTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      sidebarVisible: false,
      agentMenuVisible: false
    });

    wx.navigateTo({
      url: "/pages/settings/settings"
    });
  },

  handleHelpTap() {
    this.setData({
      sidebarVisible: false
    });

    wx.showActionSheet({
      itemList: ["使用帮助", "隐私政策", "用户协议"],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.showModal({
            title: "使用帮助",
            content: "侧边栏里的最近聊天支持左滑删除；更多账号与聊天管理功能已放到设置页。",
            showCancel: false
          });
          return;
        }

        const type = result.tapIndex === 1 ? "privacy" : "terms";
        wx.navigateTo({
          url: `/pages/legal/legal?type=${type}`
        });
      }
    });
  },

  handleProjectTap(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const { id } = event.detail;

    this.setData({
      sidebarVisible: false,
      projectSheetVisible: false
    });

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?id=${id}`,
      events: {
        projectResultCta: async (payload) => {
          if (!payload || !payload.scene) {
            return;
          }

          if (this.data.conversationStateId) {
            const routeAction = payload.routeAction || resolveRouteActionByScene(payload.scene);
            if (routeAction) {
              const routed = await this.runRouterAction({
                inputType: "system_event",
                text: payload.userText || "",
                routeAction,
                metadata: {
                  source: "project_result_cta",
                  target: payload.target || id,
                  scene: payload.scene
                }
              }, {
                userLabel: payload.userText || "继续推进项目",
                showUserMessage: true,
                silentFailure: true
              });
              if (routed) {
                return;
              }
            }
          }

          this.appendScene(payload.scene, {
            target: payload.target || id,
            userText: payload.userText || "\u56de\u5230\u5bf9\u8bdd\u7ee7\u7eed"
          });
        }
      }
    });
  },

  handleToolTap(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const { key } = event.detail;
    if (TOOL_COMING_SOON_KEYS.includes(String(key || "").trim())) {
      this.showComingSoonNotice(TOOL_COMING_SOON_TIP, key);
      this.notifyComingSoonSubscriptionHook(key, {
        entry: "sidebar_tools"
      });
      return;
    }

    this.setData({
      sidebarVisible: false
    });

    this.openSceneFromTool(key);
  },

  handleRecentTap(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const sceneKey = resolveRecentScene(event.detail.id);

    this.setData({
      sidebarVisible: false
    });

    this.replaceScene(sceneKey);
  },

  handleRecentDelete(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const conversationId = String((event && event.detail && event.detail.id) || "").trim();
    if (!conversationId) {
      return;
    }

    wx.showModal({
      title: "删除最近聊天",
      content: "删除后，这条最近聊天会从侧边栏移除。",
      confirmText: "删除",
      confirmColor: "#da4d37",
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        const nextRecentChats = this.data.recentChats.filter((item) => String(item.id) !== conversationId);
        const shouldResetConversation = String(this.data.activeConversationId || "") === conversationId;

        this.setData({
          recentChats: nextRecentChats,
          activeConversationId: shouldResetConversation ? "" : this.data.activeConversationId
        });

        wx.showLoading({
          title: "删除中..."
        });

        try {
          await deleteRecentChat(conversationId);
          this.bumpSidebarDataVersion();
          wx.showToast({
            title: "已删除",
            icon: "none"
          });
        } catch (error) {
          await this.refreshSidebarData();
          wx.showToast({
            title: resolveUiErrorMessage(error, "删除最近聊天失败"),
            icon: "none"
          });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  handleNewChat() {
    this.setData({
      sidebarVisible: false
    });

    this.replaceScene("home");
  },

  handlePlusTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      projectSheetVisible: true
    });
  },

  handleProjectSheetClose() {
    this.setData({
      projectSheetVisible: false
    });
  },

  async handleProjectCreate() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    if (this.projectCreatePending) {
      return;
    }

    const projectName = await requestProjectName();
    if (!projectName) {
      return;
    }

    this.projectCreatePending = true;
    wx.showLoading({
      title: "创建中..."
    });

    try {
      const project = await createProject({
        name: projectName,
        phase: "探索中",
        status: "进行中",
        color: pickProjectColor(this.data.projects.length)
      });

      const nextProjects = [project].concat(
        this.data.projects.filter((item) => item.id !== project.id)
      );

      this.setData({
        projects: nextProjects,
        projectSheetVisible: false,
        sidebarVisible: false
      });

      wx.navigateTo({
        url: `/pages/project-detail/project-detail?id=${project.id}`
      });
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "创建项目失败，请稍后重试"),
        icon: "none"
      });
    } finally {
      wx.hideLoading();
      this.projectCreatePending = false;
    }
  },

  async performWechatLogin(loginOptions = {}) {
    if (this.loginPending) {
      return;
    }

    this.loginPending = true;

    try {
      const isFreshLogin = loginOptions.simulateFreshUser === true;
      const loginResult = await loginByWechat(loginOptions);
      const nextUser = loginResult && loginResult.user ? loginResult.user : {};
      const mergedUser = {
        ...this.data.user,
        ...nextUser
      };
      const bootstrapResult = await fetchBootstrap().catch(() => null);
      const resolvedUser = (bootstrapResult && bootstrapResult.user) || mergedUser;

      this.syncUserState(resolvedUser);
      this.setData({
        projects: Array.isArray(bootstrapResult && bootstrapResult.projects)
          ? bootstrapResult.projects
          : (isFreshLogin ? [] : this.data.projects),
        tools: Array.isArray(bootstrapResult && bootstrapResult.tools)
          ? bootstrapResult.tools
          : (isFreshLogin ? [] : this.data.tools),
        recentChats: Array.isArray(bootstrapResult && bootstrapResult.recentChats)
          ? bootstrapResult.recentChats
          : (isFreshLogin ? [] : this.data.recentChats)
      });
      setToolGuideSeen(getApp(), true);
      await this.initializeRouterSession({
        forceNew: true,
        includeMessages: false
      });
      this.replaceScene("onboarding_route");
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "微信登录失败，请稍后重试"),
        icon: "none"
      });
    } finally {
      this.loginPending = false;
    }
  },

  async handleLoginAction(event) {
    const detail = (event && event.detail) || {};
    return this.performWechatLogin({
      userInfo: detail.userInfo || null,
      encryptedData: detail.encryptedData || "",
      iv: detail.iv || ""
    });
  },

  async handleDevFreshLoginAction(event) {
    if (!this.data.showDevFreshLogin) {
      return;
    }

    const detail = (event && event.detail) || {};
    return this.performWechatLogin({
      simulateFreshUser: true,
      userInfo: detail.userInfo || null,
      encryptedData: detail.encryptedData || "",
      iv: detail.iv || ""
    });
  },

  handleAgreementTap(event) {
    const { type } = event.detail || {};
    const targetType = type === "privacy" ? "privacy" : "terms";

    wx.navigateTo({
      url: `/pages/legal/legal?type=${targetType}`,
      fail: () => {
        wx.showToast({
          title: "法律文档打开失败",
          icon: "none"
        });
      }
    });
  },

  async handleTaskComplete(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = event && event.detail ? event.detail : {};
    const item = detail.item || {};

    if (!detail.done || !item.label || !item.id) {
      return;
    }

    this.patchTaskCardItem(item.id, {
      done: true
    });

    try {
      await completeTask(item.id, {
        label: item.label
      });
    } catch (error) {
      this.patchTaskCardItem(item.id, {
        done: false
      });
      wx.showToast({
        title: resolveUiErrorMessage(error, "任务状态同步失败"),
        icon: "none"
      });
      return;
    }

    const taskLabel = item.label;
    const taskId = item.id || "";
    const feedbackPromptId = `task-feedback-${Date.now() + 1}`;

    this.setData({
      messages: markTaskDoneInMessages(this.data.messages, taskId, taskLabel)
    });

    this.appendMessages([
      {
        id: `task-done-${Date.now()}`,
        type: "status_chip",
        label: taskLabel,
        status: "done"
      }
    ], []);

    if (this.data.conversationStateId) {
      const routed = await this.runRouterAction({
        inputType: "system_event",
        text: `task_completed:${taskLabel}`,
        routeAction: "task_completed",
        metadata: {
          source: "task_complete",
          taskId,
          taskLabel
        }
      }, {
        userLabel: "",
        showUserMessage: false,
        loadingText: "一树正在基于任务结果生成下一步..."
      });

      if (routed) {
        this.setData({
          feedbackPendingTask: "",
          feedbackPendingTaskId: ""
        });
        return;
      }
    }

    this.appendMessages([
      {
        id: feedbackPromptId,
        type: "agent",
        text: buildFeedbackPrompt(taskLabel)
      }
    ], []);

    this.setData({
      feedbackPendingTask: taskLabel,
      feedbackPendingTaskId: item.id
    });

    try {
      const feedback = await fetchTaskFeedback({
        taskId: taskId || "",
        taskLabel
      });
      const remoteMessages = Array.isArray(feedback && feedback.messages) ? feedback.messages : [];
      const remotePrompt = remoteMessages.find((message) => message && message.type === "agent");
      const remoteReplies = Array.isArray(feedback && feedback.quickReplies) ? feedback.quickReplies : [];

      if (remotePrompt && remotePrompt.text) {
        this.patchMessageText(feedbackPromptId, String(remotePrompt.text));
      }

      if (remoteReplies.length) {
        this.setData({
          quickReplies: remoteReplies
        });
      }
    } catch (error) {
      // noop: keep local fallback prompt and replies
    }
  },

  async handleLeveragePrimary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    setToolGuideSeen(getApp(), true);
    this.replaceScene("ai_assistant");
    this.syncToolRouteInBackground("ai", {
      scene: "ai_assistant",
      target: "ai"
    });
  },

  async handleLeverageSecondary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    setToolGuideSeen(getApp(), true);
    this.replaceScene("ip_assistant");
    this.syncToolRouteInBackground("ip", {
      scene: "ip_assistant",
      target: "ip"
    });
  },

  async handleArtifactPrimary(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const { action } = event.currentTarget.dataset;

    if (action === "open_share") {
      wx.navigateTo({
        url: "/pages/share-preview/share-preview"
      });
      return;
    }

    if (action === "open_asset_report") {
      wx.navigateTo({
        url: "/pages/profile/profile"
      });
      return;
    }

    if (action === "route_park") {
      if (this.data.conversationStateId) {
        const routed = await this.runRouterAction({
          inputType: "system_event",
          text: "帮我查查能薅什么",
          routeAction: "route_park",
          metadata: {
            source: "artifact_primary",
            action
          }
        }, {
          userLabel: "帮我查查能薅什么",
          showUserMessage: true,
          silentFailure: true
        });
        if (routed) {
          return;
        }
      }
      this.appendScene("onboarding_path_park", {
        userText: "\u5e2e\u6211\u67e5\u67e5\u80fd\u8585\u4ec0\u4e48"
      });
      return;
    }

    if (action === "review_asset_update") {
      const { payload } = event.currentTarget.dataset;
      wx.setStorageSync("pendingAssetUpdates", payload);
      wx.navigateTo({ url: "/pages/profile/profile?mode=update" });
    }
  },

  handleArtifactSecondary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    wx.showToast({
      title: "\u5df2\u4e3a\u4f60\u9884\u7559\u4e0b\u4e00\u6b65\u64cd\u4f5c",
      icon: "none"
      });
  },

  async handlePolicyCardAction(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = (event && event.detail) || {};
    const action = String(detail.action || "").trim();
    const item = detail.item || null;
    const sourceUrl = String(detail.url || (item && item.source && item.source.url) || "").trim();
    if (!action) {
      return;
    }

    if (action === "copy_link") {
      if (!sourceUrl) {
        wx.showToast({
          title: "暂无可复制的来源链接",
          icon: "none"
        });
        return;
      }
      wx.setClipboardData({
        data: sourceUrl
      });
      return;
    }

    const routeActionMap = {
      ask_agent_explain: "policy_explain",
      start_asset_audit: "asset_radar",
      save_policy_watch: "save_policy_watch"
    };
    const routeAction = routeActionMap[action] || "";

    if (this.data.conversationStateId && routeAction) {
      const explainText = item && item.title
        ? `帮我解释这条政策：${item.title}`
        : "帮我解释这条政策";
      const routeTextMap = {
        ask_agent_explain: explainText,
        start_asset_audit: "先盘一盘我的资产",
        save_policy_watch: "帮我加入政策关注"
      };

      const routed = await this.runRouterAction({
        inputType: "system_event",
        text: routeTextMap[action] || "",
        routeAction,
        metadata: {
          source: "policy_card_action",
          action,
          policyTitle: item && item.title ? String(item.title) : "",
          policyUrl: sourceUrl
        }
      }, {
        userLabel: "",
        showUserMessage: false,
        silentFailure: true
      });

      if (routed) {
        return;
      }
    }

    if (action === "start_asset_audit") {
      this.appendScene("onboarding_path_working", {
        userText: "\u6211\u60f3\u5148\u76d8\u4e00\u76d8\u6211\u7684\u8d44\u4ea7"
      });
      return;
    }

    if (action === "ask_agent_explain") {
      this.appendMessages([
        {
          id: `policy-explain-fallback-${Date.now()}`,
          type: "agent",
          text: item && item.title
            ? `我们先围绕「${item.title}」拆一下适用条件、收益和风险，再判断是否值得你现在推进。`
            : "我们先把这条政策拆开看，判断是否适合你当前阶段。"
        }
      ], this.data.quickReplies);
      return;
    }

    if (action === "save_policy_watch") {
      wx.showToast({
        title: "已加入政策关注",
        icon: "success"
      });
    }
  },

  handleReportPrimary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handleMilestonePrimary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.showComingSoonNotice(TOOL_COMING_SOON_TIP, "milestone");
  },

  handleMilestoneSecondary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handleSocialPrimary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.replaceScene("home");
  },

  handleSocialSecondary() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.appendMessages([
      {
        id: "social-followup-1",
        type: "agent",
        text: "\u884c\uff0c\u90a3\u6211\u4eec\u5148\u4e0d\u5f3a\u63a8\u4efb\u52a1\u3002\u4f60\u5148\u8ddf\u6211\u8bf4\u8bf4\uff0c\u4f60\u6700\u5927\u7684\u963b\u529b\u5230\u5e95\u662f\u65f6\u95f4\uff0c\u60c5\u7eea\uff0c\u8fd8\u662f\u4e0d\u786e\u5b9a\u6027\uff1f"
      }
    ], [
      { label: "\u65f6\u95f4\u4e0d\u591f", action: "social_blocker" },
      { label: "\u6709\u70b9\u7d2f", action: "social_blocker" },
      { label: "\u6015\u767d\u505a", action: "social_blocker" }
    ]);
  },

  async handleNextQuestionAction(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const dataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
    const question = String(dataset.question || "").trim();
    const messageId = String(dataset.messageId || "").trim();
    if (!question) {
      return;
    }

    if (messageId) {
      this.removeMessagesByIds([messageId]);
    }

    if (this.data.conversationStateId) {
      const routed = await this.runRouterAction({
        inputType: "system_event",
        text: question,
        metadata: {
          source: "next_question_card_action"
        }
      }, {
        userLabel: "",
        showUserMessage: false
      });

      if (routed) {
        return;
      }
    }

    this.appendMessages([
      {
        id: `next-question-fallback-${Date.now()}`,
        type: "agent",
        text: question
      }
    ], this.data.quickReplies);
  },

  async handleQuickReplySelect(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const { item } = event.detail;
    // 用户一旦点过快捷回复，立刻把当前这组气泡清掉，避免后端还没返回之前老选项
    // 还挂在消息流下方，看起来像"又能点一次"。后端返回的新一组会通过
    // appendMessages / applyRouterStatePatch 自己回填。
    this.setData({ quickReplies: [] });
    const hasDeterministicRoute = !!(item && (item.quickReplyId || item.routeAction));
    const isRouteAction = !!(item && /^route_/.test(String(item.action || "")));
    const isAssetInventoryStart = !!(item && item.action === "asset_inventory_start");
    const isFulltimeIntakeStart = !!(item && item.action === "fulltime_intake_start");

    if (!this.data.conversationStateId && (isRouteAction || isAssetInventoryStart || isFulltimeIntakeStart)) {
      await this.ensureRouterSession({
        forceNew: true
      });
    }

    if (item && item.action === "retry_router") {
      await this.retryLastRouterAction();
      return;
    }

    if (this.data.conversationStateId && hasDeterministicRoute) {
      const quickReplyPayload = buildQuickReplyPayload(item);
      // 薅羊毛分支点的两颗快捷回复：UI 上保持"好的 / 聊点其他的"，但送给后端的
      // quickReplyLabel 改成更像人话的 kick-off，下游 Dify chatflow 能直接进资产盘点/闲聊。
      if (quickReplyPayload.routeAction === "policy_to_asset_audit") {
        quickReplyPayload.metadata = {
          ...quickReplyPayload.metadata,
          quickReplyLabel: "好的，我们先盘一盘我手里有什么牌"
        };
      } else if (quickReplyPayload.routeAction === "policy_keep_chatting") {
        quickReplyPayload.metadata = {
          ...quickReplyPayload.metadata,
          quickReplyLabel: "先聊点别的，不着急盘资产"
        };
      }
      this.applyRouterStatePatch({
        pendingQuickReplyAction: quickReplyPayload.routeAction || ""
      });

      const routed = await this.runRouterAction({
        inputType: "quick_reply",
        text: item.label || "",
        quickReplyId: quickReplyPayload.quickReplyId,
        routeAction: quickReplyPayload.routeAction,
        metadata: quickReplyPayload.metadata
      }, {
        userLabel: item.label || quickReplyPayload.routeAction || "快捷回复",
        useQuickReplyEndpoint: true,
        quickReplyPayload,
        showUserMessage: true
      });

      this.applyRouterStatePatch({
        pendingQuickReplyAction: ""
      });

      if (routed) {
        return;
      }

      if (isRouteAction) {
        return;
      }
    }

    switch (item.action) {
      case "confirm_nickname":
        await this.applyNickname(item.label.replace(/^\u5c31\u53eb/, ""));
        this.appendScene("onboarding_route", {
          userText: item.label
        });
        return;
      case "rename":
        this.appendScene("onboarding_rename", {
          userText: item.label
        });
        return;
      case "route_park":
        if (this.data.conversationStateId) {
          const routed = await this.runRouterAction({
            inputType: "system_event",
            text: item.label || "",
            routeAction: "route_park",
            metadata: {
              source: "quick_reply_action"
            }
          }, {
            userLabel: item.label || "园区路线",
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_park", {
          userText: item.label
        });
        return;
      case "route_park_unregistered":
        await this.handleParkProfileBranch(
          "unregistered",
          item.label || "还没注册",
          "park_quick_reply"
        );
        return;
      case "route_park_registered":
        await this.handleParkProfileBranch(
          "registered",
          item.label || "已经注册了",
          "park_quick_reply"
        );
        return;
      case "quick_fill_region_hangzhou":
      case "quick_fill_region_shanghai": {
        const regionText = item.action === "quick_fill_region_hangzhou" ? "杭州" : "上海";
        if (this.data.conversationStateId) {
          // 之前这里用 silentFailure: true，后端一旦失败或超时就把"杭州/上海"
          // 的乐观消息和 processing 气泡一起抹掉，用户会看到"点了但什么都没发生"。
          // 现在让错误显式冒出来，至少能看到重试快捷回复。
          await this.runRouterAction({
            inputType: "text",
            text: regionText,
            routeAction: "route_park",
            metadata: {
              source: "park_region_quick_fill"
            }
          }, {
            userLabel: regionText,
            showUserMessage: true
          });
          return;
        }
        this.appendMessages([
          buildUserMessage(regionText),
          {
            id: `park-region-fallback-${Date.now()}`,
            type: "agent",
            text: "收到地区了。接下来告诉我你的行业方向，比如餐饮、教育、电商、软件服务等。"
          }
        ], []);
        return;
      }
      case "park_manual_region":
        wx.showToast({
          title: "直接在输入框告诉我地区即可",
          icon: "none"
        });
        return;
      case "route_working":
      case "route_explore": {
        const normalized = "route_working";
        if (this.data.conversationStateId) {
          await this.runRouterAction({
            inputType: "system_event",
            text: item.label || "",
            routeAction: normalized,
            metadata: { source: "quick_reply_action", originalAction: item.action }
          }, {
            userLabel: item.label || "在上班，没想过",
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_working", { userText: item.label });
        return;
      }
      case "route_trying":
      case "route_stuck": {
        const normalized = "route_trying";
        if (this.data.conversationStateId) {
          await this.runRouterAction({
            inputType: "system_event",
            text: item.label || "",
            routeAction: normalized,
            metadata: { source: "quick_reply_action", originalAction: item.action }
          }, {
            userLabel: item.label || "有想法，开始尝试了",
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_trying", { userText: item.label });
        return;
      }
      case "route_fulltime":
      case "route_scale": {
        const normalized = "route_fulltime";
        if (this.data.conversationStateId) {
          await this.runRouterAction({
            inputType: "system_event",
            text: item.label || "",
            routeAction: normalized,
            metadata: { source: "quick_reply_action", originalAction: item.action }
          }, {
            userLabel: item.label || "已经全职在做了",
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_fulltime", { userText: item.label });
        return;
      }
      case "asset_inventory_start": {
        // 分支 A/B 确认步的「好的」/「对话模式」按钮。使用真人口吻 kickoff 句，
        // 避免 backend buildAssetWorkflowQuery 在识别到 [quick_reply] 时替换成罐头话术。
        const currentScene = this.data.sceneKey;
        let kickoffText = "我想开始盘点我的资产。";
        if (item.label === "对话模式") {
          kickoffText = "我想开始盘点我的资产，我们用对话的方式来。";
        }
        if (this.data.conversationStateId) {
          await this.ensureRouterAgent("asset");
          await this.runRouterAction({
            inputType: "text",
            text: kickoffText,
            metadata: {
              source: "asset_inventory_start",
              sceneKey: currentScene,
              buttonLabel: item.label || ""
            }
          }, {
            userLabel: kickoffText,
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_working", { userText: kickoffText });
        return;
      }
      case "fulltime_intake_start": {
        // 方案 A —— 全职分支:先进闲聊收集流(entry_path=fulltime_main_intake)把主营要点聊清楚,
        // 再由 Dify 侧输出 [GOTO_ASSET_INVENTORY] 回到资产盘点。
        const currentScene = this.data.sceneKey;
        const kickoffText = "我想先聊聊我现在主要在做的事。";
        if (this.data.conversationStateId) {
          await this.runRouterAction({
            inputType: "quick_reply",
            routeAction: "fulltime_intake_start",
            text: kickoffText,
            metadata: {
              source: "fulltime_intake_start",
              sceneKey: currentScene,
              buttonLabel: item.label || ""
            }
          }, {
            userLabel: kickoffText,
            showUserMessage: true
          });
          return;
        }
        this.appendScene("onboarding_path_fulltime", { userText: kickoffText });
        return;
      }
      case "go_home":
        if (this.data.sceneKey !== "home") {
          this.appendScene("home", {
            userText: item.label
          });
        } else {
          this.replaceScene("home");
        }
        return;
      case "open_projects":
        this.setData({
          projectSheetVisible: true
        });
        return;
      case "tool_ai":
        this.openSceneFromTool("ai");
        return;
      case "tool_ip":
        this.openSceneFromTool("ip");
        return;
      case "ai_reply_clients":
        this.appendMessages([
          buildUserMessage(item.label),
          {
            id: "ai-followup-1",
            type: "agent",
            text: "\u597d\uff0c\u8fd9\u4e2a\u7279\u522b\u9002\u5408\u7528\u667a\u80fd\u52a9\u624b\u505a\u3002\u6211\u53ef\u4ee5\u5e2e\u4f60\u642d\u4e00\u4e2a\u5ba2\u6237\u6d88\u606f\u81ea\u52a8\u5206\u7c7b + \u8349\u7a3f\u56de\u590d\u7684\u5de5\u4f5c\u6d41\u3002\u4f60\u73b0\u5728\u4e3b\u8981\u7528\u4ec0\u4e48\u8ddf\u5ba2\u6237\u6c9f\u901a\uff1f"
          }
        ], [
          { label: "\u5fae\u4fe1", action: "ai_channel" },
          { label: "\u90ae\u4ef6", action: "ai_channel" },
          { label: "\u591a\u4e2a\u6e20\u9053", action: "ai_channel" }
        ]);
        return;
      case "ai_write_content":
      case "ai_data_report":
      case "ai_other":
      case "ai_channel":
        this.appendMessages([
          buildUserMessage(item.label),
          {
            id: `ai-generic-${Date.now()}`,
            type: "agent",
            text: "\u6211\u5df2\u7ecf\u8bb0\u4e0b\u4e86\u3002\u4e0b\u4e00\u6b65\u6211\u4f1a\u5e2e\u4f60\u628a\u8fd9\u4e2a\u73af\u8282\u62c6\u6210\u300c\u8f93\u5165 - \u5224\u65ad - \u8f93\u51fa\u300d\u4e09\u6b65\uff0c\u518d\u8bbe\u8ba1\u6210\u4e00\u6761\u80fd\u91cd\u590d\u7528\u7684\u667a\u80fd\u6d41\u7a0b\u3002"
          }
        ], []);
        return;
      case "ip_rednote":
      case "ip_douyin":
      case "ip_public":
      case "ip_multi":
        this.appendMessages([
          buildUserMessage(item.label),
          {
            id: "ip-followup-1",
            type: "agent",
            text: "\u8fd9\u4e2a\u5e73\u53f0\u5f88\u9002\u5408\u4f60\u3002\u6839\u636e\u4f60\u7684\u8d44\u4ea7\u76d8\u70b9\uff0c\u4f60\u5728\u6570\u636e\u5206\u6790\u65b9\u9762\u4f18\u52bf\u5f88\u5f3a\u3002\u6211\u5efa\u8bae\u4f60\u7684\u5b9a\u4f4d\u662f\u201c\u7528\u6570\u636e\u5e2e\u5c0f\u4f01\u4e1a\u505a\u51b3\u7b56\u7684\u4eba\u201d\u3002"
          },
          {
            id: "ip-followup-2",
            type: "artifact_card",
            title: "\u5c0f\u7ea2\u4e66\u6587\u6848 #1",
            description: "\u300c\u8001\u677f\u62cd\u8111\u888b\u51b3\u7b56\u7684\u65f6\u4ee3\u8fc7\u53bb\u4e86\u300d\n\u4e0a\u5468\u5e2e\u4e00\u4e2a\u5f00\u5976\u8336\u5e97\u7684\u670b\u53cb\u770b\u4e86\u4e0b\u4ed6\u7684\u5916\u5356\u6570\u636e\uff0c\u53d1\u73b0 70% \u7684\u5dee\u8bc4\u90fd\u96c6\u4e2d\u5728\u5468\u4e09...",
            primaryText: "\u4e0b\u4e00\u6761",
            secondaryText: "\u590d\u5236\u6587\u6848"
          }
        ], []);
        return;
      case "write_followup":
      case "self_handle":
        this.appendMessages([
          buildUserMessage(item.label),
          {
            id: "feedback-next-1",
            type: "agent",
            text: "\u8bb0\u4f4f\uff1a\u4f60\u4e0d\u9700\u8981\u4e00\u4e0a\u6765\u5c31\u8bf4\u670d\u5bf9\u65b9\uff0c\u4f60\u53ea\u9700\u8981\u628a\u98ce\u9669\u964d\u4f4e\uff0c\u8ba9\u4ed6\u66f4\u5bb9\u6613\u8de8\u51fa\u7b2c\u4e00\u6b65\u3002"
          }
        ], []);
        this.setData({
          feedbackLastSummary: ""
        });
        return;
      case "social_blocker":
        this.appendMessages([
          buildUserMessage(item.label),
          {
            id: "social-blocker-1",
            type: "agent",
            text: "\u6211\u61c2\u4e86\u3002\u90a3\u6211\u4eec\u4eca\u5929\u4e0d\u8bb2\u5927\u8ba1\u5212\uff0c\u53ea\u5b9a\u4e00\u4ef6 15 \u5206\u949f\u5185\u80fd\u5b8c\u6210\u7684\u4e8b\u3002"
          }
        ], []);
        return;
      case "social_primary":
        this.replaceScene("home");
        return;
      default:
        this.appendMessages([
          buildUserMessage(item.label)
        ], []);
    }
  },

  async handleSend(event) {
    const { value } = event.detail;
    if (this.data.isStreaming) {
      wx.showToast({
        title: "\u6b63\u5728\u8f93\u51fa\uff0c\u7a0d\u7b49\u7247\u523b",
        icon: "none"
      });
      return;
    }

    if (await this.tryHandleOnboardingInput(value)) {
      return;
    }

    if (this.data.feedbackPendingTask) {
      try {
        const feedbackResult = await fetchTaskFeedback({
          taskId: this.data.feedbackPendingTaskId,
          taskLabel: this.data.feedbackPendingTask,
          userText: value,
          summary: value
        });

        const nextMessages = Array.isArray(feedbackResult && feedbackResult.messages)
          ? feedbackResult.messages.filter((message) => message && message.type === "agent").slice(-1)
          : [];

        this.appendMessages(
          [buildUserMessage(value)].concat(nextMessages.length
            ? nextMessages
            : [{
                id: `task-advice-${Date.now()}`,
                type: "agent",
                text: buildFeedbackAdvice(value, this.data.feedbackPendingTask)
              }]),
          Array.isArray(feedbackResult && feedbackResult.quickReplies)
            ? feedbackResult.quickReplies
            : getFeedbackReplies()
        );
      } catch (_error) {
        this.appendMessages([
          buildUserMessage(value),
          {
            id: `task-advice-${Date.now()}`,
            type: "agent",
            text: buildFeedbackAdvice(value, this.data.feedbackPendingTask)
          }
        ], getFeedbackReplies());
      }

      this.setData({
        feedbackLastSummary: value,
        feedbackPendingTask: "",
        feedbackPendingTaskId: ""
      });
      return;
    }

    this.appendStreamingThenReply(value);
  }
});
