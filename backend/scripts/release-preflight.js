const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const repoRoot = path.resolve(__dirname, "..", "..");
const backendRoot = path.resolve(__dirname, "..");
const backendEnvPath = process.env.RELEASE_ENV_FILE
  ? path.resolve(process.cwd(), process.env.RELEASE_ENV_FILE)
  : path.join(backendRoot, ".env");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

dotenv.config({ path: backendEnvPath });

const argv = process.argv.slice(2);
const options = {
  staticOnly: argv.includes("--static-only"),
  skipInstall: argv.includes("--skip-install"),
  skipTypecheck: argv.includes("--skip-typecheck"),
  skipBuild: argv.includes("--skip-build"),
  skipRouterChecks: argv.includes("--skip-router-checks"),
  skipDbDeploy: argv.includes("--skip-db-deploy"),
  skipSmoke: argv.includes("--skip-smoke")
};

if (options.staticOnly) {
  options.skipInstall = true;
  options.skipTypecheck = true;
  options.skipBuild = true;
  options.skipRouterChecks = true;
  options.skipDbDeploy = true;
  options.skipSmoke = true;
}

const results = [];
let hasFailure = false;

function record(status, name, detail) {
  results.push({ status, name, detail: detail || "" });
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${name}${suffix}`);
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function warn(name, detail) {
  record("WARN", name, detail);
}

function fail(name, detail) {
  hasFailure = true;
  record("FAIL", name, detail);
}

function runCheck(name, fn) {
  try {
    const detail = fn();
    pass(name, detail);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

function isSensitiveKey(key) {
  return /(secret|token|key|password|database_url|jwt_secret)/i.test(key);
}

function readEnv(key) {
  return String(process.env[key] || "").trim();
}

function looksLikePlaceholder(value) {
  const lowered = String(value || "").toLowerCase();
  return (
    !lowered ||
    lowered.includes("your_") ||
    lowered.includes("your-domain.com") ||
    lowered.includes("example") ||
    lowered === "opc-local-dev-secret"
  );
}

function looksLikeLocalAddress(value) {
  return /(127\.0\.0\.1|localhost|0\.0\.0\.0)/i.test(String(value || ""));
}

function ensureConfigured(key, options = {}) {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`${key} is empty`);
  }
  if (looksLikePlaceholder(value)) {
    throw new Error(`${key} still looks like a placeholder`);
  }
  if (options.disallowWildcard && value === "*") {
    throw new Error(`${key} cannot be '*' in release`);
  }
  if (options.requireHttps && !/^https:\/\//i.test(value)) {
    throw new Error(`${key} must use https`);
  }
  if (options.disallowLocalhost && looksLikeLocalAddress(value)) {
    throw new Error(`${key} cannot point to localhost in release`);
  }
  if (options.disallowMock && /\bmock\b/i.test(value)) {
    throw new Error(`${key} cannot point to a mock provider in release`);
  }
  return isSensitiveKey(key) ? "configured" : value;
}

function ensureFalse(key) {
  const value = readEnv(key);
  if (!value) {
    return "unset";
  }
  if (value !== "false") {
    throw new Error(`${key} must be false or unset, received '${value}'`);
  }
  return "false";
}

function readBoolean(key, fallback) {
  const value = readEnv(key);
  if (!value) {
    return fallback;
  }
  return value === "true";
}

function resolveStoragePath(value) {
  if (!value) {
    return "";
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(backendRoot, value);
}

function ensureWritablePath(name, rawPath) {
  const targetPath = resolveStoragePath(rawPath);
  if (!targetPath) {
    throw new Error(`${name} is empty`);
  }

  if (fs.existsSync(targetPath)) {
    fs.accessSync(targetPath, fs.constants.W_OK);
    return `${targetPath} writable`;
  }

  const parent = path.dirname(targetPath);
  if (!fs.existsSync(parent)) {
    throw new Error(`${targetPath} is missing and parent ${parent} does not exist`);
  }
  fs.accessSync(parent, fs.constants.W_OK);
  return `${targetPath} missing, but parent is writable`;
}

function requireFrontendRuntime() {
  return require(path.join(repoRoot, "utils", "env.js"));
}

function validateFrontendBaseUrl(label, value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    throw new Error(`${label} baseURL is empty`);
  }
  if (!/^https:\/\//i.test(safeValue)) {
    throw new Error(`${label} baseURL must use https`);
  }
  if (looksLikeLocalAddress(safeValue)) {
    throw new Error(`${label} baseURL cannot point to localhost`);
  }
  if (looksLikePlaceholder(safeValue)) {
    throw new Error(`${label} baseURL still looks like placeholder`);
  }
  return safeValue;
}

function validateOptionalFrontendOverride(label, value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return {
      status: "WARN",
      detail: "not set; falling back to committed preset"
    };
  }
  return {
    status: "PASS",
    detail: validateFrontendBaseUrl(label, safeValue)
  };
}

function validateGitTracking(paths) {
  const response = spawnSync("git", ["ls-files", ...paths], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (response.status !== 0) {
    throw new Error((response.stderr || response.stdout || "git ls-files failed").trim());
  }
  const tracked = String(response.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (tracked.length > 0) {
    throw new Error(`tracked sensitive files: ${tracked.join(", ")}`);
  }
  return "backend/.env and utils/runtime-config.local.js are not tracked";
}

function validateStaticRuntimeGuards() {
  const mainSource = fs.readFileSync(path.join(backendRoot, "src", "main.ts"), "utf8");
  const bootstrapSource = fs.readFileSync(path.join(backendRoot, "src", "bootstrap.controller.ts"), "utf8");
  const configSource = fs.readFileSync(path.join(backendRoot, "src", "shared", "app-config.ts"), "utf8");

  if (!mainSource.includes("await app.register(rateLimit")) {
    throw new Error("rate limit registration not found in src/main.ts");
  }
  if (!mainSource.includes('reply.header("x-request-id", request.id)')) {
    throw new Error("x-request-id header hook not found in src/main.ts");
  }
  if (!bootstrapSource.includes('@Get("health")') || !bootstrapSource.includes('@Get("ready")')) {
    throw new Error("health/ready endpoints not found in bootstrap controller");
  }
  if (!configSource.includes('throw new Error("CORS_ORIGIN is required in production")')) {
    throw new Error("production CORS guard not found in app-config");
  }

  return "rate limit, request id, health/ready, and production CORS guards are present";
}

function runCommand(label, command, args, extraEnv = {}) {
  const child = spawnSync(command, args, {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  if (child.status !== 0) {
    fail(label, `command failed with exit code ${child.status}`);
    return false;
  }

  pass(label, [command, ...args].join(" "));
  return true;
}

console.log(`Running release preflight from ${backendRoot}`);
console.log(`Using env file: ${fs.existsSync(backendEnvPath) ? backendEnvPath : `${backendEnvPath} (missing)`}`);

runCheck("required env DATABASE_URL", () => ensureConfigured("DATABASE_URL"));
runCheck("required env JWT_SECRET", () =>
  ensureConfigured("JWT_SECRET", {
    disallowLocalhost: false
  })
);
runCheck("required env CORS_ORIGIN", () =>
  ensureConfigured("CORS_ORIGIN", {
    disallowWildcard: true,
    requireHttps: true,
    disallowLocalhost: true
  })
);
runCheck("required env PUBLIC_BASE_URL", () =>
  ensureConfigured("PUBLIC_BASE_URL", {
    requireHttps: true,
    disallowLocalhost: true
  })
);
runCheck("required env WECHAT_APP_ID", () => ensureConfigured("WECHAT_APP_ID"));
runCheck("required env WECHAT_APP_SECRET", () => ensureConfigured("WECHAT_APP_SECRET"));
runCheck("dev flag ALLOW_DEV_FRESH_USER_LOGIN", () => ensureFalse("ALLOW_DEV_FRESH_USER_LOGIN"));
runCheck("dev flag ALLOW_MOCK_WECHAT_LOGIN", () => ensureFalse("ALLOW_MOCK_WECHAT_LOGIN"));
runCheck("dev flag DEV_MOCK_DIFY", () => ensureFalse("DEV_MOCK_DIFY"));
runCheck("storage dir", () => ensureWritablePath("STORAGE_DIR", readEnv("STORAGE_DIR") || "./storage"));
runCheck("git tracked secrets", () => validateGitTracking(["backend/.env", "utils/runtime-config.local.js"]));
runCheck("static runtime guards", () => validateStaticRuntimeGuards());

runCheck("frontend preset trial domain", () => {
  const runtime = requireFrontendRuntime();
  return validateFrontendBaseUrl("trial", runtime.RUNTIME_CONFIG_PRESETS.trial.baseURL);
});
runCheck("frontend preset release domain", () => {
  const runtime = requireFrontendRuntime();
  return validateFrontendBaseUrl("release", runtime.RUNTIME_CONFIG_PRESETS.release.baseURL);
});

const runtimeOverridePath = path.join(repoRoot, "utils", "runtime-config.local.js");
if (fs.existsSync(runtimeOverridePath)) {
  try {
    const localRuntimeConfig = require(runtimeOverridePath);
    const trialOverride = validateOptionalFrontendOverride(
      "frontend local override trial domain",
      localRuntimeConfig.trial && localRuntimeConfig.trial.baseURL
    );
    record(trialOverride.status, "frontend local override trial domain", trialOverride.detail);

    const releaseOverride = validateOptionalFrontendOverride(
      "frontend local override release domain",
      localRuntimeConfig.release && localRuntimeConfig.release.baseURL
    );
    record(releaseOverride.status, "frontend local override release domain", releaseOverride.detail);
  } catch (error) {
    fail(
      "frontend local override domain",
      error instanceof Error ? error.message : String(error)
    );
  }
} else {
  warn("frontend local override", "utils/runtime-config.local.js not found; using committed presets only");
}

const difyEnabled = readBoolean("DIFY_ENABLED", false);
if (difyEnabled) {
  runCheck("DIFY_API_BASE_URL", () =>
    ensureConfigured("DIFY_API_BASE_URL", {
      requireHttps: true,
      disallowLocalhost: true
    })
  );
  runCheck("DIFY_API_KEY or module keys", () => {
    const keys = [
      "DIFY_API_KEY",
      "DIFY_API_KEY_MASTER",
      "DIFY_API_KEY_ASSET_FIRST",
      "DIFY_API_KEY_ASSET_RESUME",
      "DIFY_API_KEY_ASSET_REVIEW",
      "DIFY_API_KEY_ASSET_REPORT",
      "DIFY_API_KEY_STEWARD",
      "DIFY_API_KEY_ONBOARDING_FALLBACK",
      "DIFY_API_KEY_INFO_COLLECTION",
      "DIFY_API_KEY_BUSINESS_HEALTH"
    ];
    const configuredKeys = keys.filter((key) => readEnv(key));
    if (!configuredKeys.length) {
      throw new Error("no Dify API key is configured while DIFY_ENABLED=true");
    }
    return `configured keys: ${configuredKeys.join(", ")}`;
  });
} else {
  warn("DIFY_ENABLED", "DIFY_ENABLED=false; core chat flows may fail in release if no fallback is intended");
}

const zhipuDependentFeatures = [
  { key: "MEMORY_EXTRACTION_ENABLED", fallback: true },
  { key: "CHATFLOW_SUMMARY_ENABLED", fallback: true },
  { key: "PROFILE_LLM_ENRICH_ENABLED", fallback: true },
  { key: "DIGEST_CRON_ENABLED", fallback: true }
].filter((item) => readBoolean(item.key, item.fallback));

if (zhipuDependentFeatures.length > 0) {
  runCheck("ZHIPU_API_KEY", () => {
    ensureConfigured("ZHIPU_API_KEY");
    return `required by ${zhipuDependentFeatures.map((item) => item.key).join(", ")}`;
  });
} else {
  pass("ZHIPU_API_KEY", "all Zhipu-backed features are disabled");
}

const policySearchEnabled = readBoolean("POLICY_SEARCH_ENABLED", false);
if (policySearchEnabled) {
  runCheck("policy search provider", () => {
    const provider = ensureConfigured("POLICY_SEARCH_PROVIDER", {
      disallowMock: true
    });
    return provider;
  });
  if (readEnv("POLICY_SEARCH_PROVIDER") !== "mock") {
    runCheck("policy search api key", () => ensureConfigured("POLICY_SEARCH_API_KEY"));
  }
} else {
  pass("policy search provider", `disabled (${readEnv("POLICY_SEARCH_PROVIDER") || "unset"})`);
}

if (!options.skipInstall) {
  runCommand("npm ci", npmCommand, ["ci"]);
}
if (!hasFailure && !options.skipTypecheck) {
  runCommand("npm run typecheck", npmCommand, ["run", "typecheck"]);
}
if (!hasFailure && !options.skipBuild) {
  runCommand("npm run build", npmCommand, ["run", "build"]);
}
if (!hasFailure && !options.skipRouterChecks) {
  runCommand("npm run test:router-contract", npmCommand, ["run", "test:router-contract"]);
  if (!hasFailure) {
    runCommand("npm run test:dify-timeout", npmCommand, ["run", "test:dify-timeout"]);
  }
}
if (!hasFailure && !options.skipDbDeploy) {
  runCommand("npm run db:deploy", npmCommand, ["run", "db:deploy"]);
}

if (!readEnv("SMOKE_REFRESH_TOKEN")) {
  warn("SMOKE_REFRESH_TOKEN", "missing; smoke will only cover guest endpoints unless you export a real token");
}
if (!hasFailure && !options.skipSmoke) {
  runCommand("npm run smoke", npmCommand, ["run", "smoke"]);
}

const passCount = results.filter((item) => item.status === "PASS").length;
const warnCount = results.filter((item) => item.status === "WARN").length;
const failCount = results.filter((item) => item.status === "FAIL").length;

console.log("");
console.log(`Release preflight summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
if (failCount > 0) {
  console.log("Release preflight failed. Fix the failed checks before go-live.");
  process.exitCode = 1;
}
