export const DEMO_USER_ID = "mock-user-001";

export const DEFAULT_TOOLS = [
  { key: "ai", label: "AI助手" },
  { key: "ip", label: "IP助手" },
  { key: "company", label: "公司" }
];

export const DEFAULT_COMPANY_CARDS = [
  {
    id: "company-park",
    title: "园区入驻",
    icon: "▦",
    badge: "资料审核中",
    rows: [
      { label: "当前状态", value: "资料审核中" },
      { label: "入驻园区", value: "杭州未来科技城" },
      { label: "预计完成", value: "4月15日" }
    ],
    action: "跟一树·管家聊聊进度",
    scene: "company_park_followup"
  },
  {
    id: "company-tax",
    title: "财税状态",
    icon: "$",
    rows: [
      { label: "企业类型", value: "个体工商户" },
      { label: "下次申报", value: "4月15日（15天后）", tone: "danger" },
      { label: "本季预估税", value: "约 2,400 元" }
    ],
    action: "让一树·管家帮我筹划",
    scene: "company_tax_followup"
  },
  {
    id: "company-profit",
    title: "利润优先账户",
    icon: "◷",
    rows: [
      { label: "下次分配日", value: "4月10日" }
    ],
    progress: [
      { label: "利润 30%", value: 30, color: "#10A37F" },
      { label: "薪酬 30%", value: 30, color: "#378ADD" },
      { label: "税务 15%", value: 15, color: "#EBA327" },
      { label: "运营 25%", value: 25, color: "#AFAAA0" }
    ],
    action: "调整分配比例",
    scene: "company_profit_followup"
  },
  {
    id: "company-payroll",
    title: "薪资代发",
    icon: "●",
    rows: [
      { label: "上次发放", value: "3月25日 · 8,000元" },
      { label: "下次发放", value: "4月25日" }
    ],
    action: "查看发放记录",
    scene: "company_payroll_followup"
  }
];

export const AGENT_META = {
  master: {
    key: "master",
    label: "一树OPC",
    shortLabel: "一树",
    color: "#0D0D0D",
    chipBackground: "#F3F1EC",
    bubbleBorder: "#D8D2C7"
  },
  asset: {
    key: "asset",
    label: "一树·挖宝",
    shortLabel: "挖宝",
    color: "#534AB7",
    chipBackground: "#F0ECFF",
    bubbleBorder: "#6A5BE7"
  },
  execution: {
    key: "execution",
    label: "一树·搞钱",
    shortLabel: "搞钱",
    color: "#10A37F",
    chipBackground: "#E9F8F3",
    bubbleBorder: "#10A37F"
  },
  mindset: {
    key: "mindset",
    label: "一树·扎心",
    shortLabel: "扎心",
    color: "#E24B4A",
    chipBackground: "#FDEDEC",
    bubbleBorder: "#EF4444"
  },
  steward: {
    key: "steward",
    label: "一树·管家",
    shortLabel: "管家",
    color: "#378ADD",
    chipBackground: "#EBF4FF",
    bubbleBorder: "#378ADD"
  }
} as const;

const SCENE_AGENT_MAP: Record<string, keyof typeof AGENT_META> = {
  onboarding_intro: "master",
  onboarding_nickname: "master",
  onboarding_rename: "master",
  onboarding_route: "master",
  onboarding_path_explore: "asset",
  onboarding_path_stuck: "mindset",
  onboarding_path_scale: "steward",
  onboarding_path_park: "steward",
  home: "master",
  ai_assistant: "execution",
  ip_assistant: "asset",
  social_proof: "mindset",
  monthly_check: "steward",
  company_park_followup: "steward",
  company_tax_followup: "steward",
  company_profit_followup: "steward",
  company_payroll_followup: "steward",
  project_execution_followup: "execution",
  project_asset_followup: "asset"
};

export function getAgentMeta(agentKey: string) {
  return AGENT_META[agentKey as keyof typeof AGENT_META] || AGENT_META.master;
}

export function inferAgentKeyFromScene(sceneKey = "") {
  if (sceneKey.includes("ai")) {
    return "execution";
  }

  if (sceneKey.includes("ip") || sceneKey.includes("asset")) {
    return "asset";
  }

  if (sceneKey.includes("social")) {
    return "mindset";
  }

  if (sceneKey.includes("company") || sceneKey.includes("monthly")) {
    return "steward";
  }

  return "master";
}

export function resolveSceneAgentKey(sceneKey: string) {
  return SCENE_AGENT_MAP[sceneKey] || inferAgentKeyFromScene(sceneKey);
}

export function getTaskFeedbackReplies() {
  return [
    { label: "好，帮我写", action: "write_followup" },
    { label: "我自己来", action: "self_handle" }
  ];
}

export function buildTaskFeedbackPrompt(taskLabel?: string) {
  const label = String(taskLabel || "这项任务");
  return `${label}已完成，不错。结果怎么样？你想聊聊吗？`;
}

export function buildTaskFeedbackAdvice(userText?: string, taskLabel?: string) {
  const text = String(userText || "").trim();
  const label = String(taskLabel || "任务");

  if (!text) {
    return `先从${label}里挑一个最有希望的线索，我们把他变成今天的唯一优先级。`;
  }

  if (/(问了价格|谈价|贵|预算|考虑)/.test(text)) {
    return "这类回复通常不是拒绝，而是风险担心。你可以先给他一个小范围试运行方案，把决策成本降到最低，转化率会更高。";
  }

  if (/(没回复|没回应|已读不回|石沉大海|不理)/.test(text)) {
    return "这种情况先不要追长消息。建议 24 小时后发一条“你是更倾向 A 还是 B？我可以按你方向准备”的二选一跟进。";
  }

  if (/(感兴趣|意向|愿意|想了解)/.test(text)) {
    return "这是高质量信号。下一步别讲全套，只聚焦一个结果场景，直接约 15 分钟快速演示或答疑。";
  }

  if (/(拒绝|不需要|没需求|算了)/.test(text)) {
    return "这条先收口，不要硬推。但记下对方拒绝的关键词，下次开场先回应这个顾虑。";
  }

  return "这次反馈很有价值。建议你马上复述对方的关键顾虑，再给一个可执行的下一步选项。";
}
