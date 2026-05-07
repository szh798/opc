const { fetchProjectDetail, sendProjectMessage, startProjectMessageStream } = require("../../services/project.service");
const {
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
} = require("../../services/result.service");
const { requestProjectFollowupSubscription } = require("../../services/subscription.service");
const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");
const { ensureLoggedIn } = require("../../utils/auth-guard");

const PROJECT_SCENE_ROUTE_ACTION_MAP = {
  project_execution_followup: "project_execution_followup",
  project_asset_followup: "project_asset_followup",
  company_park_followup: "company_park_followup",
  company_tax_followup: "company_tax_followup",
  company_profit_followup: "company_profit_followup",
  company_payroll_followup: "company_payroll_followup"
};

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
  rejected: "已否决"
};

const ARTIFACT_FILTERS = [
  { key: "all", label: "全部" },
  { key: "方向", label: "方向" },
  { key: "方案", label: "方案" },
  { key: "验证", label: "验证" },
  { key: "成交", label: "成交" },
  { key: "系统", label: "系统" }
];

const STAGE_ORDER = ["方向判断", "立项准备", "客户验证", "产品成交", "系统化"];
const DEFAULT_ARTIFACT_PROGRESS_TARGET = 6;
const COMPLETED_ARTIFACT_STATUSES = new Set(["generated", "confirmed", "running", "done", "completed"]);
const STREAM_TYPEWRITER_INTERVAL_MS = 90;
const STREAM_TYPEWRITER_CHARS_PER_TICK = 2;
const STREAM_TYPEWRITER_CATCHUP_THRESHOLD = 120;
const STREAM_TYPEWRITER_CATCHUP_CHARS = 8;

const ARTIFACT_TYPE_MAP = {
  business_direction_candidates: {
    type: "opportunity_candidates",
    title: "商业方向候选",
    stage: "方向判断",
    category: "方向",
    tags: ["AI工具落地", "企业服务", "轻咨询"]
  },
  opportunity_candidates: {
    type: "opportunity_candidates",
    title: "商业方向候选",
    stage: "方向判断",
    category: "方向",
    tags: ["AI工具落地", "企业服务", "轻咨询"]
  },
  project_initiation_summary: {
    type: "project_brief",
    title: "立项摘要",
    stage: "立项准备",
    category: "方案",
    tags: ["立项", "首轮目标"]
  },
  project_brief: {
    type: "project_brief",
    title: "立项摘要",
    stage: "立项准备",
    category: "方案",
    tags: ["立项", "首轮目标"]
  },
  project_followup_cycle: {
    type: "followup_round",
    title: "项目跟进",
    stage: "客户验证",
    category: "验证",
    tags: ["本轮跟进", "验证任务"]
  },
  followup_round: {
    type: "followup_round",
    title: "项目跟进",
    stage: "客户验证",
    category: "验证",
    tags: ["本轮跟进", "验证任务"]
  },
  opportunity_score: {
    type: "opportunity_score",
    title: "机会评分",
    stage: "方向判断",
    category: "方向",
    tags: ["评分矩阵", "Go/No-Go"]
  },
  selected_direction: {
    type: "selected_direction",
    title: "已选方向",
    stage: "方向判断",
    category: "方向",
    tags: ["已选择", "深聊方向"]
  },
  validation_plan: {
    type: "validation_actions",
    title: "验证动作",
    stage: "客户验证",
    category: "验证",
    tags: ["客户验证", "行动清单"]
  },
  validation_actions: {
    type: "validation_actions",
    title: "验证动作",
    stage: "客户验证",
    category: "验证",
    tags: ["客户验证", "行动清单"]
  },
  product_structure: {
    type: "product_structure",
    title: "产品结构",
    stage: "产品成交",
    category: "方案",
    tags: ["产品化", "交付结构"]
  },
  pricing_card: {
    type: "pricing_card",
    title: "三层定价",
    stage: "产品成交",
    category: "成交",
    tags: ["定价", "成交"]
  },
  outreach_script: {
    type: "outreach_script",
    title: "触达话术",
    stage: "客户验证",
    category: "验证",
    tags: ["触达", "客户反馈"]
  },
  business_health: {
    type: "business_health",
    title: "生意体检",
    stage: "系统化",
    category: "系统",
    tags: ["复盘", "系统化"]
  },
  park_match: {
    type: "park_match",
    title: "园区政策",
    stage: "系统化",
    category: "系统",
    tags: ["政策", "园区"]
  },
  profit_first: {
    type: "profit_first",
    title: "利润分配",
    stage: "系统化",
    category: "系统",
    tags: ["利润", "现金流"]
  },
  asset_radar: {
    type: "asset_radar",
    title: "资产雷达图",
    stage: "方向判断",
    category: "方向",
    tags: ["资产盘点", "优势组合"]
  }
};

const ARTIFACT_DETAIL_FALLBACKS = {
  opportunity_candidates: {
    judgment: "当前最适合优先验证的是“中小企业 AI 工具落地顾问”。它贴合你的产品经验，也更容易拿到第一批客户反馈。",
    bullets: [
      "方向一：AI 工具落地顾问",
      "方向二：B端产品流程优化",
      "方向三：企业内部 AI 培训"
    ]
  },
  project_brief: {
    judgment: "这份摘要的价值不是写得完整，而是把项目边界、首轮目标和验证标准先钉住，避免后面变成泛泛执行。",
    bullets: [
      "项目定位：先服务一个清晰客户群",
      "首轮目标：拿到真实反馈而不是追求完美方案",
      "验证标准：用客户回应决定下一步"
    ]
  },
  followup_round: {
    judgment: "这一轮最重要的不是把任务都做完，而是拿到能判断方向是否成立的证据。",
    bullets: [
      "完成本轮最多 3 个关键动作",
      "记录客户原话或明确卡点",
      "根据反馈决定继续、调整或停止"
    ]
  },
  opportunity_score: {
    judgment: "评分不是为了证明这个方向好，而是帮你判断它值不值得进入客户验证。",
    bullets: [
      "看需求是否足够明确",
      "看获客路径是否可执行",
      "看竞争和交付成本是否可控"
    ]
  },
  selected_direction: {
    judgment: "选中方向后，下一步可以先围绕目标客户做小规模验证，让真实反馈帮你校准方案。",
    bullets: [
      "明确目标客户是谁",
      "验证他们是否愿意聊",
      "验证他们是否愿意为结果付费"
    ]
  },
  validation_actions: {
    judgment: "验证动作的作用是把想法变成证据。每个动作都应该能产生一个明确反馈。",
    bullets: [
      "找 3-5 个真实潜在客户",
      "问出他们现在最想自动化的重复环节",
      "记录需求强度、预算意愿和卡点"
    ]
  },
  product_structure: {
    judgment: "产品结构要先小后大，先把一个可交付结果讲清楚，再扩展成完整服务。",
    bullets: [
      "定义最小可交付结果",
      "拆成交付步骤和边界",
      "明确客户拿到什么变化"
    ]
  },
  pricing_card: {
    judgment: "定价不是越低越容易成交。先用三层价格测试客户对不同结果的付费意愿。",
    bullets: [
      "入门层：降低首次决策成本",
      "标准层：覆盖核心交付结果",
      "进阶层：承接更高价值客户"
    ]
  },
  outreach_script: {
    judgment: "触达话术可以先放轻一点，先让对方愿意说出现状和痛点。",
    bullets: [
      "先点出一个具体场景",
      "再问一个容易回答的问题",
      "最后给一个低成本下一步"
    ]
  },
  business_health: {
    judgment: "体检的重点是找出当前最影响现金流和增长的一个环节，而不是做复杂报表。",
    bullets: [
      "检查收入来源是否稳定",
      "检查获客和交付是否卡住",
      "检查下一步是否能形成复利"
    ]
  },
  park_match: {
    judgment: "园区政策只适合在业务方向基本明确后承接，不应该反过来决定你做什么项目。",
    bullets: [
      "确认主体和业务范围是否匹配",
      "看政策能否降低实际成本",
      "避免为了政策改变项目方向"
    ]
  },
  profit_first: {
    judgment: "利润分配要先保证现金流安全，再考虑扩张投入，否则项目容易越做越忙但不赚钱。",
    bullets: [
      "先留出运营和税费成本",
      "再设置个人收入和利润池",
      "最后决定可再投入预算"
    ]
  },
  asset_radar: {
    judgment: "资产雷达图不是履历总结，而是判断哪些优势真的能变成商业方向。",
    bullets: [
      "能力决定你能交付什么",
      "资源决定你能触达谁",
      "认知决定你能否判断需求",
      "关系决定你能否启动第一批反馈"
    ]
  }
};

const STATUS_LABELS = {
  generated: "已生成",
  confirmed: "已确认",
  draft: "待确认",
  running: "进行中",
  stale: "需更新",
  failed: "生成失败",
  done: "已完成"
};

const AGENT_ROLE_META = {
  yishu: { name: "一树", color: "#0D0D0D" },
  waibao: { name: "一树 · 挖宝", color: "#534AB7" },
  asset: { name: "一树 · 挖宝", color: "#534AB7" },
  execution: { name: "一树 · 搞钱", color: "#10A37F" },
  gaoqian: { name: "一树 · 搞钱", color: "#10A37F" },
  mindset: { name: "一树 · 扎心", color: "#E24B4A" },
  zhaxin: { name: "一树 · 扎心", color: "#E24B4A" },
  steward: { name: "一树 · 管家", color: "#378ADD" },
  guanjia: { name: "一树 · 管家", color: "#378ADD" }
};

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value == null ? "" : value).trim();
}

function firstString(...values) {
  for (const value of values) {
    const text = safeString(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function tryParseJson(value) {
  if (isObject(value)) {
    return { data: value, rawText: "" };
  }
  if (Array.isArray(value)) {
    return { data: { items: value }, rawText: "" };
  }

  const text = safeString(value);
  if (!text) {
    return { data: {}, rawText: "" };
  }

  try {
    const parsed = JSON.parse(text);
    if (isObject(parsed)) {
      return { data: parsed, rawText: "" };
    }
    if (Array.isArray(parsed)) {
      return { data: { items: parsed }, rawText: "" };
    }
  } catch (_error) {
    return { data: {}, rawText: text };
  }

  return { data: {}, rawText: text };
}

function formatRelativeTime(value) {
  const text = safeString(value);
  if (!text) {
    return "刚刚";
  }

  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) {
    return text;
  }

  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return "刚刚";
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`;
  }

  return `${new Date(time).getMonth() + 1}/${new Date(time).getDate()}`;
}

function withMessageMeta(messages = []) {
  return messages.map((message) => {
    if (message.sender !== "agent") {
      return message;
    }

    const agentMeta = getAgentMeta(message.agentKey);
    return {
      ...message,
      bubbleColor: agentMeta.bubbleBorder
    };
  });
}

function buildPendingConversation(messages = [], userText = "") {
  const seed = Date.now();
  return messages.concat([
    {
      id: `project-user-${seed}`,
      sender: "user",
      text: userText
    },
    {
      id: `project-agent-${seed + 1}`,
      sender: "agent",
      text: "一树正在思考中...",
      agentKey: "execution"
    }
  ]);
}

function patchConversationMessage(messages = [], messageId = "", patch = {}) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    return {
      ...message,
      ...patch
    };
  });
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

function formatOpportunitySummary(summary = null) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const scoreObject =
    summary.opportunityScore && typeof summary.opportunityScore === "object"
      ? summary.opportunityScore
      : null;
  const totalScore = scoreObject
    ? normalizeHundredScore(
      firstNumber(scoreObject.totalScore, scoreObject.score, scoreObject.displayScore),
      scoreObject.maxScore || 100
    )
    : 0;
  const scoreText = totalScore > 0 ? `${totalScore}/100` : "待评分";

  return {
    ...summary,
    opportunityStageLabel: OPPORTUNITY_STAGE_LABELS[summary.opportunityStage] || "待识别",
    decisionStatusLabel: DECISION_STATUS_LABELS[summary.decisionStatus] || "待判断",
    rawScoreText: scoreText,
    scoreText
  };
}

function decorateProject(project = {}) {
  const source = project && typeof project === "object" ? project : {};
  return {
    ...source,
    opportunitySummary: formatOpportunitySummary(source.opportunitySummary || null)
  };
}

function inferAgentRole(raw = {}, artifactType = "") {
  const explicit = firstString(raw.agentRole, raw.agent_role, raw.sourceAgentRole, raw.source_agent_role);
  if (explicit) {
    return explicit;
  }

  if (/park|profit|business_health/.test(artifactType)) {
    return "steward";
  }
  if (/followup|validation|pricing|outreach|product/.test(artifactType)) {
    return "execution";
  }
  return "waibao";
}

function normalizeStatus(value) {
  const status = safeString(value || "generated").toLowerCase();
  if (STATUS_LABELS[status]) {
    return status;
  }
  if (status === "completed") {
    return "confirmed";
  }
  if (status === "pending") {
    return "draft";
  }
  return "generated";
}

function normalizeMetrics(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item) {
        return null;
      }
      if (typeof item === "string") {
        return { label: "指标", value: item };
      }
      return {
        label: firstString(item.label, item.name),
        value: firstString(item.value, item.score, item.count)
      };
    })
    .filter((item) => item && item.label && item.value)
    .slice(0, 3);
}

function extractMetrics(data = {}, artifactType = "") {
  const explicit = normalizeMetrics(data.metrics || data.stats);
  if (explicit.length) {
    return explicit;
  }

  const scoreCard = normalizeOpportunityScoreCard(data, artifactType);
  if (scoreCard) {
    return scoreCard.metrics;
  }

  const directions = safeArray(data.directions || data.candidates || data.options);
  if (directions.length) {
    const bestScore = directions.reduce((best, item) => {
      const score = Number(item && (item.score || item.totalScore || item.rating));
      return Number.isFinite(score) ? Math.max(best, score) : best;
    }, 0);
    return [
      { label: "候选方向", value: `${directions.length}个` },
      bestScore > 0 ? { label: "最高评分", value: String(bestScore) } : null,
      { label: "建议", value: "验证" }
    ].filter(Boolean);
  }

  const tasks = safeArray(data.tasks || data.actions || data.validationActions);
  if (tasks.length) {
    return [
      { label: "动作", value: `${tasks.length}个` },
      { label: "建议", value: "验证" }
    ];
  }

  const dimensions = safeArray(data.dimensions);
  if (dimensions.length) {
    const avg = Math.round(
      dimensions.reduce((sum, item) => sum + Number(item && item.score || 0), 0) / dimensions.length
    );
    return [
      { label: "维度", value: `${dimensions.length}项` },
      { label: "平均分", value: String(avg || "-") }
    ];
  }

  if (safeString(data.totalScore || data.score)) {
    return [
      { label: artifactType === "opportunity_score" ? "总分" : "评分", value: safeString(data.totalScore || data.score) },
      safeString(data.demandLevel) ? { label: "需求", value: safeString(data.demandLevel) } : null,
      safeString(data.competitionLevel) ? { label: "竞争", value: safeString(data.competitionLevel) } : null
    ].filter(Boolean).slice(0, 3);
  }

  return [];
}

function normalizeOpportunityScoreCard(data = {}, artifactType = "") {
  const cardSource = isObject(data.scoreCard) ? data.scoreCard : {};
  const scoreSource = isObject(data.opportunityScore) ? data.opportunityScore : {};
  const isScoreArtifact = artifactType === "opportunity_score" || isObject(data.scoreCard);
  if (!isScoreArtifact) {
    return null;
  }

  const declaredMaxScore = normalizePositiveNumber(
    cardSource.maxScore || scoreSource.maxScore || data.maxScore || 100,
    100
  );
  const explicitDisplayScore = firstNumber(
    cardSource.displayScore,
    scoreSource.displayScore,
    data.displayScore,
    data.totalScore30,
    data.score30
  );
  const rawTotalScore = firstNumber(scoreSource.totalScore, data.totalScore, data.score, cardSource.totalScore);
  const displayScore = Number.isFinite(rawTotalScore)
    ? normalizeHundredScore(rawTotalScore, scoreSource.maxScore || data.maxScore || 100)
    : normalizeHundredScore(explicitDisplayScore, declaredMaxScore);
  const maxScore = 100;
  const scoreText = displayScore > 0 ? `${displayScore}/${maxScore}` : "待评分";
  const demandLevel = firstString(cardSource.demandLevel, scoreSource.demandLevel, data.demandLevel, "待确认");
  const competitionLevel = firstString(cardSource.competitionLevel, scoreSource.competitionLevel, data.competitionLevel, "待确认");
  const decisionLabel = firstString(cardSource.decisionLabel, scoreSource.decisionLabel, data.decisionLabel, "待确认");
  const recommendation = normalizeOpportunityScoreCopy(
    firstString(
      cardSource.recommendation,
      scoreSource.recommendation,
      data.recommendation,
      data.summary,
      `当前方向综合 ${scoreText}，建议先进入客户验证，把真实反馈收回来。`
    ),
    scoreText
  );

  return {
    scoreText,
    displayScore,
    maxScore,
    demandLevel,
    competitionLevel,
    decisionLabel,
    recommendation,
    metrics: [
      { label: "总分", value: scoreText },
      { label: "需求", value: demandLevel },
      { label: "竞争", value: competitionLevel }
    ]
  };
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

function normalizeHundredScore(value, declaredMax = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const maxScore = Number(declaredMax);
  if (Number.isFinite(maxScore) && maxScore > 0 && maxScore < 100 && parsed <= maxScore) {
    return clampDisplayScore((parsed / maxScore) * 100, 100);
  }
  return clampDisplayScore(parsed, 100);
}

function normalizeOpportunityScoreCopy(text, scoreText) {
  const source = String(text || "").trim();
  if (!source || scoreText === "待评分") {
    return source;
  }
  return source
    .replace(/当前方向综合\s*\d+(?:\.\d+)?\s*\/\s*\d+/g, `当前方向综合 ${scoreText}`)
    .replace(/\d+(?:\.\d+)?\s*\/\s*30/g, scoreText);
}

function clampDisplayScore(value, maxScore) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(maxScore, Math.max(0, Math.round(value)));
}

function extractBullets(data = {}) {
  const sources = [
    data.bullets,
    data.keyPoints,
    data.key_points,
    data.actions,
    data.tasks,
    data.directions,
    data.candidates,
    data.next_questions
  ];

  for (const source of sources) {
    const list = safeArray(source)
      .map((item, index) => {
        if (typeof item === "string") {
          return item;
        }
        if (!isObject(item)) {
          return "";
        }
        return firstString(
          item.label,
          item.title,
          item.name,
          item.summary,
          item.description,
          item.question,
          `方向${index + 1}：${firstString(item.corePain, item.targetUser)}`
        );
      })
      .filter(Boolean)
      .slice(0, 8);

    if (list.length) {
      return list;
    }
  }

  return [];
}

function normalizeTags(value, fallback = []) {
  const tags = safeArray(value)
    .map((item) => safeString(item))
    .filter(Boolean);
  return (tags.length ? tags : fallback).slice(0, 5);
}

function normalizeComparableText(value) {
  return safeString(value).replace(/\s+/g, "").replace(/[，。,.!?！？：:；;]/g, "");
}

function distinctText(value, references = []) {
  const text = safeString(value);
  if (!text) {
    return "";
  }
  const comparable = normalizeComparableText(text);
  const duplicated = references.some((item) => {
    const reference = normalizeComparableText(item);
    return reference && reference === comparable;
  });
  return duplicated ? "" : text;
}

function normalizeArtifact(raw = {}) {
  const source = isObject(raw) ? raw : {};
  const rawType = firstString(source.artifact_type, source.artifactType, source.type, source.card_type, source.cardType);
  const typeMeta = ARTIFACT_TYPE_MAP[rawType] || ARTIFACT_TYPE_MAP[source.resultType] || {};
  const artifactType = typeMeta.type || rawType || "project_artifact";
  const contentSource = source.data || source.payload || source.content || source.meta || source.result || {};
  const parsed = tryParseJson(contentSource);
  const data = parsed.data || {};
  const agentRole = inferAgentRole(source, artifactType);
  const agentMeta = AGENT_ROLE_META[agentRole] || AGENT_ROLE_META.waibao;
  const status = normalizeStatus(firstString(source.status, source.state, data.status));
  const title = firstString(
    source.title,
    source.name,
    data.title,
    data.projectName,
    data.name,
    typeMeta.title,
    "项目成果"
  );
  const summary = firstString(
    source.summary,
    source.description,
    data.summary,
    data.oneLineSummary,
    data.oneLinePositioning,
    data.intro,
    parsed.rawText,
    "这个成果已经沉淀到项目资产库，可继续查看或带回对话完善。"
  );
  const stage = firstString(data.stage, typeMeta.stage, source.stage, "方向判断");
  const category = firstString(data.category, typeMeta.category, source.category, "方向");
  const updatedAt = firstString(source.updatedAt, source.updated_at, source.createdAt, source.created_at, data.updatedAt);
  const tags = normalizeTags(source.tags || data.tags || data.keywords, typeMeta.tags || [category]);
  const scoreCard = normalizeOpportunityScoreCard(data, artifactType);
  const metrics = extractMetrics(data, artifactType);
  const intro = firstString(data.intro, data.oneLineSummary, data.summary, summary);
  const rawJudgment = firstString(data.judgment, data.yishuJudgment, data.yishu_judgment, data.recommendation, data.nextRecommendation);
  const fallbackDetail = ARTIFACT_DETAIL_FALLBACKS[artifactType] || {};
  const extractedBullets = extractBullets(data);
  const details = {
    intro,
    judgment: distinctText(rawJudgment, [summary, intro]) || distinctText(fallbackDetail.judgment, [summary, intro]),
    bullets: extractedBullets.length ? extractedBullets : safeArray(fallbackDetail.bullets),
    rawText: parsed.rawText && parsed.rawText !== summary ? parsed.rawText : ""
  };

  return {
    id: firstString(source.id, source.resultId, source.result_id, source.artifactId, source.artifact_id, `${artifactType}-${Date.now()}`),
    artifact_type: artifactType,
    raw_artifact_type: rawType || artifactType,
    title,
    summary,
    source_agent_name: firstString(source.source_agent_name, source.sourceAgentName, data.source_agent_name, agentMeta.name),
    agent_role: agentRole,
    agentColor: agentMeta.color,
    stage,
    category,
    status,
    statusLabel: STATUS_LABELS[status] || "已生成",
    updated_at: formatRelativeTime(updatedAt),
    tags,
    metrics,
    scoreCard,
    isOpportunityScoreCard: !!scoreCard,
    details,
    showConfirm: status === "draft",
    actions: [
      { key: "view", label: "查看" },
      status === "draft" ? { key: "confirm", label: "确认" } : null,
      { key: "continue", label: "继续聊" }
    ].filter(Boolean),
    raw: source
  };
}

function normalizeArtifacts(rawArtifacts = []) {
  return safeArray(rawArtifacts).map(normalizeArtifact);
}

function buildArtifactOverview(artifacts = [], project = {}, serverOverview = null) {
  const count = artifacts.length;
  const remote = isObject(serverOverview) ? serverOverview : {};
  const explicitTarget =
    remote.targetCount ||
    remote.totalTarget ||
    project.artifactTarget ||
    (project.artifactOverview && project.artifactOverview.totalTarget);
  const configuredTarget = Number(explicitTarget);
  const hasConfiguredTarget = Number.isFinite(configuredTarget) && configuredTarget > 0;
  const target = hasConfiguredTarget ? configuredTarget : Math.max(DEFAULT_ARTIFACT_PROGRESS_TARGET, count);
  const completedCount = artifacts.filter((item) => COMPLETED_ARTIFACT_STATUSES.has(item.status)).length;
  const overviewCompletedCount = Number(remote.completedCount || remote.doneCount || 0);
  const finalCompletedCount = overviewCompletedCount > 0 ? overviewCompletedCount : completedCount;
  const showProgress = count > 0 || (remote.showProgress !== false && hasConfiguredTarget);
  const cappedCompletedCount = Math.min(finalCompletedCount, target);
  const progressPercent = showProgress
    ? Math.min(100, Math.max(0, Math.round((cappedCompletedCount / target) * 100)))
    : 100;
  const nextStep = firstString(
    remote.nextStep,
    project.nextRecommendation,
    project.nextValidationAction,
    project.currentFollowupCycle && project.currentFollowupCycle.nextRecommendation,
    "完成第 1 轮客户验证，拿到真实反馈。"
  );

  return {
    title: firstString(remote.title, count ? `已沉淀 ${count} 项成果` : "还没有成果"),
    subtitle: firstString(remote.subtitle, `下一步：${nextStep}`),
    hint: firstString(remote.hint, count ? "别只收藏成果，今天要拿一个去验证。" : "一树会先帮你把方向、客户和验证动作沉淀下来。"),
    ctaText: firstString(remote.ctaText, count ? "去验证" : "回到对话"),
    progressText: showProgress ? firstString(remote.progressText, `${cappedCompletedCount}/${target}`) : "",
    progressPercent,
    showProgress
  };
}

function buildArtifactGroups(artifacts = [], activeFilter = "all") {
  const filtered = activeFilter === "all"
    ? artifacts
    : artifacts.filter((item) => item.category === activeFilter);
  const knownGroups = STAGE_ORDER
    .map((stage) => {
      const items = filtered.filter((item) => item.stage === stage);
      return {
        stage,
        count: items.length,
        countText: `${items.length} 项`,
        items
      };
    })
    .filter((group) => group.items.length);
  const knownStages = new Set(STAGE_ORDER);
  const uncategorizedItems = filtered.filter((item) => !knownStages.has(item.stage));
  const groups = uncategorizedItems.length
    ? [
        ...knownGroups,
        {
          stage: "其他成果",
          count: uncategorizedItems.length,
          countText: `${uncategorizedItems.length} 项`,
          items: uncategorizedItems
        }
      ]
    : knownGroups;

  return {
    groups,
    hasVisibleArtifacts: filtered.length > 0,
    emptyTitle: artifacts.length ? "还没有这类成果" : "还没有成果",
    emptyDesc: artifacts.length
      ? "先去对话里让一树继续推进这个阶段。"
      : "一树会先帮你把方向、客户和验证动作沉淀下来。你不用整理文档，继续聊就行。"
  };
}

function buildContinuePayload(artifact = {}, projectId = "") {
  const title = artifact.title || "这个成果";
  return {
    scene: "project_artifact_continue",
    target: projectId,
    userText: `我们继续完善「${title}」`,
    routeAction: "project_execution_followup",
    metadata: {
      artifactId: artifact.id || "",
      artifactType: artifact.artifact_type || "",
      title
    }
  };
}

function updateArtifactStatus(list = [], artifactId = "", status = "confirmed") {
  return list.map((item) => {
    if (item.id !== artifactId) {
      return item;
    }
    return {
      ...item,
      status,
      statusLabel: STATUS_LABELS[status] || item.statusLabel,
      showConfirm: status === "draft"
    };
  });
}

Page({
  data: {
    loading: true,
    error: false,
    sending: false,
    activeTab: "conversation",
    navMetrics: getNavMetrics(),
    headerStyle: "",
    composerPlaceholder: "跟一树继续聊这个项目...",
    project: {
      conversation: [],
      artifacts: [],
      conversationReplies: []
    },
    localConversation: [],
    rawArtifacts: [],
    artifactLibrary: [],
    artifactGroups: [],
    artifactOverview: buildArtifactOverview([], {}),
    artifactFilters: ARTIFACT_FILTERS,
    activeArtifactFilter: "all",
    hasVisibleArtifacts: false,
    artifactEmptyTitle: "还没有成果",
    artifactEmptyDesc: "一树会先帮你把方向、客户和验证动作沉淀下来。你不用整理文档，继续聊就行。",
    selectedArtifact: null,
    artifactDetailVisible: false,
    artifactContextPlaceholder: ""
  },

  onLoad(options) {
    if (!ensureLoggedIn()) {
      return;
    }

    this.projectId = options.id || "media-service";
    this.syncLayout();
    this.loadProjectDetail();
  },

  onShow() {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    if (this.projectId) {
      this.loadProjectDetail({
        silent: true
      });
    }
  },

  onUnload() {
    if (this.projectStreamTask && typeof this.projectStreamTask.abort === "function") {
      this.projectStreamTask.abort();
      this.projectStreamTask = null;
    }
    if (this.projectTextFlushTimer) {
      clearTimeout(this.projectTextFlushTimer);
      this.projectTextFlushTimer = null;
    }
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 12}px;`
    });
  },

  loadProjectDetail(options = {}) {
    if (!options.silent) {
      this.setData({
        loading: true,
        error: false
      });
    }

    fetchProjectDetail(this.projectId)
      .then((project) => {
        const safeProject = decorateProject(project || {
          conversation: [],
          artifacts: [],
          conversationReplies: []
        });
        this.setData({
          loading: false,
          error: false,
          project: safeProject,
          localConversation: withMessageMeta(safeProject.conversation || [])
        });

        this.loadProjectResults(true);
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          project: this.data.project,
          localConversation: withMessageMeta(this.data.project.conversation || [])
        });
      });
  },

  handleRetry() {
    this.loadProjectDetail();
  },

  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: "/pages/conversation/conversation"
        });
      }
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab;
    const placeholder = activeTab === "results"
      ? (this.data.artifactContextPlaceholder || "问一树怎么用这些成果...")
      : "跟一树继续聊这个项目...";

    this.setData({
      activeTab,
      composerPlaceholder: placeholder
    });

    if (activeTab === "results") {
      this.loadProjectResults(true);
    }
  },

  loadProjectResults(silent = false) {
    fetchProjectResults(this.projectId)
      .then((payload) => {
        const payloadObject = isObject(payload) ? payload : {};
        const rawArtifacts = Array.isArray(payload)
          ? payload
          : safeArray(payload && (payload.items || payload.results || payload.artifacts));
        this.applyArtifactState(rawArtifacts, payloadObject.overview || payloadObject.artifactOverview || null);
      })
      .catch(() => {
        if (!silent) {
          wx.showToast({
            title: "项目成果同步失败",
            icon: "none"
          });
        }
      });
  },

  applyArtifactState(rawArtifacts = [], serverOverview = null) {
    const artifactLibrary = normalizeArtifacts(rawArtifacts);
    const grouped = buildArtifactGroups(artifactLibrary, this.data.activeArtifactFilter);
    const artifactOverview = buildArtifactOverview(artifactLibrary, this.data.project || {}, serverOverview);

    this.setData({
      rawArtifacts,
      artifactLibrary,
      artifactOverview,
      artifactGroups: grouped.groups,
      hasVisibleArtifacts: grouped.hasVisibleArtifacts,
      artifactEmptyTitle: grouped.emptyTitle,
      artifactEmptyDesc: grouped.emptyDesc,
      project: {
        ...this.data.project,
        artifacts: artifactLibrary
      }
    });
  },

  handleArtifactFilterTap(event) {
    const key = String(event.currentTarget.dataset.key || "all");
    if (key === this.data.activeArtifactFilter) {
      return;
    }
    const grouped = buildArtifactGroups(this.data.artifactLibrary, key);
    this.setData({
      activeArtifactFilter: key,
      artifactGroups: grouped.groups,
      hasVisibleArtifacts: grouped.hasVisibleArtifacts,
      artifactEmptyTitle: grouped.emptyTitle,
      artifactEmptyDesc: grouped.emptyDesc
    });
  },

  handleArtifactOverviewCta() {
    this.setData({
      activeTab: "conversation",
      composerPlaceholder: "跟一树继续聊这个项目..."
    });
  },

  handleResultsEmptyBackToConversation() {
    this.setData({
      activeTab: "conversation",
      composerPlaceholder: "跟一树继续聊这个项目..."
    });
  },

  handleArtifactAction(event) {
    const detail = event.detail || {};
    const action = detail.action;
    const item = detail.item || {};
    if (action === "view") {
      this.openArtifactDetail(item);
      return;
    }
    if (action === "continue") {
      this.continueWithArtifact(item);
      return;
    }
    if (action === "share") {
      this.shareArtifact(item);
      return;
    }
    if (action === "confirm") {
      this.confirmArtifact(item);
    }
  },

  async openArtifactDetail(item = {}) {
    if (!item || !item.id) {
      return;
    }

    try {
      const detail = await fetchResultDetail(item.id);
      const normalized = normalizeArtifact({
        ...item.raw,
        ...detail,
        id: detail && (detail.id || detail.resultId || detail.artifactId) || item.id
      });
      this.setData({
        selectedArtifact: normalized,
        artifactDetailVisible: true
      });
    } catch (_error) {
      this.setData({
        selectedArtifact: item,
        artifactDetailVisible: true
      });
    }
  },

  handleArtifactDetailClose() {
    this.setData({
      artifactDetailVisible: false
    });
  },

  handleArtifactDetailContinue(event) {
    const artifact = (event.detail && event.detail.artifact) || this.data.selectedArtifact || {};
    this.continueWithArtifact(artifact);
  },

  handleArtifactDetailShare(event) {
    const artifact = (event.detail && event.detail.artifact) || this.data.selectedArtifact || {};
    this.shareArtifact(artifact);
  },

  continueWithArtifact(item = {}) {
    const artifact = item || {};
    const payload = buildContinuePayload(artifact, this.projectId || (this.data.project && this.data.project.id) || "");
    const placeholder = `继续完善「${artifact.title || "这个成果"}」...`;

    this.setData({
      artifactDetailVisible: false,
      artifactContextPlaceholder: placeholder,
      composerPlaceholder: placeholder
    });

    const opener = this.getOpenerEventChannel ? this.getOpenerEventChannel() : null;
    if (opener && opener.emit) {
      opener.emit("projectResultCta", payload);
      wx.navigateBack();
      return;
    }

    const metadata = encodeURIComponent(JSON.stringify(payload.metadata || {}));
    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=${encodeURIComponent(payload.scene)}&target=${encodeURIComponent(payload.target)}&userText=${encodeURIComponent(payload.userText)}&routeAction=${encodeURIComponent(payload.routeAction)}&metadata=${metadata}`
    });
  },

  async shareArtifact(item = {}) {
    if (!item || !item.id) {
      return;
    }

    try {
      await shareResultCard({
        resultId: item.id,
        title: item.title,
        resultTitle: item.title
      });
      wx.showToast({
        title: "分享卡已生成",
        icon: "success"
      });
    } catch (_error) {
      const fallbackText = firstString(
        item.summary,
        `${item.title || "项目成果"}：${item.details && item.details.intro || ""}`
      );
      if (!fallbackText) {
        wx.showToast({
          title: "分享暂不可用",
          icon: "none"
        });
        return;
      }
      wx.setClipboardData({
        data: fallbackText,
        success: () => {
          wx.showToast({
            title: "已复制成果摘要",
            icon: "success"
          });
        },
        fail: () => {
          wx.showToast({
            title: "分享暂不可用",
            icon: "none"
          });
        }
      });
    }
  },

  confirmArtifact(item = {}) {
    if (!item || !item.id || item.status !== "draft") {
      return;
    }

    // TODO: 后端确认接口接好后，替换为真实持久化；当前刷新后以服务端状态为准。
    const artifactLibrary = updateArtifactStatus(this.data.artifactLibrary, item.id, "confirmed");
    const grouped = buildArtifactGroups(artifactLibrary, this.data.activeArtifactFilter);
    this.setData({
      artifactLibrary,
      artifactGroups: grouped.groups,
      hasVisibleArtifacts: grouped.hasVisibleArtifacts,
      artifactEmptyTitle: grouped.emptyTitle,
      artifactEmptyDesc: grouped.emptyDesc,
      selectedArtifact: this.data.selectedArtifact && this.data.selectedArtifact.id === item.id
        ? {
          ...this.data.selectedArtifact,
          status: "confirmed",
          statusLabel: STATUS_LABELS.confirmed,
          showConfirm: false
        }
        : this.data.selectedArtifact
    });
    wx.showToast({
      title: "本次已标记为确认",
      icon: "success"
    });
  },

  handleQuickReplyTap(event) {
    const text = String(event.currentTarget.dataset.text || "").trim();
    if (!text) {
      return;
    }

    this.submitProjectMessage(text);
  },

  handleResultCta(event) {
    const { item } = event.detail || {};
    this.continueWithArtifact(item || {});
  },

  async handleResultDetail(event) {
    const item = event && event.detail ? event.detail.item : null;
    this.openArtifactDetail(item || {});
  },

  async handleResultShare(event) {
    const item = event && event.detail ? event.detail.item : null;
    this.shareArtifact(item || {});
  },

  async handleProjectFollowupSubscribe(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const projectId = dataset.projectId || this.projectId || "";
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
            ? "当前微信版本不支持订阅提醒"
            : "未开启提醒",
        icon: "none"
      });
    } catch (error) {
      wx.showToast({
        title: "开启提醒失败",
        icon: "none"
      });
    }
  },

  handleSend(event) {
    const value = event.detail && event.detail.value ? String(event.detail.value).trim() : "";
    if (!value) {
      return;
    }
    this.submitProjectMessage(value);
  },

  async submitProjectMessageLegacy(value) {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }

    if (this.data.sending) {
      wx.showToast({
        title: "正在回复中，请稍等",
        icon: "none"
      });
      return;
    }

    const optimisticConversation = withMessageMeta(buildPendingConversation(this.data.localConversation, text));
    this.setData({
      sending: true,
      localConversation: optimisticConversation
    });

    try {
      const result = await sendProjectMessage(this.projectId, {
        message: text
      });

      const nextConversation = withMessageMeta(Array.isArray(result && result.conversation) ? result.conversation : []);
      const nextReplies = Array.isArray(result && result.conversationReplies)
        ? result.conversationReplies
        : this.data.project.conversationReplies;
      const nextProject = decorateProject({
        ...this.data.project,
        conversation: Array.isArray(result && result.conversation) ? result.conversation : this.data.project.conversation,
        conversationReplies: nextReplies,
        opportunitySummary: result && result.opportunitySummary ? result.opportunitySummary : this.data.project.opportunitySummary
      });

      this.setData({
        sending: false,
        project: nextProject,
        localConversation: nextConversation
      });
    } catch (error) {
      const failedConversation = optimisticConversation.slice(0, -1).concat([withMessageMeta([{
        id: `project-error-${Date.now()}`,
        sender: "agent",
        text: String((error && error.message) || "项目对话发送失败，请稍后重试"),
        agentKey: "execution"
      }])[0]]);

      this.setData({
        sending: false,
        localConversation: failedConversation
      });
    }
  },

  async submitProjectMessage(value) {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }

    if (this.data.sending) {
      wx.showToast({
        title: "\u6b63\u5728\u56de\u590d\u4e2d\uff0c\u8bf7\u7a0d\u7b49",
        icon: "none"
      });
      return;
    }

    const optimisticConversation = withMessageMeta(buildPendingConversation(this.data.localConversation, text));
    const pendingAgent = optimisticConversation[optimisticConversation.length - 1] || {};
    const pendingAgentId = pendingAgent.id || "";
    this.setData({
      sending: true,
      localConversation: optimisticConversation
    });

    try {
      let startedDelta = false;
      let completedPayload = null;
      let renderedText = "";
      let drainResolver = null;
      this.projectTextBuffer = "";
      const flushTextBuffer = () => {
        if (!this.projectTextBuffer) {
          if (drainResolver) {
            drainResolver();
            drainResolver = null;
          }
          return;
        }
        const { chunk, rest } = takeTypewriterChunk(this.projectTextBuffer);
        this.projectTextBuffer = rest;
        const current = this.data.localConversation || [];
        renderedText = `${startedDelta ? renderedText : ""}${chunk}`;
        startedDelta = true;
        this.setData({
          localConversation: withMessageMeta(patchConversationMessage(current, pendingAgentId, {
            text: renderedText
          }))
        });
        if (this.projectTextBuffer) {
          this.projectTextFlushTimer = setTimeout(() => {
            this.projectTextFlushTimer = null;
            flushTextBuffer();
          }, STREAM_TYPEWRITER_INTERVAL_MS);
        } else if (drainResolver) {
          drainResolver();
          drainResolver = null;
        }
      };
      const waitTextBufferDrained = () => {
        if (!this.projectTextBuffer && !this.projectTextFlushTimer) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          drainResolver = resolve;
        });
      };
      const scheduleFlush = () => {
        if (this.projectTextFlushTimer) {
          return;
        }
        this.projectTextFlushTimer = setTimeout(() => {
          this.projectTextFlushTimer = null;
          flushTextBuffer();
        }, STREAM_TYPEWRITER_INTERVAL_MS);
      };
      this.projectStreamTask = startProjectMessageStream(this.projectId, {
        message: text
      }, {
        onEvent: ({ event, data }) => {
          if (event === "assistant.text.delta" && data && data.delta) {
            this.projectTextBuffer += String(data.delta || "");
            scheduleFlush();
            return;
          }

          if (event === "assistant.text.done" && data && typeof data.content === "string") {
            const finalText = data.content;
            const displayedOrQueued = `${renderedText}${this.projectTextBuffer || ""}`;
            if (finalText.startsWith(displayedOrQueued)) {
              this.projectTextBuffer = finalText.slice(displayedOrQueued.length);
            } else {
              renderedText = "";
              startedDelta = true;
              this.projectTextBuffer = finalText;
              this.setData({
                localConversation: withMessageMeta(patchConversationMessage(this.data.localConversation || [], pendingAgentId, {
                  text: ""
                }))
              });
            }
            if (!this.projectTextFlushTimer) {
              scheduleFlush();
            }
            return;
          }

          if (event === "project.chat.completed") {
            completedPayload = data || null;
          }
        }
      });

      await this.projectStreamTask.promise;
      flushTextBuffer();
      await waitTextBufferDrained();
      this.projectStreamTask = null;

      const result = completedPayload || {};
      const nextConversation = withMessageMeta(Array.isArray(result.conversation) ? result.conversation : this.data.localConversation);
      const nextReplies = Array.isArray(result.conversationReplies)
        ? result.conversationReplies
        : this.data.project.conversationReplies;
      const nextProject = decorateProject({
        ...this.data.project,
        conversation: Array.isArray(result.conversation) ? result.conversation : this.data.project.conversation,
        conversationReplies: nextReplies,
        opportunitySummary: result.opportunitySummary ? result.opportunitySummary : this.data.project.opportunitySummary
      });

      this.setData({
        sending: false,
        project: nextProject,
        localConversation: nextConversation
      });
    } catch (error) {
      if (this.projectStreamTask) {
        this.projectStreamTask = null;
      }
      if (this.projectTextFlushTimer) {
        clearTimeout(this.projectTextFlushTimer);
        this.projectTextFlushTimer = null;
      }
      try {
        const result = await sendProjectMessage(this.projectId, {
          message: text
        });
        const nextConversation = withMessageMeta(Array.isArray(result && result.conversation) ? result.conversation : []);
        const nextReplies = Array.isArray(result && result.conversationReplies)
          ? result.conversationReplies
          : this.data.project.conversationReplies;
        const nextProject = decorateProject({
          ...this.data.project,
          conversation: Array.isArray(result && result.conversation) ? result.conversation : this.data.project.conversation,
          conversationReplies: nextReplies,
          opportunitySummary: result && result.opportunitySummary ? result.opportunitySummary : this.data.project.opportunitySummary
        });
        this.setData({
          sending: false,
          project: nextProject,
          localConversation: nextConversation
        });
      } catch (fallbackError) {
        const failedConversation = optimisticConversation.slice(0, -1).concat([withMessageMeta([{
          id: `project-error-${Date.now()}`,
          sender: "agent",
          text: String((fallbackError && fallbackError.message) || (error && error.message) || "\u9879\u76ee\u5bf9\u8bdd\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5"),
          agentKey: "execution"
        }])[0]]);

        this.setData({
          sending: false,
          localConversation: failedConversation
        });
      }
    }
  }
});
