const { spawn } = require("node:child_process");

const DEFAULT_PROXY_URL = "http://127.0.0.1:7897";
const DEFAULT_NPM_REGISTRY = "https://registry.npmmirror.com";
const DEFAULT_PRISMA_ENGINES_MIRROR = "https://registry.npmmirror.com/-/binary/prisma";

function quoteArg(value) {
  const source = String(value || "");
  if (!source) {
    return "\"\"";
  }

  if (!/[ \t"&|<>^]/.test(source)) {
    return source;
  }

  return `"${source.replace(/"/g, '\\"')}"`;
}

function buildProxyEnv(sourceEnv) {
  const proxyUrl = String(sourceEnv.OPC_PROXY_URL || DEFAULT_PROXY_URL).trim();
  const npmRegistry = String(sourceEnv.OPC_NPM_REGISTRY || DEFAULT_NPM_REGISTRY).trim();
  const prismaMirror = String(sourceEnv.OPC_PRISMA_ENGINES_MIRROR || DEFAULT_PRISMA_ENGINES_MIRROR).trim();

  const env = { ...sourceEnv };

  if (proxyUrl) {
    env.HTTP_PROXY = env.HTTP_PROXY || proxyUrl;
    env.HTTPS_PROXY = env.HTTPS_PROXY || proxyUrl;
    env.http_proxy = env.http_proxy || proxyUrl;
    env.https_proxy = env.https_proxy || proxyUrl;
    env.npm_config_proxy = env.npm_config_proxy || proxyUrl;
    env.npm_config_https_proxy = env.npm_config_https_proxy || proxyUrl;
  }

  env.npm_config_registry = env.npm_config_registry || npmRegistry;
  env.PRISMA_ENGINES_MIRROR = env.PRISMA_ENGINES_MIRROR || prismaMirror;

  return env;
}

function printUsage() {
  console.error("Usage: node scripts/with-proxy.js <command> [args...]");
  console.error("Example: node scripts/with-proxy.js npm run typecheck");
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    printUsage();
    process.exit(1);
  }

  const env = buildProxyEnv(process.env);
  const [rawCommand, ...commandArgs] = args;
  const command =
    process.platform === "win32" && (rawCommand === "npm" || rawCommand === "npx")
      ? `${rawCommand}.cmd`
      : rawCommand;

  console.log(`[with-proxy] command: ${[command, ...commandArgs].join(" ")}`);
  console.log(`[with-proxy] HTTP_PROXY=${env.HTTP_PROXY || "(empty)"}`);
  console.log(`[with-proxy] npm_config_registry=${env.npm_config_registry || "(empty)"}`);
  console.log(`[with-proxy] PRISMA_ENGINES_MIRROR=${env.PRISMA_ENGINES_MIRROR || "(empty)"}`);

  const commandLine = [command, ...commandArgs].map(quoteArg).join(" ");
  const child = spawn(commandLine, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: true
  });

  child.on("error", (error) => {
    console.error(`[with-proxy] failed to start command: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (typeof code === "number") {
      process.exit(code);
      return;
    }

    if (signal) {
      console.error(`[with-proxy] command exited by signal: ${signal}`);
    }
    process.exit(1);
  });
}

main();
