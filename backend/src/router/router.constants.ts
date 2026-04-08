import { RouterAgentKey, RouterMode } from "@prisma/client";

export const ROUTER_AGENTS: RouterAgentKey[] = [
  "master",
  "asset",
  "execution",
  "mindset",
  "steward"
];

export const CHATFLOW_BY_AGENT: Record<RouterAgentKey, string> = {
  master: "cf_master_onboarding",
  asset: "cf_asset_discovery",
  execution: "cf_execution_growth",
  mindset: "cf_mindset_breakthrough",
  steward: "cf_steward_operating"
};

export const AGENT_DISPLAY: Record<RouterAgentKey, { label: string; color: string; icon: string }> = {
  master: { label: "OPC Master", color: "#0D0D0D", icon: "seed" },
  asset: { label: "Asset Agent", color: "#534AB7", icon: "gem" },
  execution: { label: "Execution Agent", color: "#10A37F", icon: "coin" },
  mindset: { label: "Mindset Agent", color: "#E24B4A", icon: "spark" },
  steward: { label: "Steward Agent", color: "#378ADD", icon: "shield" }
};

export const QUICK_REPLIES_BY_AGENT: Record<
  RouterAgentKey,
  Array<{ quickReplyId: string; label: string; routeAction: string }>
> = {
  master: [
    { quickReplyId: "qr-master-explore", label: "I need direction", routeAction: "route_explore" },
    { quickReplyId: "qr-master-stuck", label: "I am blocked", routeAction: "route_stuck" },
    { quickReplyId: "qr-master-scale", label: "I want to scale", routeAction: "route_scale" },
    { quickReplyId: "qr-master-park", label: "Check park policy", routeAction: "route_park" }
  ],
  asset: [
    { quickReplyId: "qr-asset-radar", label: "Build asset radar", routeAction: "asset_radar" },
    { quickReplyId: "qr-asset-pricing", label: "Continue pricing card", routeAction: "pricing_card" },
    { quickReplyId: "qr-asset-switch", label: "Switch to execution", routeAction: "switch_execution" }
  ],
  execution: [
    { quickReplyId: "qr-exec-score", label: "Opportunity score", routeAction: "opportunity_score" },
    { quickReplyId: "qr-exec-action", label: "Build 48h action plan", routeAction: "action_plan_48h" },
    { quickReplyId: "qr-exec-switch", label: "Switch to steward", routeAction: "switch_steward" }
  ],
  mindset: [
    { quickReplyId: "qr-mindset-unblock", label: "Unblock me", routeAction: "mindset_unblock" },
    { quickReplyId: "qr-mindset-step", label: "Give one next step", routeAction: "mindset_next_step" },
    { quickReplyId: "qr-mindset-switch", label: "Switch to execution", routeAction: "switch_execution" }
  ],
  steward: [
    { quickReplyId: "qr-steward-health", label: "Business health check", routeAction: "business_health" },
    { quickReplyId: "qr-steward-park", label: "Park matching", routeAction: "park_match" },
    { quickReplyId: "qr-steward-switch", label: "Switch to master", routeAction: "switch_master" }
  ]
};

type RouteActionDecision = {
  agentKey: RouterAgentKey;
  mode?: RouterMode;
  chatflowId?: string;
  cardType?: string;
};

const ROUTE_ACTION_DECISIONS: Record<string, RouteActionDecision> = {
  route_explore: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset },
  route_stuck: { agentKey: "mindset", mode: "locked", chatflowId: CHATFLOW_BY_AGENT.mindset },
  route_scale: { agentKey: "steward", mode: "free", chatflowId: CHATFLOW_BY_AGENT.steward },
  route_park: { agentKey: "steward", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.steward, cardType: "park_match" },
  asset_radar: { agentKey: "asset", mode: "guided", chatflowId: CHATFLOW_BY_AGENT.asset, cardType: "asset_radar" },
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
