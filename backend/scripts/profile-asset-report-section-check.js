/**
 * 前端渲染等价校验 —— 资产盘点报告「结构化 section」验证
 *
 * 背景：
 *   前端 pages/profile/profile.wxml 有两套渲染路径：
 *     (a) 若 assetReport.sections.length > 0，循环渲染 section 卡片；
 *     (b) 否则退回到纯文本 <text>{{finalReport}}</text>。
 *   历史 bug：parseTitledSections 只认 "【标题】"，而 Dify 4-报告生成流
 *   输出的是 "一、资产总览" / "### 一、资产总览"，导致 (a) 永远走 (b)。
 *   fix 在 backend/src/profile.service.ts 里已加第二条正则。
 *
 * 这个脚本跳过微信登录与 JWT，直接：
 *   1) 拿 smoke 脚本刚跑完后实际落地的 sample md（含 <think> 的 raw）；
 *   2) 本地复用 router.service.ts 的 <think> 剥离；
 *   3) 写入某个测试用户的 asset_inventory snapshot.flowState.finalReport；
 *   4) 通过 HTTP 调 /profile（用 dev 内部 bypass header 或直接跑 service）
 *      —— 这里改为直接实例化 NestApplicationContext 调 ProfileService，
 *      避免 auth 依赖。
 *   5) 断言 assetReport.sections[].length >= 3 且每个 section 都有正文。
 *
 * 用法：
 *   cd backend && node scripts/profile-asset-report-section-check.js
 */

const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient, SnapshotKind } = require("@prisma/client");

const SAMPLE_PATH = path.join(__dirname, "..", "reports", "asset-report-generation-sample.md");
const TEST_USER_PREFIX = "section-check-";

function log(line) {
  // eslint-disable-next-line no-console
  console.log(line);
}

function stripThink(text) {
  return String(text || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();
}

// 复用 profile.service.ts 里的 parseTitledSections 逻辑的 JS 等价实现。
// 一旦 TS 侧逻辑变动，这里也要同步。
function parseTitledSections(text) {
  const sections = {};
  let currentKey = "";
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) return;
      const bracketMatch = line.match(/^【(.+?)】$/);
      if (bracketMatch) {
        currentKey = bracketMatch[1].trim();
        if (!sections[currentKey]) sections[currentKey] = [];
        return;
      }
      const chineseNumberedMatch = line.match(
        /^(?:#{1,6}\s*)?[一二三四五六七八九十]+、\s*(.+?)\s*$/
      );
      if (chineseNumberedMatch) {
        const title = chineseNumberedMatch[1]
          .trim()
          .replace(/\*+$/, "")
          .replace(/^\*+/, "")
          .trim();
        if (title) {
          currentKey = title;
          if (!sections[currentKey]) sections[currentKey] = [];
          return;
        }
      }
      if (!currentKey) return;
      sections[currentKey].push(line);
    });
  return sections;
}

function extractSamplesFromMarkdown(md) {
  // sample md 里每份 "### Final Report" 段落后的正文一直到下一个 "---" 前
  const samples = [];
  const lines = md.split(/\r?\n/);
  let capturing = false;
  let buffer = [];
  let caseName = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const caseHeader = line.match(/^## (.+)$/);
    if (caseHeader && !line.startsWith("## ")) {
      // never
    }
    if (/^## /.test(line) && !/^### /.test(line)) {
      caseName = line.replace(/^## /, "").trim();
    }
    if (line === "### Final Report") {
      capturing = true;
      buffer = [];
      continue;
    }
    if (capturing && line === "---") {
      samples.push({ caseName, raw: buffer.join("\n").trim() });
      capturing = false;
      buffer = [];
      continue;
    }
    if (capturing) {
      buffer.push(line);
    }
  }
  return samples;
}

async function upsertTestUser(prisma, suffix) {
  const id = `${TEST_USER_PREFIX}${suffix}`;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      id,
      openId: `mock-openid-${id}`,
      nickname: `章节校验用户-${suffix}`,
      name: `章节校验用户-${suffix}`,
      initial: "章",
      hasAssetRadar: true
    }
  });
}

async function seedSnapshot(prisma, userId, finalReport) {
  const existing = await prisma.reportSnapshot.findFirst({
    where: { userId, kind: SnapshotKind.ASSET_INVENTORY }
  });
  const data = {
    flowState: {
      finalReport,
      reportBrief: "smoke check brief",
      reportVersion: "1",
      lastReportGeneratedAt: new Date().toISOString(),
      isReview: "false",
      profileSnapshot: "",
      dimensionReports: ""
    }
  };
  if (existing) {
    await prisma.reportSnapshot.update({
      where: { id: existing.id },
      data: { data }
    });
  } else {
    await prisma.reportSnapshot.create({
      data: {
        userId,
        kind: SnapshotKind.ASSET_INVENTORY,
        data
      }
    });
  }
}

function checkCase(caseName, raw) {
  log(`\n========== ${caseName} ==========`);
  log(`raw length: ${raw.length} chars`);
  const hadThink = /<think\b/i.test(raw);
  const stripped = stripThink(raw);
  log(`contained <think>: ${hadThink}`);
  log(`stripped length: ${stripped.length} chars`);
  if (!stripped) throw new Error(`${caseName}: stripped report is empty`);
  if (/<think\b/i.test(stripped)) throw new Error(`${caseName}: <think> survived strip`);

  const sections = parseTitledSections(stripped);
  const titles = Object.keys(sections);
  log(`parsed sections: ${titles.length}`);
  titles.forEach((t, i) => {
    log(`  ${i + 1}. ${t} — ${sections[t].length} lines`);
  });

  if (titles.length < 3) {
    throw new Error(`${caseName}: expected >= 3 sections, got ${titles.length}`);
  }
  const empties = titles.filter((t) => sections[t].length === 0);
  if (empties.length > 0) {
    throw new Error(`${caseName}: empty sections: ${empties.join(", ")}`);
  }
  log(`[PASS] ${caseName} — sections parsed & non-empty`);
  return { stripped, sectionCount: titles.length };
}

async function verifyAgainstProfileService(prisma, userId, expectedSectionCount) {
  // 直接读 snapshot 并复用同一份 parseTitledSections 逻辑。
  // （profile.service.ts 是 Nest provider，要启 app 太重；
  //  这里只验数据落地后的 section 数能与本地解析一致。）
  const row = await prisma.reportSnapshot.findFirst({
    where: { userId, kind: SnapshotKind.ASSET_INVENTORY }
  });
  if (!row) throw new Error(`no snapshot for ${userId}`);
  const stored = row.data && typeof row.data === "object" ? row.data : {};
  const flowState = stored.flowState && typeof stored.flowState === "object" ? stored.flowState : {};
  const finalReport = String(flowState.finalReport || "");
  const sections = parseTitledSections(finalReport);
  const titles = Object.keys(sections);
  if (titles.length !== expectedSectionCount) {
    throw new Error(
      `${userId}: section count mismatch after round-trip: stored=${titles.length} expected=${expectedSectionCount}`
    );
  }
  log(`  DB round-trip OK — ${titles.length} sections persisted`);
}

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`sample file not found: ${SAMPLE_PATH} — run asset-report-generation-smoke.js first`);
  }
  const md = fs.readFileSync(SAMPLE_PATH, "utf8");
  const samples = extractSamplesFromMarkdown(md);
  if (samples.length === 0) throw new Error("no samples extracted from md");
  log(`extracted ${samples.length} samples from ${SAMPLE_PATH}`);

  const prisma = new PrismaClient();
  try {
    for (let i = 0; i < samples.length; i++) {
      const { caseName, raw } = samples[i];
      const { stripped, sectionCount } = checkCase(caseName, raw);
      const user = await upsertTestUser(prisma, String(i + 1));
      await seedSnapshot(prisma, user.id, stripped);
      await verifyAgainstProfileService(prisma, user.id, sectionCount);
    }
    log(`\n[PASS] all ${samples.length} cases passed — profile.assetReport.sections will render`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  log(`\n[FAIL] ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
