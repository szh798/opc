const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const prismaClientDir = path.join(repoRoot, "node_modules", ".prisma", "client");
const generatedClientIndexPath = path.join(prismaClientDir, "index.js");
const localPrismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
const temporaryRustEnginePattern = /^query_engine-windows\.dll\.node\.tmp\d+$/i;
const legacyRustEngineArtifacts = [
  "query_engine-windows.dll.node",
  "query_engine_bg.js",
  "query_engine_bg.wasm"
];

function cleanupTemporaryEngines() {
  if (!fs.existsSync(prismaClientDir)) {
    return;
  }

  const fileNames = fs.readdirSync(prismaClientDir);
  for (const fileName of fileNames) {
    if (!temporaryRustEnginePattern.test(fileName)) {
      continue;
    }

    try {
      fs.unlinkSync(path.join(prismaClientDir, fileName));
    } catch (_error) {
      // Ignore cleanup failures; they are non-blocking.
    }
  }
}

function generatedClientUsesJavascriptEngine() {
  if (!fs.existsSync(generatedClientIndexPath)) {
    return false;
  }

  try {
    const clientIndex = fs.readFileSync(generatedClientIndexPath, "utf8");
    return clientIndex.includes('"engineType": "client"');
  } catch (_error) {
    return false;
  }
}

function cleanupLegacyRustEngineArtifacts() {
  if (!generatedClientUsesJavascriptEngine()) {
    return [];
  }

  const failures = [];
  for (const fileName of legacyRustEngineArtifacts) {
    const filePath = path.join(prismaClientDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      failures.push({
        fileName,
        code: String(error && error.code ? error.code : "UNKNOWN")
      });
    }
  }

  cleanupTemporaryEngines();
  return failures;
}

cleanupTemporaryEngines();

if (!fs.existsSync(localPrismaCliPath)) {
  process.stderr.write(
    [
      "Local Prisma CLI was not found at `node_modules/prisma/build/index.js`.",
      "Run `npm install` in `backend/` to restore the local Prisma installation, then rerun `npm run db:generate`."
    ].join("\n") + "\n"
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [localPrismaCliPath, "generate"], {
  cwd: repoRoot,
  stdio: "inherit"
});

if (typeof result.status === "number" && result.status !== 0) {
  process.stderr.write(
    [
      "",
      "Prisma generate failed.",
      "If you are on Windows and see `EPERM ... query_engine-windows.dll.node`,",
      "a running Node process is still holding Prisma's Rust engine DLL.",
      "In this repo the usual lock holder is `backend npm run dev` / `ts-node src/main.ts`.",
      "Stop the backend process first, then rerun `npm run db:generate`."
    ].join("\n") + "\n"
  );
}

if (result.status === 0) {
  const cleanupFailures = cleanupLegacyRustEngineArtifacts();
  if (cleanupFailures.length > 0) {
    const lockedFiles = cleanupFailures
      .filter((entry) => entry.code === "EPERM")
      .map((entry) => entry.fileName);

    if (lockedFiles.length > 0) {
      process.stderr.write(
        [
          "",
          "Prisma Client has been generated in `engineType = \"client\"` mode,",
          "but an old Rust engine artifact is still locked by an already-running Node process:",
          ...lockedFiles.map((fileName) => `- ${fileName}`),
          "This is usually a backend process started before the no-Rust migration.",
          "Stop the existing backend dev server once, then rerun `npm run db:generate`.",
          "After that, future typecheck/build flows will no longer depend on the Windows DLL."
        ].join("\n") + "\n"
      );
    }
  }
}

process.exit(result.status ?? 1);
