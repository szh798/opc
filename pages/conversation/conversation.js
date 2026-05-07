const { getConversationScene: getLocalConversationScene } = require("../../services/conversation.service");
const { fetchBootstrap } = require("../../services/bootstrap.service");
const { loginByWechat, loginByDevFresh, getAccessToken } = require("../../services/auth.service");
const { updateCurrentUser } = require("../../services/user.service");
const { createProject, initiateProject } = require("../../services/project.service");
const {
  refreshBusinessDirections,
  selectBusinessDirection,
  sendOpportunityDeepDiveMessage,
  sendOpportunityDeepDiveMessageStream
} = require("../../services/opportunity.service");
const { requestProjectFollowupSubscription } = require("../../services/subscription.service");
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
  fetchTaskFeedback,
  submitDailyTaskAction
} = require("../../services/task.service");
const {
  fetchConversationSceneRemote,
  startChatStream,
  pollChatStream,
  foldStreamEvents,
  fetchConversationHistory,
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
const { startRouterMessageStream } = require("../../services/chat-stream.service");
const { buildQuickReplyPayload } = require("../../services/conversation-state.service");
const { cardsToMessages, normalizeCardPayload } = require("../../services/card-registry.service");
const { getAgentMeta } = require("../../services/agent.service");
const { getSkillCatalog, findSkillByKey } = require("../../services/skill-catalog.service");
const { getNavMetrics } = require("../../utils/nav");
const { buildDisplayUser, normalizeAvatarUrl } = require("../../utils/user-display");
const { reportClientError, resolveCurrentRoute } = require("../../utils/error-report");

const AGENT_SCENE_MAP = {
  master: "home",
  asset: "phase2_opportunity_hub",
  execution: "ai_assistant",
  mindset: "social_proof",
  steward: "monthly_check"
};

const AGENT_ORDER = ["master", "asset", "execution", "mindset", "steward"];
const AGENT_COMING_SOON_KEYS = ["execution", "mindset", "steward"];
const AGENT_COMING_SOON_TIP = "一树正在开发";
const TOOL_COMING_SOON_KEYS = ["ai", "ip", "company"];
const TOOL_COMING_SOON_TIP = "一树正在开发";
// 方案 γ —— 主对话流退役后,execution/mindset 相关的 routeAction 全部在前端拦截,
// 点击后直接弹 coming-soon 提示,不再发送到后端。后端 ROUTE_ACTION_DECISIONS 里
// 对应条目仍保留作防御性回退,但运行时流量不应触达。
const BLOCKED_ROUTE_ACTIONS = new Set([
  "action_plan_48h",
  "tool_ai",
  "switch_execution",
  "mindset_unblock",
  "mindset_next_step"
]);
const STEWARD_COMING_SOON_ROUTE_ACTIONS = new Set(["business_health", "park_match"]);
const ASSET_COMING_SOON_ROUTE_ACTIONS = new Set(["pricing_card"]);
const HOME_COMING_SOON_ACTIONS = new Set(["tool_ai", "tool_ip"]);
const REMOVED_MASTER_QUICK_REPLY_ACTIONS = new Set(["route_explore", "route_stuck", "route_scale", "route_park"]);
const REMOVED_MASTER_QUICK_REPLY_IDS = new Set([
  "qr-master-explore",
  "qr-master-stuck",
  "qr-master-scale",
  "qr-master-park"
]);
const REMOVED_MASTER_QUICK_REPLY_LABELS = new Set([
  "想做一人公司，没方向",
  "我现在卡住了",
  "我想放大规模",
  "看看园区政策"
]);
const COMING_SOON_NOTICE_DURATION = 1800;
const PROJECT_COLORS = ["#378ADD", "#10A37F", "#534AB7", "#E24B4A", "#EBA327"];
const ASSET_REPORT_READY_TEXT = "\u62a5\u544a\u597d\u4e86\u3002\u4f60\u771f\u6b63\u80fd\u53d8\u73b0\u7684\u4e0d\u662f\u5c65\u5386\uff0c\u800c\u662f\u8fd9\u7ec4\u7ec4\u5408\u3002";
const STREAM_TYPEWRITER_INTERVAL_MS = 90;
const ASSET_PROGRESS_MIN_VISIBLE_MS = 1200;
const STREAM_TYPEWRITER_CHARS_PER_TICK = 2;
const STREAM_TYPEWRITER_CATCHUP_THRESHOLD = 120;
const STREAM_TYPEWRITER_CATCHUP_CHARS = 8;
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
  project_asset_followup: "project_asset_followup",
  project_artifact_continue: "project_execution_followup"
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

function parseRouterSessionIdFromConversationId(conversationId = "") {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId || !normalizedConversationId.startsWith("router-")) {
    return "";
  }

  return normalizedConversationId.slice("router-".length).trim();
}

function filterQuickReplies(quickReplies = []) {
  if (!Array.isArray(quickReplies)) {
    return [];
  }

  return quickReplies.filter((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const id = String(item.quickReplyId || item.id || "").trim();
    const action = String(item.routeAction || item.action || "").trim();
    const label = String(item.label || "").trim();

    return !(
      REMOVED_MASTER_QUICK_REPLY_IDS.has(id) ||
      REMOVED_MASTER_QUICK_REPLY_ACTIONS.has(action) ||
      REMOVED_MASTER_QUICK_REPLY_LABELS.has(label)
    );
  });
}

function shouldInlineIntroQuickReplies(sceneKey = "", messages = [], quickReplies = []) {
  if (!Array.isArray(quickReplies) || !quickReplies.length) {
    return false;
  }

  if (!Array.isArray(messages) || !messages.length) {
    return false;
  }

  const normalizedSceneKey = String(sceneKey || "").trim();
  const hasUserMessage = messages.some((message) => message && message.type === "user");
  if (hasUserMessage) {
    return false;
  }

  const firstMessage = messages[0] || {};

  return (
    normalizedSceneKey === "onboarding_route" ||
    (messages.length <= 3 && String(firstMessage.id || "").trim() === "onboarding-route-1")
  );
}

function takeTypewriterChunk(buffer = "", force = false) {
  const chars = Array.from(String(buffer || ""));
  if (force) {
    return {
      chunk: chars.join(""),
      rest: ""
    };
  }

  const size = chars.length > STREAM_TYPEWRITER_CATCHUP_THRESHOLD
    ? STREAM_TYPEWRITER_CATCHUP_CHARS
    : STREAM_TYPEWRITER_CHARS_PER_TICK;
  return {
    chunk: chars.slice(0, size).join(""),
    rest: chars.slice(size).join("")
  };
}

function hasAssetReportArtifactCard(messages = []) {
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some((message) => {
    const cardType = String((message && (message.cardType || message.card_type)) || "").trim();
    return message && message.type === "artifact_card" && (
      cardType === "asset_report" ||
      cardType === "asset_radar"
    );
  });
}

function getRouterStreamEventData(event = {}) {
  if (event && event.data && typeof event.data === "object") {
    return event.data;
  }
  return event && typeof event === "object" ? event : {};
}

function resolveRouterStreamEventName(event = {}) {
  const data = getRouterStreamEventData(event);
  const rawName = String(event.event || event.event_type || event.type || data.event_type || data.type || "").trim();
  if (rawName.includes(".")) {
    return rawName;
  }

  if (data.message && Array.isArray(data.message.segments)) {
    return "final_report.created";
  }
  if (data.patch && data.card_id) {
    return "card.patch";
  }
  if (data.card_type === "asset_report_progress" && data.data) {
    return "card.created";
  }
  if (data.card_id && data.data && String(data.data.status || "").toLowerCase() === "completed") {
    return "card.completed";
  }

  return rawName;
}

function hasFinalReportCreatedEvent(events = []) {
  if (!Array.isArray(events)) {
    return false;
  }
  return events.some((event) => resolveRouterStreamEventName(event) === "final_report.created");
}

function isAssetFinalReportEventData(data = {}) {
  const message = data && data.message && typeof data.message === "object" ? data.message : {};
  const segments = Array.isArray(message.segments) ? message.segments : [];
  return segments.some((segment) => {
    if (!segment || segment.type !== "card") {
      return false;
    }
    const cardType = String(
      segment.card_type ||
      segment.cardType ||
      (segment.data && (segment.data.card_type || segment.data.cardType)) ||
      ""
    ).trim();
    return cardType === "asset_report" || cardType === "asset_radar";
  });
}

function isAssetProgressControlData(data = {}) {
  const cardId = String((data && data.card_id) || "").trim();
  if (cardId.includes("asset-report-progress")) {
    return true;
  }
  const payload = (data && (data.patch || data.data)) || {};
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(payload, "progress") && (
    Object.prototype.hasOwnProperty.call(payload, "current_step") ||
    Object.prototype.hasOwnProperty.call(payload, "steps") ||
    Object.prototype.hasOwnProperty.call(payload, "found_assets") ||
    Object.prototype.hasOwnProperty.call(payload, "radar_preview") ||
    Object.prototype.hasOwnProperty.call(payload, "status")
  );
}

function getAssetReportArtifactCardKey(message = {}) {
  if (!message || message.type !== "artifact_card") {
    return "";
  }

  const cardType = String(message.cardType || message.card_type || "").trim();
  const primaryAction = String(message.primaryAction || "").trim();
  const isReportCard = primaryAction === "open_asset_report" || cardType === "asset_report";
  if (!isReportCard) {
    return "";
  }

  const tags = Array.isArray(message.tags) ? message.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const versionTag = tags.find((tag) => /^v\d+/i.test(tag)) || "";
  if (versionTag) {
    return `asset-report:${versionTag.toLowerCase()}`;
  }

  const title = String(message.title || "").trim();
  const description = String(message.description || "").trim();
  return `asset-report:${title}:${description.slice(0, 120)}`;
}

function dedupeAssetReportArtifactCards(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const seen = new Set();
  return messages.filter((message) => {
    const key = getAssetReportArtifactCardKey(message);
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function stampMessages(messages = []) {
  const seed = Date.now();

  return dedupeAssetReportArtifactCards(messages)
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
          const hasPrimaryControl = !!(
            String(nextMessage.primaryText || "").trim() ||
            String(nextMessage.primaryAction || "").trim()
          );
          const hasSecondaryControl = !!(
            String(nextMessage.secondaryText || "").trim() ||
            String(nextMessage.secondaryAction || "").trim()
          );

          nextMessage.title = localized.title;
          nextMessage.description = localized.description;
          nextMessage.primaryText = hasPrimaryControl ? localized.primaryText : "";
          nextMessage.secondaryText = hasSecondaryControl ? localized.secondaryText : "";
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

function isDevRuntimeEnv() {
  try {
    const app = typeof getApp === "function" ? getApp() : null;
    const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || {};
    return String(runtimeConfig.env || "").trim() === "dev";
  } catch (_error) {
    return false;
  }
}

function traceConversation(stage, payload = {}) {
  if (!isDevRuntimeEnv() || typeof console === "undefined" || typeof console.log !== "function") {
    return;
  }

  console.log("[conversation]", stage, payload);
}

function resolvePreferredHomeScene(user = {}, opportunityState = {}) {
  const loggedIn = !!(user && user.loggedIn);
  const phase2Route = String((opportunityState && opportunityState.phase2Route) || "").trim();

  if (!loggedIn) {
    return "onboarding_intro";
  }

  if (phase2Route === "phase2_opportunity_hub") {
    return "phase2_opportunity_hub";
  }

  if (phase2Route === "asset_audit_flow") {
    return "asset_audit_flow";
  }

  return user && user.onboardingCompleted ? "home" : "onboarding_route";
}

function resolveBootstrapScene(sceneKey = "", user = {}, opportunityState = {}) {
  const requestedScene = String(sceneKey || "home").trim() || "home";
  const loggedIn = !!(user && user.loggedIn);
  const preferredHomeScene = resolvePreferredHomeScene(user, opportunityState);

  if (requestedScene === "home" || requestedScene === "phase2_opportunity_hub" || requestedScene === "asset_audit_flow") {
    return preferredHomeScene;
  }

  if (loggedIn && isPreRouterOnboardingScene(requestedScene)) {
    return preferredHomeScene === "phase2_opportunity_hub" || preferredHomeScene === "asset_audit_flow"
      ? preferredHomeScene
      : "onboarding_route";
  }

  if (requestedScene === "onboarding_flow") {
    return loggedIn ? "onboarding_route" : "onboarding_intro";
  }

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

function parseRouteMetadata(value) {
  const decoded = safeDecode(value || "");
  if (!decoded) {
    return {};
  }
  try {
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
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

  if (/Deep dive flow must return <deep_dive_result> JSON block/i.test(message)) {
    return "深聊工作流返回格式不完整，请检查 Dify 的 deep_dive_result 输出配置后重试";
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

  return items.map((item) => {
    const hasCompletedAt = !!(item && (item.completedAt || item.completed_at));
    const rawStatus = item && item.status ? item.status : (item && item.done ? "completed" : "pending");
    const status = (rawStatus === "completed" || rawStatus === "done") && !(item && item.done && hasCompletedAt) ? "pending" : rawStatus;
    const isCompleted = status === "completed" || status === "done";
    const serverActions = normalizeTaskActions(Array.isArray(item && item.actions) ? item.actions : []);
    return {
      id: item && item.id ? item.id : `task-${Date.now()}`,
      title: item && (item.title || item.label) ? (item.title || item.label) : "",
      label: item && (item.label || item.title) ? (item.label || item.title) : "",
      reason: item && item.reason ? item.reason : "",
      project_name: item && (item.project_name || item.projectName || item.tag) ? (item.project_name || item.projectName || item.tag) : "",
      tag: item && item.tag ? item.tag : "",
      taskType: item && (item.taskType || item.task_type) ? (item.taskType || item.task_type) : "",
      agent_role: item && (item.agent_role || item.agentRole) ? (item.agent_role || item.agentRole) : "gaoqian",
      estimate_minutes: Number(item && (item.estimate_minutes || item.estimateMinutes) || 0),
      status,
      statusLabel: item && item.statusLabel ? item.statusLabel : resolveTaskStatusLabel(status),
      done: !!(item && item.done && hasCompletedAt),
      actions: isCompleted ? buildTaskActions(status, item) : (serverActions.length ? serverActions : buildTaskActions(status, item))
    };
  });
}

function normalizeTaskActions(actions = []) {
  return actions.map((action) => {
    const key = String((action && (action.key || action.action)) || "").trim();
    return {
      ...action,
      key,
      primary: key === "complete" ? true : !!(action && action.primary)
    };
  }).filter((action) => action.key);
}

function resolveTaskStatusLabel(status = "pending") {
  const normalized = String(status || "pending").toLowerCase();
  const labels = {
    pending: "待开始",
    doing: "进行中",
    completed: "已完成",
    done: "已完成",
    blocked: "卡住了",
    skipped: "已跳过"
  };
  return labels[normalized] || "待开始";
}

function buildTaskActions(status = "pending", item = {}) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "completed" || normalized === "done") {
    const label = String((item && (item.label || item.title)) || "");
    const taskType = String((item && (item.taskType || item.task_type)) || "").toLowerCase();
    if (taskType.includes("evidence") || /原话|反馈|证据|记录/.test(label)) {
      return [
        { key: "feedback", label: "聊聊自己反馈", primary: true },
        { key: "review", label: "判断信号" }
      ];
    }
    if (taskType.includes("validation") || /客户|潜在|触达|问他们/.test(label)) {
      return [
        { key: "feedback", label: "聊聊自己反馈", primary: true },
        { key: "review", label: "聊聊客户反馈" }
      ];
    }
    return [
      { key: "feedback", label: "聊聊自己反馈", primary: true },
      { key: "review", label: "复盘这条" }
    ];
  }
  if (normalized === "blocked") {
    return [
      { key: "continue", label: "继续聊", primary: true },
      { key: "replace", label: "换一个" }
    ];
  }
  return [
    { key: "complete", label: "完成了", primary: true },
    { key: "blocked", label: "我卡住了" },
    { key: "replace", label: "换一个" }
  ];
}

function buildTaskFeedbackQuickReplies(item = {}) {
  const label = String((item && (item.label || item.title)) || "");
  const taskType = String((item && (item.taskType || item.task_type)) || "").toLowerCase();
  if (taskType.includes("evidence") || /原话|反馈|证据|记录/.test(label)) {
    return [
      { label: "有客户原话", action: "task_feedback_quote", value: "有客户原话" },
      { label: "只有卡点", action: "task_feedback_blocked", value: "只有卡点" },
      { label: "先判断信号", action: "task_feedback_review", value: "先判断信号" }
    ];
  }
  if (taskType.includes("validation") || /客户|潜在|触达|问他们/.test(label)) {
    return [
      { label: "有客户回应", action: "task_feedback_signal", value: "有客户回应" },
      { label: "没人回应", action: "task_feedback_no_response", value: "没人回应" },
      { label: "遇到卡点", action: "task_feedback_blocked", value: "遇到卡点" }
    ];
  }
  return [
    { label: "补充结果", action: "task_feedback_result", value: "补充结果" },
    { label: "遇到问题", action: "task_feedback_blocked", value: "遇到问题" },
    { label: "先复盘这条", action: "task_feedback_review", value: "先复盘这条" }
  ];
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
      title: taskPayload.title || message.title || "一树帮你推动",
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
        done: true,
        status: "completed",
        statusLabel: resolveTaskStatusLabel("completed"),
        actions: buildTaskActions("completed")
      };
    });

    return {
      ...message,
      items: nextItems
    };
  });
}

const OPPORTUNITY_STAGE_LABELS = {
  capturing: "捕捉机会",
  structuring: "结构化梳理",
  scoring: "机会评分中",
  comparing: "机会比较中",
  validating: "验证推进中"
};

const DECISION_STATUS_LABELS = {
  none: "待判断",
  candidate: "候选中",
  selected: "已选中",
  parked: "已搁置",
  rejected: "已否掉"
};

function buildOpportunitySummaryDescription(summary = {}) {
  const source = summary && typeof summary === "object" ? summary : {};
  const scoreObject =
    source.opportunityScore && typeof source.opportunityScore === "object"
      ? source.opportunityScore
      : null;
  const scoreValue = scoreObject ? Number(scoreObject.totalScore || 0) : 0;
  const lines = [
    `当前阶段\n${OPPORTUNITY_STAGE_LABELS[source.opportunityStage] || "待识别"}`,
    `当前评分\n${scoreValue > 0 ? `${scoreValue}/100` : "待评分"}`
  ];

  if (source.nextValidationAction) {
    lines.push(`下一步验证动作\n${source.nextValidationAction}`);
  }
  if (source.lastValidationSignal) {
    lines.push(`最近一次验证信号\n${source.lastValidationSignal}`);
  }

  return lines.join("\n\n");
}

function patchOpportunitySummaryMessages(messages = [], summary = null) {
  if (!summary || typeof summary !== "object") {
    return messages;
  }

  return messages.map((message) => {
    if (
      !message ||
      message.type !== "artifact_card" ||
      (message.id !== "phase2-hub-focus" && message.id !== "first-screen-phase2-focus")
    ) {
      return message;
    }

    return {
      ...message,
      title: summary.projectName || message.title || "当前主线机会",
      description: buildOpportunitySummaryDescription(summary),
      meta: DECISION_STATUS_LABELS[summary.decisionStatus] || message.meta || ""
    };
  });
}

function buildBusinessDirectionMessages(result = {}) {
  const directions = Array.isArray(result.directions) ? result.directions : [];
  if (!directions.length) {
    return [buildAgentMessage("我暂时没生成出稳定的方向，先补充一点你最近的经历、资源或想做的事。")];
  }

  return [{
    id: `business-directions-${Date.now()}`,
    type: "business_direction_card_v2",
    title: "3 个可以先验证的方向",
    projectId: result.projectId || "",
    candidateSetId: result.candidateSetId || "",
    candidateSetVersion: result.candidateSetVersion || 0,
    workspaceVersion: result.workspaceVersion || 0,
    directions
  }];
}

function buildInitiationSummaryMessages(result = {}) {
  const summary = result.initiationSummary || {};
  if (!summary || !summary.projectName) {
    return [];
  }
  return [{
    id: `initiation-summary-${Date.now()}`,
    type: "initiation_summary_card_v2",
    title: "立项前先把边界定清",
    projectId: result.projectId || "",
    workspaceVersion: result.workspaceVersion || 0,
    initiationSummaryVersion: result.initiationSummaryVersion || 0,
    selectedDirection: result.selectedDirection || null,
    summary,
    successCriteriaText: Array.isArray(summary.successCriteria) ? summary.successCriteria.join(" / ") : "",
    killCriteriaText: Array.isArray(summary.killCriteria) ? summary.killCriteria.join(" / ") : "",
    evidenceNeededText: Array.isArray(summary.evidenceNeeded) ? summary.evidenceNeeded.join(" / ") : ""
  }];
}

function buildOpportunityDeepDiveMessages(result = {}) {
  const source = result && typeof result === "object" ? result : {};
  const messages = [];
  const assistantText = String(source.assistantText || "").trim();
  if (assistantText) {
    messages.push({
      id: `opportunity-deep-dive-${Date.now()}`,
      type: "agent",
      text: assistantText
    });
  }

  if (source.readyToInitiate && source.initiationSummary) {
    messages.push(...buildInitiationSummaryMessages(source));
  }

  if (!messages.length) {
    messages.push(buildAgentMessage("这个方向可以继续聊。你先补充一下第一批目标用户是谁，以及你准备怎么拿到真实反馈。"));
  }

  return messages;
}

function buildProjectInitiatedMessage(result = {}) {
  const project = result.project || {};
  const cycle = result.currentFollowupCycle || {};
  return {
    id: `project-initiated-${Date.now()}`,
    type: "project_success_card_v2",
    title: "项目已立项",
    projectId: result.projectId || project.projectId || "",
    projectName: project.projectName || "",
    goal: cycle.goal || "",
    nextFollowupAt: result.nextFollowupAt || "",
    tasks: Array.isArray(cycle.tasks) ? cycle.tasks : []
  };
}

function isOpportunityDeepDiveActive(workspace = {}) {
  const stage = String((workspace && workspace.projectStage) || "").trim();
  return stage === "deep_diving" && !workspace.readyToInitiate && !!workspace.projectId;
}

function looksLikeOpportunityFeedbackText(value) {
  const text = String(value || "").trim();
  if (text.length < 12) {
    return false;
  }

  return /(\d+\s*[个条位]|一|二|三|用户|客户|商家|原话|反馈|验证|访谈|问了|愿意|付费|买|痛点|报价|价格|预算|感兴趣|拒绝|担心|没人|没人买|结论|意愿|方案)/.test(text);
}

function hasOpportunitySummaryContext(data = {}) {
  if (data.opportunityState && data.opportunityState.focusProject) {
    return true;
  }

  return Array.isArray(data.messages) && data.messages.some((message) =>
    message &&
    message.type === "artifact_card" &&
    (message.id === "phase2-hub-focus" || message.id === "first-screen-phase2-focus")
  );
}

Page({
  data: {
    sceneKey: "home",
    pendingToolTarget: "",
    agentKey: "master",
    agentColor: "#0D0D0D",
    user: {},
    opportunityState: {},
    opportunityWorkspaceSummary: {},
    projects: [],
    tools: [],
    skills: getSkillCatalog(),
    recentChats: [],
    messages: [],
    quickReplies: [],
    introQuickRepliesInline: false,
    inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
    allowInput: true,
    sidebarVisible: false,
    projectSheetVisible: false,
    skillSheetVisible: false,
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
    selectingDirectionId: "",
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
    traceConversation("onLoad", {
      options: options || {}
    });
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
    const visibleQuickReplies = filterQuickReplies(this.data.quickReplies);
    if (visibleQuickReplies.length !== this.data.quickReplies.length) {
      this.setData({
        quickReplies: visibleQuickReplies
      });
    }
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
      projectSheetVisible: false,
      skillSheetVisible: false
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

    const openInitialScene = (user = {}, opportunityState = {}) => {
      const initialScene = resolveBootstrapScene(options.scene || "home", user, opportunityState);
      const target = options.target || "";
      const initialUserText = options.userText ? safeDecode(options.userText) : "";

      traceConversation("openInitialScene", {
        requestedScene: options.scene || "home",
        resolvedScene: initialScene,
        loggedIn: !!(user && user.loggedIn),
        loginMode: String((user && user.loginMode) || "").trim()
      });

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
        const opportunityState = (payload && payload.opportunityState) || {};
        const opportunityWorkspaceSummary = (payload && payload.opportunityWorkspaceSummary) || {};
        this.setData({
          projects: Array.isArray(payload && payload.projects) ? payload.projects : [],
          tools: Array.isArray(payload && payload.tools) ? payload.tools : [],
          recentChats: Array.isArray(payload && payload.recentChats) ? payload.recentChats : [],
          assetInventoryStatus,
          opportunityState,
          opportunityWorkspaceSummary,
          bootLoading: false,
          bootError: false
        });

        const openedScene = openInitialScene(mergedUser, opportunityState);
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
          opportunityState: {},
          opportunityWorkspaceSummary: {},
          bootLoading: false,
          bootError: true
        });

        const openedScene = openInitialScene(fallbackUser, {});
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
          recentChats: Array.isArray(payload && payload.recentChats) ? payload.recentChats : [],
          opportunityState: (payload && payload.opportunityState) || {},
          opportunityWorkspaceSummary: (payload && payload.opportunityWorkspaceSummary) || {}
        });
      })
      .catch(() => undefined);
  },

  syncSceneMeta(scene, messages) {
    const app = getApp();
    const quickReplies = filterQuickReplies(scene.quickReplies);

    app.setCurrentAgent(scene.agentKey);

    this.setData({
      sceneKey: scene.key,
      agentKey: scene.agentKey,
      currentAgentId: scene.agentKey,
      agentColor: scene.agent.color,
      activeToolKey: resolveActiveToolKey(scene.key, this.data.pendingToolTarget),
      quickReplies,
      introQuickRepliesInline: shouldInlineIntroQuickReplies(scene.key, messages, quickReplies),
      inputPlaceholder: scene.inputPlaceholder || "\u8f93\u5165\u6d88\u606f...",
      allowInput: scene.allowInput !== false,
      messages,
      scrollIntoView: messages.length ? `msg-${messages[messages.length - 1]._uid}` : ""
    });

    this.syncDailyTaskCard(scene.key);
  },

  syncDailyTaskCard(sceneKey) {
    if (sceneKey !== "home" && sceneKey !== "phase2_opportunity_hub") {
      this.currentDailyTaskSyncKey = "";
      return;
    }

    if (!this.data.messages.some((message) => message.type === "task_card")) {
      this.currentDailyTaskSyncKey = "";
      return;
    }

    const syncKey = `daily-task-${Date.now()}`;
    this.currentDailyTaskSyncKey = syncKey;

    fetchDailyTasks()
      .then((taskPayload) => {
        if (
          this.currentDailyTaskSyncKey !== syncKey ||
          (this.data.sceneKey !== "home" && this.data.sceneKey !== "phase2_opportunity_hub")
        ) {
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
        title: taskPayload.title || message.title || "一树帮你推动",
        items: normalizeTaskItems(Array.isArray(taskPayload.items) ? taskPayload.items : message.items)
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

          const nextStatus = updates.status || (updates.done ? "completed" : item.status);
          return {
            ...item,
            ...updates,
            status: nextStatus,
            statusLabel: updates.statusLabel || resolveTaskStatusLabel(nextStatus),
            actions: updates.actions || buildTaskActions(nextStatus)
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

  async watchAssetReportStream(reportStreamId, sessionId = "") {
    const streamId = String(reportStreamId || "").trim();
    if (!streamId) {
      if (sessionId) {
        this.watchAssetReportStatus(sessionId);
      }
      return;
    }

    const streamMessageId = `asset-report-stream-${Date.now()}`;
    const streamJobKey = `asset-report-job-${Date.now()}`;
    this.currentStreamJobKey = streamJobKey;
    this.currentStreamId = streamId;
    this.appendMessages([{
      id: streamMessageId,
      type: "agent",
      text: "资产报告生成中...",
      agentKey: "asset",
      uiMode: "processing"
    }], []);
    this.setData({
      isStreaming: true
    });

    const events = [];
    const accumulator = { text: "" };
    try {
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
      }, {
        maxRounds: 3000
      });

      const folded = foldRouterStreamEvents(events);
      const cardMessages = Array.isArray(folded.cards) && folded.cards.length
        ? cardsToMessages(folded.cards)
        : [];
      const finalText = (hasAssetReportArtifactCard(cardMessages) || hasFinalReportCreatedEvent(events))
        ? ASSET_REPORT_READY_TEXT
        : (folded.content || accumulator.text);
      if (finalText) {
        this.patchMessageText(streamMessageId, finalText);
      }
      if (cardMessages.length) {
        this.appendMessages(cardMessages, this.data.quickReplies);
      }
      if (folded.error) {
        this.patchMessageText(streamMessageId, `资产报告生成失败：${folded.error}`);
      }
      if (sessionId) {
        fetchRouterSession(sessionId)
          .then((snapshot) => {
            this.bindRouterSession(snapshot, {
              includeMessages: false,
              includeQuickReplies: false
            });
          })
          .catch(() => {});
      }
    } catch (error) {
      this.patchMessageText(streamMessageId, resolveUiErrorMessage(error, "资产报告生成失败，请稍后重试"));
      if (sessionId) {
        this.watchAssetReportStatus(sessionId);
      }
    } finally {
      if (this.currentStreamJobKey === streamJobKey) {
        this.currentStreamJobKey = "";
        this.currentStreamId = "";
      }
      this.setData({
        isStreaming: false
      });
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
        quickReplies: filterQuickReplies(snapshot.quickReplies)
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

  async runRouterActionSse(input = {}, options = {}) {
    const userLabel = String(options.userLabel || "").trim();
    const showUserMessage = options.showUserMessage !== false;
    const silentFailure = options.silentFailure === true;
    const showProcessingMessage = options.showProcessingMessage !== false;
    const streamMessageId = `router-stream-${Date.now()}`;
    const optimisticUserMessageId = showUserMessage && userLabel ? `user-${Date.now()}-${Math.random()}` : "";
    const clientMessageId = optimisticUserMessageId || `client-${Date.now()}-${Math.random()}`;
    const streamJobKey = `router-sse-job-${Date.now()}`;
    this.currentStreamJobKey = streamJobKey;
    this.sseMessageTextStarted = false;

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
    this.appendMessages(optimistic, []);
    if (!showProcessingMessage) {
      this.removeMessagesByIds([streamMessageId]);
    }

    this.setData({
      isStreaming: true,
      routerErrorMessage: "",
      inputPlaceholder: "和一树继续聊…"
    });

    try {
      const stream = startRouterMessageStream(
        this.data.conversationStateId,
        {
          clientMessageId,
          input
        },
        {
          onEvent: (event) => {
            this.handleRouterSseEvent(event, {
              streamMessageId,
              streamJobKey
            });
          }
        }
      );
      this.currentSseRequest = stream;
      await stream.promise;
      this.flushSseTextDeltas();
      this.currentSseRequest = null;
      this.currentStreamJobKey = "";
      this.currentStreamId = "";
      this.lastRouterActionPayload = null;
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
      this.refreshSidebarData();
      return true;
    } catch (error) {
      this.flushSseTextDeltas();
      this.currentSseRequest = null;
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
        quickReplies: filterQuickReplies(withRetryQuickReply(this.data.quickReplies))
      });
      return false;
    }
  },

  beginAssetReportProgressUi(context = {}) {
    const wasActive = !!this.assetReportProgressActive;
    this.assetReportProgressActive = true;
    if (!this.assetReportProgressStartedAt) {
      this.assetReportProgressStartedAt = Date.now();
    }
    this.suppressAssetReportStreamText = true;
    this.assetReportSuppressedTextLogged = false;
    if (this.assetReportFinalFlushTimer) {
      clearTimeout(this.assetReportFinalFlushTimer);
      this.assetReportFinalFlushTimer = null;
    }
    if (context.streamMessageId) {
      this.removeMessagesByIds([context.streamMessageId]);
    }
    return !wasActive;
  },

  canRenderAssetFinalReportNow() {
    if (!this.assetReportProgressActive) {
      return false;
    }
    if (!this.assetReportProgressCompleted) {
      return false;
    }
    const startedAt = Number(this.assetReportProgressStartedAt || 0);
    return !startedAt || Date.now() - startedAt >= ASSET_PROGRESS_MIN_VISIBLE_MS;
  },

  schedulePendingAssetFinalReportFlush(reason = "scheduled", delayMs) {
    if (!this.pendingAssetFinalReport) {
      return false;
    }
    if (this.assetReportFinalFlushTimer) {
      clearTimeout(this.assetReportFinalFlushTimer);
      this.assetReportFinalFlushTimer = null;
    }
    const startedAt = Number(this.assetReportProgressStartedAt || 0);
    const minDelay = startedAt
      ? Math.max(0, ASSET_PROGRESS_MIN_VISIBLE_MS - (Date.now() - startedAt))
      : ASSET_PROGRESS_MIN_VISIBLE_MS;
    const nextDelay = typeof delayMs === "number" ? Math.max(0, delayMs) : minDelay;
    if (nextDelay <= 0) {
      return this.flushPendingAssetFinalReport(reason);
    }
    this.assetReportFinalFlushTimer = setTimeout(() => {
      this.assetReportFinalFlushTimer = null;
      this.flushPendingAssetFinalReport(reason);
    }, nextDelay);
    return true;
  },

  flushPendingAssetFinalReport(reason = "flush") {
    const pending = this.pendingAssetFinalReport;
    if (!pending) {
      this.resetAssetReportStreamUiState();
      return false;
    }
    this.pendingAssetFinalReport = null;
    if (this.assetReportFinalFlushTimer) {
      clearTimeout(this.assetReportFinalFlushTimer);
      this.assetReportFinalFlushTimer = null;
    }
    traceConversation("asset-report-progress:flush-final-report", {
      reason,
      replaceMessageId: pending.replaceMessageId || ""
    });
    this.removeAssetProgressCards();
    this.appendFinalReportMessage(pending.message || {}, {
      replaceMessageId: pending.replaceMessageId || ""
    });
    this.resetAssetReportStreamUiState();
    return true;
  },

  resetAssetReportStreamUiState() {
    this.assetReportProgressActive = false;
    this.assetReportProgressCompleted = false;
    this.assetReportProgressStartedAt = 0;
    this.suppressAssetReportStreamText = false;
    this.assetReportSuppressedTextLogged = false;
  },

  traceAssetReportSuppressedText(kind, length = 0) {
    if (this.assetReportSuppressedTextLogged) {
      return;
    }
    this.assetReportSuppressedTextLogged = true;
    traceConversation("asset-report-progress:suppress-report-text", {
      kind,
      length
    });
  },

  removeAssetProgressCards() {
    const ids = this.data.messages
      .filter((message) => message && message.type === "asset_report_progress")
      .map((message) => message.id || message.cardId)
      .filter(Boolean);
    if (ids.length) {
      this.removeMessagesByIds(ids);
    }
  },

  handleRouterStreamControlEvent(event, context = {}) {
    if (!event || typeof event !== "object" || context.streamJobKey !== this.currentStreamJobKey) {
      return false;
    }
    const eventName = resolveRouterStreamEventName(event);
    const data = getRouterStreamEventData(event);
    if (data.stream_id) {
      this.currentStreamId = String(data.stream_id);
    }

    if (eventName === "card.created" && data.card_type === "asset_report_progress") {
      this.beginAssetReportProgressUi(context);
      this.assetReportProgressCompleted = false;
      traceConversation("asset-report-progress:card.created", {
        cardId: data.card_id || "",
        streamId: data.stream_id || this.currentStreamId || "",
        progress: data.data && data.data.progress,
        status: data.data && data.data.status
      });
      this.upsertAssetProgressCard(data.card_id, data.data || {});
      return true;
    }
    if (eventName === "card.created") {
      const normalized = normalizeCardPayload({
        ...(data.data || {}),
        cardType: data.card_type || (data.data && (data.data.cardType || data.data.card_type)) || "artifact_card"
      });
      if (normalized) {
        const cardId = String(data.card_id || normalized.id || `card-${Date.now()}`);
        this.appendMessages([{
          ...normalized,
          id: cardId,
          cardId,
          messageId: data.message_id || ""
        }], this.data.quickReplies);
      }
      return true;
    }
    if (eventName === "card.patch") {
      if (isAssetProgressControlData(data) && !this.assetReportProgressActive) {
        this.beginAssetReportProgressUi(context);
        this.assetReportProgressCompleted = false;
      }
      traceConversation("asset-report-progress:card.patch", {
        cardId: data.card_id || "",
        streamId: data.stream_id || this.currentStreamId || "",
        progress: data.patch && data.patch.progress,
        status: data.patch && data.patch.status,
        currentStep: data.patch && data.patch.current_step
      });
      this.patchAssetProgressCard(data.card_id, data.patch || {});
      return true;
    }
    if (eventName === "card.completed") {
      const completedData = data.data || { status: "completed", progress: 100 };
      if (isAssetProgressControlData(data) && !this.assetReportProgressActive) {
        this.beginAssetReportProgressUi(context);
      }
      this.assetReportProgressCompleted = true;
      traceConversation("asset-report-progress:card.completed", {
        cardId: data.card_id || "",
        streamId: data.stream_id || this.currentStreamId || "",
        progress: completedData.progress,
        status: completedData.status
      });
      this.patchAssetProgressCard(data.card_id, completedData);
      this.schedulePendingAssetFinalReportFlush("card.completed");
      return true;
    }
    if (eventName === "final_report.created") {
      if (isAssetFinalReportEventData(data) && !this.canRenderAssetFinalReportNow()) {
        this.pendingAssetFinalReport = {
          message: data.message || {},
          replaceMessageId: context.streamMessageId || ""
        };
        traceConversation("asset-report-progress:defer-final-report", {
          streamId: data.stream_id || this.currentStreamId || "",
          active: !!this.assetReportProgressActive,
          completed: !!this.assetReportProgressCompleted
        });
        if (this.assetReportProgressCompleted) {
          this.schedulePendingAssetFinalReportFlush("final_report.created");
        } else if (!this.assetReportProgressActive) {
          this.schedulePendingAssetFinalReportFlush("safety", 1200);
        }
        return true;
      }
      this.removeAssetProgressCards();
      this.appendFinalReportMessage(data.message || {}, {
        replaceMessageId: context.streamMessageId
      });
      this.resetAssetReportStreamUiState();
      return true;
    }
    if (eventName === "stream.done") {
      this.flushPendingAssetFinalReport("stream.done");
      return false;
    }
    return false;
  },

  handleRouterSseEvent(event, context = {}) {
    if (!event || !event.event || context.streamJobKey !== this.currentStreamJobKey) {
      return;
    }
    const data = event.data || {};
    if (data.stream_id) {
      this.currentStreamId = String(data.stream_id);
    }
    if (event.event === "assistant.text.delta") {
      if (this.suppressAssetReportStreamText) {
        this.traceAssetReportSuppressedText("assistant.text.delta", String(data.delta || "").length);
        return;
      }
      if (!this.sseMessageTextStarted) {
        this.sseMessageTextStarted = true;
        this.patchMessageText(context.streamMessageId, "");
      }
      this.queueSseTextDelta(context.streamMessageId, data.delta || "");
      return;
    }
    if (event.event === "assistant.text.done" && data.content) {
      if (this.suppressAssetReportStreamText) {
        this.traceAssetReportSuppressedText("assistant.text.done", String(data.content || "").length);
        return;
      }
      this.queueSseFinalText(context.streamMessageId, String(data.content));
      return;
    }
    if (this.handleRouterStreamControlEvent(event, context)) {
      return;
    }
    if (event.event === "stream.error") {
      const lastCard = this.data.messages
        .slice()
        .reverse()
        .find((message) => message.type === "asset_report_progress");
      if (lastCard) {
        this.patchAssetProgressCard(lastCard.cardId, {
          status: "failed"
        });
      }
    }
  },

  queueSseTextDelta(messageId, delta) {
    const text = String(delta || "");
    if (!text) {
      return;
    }
    this.sseTextBuffers = this.sseTextBuffers || {};
    this.sseTextBuffers[messageId] = `${this.sseTextBuffers[messageId] || ""}${text}`;
    if (this.sseTextFlushTimer) {
      return;
    }
    this.sseTextFlushTimer = setTimeout(() => {
      this.flushSseTextDeltas();
    }, STREAM_TYPEWRITER_INTERVAL_MS);
  },

  queueSseFinalText(messageId, content) {
    const finalText = String(content || "");
    if (!finalText) {
      return;
    }
    this.sseFinalTexts = this.sseFinalTexts || {};
    this.sseTextBuffers = this.sseTextBuffers || {};
    const currentMessage = (this.data.messages || []).find((message) => message.id === messageId) || {};
    const visible = String(currentMessage.text || "");
    const pending = String(this.sseTextBuffers[messageId] || "");
    const displayedOrQueued = `${visible}${pending}`;
    const tail = finalText.startsWith(displayedOrQueued)
      ? finalText.slice(displayedOrQueued.length)
      : finalText;
    this.sseFinalTexts[messageId] = finalText;
    if (tail) {
      this.queueSseTextDelta(messageId, tail);
      return;
    }
    if (!pending) {
      this.patchMessageText(messageId, finalText);
      delete this.sseFinalTexts[messageId];
    }
  },

  flushSseTextDeltas(force = false) {
    if (this.sseTextFlushTimer) {
      clearTimeout(this.sseTextFlushTimer);
      this.sseTextFlushTimer = null;
    }
    const buffers = this.sseTextBuffers || {};
    const ids = Object.keys(buffers).filter((id) => buffers[id]);
    if (!ids.length) {
      return;
    }
    const nextMessages = this.data.messages.map((message) => {
      if (!ids.includes(String(message.id))) {
        return message;
      }
      const { chunk, rest } = takeTypewriterChunk(buffers[message.id] || "", force);
      buffers[message.id] = rest;
      const finalText = this.sseFinalTexts && this.sseFinalTexts[message.id];
      const nextText = `${message.text || ""}${chunk}`;
      const shouldUseFinal = finalText && !rest && (force || nextText.length >= String(finalText).length);
      if (shouldUseFinal && this.sseFinalTexts) {
        delete this.sseFinalTexts[message.id];
      }
      return {
        ...message,
        text: shouldUseFinal ? String(finalText) : nextText,
        uiMode: ""
      };
    });
    this.sseTextBuffers = buffers;
    this.setData({
      messages: nextMessages,
      scrollIntoView: nextMessages.length ? `msg-${nextMessages[nextMessages.length - 1]._uid}` : this.data.scrollIntoView
    });
    const hasRemaining = Object.keys(this.sseTextBuffers || {}).some((id) => this.sseTextBuffers[id]);
    if (hasRemaining && !this.sseTextFlushTimer) {
      this.sseTextFlushTimer = setTimeout(() => {
        this.flushSseTextDeltas();
      }, STREAM_TYPEWRITER_INTERVAL_MS);
    }
  },

  upsertAssetProgressCard(cardId, data = {}) {
    const id = String(cardId || `asset-progress-${Date.now()}`);
    const exists = this.data.messages.some((message) => message.type === "asset_report_progress" && message.cardId === id);
    if (!exists) {
      this.appendMessages([{
        id,
        type: "asset_report_progress",
        cardId: id,
        data
      }], []);
      return;
    }
    this.patchAssetProgressCard(id, data);
  },

  patchAssetProgressCard(cardId, patch = {}) {
    const id = String(cardId || "");
    if (!id) {
      return;
    }
    let matched = false;
    let targetUid = "";
    const nextMessages = this.data.messages.map((message) => {
      if (message.type !== "asset_report_progress" || message.cardId !== id) {
        return message;
      }
      matched = true;
      targetUid = message._uid || message.id || id;
      const nextData = patch && patch.status && !patch.patch
        ? { ...(message.data || {}), ...patch }
        : { ...(message.data || {}), ...patch };
      return {
        ...message,
        data: nextData
      };
    });
    if (!matched) {
      traceConversation("asset-report-progress:patch-created-missing-card", {
        cardId: id,
        progress: patch && patch.progress,
        status: patch && patch.status,
        currentStep: patch && patch.current_step
      });
      this.upsertAssetProgressCard(id, patch || {});
      return;
    }
    this.setData({
      messages: nextMessages,
      scrollIntoView: targetUid ? `msg-${targetUid}` : this.data.scrollIntoView
    });
  },

  appendFinalReportMessage(message = {}, options = {}) {
    const segments = Array.isArray(message.segments) ? message.segments : [];
    const nextMessages = [];
    let finalText = "";
    segments.forEach((segment) => {
      if (!segment || typeof segment !== "object") {
        return;
      }
      if (segment.type === "text" && segment.content) {
        finalText = finalText
          ? `${finalText}\n\n${String(segment.content)}`
          : String(segment.content);
      }
      if (segment.type === "card") {
        const normalized = normalizeCardPayload({
          ...(segment.data || {}),
          cardType: segment.card_type || segment.cardType || "asset_radar"
        });
        if (normalized) {
          nextMessages.push(normalized);
        }
      }
    });
    if (finalText) {
      const replaceMessageId = String(options.replaceMessageId || "").trim();
      const hasReplaceTarget = replaceMessageId && this.data.messages.some((messageItem) => messageItem.id === replaceMessageId);
      if (hasReplaceTarget) {
        if (this.sseTextBuffers) {
          delete this.sseTextBuffers[replaceMessageId];
        }
        if (this.sseFinalTexts) {
          delete this.sseFinalTexts[replaceMessageId];
        }
        this.patchMessageText(replaceMessageId, finalText);
      } else {
        nextMessages.unshift(buildAgentMessage(finalText));
      }
    }
    if (nextMessages.length) {
      this.appendMessages(nextMessages, []);
    }
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

    if (options.useLegacyStream !== true) {
      return this.runRouterActionSse(input, options);
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
      const cardMessages = Array.isArray(folded.cards) && folded.cards.length
        ? cardsToMessages(folded.cards)
        : [];
      const finalText = (hasAssetReportArtifactCard(cardMessages) || hasFinalReportCreatedEvent(events))
        ? ASSET_REPORT_READY_TEXT
        : (folded.content || streamedText);
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

      if (cardMessages.length) {
        this.appendMessages(cardMessages, this.data.quickReplies);
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
        if (streamResult.assetReportStreamId) {
          this.watchAssetReportStream(streamResult.assetReportStreamId, this.data.conversationStateId);
        } else {
          this.watchAssetReportStatus(this.data.conversationStateId);
        }
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
        quickReplies: filterQuickReplies(withRetryQuickReply(this.data.quickReplies))
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
    const routeMetadata = parseRouteMetadata(options.metadata);
    await this.runRouterAction({
      inputType: "system_event",
      text: userText,
      routeAction,
      metadata: {
        source: "initial_route_action",
        scene: options.scene || "",
        target: options.target ? safeDecode(options.target) : "",
        ...routeMetadata
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
      target: target || this.data.pendingToolTarget,
      opportunityState: this.data.opportunityState,
      opportunityWorkspaceSummary: this.data.opportunityWorkspaceSummary
    };
  },

  getPreferredHomeScene() {
    return resolvePreferredHomeScene(this.data.user, this.data.opportunityState);
  },

  replacePreferredHomeScene(context = {}) {
    this.replaceScene(this.getPreferredHomeScene(), context);
  },

  appendPreferredHomeScene(options = {}) {
    const preferredScene = this.getPreferredHomeScene();
    if (this.data.sceneKey !== preferredScene) {
      this.appendScene(preferredScene, options);
      return;
    }

    this.replaceScene(preferredScene, {
      target: options.target || ""
    });
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
      quickReplies: filterQuickReplies(Array.isArray(remoteScene.quickReplies) ? remoteScene.quickReplies : (fallbackScene.quickReplies || [])),
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

    traceConversation("replaceScene", {
      from: this.data.sceneKey || "",
      to: sceneKey,
      target,
      loggedIn: !!(this.data.user && this.data.user.loggedIn),
      shouldResetRouterSession
    });

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
    const combined = dedupeAssetReportArtifactCards(this.data.messages.concat(stampMessages(messages)));
    const mergedMessages = combined.length > MAX_VISIBLE_MESSAGES
      ? combined.slice(combined.length - MAX_VISIBLE_MESSAGES)
      : combined;
    const quickReplies = filterQuickReplies(nextQuickReplies);

    this.setData({
      messages: mergedMessages,
      quickReplies,
      introQuickRepliesInline: shouldInlineIntroQuickReplies(this.data.sceneKey, mergedMessages, quickReplies),
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
        userAvatarUrl: user.avatarUrl || ""
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
    if (this.currentSseRequest && typeof this.currentSseRequest.abort === "function") {
      this.currentSseRequest.abort();
      this.currentSseRequest = null;
    }
    this.flushSseTextDeltas && this.flushSseTextDeltas(true);
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

  async pollStreamEvents(streamId, streamJobKey, poller = pollChatStream, onChunk, options = {}) {
    const events = [];
    let done = false;
    // 240 轮 × 120ms ≈ 31 秒,撞上"会话自愈重试"场景就会被腰斩:第一次 Dify 调用
    // 挂了 1 秒(404 Conversation Not Exists),后端清缓存重发,第二次又要走完整
    // R1 推理(普遍 25-50 秒),前端 31 秒一刀切就显示"暂时没有返回内容",其实
    // 后端 worker 还在跑。放宽到 720 轮(~94 秒),给"慢模型 + 一次自愈"留余量。
    const maxRounds = Math.max(1, Number(options.maxRounds || 720));

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
    let pendingText = "";

    const flushPendingText = async (force = false) => {
      while (pendingText && streamJobKey === this.currentStreamJobKey) {
        const { chunk, rest } = takeTypewriterChunk(pendingText, force);
        pendingText = rest;
        accumulatedText += chunk;
        this.patchMessageText(streamMessageId, accumulatedText);
        if (!force && pendingText) {
          await sleep(STREAM_TYPEWRITER_INTERVAL_MS);
        }
      }
    };

    for (let index = 0; index < events.length; index += 1) {
      if (streamJobKey !== this.currentStreamJobKey) {
        return accumulatedText;
      }

      const event = events[index];
      if (!event || typeof event !== "object") {
        continue;
      }

      if (this.handleRouterStreamControlEvent(event, {
        streamMessageId,
        streamJobKey
      })) {
        continue;
      }

      if (event.type === "token") {
        if (this.suppressAssetReportStreamText) {
          this.traceAssetReportSuppressedText("token", String(event.token || event.delta || event.content || "").length);
          continue;
        }
        pendingText += event.token || event.delta || event.content || "";
        await flushPendingText(false);
      }

      if (event.type === "message" && event.message && event.message.text) {
        if (this.suppressAssetReportStreamText) {
          this.traceAssetReportSuppressedText("message", String(event.message.text || "").length);
          continue;
        }
        await flushPendingText(true);
        accumulatedText = String(event.message.text);
        this.patchMessageText(streamMessageId, accumulatedText);
      }
    }

    await flushPendingText(true);
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
      skillSheetVisible: false,
      sidebarVisible: true
    });
  },

  handleAgentTap() {
    this.setData({
      sidebarVisible: false,
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
    const key = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.key) || "").trim();
    const disabledValue = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.disabled
      : false;
    const disabled = disabledValue === true || disabledValue === "true";

    this.setData({
      agentMenuVisible: false
    });

    if (!key) {
      return;
    }

    if (disabled) {
      this.showComingSoonNotice(AGENT_COMING_SOON_TIP, key);
      this.notifyComingSoonSubscriptionHook(key, {
        entry: "agent_menu"
      });
      return;
    }

    const targetScene = key === "master"
      ? this.getPreferredHomeScene()
      : (AGENT_SCENE_MAP[key] || this.getPreferredHomeScene());
    if (key === this.data.agentKey && this.data.sceneKey === targetScene) {
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

    const detail = (event && event.detail) || {};
    const dataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
    const id = detail.id || dataset.id || "";
    if (!id) {
      return;
    }

    this.setData({
      sidebarVisible: false,
      projectSheetVisible: false,
      skillSheetVisible: false
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
                  scene: payload.scene,
                  ...((payload && payload.metadata) || {})
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
    const hasAccessToken = !!String(getAccessToken() || "").trim();
    if (!this.isUserLoggedIn() && !hasAccessToken) {
      this.promptLoginRequired();
      return;
    }

    const detail = (event && event.detail) || {};
    const conversationId = String(
      detail.id || detail.conversationId || detail.sessionId || ""
    ).trim();
    if (!conversationId) {
      wx.showToast({
        title: "历史会话缺少 ID，请刷新后重试",
        icon: "none"
      });
      return;
    }

    this.setData({
      sidebarVisible: false
    });

    this.stopStreaming();
    this.currentSceneHydrationKey = "";

    const routerSessionId = parseRouterSessionIdFromConversationId(conversationId);

    wx.showLoading({
      title: "加载中..."
    });

    const finalize = () => {
      wx.hideLoading();
    };

    const restoreLegacyConversation = (historySnapshot = null, fallbackError = null) => {
      const normalizedSceneKey = String(
        (historySnapshot && historySnapshot.sceneKey) || resolveRecentScene(conversationId) || "home"
      ).trim() || "home";
      const localScene = this.getLocalScene(normalizedSceneKey);
      const sceneMessages = stampMessages(Array.isArray(localScene.messages) ? localScene.messages : []);
      const hasHistory = !!(historySnapshot && Array.isArray(historySnapshot.messages) && historySnapshot.messages.length);
      const historyMessages = hasHistory
        ? stampMessages(historySnapshot.messages)
        : [];
      const mergedMessages = historyMessages.length
        ? historyMessages
        : sceneMessages.concat(
          stampMessages([
            buildAgentMessage("已切换到这条历史会话。继续输入会沿用该会话上下文。")
          ])
        );

      this.data.pendingToolTarget = "";
      this.syncSceneMeta(localScene, mergedMessages);
      this.setData({
        pendingToolTarget: "",
        activeConversationId: conversationId,
        conversationStateId: "",
        routeMode: "guided",
        activeChatflowId: "",
        pendingQuickReplyAction: "",
        routerErrorMessage: "",
        quickReplies: []
      });

      if (!hasHistory && fallbackError) {
        wx.showToast({
          title: "历史消息未加载，已切换会话",
          icon: "none"
        });
      }
    };

    if (!routerSessionId) {
      fetchConversationHistory(conversationId)
        .then((historySnapshot) => {
          restoreLegacyConversation(historySnapshot);
        })
        .catch((error) => {
          restoreLegacyConversation(null, error);
        })
        .finally(finalize);
      return;
    }

    fetchRouterSession(routerSessionId)
      .then((snapshot) => {
        if (!snapshot || !snapshot.sessionId) {
          throw new Error("router_session_not_found");
        }

        const targetSceneKey = AGENT_SCENE_MAP[snapshot.agentKey] || "home";
        const activeToolKey = resolveActiveToolKey(targetSceneKey, "");

        this.setData({
          sceneKey: targetSceneKey,
          pendingToolTarget: "",
          activeToolKey,
          messages: [],
          quickReplies: [],
          activeConversationId: conversationId,
          conversationStateId: snapshot.sessionId,
          routerErrorMessage: "",
          routeMode: snapshot.routeMode || this.data.routeMode,
          activeChatflowId: snapshot.activeChatflowId || snapshot.chatflowId || this.data.activeChatflowId,
          pendingQuickReplyAction: "",
          inputPlaceholder: "和一树继续聊..."
        });

        this.bindRouterSession(snapshot, {
          includeMessages: true,
          includeQuickReplies: true
        });
      })
      .catch(async () => {
        try {
          const historySnapshot = await fetchConversationHistory(conversationId);
          restoreLegacyConversation(historySnapshot);
        } catch (error) {
          restoreLegacyConversation(null, error);
        }
      })
      .finally(finalize);
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

    this.replacePreferredHomeScene();
  },

  handlePlusTap() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      skillSheetVisible: false,
      projectSheetVisible: true
    });
  },

  handleProjectSheetClose() {
    this.setData({
      projectSheetVisible: false
    });
  },

  handleSkillTap() {
    this.setData({
      projectSheetVisible: false,
      sidebarVisible: false,
      agentMenuVisible: false,
      skillSheetVisible: true
    });
  },

  handleSkillSheetClose() {
    this.setData({
      skillSheetVisible: false
    });
  },

  async handleSkillSelect(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const key = String((event && event.detail && event.detail.key) || "").trim();
    const skill = findSkillByKey(key);
    if (!skill || !skill.routeAction) {
      wx.showToast({
        title: "这个 Skill 暂时不可用",
        icon: "none"
      });
      return;
    }

    this.setData({
      skillSheetVisible: false,
      projectSheetVisible: false,
      sidebarVisible: false,
      agentMenuVisible: false
    });

    const ready = await this.ensureRouterSession();
    if (!ready || !this.data.conversationStateId) {
      wx.showToast({
        title: "对话初始化失败，请稍后重试",
        icon: "none"
      });
      return;
    }

    await this.runRouterAction({
      inputType: "system_event",
      text: `使用 Skill：${skill.title}`,
      routeAction: skill.routeAction,
      metadata: {
        source: "skill_panel",
        skillKey: skill.key,
        skillTitle: skill.title
      }
    }, {
      userLabel: `使用 Skill：${skill.title}`,
      loadingText: `一树正在打开 ${skill.title}`
    });
  },

  async handleProjectCreate() {
    if (!this.ensureLoggedIn()) {
      return;
    }

    this.setData({
      projectSheetVisible: false,
      skillSheetVisible: false,
      sidebarVisible: false,
      agentMenuVisible: false
    });

    this.replaceScene("phase2_opportunity_hub");
    await this.ensureRouterAgent("asset");
    return;

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
        skillSheetVisible: false,
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

  async applySuccessfulLogin(loginResult = {}, options = {}) {
    const isFreshLogin = options.isFreshLogin === true;
    const nextScene = String(options.nextScene || "onboarding_route").trim() || "onboarding_route";
    const traceLabel = String(options.traceLabel || "applySuccessfulLogin").trim();
    const nextUser = loginResult && loginResult.user ? loginResult.user : {};
    const mergedUser = {
      ...this.data.user,
      ...nextUser
    };
    const bootstrapResult = await fetchBootstrap().catch(() => null);
    const resolvedUser = (bootstrapResult && bootstrapResult.user) || mergedUser;
    const nextOpportunityState = (bootstrapResult && bootstrapResult.opportunityState) || {};
    const nextOpportunityWorkspaceSummary = (bootstrapResult && bootstrapResult.opportunityWorkspaceSummary) || {};

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
        : (isFreshLogin ? [] : this.data.recentChats),
      opportunityState: nextOpportunityState,
      opportunityWorkspaceSummary: nextOpportunityWorkspaceSummary
    });
    setToolGuideSeen(getApp(), true);
    await this.initializeRouterSession({
      forceNew: true,
      includeMessages: false
    });
    traceConversation(`${traceLabel}:success`, {
      sceneBeforeReplace: this.data.sceneKey || "",
      loggedIn: !!(resolvedUser && resolvedUser.loggedIn),
      loginMode: String((resolvedUser && resolvedUser.loginMode) || "").trim(),
      nextScene
    });
    this.replaceScene(nextScene);
  },

  async performWechatLogin(loginOptions = {}) {
    if (this.loginPending) {
      return;
    }

    this.loginPending = true;

    try {
      const loginResult = await loginByWechat(loginOptions);
      await this.applySuccessfulLogin(loginResult, {
        isFreshLogin: loginOptions.simulateFreshUser === true,
        nextScene: "onboarding_route",
        traceLabel: "performWechatLogin"
      });
    } catch (error) {
      traceConversation("performWechatLogin:error", {
        message: String((error && error.message) || "").trim()
      });
      reportClientError({
        message: "wechat_login_failed",
        route: resolveCurrentRoute(),
        level: "warn",
        context: {
          message: String((error && error.message) || "").trim()
        }
      });
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

  async handleLoginSuccess(event) {
    if (this.loginPending) {
      return;
    }

    const detail = (event && event.detail) || {};
    const loginMethod = String(detail.loginMethod || "phone").trim();

    this.loginPending = true;

    try {
      await this.applySuccessfulLogin(detail.loginResult || {}, {
        nextScene: "onboarding_route",
        traceLabel: `perform${loginMethod === "sms" ? "Sms" : "Phone"}Login`
      });
    } catch (error) {
      traceConversation("handleLoginSuccess:error", {
        loginMethod,
        message: String((error && error.message) || "").trim()
      });
      reportClientError({
        message: "login_success_bootstrap_failed",
        route: resolveCurrentRoute(),
        level: "warn",
        context: {
          loginMethod,
          message: String((error && error.message) || "").trim()
        }
      });
      wx.showToast({
        title: resolveUiErrorMessage(error, "登录成功后初始化失败，请重试"),
        icon: "none"
      });
    } finally {
      this.loginPending = false;
    }
  },

  handleSmsLoginTap() {
    wx.navigateTo({
      url: "/pages/phone-login/phone-login",
      events: {
        phoneLoginSuccess: (detail = {}) => {
          this.handleLoginSuccess({
            detail: {
              loginResult: detail.loginResult || {},
              loginMethod: detail.loginMethod || "sms"
            }
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: "手机号登录页打开失败",
          icon: "none"
        });
      }
    });
  },

  async handleDevFreshLoginAction(event) {
    if (!this.data.showDevFreshLogin) {
      return;
    }

    const detail = (event && event.detail) || {};
    return this.performDevFreshLogin({
      userInfo: detail.userInfo || null,
      nickname: detail.userInfo && detail.userInfo.nickName ? detail.userInfo.nickName : "",
      avatarUrl: detail.userInfo && detail.userInfo.avatarUrl ? detail.userInfo.avatarUrl : ""
    });
  },

  async handleDevOpportunityHubLoginAction(event) {
    if (!this.data.showDevFreshLogin) {
      return;
    }

    const detail = (event && event.detail) || {};
    return this.performDevFreshLogin({
      userInfo: detail.userInfo || null,
      nickname: detail.userInfo && detail.userInfo.nickName ? detail.userInfo.nickName : "",
      avatarUrl: detail.userInfo && detail.userInfo.avatarUrl ? detail.userInfo.avatarUrl : "",
      preset: "opportunity-hub"
    });
  },

  async performDevFreshLogin(loginOptions = {}) {
    if (this.loginPending) {
      return;
    }

    this.loginPending = true;

    try {
      const loginResult = await loginByDevFresh(loginOptions);
      const nextUser = loginResult && loginResult.user ? loginResult.user : {};
      const mergedUser = {
        ...this.data.user,
        ...nextUser
      };
      const bootstrapResult = await fetchBootstrap().catch(() => null);
      const resolvedUser = (bootstrapResult && bootstrapResult.user) || mergedUser;
      const nextOpportunityState = (bootstrapResult && bootstrapResult.opportunityState) || {};
      const nextOpportunityWorkspaceSummary = (bootstrapResult && bootstrapResult.opportunityWorkspaceSummary) || {};
      const nextScene = String(loginOptions.preset || "").trim() === "opportunity-hub"
        ? resolvePreferredHomeScene(resolvedUser, nextOpportunityState)
        : "onboarding_route";

      this.syncUserState(resolvedUser);
      this.setData({
        projects: Array.isArray(bootstrapResult && bootstrapResult.projects)
          ? bootstrapResult.projects
          : [],
        tools: Array.isArray(bootstrapResult && bootstrapResult.tools)
          ? bootstrapResult.tools
          : [],
        recentChats: Array.isArray(bootstrapResult && bootstrapResult.recentChats)
          ? bootstrapResult.recentChats
          : [],
        opportunityState: nextOpportunityState,
        opportunityWorkspaceSummary: nextOpportunityWorkspaceSummary
      });
      setToolGuideSeen(getApp(), true);
      await this.initializeRouterSession({
        forceNew: true,
        includeMessages: false
      });
      traceConversation("performDevFreshLogin:success", {
        sceneBeforeReplace: this.data.sceneKey || "",
        loggedIn: !!(resolvedUser && resolvedUser.loggedIn),
        loginMode: String((resolvedUser && resolvedUser.loginMode) || "").trim(),
        nextScene
      });
      this.replaceScene(nextScene);
    } catch (error) {
      traceConversation("performDevFreshLogin:error", {
        message: String((error && error.message) || "").trim()
      });
      reportClientError({
        message: "dev_fresh_login_failed",
        route: resolveCurrentRoute(),
        level: "warn",
        context: {
          message: String((error && error.message) || "").trim()
        }
      });
      wx.showToast({
        title: resolveUiErrorMessage(error, "模拟新用户登录失败，请稍后重试"),
        icon: "none"
      });
    } finally {
      this.loginPending = false;
    }
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

  async handleDailyTaskAction(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = event && event.detail ? event.detail : {};
    const item = detail.item || {};
    const actionKey = String(detail.actionKey || "").trim();
    const actionLabel = String(detail.actionLabel || "").trim();
    if (!item.id || !actionKey) {
      return;
    }

    if (actionKey === "complete") {
      await this.completeDailyTaskViaAction(item);
      return;
    }

    if (actionKey === "blocked") {
      await this.submitTaskNonCompleteAction(item, "blocked", "我卡住了");
      return;
    }

    if (actionKey === "replace") {
      await this.submitTaskNonCompleteAction(item, "replace", "换一个");
      return;
    }

    if (actionKey === "feedback") {
      this.openTaskFeedbackPrompt(item);
      return;
    }

    if (actionKey === "review") {
      const taskLabel = item.label || item.title || "这项任务";
      await this.routeTaskConversation(
        item,
        "task_review",
        `${actionLabel || "复盘任务"}：${taskLabel}`,
        {
          reviewIntent: "daily_task_review",
          expectedAgent: "execution"
        }
      );
      return;
    }

    if (actionKey === "continue") {
      await this.routeTaskConversation(item, "task_continue", `继续聊「${item.label || item.title || "这项任务"}」`);
    }
  },

  openTaskFeedbackPrompt(item = {}) {
    const taskLabel = item.label || item.title || "这项任务";
    const taskId = item.id || "";
    const promptId = `task-feedback-manual-${Date.now()}`;
    const messagesWithoutOldPrompt = this.data.messages.filter((message) => {
      const id = String((message && message.id) || "");
      return !/^task-feedback-manual-/.test(id);
    });

    if (messagesWithoutOldPrompt.length !== this.data.messages.length) {
      this.setData({
        messages: messagesWithoutOldPrompt
      });
    }

    this.appendMessages([
      {
        id: promptId,
        type: "agent",
        text: `可以。把「${taskLabel}」的真实结果、客户原话或卡点发我，我帮你判断下一步。`
      }
    ], buildTaskFeedbackQuickReplies(item));

    this.setData({
      feedbackPendingTask: taskLabel,
      feedbackPendingTaskId: taskId,
      inputPlaceholder: `补充「${taskLabel}」的结果...`
    });
  },

  async completeDailyTaskViaAction(item = {}) {
    const taskLabel = item.label || item.title || "";
    const taskId = item.id || "";
    if (!taskId || !taskLabel) {
      return;
    }

    this.patchTaskCardItem(taskId, {
      done: true,
      status: "completed"
    });

    let completeResult = null;
    try {
      completeResult = await submitDailyTaskAction(taskId, {
        action: "complete",
        value: taskLabel,
        metadata: {
          sessionId: this.data.conversationStateId || "",
          source: "daily_tasks_card"
        }
      });
    } catch (error) {
      this.patchTaskCardItem(taskId, {
        done: false,
        status: "pending"
      });
      wx.showToast({
        title: resolveUiErrorMessage(error, "任务状态同步失败"),
        icon: "none"
      });
      return;
    }

    await this.afterDailyTaskCompleted(taskId, taskLabel, completeResult);
  },

  async afterDailyTaskCompleted(taskId = "", taskLabel = "", completeResult = null) {
    const feedbackPromptId = `task-feedback-${Date.now() + 1}`;
    const opportunitySummary = completeResult && completeResult.opportunitySummary
      ? completeResult.opportunitySummary
      : null;

    this.setData({
      messages: patchOpportunitySummaryMessages(
        markTaskDoneInMessages(this.data.messages, taskId, taskLabel),
        opportunitySummary
      )
    });
    if (opportunitySummary && opportunitySummary.currentFollowupCycle) {
      this.syncDailyTaskCard(this.data.sceneKey);
    }

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
          source: "daily_task_action",
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
      feedbackPendingTaskId: taskId
    });

    try {
      const feedback = await fetchTaskFeedback({
        taskId,
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
          quickReplies: filterQuickReplies(remoteReplies)
        });
      }
    } catch (error) {
      // keep local fallback prompt
    }
  },

  async submitTaskNonCompleteAction(item = {}, action = "", fallbackLabel = "") {
    const taskId = item.id || "";
    const taskLabel = item.label || item.title || "";
    if (!taskId) {
      return;
    }

    const nextStatus = action === "blocked" ? "blocked" : (action === "replace" ? "pending" : "skipped");
    this.patchTaskCardItem(taskId, {
      status: nextStatus,
      done: false
    });

    let result = null;
    try {
      result = await submitDailyTaskAction(taskId, {
        action,
        value: fallbackLabel || taskLabel,
        metadata: {
          sessionId: this.data.conversationStateId || "",
          source: "daily_tasks_card"
        }
      });
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "任务动作提交失败"),
        icon: "none"
      });
      return;
    }

    if (result && result.task) {
      this.patchTaskCardItem(taskId, result.task);
    }

    const routerAction = result && result.routerAction ? result.routerAction : null;
    if (routerAction && routerAction.routeAction) {
      await this.routeTaskConversation(
        item,
        routerAction.routeAction,
        routerAction.userText || fallbackLabel || taskLabel,
        routerAction.metadata || {}
      );
      return;
    }

    wx.showToast({
      title: action === "blocked" ? "已记录卡点" : (action === "replace" ? "已换成新任务" : "已跳过"),
      icon: "none"
    });
  },

  async routeTaskConversation(item = {}, routeAction = "", userText = "", metadata = {}) {
    const taskLabel = item.label || item.title || "";
    const action = String(routeAction || "").trim();
    const text = String(userText || taskLabel || "").trim();
    const taskMetadata = action === "task_review"
      ? {
          reviewIntent: "daily_task_review",
          expectedAgent: "execution",
          ...metadata
        }
      : metadata;

    if (this.data.conversationStateId && action) {
      const routed = await this.runRouterAction({
        inputType: "system_event",
        text,
        routeAction: action,
        metadata: {
          source: "daily_task_action",
          taskId: item.id || "",
          taskLabel,
          ...taskMetadata
        }
      }, {
        userLabel: text,
        showUserMessage: true,
        silentFailure: true
      });
      if (routed) {
        return;
      }
    }

    if (text) {
      this.appendMessages([
        buildUserMessage(text),
        {
          id: `task-router-fallback-${Date.now()}`,
          type: "agent",
          text: action === "task_review"
            ? buildFeedbackAdvice("", taskLabel)
            : "可以。你把当前卡住的地方发我，我帮你判断下一步怎么跟。"
        }
      ], []);
    }
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

    let completeResult = null;
    try {
      completeResult = await completeTask(item.id, {
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

    const opportunitySummary = completeResult && completeResult.opportunitySummary
      ? completeResult.opportunitySummary
      : null;
    this.setData({
      messages: patchOpportunitySummaryMessages(
        markTaskDoneInMessages(this.data.messages, taskId, taskLabel),
        opportunitySummary
      )
    });
    if (opportunitySummary && opportunitySummary.currentFollowupCycle) {
      this.syncDailyTaskCard(this.data.sceneKey);
    }

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
          quickReplies: filterQuickReplies(remoteReplies)
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

  async continueAfterAssetReportCard() {
    if (this.data.isStreaming) {
      wx.showToast({
        title: "\u6b63\u5728\u8f93\u51fa\uff0c\u8bf7\u7a0d\u540e",
        icon: "none"
      });
      return;
    }

    const userText = "\u6211\u4eec\u7ee7\u7eed\u804a\u8fd9\u4efd\u8d44\u4ea7\u62a5\u544a\uff0c\u5e2e\u6211\u5224\u65ad\u4e0b\u4e00\u6b65\u8be5\u4ece\u673a\u4f1a\u3001\u83b7\u5ba2\u8fd8\u662f\u5b9a\u4ef7\u5f00\u59cb\u3002";
    const userLabel = "\u7ee7\u7eed\u804a\u62a5\u544a\u4e0b\u4e00\u6b65";

    if (this.data.conversationStateId) {
      const routed = await this.runRouterAction({
        inputType: "text",
        text: userText,
        metadata: {
          source: "asset_report_card_secondary",
          cardType: "asset_report"
        }
      }, {
        userLabel,
        showUserMessage: true,
        loadingText: "\u4e00\u6811\u6b63\u5728\u63a5\u7740\u62a5\u544a\u5f80\u4e0b\u804a..."
      });
      if (routed) {
        return;
      }
    }

    await this.appendStreamingThenReply(userText);
  },

  async handleArtifactPrimary(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = (event && event.detail) || {};
    const dataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
    const action = String(detail.action || dataset.action || "").trim();

    if (action === "continue_opportunity_deep_dive" || (!action && isOpportunityDeepDiveActive(this.data.opportunityWorkspaceSummary))) {
      await this.continueOpportunityDeepDiveFromCard();
      return;
    }

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

  async handleArtifactSecondary(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = (event && event.detail) || {};
    const dataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
    const action = String(detail.action || dataset.secondaryAction || "").trim();
    const primaryAction = String(detail.primaryAction || dataset.action || "").trim();
    const cardType = String(detail.cardType || dataset.cardType || "").trim();

    if (
      action === "continue_asset_report_chat" ||
      primaryAction === "open_asset_report" ||
      cardType === "asset_report" ||
      cardType === "asset_radar"
    ) {
      await this.continueAfterAssetReportCard();
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
    const payload = detail.payload && typeof detail.payload === "object" ? detail.payload : {};
    const sourceUrl = String(
      detail.url ||
      (item && item.primaryActionUrl) ||
      (item && item.primarySource && item.primarySource.url) ||
      (item && item.source && item.source.url) ||
      (item && item.sources && item.sources[0] && item.sources[0].url) ||
      ""
    ).trim();
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
      refresh_policy_search: "refresh_policy_search",
      start_asset_audit: "asset_radar",
      save_policy_watch: "save_policy_watch",
      flow_exit: "flow_exit",
      continue_current_flow: "continue_current_flow",
      policy_to_asset_audit: "policy_to_asset_audit",
      policy_keep_chatting: "policy_keep_chatting"
    };
    const routeAction = routeActionMap[action] || "";

    if (!this.data.conversationStateId && routeAction) {
      await this.ensureRouterSession({
        forceNew: true
      });
    }

    if (this.data.conversationStateId && routeAction) {
      const explainText = item && item.title
        ? `帮我解释这条政策：${item.title}`
        : "帮我解释这条政策";
      const routeTextMap = {
        ask_agent_explain: explainText,
        refresh_policy_search: "重新检索最新政策",
        start_asset_audit: "先盘一盘我的资产",
        save_policy_watch: "帮我加入政策关注",
        flow_exit: "切去查政策",
        continue_current_flow: "继续当前流程",
        policy_to_asset_audit: "好的，我们先盘一盘我手里有什么牌",
        policy_keep_chatting: "先聊点别的，不着急盘资产"
      };

      const routed = await this.runRouterAction({
        inputType: "system_event",
        text: routeTextMap[action] || "",
        routeAction,
        metadata: {
          source: "policy_card_action",
          action,
          policyTitle: item && item.title ? String(item.title) : "",
          policyUrl: sourceUrl,
          policySlots: payload.slots || {},
          policyQuery: payload.query || ""
        }
      }, {
        userLabel: "",
        showUserMessage: false,
        silentFailure: action !== "refresh_policy_search"
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

  handleReportPrimary(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const detail = (event && event.detail) || {};
    const action = String(detail.primaryAction || "").trim();
    const isEmptyMonthlyReport = detail.variant === "monthly" && !detail.hasReportData;

    if (isEmptyMonthlyReport) {
      this.showComingSoonNotice(TOOL_COMING_SOON_TIP, "monthly_check_share");
      this.notifyComingSoonSubscriptionHook("monthly_check_share", {
        source: "report_card_primary",
        sceneKey: this.data.sceneKey,
        action
      });
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

    this.replacePreferredHomeScene();
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

  async handleBusinessDirectionsRefresh(event = null) {
    if (!this.ensureLoggedIn()) {
      return;
    }
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const workspace = this.data.opportunityWorkspaceSummary || {};
    wx.showLoading({ title: "生成方向中" });
    try {
      const result = await refreshBusinessDirections({
        projectId: dataset.projectId || workspace.projectId || "",
        workspaceVersion: Number(dataset.workspaceVersion || workspace.workspaceVersion || 0)
      });
      const refreshedMessages = stampMessages(buildBusinessDirectionMessages(result));
      const retainedMessages = this.data.messages.filter((message) => {
        return ![
          "business_direction_card",
          "business_direction_card_v2",
          "initiation_summary_card",
          "initiation_summary_card_v2"
        ].includes(message.type);
      });
      const nextMessages = retainedMessages.concat(refreshedMessages);
      this.setData({
        messages: nextMessages,
        quickReplies: [],
        scrollIntoView: nextMessages.length ? `msg-${nextMessages[nextMessages.length - 1]._uid}` : "",
        opportunityWorkspaceSummary: {
          ...workspace,
          projectId: result.projectId || workspace.projectId || "",
          projectStage: result.projectStage || "generating_candidates",
          workspaceVersion: result.workspaceVersion || 0,
          candidateSetId: result.candidateSetId || "",
          candidateSetVersion: result.candidateSetVersion || 0,
          candidateDirections: result.directions || [],
          selectedDirection: null,
          currentDeepDiveState: null,
          readyToInitiate: false,
          initiationSummary: null
        },
        inputPlaceholder: "和一树继续聊…"
      });
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "生成方向失败"),
        icon: "none"
      });
    } finally {
      wx.hideLoading();
    }
  },

  handleOpportunityHubPrimaryAction(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const action = String(dataset.action || "").trim();
    if (action === "open_projects") {
      if (dataset.projectId) {
        this.handleProjectTap({
          currentTarget: {
            dataset: {
              id: dataset.projectId
            }
          }
        });
        return;
      }
      this.setData({
        skillSheetVisible: false,
        projectSheetVisible: true
      });
      return;
    }
    this.handleBusinessDirectionsRefresh(event);
  },

  async handleBusinessDirectionSelect(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const directionId = String(dataset.directionId || "").trim();
    if (!directionId) {
      return;
    }
    if (this.data.selectingDirectionId || this.data.isStreaming) {
      wx.showToast({
        title: "正在处理，请稍后",
        icon: "none"
      });
      return;
    }

    const processingId = `business-direction-selecting-${Date.now()}`;
    this.appendMessages([
      {
        id: processingId,
        type: "agent",
        uiMode: "processing",
        text: "一树正在接住这个方向，拆成下一轮验证问题"
      }
    ], []);
    this.setData({
      selectingDirectionId: directionId,
      isStreaming: true,
      inputPlaceholder: "一树正在深聊这个方向…"
    });

    wx.showLoading({ title: "正在深聊" });
    try {
      const result = await selectBusinessDirection({
        projectId: dataset.projectId || "",
        candidateSetId: dataset.candidateSetId || "",
        directionId,
        workspaceVersion: Number(dataset.workspaceVersion || 0)
      });
      if (result && result.stale) {
        this.removeMessagesByIds([processingId]);
        wx.showToast({ title: "方向已更新，请重新确认", icon: "none" });
        return;
      }
      this.removeMessagesByIds([processingId]);
      this.appendMessages(buildOpportunityDeepDiveMessages(result), [
        { label: "回看 3 个方向", action: "review_business_directions" },
        { label: "换一组方向", action: "refresh_business_directions" }
      ]);
      this.setData({
        opportunityWorkspaceSummary: {
          ...(this.data.opportunityWorkspaceSummary || {}),
          projectId: result.projectId || "",
          projectStage: result.projectStage || "ready_to_initiate",
          workspaceVersion: result.workspaceVersion || 0,
          initiationSummaryVersion: result.initiationSummaryVersion || 0,
          selectedDirection: result.selectedDirection || null,
          currentDeepDiveState: {
            deepDiveSummary: result.deepDiveSummary || "",
            currentValidationQuestion: result.currentValidationQuestion || ""
          },
          readyToInitiate: !!result.readyToInitiate,
          initiationSummary: result.initiationSummary || null
        },
        inputPlaceholder: result.readyToInitiate
          ? "确认立项，或继续补充你的想法…"
          : "回答一树的问题，继续深聊这个方向…"
      });
    } catch (error) {
      this.removeMessagesByIds([processingId]);
      this.appendMessages([
        {
          id: `business-direction-select-error-${Date.now()}`,
          type: "agent",
          text: resolveUiErrorMessage(error, "选择方向失败")
        }
      ], [
        { label: "回看 3 个方向", action: "review_business_directions" },
        { label: "换一组方向", action: "refresh_business_directions" }
      ]);
      this.setData({
        inputPlaceholder: "和一树继续聊…"
      });
    } finally {
      this.setData({
        selectingDirectionId: "",
        isStreaming: false
      });
      wx.hideLoading();
    }
  },

  async handleProjectInitiate(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const projectId = dataset.projectId || "";
    if (!projectId) {
      return;
    }
    wx.showLoading({ title: "立项中" });
    try {
      const result = await initiateProject(projectId, {
        workspaceVersion: Number(dataset.workspaceVersion || 0),
        summaryVersion: Number(dataset.summaryVersion || 0)
      });
      if (result && result.stale) {
        wx.showToast({ title: "立项摘要已更新，请重新确认", icon: "none" });
        return;
      }
      this.appendMessages([buildProjectInitiatedMessage(result)], []);
      const detailProject = result && result.projectDetail ? result.projectDetail : null;
      if (detailProject) {
        this.setData({
          projects: [detailProject].concat(this.data.projects.filter((item) => item.id !== detailProject.id)),
          opportunityWorkspaceSummary: {
            ...(this.data.opportunityWorkspaceSummary || {}),
            hasActiveProject: true,
            activeProjectId: detailProject.id,
            projectStage: "validating",
            readyToInitiate: false
          },
          inputPlaceholder: "和一树继续聊…"
        });
      }
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "立项失败"),
        icon: "none"
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleProjectFollowupSubscribe(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const workspace = this.data.opportunityWorkspaceSummary || {};
    const projectId = dataset.projectId || dataset.id || workspace.activeProjectId || "";

    try {
      const result = await requestProjectFollowupSubscription({
        projectId
      });
      if (result && result.success) {
        wx.showToast({
          title: "已开启跟进提醒",
          icon: "success"
        });
        return;
      }

      const reason = String((result && result.reason) || "");
      wx.showToast({
        title: reason === "missing_template_id"
          ? "请先配置提醒模板"
          : reason === "unsupported"
            ? "当前微信版本不支持订阅"
            : "未开启提醒",
        icon: "none"
      });
    } catch (error) {
      wx.showToast({
        title: resolveUiErrorMessage(error, "开启提醒失败"),
        icon: "none"
      });
    }
  },

  async handleQuickReplySelect(event) {
    if (!this.ensureLoggedIn()) {
      return;
    }

    const { item } = event.detail;
    const itemAction = String((item && item.action) || "").trim();
    if (this.data.feedbackPendingTask && /^task_feedback_/.test(itemAction)) {
      const value = String((item && (item.value || item.label)) || "").trim();
      this.setData({
        quickReplies: []
      });
      await this.submitPendingTaskFeedback(value);
      return;
    }

    if (HOME_COMING_SOON_ACTIONS.has(itemAction)) {
      this.showComingSoonNotice(TOOL_COMING_SOON_TIP, itemAction);
      this.notifyComingSoonSubscriptionHook(itemAction, {
        source: "home_quick_reply",
        sceneKey: this.data.sceneKey,
        label: (item && item.label) || ""
      });
      return;
    }

    const routeAction = String((item && item.routeAction) || "").trim();
    if (routeAction === "opportunity_continue_identify" || itemAction === "refresh_business_directions") {
      await this.handleBusinessDirectionsRefresh();
      return;
    }
    if (itemAction === "review_business_directions") {
      const workspace = this.data.opportunityWorkspaceSummary || {};
      if (Array.isArray(workspace.candidateDirections) && workspace.candidateDirections.length) {
        this.appendMessages(buildBusinessDirectionMessages({
          projectId: workspace.projectId,
          candidateSetId: workspace.candidateSetId,
          candidateSetVersion: workspace.candidateSetVersion,
          workspaceVersion: workspace.workspaceVersion,
          directions: workspace.candidateDirections
        }), []);
      }
      return;
    }
    if (itemAction === "review_initiation_summary") {
      const workspace = this.data.opportunityWorkspaceSummary || {};
      if (workspace.initiationSummary) {
        this.appendMessages(buildInitiationSummaryMessages({
          projectId: workspace.projectId,
          workspaceVersion: workspace.workspaceVersion,
          initiationSummaryVersion: workspace.initiationSummaryVersion,
          selectedDirection: workspace.selectedDirection,
          initiationSummary: workspace.initiationSummary
        }), [
          { label: "回看 3 个方向", action: "review_business_directions" },
          { label: "换一组方向", action: "refresh_business_directions" }
        ]);
      }
      return;
    }
    if (ASSET_COMING_SOON_ROUTE_ACTIONS.has(routeAction)) {
      this.showComingSoonNotice("一树正在开发中", routeAction);
      this.notifyComingSoonSubscriptionHook(routeAction, {
        source: "asset_quick_reply",
        sceneKey: this.data.sceneKey,
        label: (item && item.label) || ""
      });
      return;
    }

    if (STEWARD_COMING_SOON_ROUTE_ACTIONS.has(routeAction)) {
      this.showComingSoonNotice(TOOL_COMING_SOON_TIP, routeAction);
      this.notifyComingSoonSubscriptionHook(routeAction, {
        source: "steward_quick_reply",
        sceneKey: this.data.sceneKey,
        label: (item && item.label) || ""
      });
      return;
    }
    // 用户一旦点过快捷回复，立刻把当前这组气泡清掉，避免后端还没返回之前老选项
    // 还挂在消息流下方，看起来像"又能点一次"。后端返回的新一组会通过
    // appendMessages / applyRouterStatePatch 自己回填。
    this.setData({ quickReplies: [] });
    const hasDeterministicRoute = !!(item && (item.quickReplyId || item.routeAction));
    const isRouteAction = !!(item && /^route_/.test(String(item.action || "")));
    const isAssetInventoryStart = !!(item && item.action === "asset_inventory_start");
    const isFulltimeIntakeStart = !!(item && item.action === "fulltime_intake_start");

    if (!this.data.conversationStateId && (hasDeterministicRoute || isRouteAction || isAssetInventoryStart || isFulltimeIntakeStart)) {
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
      case "phase2_enter_hub":
        this.replacePreferredHomeScene();
        return;
      case "go_home":
        if (this.data.sceneKey !== this.getPreferredHomeScene()) {
          this.appendPreferredHomeScene({
            userText: item.label
          });
        } else {
          this.replacePreferredHomeScene();
        }
        return;
      case "open_projects":
        if (item.projectId || (this.data.opportunityWorkspaceSummary || {}).activeProjectId) {
          this.handleProjectTap({
            currentTarget: {
              dataset: {
                id: item.projectId || this.data.opportunityWorkspaceSummary.activeProjectId
              }
            }
          });
          return;
        }
        this.setData({
          skillSheetVisible: false,
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
        this.showComingSoonNotice(TOOL_COMING_SOON_TIP, item.action);
        this.notifyComingSoonSubscriptionHook(item.action, {
          source: "ip_quick_reply",
          sceneKey: this.data.sceneKey,
          label: item.label || ""
        });
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
        this.replacePreferredHomeScene();
        return;
      default:
        this.appendMessages([
          buildUserMessage(item.label)
        ], []);
    }
  },

  async continueOpportunityDeepDiveFromCard() {
    const workspace = this.data.opportunityWorkspaceSummary || {};
    if (!isOpportunityDeepDiveActive(workspace)) {
      wx.showToast({
        title: "先选择一个方向",
        icon: "none"
      });
      return;
    }

    const currentQuestion = String(
      (workspace.currentDeepDiveState && workspace.currentDeepDiveState.currentValidationQuestion) || ""
    ).trim();

    if (currentQuestion) {
      this.appendMessages([
        {
          id: `opportunity-deep-dive-question-${Date.now()}`,
          type: "agent",
          text: currentQuestion
        }
      ], [
        { label: "回看 3 个方向", action: "review_business_directions" },
        { label: "换一组方向", action: "refresh_business_directions" }
      ]);
      this.setData({
        inputPlaceholder: "回答一树的问题，继续深聊这个方向…"
      });
      return;
    }

    await this.handleOpportunityDeepDiveSend("继续");
  },

  async handleOpportunityDeepDiveSend(value) {
    const text = String(value || "").trim();
    const workspace = this.data.opportunityWorkspaceSummary || {};
    if (!text || !isOpportunityDeepDiveActive(workspace)) {
      return false;
    }
    if (!this.ensureLoggedIn()) {
      return true;
    }

    const processingId = `opportunity-deep-dive-processing-${Date.now()}`;
    this.appendMessages([
      buildUserMessage(text),
      {
        id: processingId,
        type: "agent",
        uiMode: "processing",
        text: "一树正在继续深聊这个方向"
      }
    ], []);
    this.setData({
      isStreaming: true,
      inputPlaceholder: "一树正在整理…"
    });

    try {
      let result = null;
      let visibleText = "";
      let renderedText = "";
      let flushTimer = null;
      let drainResolver = null;
      const flushVisibleText = () => {
        if (!visibleText) {
          if (drainResolver) {
            drainResolver();
            drainResolver = null;
          }
          return;
        }
        const { chunk, rest } = takeTypewriterChunk(visibleText);
        renderedText += chunk;
        visibleText = rest;
        this.patchMessageText(processingId, renderedText);
        if (visibleText) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushVisibleText();
          }, STREAM_TYPEWRITER_INTERVAL_MS);
        } else if (drainResolver) {
          drainResolver();
          drainResolver = null;
        }
      };
      const waitVisibleTextDrained = () => {
        if (!visibleText && !flushTimer) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          drainResolver = resolve;
        });
      };
      const stream = sendOpportunityDeepDiveMessageStream({
        projectId: workspace.projectId || "",
        message: text,
        workspaceVersion: Number(workspace.workspaceVersion || 0)
      }, {
        onEvent: ({ event, data }) => {
          if (event === "assistant.text.delta" && data && data.delta) {
            visibleText += String(data.delta || "");
            if (!flushTimer) {
              flushTimer = setTimeout(() => {
                flushTimer = null;
                flushVisibleText();
              }, STREAM_TYPEWRITER_INTERVAL_MS);
            }
            return;
          }

          if (event === "assistant.text.done" && data && typeof data.content === "string") {
            const finalText = data.content;
            const displayedOrQueued = `${renderedText}${visibleText}`;
            if (finalText.startsWith(displayedOrQueued)) {
              visibleText = finalText.slice(displayedOrQueued.length);
            } else {
              renderedText = "";
              visibleText = finalText;
              this.patchMessageText(processingId, "");
            }
            if (!flushTimer) {
              flushTimer = setTimeout(() => {
                flushTimer = null;
                flushVisibleText();
              }, STREAM_TYPEWRITER_INTERVAL_MS);
            }
            return;
          }

          if (event === "opportunity.deep_dive.completed") {
            result = data || null;
          }
        }
      });
      let streamError = null;
      try {
        await stream.promise;
      } catch (error) {
        streamError = error;
      } finally {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushVisibleText();
        await waitVisibleTextDrained();
      }
      if (!result) {
        result = await sendOpportunityDeepDiveMessage({
          projectId: workspace.projectId || "",
          message: text,
          workspaceVersion: Number(workspace.workspaceVersion || 0)
        });
      }
      if (!result && streamError) {
        throw streamError;
      }
      if (result && result.stale) {
        this.removeMessagesByIds([processingId]);
        wx.showToast({ title: "方向已更新，请重新确认", icon: "none" });
        return true;
      }
      this.removeMessagesByIds([processingId]);
      this.appendMessages(buildOpportunityDeepDiveMessages(result), [
        { label: "回看 3 个方向", action: "review_business_directions" },
        { label: "换一组方向", action: "refresh_business_directions" }
      ]);
      this.setData({
        opportunityWorkspaceSummary: {
          ...workspace,
          projectId: result.projectId || workspace.projectId || "",
          projectStage: result.projectStage || (result.readyToInitiate ? "ready_to_initiate" : "deep_diving"),
          workspaceVersion: result.workspaceVersion || workspace.workspaceVersion || 0,
          initiationSummaryVersion: result.initiationSummaryVersion || workspace.initiationSummaryVersion || 0,
          selectedDirection: result.selectedDirection || workspace.selectedDirection || null,
          currentDeepDiveState: {
            deepDiveSummary: result.deepDiveSummary || "",
            currentValidationQuestion: result.currentValidationQuestion || ""
          },
          readyToInitiate: !!result.readyToInitiate,
          initiationSummary: result.initiationSummary || workspace.initiationSummary || null
        },
        inputPlaceholder: result.readyToInitiate
          ? "确认立项，或继续补充你的想法…"
          : "回答一树的问题，继续深聊这个方向…"
      });
    } catch (error) {
      this.removeMessagesByIds([processingId]);
      this.appendMessages([
        {
          id: `opportunity-deep-dive-error-${Date.now()}`,
          type: "agent",
          text: resolveUiErrorMessage(error, "深聊暂时失败，请稍后再试")
        }
      ], [
        { label: "回看 3 个方向", action: "review_business_directions" },
        { label: "换一组方向", action: "refresh_business_directions" }
      ]);
    } finally {
      this.setData({
        isStreaming: false
      });
    }

    return true;
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

    if (await this.handleOpportunityDeepDiveSend(value)) {
      return;
    }

    if (this.data.feedbackPendingTask) {
      await this.submitPendingTaskFeedback(value);
      return;
    }

    this.submitOpportunityFeedbackInBackground(value);
    this.appendStreamingThenReply(value);
  },

  async submitPendingTaskFeedback(value = "") {
    const text = String(value || "").trim();
    if (!text || !this.data.feedbackPendingTask) {
      return;
    }

    const taskLabel = this.data.feedbackPendingTask;
    const taskId = this.data.feedbackPendingTaskId;
    const feedbackPayload = {
      taskId,
      taskLabel,
      userText: text,
      summary: text
    };
    const feedbackPersistPromise = fetchTaskFeedback(feedbackPayload).then((feedbackResult) => {
      if (feedbackResult && feedbackResult.opportunitySummary) {
        this.setData({
          messages: patchOpportunitySummaryMessages(this.data.messages, feedbackResult.opportunitySummary)
        });
      }
      return feedbackResult;
    }).catch((error) => {
      return { __feedbackError: error };
    });

    this.setData({
      feedbackLastSummary: text,
      feedbackPendingTask: "",
      feedbackPendingTaskId: "",
      quickReplies: [],
      inputPlaceholder: this.getLocalScene(this.data.sceneKey).inputPlaceholder || "杈撳叆娑堟伅..."
    });

    if (this.data.conversationStateId) {
      const routed = await this.runRouterAction({
        inputType: "system_event",
        text: `任务「${taskLabel}」的反馈：${text}`,
        routeAction: "task_completed",
        metadata: {
          source: "daily_task_feedback",
          taskId,
          taskLabel,
          userFeedback: text,
          expectedAgent: "execution"
        }
      }, {
        userLabel: text,
        showUserMessage: true,
        silentFailure: true,
        loadingText: "一树正在判断这条反馈的信号强弱"
      });
      if (routed) {
        return;
      }
    }

    try {
      const feedbackResult = await feedbackPersistPromise;
      if (feedbackResult && feedbackResult.__feedbackError) {
        throw feedbackResult.__feedbackError;
      }

      const nextMessages = Array.isArray(feedbackResult && feedbackResult.messages)
        ? feedbackResult.messages.filter((message) => message && message.type === "agent").slice(-1)
        : [];

      this.appendMessages(
        [buildUserMessage(text)].concat(nextMessages.length
          ? nextMessages
          : [{
              id: `task-advice-${Date.now()}`,
              type: "agent",
              text: buildFeedbackAdvice(text, taskLabel)
            }]),
        []
      );
      if (feedbackResult && feedbackResult.opportunitySummary) {
        this.setData({
          messages: patchOpportunitySummaryMessages(this.data.messages, feedbackResult.opportunitySummary)
        });
      }
    } catch (_error) {
      this.appendMessages([
        buildUserMessage(text),
        {
          id: `task-advice-${Date.now()}`,
          type: "agent",
          text: buildFeedbackAdvice(text, taskLabel)
        }
      ], []);
    }

    this.setData({
      feedbackLastSummary: text,
      feedbackPendingTask: "",
      feedbackPendingTaskId: "",
      inputPlaceholder: this.getLocalScene(this.data.sceneKey).inputPlaceholder || "输入消息..."
    });
  },

  submitOpportunityFeedbackInBackground(value) {
    if (!looksLikeOpportunityFeedbackText(value) || !hasOpportunitySummaryContext(this.data)) {
      return;
    }

    fetchTaskFeedback({
      taskLabel: "验证反馈",
      userText: value,
      summary: value
    }).then((feedbackResult) => {
      if (feedbackResult && feedbackResult.opportunitySummary) {
        this.setData({
          messages: patchOpportunitySummaryMessages(this.data.messages, feedbackResult.opportunitySummary)
        });
      }
    }).catch(() => undefined);
  }
});
