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

// 方案 γ —— 主对话流退役,master 相关的 routeAction 统一走 5-通用兜底对话流；
// 薅羊毛"聊点其他的"走 6-闲聊收集流。这两个常量与 router.service.ts 顶部的
// ONBOARDING_FALLBACK_CHATFLOW_ID / INFO_COLLECTION_CHATFLOW_ID 必须保持一致。
const ONBOARDING_FALLBACK_CHATFLOW_ID = "cf_onboarding_fallback";
const INFO_COLLECTION_CHATFLOW_ID = "cf_info_collection";
const BUSINESS_HEALTH_CHATFLOW_ID = "cf_business_health";

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
    { quickReplyId: "qr-master-explore", label: "先看方向", routeAction: "route_explore" },
    { quickReplyId: "qr-master-scale", label: "先拿结果", routeAction: "route_scale" },
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
  route_park: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  route_park_unregistered: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  route_park_registered: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  asset_radar: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  trigger_review: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  pricing_card: { agentKey: "asset", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "pricing_card" },
  opportunity_score: { agentKey: "execution", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "opportunity_score" },
  action_plan_48h: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  business_health: { agentKey: "steward", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "business_health" },
  park_match: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  company_park_followup: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  flow_exit: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  user_wants_other: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "policy_opportunity" },
  // 方案 γ —— 主对话流退役,continue_current_flow 归口到 5-通用兜底对话流；
  // agentKey 保留 master 让前端顶栏显示"一树OPC"不发生角色切换。
  continue_current_flow: { agentKey: "master", mode: "guided", chatflowId: ONBOARDING_FALLBACK_CHATFLOW_ID },
  // 薅羊毛分支点的两个出口：
  //   policy_to_asset_audit → 好的：直接进资产盘点对话流
  //   policy_keep_chatting  → 聊点其他的：走 6-闲聊收集流,由闲聊流自行把话题拉回资产盘点
  policy_to_asset_audit: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  policy_keep_chatting: { agentKey: "master", mode: "free", chatflowId: INFO_COLLECTION_CHATFLOW_ID },
  // mindset/execution branches are retired from primary flow. Keep these actions
  // resolvable for backward compatibility and route them to the fallback flow.
  mindset_unblock: { agentKey: "master", mode: "guided", chatflowId: ONBOARDING_FALLBACK_CHATFLOW_ID },
  mindset_next_step: { agentKey: "master", mode: "guided", chatflowId: ONBOARDING_FALLBACK_CHATFLOW_ID },
  policy_explain: { agentKey: "steward", mode: "free", chatflowId: CHATFLOW_BY_AGENT.steward },
  save_policy_watch: { agentKey: "steward", mode: "free", chatflowId: CHATFLOW_BY_AGENT.steward },
  company_tax_followup: { agentKey: "asset", mode: "guided", chatflowId: BUSINESS_HEALTH_CHATFLOW_ID, cardType: "business_health" },
  company_profit_followup: { agentKey: "asset", mode: "guided", chatflowId: BUSINESS_HEALTH_CHATFLOW_ID, cardType: "business_health" },
  company_payroll_followup: { agentKey: "asset", mode: "guided", chatflowId: BUSINESS_HEALTH_CHATFLOW_ID, cardType: "business_health" },
  project_execution_followup: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  project_asset_followup: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
  task_completed: { agentKey: "execution", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.execution, cardType: "action_plan_48h" },
  tool_ai: { agentKey: "execution", mode: "free", chatflowId: CHATFLOW_BY_AGENT.execution },
  tool_ip: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  // 方案 γ —— steward 等 agent 里的"切回主对话"按钮,落到 5-通用兜底对话流
  switch_master: { agentKey: "master", mode: "guided", chatflowId: ONBOARDING_FALLBACK_CHATFLOW_ID },
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
