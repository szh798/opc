import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

const ORIGINAL_ENV = { ...process.env };

function applyEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV };
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

async function expectUnauthorized(
  name: string,
  task: () => Promise<unknown>,
  expectedMessage: string
) {
  try {
    await task();
  } catch (error) {
    if (!(error instanceof UnauthorizedException)) {
      throw error;
    }
    const message = String(error.message || "");
    if (!message.includes(expectedMessage)) {
      throw new Error(`${name} returned unexpected message: ${message}`);
    }
    logPass(name);
    return;
  }

  throw new Error(`${name} unexpectedly succeeded`);
}

async function main() {
  applyEnv({
    NODE_ENV: "development",
    APP_ENV: "local",
    IS_RELEASE: "false",
    DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/opc_test",
    JWT_SECRET: "auth-no-mock-test-secret",
    CORS_ORIGIN: "http://127.0.0.1:3000",
    PUBLIC_BASE_URL: "http://127.0.0.1:3000",
    ALLOW_MOCK_WECHAT_LOGIN: "false",
    DEV_MOCK_WECHAT_LOGIN: "false",
    ALLOW_DEV_FRESH_USER_LOGIN: "false",
    WECHAT_APP_ID: undefined,
    WECHAT_APP_SECRET: undefined
  });

  const [{ AuthService }] = await Promise.all([import("../src/auth/auth.service")]);
  const authService = new AuthService(
    new JwtService({ secret: "auth-no-mock-test-secret" }),
    {} as any,
    {
      buildUserPayload(user: unknown) {
        return user;
      },
      async getUserOrDemo(userId: string) {
        return { id: userId };
      }
    } as any,
    {
      isConfigured() {
        return false;
      }
    } as any
  );

  await expectUnauthorized(
    "wechat login rejects missing code without mock",
    () => authService.loginByWechat({}),
    "WeChat login requires a valid code"
  );

  await expectUnauthorized(
    "wechat login rejects missing credentials without mock",
    () => authService.loginByWechat({ code: "test-code" }),
    "WECHAT_APP_ID or WECHAT_APP_SECRET is missing"
  );
}

main()
  .catch((error) => {
    console.error(`[FAIL] auth no mock release smoke - ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    process.env = ORIGINAL_ENV;
  });
