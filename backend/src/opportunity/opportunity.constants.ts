export const OPPORTUNITY_STAGES = [
  "capturing",
  "structuring",
  "scoring",
  "comparing",
  "validating"
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const DECISION_STATUSES = [
  "none",
  "candidate",
  "selected",
  "parked",
  "rejected"
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const OPPORTUNITY_PRIMARY_ACTIONS = [
  "opportunity_continue_identify",
  "opportunity_compare_select",
  "opportunity_run_validation",
  "opportunity_refresh_assets",
  "opportunity_free_chat"
] as const;

export type OpportunityPrimaryAction = (typeof OPPORTUNITY_PRIMARY_ACTIONS)[number];

export const OPPORTUNITY_ROUTE_ACTION_ALIASES: Record<string, OpportunityPrimaryAction> = {
  opportunity_score: "opportunity_continue_identify",
  task_completed: "opportunity_run_validation",
  project_execution_followup: "opportunity_run_validation"
};

export const OPPORTUNITY_ROUTE_ACTIONS_REQUIRING_PROJECT = new Set<OpportunityPrimaryAction>([
  "opportunity_continue_identify",
  "opportunity_compare_select",
  "opportunity_run_validation"
]);

export const OPPORTUNITY_CANONICAL_ARTIFACT_TYPES = {
  score: "opportunity_score",
  selected: "selected_direction",
  validation: "validation_plan",
  directions: "business_direction_candidates",
  initiation: "project_initiation_summary",
  followupCycle: "project_followup_cycle"
} as const;

export const OPPORTUNITY_MIRROR_ARTIFACT_TYPES = {
  score: "score",
  selected: "structure"
} as const;

export const HIDDEN_PROJECT_ARTIFACT_TYPES = new Set<string>([
  OPPORTUNITY_MIRROR_ARTIFACT_TYPES.score,
  OPPORTUNITY_MIRROR_ARTIFACT_TYPES.selected
]);

export const OPPORTUNITY_PHASE2_ROUTE = "phase2_opportunity_hub" as const;

export const PROJECT_KINDS = ["opportunity_draft", "active_project"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STAGES = [
  "generating_candidates",
  "deep_diving",
  "ready_to_initiate",
  "validating",
  "running",
  "paused"
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const FOLLOWUP_STATUSES = ["scheduled", "due", "overdue", "blocked"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const LEAD_AGENT_ROLES = ["asset", "execution", "steward", "mindset", "master"] as const;
export type LeadAgentRole = (typeof LEAD_AGENT_ROLES)[number];

export function normalizeOpportunityRouteAction(routeAction?: string | null) {
  const normalized = String(routeAction || "").trim();
  if (!normalized) {
    return "";
  }

  return OPPORTUNITY_ROUTE_ACTION_ALIASES[normalized] || normalized;
}

export function isOpportunityStage(value?: string | null): value is OpportunityStage {
  return OPPORTUNITY_STAGES.includes(String(value || "").trim() as OpportunityStage);
}

export function isDecisionStatus(value?: string | null): value is DecisionStatus {
  return DECISION_STATUSES.includes(String(value || "").trim() as DecisionStatus);
}

export function isProjectKind(value?: string | null): value is ProjectKind {
  return PROJECT_KINDS.includes(String(value || "").trim() as ProjectKind);
}

export function isProjectStage(value?: string | null): value is ProjectStage {
  return PROJECT_STAGES.includes(String(value || "").trim() as ProjectStage);
}

export function isFollowupStatus(value?: string | null): value is FollowupStatus {
  return FOLLOWUP_STATUSES.includes(String(value || "").trim() as FollowupStatus);
}

export function isLeadAgentRole(value?: string | null): value is LeadAgentRole {
  return LEAD_AGENT_ROLES.includes(String(value || "").trim() as LeadAgentRole);
}
