import { RouterAgentKey, RouterMode } from "@prisma/client";

export const ROUTER_AGENTS: RouterAgentKey[] = [
  "master",
  "asset",
  "execution",
  "mindset",
  "steward"
];

export const CHATFLOW_BY_AGENT: Record<RouterAgentKey, string> = {
  master: "cf_main_dialog",
  asset: "cf_asset_inventory",
  execution: "cf_execution_growth",
  mindset: "cf_mindset_breakthrough",
  steward: "cf_business_steward"
};

export const AGENT_DISPLAY: Record<RouterAgentKey, { label: string; color: string; icon: string }> = {
  master: { label: "一树OPC", color: "#0D0D0D", icon: "seed" },
  asset: { label: "一树·挖宝", color: "#534AB7", icon: "gem" },
  execution: { label: "一树·搞钱", color: "#10A37F", icon: "coin" },
  mindset: { label: "一树·扎心", color: "#E24B4A", icon: "spark" },
  steward: { label: "一树·管家", color: "#378ADD", icon: "shield" }
};

export const QUICK_REPLIES_BY_AGENT: Record<
  RouterAgentKey,
  Array<{ quickReplyId: string; label: string; routeAction: string }>
> = {
  master: [
    { quickReplyId: "qr-master-explore", label: "想做一人公司，没方向", routeAction: "route_explore" },
    { quickReplyId: "qr-master-stuck", label: "我现在卡住了", routeAction: "route_stuck" },
    { quickReplyId: "qr-master-scale", label: "我想放大规模", routeAction: "route_scale" },
    { quickReplyId: "qr-master-park", label: "看看园区政策", routeAction: "route_park" }
  ],
  asset: [
    { quickReplyId: "qr-asset-radar", label: "盘一盘我的资产", routeAction: "asset_radar" },
    { quickReplyId: "qr-asset-review", label: "更新我的资产盘点", routeAction: "trigger_review" },
    { quickReplyId: "qr-asset-pricing", label: "继续打磨定价卡", routeAction: "pricing_card" },
    { quickReplyId: "qr-asset-switch", label: "切到搞钱助手", routeAction: "switch_execution" }
  ],
  execution: [
    { quickReplyId: "qr-exec-score", label: "做机会评分", routeAction: "opportunity_score" },
    { quickReplyId: "qr-exec-action", label: "做个48小时行动计划", routeAction: "action_plan_48h" },
    { quickReplyId: "qr-exec-switch", label: "切到管家助手", routeAction: "switch_steward" }
  ],
  mindset: [
    { quickReplyId: "qr-mindset-unblock", label: "帮我拆开卡点", routeAction: "mindset_unblock" },
    { quickReplyId: "qr-mindset-step", label: "给我一个下一步", routeAction: "mindset_next_step" },
    { quickReplyId: "qr-mindset-switch", label: "切到搞钱助手", routeAction: "switch_execution" }
  ],
  steward: [
    { quickReplyId: "qr-steward-health", label: "做商业体检", routeAction: "business_health" },
    { quickReplyId: "qr-steward-park", label: "匹配合适园区", routeAction: "park_match" },
    { quickReplyId: "qr-steward-switch", label: "切回主对话", routeAction: "switch_master" }
  ]
};

type RouteActionDecision = {
  agentKey: RouterAgentKey;
  mode?: RouterMode;
  chatflowId?: string;
  cardType?: string;
};

const ROUTE_ACTION_DECISIONS: Record<string, RouteActionDecision> = {
  // 新四分支（思维导图对齐），旧三个作为别名保留
  route_working: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_trying: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_fulltime: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  // 分支 A / B / C 的确认步：点「好的」或「对话模式」都派发该 action，正式进入资产盘点
  asset_inventory_start: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  // 方案 A —— 全职分支"闲聊主营 → 导入资产盘点"：路由到 6-闲聊收集流 + entry_path=fulltime_main_intake
  // chatflowId 留 asset 占位，真实 chatflow 由 resolveRoutingDecision 覆写到 INFO_COLLECTION_CHATFLOW_ID
  fulltime_intake_start: { agentKey: "master", mode: "free", chatflowId: CHATFLOW_BY_AGENT.master },
  // 旧 key 保留（别名），防 mock / 旧客户端回归断裂
  route_explore: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_stuck: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_scale: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_park: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "park_match" },
  asset_radar: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  trigger_review: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  pricing_card: { agentKey: "asset", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "pricing_card" },
  opportunity_score: { agentKey: "execution", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "opportunity_score" },
  action_plan_48h: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  business_health: { agentKey: "steward", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "business_health" },
  park_match: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "park_match" },
  company_park_followup: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "park_match" },
  company_tax_followup: { agentKey: "steward", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "business_health" },
  company_profit_followup: { agentKey: "steward", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "business_health" },
  company_payroll_followup: { agentKey: "steward", mode: "free", chatflowId: CHATFLOW_BY_AGENT.steward },
  project_execution_followup: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  project_asset_followup: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  task_completed: { agentKey: "execution", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  tool_ai: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution },
  tool_ip: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  switch_master: { agentKey: "master", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.master },
  switch_execution: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution },
  switch_steward: { agentKey: "steward", mode: "free", chatflowId: CHATFLOW_BY_AGENT.steward }
};

export function getQuickRepliesByAgent(agentKey: RouterAgentKey) {
  return QUICK_REPLIES_BY_AGENT[agentKey] || QUICK_REPLIES_BY_AGENT.master;
}

export function resolveActionDecision(routeAction?: string | null): RouteActionDecision | null {
  if (!routeAction) {
    return null;
  }
  return ROUTE_ACTION_DECISIONS[String(routeAction)] || null;
}
