/**
 * 回归测试:Dify 请求 timeout 不应触发 60 秒熔断器
 *
 * 背景 bug:
 *   用户跑资产盘点流的第 5 轮对话时,Dify LLM 回答耗时超过 300 秒(上下文累积 /
 *   工作流变重),触发 axios 超时。normalizeError 把 "没有 HTTP status 的错误"
 *   一股脑当成 "基础设施故障",在 disabledUntilByCredential 里拉黑该 apiKey 60 秒。
 *   60 秒内所有走同一个 key 的请求 isEnabled=false → 路由层 fast-fail 503
 *   "Dify is unavailable"。用户视角下表现为 "智能体暂时不可用,请稍后重试",
 *   且永远点不动(因为 retry 又会触发同一条慢 query,再次开熔断器,死循环)。
 *
 * 本脚本通过 monkey-patch axios.post 把下一次请求强制变成 axios 超时,
 * 然后断言:
 *   (a) sendChatMessage 会抛错(符合预期,调用方负责上抛 503 给用户)
 *   (b) 抛错之后,isEnabled(apiKey) 仍然返回 true —— 这是修复点
 *
 * 用法:
 *   cd backend && npx ts-node --project tsconfig.json scripts/dify-timeout-no-circuit-smoke.ts
 */

import path from "node:path";
import axios, { AxiosError } from "axios";

// 必须先加载 .env,因为 DifyService 构造时会调用 getAppConfig(),
// 而 getAppConfig 会要求 DATABASE_URL / STORAGE_DIR 等 env 存在。
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// 延迟到 .env 加载之后再 import,避免 getAppConfig 在顶层失败。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DifyService } = require("../src/dify.service");

type PatchRestore = () => void;

function patchAxiosToTimeout(): PatchRestore {
  const originalPost = axios.post.bind(axios);
  axios.post = (async (..._args: unknown[]) => {
    // 构造一个和 axios 真实 timeout 等价的错误:
    //   - code = "ECONNABORTED"
    //   - response 为 undefined(因为根本没收到响应)
    //   - message 里包含 "timeout of Xms exceeded"
    const fakeError = new Error("timeout of 300000ms exceeded") as AxiosError;
    (fakeError as AxiosError).isAxiosError = true;
    (fakeError as AxiosError).code = "ECONNABORTED";
    (fakeError as AxiosError).config = {} as AxiosError["config"];
    // response 故意留空,模拟真实超时场景
    throw fakeError;
  }) as unknown as typeof axios.post;

  return () => {
    axios.post = originalPost;
  };
}

async function main() {
  // 确保 Dify 开关是打开的,否则 isEnabled 会因为 difyEnabled=false 返回 false,
  // 测试就无法区分 "被熔断器拉黑" 还是 "开关没开"。
  if (!process.env.DIFY_API_BASE_URL) {
    process.env.DIFY_API_BASE_URL = "http://localhost:8080/v1";
  }
  if (!process.env.DIFY_API_KEY) {
    // 给一个假 key,反正我们会 monkey-patch axios,不会真的发出去
    process.env.DIFY_API_KEY = "test-dummy-key-for-circuit-breaker-regression";
  }

  const service = new DifyService();
  const apiKey = String(process.env.DIFY_API_KEY);

  // 前置断言:在触发错误前,isEnabled 必须是 true
  if (!service.isEnabled(apiKey)) {
    console.log("[FAIL] isEnabled(apiKey) should be true BEFORE the timeout");
    console.log("       this means env is not configured correctly and the test");
    console.log("       cannot distinguish config problems from circuit breaker bugs");
    process.exit(1);
  }

  const restore = patchAxiosToTimeout();

  let threw = false;
  let errorMessage = "";
  try {
    await service.sendChatMessage(
      {
        query: "触发一次人造超时",
        user: "circuit-breaker-regression",
        conversationId: "",
        inputs: {}
      },
      { apiKey }
    );
  } catch (error) {
    threw = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    restore();
  }

  if (!threw) {
    console.log("[FAIL] sendChatMessage should throw when axios times out");
    process.exit(1);
  }

  if (!/timeout/i.test(errorMessage)) {
    console.log(`[WARN] thrown error message does not mention 'timeout': ${errorMessage}`);
    // 不立刻 fail,因为 simplifyRemoteMessage 可能改写了,但继续核心断言
  } else {
    console.log(`[OK]   sendChatMessage threw as expected: ${errorMessage}`);
  }

  // 关键断言:超时错误之后,熔断器绝不能把 apiKey 拉黑。
  // 修复前:normalizeError 会在 line 107 setDisabledUntil(apiKey, +60s),
  // 导致下面这个 isEnabled 返回 false。
  // 修复后:timeout 被从熔断条件里剔除,isEnabled 仍然是 true。
  const stillEnabled = service.isEnabled(apiKey);
  if (!stillEnabled) {
    console.log("");
    console.log("[FAIL] ========================================================");
    console.log("[FAIL] REGRESSION: a single axios timeout opened the circuit");
    console.log("[FAIL] breaker for apiKey. isEnabled(apiKey) is now false, which");
    console.log("[FAIL] makes router.service.ts:1952 skip the Dify call and throw");
    console.log("[FAIL] 503 'Dify is unavailable' for every subsequent request.");
    console.log("[FAIL] ");
    console.log("[FAIL] This is exactly the bug that blocked the asset inventory");
    console.log("[FAIL] flow on turn 5. Fix location: backend/src/dify.service.ts");
    console.log("[FAIL] normalizeError() — timeouts must NOT trigger the breaker.");
    console.log("[FAIL] ========================================================");
    process.exit(1);
  }

  console.log("[OK]   isEnabled(apiKey) is still true after the timeout");

  // 反向断言:修复不能误伤原本就该熔断的场景(真·Dify 5xx)。
  // 我们用一个新 apiKey,避免和前面的 timeout 场景串台。
  const infraKey = "test-dummy-key-for-infra-failure";
  process.env.DIFY_API_KEY = infraKey;
  const infraService = new DifyService();
  if (!infraService.isEnabled(infraKey)) {
    console.log("[FAIL] infra-failure probe: isEnabled should be true before the 500");
    process.exit(1);
  }

  const restore500 = (() => {
    const originalPost = axios.post.bind(axios);
    axios.post = (async (..._args: unknown[]) => {
      const fakeError = new Error("Internal Server Error") as AxiosError;
      (fakeError as AxiosError).isAxiosError = true;
      (fakeError as AxiosError).config = {} as AxiosError["config"];
      (fakeError as AxiosError).response = {
        status: 500,
        statusText: "Internal Server Error",
        data: {},
        headers: {},
        config: {} as AxiosError["config"]
      } as AxiosError["response"];
      throw fakeError;
    }) as unknown as typeof axios.post;
    return () => {
      axios.post = originalPost;
    };
  })();

  try {
    await infraService.sendChatMessage(
      { query: "500 probe", user: "circuit-breaker-regression", conversationId: "", inputs: {} },
      { apiKey: infraKey }
    );
  } catch (_error) {
    // 预期抛错
  } finally {
    restore500();
  }

  if (infraService.isEnabled(infraKey)) {
    console.log("[FAIL] infra-failure probe: a 500 response should STILL open the breaker");
    console.log("       (this would mean the fix over-corrected and disabled all breakers)");
    process.exit(1);
  }
  console.log("[OK]   isEnabled(apiKey) is false after a 500 — infra breaker still works");

  console.log("");
  console.log("[PASS] dify timeout does not open the circuit breaker, 5xx still does");
  process.exit(0);
}

main().catch((error) => {
  console.log(`[FAIL] unexpected error: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
