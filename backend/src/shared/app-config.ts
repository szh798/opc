import * as path from "node:path";

const ROUTER_AGENT_KEYS = ["master", "asset", "execution", "mindset", "steward"] as const;
type RouterAgentKey = (typeof ROUTER_AGENT_KEYS)[number];
const ASSET_WORKFLOW_KEYS = ["firstInventory", "resumeInventory", "reviewUpdate", "reportGeneration"] as const;
export type AssetWorkflowKey = (typeof ASSET_WORKFLOW_KEYS)[number];
export type AssetWorkflowApiKeys = Record<AssetWorkflowKey, string>;
const OPPORTUNITY_DIFY_KEYS = ["directions", "deepDive", "projectFollowup", "followupPlanner"] as const;
export type OpportunityDifyKey = (typeof OPPORTUNITY_DIFY_KEYS)[number];
export type OpportunityDifyApiKeys = Record<OpportunityDifyKey, string>;

const DEFAULT_ROUTER_CHATFLOW_BY_AGENT: Record<RouterAgentKey, string> = {
  master: "cf_main_dialog",
  asset: "cf_asset_inventory",
  execution: "cf_execution_growth",
  mindset: "cf_mindset_breakthrough",
  steward: "cf_business_steward"
};

export type AppConfig = {
  port: number;
  appEnv: string;
  nodeEnv: string;
  isReleaseLike: boolean;
  enforceReleaseGuards: boolean;
  hasWechatConfig: boolean;
  corsOrigin: string;
  publicBaseUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  allowMockWechatLogin: boolean;
  allowDevFreshUserLogin: boolean;
  devFreshLoginSecret: string;
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
  difyOpportunityApiKeys: OpportunityDifyApiKeys;
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
  policySearchFreshnessDays: number;
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
  // —— Phase A1 内容安全（微信 msgSecCheck）
  contentSecurityEnabled: boolean;
  smsEnabled: boolean;
  smsDryRun: boolean;
  smsCodeDigits: number;
  smsCodeTtlSeconds: number;
  smsCodeCooldownSeconds: number;
  smsCodeMaxPerPhonePerHour: number;
  smsCodeMaxVerifyAttempts: number;
  smsCodeHashSecret: string;
  aliyunSmsEndpoint: string;
  aliyunSmsAccessKeyId: string;
  aliyunSmsAccessKeySecret: string;
  aliyunSmsSignName: string;
  aliyunSmsTemplateCode: string;
  aliyunSmsTemplateParamName: string;
  // —— Phase A3 业务级配额（单位：每自然日 UTC+8）
  quotaAssetInventoryPerDay: number;
  quotaAssetReportPerDay: number;
  quotaChatMessagesPerDay: number;
  // —— Phase B1 错误上报（Sentry；未配置时只本地持久化）
  sentryDsn: string;
  sentryEnvironment: string;
  sentryTracesSampleRate: number;
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

function readDifyOpportunityApiKeys() {
  return OPPORTUNITY_DIFY_KEYS.reduce<OpportunityDifyApiKeys>((acc, workflowKey) => {
    const envKeyMap: Record<OpportunityDifyKey, string> = {
      directions: "DIFY_API_KEY_OPPORTUNITY_DIRECTIONS",
      deepDive: "DIFY_API_KEY_OPPORTUNITY_DEEP_DIVE",
      projectFollowup: "DIFY_API_KEY_PROJECT_FOLLOWUP",
      followupPlanner: "DIFY_API_KEY_FOLLOWUP_PLANNER"
    };
    acc[workflowKey] = normalizeString(process.env[envKeyMap[workflowKey]]);
    return acc;
  }, {
    directions: "",
    deepDive: "",
    projectFollowup: "",
    followupPlanner: ""
  });
}

function normalizeStringList(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEnvironment(value: string | undefined, fallback: string) {
  return normalizeString(value, fallback).toLowerCase();
}

function looksLikeLocalAddress(value: string) {
  return /(127\.0\.0\.1|localhost|0\.0\.0\.0)/i.test(String(value || ""));
}

function ensureReleaseLikeCorsOrigin(value: string) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    throw new Error("CORS_ORIGIN is required in release-like environments");
  }
  if (safeValue === "*") {
    throw new Error("CORS_ORIGIN cannot be '*' in release-like environments");
  }

  const origins = safeValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!origins.length) {
    throw new Error("CORS_ORIGIN is required in release-like environments");
  }

  for (const origin of origins) {
    if (!/^https:\/\//i.test(origin)) {
      throw new Error("CORS_ORIGIN must use https in release-like environments");
    }
    if (looksLikeLocalAddress(origin)) {
      throw new Error("CORS_ORIGIN cannot point to localhost in release-like environments");
    }
  }

  return safeValue;
}

function ensureReleaseLikeUrl(value: string, label: string) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    throw new Error(`${label} is required in release-like environments`);
  }
  if (!/^https:\/\//i.test(safeValue)) {
    throw new Error(`${label} must use https in release-like environments`);
  }
  if (looksLikeLocalAddress(safeValue)) {
    throw new Error(`${label} cannot point to localhost in release-like environments`);
  }
  return safeValue;
}

function isReleaseLikeEnvironment(input: {
  nodeEnv: string;
  appEnv: string;
  isReleaseFlagEnabled: boolean;
}) {
  if (input.isReleaseFlagEnabled) {
    return true;
  }

  const releaseLikeAppEnvs = new Set(["staging", "preprod", "prod", "production"]);
  if (releaseLikeAppEnvs.has(input.appEnv)) {
    return true;
  }

  if (!input.appEnv && input.nodeEnv === "production") {
    return true;
  }

  return false;
}

export function getAppConfig(): AppConfig {
  const port = Number(process.env.PORT || 3000);
  const nodeEnv = normalizeEnvironment(process.env.NODE_ENV, "development");
  const appEnv = normalizeEnvironment(process.env.APP_ENV, "");
  const isReleaseFlagEnabled = normalizeBoolean(process.env.IS_RELEASE, false);
  const isReleaseLike = isReleaseLikeEnvironment({
    nodeEnv,
    appEnv,
    isReleaseFlagEnabled
  });
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const publicBaseUrl = normalizeString(process.env.PUBLIC_BASE_URL, `http://localhost:${port}`);
  const difyApiKey = String(process.env.DIFY_API_KEY || "").trim();
  const difyEnabled = normalizeBoolean(process.env.DIFY_ENABLED, !!difyApiKey);
  const difyApiBaseUrl = normalizeString(process.env.DIFY_API_BASE_URL, "https://api.dify.ai/v1");
  const storageDir = String(process.env.STORAGE_DIR || path.join(process.cwd(), "storage")).trim();
  const routerChatflowByAgent = readRouterChatflowByAgent();
  const difyApiKeyByAgent = readDifyApiKeyByAgent(difyApiKey);
  const difyAssetWorkflowApiKeys = readDifyAssetWorkflowApiKeys(difyApiKey);
  const difyOpportunityApiKeys = readDifyOpportunityApiKeys();
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
  const wechatAppId = readWechatAppId();
  const wechatAppSecret = readWechatAppSecret();
  const hasWechatConfig = !!(wechatAppId && wechatAppSecret);
  const allowMockWechatLogin =
    normalizeBoolean(process.env.DEV_MOCK_WECHAT_LOGIN, false) ||
    normalizeBoolean(process.env.ALLOW_MOCK_WECHAT_LOGIN, false);
  const allowDevFreshUserLogin = normalizeBoolean(process.env.ALLOW_DEV_FRESH_USER_LOGIN, false);
  const devFreshLoginSecret = normalizeString(process.env.DEV_FRESH_LOGIN_SECRET);
  const devMockDify = normalizeBoolean(process.env.DEV_MOCK_DIFY, false);
  const rawCorsOrigin = normalizeString(process.env.CORS_ORIGIN);
  const rawJwtSecret = normalizeString(process.env.JWT_SECRET);
  const smsEnabled = normalizeBoolean(
    process.env.SMS_ENABLED || process.env.ALIYUN_SMS_ENABLED,
    false
  );
  const smsDryRun = normalizeBoolean(process.env.ALIYUN_SMS_DRY_RUN, false);
  const aliyunSmsAccessKeyId = normalizeString(process.env.ALIBABA_CLOUD_ACCESS_KEY_ID);
  const aliyunSmsAccessKeySecret = normalizeString(process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET);
  const aliyunSmsSignName = normalizeString(process.env.ALIYUN_SMS_SIGN_NAME);
  const aliyunSmsTemplateCode = normalizeString(process.env.ALIYUN_SMS_TEMPLATE_CODE);
  const policySearchEnabled = normalizeBoolean(process.env.POLICY_SEARCH_ENABLED, false);
  const policySearchProvider = normalizeString(process.env.POLICY_SEARCH_PROVIDER, "mock").toLowerCase();
  const policySearchApiKey = normalizeString(process.env.POLICY_SEARCH_API_KEY);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!storageDir) {
    throw new Error("STORAGE_DIR is required");
  }

  if (allowDevFreshUserLogin && !devFreshLoginSecret) {
    throw new Error("DEV_FRESH_LOGIN_SECRET is required when ALLOW_DEV_FRESH_USER_LOGIN=true");
  }

  if (isReleaseLike) {
    if (allowDevFreshUserLogin) {
      throw new Error("ALLOW_DEV_FRESH_USER_LOGIN must be false or unset in release-like environments");
    }

    if (allowMockWechatLogin) {
      throw new Error("ALLOW_MOCK_WECHAT_LOGIN and DEV_MOCK_WECHAT_LOGIN must be false or unset in release-like environments");
    }

    if (devMockDify) {
      throw new Error("DEV_MOCK_DIFY must be false or unset in release-like environments");
    }

    if (!hasWechatConfig) {
      throw new Error("WECHAT_APP_ID and WECHAT_APP_SECRET are required in release-like environments");
    }

    ensureReleaseLikeCorsOrigin(rawCorsOrigin);

    if (!rawJwtSecret) {
      throw new Error("JWT_SECRET is required in release-like environments");
    }
    if (rawJwtSecret === "opc-local-dev-secret") {
      throw new Error("JWT_SECRET cannot use local default in release-like environments");
    }

    ensureReleaseLikeUrl(publicBaseUrl, "PUBLIC_BASE_URL");

    if (difyEnabled) {
      ensureReleaseLikeUrl(difyApiBaseUrl, "DIFY_API_BASE_URL");
    }

    if (smsDryRun) {
      throw new Error("ALIYUN_SMS_DRY_RUN must be false or unset in release-like environments");
    }

    if (policySearchEnabled) {
      if (policySearchProvider === "mock") {
        throw new Error("POLICY_SEARCH_PROVIDER=mock is not allowed in release-like environments");
      }
      if (!policySearchApiKey) {
        throw new Error("POLICY_SEARCH_API_KEY is required when POLICY_SEARCH_ENABLED=true in release-like environments");
      }
    }
  }

  if (smsEnabled && !smsDryRun) {
    const missingSmsConfig = [
      aliyunSmsAccessKeyId ? "" : "ALIBABA_CLOUD_ACCESS_KEY_ID",
      aliyunSmsAccessKeySecret ? "" : "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
      aliyunSmsSignName ? "" : "ALIYUN_SMS_SIGN_NAME",
      aliyunSmsTemplateCode ? "" : "ALIYUN_SMS_TEMPLATE_CODE"
    ].filter(Boolean);

    if (missingSmsConfig.length) {
      throw new Error(`Aliyun SMS config missing: ${missingSmsConfig.join(", ")}`);
    }
  }

  const corsOrigin = (() => {
    if (rawCorsOrigin) {
      return rawCorsOrigin;
    }
    if (isReleaseLike || process.env.NODE_ENV === "production") {
      throw new Error("CORS_ORIGIN is required in release-like environments");
    }
    return "*";
  })();

  const jwtSecret = (() => {
    if (rawJwtSecret) {
      return rawJwtSecret;
    }
    if (isReleaseLike || process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in release-like environments");
    }
    return "opc-local-dev-secret";
  })();

  return {
    port,
    appEnv,
    nodeEnv,
    isReleaseLike,
    enforceReleaseGuards: isReleaseLike,
    hasWechatConfig,
    corsOrigin,
    publicBaseUrl,
    databaseUrl,
    jwtSecret,
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "2h",
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || "30d",
    allowMockWechatLogin,
    allowDevFreshUserLogin,
    devFreshLoginSecret,
    devMockDify,
    wechatAppId,
    wechatAppSecret,
    difyEnabled,
    difyApiBaseUrl,
    difyApiKey,
    difyRequestTimeoutMs: Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 120000),
    difySnapshotTtlMinutes: normalizePositiveInteger(process.env.DIFY_SNAPSHOT_TTL_MINUTES, 15),
    difyApiKeyByAgent,
    difyAssetWorkflowApiKeys,
    difyOpportunityApiKeys,
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
    policySearchEnabled,
    policySearchProvider,
    policySearchApiKey,
    policySearchTtlMinutes: normalizePositiveInteger(process.env.POLICY_SEARCH_TTL_MINUTES, 60),
    policySearchTimeoutMs: normalizePositiveInteger(process.env.POLICY_SEARCH_TIMEOUT_MS, 10000),
    policySearchFreshnessDays: normalizePositiveInteger(process.env.POLICY_SEARCH_FRESHNESS_DAYS, 365),
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
    digestCronMinMessages: normalizePositiveInteger(process.env.DIGEST_CRON_MIN_MESSAGES, 3),
    contentSecurityEnabled: normalizeBoolean(
      process.env.CONTENT_SECURITY_ENABLED,
      isReleaseLike
    ),
    smsEnabled,
    smsDryRun,
    smsCodeDigits: normalizePositiveInteger(process.env.SMS_CODE_DIGITS, 6),
    smsCodeTtlSeconds: normalizePositiveInteger(process.env.SMS_CODE_TTL_SECONDS, 300),
    smsCodeCooldownSeconds: normalizePositiveInteger(process.env.SMS_CODE_COOLDOWN_SECONDS, 60),
    smsCodeMaxPerPhonePerHour: normalizePositiveInteger(
      process.env.SMS_CODE_MAX_PER_PHONE_PER_HOUR,
      5
    ),
    smsCodeMaxVerifyAttempts: normalizePositiveInteger(process.env.SMS_CODE_MAX_VERIFY_ATTEMPTS, 5),
    smsCodeHashSecret: normalizeString(process.env.SMS_CODE_HASH_SECRET, rawJwtSecret),
    aliyunSmsEndpoint: normalizeString(process.env.ALIYUN_SMS_ENDPOINT, "dysmsapi.aliyuncs.com"),
    aliyunSmsAccessKeyId,
    aliyunSmsAccessKeySecret,
    aliyunSmsSignName,
    aliyunSmsTemplateCode,
    aliyunSmsTemplateParamName: normalizeString(process.env.ALIYUN_SMS_TEMPLATE_PARAM_NAME, "code"),
    quotaAssetInventoryPerDay: normalizePositiveInteger(
      process.env.QUOTA_ASSET_INVENTORY_PER_DAY,
      3
    ),
    quotaAssetReportPerDay: normalizePositiveInteger(
      process.env.QUOTA_ASSET_REPORT_PER_DAY,
      5
    ),
    quotaChatMessagesPerDay: normalizePositiveInteger(
      process.env.QUOTA_CHAT_MESSAGES_PER_DAY,
      500
    ),
    sentryDsn: normalizeString(process.env.SENTRY_DSN, ""),
    sentryEnvironment: normalizeString(
      process.env.SENTRY_ENVIRONMENT,
      normalizeString(process.env.APP_ENV, "dev")
    ),
    sentryTracesSampleRate: normalizeSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      isReleaseLike ? 0.1 : 0
    )
  };
}

function normalizeSampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}
