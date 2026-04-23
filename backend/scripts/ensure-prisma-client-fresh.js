const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const generatedClientPath = path.join(repoRoot, "node_modules", ".prisma", "client", "index.d.ts");
const generatedSchemaPath = path.join(repoRoot, "node_modules", ".prisma", "client", "schema.prisma");

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function printAndExit(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!fileExists(schemaPath)) {
  printAndExit(`Prisma schema not found: ${schemaPath}`);
}

if (!fileExists(generatedClientPath) || !fileExists(generatedSchemaPath)) {
  printAndExit(
    [
      "Prisma Client has not been generated yet.",
      "Run `npm run db:generate` in `backend/` before running typecheck/build."
    ].join("\n")
  );
}

const schemaMtime = getMtimeMs(schemaPath);
const generatedSchemaMtime = getMtimeMs(generatedSchemaPath);
const generatedClientMtime = getMtimeMs(generatedClientPath);
const generatedBaseline = Math.max(generatedSchemaMtime, generatedClientMtime);

if (schemaMtime > generatedBaseline + 1000) {
  printAndExit(
    [
      "Prisma Client is older than your current schema.",
      "Do not rely on `npm run typecheck` to regenerate Prisma on Windows while the app is running.",
      "Stop the backend dev server first, then run `npm run db:generate` in `backend/`, and rerun the command."
    ].join("\n")
  );
}

process.stdout.write("Prisma Client is up to date.\n");
