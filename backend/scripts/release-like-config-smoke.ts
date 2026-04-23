const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function applyEnv(overrides: Record<string, string | undefined>) {
  resetEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function logPass(name: string) {
  console.log(`[PASS] ${name}`);
}

function expectConfigFailure(
  name: string,
  overrides: Record<string, string | undefined>,
  expectedMessage: string
) {
  applyEnv({
    NODE_ENV: "development",
    APP_ENV: "staging",
    IS_RELEASE: "true",
    DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/opc_test",
    JWT_SECRET: "release-like-test-secret",
    CORS_ORIGIN: "https://opc.example.com",
    PUBLIC_BASE_URL: "https://opc.example.com",
    WECHAT_APP_ID: "wx-test-app-id",
    WECHAT_APP_SECRET: "wx-test-app-secret",
    DIFY_ENABLED: "false",
    ALLOW_MOCK_WECHAT_LOGIN: "false",
    DEV_MOCK_WECHAT_LOGIN: "false",
    DEV_MOCK_DIFY: "false",
    ALLOW_DEV_FRESH_USER_LOGIN: "false",
    ...overrides
  });

  const { getAppConfig } = require("../src/shared/app-config");
  try {
    getAppConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`${name} returned unexpected message: ${message}`);
    }
    logPass(name);
    return;
  }

  throw new Error(`${name} unexpectedly passed`);
}

function main() {
  expectConfigFailure(
    "release-like rejects missing CORS_ORIGIN",
    {
      CORS_ORIGIN: undefined
    },
    "CORS_ORIGIN is required in release-like environments"
  );

  expectConfigFailure(
    "release-like rejects missing JWT_SECRET",
    {
      JWT_SECRET: undefined
    },
    "JWT_SECRET is required in release-like environments"
  );

  expectConfigFailure(
    "release-like rejects localhost PUBLIC_BASE_URL",
    {
      PUBLIC_BASE_URL: "http://localhost:3000"
    },
    "PUBLIC_BASE_URL must use https in release-like environments"
  );

  expectConfigFailure(
    "release-like rejects http DIFY_API_BASE_URL",
    {
      DIFY_ENABLED: "true",
      DIFY_API_BASE_URL: "http://dify.internal/v1"
    },
    "DIFY_API_BASE_URL must use https in release-like environments"
  );

  expectConfigFailure(
    "release-like rejects mock wechat login flag",
    {
      ALLOW_MOCK_WECHAT_LOGIN: "true"
    },
    "ALLOW_MOCK_WECHAT_LOGIN and DEV_MOCK_WECHAT_LOGIN must be false or unset"
  );
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] release-like config smoke - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  resetEnv();
}
