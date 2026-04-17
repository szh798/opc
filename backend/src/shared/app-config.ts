import * as path from "node:path";

const ROUTER_AGENT_KEYS = ["master", "asset", "execution", "mindset", "steward"] as const;
type RouterAgentKey = (typeof ROUTER_AGENT_KEYS)[number];
const ASSET_WORKFLOW_KEYS = ["firstInventory", "resumeInventory", "reviewUpdate", "reportGeneration"] as const;
export type AssetWorkflowKey = (typeof ASSET_WORKFLOW_KEYS)[number];
export type AssetWorkflowApiKeys = Record<AssetWorkflowKey, string>;

const DEFAULT_ROUTER_CHATFLOW_BY_AGENT: Record<RouterAgentKey, string> = {
  master: "cf_main_dialog",
  asset: "cf_asset_inventory",
  execution: "cf_execution_growth",
  mindset: "cf_mindset_breakthrough",
  steward: "cf_business_steward"
};

export type AppConfig = {
  port: number;
  corsOrigin: string;
  publicBaseUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  allowMockWechatLogin: boolean;
  allowDevFreshUserLogin: boolean;
  devMockDify: boolean;
  wechatAppId: string;
  wechatAppSecret: string;
  difyEnabled: boolean;
  difyApiBaseUrl: string;
  difyApiKey: string;
  difyRequestTimeoutMs: number;
  difySnapshotTtlMinutes: number;
  difyApiKeyByAgent: Partial<Record<RouterAgentKey, string>>;
  difyAssetWorkflowApiKeys: AssetWorkflowApiKeys;
  difyOnboardingFallbackApiKey: string;
  difyInfoCollectionApiKey: string;
  difyBusinessHealthApiKey: string;
  routerChatflowByAgent: Record<RouterAgentKey, string>;
  storageDir: string;
  // —— L1 记忆抽取器（连接智谱 GLM 的 OpenAI 兼容端点）
  memoryExtractionEnabled: boolean;
  zhipuApiKey: string;
  zhipuBaseUrl: string;
  memoryExtractorModel: string;
  memoryExtractorTimeoutMs: number;
  memoryExtractorMaxTokens: number;
  policySearchEnabled: boolean;
  policySearchProvider: string;
  policySearchApiKey: string;
  policySearchTtlMinutes: number;
  policySearchTimeoutMs: number;
  policySearchAllowedDomains: string[];
  // —— Phase 1.4 会话窗口（Layer A）
  sessionWindowTtlMinutes: number;
  sessionWindowMaxMessages: number;
  // —— Phase 1.5 会话摘要器（Layer C）
  chatflowSummaryEnabled: boolean;
  chatflowSummarizerModel: string;
  chatflowSummarizerMaxTokens: number;
  chatflowSummarizerTimeoutMs: number;
  chatflowSummaryMinMessages: number;
  chatflowSummaryInjectLimit: number;
  chatflowSummaryDedupWindowMs: number;
  // —— Phase 1.6 L3 聚合画像
  userProfileRecomputeEnabled: boolean;
  profileLlmEnrichEnabled: boolean;
  profileLlmModel: string;
  profileLlmTimeoutMs: number;
  profileLlmMaxTokens: number;
  // —— Phase 1.7 定时摘要 Cron（每日/每周跨对话汇总 → 更新记忆层）
  digestCronEnabled: boolean;
  digestCronDailyHour: number;
  digestCronWeeklyDay: number;
  digestCronWeeklyHour: number;
  digestCronModel: string;
  digestCronMaxTokens: number;
  digestCronTimeoutMs: number;
  digestCronMinMessages: number;
};

function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value === "true";
}

function normalizeString(value: string | undefined, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function readWechatAppId() {
  return normalizeString(process.env.WECHAT_APP_ID, normalizeString(process.env.WECHAT_APPID));
}

function readWechatAppSecret() {
  return normalizeString(
    process.env.WECHAT_APP_SECRET,
    normalizeString(process.env.WECHAT_SECRET, normalizeString(process.env.WECHAT_APPKEY))
  );
}

function normalizePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readRouterChatflowByAgent() {
  return ROUTER_AGENT_KEYS.reduce<Record<RouterAgentKey, string>>((acc, agentKey) => {
    const envKey = `ROUTER_CHATFLOW_ID_${agentKey.toUpperCase()}`;
    acc[agentKey] = normalizeString(process.env[envKey], DEFAULT_ROUTER_CHATFLOW_BY_AGENT[agentKey]);
    return acc;
  }, { ...DEFAULT_ROUTER_CHATFLOW_BY_AGENT });
}

function readDifyApiKeyByAgent(defaultApiKey: string) {
  return ROUTER_AGENT_KEYS.reduce<Partial<Record<RouterAgentKey, string>>>((acc, agentKey) => {
    const envKey = `DIFY_API_KEY_${agentKey.toUpperCase()}`;
    const value = normalizeString(process.env[envKey], defaultApiKey);
    if (value) {
      acc[agentKey] = value;
    }
    return acc;
  }, {});
}

function readDifyAssetWorkflowApiKeys(defaultAssetApiKey: string) {
  return ASSET_WORKFLOW_KEYS.reduce<AssetWorkflowApiKeys>((acc, workflowKey) => {
    const envKeyMap: Record<AssetWorkflowKey, string> = {
      firstInventory: "DIFY_API_KEY_ASSET_FIRST",
      resumeInventory: "DIFY_API_KEY_ASSET_RESUME",
      reviewUpdate: "DIFY_API_KEY_ASSET_REVIEW",
      reportGeneration: "DIFY_API_KEY_ASSET_REPORT"
    };
    acc[workflowKey] = normalizeString(process.env[envKeyMap[workflowKey]], defaultAssetApiKey);
    return acc;
  }, {
    firstInventory: defaultAssetApiKey,
    resumeInventory: defaultAssetApiKey,
    reviewUpdate: defaultAssetApiKey,
    reportGeneration: defaultAssetApiKey
  });
}

function normalizeStringList(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAppConfig(): AppConfig {
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const difyApiKey = String(process.env.DIFY_API_KEY || "").trim();
  const storageDir = String(process.env.STORAGE_DIR || path.join(process.cwd(), "storage")).trim();
  const routerChatflowByAgent = readRouterChatflowByAgent();
  const difyApiKeyByAgent = readDifyApiKeyByAgent(difyApiKey);
  const difyAssetWorkflowApiKeys = readDifyAssetWorkflowApiKeys(difyApiKey);
  const difyOnboardingFallbackApiKey = normalizeString(
    process.env.DIFY_API_KEY_ONBOARDING_FALLBACK,
    difyApiKey
  );
  const difyInfoCollectionApiKey = normalizeString(
    process.env.DIFY_API_KEY_INFO_COLLECTION,
    difyApiKey
  );
  const difyBusinessHealthApiKey = normalizeString(
    process.env.DIFY_API_KEY_BUSINESS_HEALTH,
    difyApiKey
  );

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!storageDir) {
    throw new Error("STORAGE_DIR is required");
  }

  return {
    port,
    corsOrigin: (() => {
      const o = process.env.CORS_ORIGIN;
      if (o) return o;
      if (process.env.NODE_ENV === "production") {
        throw new Error("CORS_ORIGIN is required in production");
      }
      return "*";
    })(),
    publicBaseUrl,
    databaseUrl,
    jwtSecret: (() => {
      const s = process.env.JWT_SECRET;
      if (s) return s;
      if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET is required in production");
      }
      return "opc-local-dev-secret";
    })(),
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "2h",
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || "30d",
    allowMockWechatLogin: normalizeBoolean(
      process.env.DEV_MOCK_WECHAT_LOGIN || process.env.ALLOW_MOCK_WECHAT_LOGIN,
      false
    ),
    allowDevFreshUserLogin: normalizeBoolean(process.env.ALLOW_DEV_FRESH_USER_LOGIN, true),
    devMockDify: normalizeBoolean(process.env.DEV_MOCK_DIFY, false),
    wechatAppId: readWechatAppId(),
    wechatAppSecret: readWechatAppSecret(),
    difyEnabled: normalizeBoolean(process.env.DIFY_ENABLED, !!difyApiKey),
    difyApiBaseUrl: process.env.DIFY_API_BASE_URL || "https://api.dify.ai/v1",
    difyApiKey,
    difyRequestTimeoutMs: Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 120000),
    difySnapshotTtlMinutes: normalizePositiveInteger(process.env.DIFY_SNAPSHOT_TTL_MINUTES, 15),
    difyApiKeyByAgent,
    difyAssetWorkflowApiKeys,
    difyOnboardingFallbackApiKey,
    difyInfoCollectionApiKey,
    difyBusinessHealthApiKey,
    routerChatflowByAgent,
    storageDir,
    memoryExtractionEnabled: normalizeBoolean(process.env.MEMORY_EXTRACTION_ENABLED, true),
    zhipuApiKey: normalizeString(process.env.ZHIPU_API_KEY),
    zhipuBaseUrl: normalizeString(
      process.env.ZHIPU_BASE_URL,
      "https://open.bigmodel.cn/api/paas/v4"
    ),
    memoryExtractorModel: normalizeString(process.env.MEMORY_EXTRACTOR_MODEL, "glm-4-flash"),
    memoryExtractorTimeoutMs: normalizePositiveInteger(process.env.MEMORY_EXTRACTOR_TIMEOUT_MS, 15000),
    memoryExtractorMaxTokens: normalizePositiveInteger(process.env.MEMORY_EXTRACTOR_MAX_TOKENS, 500),
    policySearchEnabled: normalizeBoolean(process.env.POLICY_SEARCH_ENABLED, false),
    policySearchProvider: normalizeString(process.env.POLICY_SEARCH_PROVIDER, "mock"),
    policySearchApiKey: normalizeString(process.env.POLICY_SEARCH_API_KEY),
    policySearchTtlMinutes: normalizePositiveInteger(process.env.POLICY_SEARCH_TTL_MINUTES, 360),
    policySearchTimeoutMs: normalizePositiveInteger(process.env.POLICY_SEARCH_TIMEOUT_MS, 10000),
    policySearchAllowedDomains: normalizeStringList(process.env.POLICY_SEARCH_ALLOWED_DOMAINS),
    sessionWindowTtlMinutes: normalizePositiveInteger(process.env.SESSION_WINDOW_TTL_MINUTES, 60),
    sessionWindowMaxMessages: normalizePositiveInteger(process.env.SESSION_WINDOW_MAX_MESSAGES, 20),
    chatflowSummaryEnabled: normalizeBoolean(process.env.CHATFLOW_SUMMARY_ENABLED, true),
    chatflowSummarizerModel: normalizeString(process.env.CHATFLOW_SUMMARIZER_MODEL, "glm-4-air"),
    chatflowSummarizerMaxTokens: normalizePositiveInteger(process.env.CHATFLOW_SUMMARIZER_MAX_TOKENS, 400),
    chatflowSummarizerTimeoutMs: normalizePositiveInteger(process.env.CHATFLOW_SUMMARIZER_TIMEOUT_MS, 20000),
    chatflowSummaryMinMessages: normalizePositiveInteger(process.env.CHATFLOW_SUMMARY_MIN_MESSAGES, 4),
    chatflowSummaryInjectLimit: normalizePositiveInteger(process.env.CHATFLOW_SUMMARY_INJECT_LIMIT, 3),
    chatflowSummaryDedupWindowMs: normalizePositiveInteger(
      process.env.CHATFLOW_SUMMARY_DEDUP_WINDOW_MS,
      5 * 60 * 1000
    ),
    userProfileRecomputeEnabled: normalizeBoolean(process.env.USER_PROFILE_RECOMPUTE_ENABLED, true),
    profileLlmEnrichEnabled: normalizeBoolean(process.env.PROFILE_LLM_ENRICH_ENABLED, true),
    profileLlmModel: normalizeString(process.env.PROFILE_LLM_MODEL, "glm-4-flash"),
    profileLlmTimeoutMs: normalizePositiveInteger(process.env.PROFILE_LLM_TIMEOUT_MS, 12000),
    profileLlmMaxTokens: normalizePositiveInteger(process.env.PROFILE_LLM_MAX_TOKENS, 500),
    digestCronEnabled: normalizeBoolean(process.env.DIGEST_CRON_ENABLED, true),
    digestCronDailyHour: normalizePositiveInteger(process.env.DIGEST_CRON_DAILY_HOUR, 22),
    digestCronWeeklyDay: normalizePositiveInteger(process.env.DIGEST_CRON_WEEKLY_DAY, 1),
    digestCronWeeklyHour: normalizePositiveInteger(process.env.DIGEST_CRON_WEEKLY_HOUR, 10),
    digestCronModel: normalizeString(process.env.DIGEST_CRON_MODEL, "glm-4-air"),
    digestCronMaxTokens: normalizePositiveInteger(process.env.DIGEST_CRON_MAX_TOKENS, 800),
    digestCronTimeoutMs: normalizePositiveInteger(process.env.DIGEST_CRON_TIMEOUT_MS, 30000),
    digestCronMinMessages: normalizePositiveInteger(process.env.DIGEST_CRON_MIN_MESSAGES, 3)
  };
}
