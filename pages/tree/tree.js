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
        "交付节奏：按月交付"
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

const TREE_SIZE = {
  width: 402,
  height: 693
};

const TREE_ASPECT = TREE_SIZE.width / TREE_SIZE.height;
const HIT_EXPAND_OFFSETS = [
  { dx: 0, dy: 0 },
  { dx: -8, dy: 0 },
  { dx: 8, dy: 0 },
  { dx: 0, dy: -8 },
  { dx: 0, dy: 8 },
  { dx: -12, dy: 0 },
  { dx: 12, dy: 0 },
  { dx: 0, dy: -12 },
  { dx: 0, dy: 12 },
  { dx: -6, dy: -6 },
  { dx: 6, dy: -6 },
  { dx: -6, dy: 6 },
  { dx: 6, dy: 6 },
  { dx: -10, dy: -10 },
  { dx: 10, dy: -10 },
  { dx: -10, dy: 10 },
  { dx: 10, dy: 10 }
];

const FOCUS_HOTSPOT_IDS = new Set([
  "leaf-001",
  "leaf-002",
  "leaf-003",
  "leaf-004",
  "leaf-005",
  "leaf-006",
  "leaf-007",
  "leaf-008",
  "leaf-009",
  "leaf-010",
  "leaf-011",
  "leaf-012",
  "leaf-013",
  "leaf-014",
  "leaf-015",
  "leaf-016",
  "leaf-017",
  "leaf-018",
  "leaf-019",
  "leaf-020",
  "leaf-021",
  "leaf-022",
  "leaf-023",
  "leaf-024",
  "leaf-025",
  "leaf-026",
  "leaf-027",
  "leaf-028",
  "leaf-029",
  "leaf-030",
  "leaf-031",
  "leaf-032",
  "leaf-033",
  "leaf-034",
  "leaf-035",
  "leaf-036",
  "leaf-037",
  "leaf-038",
  "leaf-039",
  "leaf-040",
  "leaf-041",
  "leaf-042",
  "leaf-043",
  "leaf-044",
  "leaf-045",
  "leaf-046"
]);

const LEAF_HOTSPOT_TEMPLATE = [
  { id: "leaf-001", stage: 5, x: 132, y: 220, size: 34 },
  { id: "leaf-002", stage: 5, x: 286, y: 220, size: 34 },

  { id: "leaf-003", stage: 4, x: 108, y: 292, size: 32 },
  { id: "leaf-004", stage: 4, x: 126, y: 284, size: 32 },
  { id: "leaf-005", stage: 4, x: 146, y: 278, size: 32 },
  { id: "leaf-006", stage: 4, x: 166, y: 270, size: 32 },
  { id: "leaf-007", stage: 4, x: 236, y: 270, size: 32 },
  { id: "leaf-008", stage: 4, x: 256, y: 278, size: 32 },
  { id: "leaf-009", stage: 4, x: 276, y: 284, size: 32 },
  { id: "leaf-010", stage: 4, x: 296, y: 292, size: 32 },

  { id: "leaf-011", stage: 3, x: 74, y: 378, size: 31 },
  { id: "leaf-012", stage: 3, x: 90, y: 370, size: 31 },
  { id: "leaf-013", stage: 3, x: 108, y: 364, size: 31 },
  { id: "leaf-014", stage: 3, x: 126, y: 358, size: 31 },
  { id: "leaf-015", stage: 3, x: 144, y: 352, size: 31 },
  { id: "leaf-016", stage: 3, x: 162, y: 346, size: 31 },
  { id: "leaf-017", stage: 3, x: 180, y: 340, size: 31 },
  { id: "leaf-018", stage: 3, x: 222, y: 340, size: 31 },
  { id: "leaf-019", stage: 3, x: 240, y: 346, size: 31 },
  { id: "leaf-020", stage: 3, x: 258, y: 352, size: 31 },
  { id: "leaf-021", stage: 3, x: 276, y: 358, size: 31 },
  { id: "leaf-022", stage: 3, x: 294, y: 364, size: 31 },
  { id: "leaf-023", stage: 3, x: 312, y: 370, size: 31 },
  { id: "leaf-024", stage: 3, x: 328, y: 378, size: 31 },

  { id: "leaf-025", stage: 2, x: 94, y: 468, size: 30 },
  { id: "leaf-026", stage: 2, x: 110, y: 460, size: 30 },
  { id: "leaf-027", stage: 2, x: 126, y: 454, size: 30 },
  { id: "leaf-028", stage: 2, x: 142, y: 448, size: 30 },
  { id: "leaf-029", stage: 2, x: 158, y: 442, size: 30 },
  { id: "leaf-030", stage: 2, x: 246, y: 442, size: 30 },
  { id: "leaf-031", stage: 2, x: 262, y: 448, size: 30 },
  { id: "leaf-032", stage: 2, x: 278, y: 454, size: 30 },
  { id: "leaf-033", stage: 2, x: 294, y: 460, size: 30 },
  { id: "leaf-034", stage: 2, x: 310, y: 468, size: 30 },

  { id: "leaf-035", stage: 1, x: 116, y: 560, size: 29 },
  { id: "leaf-036", stage: 1, x: 132, y: 552, size: 29 },
  { id: "leaf-037", stage: 1, x: 148, y: 546, size: 29 },
  { id: "leaf-038", stage: 1, x: 164, y: 540, size: 29 },
  { id: "leaf-039", stage: 1, x: 236, y: 540, size: 29 },
  { id: "leaf-040", stage: 1, x: 252, y: 546, size: 29 },
  { id: "leaf-041", stage: 1, x: 268, y: 552, size: 29 },
  { id: "leaf-042", stage: 1, x: 284, y: 560, size: 29 },

  { id: "leaf-043", stage: 1, x: 142, y: 622, size: 28 },
  { id: "leaf-044", stage: 1, x: 162, y: 614, size: 28 },
  { id: "leaf-045", stage: 1, x: 242, y: 614, size: 28 },
  { id: "leaf-046", stage: 1, x: 262, y: 622, size: 28 }
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

function buildLeafHotspots(milestones) {
  const statusByStage = milestones.reduce((acc, item) => {
    acc[item.stage] = item.status;
    return acc;
  }, {});

  return LEAF_HOTSPOT_TEMPLATE.map((item) => {
    const status = statusByStage[item.stage] || "locked";
    return {
      ...item,
      status,
      clickable: status !== "locked",
      style: ""
    };
  });
}

function getStageHitBoost(stage) {
  if (stage >= 4) {
    return 14;
  }
  if (stage === 3) {
    return 11;
  }
  if (stage === 2) {
    return 14;
  }
  return 11;
}

function getLeafFocusBoost(id) {
  return FOCUS_HOTSPOT_IDS.has(id) ? 12 : 0;
}

function calcDistanceSq(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

Page({
  data: {
    phaseInfo: PHASE_INFO,
    topbarStyle: "",
    treeStageStyle: "",
    milestones: [],
    leafHotspots: [],
    treeCoverHeight: 100,
    heroVisible: false,
    timelineVisible: false,
    artifactVisible: false,
    selectedMilestone: null
  },

  onLoad() {
    this.syncNavLayout();
    this.initMockData();
  },

  onShow() {
    this.syncNavLayout();
    this.requestRebuildHotspots();
  },

  onReady() {
    this.requestRebuildHotspots();
  },

  onResize() {
    this.syncNavLayout();
    this.requestRebuildHotspots();
  },

  onUnload() {
    this.clearTimers();
  },

  clearTimers() {
    if (this._timerQueue && this._timerQueue.length) {
      this._timerQueue.forEach((timer) => clearTimeout(timer));
    }
    this._timerQueue = [];

    if (this._hotspotTimer) {
      clearTimeout(this._hotspotTimer);
      this._hotspotTimer = null;
    }

    this._treeFrame = null;
    this._leafHitPoints = [];
  },

  initMockData() {
    const milestones = decorateMilestones(MILESTONE_LIST);
    const leafHotspots = buildLeafHotspots(milestones);

    this.setData({
      milestones,
      leafHotspots,
      treeCoverHeight: 100,
      heroVisible: false,
      timelineVisible: false,
      artifactVisible: false,
      selectedMilestone: null
    }, () => {
      this.requestRebuildHotspots();
    });

    this.startRevealAnimation();
  },

  syncNavLayout() {
    const nav = getNavMetrics(true);
    const topPadding = Math.max(nav.headerTop + 8, nav.statusBarHeight + 18);
    const rowHeight = Math.max(nav.menuHeight + 14, 44);
    const minHeight = topPadding + rowHeight;
    const windowHeight = nav.windowHeight || wx.getWindowInfo().windowHeight;
    const treeStageHeight = Math.max(Math.floor(windowHeight - minHeight - 120), 520);

    this.setData({
      topbarStyle: `padding-top:${topPadding}px; min-height:${minHeight}px;`,
      treeStageStyle: `height:${treeStageHeight}px;`
    }, () => {
      this.requestRebuildHotspots();
    });
  },

  requestRebuildHotspots() {
    if (this._hotspotTimer) {
      clearTimeout(this._hotspotTimer);
    }

    this._hotspotTimer = setTimeout(() => {
      this.rebuildHotspotsByImageRect();
      this._hotspotTimer = null;
    }, 36);
  },

  rebuildHotspotsByImageRect() {
    if (!this.data.leafHotspots.length) {
      return;
    }

    const query = wx.createSelectorQuery().in(this);
    query.select(".tree-visual-stage").boundingClientRect();
    query.exec((res) => {
      const rect = res && res[0];
      if (!rect || !rect.width || !rect.height) {
        return;
      }

      const stageWidth = rect.width;
      const stageHeight = rect.height;

      let drawWidth = stageWidth;
      let drawHeight = drawWidth / TREE_ASPECT;
      if (drawHeight > stageHeight) {
        drawHeight = stageHeight;
        drawWidth = drawHeight * TREE_ASPECT;
      }

      const offsetX = (stageWidth - drawWidth) / 2;
      const offsetY = (stageHeight - drawHeight) / 2;

      const hotspots = this.data.leafHotspots.map((item) => {
        const centerX = offsetX + (drawWidth * item.x) / TREE_SIZE.width;
        const centerY = offsetY + (drawHeight * item.y) / TREE_SIZE.height;
        const base = item.size || 32;
        const boost = getStageHitBoost(item.stage);
        const focusBoost = getLeafFocusBoost(item.id);
        const size = item.status === "doing"
          ? base + boost + focusBoost + 8
          : base + boost + focusBoost;
        return {
          ...item,
          size,
          style: `left:${centerX}px; top:${centerY}px; width:${size}px; height:${size}px; margin-left:${-size / 2}px; margin-top:${-size / 2}px;`
        };
      });

      this.setData({
        leafHotspots: hotspots
      });

      this._treeFrame = {
        stageLeft: rect.left,
        stageTop: rect.top,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
      };

      this._leafHitPoints = hotspots
        .filter((item) => item.clickable)
        .flatMap((item) => {
          const ring = FOCUS_HOTSPOT_IDS.has(item.id)
            ? HIT_EXPAND_OFFSETS.concat([
              { dx: -16, dy: 0 },
              { dx: 16, dy: 0 },
              { dx: 0, dy: -16 },
              { dx: 0, dy: 16 },
              { dx: -14, dy: -10 },
              { dx: 14, dy: -10 },
              { dx: -14, dy: 10 },
              { dx: 14, dy: 10 }
            ])
            : HIT_EXPAND_OFFSETS;

          return ring.map((offset, index) => ({
            id: `${item.id}-h${index}`,
            stage: item.stage,
            x: item.x + offset.dx,
            y: item.y + offset.dy,
            size: item.size || 32
          }));
        });
    });
  },

  findNearestLeafStage(sourceX, sourceY) {
    if (!this._leafHitPoints || !this._leafHitPoints.length) {
      return null;
    }

    let hit = null;
    let minDistanceSq = Number.POSITIVE_INFINITY;

    this._leafHitPoints.forEach((point) => {
      const distanceSq = calcDistanceSq(sourceX, sourceY, point.x, point.y);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        hit = point;
      }
    });

    if (!hit) {
      return null;
    }

    const touchRadius = Math.max(hit.size * 1.45, 56);
    if (minDistanceSq > touchRadius * touchRadius) {
      return null;
    }

    return hit.stage;
  },

  openMilestoneByStage(stage) {
    const milestone = this.data.milestones.find((item) => item.stage === stage);
    if (!milestone || milestone.status === "locked") {
      return;
    }

    this.setData({
      artifactVisible: true,
      selectedMilestone: milestone
    });
  },

  handleTreeTap(event) {
    if (this.data.treeCoverHeight > 0 || !this._treeFrame) {
      return;
    }

    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) {
      return;
    }

    const stageX = touch.clientX - this._treeFrame.stageLeft;
    const stageY = touch.clientY - this._treeFrame.stageTop;
    const localX = stageX - this._treeFrame.offsetX;
    const localY = stageY - this._treeFrame.offsetY;

    if (
      localX < -14 ||
      localY < -14 ||
      localX > this._treeFrame.drawWidth + 14 ||
      localY > this._treeFrame.drawHeight + 14
    ) {
      return;
    }

    const sourceX = (localX / this._treeFrame.drawWidth) * TREE_SIZE.width;
    const sourceY = (localY / this._treeFrame.drawHeight) * TREE_SIZE.height;
    const stage = this.findNearestLeafStage(sourceX, sourceY);

    if (!stage) {
      return;
    }

    this.openMilestoneByStage(stage);
  },

  startRevealAnimation() {
    this.clearTimers();

    const timer1 = setTimeout(() => {
      this.setData({
        heroVisible: true
      });
    }, 60);

    const timer2 = setTimeout(() => {
      this.setData({
        treeCoverHeight: 0
      });
    }, 180);

    const timer3 = setTimeout(() => {
      this.setData({
        timelineVisible: true
      });
    }, 880);

    this._timerQueue = [timer1, timer2, timer3];
  },

  handleLeafTap(event) {
    if (this.data.treeCoverHeight > 0) {
      return;
    }

    const stage = Number(event.currentTarget.dataset.stage);
    const leaf = this.data.leafHotspots.find((item) => item.stage === stage);

    if (!leaf || !leaf.clickable) {
      return;
    }

    this.openMilestoneByStage(stage);
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
