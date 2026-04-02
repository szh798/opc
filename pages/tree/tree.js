const { getNavMetrics } = require("../../utils/nav");

const STATUS_TEXT = {
  done: "已完成",
  doing: "进行中",
  locked: "未解锁"
};

const PHASE_INFO = {
  title: "我的一树",
  tag: "机会验证期",
  subtitle: "你的一树已成长到第3阶段 · 机会验证期",
  caption: "已点亮叶子可点击查看成果卡片"
};

const MILESTONE_LIST = [
  {
    id: "m1",
    stage: 1,
    title: "完成资产盘点",
    meta: "3月28日 · 2片叶子",
    status: "done",
    summary: "你已经把可用资产从“感觉”变成了结构化清单，这是后续增长的底层输入。",
    resultCard: {
      title: "资产雷达",
      type: "score",
      scores: [
        { label: "能力", percent: 76, value: "3.8" },
        { label: "资源", percent: 58, value: "2.9" },
        { label: "认知", percent: 84, value: "4.2" },
        { label: "关系", percent: 66, value: "3.3" }
      ],
      summary: "总分 14.2/20 · 已建立基础盘点",
      meta: "生成于 3月28日 · 一树·挖宝"
    }
  },
  {
    id: "m2",
    stage: 2,
    title: "锁定商业方向",
    meta: "3月29日 · 1片叶子",
    status: "done",
    summary: "方向不再发散，目标客户与交付边界已明确，能够持续推进验证。",
    resultCard: {
      title: "方向句式",
      type: "structure",
      body: [
        "目标客户：中小企业主",
        "核心问题：不会写获客内容",
        "服务方式：代写 + 内容策略",
        "交付节奏：按月迭代"
      ],
      meta: "生成于 3月29日 · 一树·搞钱"
    }
  },
  {
    id: "m3",
    stage: 3,
    title: "完成客户验证",
    meta: "4月2日 · 3片叶子",
    status: "done",
    summary: "你已经拿到初步市场反馈，可基于证据优化成交话术和交付方案。",
    resultCard: {
      title: "机会评分",
      type: "score",
      scores: [
        { label: "痛点", percent: 82, value: "4.1" },
        { label: "频率", percent: 88, value: "4.4" },
        { label: "支付", percent: 72, value: "3.6" },
        { label: "竞争", percent: 52, value: "2.6", warn: true },
        { label: "匹配", percent: 86, value: "4.3" }
      ],
      summary: "总分 19/25 · GO",
      meta: "生成于 4月2日 · 一树·挖宝"
    }
  },
  {
    id: "m4",
    stage: 4,
    title: "通过 Go/No-Go",
    meta: "4月5日 · 1片叶子",
    status: "done",
    summary: "你已完成决策门，通过该节点意味着可以从验证期走向可复制交付。",
    resultCard: {
      title: "三层定价草案",
      type: "pricing",
      tiers: [
        { label: "入门", price: "999" },
        { label: "核心", price: "2999", active: true },
        { label: "高端", price: "6999" }
      ],
      meta: "生成于 4月5日 · 一树·搞钱"
    }
  },
  {
    id: "m5",
    stage: 5,
    title: "拿下第一单",
    meta: "进行中...",
    status: "doing",
    summary: "当前阶段正在推进，继续执行跟进节奏会点亮更多叶子。",
    resultCard: {
      title: "首单跟进面板",
      type: "structure",
      body: [
        "客户状态：2位意向客户待推进",
        "本周目标：完成 1 次小范围试合作",
        "关键动作：发送风险对冲话术 + 48小时跟进",
        "下一步：进入签约与复盘"
      ],
      meta: "更新于 今日 · 一树·搞钱"
    }
  },
  {
    id: "m6",
    stage: 6,
    title: "完成产品化",
    meta: "未解锁",
    status: "locked",
    summary: ""
  },
  {
    id: "m7",
    stage: 7,
    title: "建立三层定价",
    meta: "未解锁",
    status: "locked",
    summary: ""
  },
  {
    id: "m8",
    stage: 8,
    title: "月入稳定",
    meta: "未解锁",
    status: "locked",
    summary: ""
  }
];

const BRANCHES = [
  { id: "b1", side: "left", style: "bottom: 130rpx; width: 132rpx; transform: rotate(-26deg);" },
  { id: "b2", side: "right", style: "bottom: 130rpx; width: 132rpx; transform: rotate(26deg);" },
  { id: "b3", side: "left", style: "bottom: 238rpx; width: 164rpx; transform: rotate(-20deg);" },
  { id: "b4", side: "right", style: "bottom: 238rpx; width: 164rpx; transform: rotate(20deg);" },
  { id: "b5", side: "left", style: "bottom: 356rpx; width: 196rpx; transform: rotate(-16deg);" },
  { id: "b6", side: "right", style: "bottom: 356rpx; width: 196rpx; transform: rotate(16deg);" },
  { id: "b7", side: "left", style: "bottom: 486rpx; width: 144rpx; transform: rotate(-21deg);" },
  { id: "b8", side: "right", style: "bottom: 486rpx; width: 144rpx; transform: rotate(21deg);" },
  { id: "b9", side: "left", style: "bottom: 620rpx; width: 96rpx; transform: rotate(-34deg);" },
  { id: "b10", side: "right", style: "bottom: 620rpx; width: 96rpx; transform: rotate(34deg);" }
];

const LEAF_TEMPLATE = [
  { id: "l1", stage: 1, style: "left: 338rpx; bottom: 172rpx; transform: rotate(20deg);" },
  { id: "l2", stage: 1, style: "left: 382rpx; bottom: 182rpx; transform: rotate(-10deg);" },
  { id: "l3", stage: 1, style: "left: 240rpx; bottom: 170rpx; transform: rotate(-20deg);" },
  { id: "l4", stage: 1, style: "left: 184rpx; bottom: 180rpx; transform: rotate(12deg);" },
  { id: "l5", stage: 2, style: "left: 420rpx; bottom: 268rpx; transform: rotate(18deg);" },
  { id: "l6", stage: 2, style: "left: 360rpx; bottom: 286rpx; transform: rotate(-8deg);" },
  { id: "l7", stage: 2, style: "left: 302rpx; bottom: 302rpx; transform: rotate(16deg);" },
  { id: "l8", stage: 2, style: "left: 196rpx; bottom: 292rpx; transform: rotate(-20deg);" },
  { id: "l9", stage: 2, style: "left: 148rpx; bottom: 270rpx; transform: rotate(16deg);" },
  { id: "l10", stage: 3, style: "left: 446rpx; bottom: 392rpx; transform: rotate(20deg);" },
  { id: "l11", stage: 3, style: "left: 398rpx; bottom: 410rpx; transform: rotate(-8deg);" },
  { id: "l12", stage: 3, style: "left: 356rpx; bottom: 428rpx; transform: rotate(15deg);" },
  { id: "l13", stage: 3, style: "left: 170rpx; bottom: 428rpx; transform: rotate(-16deg);" },
  { id: "l14", stage: 3, style: "left: 134rpx; bottom: 412rpx; transform: rotate(14deg);" },
  { id: "l15", stage: 3, style: "left: 98rpx; bottom: 392rpx; transform: rotate(-16deg);" },
  { id: "l16", stage: 4, style: "left: 424rpx; bottom: 478rpx; transform: rotate(17deg);" },
  { id: "l17", stage: 4, style: "left: 372rpx; bottom: 504rpx; transform: rotate(-14deg);" },
  { id: "l18", stage: 4, style: "left: 158rpx; bottom: 504rpx; transform: rotate(14deg);" },
  { id: "l19", stage: 4, style: "left: 118rpx; bottom: 478rpx; transform: rotate(-16deg);" },
  { id: "l20", stage: 5, style: "left: 396rpx; bottom: 564rpx; transform: rotate(17deg);" },
  { id: "l21", stage: 5, style: "left: 340rpx; bottom: 582rpx; transform: rotate(-10deg);" },
  { id: "l22", stage: 5, style: "left: 186rpx; bottom: 582rpx; transform: rotate(10deg);" },
  { id: "l23", stage: 5, style: "left: 132rpx; bottom: 564rpx; transform: rotate(-17deg);" },
  { id: "l24", stage: 6, style: "left: 356rpx; bottom: 658rpx; transform: rotate(22deg);" },
  { id: "l25", stage: 6, style: "left: 166rpx; bottom: 658rpx; transform: rotate(-22deg);" },
  { id: "l26", stage: 7, style: "left: 262rpx; bottom: 692rpx; transform: rotate(8deg);" }
];

function decorateMilestones(list) {
  return list.map((item, index) => {
    const nextItem = list[index + 1];
    return {
      ...item,
      stageText: `第${item.stage}阶段`,
      statusText: STATUS_TEXT[item.status] || STATUS_TEXT.locked,
      isLast: index === list.length - 1,
      nextLineStatus: nextItem ? nextItem.status : item.status
    };
  });
}

function buildLeaves(milestones) {
  const statusByStage = milestones.reduce((acc, item) => {
    acc[item.stage] = item.status;
    return acc;
  }, {});

  return LEAF_TEMPLATE.map((item) => {
    const status = statusByStage[item.stage] || "locked";
    return {
      ...item,
      status,
      clickable: status !== "locked"
    };
  });
}

Page({
  data: {
    phaseInfo: PHASE_INFO,
    topbarStyle: "",
    revealStage: 0,
    leafVisibleCount: 0,
    branches: BRANCHES,
    milestones: [],
    leaves: [],
    artifactVisible: false,
    selectedMilestone: null
  },

  onLoad() {
    this.syncNavLayout();
    this.initMockData();
  },

  onShow() {
    this.syncNavLayout();
  },

  onUnload() {
    this.clearTimers();
  },

  clearTimers() {
    if (this._timerQueue && this._timerQueue.length) {
      this._timerQueue.forEach((timer) => clearTimeout(timer));
    }
    this._timerQueue = [];

    if (this._leafTimer) {
      clearInterval(this._leafTimer);
      this._leafTimer = null;
    }
  },

  initMockData() {
    const milestones = decorateMilestones(MILESTONE_LIST);
    const leaves = buildLeaves(milestones);

    this.setData({
      milestones,
      leaves,
      revealStage: 0,
      leafVisibleCount: 0,
      artifactVisible: false,
      selectedMilestone: null
    });

    this.startRevealAnimation();
  },

  syncNavLayout() {
    const nav = getNavMetrics(true);
    const topPadding = Math.max(nav.headerTop + 8, nav.statusBarHeight + 18);
    const rowHeight = Math.max(nav.menuHeight + 14, 44);
    const minHeight = topPadding + rowHeight;

    this.setData({
      topbarStyle: `padding-top:${topPadding}px; min-height:${minHeight}px;`
    });
  },

  startRevealAnimation() {
    this.clearTimers();

    const timer1 = setTimeout(() => {
      this.setData({
        revealStage: 1
      });
    }, 70);

    const timer2 = setTimeout(() => {
      this.setData({
        revealStage: 2
      });
    }, 320);

    const timer3 = setTimeout(() => {
      this.setData({
        revealStage: 3
      });
      this.startLeafReveal();
    }, 560);

    this._timerQueue = [timer1, timer2, timer3];
  },

  startLeafReveal() {
    if (this._leafTimer) {
      clearInterval(this._leafTimer);
    }

    let visibleCount = 0;
    const maxCount = this.data.leaves.length;

    this._leafTimer = setInterval(() => {
      visibleCount += 1;
      this.setData({
        leafVisibleCount: visibleCount
      });

      if (visibleCount >= maxCount) {
        clearInterval(this._leafTimer);
        this._leafTimer = null;
      }
    }, 58);
  },

  handleLeafTap(event) {
    const index = Number(event.currentTarget.dataset.index);
    const leaf = this.data.leaves[index];
    const isVisible = this.data.revealStage >= 3 && index < this.data.leafVisibleCount;

    if (!leaf || !leaf.clickable || !isVisible) {
      return;
    }

    const milestone = this.data.milestones.find((item) => item.stage === leaf.stage);
    if (!milestone || milestone.status === "locked") {
      return;
    }

    this.setData({
      artifactVisible: true,
      selectedMilestone: milestone
    });
  },

  handleArtifactClose() {
    this.setData({
      artifactVisible: false,
      selectedMilestone: null
    });
  },

  handleArtifactAction() {
    this.handleClose();
  },

  handleClose() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=home"
    });
  },

  noop() {}
});
