const { user: seedUser } = require("./user");
const { profile: seedProfile } = require("./profile");
const { projects: seedProjects, projectDetails: seedProjectDetails } = require("./projects");
const { recentChats: seedRecentChats, tools: seedTools } = require("./sidebar");
const { companyCards: seedCompanyCards } = require("./company");
const { conversations: seedLegacyConversations } = require("./chat");
const reportSeed = require("./reports");

const STREAM_EVENT_TYPES = {
  META: "meta",
  TOKEN: "token",
  MESSAGE: "message",
  HEARTBEAT: "heartbeat",
  DONE: "done",
  ERROR: "error"
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizePath(url) {
  if (!url) {
    return "/";
  }

  const withoutOrigin = String(url).replace(/^https?:\/\/[^/]+/i, "");
  const path = withoutOrigin.split("?")[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function getDisplayName(user = {}) {
  return safeText(user.nickname || user.name) || "小明";
}

function toProjectSummary(project = {}) {
  return {
    id: project.id,
    name: project.name || "新项目",
    phase: project.phase || "探索中",
    status: project.status || "进行中",
    statusTone: project.statusTone || "muted",
    color: project.color || "#378ADD"
  };
}

function buildDailyTasks() {
  return {
    title: "今日任务",
    items: [
      { id: "task-1", label: "触达5个潜在客户", tag: "自媒体项目", done: false },
      { id: "task-2", label: "发一条小红书", tag: "IP杠杆", done: false },
      { id: "task-3", label: "跟进昨天的意向客户", tag: "自媒体项目", done: false }
    ]
  };
}

function buildSharePreview() {
  return {
    subtitle: "一树OPC / 我的资产雷达",
    title: "原来我的隐藏资产\n比我想的多得多。",
    quote: "扫码发现你的隐藏资产",
    brand: "一树OPC",
    createdAt: "3月31日生成",
    bars: [
      { label: "能力", value: 78 },
      { label: "资源", value: 42 },
      { label: "认知", value: 86 },
      { label: "关系", value: 55 }
    ],
    caption: "今天用一树OPC把资产盘点了一遍，发现了之前没意识到的变现路径。",
    hashtags: ["#一人公司", "#AI搞钱", "#生意复盘"]
  };
}

function buildChatScenes(user = {}) {
  const displayName = getDisplayName(user);
  return {
    onboarding_intro: {
      key: "onboarding_intro",
      agentKey: "master",
      inputPlaceholder: "先点击登录卡片，我们就开始...",
      allowInput: true,
      messages: [
        {
          id: "onboarding-intro-1",
          type: "agent",
          text: "嗨，我是一树。在开始之前，先让我认识一下你。"
        },
        {
          id: "onboarding-intro-2",
          type: "login_card",
          title: "微信一键登录",
          description: "登录是对话的一部分，不是前置门槛。",
          buttonText: "微信一键登录",
          action: "login"
        }
      ],
      quickReplies: []
    },
    home: {
      key: "home",
      agentKey: "master",
      inputPlaceholder: "输入消息...",
      allowInput: true,
      messages: [
        {
          id: "home-1",
          type: "agent",
          text: "早上好小明，今天我们先抓最关键的一件事。"
        }
      ],
      quickReplies: [
        { label: "先看项目", action: "open_projects" },
        { label: "打开 AI", action: "tool_ai" },
        { label: "打开 IP", action: "tool_ip" }
      ]
    },
    leverage_intro: {
      key: "leverage_intro",
      agentKey: "master",
      inputPlaceholder: "你也可以直接问一树...",
      allowInput: true,
      messages: [
        {
          id: "leverage-1",
          type: "leverage_card",
          paragraphs: [
            "在这个时代，一个人做生意有两个免费的超级杠杆：代码和媒体。",
            "代码杠杆：你不需要会写代码，只需要会跟 AI 说话。",
            "媒体杠杆：内容成本接近零，但可以稳定触达目标人群。"
          ],
          primaryText: "用我的AI杠杆",
          secondaryText: "用我的IP杠杆"
        }
      ],
      quickReplies: []
    },
    ai_assistant: {
      key: "ai_assistant",
      agentKey: "execution",
      inputPlaceholder: "描述你现在最耗时的环节...",
      allowInput: true,
      messages: [
        {
          id: "ai-1",
          type: "agent",
          text: "AI杠杆的核心是：让AI帮你做重复的事，你只做需要判断力的事。"
        }
      ],
      quickReplies: [
        { label: "回客户消息", action: "ai_reply_clients" },
        { label: "写内容文案", action: "ai_write_content" },
        { label: "整理数据报表", action: "ai_data_report" },
        { label: "其他", action: "ai_other" }
      ]
    },
    ip_assistant: {
      key: "ip_assistant",
      agentKey: "asset",
      inputPlaceholder: "说说你想在哪个平台做 IP...",
      allowInput: true,
      messages: [
        {
          id: "ip-1",
          type: "agent",
          text: "IP杠杆的核心是持续输出你的独特认知。你最想先在哪个平台做？"
        }
      ],
      quickReplies: [
        { label: "小红书", action: "ip_rednote" },
        { label: "抖音", action: "ip_douyin" },
        { label: "公众号", action: "ip_public" },
        { label: "多平台都想做", action: "ip_multi" }
      ]
    },
    monthly_check: {
      key: "monthly_check",
      agentKey: "steward",
      inputPlaceholder: "输入消息...",
      allowInput: true,
      messages: [],
      quickReplies: []
    },
    social_proof: {
      key: "social_proof",
      agentKey: "mindset",
      inputPlaceholder: "输入消息...",
      allowInput: true,
      messages: [],
      quickReplies: []
    }
  };
}

function createInitialState() {
  return {
    user: clone(seedUser),
    profile: clone(seedProfile),
    projects: clone(seedProjects),
    projectDetails: clone(seedProjectDetails),
    recentChats: clone(seedRecentChats),
    tools: clone(seedTools),
    companyCards: clone(seedCompanyCards),
    legacyConversations: clone(seedLegacyConversations),
    reports: {
      treeOverview: clone(reportSeed.treeOverview),
      treeMilestones: clone(reportSeed.treeMilestones),
      weeklyReport: clone(reportSeed.weeklyReport),
      monthlyCheck: clone(reportSeed.monthlyCheck),
      socialProof: clone(reportSeed.socialProof),
      milestone: clone(reportSeed.milestone)
    },
    sharePreview: buildSharePreview(),
    chatScenes: buildChatScenes(seedUser),
    dailyTasks: buildDailyTasks(),
    streamSessions: {}
  };
}

const state = createInitialState();
state.chatScenes.home = buildHomeScene(state.user);

function appendRecentChat(label = "") {
  const content = safeText(label);
  if (!content) {
    return;
  }

  state.recentChats.unshift({
    id: `recent-${Date.now()}`,
    label: content
  });
  state.recentChats = state.recentChats.slice(0, 20);
}

function deleteRecentChat(recentChatId = "") {
  const targetId = safeText(recentChatId);
  const before = state.recentChats.length;
  state.recentChats = state.recentChats.filter((item) => String(item.id) !== targetId);
  return before !== state.recentChats.length;
}

function clearRecentChats() {
  const count = state.recentChats.length;
  state.recentChats = [];
  return count;
}

function getProjectDetail(projectId) {
  return state.projectDetails[projectId] || null;
}

function getResultById(resultId) {
  const details = Object.values(state.projectDetails || {});
  for (let i = 0; i < details.length; i += 1) {
    const list = details[i] && Array.isArray(details[i].artifacts) ? details[i].artifacts : [];
    const found = list.find((item) => String(item.id) === String(resultId));
    if (found) {
      return found;
    }
  }
  return null;
}

function buildBootstrapPayload() {
  return {
    user: state.user,
    projects: state.projects,
    tools: state.tools,
    recentChats: state.recentChats,
    assetInventoryStatus: {
      hasReport: false,
      inProgress: false,
      workflowKey: "firstInventory",
      lastConversationId: null,
      resumePrompt: null
    }
  };
}

function buildSidebarPayload() {
  return {
    user: state.user,
    projects: state.projects,
    tools: state.tools,
    recentChats: state.recentChats
  };
}

function buildHomeScene(user = {}) {
  return {
    key: "home",
    agentKey: "master",
    inputPlaceholder: "输入消息...",
    allowInput: true,
    messages: [
      {
        id: "home-1",
        type: "agent",
        text: `早上好${getDisplayName(user)}，今天的重点：`
      }
    ],
    quickReplies: [
      { label: "先看项目", action: "open_projects" },
      { label: "打开 AI", action: "tool_ai" },
      { label: "打开 IP", action: "tool_ip" }
    ]
  };
}

function buildUserSidebarPayload() {
  return buildSidebarPayload();
}

function resolveAgentByText(text = "", fallback = "master") {
  const source = safeText(text).toLowerCase();
  if (/小红书|抖音|公众号|ip|内容/.test(source)) {
    return "asset";
  }
  if (/财务|税务|公司|申报|薪资|管家/.test(source)) {
    return "steward";
  }
  if (/焦虑|卡住|拖延|没动力|扎心/.test(source)) {
    return "mindset";
  }
  if (/客户|报价|成交|跟进|执行|自动/.test(source)) {
    return "execution";
  }
  return fallback;
}

function buildAgentReply(agentKey, userText) {
  const source = safeText(userText);
  if (!source) {
    return {
      text: "收到，我继续帮你往下拆。",
      quickReplies: []
    };
  }

  if (agentKey === "asset") {
    return {
      text: "这个方向适合做认知资产化。我先给你一条可直接发布的内容骨架，再一起调成你的语气。",
      quickReplies: [
        { label: "先给我一条", action: "ip_rednote" },
        { label: "改成抖音版", action: "ip_douyin" }
      ]
    };
  }

  if (agentKey === "steward") {
    return {
      text: "我帮你拆成“今天-本周-本月”三步，先确保这一周不会掉链子。",
      quickReplies: [
        { label: "给我三步清单", action: "go_home" },
        { label: "先看风险", action: "go_home" }
      ]
    };
  }

  if (agentKey === "mindset") {
    return {
      text: "你不是做不到，是第一步还不够小。我们只做一件 10 分钟内能完成的动作。",
      quickReplies: [
        { label: "好，给我一个任务", action: "social_primary" },
        { label: "我确实有困难，聊聊", action: "social_secondary" }
      ]
    };
  }

  if (agentKey === "execution") {
    return {
      text: "好，这件事适合流程化。我先给你一版可执行话术，再补一个跟进节奏。",
      quickReplies: [
        { label: "先给话术", action: "ai_reply_clients" },
        { label: "补跟进节奏", action: "go_home" }
      ]
    };
  }

  return {
    text: "我收到你的信息了。先从最关键的一步开始，我会边聊边帮你落地。",
    quickReplies: [
      { label: "先看项目", action: "open_projects" },
      { label: "继续聊", action: "go_home" }
    ]
  };
}

function buildStreamEvents(text = "", streamId = "", withError = false) {
  const events = [
    {
      type: STREAM_EVENT_TYPES.META,
      streamId,
      createdAt: Date.now()
    }
  ];

  if (withError) {
    events.push({
      type: STREAM_EVENT_TYPES.ERROR,
      streamId,
      message: "mock_stream_error"
    });
    return events;
  }

  const tokens = Array.from(String(text || ""));
  tokens.forEach((token, index) => {
    events.push({
      type: STREAM_EVENT_TYPES.TOKEN,
      streamId,
      token,
      index
    });
  });

  events.push({
    type: STREAM_EVENT_TYPES.MESSAGE,
    streamId,
    message: {
      id: `assistant-${Date.now()}`,
      type: "agent",
      text
    }
  });

  events.push({
    type: STREAM_EVENT_TYPES.DONE,
    streamId,
    usage: {
      promptTokens: 0,
      completionTokens: tokens.length
    }
  });

  return events;
}

function buildTaskFeedback(payload = {}) {
  const label = safeText(payload.taskLabel || payload.label) || "这项任务";
  const summary = safeText(payload.summary || payload.userText || payload.text);
  let advice = "建议你先复述对方顾虑，再给一个可执行的下一步选项，把决策成本降到最低。";

  if (/没回|未回|已读不回|没回应/.test(summary)) {
    advice = "先不要追长消息。24 小时后发二选一跟进：A/B 两个方向，让对方更容易回复。";
  } else if (/价格|预算|贵|考虑/.test(summary)) {
    advice = "价格问题本质是风险问题。先给小范围试运行方案，把风险降下来，成交率会明显提升。";
  } else if (/感兴趣|愿意|想了解/.test(summary)) {
    advice = "这是高质量信号。下一步别讲全套，直接约 15 分钟演示，聚焦一个结果场景推进成交。";
  }

  return {
    messages: [
      {
        id: `feedback-status-${Date.now()}`,
        type: "status_chip",
        label,
        status: "done"
      },
      {
        id: `feedback-prompt-${Date.now() + 1}`,
        type: "agent",
        text: `${label}已完成，不错。结果怎么样？你想聊聊吗？`
      },
      {
        id: `feedback-advice-${Date.now() + 2}`,
        type: "agent",
        text: advice
      }
    ],
    quickReplies: [
      { label: "好，帮我写", action: "write_followup" },
      { label: "我自己来", action: "self_handle" }
    ]
  };
}

function resolveStaticRoute(method, path, data) {
  switch (`${method} ${path}`) {
    case "GET /":
      return {
        name: "opc-backend",
        status: "ok",
        message: "Backend is running"
      };
    case "GET /health":
      return {
        ok: true,
        service: "opc-backend",
        timestamp: new Date().toISOString()
      };

    case "GET /bootstrap":
      return buildBootstrapPayload();
    case "GET /sidebar":
      return buildSidebarPayload();
    case "GET /profile":
      return state.profile;

    case "POST /auth/wechat-login": {
      const nickname = safeText(data.nickname || data.name) || state.user.nickname || "小明";
      state.user = {
        ...state.user,
        name: nickname,
        nickname,
        initial: nickname.slice(0, 1)
      };
      state.profile = {
        ...state.profile,
        name: nickname,
        initial: nickname.slice(0, 1)
      };
      return {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresIn: 7200,
        user: state.user
      };
    }
    case "POST /auth/refresh":
      return {
        accessToken: "mock-access-token-refreshed",
        refreshToken: "mock-refresh-token",
        expiresIn: 7200
      };
    case "GET /auth/me":
      return state.user;
    case "POST /auth/logout":
      return { success: true };

    case "GET /user":
      return state.user;
    case "PATCH /user/profile":
      state.user = {
        ...state.user,
        ...data
      };
      state.profile = {
        ...state.profile,
        ...data,
        name: data.nickname || data.name || state.profile.name
      };
      return state.user;
    case "GET /user/sidebar":
      return buildUserSidebarPayload();

    case "GET /projects":
      return state.projects.map((item) => toProjectSummary(item));
    case "POST /projects": {
      const id = safeText(data.id) || `project-${Date.now()}`;
      const project = toProjectSummary({
        id,
        ...data
      });
      state.projects.unshift(project);
      state.projectDetails[id] = {
        ...project,
        conversation: [],
        conversationReplies: [],
        artifacts: []
      };
      return project;
    }

    case "GET /company/cards":
      return state.companyCards;
    case "GET /company/panel":
      return {
        title: "我的公司",
        cards: state.companyCards
      };

    case "GET /tasks/daily":
      return state.dailyTasks;
    case "POST /tasks/feedback":
      return buildTaskFeedback(data);

    case "GET /growth/tree":
      return {
        overview: state.reports.treeOverview,
        milestones: state.reports.treeMilestones
      };
    case "GET /growth/milestones/current":
      return state.reports.milestone;

    case "GET /reports/weekly":
      return state.reports.weeklyReport;
    case "GET /reports/monthly":
      return state.reports.monthlyCheck;
    case "GET /reports/social-proof":
      return state.reports.socialProof;
    case "GET /milestone/current":
      return state.reports.milestone;
    case "GET /tree/milestones":
      return state.reports.treeMilestones;

    case "GET /share/preview":
      return state.sharePreview;
    case "POST /share/generate-image":
      return {
        posterId: `poster-${Date.now()}`,
        imageUrl: ""
      };
    case "POST /share/caption": {
      const title = safeText(data.title || data.resultTitle);
      return {
        caption: title
          ? `今天用一树OPC整理了「${title}」，顺手把下一步动作也拆清楚了。`
          : state.sharePreview.caption,
        hashtags: state.sharePreview.hashtags
      };
    }

    case "GET /conversation/home":
      return state.legacyConversations.home;
    case "GET /conversation/onboarding":
      return state.legacyConversations.onboarding;
    case "GET /conversation/ai":
      return state.legacyConversations.aiAssistant;
    case "GET /conversation/ip":
      return state.legacyConversations.ipAssistant;

    default:
      return undefined;
  }
}

function resolveDynamicRoute(method, path, data) {
  let match = null;

  if (method === "GET") {
    match = path.match(/^\/chat\/scenes\/([^/]+)$/);
    if (match) {
      const sourceKey = decodeURIComponent(match[1]);
      const alias = {
        onboarding: "onboarding_intro",
        ai: "ai_assistant",
        ip: "ip_assistant"
      };
      const key = alias[sourceKey] || sourceKey;
      if (key === "home") {
        state.chatScenes.home = buildHomeScene(state.user);
      }

      return state.chatScenes[key] || {
        key,
        agentKey: "master"
      };
    }

    match = path.match(/^\/chat\/stream\/([^/]+)$/);
    if (match) {
      const streamId = decodeURIComponent(match[1]);
      const session = state.streamSessions[streamId];
      if (!session) {
        throw new Error(`Mock stream not found: ${streamId}`);
      }

      if (session.cursor >= session.events.length) {
        return [];
      }

      const start = session.cursor;
      const end = Math.min(start + session.chunkSize, session.events.length);
      session.cursor = end;
      return session.events.slice(start, end);
    }

    match = path.match(/^\/projects\/([^/]+)\/results$/);
    if (match) {
      const projectId = decodeURIComponent(match[1]);
      const detail = getProjectDetail(projectId);
      if (!detail) {
        throw new Error(`Mock project not found: ${projectId}`);
      }
      return detail.artifacts || [];
    }

    match = path.match(/^\/projects\/([^/]+)$/);
    if (match) {
      const projectId = decodeURIComponent(match[1]);
      const detail = getProjectDetail(projectId);
      if (!detail) {
        throw new Error(`Mock project not found: ${projectId}`);
      }
      return detail;
    }

    match = path.match(/^\/results\/([^/]+)$/);
    if (match) {
      const resultId = decodeURIComponent(match[1]);
      const result = getResultById(resultId);
      if (!result) {
        throw new Error(`Mock result not found: ${resultId}`);
      }
      return result;
    }

    match = path.match(/^\/growth\/milestones\/([^/]+)$/);
    if (match) {
      const milestoneId = decodeURIComponent(match[1]);
      const target = (state.reports.treeMilestones || []).find((item) => String(item.id) === milestoneId);
      if (!target) {
        throw new Error(`Mock milestone not found: ${milestoneId}`);
      }
      return target;
    }
  }

  if (method === "POST") {
    match = path.match(/^\/chat\/messages$/);
    if (match) {
      const message = safeText(data.message);
      const conversationId = data.conversationId || `conv-${Date.now()}`;
      const agentKey = resolveAgentByText(message, "master");
      const reply = buildAgentReply(agentKey, message);

      if (message) {
        appendRecentChat(`今天 ${new Date().toTimeString().slice(0, 5)} ${message.slice(0, 12)}`);
      }

      return {
        conversationId,
        userMessageId: data.userMessageId || `user-${Date.now()}`,
        assistantMessage: {
          id: `assistant-${Date.now()}`,
          type: "agent",
          text: reply.text
        },
        agentKey,
        quickReplies: reply.quickReplies
      };
    }

    match = path.match(/^\/chat\/stream\/start$/);
    if (match) {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const message = safeText(data.userText || data.message);
      const conversationId = data.conversationId || `conv-${Date.now()}`;
      const agentKey = resolveAgentByText(message, "master");
      const reply = buildAgentReply(agentKey, message);
      const withError = /\bmock-error\b/i.test(message);
      const events = buildStreamEvents(reply.text, streamId, withError);

      state.streamSessions[streamId] = {
        streamId,
        conversationId,
        events,
        cursor: 0,
        chunkSize: 10
      };

      if (message) {
        appendRecentChat(`今天 ${new Date().toTimeString().slice(0, 5)} ${message.slice(0, 12)}`);
      }

      return {
        streamId,
        conversationId,
        status: "streaming",
        agentKey,
        quickReplies: reply.quickReplies
      };
    }

    match = path.match(/^\/company\/actions\/([^/]+)$/);
    if (match) {
      const actionId = decodeURIComponent(match[1]);
      return {
        success: true,
        actionId,
        payload: data || {},
        executedAt: new Date().toISOString()
      };
    }

    match = path.match(/^\/tasks\/([^/]+)\/complete$/);
    if (match) {
      const taskId = decodeURIComponent(match[1]);
      const target = (state.dailyTasks.items || []).find((item) => item.id === taskId);
      if (!target) {
        throw new Error(`Mock task not found: ${taskId}`);
      }
      target.done = true;
      return {
        success: true,
        taskId,
        done: true
      };
    }

    match = path.match(/^\/results\/share$/);
    if (match) {
      return {
        success: true,
        shareId: `share-${Date.now()}`,
        resultId: data.resultId || null
      };
    }
  }

  if (method === "PATCH") {
    match = path.match(/^\/projects\/([^/]+)$/);
    if (match) {
      const projectId = decodeURIComponent(match[1]);
      const summary = state.projects.find((item) => item.id === projectId);
      const detail = getProjectDetail(projectId);
      if (!summary || !detail) {
        throw new Error(`Mock project not found: ${projectId}`);
      }

      Object.assign(summary, data);
      state.projectDetails[projectId] = {
        ...detail,
        ...data
      };
      return state.projectDetails[projectId];
    }
  }

  if (method === "DELETE") {
    match = path.match(/^\/conversations\/([^/]+)$/);
    if (match) {
      const conversationId = decodeURIComponent(match[1]);
      const success = deleteRecentChat(conversationId);
      if (!success) {
        throw new Error(`Mock recent chat not found: ${conversationId}`);
      }
      return {
        success: true,
        id: conversationId
      };
    }

    match = path.match(/^\/conversations$/);
    if (match) {
      return {
        success: true,
        count: clearRecentChats()
      };
    }

    match = path.match(/^\/projects\/([^/]+)$/);
    if (match) {
      const projectId = decodeURIComponent(match[1]);
      state.projects = state.projects.filter((item) => item.id !== projectId);
      delete state.projectDetails[projectId];
      return {
        success: true,
        id: projectId
      };
    }
  }

  return undefined;
}

function resolveMockResponse(method, url, data = {}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = normalizePath(url);

  const staticPayload = resolveStaticRoute(normalizedMethod, normalizedPath, data);
  if (typeof staticPayload !== "undefined") {
    return clone(staticPayload);
  }

  const dynamicPayload = resolveDynamicRoute(normalizedMethod, normalizedPath, data);
  if (typeof dynamicPayload !== "undefined") {
    return clone(dynamicPayload);
  }

  throw new Error(`Mock route not found: ${normalizedMethod} ${normalizedPath}`);
}

module.exports = {
  resolveMockResponse,
  __mockState: state,
  __mockHelpers: {
    normalizePath
  }
};
