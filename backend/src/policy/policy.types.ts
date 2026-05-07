export const PARK_MATCH_FLOW_KEY = "park_match_flow" as const;

export const POLICY_SLOT_STEPS = [
  "ask_company_status",
  "branch_asset_audit",
  "ask_region",
  "ask_industry",
  "ask_age",
  "ask_revenue",
  "ready_to_search",
  "searching",
  "completed"
] as const;

export type PolicySlotStep = (typeof POLICY_SLOT_STEPS)[number];

export type PolicyCompanyStatus = "unregistered" | "individual" | "company" | "existing_company";

export type PolicyRevenueBucket = "none" | "lt_10k" | "10k_100k" | "100k_500k" | "gt_500k" | "unknown";

export type PolicyCollectedSlots = {
  companyStatus: PolicyCompanyStatus | null;
  region: {
    province?: string;
    city?: string;
    district?: string;
    rawText?: string;
  } | null;
  industry: {
    code?: string;
    label: string;
    rawText?: string;
  } | null;
  age: {
    value?: number;
    unit?: "month" | "year";
    bucket?: "not_started" | "lt_6m" | "6m_1y" | "1y_3y" | "gt_3y";
    rawText?: string;
  } | null;
  revenue: {
    bucket: PolicyRevenueBucket;
    rawText?: string;
  } | null;
};

export type PolicySearchStatus = "idle" | "searching" | "completed" | "failed";
export type PolicyValidityStatus = "active" | "likely_active" | "expired" | "unknown";
export type PolicyOpcRelevanceStatus = "strong" | "partial" | "weak" | "irrelevant";
export type PolicyOpcRelevanceLevel = "high" | "medium" | "low" | "irrelevant";
export type PolicyRecommendedStage =
  | "pre_registration"
  | "just_registered"
  | "early_revenue"
  | "growth"
  | "not_recommended";
export type PolicyOpportunityType =
  | "registered_address"
  | "park_entry"
  | "startup_subsidy"
  | "tax_reduction"
  | "rent_subsidy"
  | "startup_loan"
  | "industry_support"
  | "qualification"
  | "public_notice"
  | "interpretation"
  | "other";

export type PolicySourceType =
  | "official_original"
  | "pdf"
  | "apply_entry"
  | "interpretation"
  | "news";

export type PolicySource = {
  id?: string;
  policyId?: string;
  sourceKey: string;
  type: PolicySourceType;
  label: string;
  url: string;
  note?: string;
  sortOrder: number;
};

export type PolicyCatalogItem = {
  id: string;
  policyId: string;
  region: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  title: string;
  summary?: string | null;
  status: string;
  statusText: string;
  fineTags: string[];
  sourceDate?: string | null;
  lastVerifiedAt?: string | null;
  sources: PolicySource[];
  primarySource: PolicySource | null;
  source: {
    name: string;
    url: string;
    domain: string;
  };
  primarySourceUrl: string;
  applyEntryUrl: string;
  pdfUrls: string[];
  sourcesSummary: string;
  primaryActionText: string;
  primaryActionUrl: string;
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type PolicyMatchState = {
  flowKey: typeof PARK_MATCH_FLOW_KEY;
  step: PolicySlotStep;
  collectedSlots: PolicyCollectedSlots;
  lastQuestion: string;
  searchStatus: PolicySearchStatus;
  lastSearchAt: string | null;
  lastSearchQuery: string | null;
  lastResultCardId: string | null;
};

export type PolicySearchInput = {
  query: string;
  region: string;
  industry: string;
  companyStatus: string;
  limit: number;
  freshnessDays?: number;
};

export type PolicySearchRawResult = {
  title: string;
  url: string;
  content?: string;
  snippet?: string;
  publishedDate?: string | null;
  rawPublishedDate?: string | null;
  score?: number;
};

export type PolicyType =
  | "subsidy"
  | "tax_rebate"
  | "rent_support"
  | "talent"
  | "registration"
  | "park_entry"
  | "financing"
  | "other";

export type PolicyDetail = {
  title: string;
  source: {
    name: string;
    url: string;
    domain: string;
  };
  sources: PolicySource[];
  primarySource: PolicySource | null;
  primarySourceUrl: string;
  applyEntryUrl: string;
  pdfUrls: string[];
  sourcesSummary: string;
  primaryActionText: string;
  primaryActionUrl: string;
  policyId?: string;
  status?: string;
  statusText?: string;
  fineTags?: string[];
  matchReason?: string;
  nextAction?: string;
  publishDate: string | null;
  deadlineDate: string | null;
  publishTime: string | null;
  region: {
    province?: string;
    city?: string;
    district?: string;
    rawText?: string;
  };
  policyType: PolicyType;
  eligibility: string;
  benefit: string;
  deadline: string | null;
  validityStatus: PolicyValidityStatus;
  validityReason: string;
  opcRelevanceStatus: PolicyOpcRelevanceStatus;
  opcRelevanceScore: number;
  opcRelevanceLevel: PolicyOpcRelevanceLevel;
  opcRelevanceReason: string;
  matchedOpcSignals: string[];
  mismatchReasons: string[];
  recommendedStage: PolicyRecommendedStage;
  opportunityType: PolicyOpportunityType;
  sourceCheckedAt: string;
  nonApplicationPage: boolean;
  riskNotes: string[];
  summary: string;
};

export type PolicyConfidenceScore = {
  sourceAuthorityScore: number;
  officialSite: boolean;
  domainMatched: boolean;
  publishTimeScore: number;
  contentCompletenessScore: number;
  opcRelevanceScore: number;
  finalConfidence: number;
};

export type ScoredPolicyDetail = PolicyDetail & {
  id: string;
  confidence: PolicyConfidenceScore;
};

export type PolicyOpportunityCardAction =
  | "copy_link"
  | "ask_agent_explain"
  | "refresh_policy_search"
  | "start_asset_audit"
  | "save_policy_watch";

export type PolicyOpportunityCard = {
  cardType:
    | "policy_opportunity"
    | "policy_opportunity_empty"
    | "policy_opportunity_low_confidence"
    | "policy_opportunity_high_risk"
    | "policy_flow_switch_confirm";
  title: string;
  description: string;
  primaryText?: string;
  secondaryText?: string;
  primaryAction?: string;
  secondaryAction?: string;
  cardStyle?: string;
  payload?: Record<string, unknown>;
  actions?: Array<{
    type: PolicyOpportunityCardAction;
    label: string;
  }>;
};

export interface PolicySearchProvider {
  name: string;
  search(input: PolicySearchInput): Promise<PolicySearchRawResult[]>;
}
