const STEPS = [
  {
    key: "collect_facts",
    label: "整理你的经历和技能",
    status: "pending",
    description: "已提取 12 条有效信息，过滤掉闲聊和重复描述。"
  },
  {
    key: "classify_assets",
    label: "归类到四类资产",
    status: "pending",
    description: "能力、资源、认知、关系已完成初步归类。"
  },
  {
    key: "score_radar",
    label: "计算资产雷达图",
    status: "pending",
    description: "正在判断哪些优势是真的能变成商业方向。"
  },
  {
    key: "write_summary",
    label: "提炼隐藏优势",
    status: "pending",
    description: "会输出一段不废话的优势总结。"
  }
];

const RADAR_PREVIEW = [
  { name: "能力", score: 78, level: "high" },
  { name: "资源", score: 46, level: "medium" },
  { name: "认知", score: 72, level: "high" },
  { name: "关系", score: 38, level: "low" }
];

function buildSteps(currentKey, completed = false, failed = false) {
  const currentIndex = STEPS.findIndex((item) => item.key === currentKey);
  return STEPS.map((item, index) => {
    let status = "pending";
    if (completed || index < currentIndex) status = "done";
    if (index === currentIndex && !completed) status = failed ? "failed" : "running";
    return {
      ...item,
      status
    };
  });
}

function baseCardData() {
  return {
    title: "我正在盘你的底牌",
    subtitle: "不是简单总结聊天记录，而是把你的经历、技能、资源和认知拆开看。",
    status: "running",
    progress: 10,
    current_step: "collect_facts",
    found_assets: [],
    steps: buildSteps("collect_facts")
  };
}

const FRAMES = [
  baseCardData(),
  {
    ...baseCardData(),
    progress: 25,
    found_assets: ["B端SaaS", "产品经理5年", "用户研究"],
    steps: buildSteps("collect_facts")
  },
  {
    ...baseCardData(),
    progress: 40,
    current_step: "classify_assets",
    found_assets: ["B端SaaS", "产品经理5年", "用户研究", "需求拆解"],
    steps: buildSteps("classify_assets")
  },
  {
    ...baseCardData(),
    progress: 58,
    current_step: "score_radar",
    found_assets: ["B端SaaS", "产品经理5年", "用户研究", "需求拆解"],
    steps: buildSteps("score_radar"),
    radar_preview: RADAR_PREVIEW,
    radar_preview_is_final: false
  },
  {
    ...baseCardData(),
    progress: 72,
    current_step: "write_summary",
    found_assets: ["B端SaaS", "产品经理5年", "用户研究", "需求拆解"],
    steps: buildSteps("write_summary"),
    radar_preview: RADAR_PREVIEW,
    radar_preview_is_final: false
  }
];

Page({
  data: {
    cardData: baseCardData()
  },

  onLoad() {
    this.handleReplay();
  },

  onUnload() {
    this.clearTimer();
  },

  clearTimer() {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  },

  handleReplay() {
    this.clearTimer();
    let index = 0;
    this.setData({
      cardData: FRAMES[index]
    });
    this.previewTimer = setInterval(() => {
      index += 1;
      if (index >= FRAMES.length) {
        this.clearTimer();
        return;
      }
      this.setData({
        cardData: FRAMES[index]
      });
    }, 900);
  },

  handleCompleted() {
    this.clearTimer();
    this.setData({
      cardData: {
        ...baseCardData(),
        status: "completed",
        progress: 100,
        current_step: "completed",
        found_assets: ["B端SaaS", "产品经理5年", "用户研究", "需求拆解", "流程自动化"],
        steps: buildSteps("write_summary", true),
        radar_preview: RADAR_PREVIEW,
        radar_preview_is_final: true
      }
    });
  },

  handleFailed() {
    this.clearTimer();
    this.setData({
      cardData: {
        ...baseCardData(),
        status: "failed",
        progress: 100,
        current_step: "write_summary",
        found_assets: ["B端SaaS", "产品经理5年", "用户研究"],
        steps: buildSteps("write_summary", false, true),
        radar_preview: RADAR_PREVIEW,
        radar_preview_is_final: false
      }
    });
  }
});
