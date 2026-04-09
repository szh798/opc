const treeMilestones = [
  {
    id: "m1",
    title: "完成资产盘点",
    date: "3月28日",
    leaves: "2片叶子",
    meta: "3月28日 · 2片叶子",
    status: "done",
    artifactTitle: "资产雷达图"
  },
  {
    id: "m2",
    title: "锁定商业方向",
    date: "3月29日",
    leaves: "1片叶子",
    meta: "3月29日 · 1片叶子",
    status: "done",
    artifactTitle: "定位语句"
  },
  {
    id: "m3",
    title: "完成客户验证",
    date: "4月2日",
    leaves: "3片叶子",
    meta: "4月2日 · 3片叶子",
    status: "done",
    artifactTitle: "验证记录"
  },
  {
    id: "m4",
    title: "通过继续/停止决策",
    date: "4月5日",
    leaves: "1片叶子",
    meta: "4月5日 · 1片叶子",
    status: "done",
    artifactTitle: "决策单"
  },
  {
    id: "m5",
    title: "拿下第一单",
    date: "进行中",
    leaves: "",
    meta: "进行中...",
    status: "current",
    artifactTitle: "首单复盘"
  },
  {
    id: "m6",
    title: "完成产品化",
    date: "待解锁",
    leaves: "",
    meta: "待解锁",
    status: "todo"
  },
  {
    id: "m7",
    title: "建立三层定价",
    date: "待解锁",
    leaves: "",
    meta: "待解锁",
    status: "todo"
  },
  {
    id: "m8",
    title: "月入稳定",
    date: "待解锁",
    leaves: "",
    meta: "待解锁",
    status: "todo"
  }
];

const treeOverview = {
  title: "我的一树",
  phase: "播种期",
  progressLabel: "你的一树已成长到第2阶段 · 发芽期",
  hint: "点击里程碑可回看关键成果",
  ctaText: "回到对话继续"
};

const weeklyReport = {
  period: "3.25-3.31",
  headline: "周日了，看看你这周的成绩单：",
  stats: [
    { label: "完成任务", value: "12", extra: "/15" },
    { label: "客户触达", value: "23" },
    { label: "本周收入", value: "+2,999", tone: "positive" },
    { label: "树的成长", value: "+2叶", tone: "asset" }
  ],
  comment: "任务完成率80%，节奏在上升。最大损耗还在客户跟进，3个意向客户超过48小时没回访。",
  comparison: "较上周：任务 +3 收入 +999",
  primaryText: "晒周报"
};

const monthlyCheck = {
  title: "3月商业体检",
  intro: "每月1号，例行体检时间。这是你3月份的商业健康报告：",
  metrics: [
    { label: "月收入", value: "8,997 元", accent: "+45%", tone: "positive" },
    { label: "客户数", value: "3 个付费", tone: "neutral" },
    { label: "转化率", value: "12%", tone: "neutral" },
    { label: "任务完成率", value: "72%", tone: "warn" },
    { label: "利润账户余额", value: "2,699 元", tone: "positive" }
  ],
  advice: "收入在增长，但全靠新客。需要尽快设计一个复购机制。下个月重点把3个付费客户变成月度订阅。",
  primaryText: "晒月报"
};

const socialProof = {
  inactiveDays: 5,
  headline: "小明，你已经5天没打开了。你的树停止生长了。",
  proofTitle: "同路人数据",
  proof: "本周有 38 个人跟你处在同一阶段。其中 12 个已经完成了客户验证，3 个拿到了第一单。",
  proofStats: [
    { label: "同阶段", value: "38人", tone: "normal" },
    { label: "完成验证", value: "12人", tone: "up" },
    { label: "拿到首单", value: "3人", tone: "up" }
  ],
  nudge: "你不是没时间，你是在等一个不会来的“准备好了”。要不要现在就做一件事？就一件。",
  primaryText: "好，给我一个任务",
  secondaryText: "我确实有困难，聊聊"
};

const milestone = {
  title: "里程碑解锁",
  unlocked: "拿下第一单",
  copy: "第一块钱永远是最难的，你已经赚到了。后面的路比你想象的简单。",
  primaryText: "看看我的树",
  secondaryText: "分享成就",
  followup: "你的树又长出一根新枝了。接下来我帮你把这个服务产品化，让它可以批量复制。"
};

module.exports = {
  treeOverview,
  treeMilestones,
  weeklyReport,
  monthlyCheck,
  socialProof,
  milestone
};
