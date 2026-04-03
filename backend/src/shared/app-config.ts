import * as path from "node:path";

export type AppConfig = {
  port: number;
  corsOrigin: string;
  publicBaseUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  allowMockWechatLogin: boolean;
  devMockDify: boolean;
  wechatAppId: string;
  wechatAppSecret: string;
  difyEnabled: boolean;
  difyApiBaseUrl: string;
  difyApiKey: string;
  difyRequestTimeoutMs: number;
  storageDir: string;
};

function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value === "true";
}

export function getAppConfig(): AppConfig {
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const difyApiKey = String(process.env.DIFY_API_KEY || "").trim();
  const storageDir = String(process.env.STORAGE_DIR || path.join(process.cwd(), "storage")).trim();

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
    devMockDify: normalizeBoolean(process.env.DEV_MOCK_DIFY, false),
    wechatAppId: process.env.WECHAT_APP_ID || "",
    wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
    difyEnabled: normalizeBoolean(process.env.DIFY_ENABLED, !!difyApiKey),
    difyApiBaseUrl: process.env.DIFY_API_BASE_URL || "https://api.dify.ai/v1",
    difyApiKey,
    difyRequestTimeoutMs: Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 120000),
    storageDir
  };
}
