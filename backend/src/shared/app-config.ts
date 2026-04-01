export type AppConfig = {
  port: number;
  corsOrigin: string;
  publicBaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  allowMockWechatLogin: boolean;
  wechatAppId: string;
  wechatAppSecret: string;
  difyEnabled: boolean;
  difyApiBaseUrl: string;
  difyApiKey: string;
  difyRequestTimeoutMs: number;
};

function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value === "true";
}

export function getAppConfig(): AppConfig {
  const port = Number(process.env.PORT || 3000);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const difyApiKey = String(process.env.DIFY_API_KEY || "").trim();

  return {
    port,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    publicBaseUrl,
    jwtSecret: process.env.JWT_SECRET || "opc-local-dev-secret",
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "2h",
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || "30d",
    allowMockWechatLogin: normalizeBoolean(process.env.ALLOW_MOCK_WECHAT_LOGIN, true),
    wechatAppId: process.env.WECHAT_APP_ID || "",
    wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
    difyEnabled: normalizeBoolean(process.env.DIFY_ENABLED, !!difyApiKey),
    difyApiBaseUrl: process.env.DIFY_API_BASE_URL || "https://api.dify.ai/v1",
    difyApiKey,
    difyRequestTimeoutMs: Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 120000)
  };
}
