const { getConversationScene: getLocalConversationScene } = require("../../services/conversation.service");
const { getSidebarData } = require("../../services/sidebar.service");
const { getCompanyCards, fetchCompanyCards } = require("../../services/company.service");
const { fetchBootstrap } = require("../../services/bootstrap.service");
const { loginByWechat } = require("../../services/auth.service");
const { updateCurrentUser } = require("../../services/user.service");
const { getToolGuideSeen, setToolGuideSeen } = require("../../services/session.service");
const { resolveToolScene, resolveRecentScene } = require("../../services/intent-routing.service");
const { resolveAgentByText, getReplyByAgent } = require("../../services/mock-chat-flow.service");
const { buildFeedbackPrompt, buildFeedbackAdvice, getFeedbackReplies } = require("../../services/task.service");
const {
  fetchConversationSceneRemote,
  startChatStream,
  pollChatStream,
  createMockStreamEvents,
  foldStreamEvents
} = require("../../services/chat.service");
const { getAgentMeta } = require("../../services/agent.service");
const { getNavMetrics } = require("../../utils/nav");

const AGENT_SCENE_MAP = {
  master: "home",
  asset: "ip_assistant",
  execution: "ai_assistant",
  mindset: "social_proof",
  steward: "monthly_check"
};

const AGENT_ORDER = ["master", "asset", "execution", "mindset", "steward"];

function buildAgentMenuOptions() {
  return AGENT_ORDER.map((agentKey) => {
    const meta = getAgentMeta(agentKey);
    return {
      key: meta.key,
      label: meta.label,
      color: meta.color
    };
  });
}

function stampMessages(messages = []) {
  const seed = Date.now();

  return messages.map((message, index) => ({
    ...message,
    _uid: `${message.id || "msg"}-${seed}-${index}`
  }));
}

function buildUserMessage(text) {
  const seed = Date.now();

  return {
    id: `user-${seed}`,
    _uid: `user-${seed}`,
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

function inferOnboardingRouteByText(text) {
  const source = String(text || "").trim();

  if (!source) {
    return "onboarding_path_explore";
  }

  if (/(\u56ed\u533a|\u6ce8\u518c|\u653f\u7b56|\u8fd4\u7a0e|\u5165\u9a7b|\u8585)/.test(source)) {
    return "onboarding_path_park";
  }

  if (/(\u5361\u4f4f|\u62d6\u5ef6|\u52a8\u4e0d\u4e86|\u8fc8\u4e0d\u51fa|\u5bb3\u6015|\u7126\u8651|\u5b8c\u7f8e\u4e3b\u4e49)/.test(source)) {
    return "onboarding_path_stuck";
  }

  if (/(\u653e\u5927|\u89c4\u6a21|\u7a33\u5b9a|\u81ea\u52a8\u5316|\u589e\u957f|\u5929\u82b1\u677f|\u5728\u505a)/.test(source)) {
    return "onboarding_path_scale";
  }

  if (/(\u65b9\u5411|\u8ff7\u832b|\u4e0d\u77e5\u9053|\u6ca1\u60f3\u6cd5|\u63a2\u7d22)/.test(source)) {
    return "onboarding_path_explore";
  }

  return "onboarding_path_explore";
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
    companyCards: [],
    messages: [],
    quickReplies: [],
    inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
    allowInput: true,
    sidebarVisible: false,
    projectSheetVisible: false,
    companyPanelVisible: false,
    scrollIntoView: "",
    activeToolKey: "",
    feedbackPendingTask: "",
    feedbackLastSummary: "",
    isStreaming: false,
    bootLoading: true,
    bootError: false,
    agentMenuVisible: false,
    agentMenuStyle: "",
    agentMenuOptions: buildAgentMenuOptions()
  },

  onUnload() {
    this.currentSceneHydrationKey = "";
    this.stopStreaming();
  },

  onLoad(options) {
    this.syncAgentMenuLayout();
    this.bootstrapConversationData(options);
  },

  onShow() {
    this.syncAgentMenuLayout();
  },

  syncAgentMenuLayout() {
    const navMetrics = getNavMetrics(true);
    const menuTop = navMetrics.headerTop + navMetrics.menuHeight - 2;

    this.setData({
      agentMenuStyle: `top: ${menuTop}px;`
    });
  },

  bootstrapConversationData(options) {
    const app = getApp();
    const fallback = getSidebarData();
    this.setData({
      bootLoading: true,
      bootError: false
    });

    const openInitialScene = () => {
      const initialScene = options.scene || "home";
      const target = options.target || "";
      const initialUserText = options.userText ? safeDecode(options.userText) : "";

      if (initialUserText && initialScene !== "home") {
        this.appendScene(initialScene, {
          target,
          userText: initialUserText
        });
        return;
      }

      this.replaceScene(initialScene, {
        target
      });
    };

    const syncCompanyCards = getCompanyCards();
    const loadCompanyCards = () => {
      fetchCompanyCards()
        .then((cards) => {
          this.setData({
            companyCards: cards || syncCompanyCards
          });
        })
        .catch(() => {
          this.setData({
            companyCards: syncCompanyCards
          });
        });
    };

    fetchBootstrap()
      .then((response) => {
        const payload = response && response.ok && response.data ? response.data : fallback;

        this.setData({
          projects: payload.projects || fallback.projects || [],
          tools: payload.tools || fallback.tools || [],
          recentChats: payload.recentChats || fallback.recentChats || [],
          user: payload.user || app.globalData.user,
          bootLoading: false,
          bootError: false
        });
        loadCompanyCards();

        openInitialScene();
      })
      .catch(() => {
        this.setData({
          ...fallback,
          user: app.globalData.user,
          bootLoading: false,
          bootError: true
        });
        loadCompanyCards();

        openInitialScene();
      });
  },

  syncSceneMeta(scene, messages) {
    const app = getApp();

    app.setCurrentAgent(scene.agentKey);

    this.setData({
      sceneKey: scene.key,
      agentKey: scene.agentKey,
      agentColor: scene.agent.color,
      activeToolKey: resolveActiveToolKey(scene.key, this.data.pendingToolTarget),
      quickReplies: scene.quickReplies || [],
      inputPlaceholder: scene.inputPlaceholder || "\u8f93\u5165\u6d88\u606f...",
      allowInput: scene.allowInput !== false,
      messages,
      scrollIntoView: messages.length ? `msg-${messages[messages.length - 1]._uid}` : ""
    });
  },

  syncUserState(user = {}) {
    this.data.user = {
      ...user
    };

    this.setData({
      user: this.data.user
    });

    const app = getApp();
    if (app && app.globalData) {
      app.globalData.user = {
        ...app.globalData.user,
        ...user
      };
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

    this.data.pendingToolTarget = target;
    this.setData({
      pendingToolTarget: target,
      agentMenuVisible: false
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

    if (options.userText) {
      nextMessages.push(buildUserMessage(options.userText));
    }

    const prefixMessages = this.data.messages.concat(nextMessages);
    const messages = prefixMessages.concat(stampMessages(scene.messages));

    this.data.pendingToolTarget = target;
    this.setData({
      pendingToolTarget: target,
      agentMenuVisible: false
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
    const mergedMessages = this.data.messages.concat(stampMessages(messages));

    this.setData({
      messages: mergedMessages,
      quickReplies: nextQuickReplies,
      scrollIntoView: mergedMessages.length ? `msg-${mergedMessages[mergedMessages.length - 1]._uid}` : ""
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
      const routeScene = inferOnboardingRouteByText(value);
      this.appendScene(routeScene, {
        userText: value
      });
      return true;
    }

    return false;
  },

  stopStreaming() {
    this.currentStreamJobKey = "";
    this.setData({
      isStreaming: false
    });
  },

  patchMessageText(messageId, nextText) {
    const messages = this.data.messages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      return {
        ...message,
        text: nextText
      };
    });

    const target = messages.find((item) => item.id === messageId);
    this.setData({
      messages,
      scrollIntoView: target && target._uid ? `msg-${target._uid}` : this.data.scrollIntoView
    });
  },

  async pollStreamEvents(streamId, streamJobKey) {
    const events = [];

    for (let index = 0; index < 8; index += 1) {
      if (!streamId || streamJobKey !== this.currentStreamJobKey) {
        break;
      }

      const chunk = await pollChatStream(streamId);
      if (streamJobKey !== this.currentStreamJobKey) {
        break;
      }

      if (Array.isArray(chunk) && chunk.length) {
        events.push(...chunk);
        if (chunk.some((item) => item.type === "done" || item.type === "error")) {
          break;
        }
      } else {
        break;
      }

      await sleep(40);
    }

    return events;
  },

  async renderStreamTokens(streamMessageId, events = [], streamJobKey) {
    let accumulatedText = "";

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

    const nextAgentKey = resolveAgentByText(userText, this.data.agentKey);
    const plannedReply = getReplyByAgent(nextAgentKey, userText);
    const streamMessageId = `stream-agent-${Date.now()}`;
    const streamMessage = {
      id: streamMessageId,
      type: "agent",
      text: ""
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
      const streamResult = await startChatStream({
        conversationId: `conv-${this.data.sceneKey}`,
        sceneKey: this.data.sceneKey,
        userText,
        message: plannedReply.text
      });

      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      const streamId = streamResult && streamResult.streamId ? streamResult.streamId : "";
      let events = Array.isArray(streamResult && streamResult.events) ? streamResult.events : [];

      if (!events.length) {
        events = await this.pollStreamEvents(streamId, streamJobKey);
      }

      if (!events.length) {
        events = createMockStreamEvents(plannedReply.text);
      }

      const streamedText = await this.renderStreamTokens(streamMessageId, events, streamJobKey);
      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      const folded = foldStreamEvents(events);
      const finalText = folded.content || streamedText || plannedReply.text;
      this.patchMessageText(streamMessageId, finalText);

      this.setData({
        quickReplies: plannedReply.quickReplies || [],
        isStreaming: false
      });
      this.currentStreamJobKey = "";
    } catch (error) {
      if (streamJobKey !== this.currentStreamJobKey) {
        return;
      }

      this.patchMessageText(streamMessageId, plannedReply.text || "收到，我继续帮你往下拆。");
      this.setData({
        quickReplies: plannedReply.quickReplies || [],
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

  openSceneFromTool(toolKey) {
    const route = resolveToolScene(toolKey, getToolGuideSeen(getApp()));

    if (route.type === "panel") {
      this.setData({
        companyPanelVisible: true,
        activeToolKey: "company"
      });
      return;
    }

    this.replaceScene(route.scene, {
      target: route.target || toolKey
    });
  },

  handleAvatarTap() {
    this.setData({
      agentMenuVisible: false,
      sidebarVisible: true
    });
  },

  handleAgentTap() {
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

  handleAgentSelect(event) {
    const nextAgentKey = event.currentTarget.dataset.key;
    const targetScene = AGENT_SCENE_MAP[nextAgentKey] || "home";
    const isCurrent = nextAgentKey === this.data.agentKey;

    this.setData({
      agentMenuVisible: false
    });

    if (isCurrent) {
      return;
    }

    this.replaceScene(targetScene);
  },

  handleSidebarClose() {
    this.setData({
      sidebarVisible: false
    });
  },

  handleTreeTap() {
    this.openMyTreePage();
  },

  handleTreePullDown() {
    this.openMyTreePage();
  },

  openMyTreePage() {
    if (this._openingTreePage) {
      return;
    }

    this._openingTreePage = true;
    this.setData({
      agentMenuVisible: false
    });

    wx.navigateTo({
      url: "/pages/tree/tree"
    });

    setTimeout(() => {
      this._openingTreePage = false;
    }, 420);
  },

  handleProfileTap() {
    this.setData({
      sidebarVisible: false
    });

    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  },

  handleProjectTap(event) {
    const { id } = event.detail;

    this.setData({
      sidebarVisible: false,
      projectSheetVisible: false
    });

    wx.navigateTo({
      url: `/pages/project-detail/project-detail?id=${id}`,
      events: {
        projectResultCta: (payload) => {
          if (!payload || !payload.scene) {
            return;
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
    const { key } = event.detail;

    this.setData({
      sidebarVisible: false
    });

    this.openSceneFromTool(key);
  },

  handleRecentTap(event) {
    const sceneKey = resolveRecentScene(event.detail.id);

    this.setData({
      sidebarVisible: false
    });

    this.replaceScene(sceneKey);
  },

  handleNewChat() {
    this.setData({
      sidebarVisible: false
    });

    this.replaceScene("home");
  },

  handlePlusTap() {
    this.setData({
      projectSheetVisible: true
    });
  },

  handleProjectSheetClose() {
    this.setData({
      projectSheetVisible: false
    });
  },

  handleProjectCreate() {
    wx.showToast({
      title: "\u65b0\u9879\u76ee\u521b\u5efa\u529f\u80fd\u5373\u5c06\u5f00\u653e",
      icon: "none"
    });
  },

  handleCompanyClose() {
    this.setData({
      companyPanelVisible: false,
      activeToolKey: ""
    });
  },

  handleCompanyAction(event) {
    const { id, scene, actionText } = event.detail || {};

    this.setData({
      companyPanelVisible: false,
      activeToolKey: ""
    });

    if (scene) {
      this.appendScene(scene, {
        target: "company",
        userText: actionText || "\u7ee7\u7eed\u5904\u7406\u516c\u53f8\u4e8b\u9879"
      });
      return;
    }

    if (id === "company-tax" || id === "company-profit") {
      this.appendScene("monthly_check", {
        target: "company"
      });
      return;
    }

    this.appendScene("home", {
      target: "company",
      userText: "\u5148\u56de\u5230\u4e3b\u5bf9\u8bdd"
    });
  },

  async handleLoginAction() {
    if (this.loginPending) {
      return;
    }

    this.loginPending = true;

    try {
      const loginResult = await loginByWechat({});
      const nextUser = loginResult && loginResult.user ? loginResult.user : {};
      const mergedUser = {
        ...this.data.user,
        ...nextUser
      };

      this.syncUserState(mergedUser);

      this.replacePendingLoginCardWithDone(mergedUser);
      this.appendScene("onboarding_nickname");
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || "微信登录失败，请稍后重试",
        icon: "none"
      });
    } finally {
      this.loginPending = false;
    }
  },

  handleAgreementTap(event) {
    const { type } = event.detail || {};
    const title = type === "privacy" ? "\u9690\u79c1\u653f\u7b56" : "\u7528\u6237\u534f\u8bae";

    wx.showToast({
      title: `${title}\u529f\u80fd\u5373\u5c06\u5f00\u653e`,
      icon: "none"
    });
  },

  handleTaskComplete(event) {
    const detail = event && event.detail ? event.detail : {};
    const item = detail.item || {};

    if (!detail.done || !item.label) {
      return;
    }

    const taskLabel = item.label;
    this.appendMessages([
      {
        id: `task-done-${Date.now()}`,
        type: "status_chip",
        label: taskLabel,
        status: "done"
      },
      {
        id: `task-feedback-${Date.now() + 1}`,
        type: "agent",
        text: buildFeedbackPrompt(taskLabel)
      }
    ], []);

    this.setData({
      feedbackPendingTask: taskLabel
    });
  },

  handleLeveragePrimary() {
    setToolGuideSeen(getApp(), true);
    this.replaceScene("ai_assistant");
  },

  handleLeverageSecondary() {
    setToolGuideSeen(getApp(), true);
    this.replaceScene("ip_assistant");
  },

  handleArtifactPrimary(event) {
    const { action } = event.currentTarget.dataset;

    if (action === "open_share") {
      wx.navigateTo({
        url: "/pages/share-preview/share-preview"
      });
      return;
    }

    if (action === "route_park") {
      this.appendScene("onboarding_path_park", {
        userText: "\u5e2e\u6211\u67e5\u67e5\u80fd\u8585\u4ec0\u4e48"
      });
    }
  },

  handleArtifactSecondary() {
    wx.showToast({
      title: "\u5df2\u4e3a\u4f60\u9884\u7559\u4e0b\u4e00\u6b65\u64cd\u4f5c",
      icon: "none"
    });
  },

  handleReportPrimary() {
    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handleMilestonePrimary() {
    wx.navigateTo({
      url: "/pages/tree/tree"
    });
  },

  handleMilestoneSecondary() {
    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handleSocialPrimary() {
    this.replaceScene("home");
  },

  handleSocialSecondary() {
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

  async handleQuickReplySelect(event) {
    const { item } = event.detail;

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
        this.appendScene("onboarding_path_park", {
          userText: item.label
        });
        return;
      case "route_explore":
        this.appendScene("onboarding_path_explore", {
          userText: item.label
        });
        return;
      case "route_stuck":
        this.appendScene("onboarding_path_stuck", {
          userText: item.label
        });
        return;
      case "route_scale":
        this.appendScene("onboarding_path_scale", {
          userText: item.label
        });
        return;
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
            text: "\u597d\uff0c\u8fd9\u4e2a\u7279\u522b\u9002\u5408\u7528 AI \u505a\u3002\u6211\u53ef\u4ee5\u5e2e\u4f60\u642d\u4e00\u4e2a\u5ba2\u6237\u6d88\u606f\u81ea\u52a8\u5206\u7c7b + \u8349\u7a3f\u56de\u590d\u7684\u5de5\u4f5c\u6d41\u3002\u4f60\u73b0\u5728\u4e3b\u8981\u7528\u4ec0\u4e48\u8ddf\u5ba2\u6237\u6c9f\u901a\uff1f"
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
            text: "\u6211\u5df2\u7ecf\u8bb0\u4e0b\u4e86\u3002\u4e0b\u4e00\u6b65\u6211\u4f1a\u5e2e\u4f60\u628a\u8fd9\u4e2a\u73af\u8282\u62c6\u6210\u300c\u8f93\u5165 - \u5224\u65ad - \u8f93\u51fa\u300d\u4e09\u6b65\uff0c\u518d\u8bbe\u8ba1\u6210\u4e00\u6761\u80fd\u91cd\u590d\u7528\u7684 AI \u6d41\u7a0b\u3002"
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
      const advice = buildFeedbackAdvice(value, this.data.feedbackPendingTask);
      this.appendMessages([
        buildUserMessage(value),
        {
          id: `task-advice-${Date.now()}`,
          type: "agent",
          text: advice
        }
      ], getFeedbackReplies());

      this.setData({
        feedbackLastSummary: value,
        feedbackPendingTask: ""
      });
      return;
    }

    this.appendStreamingThenReply(value);
  }
});
