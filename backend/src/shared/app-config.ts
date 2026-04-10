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
  routerChatflowByAgent: Record<RouterAgentKey, string>;
  storageDir: string;
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

export function getAppConfig(): AppConfig {
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const difyApiKey = String(process.env.DIFY_API_KEY || "").trim();
  const storageDir = String(process.env.STORAGE_DIR || path.join(process.cwd(), "storage")).trim();
  const routerChatflowByAgent = readRouterChatflowByAgent();
  const difyApiKeyByAgent = readDifyApiKeyByAgent(difyApiKey);
  const difyAssetWorkflowApiKeys = readDifyAssetWorkflowApiKeys(difyApiKey);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!storageDir) {
    throw new Error("STORAGE_DIR is required");
  }

  return {
    port,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    publicBaseUrl,
    databaseUrl,
    jwtSecret: process.env.JWT_SECRET || "opc-local-dev-secret",
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
    routerChatflowByAgent,
    storageDir
  };
}
